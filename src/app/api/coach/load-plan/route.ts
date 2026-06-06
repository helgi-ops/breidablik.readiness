/**
 * /api/coach/load-plan?date=YYYY-MM-DD
 *
 * GET — forward-looking load PLAN for the authenticated coach's team: the
 * recommended session type (mechanical / locomotive / mixed) and per-KPI
 * targets (total distance, HSR, sprint, accel/decel, Player Load, IMA),
 * anchored to the squad's own match demand and the microcycle (MD) day, with
 * acute:chronic context and a readiness modifier. Powers the pre-session card
 * and the AI summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildLoadPlan, type LoadRow } from "@/lib/micropulse/loadPlan";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const dateParam = url.searchParams.get("date");
  const sessionDate = dateParam && isIso(dateParam) ? dateParam : today;

  // Players on the team.
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const playerIds = (players ?? []).map((p) => String((p as { id: string }).id));
  const nameById = new Map<string, string>();
  for (const p of (players ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(String(p.id), (p.full_name ?? "—").trim());
  if (playerIds.length === 0) return NextResponse.json({ error: "No players" }, { status: 400 });

  // MD context from Week setup (v_training_day_context joined via week_setups.team_id).
  let mdDay: string | null = null;
  let daysSincePrev: number | null = null;
  let daysToNext: number | null = null;
  try {
    const { data: wsIds } = await sb.from("week_setups").select("id").eq("team_id", teamId);
    const ids = (wsIds ?? []).map((w) => (w as { id: string }).id);
    if (ids.length > 0) {
      const { data: ctx } = await sb
        .from("v_training_day_context")
        .select("md_day, days_since_prev, days_to_next, week_setup_id")
        .in("week_setup_id", ids)
        .eq("date", sessionDate)
        .limit(1)
        .maybeSingle();
      if (ctx) {
        mdDay = (ctx as { md_day: string | null }).md_day ?? null;
        daysSincePrev = (ctx as { days_since_prev: number | null }).days_since_prev ?? null;
        daysToNext = (ctx as { days_to_next: number | null }).days_to_next ?? null;
      }
    }
  } catch { /* no MD context — plan falls back gracefully */ }
  // Allow explicit overrides from the caller (the dashboard already resolves MD).
  mdDay = url.searchParams.get("mdDay") ?? mdDay;
  const dayType = url.searchParams.get("dayType");
  const focus = url.searchParams.get("focus");

  // GPS over the lookback window (120 days for a robust match reference).
  const from = addDaysISO(sessionDate, -120);
  const { data: loadRows, error: loadErr } = await sb
    .from("player_external_load_daily")
    .select("player_id, date, total_distance, total_player_load, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_fr_band58_total_distance")
    .in("source", ["catapult", "manual"])
    .in("player_id", playerIds)
    .gte("date", from)
    .lte("date", sessionDate)
    .order("date");
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  // Squad readiness (best-effort) — today's colour distribution as a modifier.
  let readiness: { green: number; yellow: number; red: number } | null = null;
  try {
    const { data: rd } = await sb.from("v_coach_readiness_today_v8").select("final_color, team_id").eq("team_id", teamId);
    if (Array.isArray(rd) && rd.length > 0) {
      const r = { green: 0, yellow: 0, red: 0 };
      for (const row of rd as Array<{ final_color: string | null }>) {
        const c = String(row.final_color ?? "").toLowerCase();
        if (c === "green") r.green++; else if (c === "yellow") r.yellow++; else if (c === "red") r.red++;
      }
      if (r.green + r.yellow + r.red > 0) readiness = r;
    }
  } catch { /* readiness optional */ }

  const plan = buildLoadPlan({
    sessionDate,
    mdDay,
    dayType,
    focus,
    daysSincePrev,
    daysToNext,
    rows: ((loadRows ?? []) as unknown as LoadRow[]),
    nameById,
    readiness,
  });

  return NextResponse.json({ plan });
}
