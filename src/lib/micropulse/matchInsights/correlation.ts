/**
 * Pearson correlation for Match Insights (item: stat ↔ GPS/IMA).
 *
 * Pure, IO-free. A small two-variable correlation the app didn't have (the
 * existing `linRegress` only regresses vs time). Used to surface ASSOCIATIONS
 * between a movement metric and a result/stat metric — never causation or
 * prediction, and never anything that touches the readiness colour.
 *
 * Honesty: below MIN_CORRELATION_N paired points there is no result (null), and
 * a degenerate (zero-variance) series yields null — never a fabricated r.
 */

/** Minimum paired observations before a correlation is reported. */
export const MIN_CORRELATION_N = 5;

export type CorrelationStrength = "negligible" | "weak" | "moderate" | "strong";

export type CorrelationResult = {
  r: number;
  n: number;
  strength: CorrelationStrength;
  direction: "positive" | "negative";
};

function strengthOf(absR: number): CorrelationStrength {
  if (absR < 0.2) return "negligible";
  if (absR < 0.4) return "weak";
  if (absR < 0.6) return "moderate";
  return "strong";
}

/** Correlate two aligned series. Pairs where either value is null/non-finite are
 *  dropped. Returns null when fewer than MIN_CORRELATION_N valid pairs remain or
 *  either series has zero variance. */
export function pearson(xs: Array<number | null | undefined>, ys: Array<number | null | undefined>): CorrelationResult | null {
  const pairs: Array<[number, number]> = [];
  const len = Math.min(xs.length, ys.length);
  for (let i = 0; i < len; i++) {
    const x = xs[i], y = ys[i];
    if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) pairs.push([x, y]);
  }
  const n = pairs.length;
  if (n < MIN_CORRELATION_N) return null;

  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx, dy = y - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return null; // zero variance → undefined correlation
  const r = sxy / Math.sqrt(sxx * syy);
  const rounded = Math.round(r * 100) / 100;
  return { r: rounded, n, strength: strengthOf(Math.abs(rounded)), direction: rounded >= 0 ? "positive" : "negative" };
}
