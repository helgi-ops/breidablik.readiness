import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildStrideIntelligence,
  STRIDE_BASELINE_METRIC_KEYS,
  type StrideBaselineRef,
  type StrideIntelligencePayload,
  type StrideRow,
} from "./index";

type DailyRow = {
  ima_fr_band1_stride_count: number | null;
  ima_fr_band2_stride_count: number | null;
  ima_fr_band3_stride_count: number | null;
  ima_fr_band4_stride_count: number | null;
  ima_fr_band5_stride_count: number | null;
  ima_fr_band6_stride_count: number | null;
  ima_fr_band7_stride_count: number | null;
  ima_fr_band8_stride_count: number | null;
  ima_fr_band1_avg_stride_rate: number | null;
  ima_fr_band2_avg_stride_rate: number | null;
  ima_fr_band3_avg_stride_rate: number | null;
  ima_fr_band4_avg_stride_rate: number | null;
  ima_fr_band5_avg_stride_rate: number | null;
  ima_fr_band6_avg_stride_rate: number | null;
  ima_fr_band7_avg_stride_rate: number | null;
  ima_fr_band8_avg_stride_rate: number | null;
  ima_fr_band1_total_player_load: number | null;
  ima_fr_band2_total_player_load: number | null;
  ima_fr_band3_total_player_load: number | null;
  ima_fr_band4_total_player_load: number | null;
  ima_fr_band5_total_player_load: number | null;
  ima_fr_band6_total_player_load: number | null;
  ima_fr_band7_total_player_load: number | null;
  ima_fr_band8_total_player_load: number | null;
  velocity_band5_total_distance: number | null;
  velocity_band6_total_distance: number | null;
  total_distance: number | null;
  ima_cod_left_high: number | null;
  ima_cod_left_medium: number | null;
  ima_cod_left_low: number | null;
  ima_cod_right_high: number | null;
  ima_cod_right_medium: number | null;
  ima_cod_right_low: number | null;
};

type BaselineRow = {
  metric_key: string;
  mean: number | null;
  sd: number | null;
  status: string | null;
};

function rowToStrideRow(r: DailyRow): StrideRow {
  return {
    strideCounts: [
      r.ima_fr_band1_stride_count, r.ima_fr_band2_stride_count, r.ima_fr_band3_stride_count, r.ima_fr_band4_stride_count,
      r.ima_fr_band5_stride_count, r.ima_fr_band6_stride_count, r.ima_fr_band7_stride_count, r.ima_fr_band8_stride_count,
    ],
    strideRates: [
      r.ima_fr_band1_avg_stride_rate, r.ima_fr_band2_avg_stride_rate, r.ima_fr_band3_avg_stride_rate, r.ima_fr_band4_avg_stride_rate,
      r.ima_fr_band5_avg_stride_rate, r.ima_fr_band6_avg_stride_rate, r.ima_fr_band7_avg_stride_rate, r.ima_fr_band8_avg_stride_rate,
    ],
    stridePlayerLoads: [
      r.ima_fr_band1_total_player_load, r.ima_fr_band2_total_player_load, r.ima_fr_band3_total_player_load, r.ima_fr_band4_total_player_load,
      r.ima_fr_band5_total_player_load, r.ima_fr_band6_total_player_load, r.ima_fr_band7_total_player_load, r.ima_fr_band8_total_player_load,
    ],
    hsrDistance: (Number(r.velocity_band5_total_distance ?? 0) || 0) + (Number(r.velocity_band6_total_distance ?? 0) || 0),
    sprintDistance: r.velocity_band6_total_distance,
    totalDistance: r.total_distance,
    codLeft:
      (Number(r.ima_cod_left_high ?? 0) || 0) +
      (Number(r.ima_cod_left_medium ?? 0) || 0) +
      (Number(r.ima_cod_left_low ?? 0) || 0),
    codRight:
      (Number(r.ima_cod_right_high ?? 0) || 0) +
      (Number(r.ima_cod_right_medium ?? 0) || 0) +
      (Number(r.ima_cod_right_low ?? 0) || 0),
  };
}

function toBaselineRef(row: BaselineRow | undefined): StrideBaselineRef | null {
  if (!row) return null;
  const status = (row.status ?? "insufficient_data") as StrideBaselineRef["status"];
  return {
    metricKey: row.metric_key,
    mean: row.mean,
    sd: row.sd,
    status,
  };
}

