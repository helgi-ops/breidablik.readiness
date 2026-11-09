import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateTeamProfile,
  asymmetryPct,
  type ImaPlayerDay,
  type ImaSessionProfile,
} from "./index";
import { frReadingOf, sumBandsBetween } from "@/lib/integrations/catapult/freeRunningBands";

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
  /** Band edges (s) this row was classified with — band numbers shift when the club changes them. */
  ima_fr_band_bounds: Array<number | string> | null;
  ima_fr_bounds_source?: string | null;
  /** Strides in efforts ≥18 s (config-independent tier filled by the DB trigger). */
  ima_fr_ge18_stride_count: number | null;
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
      "player_id, date, source, ima_fr_band1_stride_count, ima_fr_band2_stride_count, ima_fr_band3_stride_count, ima_fr_band4_stride_count, ima_fr_band5_stride_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, ima_fr_band_bounds, ima_fr_bounds_source, ima_fr_ge18_stride_count, ima_cod_left_low, ima_cod_right_low, ima_cod_left_medium, ima_cod_right_medium, ima_cod_left_high, ima_cod_right_high"
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

    // Tiers by RUN LENGTH, read from the row's own band edges (ima_fr_band_bounds) — never by band number,
    // because the edges change (legacy 0-8-12-15-18-21-24-27-100; Breiðablik from 10 Nov 2026
    // 0-2.5-5-8-12-18-24-30-1000). 12 s and 24 s are edges in every config:
    //   short bursts <12 s · medium runs 12–24 s · longest runs ≥24 s.
    const tier = (r: DailyRow | undefined, lo: number, hi?: number) =>
      r ? sumBandsBetween(r, "stride_count", lo, hi) ?? 0 : 0;
    const low = tier(today, 0, 12);
    const mid = tier(today, 12, 24);
    const high = tier(today, 24);
    // Strides in long continuous runs (efforts ≥18 s, config-independent ima_fr_ge18 tier) — bout-duration
    // bands, NOT sprint/speed bands. Variable/field name "sprint" is legacy.
    const longRunStrides = (r: DailyRow): number =>
      r.ima_fr_ge18_stride_count != null ? Number(r.ima_fr_ge18_stride_count) || 0 : tier(r, 18);
    const sprint = today ? longRunStrides(today) : 0;
    // A row whose edges have no 12/18/24 s edge (Catapult's 3-band default) can't be split by run length:
    // leave it out of the tier read (total 0 → excluded from the squad shares) rather than count its
    // strides with none in any tier. The Long runs card names these players.
    const reading = today ? frReadingOf(today) : "no_fr";
    const total = reading === "catapult_default" || reading === "unknown_edges" ? 0 : sum(today,
      "ima_fr_band1_stride_count", "ima_fr_band2_stride_count", "ima_fr_band3_stride_count", "ima_fr_band4_stride_count",
      "ima_fr_band5_stride_count", "ima_fr_band6_stride_count", "ima_fr_band7_stride_count", "ima_fr_band8_stride_count");

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

    // Personal long-run-strides baseline (runs ≥18 s): avg of training-only days in the
    // last 14 days where that count was > 0. Match days excluded so the
    // comparison answers "is today's training high/low for this player". The ≥18 s tier
    // is backfilled for all history, so the baseline is continuous across a band-edge change.
    const baselineRows = playerRows
      .filter(r =>
        r.date !== args.dateIso &&
        !matchDays.has(r.date) &&
        longRunStrides(r) > 0,
      );
    const baselineValues = baselineRows.map(longRunStrides);
    // Baseline minimum is 1 day during the Catapult Free Running transition
    // (May 2026): many pre-fix training days have IMA = 0 so requiring 2
    // qualifying days would hide baselines for most of the squad. As more
    // post-fix training days accumulate the average naturally stabilises.
    // 1-day baselines are flagged as low-confidence in the UI.
    const sprint_baseline_days = baselineValues.length;
    const sprint_baseline_avg = sprint_baseline_days >= 1
      ? baselineValues.reduce((s, v) => s + v, 0) / sprint_baseline_days
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
      sprint_baseline_days,
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
