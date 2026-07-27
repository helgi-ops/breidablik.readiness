/**
 * Small pure math for the Readiness Outlook feature build.
 *
 * EWMA is the one load helper NOT already in the codebase (everything else uses the
 * rolling-average / Gabbett method — see compositeLoad / playerLoadAcwr). Perri 2021 and
 * Williams 2017 use the exponentially-weighted variant for load→wellness, so we add a
 * tiny, self-contained one here rather than bending the existing ACWR machinery, which
 * serves a different purpose (acute:chronic ratio flags, not a forecast feature).
 */

/**
 * Exponentially-weighted moving average at the last point of a daily series (oldest →
 * newest). `span` is the N-day span; the decay λ = 2/(N+1) (Williams 2017). Rest days
 * are 0 in the input series and legitimately pull the average down. Returns null for an
 * empty series (no-data, never a fabricated 0).
 */
export function ewma(daily: number[], span: number): number | null {
  if (!daily.length) return null;
  const alpha = 2 / (span + 1);
  let e = daily[0];
  for (let i = 1; i < daily.length; i++) e = alpha * daily[i] + (1 - alpha) * e;
  return e;
}

/** Mean of a numeric array, or null when empty. */
export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

/** Population standard deviation, or null when fewer than 2 points. */
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length;
  return Math.sqrt(v);
}

/**
 * Per-player z-score against the player's own baseline. Returns 0 when the baseline SD
 * is missing or zero (no spurious spikes from a flat/thin baseline) — the confidence
 * gate, not the feature, is where thin data is surfaced.
 */
export function zscore(value: number, baselineMean: number | null, baselineSd: number | null): number {
  if (baselineMean == null || baselineSd == null || baselineSd <= 0) return 0;
  return (value - baselineMean) / baselineSd;
}
