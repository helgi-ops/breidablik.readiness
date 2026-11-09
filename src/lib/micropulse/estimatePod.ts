/**
 * "Forgot pod?" estimate builder (pure, testable).
 *
 * Given a player's real match rows (personal baseline) + this match's pod-wearers
 * (squad fallback) + the minutes he played, build a player_external_load_daily
 * row that reflects HIS profile, pro-rated by minutes:
 *   • cumulative columns (distance, counts, load, IMA totals…) → baseline × minutes/90
 *   • peak/rate columns (max velocity, max accel/decel, load-per-minute…) → baseline
 *     as-is (peaks don't scale linearly).
 * Per column: coalesce(personal average, squad average) so thin-history players
 * still get a value.
 *
 * The row is clearly marked as an estimate (raw_payload_json.estimated=true) and
 * uses source='catapult' so a later real Catapult sync (upsert on
 * player_id,date,source) OVERWRITES it. Estimated rows must be excluded from
 * baseline/PR/season-best computations elsewhere.
 */

import { boundsOfRow } from "@/lib/integrations/catapult/freeRunningBands";

/** A fetched load row — mixed columns (numeric metrics + string ids + jsonb). */
export type LoadRowLike = Record<string, unknown>;

/** Numeric cumulative columns — scaled by minutes/90, rounded to 1 dp.
 *  Every column is imputed from ITS OWN baseline (no cross-column proxying): GPS sprint/HSR
 *  (sprint_distance, high_speed_distance, velocity_band5/6_*) come only from GPS history, and the
 *  IMA Free Running columns come only from IMA FR history. IMA FR bands are bout-DURATION bands
 *  (seconds of one continuous run, NOT sprinting — docs/ima-free-running-bands.md), so they are never
 *  used to estimate sprint, and vice versa.
 *
 *  IMA FR band edges are configurable and changed on 9 Nov 2026 (legacy 0-8-12-15-18-21-24-27-100 →
 *  0-2.5-5-8-12-18-24-30-1000), so a band NUMBER is not a fixed run length. Two kinds of FR column:
 *   • run-length tiers (ima_fr_ge18_*, ima_fr_ge24_*, ima_fr_band58_total_distance = metres in runs ≥18 s)
 *     mean the same thing in every row → imputed here like any other column, from all history;
 *   • raw per-band columns (FR_BAND_NUM / FR_BAND_INT) → imputed ONLY from rows classified with one set of
 *     edges (see `frReferenceBounds`), and the row is stamped with those edges (ima_fr_band_bounds) so the DB
 *     trigger recomputes the tiers consistently. `ima_fr_band_bounds` is never averaged as a number. */
export const CUM_NUM: string[] = [
  "total_distance", "high_speed_distance", "sprint_distance",
  "velocity_band5_total_distance", "velocity_band6_total_distance",
  "total_player_load", "player_load",
  "high_metabolic_load_distance_m", "metabolic_energy_kj",
  "explosive_distance", "hir_dist",
  "ima_fr_band58_total_distance",
  "ima_fr_ge18_total_duration", "ima_fr_ge18_total_distance", "ima_fr_ge18_total_player_load",
  "ima_fr_ge24_total_duration", "ima_fr_ge24_total_distance", "ima_fr_ge24_total_player_load",
];

/** Integer cumulative columns — scaled by minutes/90, rounded to whole numbers. */
export const CUM_INT: string[] = [
  "accelerations", "decelerations", "tot_as", "tot_ds",
  "accel_b2_3_tot_effs_gen2", "decel_b2_3_tot_effs_gen2", "decel_b3_plus_tot_effs_gen2",
  "velocity_band4_total_efforts_gen2", "velocity_band5_total_efforts_gen2", "velocity_band6_total_efforts_gen2",
  "accel_decel_efforts",
  "ima_accel", "ima_decel", "ima_cod", "ima_total", "cod_events", "impacts", "jumps",
  "ima_cod_left_high", "ima_cod_left_medium", "ima_cod_left_low",
  "ima_cod_right_high", "ima_cod_right_medium", "ima_cod_right_low",
  "ima_band1_decel_count", "ima_band2_decel_count", "ima_band3_decel_count",
  "ima_band1_accel_count", "ima_band2_accel_count", "ima_band3_accel_count",
  "ima_fr_ge18_event_count", "ima_fr_ge18_stride_count",
  "ima_fr_ge24_event_count", "ima_fr_ge24_stride_count",
];

const FR_BANDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** Raw per-band IMA FR numeric columns (scaled, 1 dp) — imputed only from same-edge rows. */
export const FR_BAND_NUM: string[] = FR_BANDS.flatMap((b) =>
  ["total_duration", "total_distance", "total_player_load"].map((f) => `ima_fr_band${b}_${f}`));
/** Raw per-band IMA FR count columns (scaled, whole numbers) — imputed only from same-edge rows. */
export const FR_BAND_INT: string[] = FR_BANDS.flatMap((b) =>
  ["event_count", "stride_count"].map((f) => `ima_fr_band${b}_${f}`));

/** Peak / rate columns — the player's AVERAGE peak, used as-is (never scaled). */
export const PEAK: string[] = [
  "max_velocity", "max_vel", "max_acceleration", "max_deceleration",
  "player_load_per_minute", "metabolic_power_peak",
];

