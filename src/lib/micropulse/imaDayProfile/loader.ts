import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateTeamProfile,
  asymmetryPct,
  type ImaPlayerDay,
  type ImaSessionProfile,
} from "./index";

type DailyRow = {
  player_id: string;
  date: string;
  source: string | null;
  ima_fr_band1_stride_count: number | null;
  ima_fr_band2_stride_count: number | null;
  ima_fr_band3_stride_count: number | null;
  ima_fr_band4_stride_count: number | null;
  ima_fr_band5_stride_count: number | null;
  ima_fr_band6_stride_count: number | null;
  ima_fr_band7_stride_count: number | null;
  ima_fr_band8_stride_count: number | null;
  ima_cod_left_low: number | null;
  ima_cod_right_low: number | null;
  ima_cod_left_medium: number | null;
  ima_cod_right_medium: number | null;
  ima_cod_left_high: number | null;
  ima_cod_right_high: number | null;
};

/** Load the IMA day profile for a team on a specific date. Pulls all
 *  Catapult rows for the day + 14 days of history for personal baselines. */
export async function loadImaDayProfile(
  sb: SupabaseClient,
  args: { teamId: string; dateIso: string; lang?: "IS" | "EN" },
): Promise<ImaSessionProfile> {
  const lang = args.lang ?? "EN";

  // 1) Roster
  const { data: players } = await sb
    .from("players")
    .select("id, full_name")
    .eq("team_id", args.teamId)
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
  if (roster.length === 0) {
    return aggregateTeamProfile([], args.teamId, args.dateIso, lang);
  }
  const playerIds = roster.map(r => r.id);

  // 2) 14-day window of catapult rows (today + baseline)
  const baselineStart = (() => {
    const d = new Date(`${args.dateIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 13);
    return d.toISOString().slice(0, 10);
  })();

  const { data: rows } = await sb
    .from("player_external_load_daily")
    .select(
      "player_id, date, source, ima_fr_band1_stride_count, ima_fr_band2_stride_count, ima_fr_band3_stride_count, ima_fr_band4_stride_count, ima_fr_band5_stride_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, ima_cod_left_low, ima_cod_right_low, ima_cod_left_medium, ima_cod_right_medium, ima_cod_left_high, ima_cod_right_high"
    )
    .in("player_id", playerIds)
    .eq("source", "catapult")
    .gte("date", baselineStart)
    .lte("date", args.dateIso);
  const allRows = (rows ?? []) as DailyRow[];

  // 3) Match days from week_plans (so we can exclude matches from baseline)
  const matchDays = new Set<string>();
  try {
    const { data: wp } = await sb
      .from("week_plans")
      .select("day_date, day_type")
      .eq("team_id", args.teamId)
      .gte("day_date", baselineStart)
      .lte("day_date", args.dateIso);
    for (const r of (wp ?? []) as Array<{ day_date: string; day_type: string | null }>) {
      const dt = String(r.day_type ?? "").toUpperCase();
      if (dt === "GAME" || dt === "MATCH") matchDays.add(r.day_date);
    }
  } catch { /* optional */ }

  // 4) Group rows by player
  const byPlayer = new Map<string, DailyRow[]>();
  for (const id of playerIds) byPlayer.set(id, []);
  for (const r of allRows) {
    byPlayer.get(r.player_id)?.push(r);
  }

  // 5) Build per-player ImaPlayerDay records
  const perPlayer: ImaPlayerDay[] = roster.map(pl => {
    const playerRows = byPlayer.get(pl.id) ?? [];
    const today = playerRows.find(r => r.date === args.dateIso);

    const sum = (r: DailyRow | undefined, ...cols: (keyof DailyRow)[]) => {
      if (!r) return 0;
      return cols.reduce((acc, c) => acc + (Number(r[c]) || 0), 0);
    };

    const low = sum(today, "ima_fr_band1_stride_count", "ima_fr_band2_stride_count", "ima_fr_band3_stride_count");
    const mid = sum(today, "ima_fr_band4_stride_count", "ima_fr_band5_stride_count", "ima_fr_band6_stride_count");
    const high = sum(today, "ima_fr_band7_stride_count", "ima_fr_band8_stride_count");
    const sprint = sum(today, "ima_fr_band5_stride_count", "ima_fr_band6_stride_count", "ima_fr_band7_stride_count", "ima_fr_band8_stride_count");
    const total = low + mid + high;

    const codLeftLow = today ? Number(today.ima_cod_left_low) || 0 : 0;
    const codRightLow = today ? Number(today.ima_cod_right_low) || 0 : 0;
    const codLeftMedium = today ? Number(today.ima_cod_left_medium) || 0 : 0;
    const codRightMedium = today ? Number(today.ima_cod_right_medium) || 0 : 0;
    const codLeftHigh = today ? Number(today.ima_cod_left_high) || 0 : 0;
    const codRightHigh = today ? Number(today.ima_cod_right_high) || 0 : 0;
    const codTotalLow = codLeftLow + codRightLow;
    const codTotalMedium = codLeftMedium + codRightMedium;
    const codTotalHigh = codLeftHigh + codRightHigh;
    const codTotal = codTotalLow + codTotalMedium + codTotalHigh;
    const cod_asymmetry_low_pct = codTotalLow >= 10 ? asymmetryPct(codLeftLow, codRightLow) : null;
    const cod_asymmetry_medium_pct = codTotalMedium >= 10 ? asymmetryPct(codLeftMedium, codRightMedium) : null;
    const cod_asymmetry_pct = codTotalHigh >= 10 ? asymmetryPct(codLeftHigh, codRightHigh) : null;

    // Personal sprint-strides baseline: avg of training-only days in the
    // last 14 days where bands 5-8 sum was > 0. Match days excluded so the
    // comparison answers "is today's training high/low for this player".
    const baselineRows = playerRows
      .filter(r =>
        r.date !== args.dateIso &&
        !matchDays.has(r.date) &&
        (Number(r.ima_fr_band5_stride_count) || 0)
          + (Number(r.ima_fr_band6_stride_count) || 0)
          + (Number(r.ima_fr_band7_stride_count) || 0)
          + (Number(r.ima_fr_band8_stride_count) || 0) > 0,
      );
    const baselineValues = baselineRows.map(r =>
      (Number(r.ima_fr_band5_stride_count) || 0)
      + (Number(r.ima_fr_band6_stride_count) || 0)
      + (Number(r.ima_fr_band7_stride_count) || 0)
      + (Number(r.ima_fr_band8_stride_count) || 0)
    );
    const sprint_baseline_avg = baselineValues.length >= 2
      ? baselineValues.reduce((s, v) => s + v, 0) / baselineValues.length
      : null;
    const sprint_vs_baseline_pct = sprint_baseline_avg != null && sprint_baseline_avg > 0
      ? (sprint / sprint_baseline_avg) * 100
      : null;

    return {
      player_id: pl.id,
      full_name: pl.full_name ?? "—",
      source: today?.source ?? null,
      total_strides: total,
      low_strides: low,
      mid_strides: mid,
      high_strides: high,
      sprint_strides: sprint,
      sprint_baseline_avg,
      sprint_vs_baseline_pct,
      cod_left_low: codLeftLow,
      cod_right_low: codRightLow,
      cod_left_medium: codLeftMedium,
      cod_right_medium: codRightMedium,
      cod_left_high: codLeftHigh,
      cod_right_high: codRightHigh,
      cod_total: codTotal,
      cod_total_high: codTotalHigh,
      cod_asymmetry_low_pct,
      cod_asymmetry_medium_pct,
      cod_asymmetry_pct,
    };
  });

  return aggregateTeamProfile(perPlayer, args.teamId, args.dateIso, lang);
}
