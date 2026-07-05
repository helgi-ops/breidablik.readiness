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

/** A fetched load row — mixed columns (numeric metrics + string ids + jsonb). */
export type LoadRowLike = Record<string, unknown>;

/** Numeric cumulative columns — scaled by minutes/90, rounded to 1 dp. */
export const CUM_NUM: string[] = [
  "total_distance", "high_speed_distance", "sprint_distance",
  "velocity_band5_total_distance", "velocity_band6_total_distance",
  "total_player_load", "player_load",
  "high_metabolic_load_distance_m", "metabolic_energy_kj",
  "explosive_distance", "hir_dist",
  "ima_fr_band58_total_distance", "ima_fr_band5_total_distance", "ima_fr_band6_total_distance",
  "ima_fr_band7_total_distance", "ima_fr_band8_total_distance",
  "ima_fr_band6_total_player_load", "ima_fr_band7_total_player_load", "ima_fr_band8_total_player_load",
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
  "ima_fr_band1_stride_count", "ima_fr_band2_stride_count", "ima_fr_band3_stride_count",
  "ima_fr_band4_stride_count", "ima_fr_band5_stride_count",
  "ima_fr_band6_stride_count", "ima_fr_band7_stride_count", "ima_fr_band8_stride_count",
];

/** Peak / rate columns — the player's AVERAGE peak, used as-is (never scaled). */
export const PEAK: string[] = [
  "max_velocity", "max_vel", "max_acceleration", "max_deceleration",
  "player_load_per_minute", "metabolic_power_peak",
];

/** Every column the estimator reads/writes (for the SELECT in the route). */
export const ESTIMATE_COLS: string[] = [...CUM_NUM, ...CUM_INT, ...PEAK];

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
