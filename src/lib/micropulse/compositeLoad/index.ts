/**
 * Composite Load Concern
 *
 * Merges internal load (RPE-based ACWR) and external load
 * (GPS/Catapult neuromuscular burden score) into a single
 * concern level for the decision engine.
 *
 * Rationale:
 *   - Internal load (RPE × duration) measures perceived effort and
 *     accumulated training stress over time. ACWR > 1.3 signals
 *     meaningful spike risk.
 *   - External load (GPS) measures mechanical/neuromuscular demand:
 *     high-speed running, decelerations, sprint exposure. The
 *     neuromuscularBurdenScore (0–1) from signals.ts captures this.
 *   - Neither signal alone is sufficient. High GPS burden with low RPE
 *     (e.g. technical session with lots of sprinting) and vice versa
 *     both carry risk. Combining them produces a more complete picture.
 *
 * Weights: 55% internal (RPE ACWR) · 45% external (GPS burden).
 * If only one signal is available, apply a 0.80 confidence discount
 * on the available signal rather than defaulting to "none".
 *
 * Output → concern level used by buildAthleteDecision → loadAction:
 *   "none"     → loadAction stays "normal"
 *   "low"      → loadAction → "monitor"
 *   "moderate" → loadAction → "reduce"
 *   "high"     → loadAction → "cap"
 */

export type LoadConcernLevel = "none" | "low" | "moderate" | "high";

export type RpeAcwrInput = {
  /** 7-day acute load (sum of session_load in last 7 days) */
  acute7: number;
  /** 28-day chronic load (sum / 4) */
  chronic28: number;
  /** acute / chronic ratio; null if chronic28 === 0 */
  acwr: number | null;
  /** number of real (non-imputed) RPE sessions in last 28 days */
  sessionCount: number;
};

/**
 * Map RPE ACWR to a 0–1 internal load score.
 *
 * ACWR zones (Gabbett 2016, Hulin et al. 2014):
 *   < 0.80  → undertrain / deload  → 0.10 (mild concern, monotony risk)
 *   0.80–1.30 → optimal            → 0.00
 *   1.30–1.50 → caution             → 0.50
 *   > 1.50  → high risk             → 1.00
 *
 * null → not computable (no chronic baseline) → null (signal excluded)
 */
function rpeAcwrToScore(acwr: number | null): number | null {
  if (acwr == null) return null;
  if (acwr < 0.8) return 0.10;
  if (acwr <= 1.3) return 0.00;
  if (acwr <= 1.5) return 0.50;
  return 1.00;
}

/**
 * Convert a continuous composite score (0–1) to a concern level.
 *
 * Thresholds are intentionally conservative — we prefer "monitor"
 * over false "none" when signal quality is limited.
 */
function scoreToConcernLevel(score: number): LoadConcernLevel {
  if (score < 0.15) return "none";
  if (score < 0.40) return "low";
  if (score < 0.68) return "moderate";
  return "high";
}

export type CompositeLoadInput = {
  /**
   * RPE-based acute:chronic workload ratio (from session_rpe_entries).
   * Null if fewer than 5 RPE sessions exist in the last 28 days.
   */
  rpeAcwr: RpeAcwrInput | null;
  /**
   * GPS-derived neuromuscular burden score (0–1) from signals.ts.
   * Null if GPS data quality is "insufficient".
   */
  neuromuscularBurdenScore: number | null;
  /**
   * Categorical GPS load state — used as a sanity check / tie-breaker.
   */
  externalLoadState: "normal" | "elevated" | "high" | "unknown";
};

export type CompositeLoadResult = {
  concernLevel: LoadConcernLevel;
  /** 0–1 composite score before thresholding */
  compositeScore: number;
  /** Which signals contributed */
  sources: Array<"rpe_acwr" | "gps_burden">;
  /** Human-readable summary for logging */
  summary: string;
};

export function computeCompositeLoadConcern(input: CompositeLoadInput): CompositeLoadResult {
  const internalScore = rpeAcwrToScore(input.rpeAcwr?.acwr ?? null);
  const externalScore =
    input.neuromuscularBurdenScore != null &&
    input.externalLoadState !== "unknown" &&
    Number.isFinite(input.neuromuscularBurdenScore)
      ? input.neuromuscularBurdenScore
      : null;

  const sources: CompositeLoadResult["sources"] = [];
  if (internalScore != null) sources.push("rpe_acwr");
  if (externalScore != null) sources.push("gps_burden");

  // Neither signal available
  if (sources.length === 0) {
    return { concernLevel: "none", compositeScore: 0, sources, summary: "No load data available." };
  }

  let compositeScore: number;
  if (internalScore != null && externalScore != null) {
    // Both signals: 55% internal, 45% external
    compositeScore = internalScore * 0.55 + externalScore * 0.45;
  } else if (internalScore != null) {
    // Only RPE: apply 80% confidence discount
    compositeScore = internalScore * 0.80;
  } else {
    // Only GPS: apply 80% confidence discount
    compositeScore = (externalScore as number) * 0.80;
  }

  // Tie-breaker: if GPS says "high" but composite is "low", bump to "moderate"
  if (
    input.externalLoadState === "high" &&
    compositeScore < 0.40
  ) {
    compositeScore = Math.max(compositeScore, 0.40);
  }

  const concernLevel = scoreToConcernLevel(compositeScore);

  const acwrStr = input.rpeAcwr?.acwr != null ? input.rpeAcwr.acwr.toFixed(2) : "n/a";
  const gpsStr = externalScore != null ? externalScore.toFixed(2) : "n/a";
  const summary =
    `composite=${compositeScore.toFixed(2)} (rpe_acwr=${acwrStr}, gps_burden=${gpsStr}) → ${concernLevel}`;

  return { concernLevel, compositeScore, sources, summary };
}

/**
 * Compute RPE ACWR from raw session load rows.
 * Accepts an array of { session_date, session_load, is_imputed }
 * rows for a single player, sorted oldest-first.
 *
 * Returns null if fewer than MIN_SESSIONS real sessions exist
 * (to avoid noisy ACWR from sparse data).
 */
const MIN_SESSIONS_FOR_ACWR = 5;

export function computeRpeAcwrFromRows(
  rows: Array<{ session_date: string; session_load: number | null; is_imputed?: boolean | null }>,
  referenceDate: string
): RpeAcwrInput | null {
  const refMs = new Date(`${referenceDate}T00:00:00Z`).getTime();

  function daysBefore(days: number): string {
    const d = new Date(refMs);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }

  const cutoff7  = daysBefore(6);   // last 7 days inclusive
  const cutoff28 = daysBefore(27);  // last 28 days inclusive

  const inWindow = rows.filter(
    (r) => r.session_date >= cutoff28 && r.session_date <= referenceDate
  );

  const realCount = inWindow.filter((r) => !r.is_imputed).length;
  if (realCount < MIN_SESSIONS_FOR_ACWR) return null;

  const acute7 = inWindow
    .filter((r) => r.session_date >= cutoff7)
    .reduce((s, r) => s + (Number(r.session_load ?? 0)), 0);

  const total28 = inWindow
    .reduce((s, r) => s + (Number(r.session_load ?? 0)), 0);

  const chronic28 = total28 / 4;
  const acwr = chronic28 > 0 ? Math.round((acute7 / chronic28) * 100) / 100 : null;

  return { acute7, chronic28, acwr, sessionCount: realCount };
}
