/**
 * Per-athlete metric baselines (Robertson 2017 / Rebelo 2026).
 *
 * Reads from athlete_metric_baselines, which is refreshed nightly by
 * pg_cron. This module is the canonical source of "what is normal for
 * THIS athlete" — used by the decoupling computation, the readiness
 * scoring engine (replacing global thresholds), and the trend-chart
 * ribbon rendering on the coach dashboard.
 */

export type BaselineStatus =
  | "insufficient_data"  // < 7 obs — do not flag
  | "calibrating"        // 7-13 obs — use wider bands defensively
  | "active";            // ≥ 14 obs — full sensitivity

export type AthleteMetricBaseline = {
  player_id: string;
  metric_key: string;
  n_observations: number;
  mean: number;
  sd: number;
  cv: number | null;
  median: number | null;
  window_days: number;
  status: BaselineStatus;
  computed_at: string;
};

/** Direction of "worse" for each metric. Used to interpret SD-bands. */
export type MetricDirection = "lower_is_worse" | "higher_is_worse";

export const METRIC_DIRECTION: Record<string, MetricDirection> = {
  // Wellness — higher is better on the 1-5 readiness scale used today
  "wellness.sleep":      "lower_is_worse",
  "wellness.soreness":   "lower_is_worse",  // 1-5 where 5 = no soreness
  "wellness.readiness":  "lower_is_worse",
  "wellness.total":      "lower_is_worse",

  // Internal load — higher RPE = harder, but interpretation depends on
  // context (we don't directly flag high RPE; we flag decoupling)
  "internal.rpe":             "higher_is_worse",
  "internal.session_load_au": "higher_is_worse",

  // External load — interpreted in context (high vs personal baseline)
  "load.total_distance":      "higher_is_worse",
  "load.high_speed_distance": "higher_is_worse",
  "load.hir_distance":        "higher_is_worse",
  "load.accelerations":       "higher_is_worse",
  "load.decelerations":       "higher_is_worse",
  "load.cod_events":          "higher_is_worse",
  "load.player_load":         "higher_is_worse",
  "load.player_load_per_min": "higher_is_worse",
  "load.metabolic_load_score":"higher_is_worse",
  "load.metabolic_power_avg": "higher_is_worse",
  "load.metabolic_power_peak":"higher_is_worse",
  "load.hml_distance":        "higher_is_worse",
  "load.avg_heart_rate":      "higher_is_worse",
  "load.max_heart_rate":      "higher_is_worse",
};

export type SdBandFlag = "green" | "yellow" | "red";

/**
 * Compare today's value against an athlete's personal baseline.
 * Returns the SD-distance and a green/yellow/red flag.
 *
 * Per Robertson 2017, ±1 SD = yellow band, ±2 SD = red band.
 * If status is 'insufficient_data' we never flag (returns 'green' with z=null).
 * If status is 'calibrating' we use wider bands (±1.5 / ±2.5 SD).
 */
export function flagAgainstBaseline(
  todayValue: number,
  baseline: AthleteMetricBaseline | null,
  metric_key: string,
): { z: number | null; flag: SdBandFlag; reason: string } {
  if (!baseline || baseline.status === "insufficient_data") {
    return { z: null, flag: "green", reason: "no_baseline" };
  }
  if (baseline.sd === 0) {
    return { z: 0, flag: "green", reason: "zero_variance" };
  }

  const z = (todayValue - baseline.mean) / baseline.sd;
  const direction = METRIC_DIRECTION[metric_key] ?? "higher_is_worse";

  // Concerning direction: lower_is_worse → negative z is bad; higher_is_worse → positive z is bad
  const concerningZ = direction === "lower_is_worse" ? -z : z;

  // Calibrating period uses wider thresholds (Robertson advises caution while
  // baselines stabilise). After 14+ observations, use the standard ±1 / ±2 SD.
  const yellowThreshold = baseline.status === "calibrating" ? 1.5 : 1.0;
  const redThreshold    = baseline.status === "calibrating" ? 2.5 : 2.0;

  let flag: SdBandFlag = "green";
  if (concerningZ >= redThreshold)         flag = "red";
  else if (concerningZ >= yellowThreshold) flag = "yellow";

  return {
    z: Math.round(z * 100) / 100,
    flag,
    reason: flag === "green" ? "within_band" : `${concerningZ >= redThreshold ? "exceeds_2sd" : "exceeds_1sd"}_${direction}`,
  };
}

/**
 * Compute the upper/lower bounds of the SD-band for a metric.
 * Used to render the shaded ribbon on trend charts.
 */
export function bandBounds(
  baseline: AthleteMetricBaseline | null,
  sdMultiplier = 1,
): { lower: number; upper: number } | null {
  if (!baseline || baseline.sd === 0) return null;
  return {
    lower: baseline.mean - sdMultiplier * baseline.sd,
    upper: baseline.mean + sdMultiplier * baseline.sd,
  };
}
