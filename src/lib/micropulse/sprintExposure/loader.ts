import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSprintExposure,
  type DailySprintExposure,
  type SprintExposurePayload,
} from "./index";

/**
 * Pull last 28 days of IMA band 5-8 stride counts and join against match
 * minutes to flag match days. Returns the sprint-exposure payload.
 *
 * Match days are determined by match_player_minutes.minutes_played >= 60
 * on the same date — that's the threshold sport-science consensus uses
 * for "true match exposure" (Carling 2018, Nédélec 2012).
 */
export async function loadSprintExposure(
  sb: SupabaseClient,
  args: { playerId: string; todayIso: string },
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

  // Match days where this player played ≥ 60 min
  const matchDays = new Set<string>();
  try {
    const { data: mm } = await sb
      .from("match_player_minutes")
      .select("match_date, minutes_played")
      .eq("player_id", args.playerId)
      .gte("match_date", startIso)
      .lte("match_date", args.todayIso)
      .gte("minutes_played", 60);
    for (const r of (mm ?? []) as Array<{ match_date: string }>) {
      if (r.match_date) matchDays.add(r.match_date);
    }
  } catch {
    /* table optional on some tiers — proceed without match-day data */
  }

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
