import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSprintExposure,
  type DailySprintExposure,
  type SprintExposurePayload,
} from "./index";

/**
 * Pull last 28 days of IMA band 5-8 stride counts and join against the
 * team's match schedule (week_plans + match_player_minutes) to flag match
 * days. Returns the sprint-exposure payload.
 *
 * Match-day detection (UNION of three sources, in priority order):
 *   1. week_plans.day_type = "GAME" for the player's team on that date —
 *      authoritative team-level signal. This catches every scheduled
 *      match regardless of whether per-player minutes were logged.
 *   2. match_player_minutes >= 30 min — player-specific signal for clubs
 *      that log minutes (lowered from the original 60-min threshold
 *      because partial appearances still represent real sprint exposure
 *      and we'd rather over-count match days than under-count them; the
 *      original 60-min rule from Carling 2018 / Nédélec 2012 referred to
 *      RECOVERY DECISIONS, not exposure baselining).
 *   3. Fallback: high stride-count days adjacent to a known GAME date are
 *      ignored — we trust week_plans + minutes over heuristics.
 *
 * Without this UNION the old code missed many real matches and reported
 * a single-match baseline with low confidence, which made the exposure
 * ratio drift toward "Spike" for every player.
 */
export async function loadSprintExposure(
  sb: SupabaseClient,
  args: { playerId: string; todayIso: string; teamId?: string },
): Promise<SprintExposurePayload> {
  const startIso = (() => {
    const d = new Date(`${args.todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 27);
    return d.toISOString().slice(0, 10);
  })();

  // Bands 5-8 daily stride counts
  const { data: extRows, error: extErr } = await sb
    .from("player_external_load_daily")
    .select("date, ima_fr_band5_stride_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count")
    .eq("player_id", args.playerId)
    .eq("source", "catapult")
    .gte("date", startIso)
    .lte("date", args.todayIso)
    .order("date", { ascending: true });
  if (extErr) {
    return {
      acuteSum7d: null,
      matchDayDemand: null,
      exposureRatio: null,
      band: "INSUFFICIENT_DATA",
      matchDaysObserved: 0,
      daysObserved7d: 0,
    };
  }

  // Resolve team_id if not provided — week_plans is keyed on team, not player.
  let teamId = args.teamId ?? null;
  if (!teamId) {
    try {
      const { data: pl } = await sb
        .from("players")
        .select("team_id")
        .eq("id", args.playerId)
        .maybeSingle();
      teamId = (pl as { team_id: string | null } | null)?.team_id ?? null;
    } catch { /* fall through with null */ }
  }

  // Source 1: team week_plans (authoritative match schedule)
  const matchDays = new Set<string>();
  if (teamId) {
    try {
      const { data: wp } = await sb
        .from("week_plans")
        .select("plan_date, day_type")
        .eq("team_id", teamId)
        .gte("plan_date", startIso)
        .lte("plan_date", args.todayIso);
      for (const r of (wp ?? []) as Array<{ plan_date: string; day_type: string | null }>) {
        const dt = String(r.day_type ?? "").toUpperCase();
        if (dt === "GAME" || dt === "MATCH") matchDays.add(r.plan_date);
      }
    } catch { /* week_plans optional on some setups */ }
  }

  // Source 2: per-player minutes (lowered to 30 min — see header note)
  try {
    const { data: mm } = await sb
      .from("match_player_minutes")
      .select("match_date, minutes_played")
      .eq("player_id", args.playerId)
      .gte("match_date", startIso)
      .lte("match_date", args.todayIso)
      .gte("minutes_played", 30);
    for (const r of (mm ?? []) as Array<{ match_date: string }>) {
      if (r.match_date) matchDays.add(r.match_date);
    }
  } catch { /* table optional on some tiers — proceed without match-day data */ }

  const rows: DailySprintExposure[] = ((extRows ?? []) as Array<{
    date: string;
    ima_fr_band5_stride_count: number | null;
    ima_fr_band6_stride_count: number | null;
    ima_fr_band7_stride_count: number | null;
    ima_fr_band8_stride_count: number | null;
  }>).map((r) => {
    const b5 = Number(r.ima_fr_band5_stride_count ?? 0) || 0;
    const b6 = Number(r.ima_fr_band6_stride_count ?? 0) || 0;
    const b7 = Number(r.ima_fr_band7_stride_count ?? 0) || 0;
    const b8 = Number(r.ima_fr_band8_stride_count ?? 0) || 0;
    const sum = b5 + b6 + b7 + b8;
    return {
      date: r.date,
      hiBandStrides: sum > 0 ? sum : null,
      isMatchDay: matchDays.has(r.date),
    };
  });

  return computeSprintExposure(rows, args.todayIso);
}
