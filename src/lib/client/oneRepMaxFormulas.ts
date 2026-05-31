/**
 * Estimated 1-Rep-Max (e1RM) from a logged set — RIR-aware.
 *
 * A rep-max formula assumes the set was taken to FAILURE. A set logged with
 * reps-in-reserve (e.g. 5 reps @ RPE 8 = 2 in the tank) would otherwise have its
 * 1RM under-estimated. We therefore convert the logged RPE into RIR
 * (RIR = 10 − RPE) and estimate from reps-to-failure = reps + RIR.
 *
 * Three formulas are supported (Epley is the system default for trend
 * continuity; Brzycki tends to be more accurate ≤10 reps, Lombardi for very
 * high-rep sets):
 *   Epley    : 1RM = w · (1 + r/30)
 *   Brzycki  : 1RM = w · 36 / (37 − r)
 *   Lombardi : 1RM = w · r^0.10
 * where r = reps to failure.
 */

export type OneRmFormula = "epley" | "brzycki" | "lombardi";

export const ONE_RM_FORMULA_LABELS: Record<OneRmFormula, string> = {
  epley: "Epley",
  brzycki: "Brzycki",
  lombardi: "Lombardi",
};

/**
 * Reps in reserve implied by a logged RPE (RIR = 10 − RPE).
 * Returns 0 when no usable RPE is present (set treated as taken to failure).
 */
export function rirFromRpe(rpe: number | null | undefined): number {
  const v = Number(rpe);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const rir = 10 - v;
  if (rir <= 0) return 0;      // RPE ≥ 10 → at failure
  return Math.min(rir, 10);    // guard absurd values
}

export type OneRmOptions = {
  formula?: OneRmFormula;
  /** Explicit reps in reserve. Takes precedence over `rpe`. */
  rir?: number | null;
  /** Logged session RPE (1–10); converted to RIR when `rir` is not given. */
  rpe?: number | null;
};

/** Rep-max formulas lose accuracy the further a set is from failure. We never
 *  extrapolate more than this many reps in reserve. */
export const RIR_CAP = 4;

/** A set must be at least this hard (RPE) to be trusted as 1RM *evidence*
 *  (i.e. allowed to set a PR or push the working 1RM). RIR ≤ 3. */
export const MAX_EFFORT_MIN_RPE = 7;

/** True if a set is close enough to failure to estimate a max from.
 *  Unknown RPE is treated as a genuine effort (backward compatible). */
export function countsAsMaxEffort(rpe: number | null | undefined): boolean {
  const v = Number(rpe);
  if (!Number.isFinite(v) || v <= 0) return true; // no RPE logged → assume real
  return v >= MAX_EFFORT_MIN_RPE;
}

/**
 * Estimate 1RM from a single set's weight × reps, adjusting for reps in reserve.
 * Returns 0 for a non-positive load. A true single (effective reps ≤ 1) returns
 * the weight itself.
 */
export function estimateOneRm(
  weight: number,
  reps: number,
  opts: OneRmOptions = {},
): number {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return 0;

  const baseReps = Math.max(0, Number(reps) || 0);
  const rawRir = opts.rir != null ? Math.max(0, opts.rir) : rirFromRpe(opts.rpe);
  const rir = Math.min(RIR_CAP, rawRir); // never extrapolate too far from failure
  const r = baseReps + rir; // reps to failure

  if (r <= 1) return w; // already (effectively) a 1RM

  switch (opts.formula ?? "epley") {
    case "brzycki": {
      // 37 − r must stay positive; for very high effective reps fall back to
      // Epley so the estimate degrades gracefully instead of blowing up.
      const denom = 37 - r;
      return denom > 0 ? (w * 36) / denom : w * (1 + r / 30);
    }
    case "lombardi":
      return w * Math.pow(r, 0.1);
    case "epley":
    default:
      return w * (1 + r / 30);
  }
}

/** Convenience: RIR-aware e1RM straight from a logged set row (for trend
 *  displays — always returns an estimate). */
export function e1rmFromSet(
  weight: number | null | undefined,
  reps: number | null | undefined,
  rpe: number | null | undefined,
  formula: OneRmFormula = "epley",
): number {
  return estimateOneRm(Number(weight), Number(reps), { rpe, formula });
}

/**
 * 1RM *evidence* from a logged set — for PRs and auto-progression.
 *
 * A set too far from failure (RPE < 7 / RIR > 3) can't reliably predict a max,
 * so it must not be allowed to set a record or push the working 1RM. For those
 * sets we return the weight actually lifted (no extrapolation): a genuinely
 * heavy easy single still counts, but an easy high-rep set can't invent a PR.
 */
export function e1rmEvidence(
  weight: number | null | undefined,
  reps: number | null | undefined,
  rpe: number | null | undefined,
  formula: OneRmFormula = "epley",
): number {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return 0;
  if (!countsAsMaxEffort(rpe)) return w; // too easy to estimate a max from
  return estimateOneRm(w, Number(reps), { rpe, formula });
}
