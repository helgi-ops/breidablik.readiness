/**
 * /api/client/load-quadrant
 *
 * Fitness × Fatigue quadrant for a PT client, computed from ALL of their
 * session_rpe_entries (gym + sport + anything) over the last 28 days.
 *
 *   - chronicDaily : mean daily load over 28 days   → "fitness" (how prepared)
 *   - acuteDaily   : mean daily load over 7 days     → "fatigue" (recent strain)
 *   - acwr         : acuteDaily / chronicDaily        → spike indicator
 *   - olderChronic : mean daily load days 14–28 ago  → fitness-trend reference
 *
 * Zones (Banister fitness–fatigue, Gabbett ACWR sweet-spot):
 *   fitness rising + fatigue ok    → "primed"
 *   fitness rising + fatigue high  → "overreaching"
 *   fitness falling + fatigue ok   → "detrained"
 *   fitness falling + fatigue high → "danger" (spike on a low base)
 *
 * Everything is derived from the canonical session-load table so it matches the
 * Foster / ACWR numbers shown elsewhere. Confidence scales with how many days
 * of data exist (a brand-new client gets a low-confidence "building baseline").
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function admin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

async function requirePlayer(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return { error: "Unauthorized", status: 401 } as const;
  const { data: p } = await sb.from("players").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return { error: "Not a player account", status: 403 } as const;
  return { sb, playerId: (p as { id: string }).id } as const;
}

function dayIso(offsetDaysAgo: number): string {
  const d = new Date(); d.setDate(d.getDate() - offsetDaysAgo);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, playerId } = a;

  const since28 = dayIso(27);
  const { data, error } = await sb
    .from("session_rpe_entries")
    .select("session_date, rpe, duration_minutes, session_load")
    .eq("player_id", playerId)
    .gte("session_date", since28);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sum loads per day (multiple sessions a day add up — same rule as Foster).
  const byDate = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ session_date: string; rpe: number | null; duration_minutes: number | null; session_load: number | null }>) {
    const load = r.session_load != null
      ? Number(r.session_load)
      : (r.rpe != null && r.duration_minutes != null ? Number(r.rpe) * Number(r.duration_minutes) : 0);
    byDate.set(r.session_date, (byDate.get(r.session_date) ?? 0) + (Number.isFinite(load) ? load : 0));
  }

  const loadOn = (offset: number) => byDate.get(dayIso(offset)) ?? 0;
  const sumRange = (from: number, toExclusive: number) => {
    let s = 0; for (let i = from; i < toExclusive; i++) s += loadOn(i); return s;
  };

  const acuteDaily = sumRange(0, 7) / 7;
  const chronicDaily = sumRange(0, 28) / 28;
  const recentChronic = sumRange(0, 14) / 14;
  const olderChronic = sumRange(14, 28) / 14;
  const acwr = chronicDaily > 0 ? Math.round((acuteDaily / chronicDaily) * 100) / 100 : null;

  const daysWithData = byDate.size;
  // Confidence: needs ~3+ weeks of fairly regular logging to be trustworthy.
  let confidence: "low" | "medium" | "high" = "low";
  if (daysWithData >= 12) confidence = "high";
  else if (daysWithData >= 6) confidence = "medium";

  const fitnessHigh = chronicDaily >= olderChronic && chronicDaily > 0;
  const fatigueHigh = acwr != null && acwr > 1.3;

  let zone: "primed" | "overreaching" | "detrained" | "danger" | "baseline" = "baseline";
  if (daysWithData >= 6 && chronicDaily > 0) {
    if (fitnessHigh && !fatigueHigh) zone = "primed";
    else if (fitnessHigh && fatigueHigh) zone = "overreaching";
    else if (!fitnessHigh && !fatigueHigh) zone = "detrained";
    else zone = "danger";
  }

  return NextResponse.json({
    ok: true,
    quadrant: {
      acute_daily: Math.round(acuteDaily),
      chronic_daily: Math.round(chronicDaily),
      older_chronic: Math.round(olderChronic),
      recent_chronic: Math.round(recentChronic),
      acwr,
      fitness_high: fitnessHigh,
      fatigue_high: fatigueHigh,
      zone,
      confidence,
      days_with_data: daysWithData,
    },
  });
}