/** Every column the estimator reads/writes (for the SELECT in the route). */
export const ESTIMATE_COLS: string[] = [...CUM_NUM, ...CUM_INT, ...FR_BAND_NUM, ...FR_BAND_INT, ...PEAK, "ima_fr_band_bounds"];

const hasFrBands = (r: LoadRowLike): boolean =>
  [...FR_BAND_NUM, ...FR_BAND_INT].some((c) => typeof r[c] === "number" && Number.isFinite(r[c] as number));
const boundsKey = (b: readonly number[]): string => b.join(",");

/**
 * The band edges the estimated row's per-band columns are taken from. Squad rows are on the match date itself,
 * so their edges are the ones in force that day — preferred. Otherwise the player's most recent row with band
 * data. Null when no row carries per-band data.
 */
export function frReferenceBounds(personalRows: LoadRowLike[], squadRows: LoadRowLike[]): readonly number[] | null {
  const squad = squadRows.find(hasFrBands);
  if (squad) return boundsOfRow(squad);
  const personal = personalRows.filter(hasFrBands)
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))[0];
  return personal ? boundsOfRow(personal) : null;
}

function avg(rows: LoadRowLike[], col: string): number | null {
  const vs = rows.map((r) => r[col]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
}
function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export type EstimateInput = {
  personalRows: LoadRowLike[];
  squadRows: LoadRowLike[];
  minutes: number;
  teamId: string;
  playerId: string;
  matchDate: string;
  coachUserId: string;
};

export type EstimateResult = {
  row: Record<string, unknown>;
  baselineUsed: "personal" | "squad" | "mixed" | "none";
  nPersonal: number;
  nSquad: number;
};

export function buildEstimateRow(inp: EstimateInput): EstimateResult {
  const { personalRows, squadRows, minutes } = inp;
  const factor = minutes / 90;

  // coalesce(personal avg, squad avg) per column, tracking which source fed it.
  const base = (col: string): { v: number | null; src: "personal" | "squad" | null } => {
    const p = avg(personalRows, col);
    if (p != null) return { v: p, src: "personal" };
    const s = avg(squadRows, col);
    if (s != null) return { v: s, src: "squad" };
    return { v: null, src: null };
  };

  const row: Record<string, unknown> = {};
  let usedPersonal = false;
  let usedSquad = false;
  const mark = (src: "personal" | "squad" | null) => { if (src === "personal") usedPersonal = true; else if (src === "squad") usedSquad = true; };

  for (const col of CUM_NUM) { const { v, src } = base(col); if (v != null) { row[col] = round(v * factor, 1); mark(src); } }
  for (const col of CUM_INT) { const { v, src } = base(col); if (v != null) { row[col] = Math.round(v * factor); mark(src); } }
  for (const col of PEAK)    { const { v, src } = base(col); if (v != null) { row[col] = round(v, 2); mark(src); } }

  // Per-band IMA FR columns: only from rows classified with the reference edges, never mixing configs.
  const ref = frReferenceBounds(personalRows, squadRows);
  if (ref) {
    const same = (rows: LoadRowLike[]) => rows.filter((r) => hasFrBands(r) && boundsKey(boundsOfRow(r)) === boundsKey(ref));
    const pSame = same(personalRows), sSame = same(squadRows);
    const baseBand = (col: string): { v: number | null; src: "personal" | "squad" | null } => {
      const p = avg(pSame, col);
      if (p != null) return { v: p, src: "personal" };
      const q = avg(sSame, col);
      return q != null ? { v: q, src: "squad" } : { v: null, src: null };
    };
    let wroteBand = false;
    for (const col of FR_BAND_NUM) { const { v, src } = baseBand(col); if (v != null) { row[col] = round(v * factor, 1); mark(src); wroteBand = true; } }
    for (const col of FR_BAND_INT) { const { v, src } = baseBand(col); if (v != null) { row[col] = Math.round(v * factor); mark(src); wroteBand = true; } }
    // Stamp the edges the bands were classified with (the DB trigger keeps writer-supplied bounds and
    // recomputes ima_fr_ge18_* / ge24_* from these bands).
    if (wroteBand) row.ima_fr_band_bounds = [...ref];
  }

  const baselineUsed: EstimateResult["baselineUsed"] =
    usedPersonal && usedSquad ? "mixed" : usedPersonal ? "personal" : usedSquad ? "squad" : "none";

  // Metadata — source='catapult' so a real sync replaces it; clearly estimated.
  row.player_id = inp.playerId;
  row.team_id = inp.teamId;
  row.source_team_id = inp.teamId;
  row.date = inp.matchDate;
  row.source = "catapult";
  row.external_athlete_id = null;
  row.activity_count = 1;
  row.session_duration_minutes = minutes;
  row.raw_payload_json = {
    estimated: true,
    method: "personal_match_avg_pro_rated_by_minutes",
    fallback: "squad_avg",
    baseline: baselineUsed,
    minutes,
    entered_by: inp.coachUserId,
  };

  return { row, baselineUsed, nPersonal: personalRows.length, nSquad: squadRows.length };
}
