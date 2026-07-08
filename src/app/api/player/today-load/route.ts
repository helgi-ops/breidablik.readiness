/**
 * GET /api/player/today-load
 *
 * Player-facing, self-scoped view of TODAY's planned training load — so a player
 * can anticipate how hard the session will be. The OUTLOOK (effort band,
 * duration, focus, % of a match, plain reason) comes from the same microcycle
 * engine the coach Pre-session report uses (resolveMdContext + planSessionLoad),
 * so they can never disagree. The PERSONAL number is anchored to the SAME session
 * type — the player's own average player-load on past days of this MD-day (e.g.
 * "your usual MD-4") — computed from their own rows, plus their own load-trend
 * flag (ACWR) and a note when their check-in is yellow/red. Self-hides on
 * off-days / no MD context / any error (never breaks Today).
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { resolveMdContext, sameMdDayDates } from "@/lib/micropulse/loadPlan/forTeam";
import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";
import { computePlayerLoadAcwr } from "@/lib/micropulse/playerLoadAcwr";

export const runtime = "nodejs";

function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: pl } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
    const teamId = (pl as { team_id?: string | null } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ show: false });

    const today = new Date().toISOString().slice(0, 10);

    // Outlook (shared microcycle engine).
    const md = await resolveMdContext(sb, teamId, today);
    const planned = planSessionLoad({ mdDay: md.mdDay, dayType: md.dayType, focus: md.focus });
    const matchDay = planned.reason === "match";
    // Hide on off-days / no MD context; show on training days + (special) match days.
    if (!planned.applicable && !matchDay) return NextResponse.json({ show: false });

    // The player's OWN load history (180 days) — for the same-MD-day average + ACWR.
    const since = addDaysISO(today, -180);
    const { data: rows } = await sb
      .from("player_external_load_daily")
      .select("date, total_player_load")
      .eq("player_id", playerId)
      .in("source", ["catapult", "manual"])
      .gte("date", since)
      .lte("date", today);
    const loadByDate = new Map<string, number>();
    for (const r of (rows ?? []) as Array<{ date: string; total_player_load: number | null }>) {
      const v = typeof r.total_player_load === "number" ? r.total_player_load : Number(r.total_player_load);
      if (Number.isFinite(v) && v > 0) loadByDate.set(r.date, Math.max(loadByDate.get(r.date) ?? 0, v));
    }

    // Personal target = the player's own average on past days of THIS MD-day.
    let personalTarget: number | null = null;
    let personalN = 0;
    if (planned.applicable && planned.mdLabel) {
      const dates = await sameMdDayDates(sb, teamId, planned.mdLabel, today);
      const vals = dates.map((d) => loadByDate.get(d)).filter((v): v is number => typeof v === "number" && v > 0);
      if (vals.length) {
        personalTarget = Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);
        personalN = vals.length;
      }
    }

    // Player's own load trend (ACWR) → plain flag.
    const acwr = computePlayerLoadAcwr(
      Array.from(loadByDate.entries()).map(([date, load]) => ({ date, load })),
      today,
    );
    const flag: "ok" | "build" | "reduce" | null =
      acwr.band === "SAFE" ? "ok" : acwr.band === "UNDERTRAIN" ? "build" : (acwr.band === "WATCH" || acwr.band === "RISK") ? "reduce" : null;

    // Personalize by the player's OWN readiness (canonical v8 color).
    let eased: "yellow" | "red" | null = null;
    try {
      const { data: rd } = await sb
        .from("v_coach_readiness_today_v8").select("final_color")
        .eq("player_id", playerId).eq("entry_date", today).maybeSingle();
      const c = String((rd as { final_color?: string | null } | null)?.final_color ?? "").toLowerCase();
      eased = c === "red" ? "red" : c === "yellow" ? "yellow" : null;
    } catch { /* readiness optional */ }

    return NextResponse.json({
      show: true,
      matchDay,
      mdLabel: planned.mdLabel,
      band: planned.band,
      loadType: planned.loadType,
      durationMin: planned.durationMin,
      matchPct: planned.matchPct,
      rationaleEN: planned.rationaleEN,
      rationaleIS: planned.rationaleIS,
      personalTarget,
      personalN,
      flag,
      eased,
    });
  } catch {
    return NextResponse.json({ show: false });
  }
}
