/**
 * Foster Monotony & Strain (Foster 1998).
 *
 * Foster, C. (1998). Monitoring training in athletes with reference to
 * overtraining syndrome. Med Sci Sports Exerc, 30(7), 1164–1168.
 *
 * Computes per-player overtraining-risk metrics from a rolling 7-day
 * window of daily session loads (sRPE × duration_minutes, in AU).
 *
 * Definitions:
 *   weekly_load  = sum(daily_load over last 7 days)
 *   mean_load    = weekly_load / 7
 *   sd_load      = stddev of daily_load across 7 days
 *   MONOTONY     = mean_load / sd_load
 *   STRAIN       = weekly_load × MONOTONY
 *
 * Thresholds (Foster 1998 + AC Milan / Real Madrid 2010s refinements):
 *   Monotony  ≤ 1.5   safe
 *             1.5–2.0 watch
 *             > 2.0   high overtraining risk
 *   Strain    ≤ 4000  safe
 *             4000–6000 watch
 *             > 6000  illness/injury "danger zone"
 *   (Watch band 4000 calibrated 2026-06 against ~4.5k real player-weeks:
 *    flags the top ~8.5% — a genuine early-warning spread below the 6000
 *    danger ceiling. Aligned with loadIntelligence.ts + the Methodology page.)
 *
 * Single shared helper used by both FosterMonotonyStrainCard and the
 * Decision Summary load-signals block.
 */

export type FosterDailyLoad = { date: string; load: number };

export type FosterMetrics = {
  weeklyLoad: number;
  meanLoad: number;
  sdLoad: number;
  monotony: number | null; // null when SD too small (divide-by-zero pathology) or <2 days of data
  strain: number | null;   // null when monotony is null
  daysWithData: number;
};

export type FosterStatus = "safe" | "watch" | "danger" | "insufficient";

function populationStdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const variance = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/**
 * Compute Foster metrics over a rolling 7-day window. Caller is responsible
 * for ensuring `loads` is a dense 7-element window (zero-pad missing days
 * upstream so SD reflects true variability).
 *
 * Guards against the canonical Foster divide-by-zero pathology when every
 * day has the same load or fewer than 2 days have non-zero data.
 */
export function computeFosterMetrics(loads: FosterDailyLoad[]): FosterMetrics {
  const xs = loads.map((d) => d.load);
  const weeklyLoad = xs.reduce((s, v) => s + v, 0);
  const meanLoad = xs.length > 0 ? weeklyLoad / xs.length : 0;
  const sdLoad = populationStdev(xs);
  const daysWithData = xs.filter((v) => v > 0).length;
  if (sdLoad < 0.5 || daysWithData < 2) {
    return { weeklyLoad, meanLoad, sdLoad, monotony: null, strain: null, daysWithData };
  }
  const monotony = meanLoad / sdLoad;
  const strain = weeklyLoad * monotony;
  return { weeklyLoad, meanLoad, sdLoad, monotony, strain, daysWithData };
}

/** Combined verdict — worst of monotony + strain. */
export function fosterStatus(monotony: number | null, strain: number | null): FosterStatus {
  if (monotony == null || strain == null) return "insufficient";
  const monotonyHigh = monotony > 2.0;
  const monotonyWatch = monotony > 1.5;
  const strainDanger = strain > 6000;
  const strainWatch = strain > 4000;
  if (monotonyHigh || strainDanger) return "danger";
  if (monotonyWatch || strainWatch) return "watch";
  return "safe";
}