/**
 * Load today's stride row from player_external_load_daily, fetch personal
 * baselines for the stride metric keys, and compute the StrideIntelligence
 * payload. Returns null when there's no Catapult row for the date — the
 * decision pipeline treats null as "no signal" rather than "all green".
 */
export async function loadStrideIntelligence(
  sb: SupabaseClient,
  args: { playerId: string; date: string },
): Promise<StrideIntelligencePayload | null> {
  // 1. Today's daily row — Catapult source.
  const { data: rows, error: rowErr } = await sb
    .from("player_external_load_daily")
    .select(
      [
        "ima_fr_band1_stride_count",
        "ima_fr_band2_stride_count",
        "ima_fr_band3_stride_count",
        "ima_fr_band4_stride_count",
        "ima_fr_band5_stride_count",
        "ima_fr_band6_stride_count",
        "ima_fr_band7_stride_count",
        "ima_fr_band8_stride_count",
        "ima_fr_band1_avg_stride_rate",
        "ima_fr_band2_avg_stride_rate",
        "ima_fr_band3_avg_stride_rate",
        "ima_fr_band4_avg_stride_rate",
        "ima_fr_band5_avg_stride_rate",
        "ima_fr_band6_avg_stride_rate",
        "ima_fr_band7_avg_stride_rate",
        "ima_fr_band8_avg_stride_rate",
        "ima_fr_band1_total_player_load",
        "ima_fr_band2_total_player_load",
        "ima_fr_band3_total_player_load",
        "ima_fr_band4_total_player_load",
        "ima_fr_band5_total_player_load",
        "ima_fr_band6_total_player_load",
        "ima_fr_band7_total_player_load",
        "ima_fr_band8_total_player_load",
        "velocity_band5_total_distance",
        "velocity_band6_total_distance",
        "total_distance",
        "ima_cod_left_high",
        "ima_cod_left_medium",
        "ima_cod_left_low",
        "ima_cod_right_high",
        "ima_cod_right_medium",
        "ima_cod_right_low",
      ].join(","),
    )
    .eq("player_id", args.playerId)
    .eq("date", args.date)
    .eq("source", "catapult")
    .maybeSingle();

  if (rowErr) return null;
  const row = rows as DailyRow | null;
  if (!row) return null;

  // Skip when we have absolutely no IMA Free Running strides — nothing to compute.
  const totalStrides =
    (row.ima_fr_band1_stride_count ?? 0) +
    (row.ima_fr_band2_stride_count ?? 0) +
    (row.ima_fr_band3_stride_count ?? 0) +
    (row.ima_fr_band4_stride_count ?? 0) +
    (row.ima_fr_band5_stride_count ?? 0) +
    (row.ima_fr_band6_stride_count ?? 0) +
    (row.ima_fr_band7_stride_count ?? 0) +
    (row.ima_fr_band8_stride_count ?? 0);
  const totalCod =
    (row.ima_cod_left_high ?? 0) + (row.ima_cod_left_medium ?? 0) + (row.ima_cod_left_low ?? 0) +
    (row.ima_cod_right_high ?? 0) + (row.ima_cod_right_medium ?? 0) + (row.ima_cod_right_low ?? 0);
  if (totalStrides === 0 && totalCod === 0) return null;

  // 2. Stride baselines — single query for all 4 metric keys.
  const baselineKeys = [
    STRIDE_BASELINE_METRIC_KEYS.cadence,
    STRIDE_BASELINE_METRIC_KEYS.strideLengthHsr,
    STRIDE_BASELINE_METRIC_KEYS.gpsImaDecoupling,
    STRIDE_BASELINE_METRIC_KEYS.codLrAsymmetry,
  ];
  const { data: bl, error: blErr } = await sb
    .from("athlete_metric_baselines")
    .select("metric_key, mean, sd, status")
    .eq("player_id", args.playerId)
    .in("metric_key", baselineKeys);

  if (blErr) return null;
  const blMap = new Map<string, BaselineRow>();
  for (const b of (bl ?? []) as BaselineRow[]) blMap.set(b.metric_key, b);

  const strideRow = rowToStrideRow(row);
  return buildStrideIntelligence(strideRow, {
    cadence: toBaselineRef(blMap.get(STRIDE_BASELINE_METRIC_KEYS.cadence)),
    strideLengthHsr: toBaselineRef(blMap.get(STRIDE_BASELINE_METRIC_KEYS.strideLengthHsr)),
    gpsImaDecoupling: toBaselineRef(blMap.get(STRIDE_BASELINE_METRIC_KEYS.gpsImaDecoupling)),
  });
}
