/**
 * Metabolic Load v1
 *
 * Complementary layer to the Mechanical Load Index (MLI).
 * Computes a 0–100 Metabolic Load Score from Catapult metabolic-power
 * fields, normalised to an athlete's own 28-day rolling baseline.
 *
 * Architecture:
 *   raw DB values → baseline computation → z-score normalisation
 *   → weighted composite → 0-100 score → band + flag + fatigue type
 *
 * This module contains ONLY pure functions. No I/O, no Supabase calls.
 * All DB interaction happens in the sync pipeline (sync.ts) and API routes.
 */

// ─── Config / constants ────────────────────────────────────────────────────

export const METABOLIC_CONFIG = {
  /** Rolling baseline window in days (exclusive of target date). */
  baselineWindowDays: 28,
  /** Minimum valid athlete samples before score can be computed. */
  minBaselineSamples: 6,
  /** HML threshold label (informational, not used in calc). */
  hmlThresholdWkg: 25.5,

  /** Score weights – must sum to 1.0. */
  weights: {
    hmlDistance: 0.40,
    timeAboveThreshold: 0.30,
    peakPower: 0.20,
    avgPower: 0.10,
  },

  /** Score transformation: score = clamp(center + multiplier * rawComposite, 0, 100) */
  scoreCenter: 50,
  scoreMultiplier: 15,

  /** Band thresholds (inclusive lower bound). */
  bands: {
    low: 0,
    moderate: 35,
    high: 55,
    very_high: 75,
  },
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────

export type MetabolicLoadBand = "low" | "moderate" | "high" | "very_high";
export type MetabolicFlag = "none" | "metabolic_fatigue" | "global_fatigue";
export type MetabolicLoadConfidence = "high" | "medium" | "low";

/**
 * One row of raw metabolic data (daily aggregate, from DB or in-memory).
 */
export type MetabolicLoadSourceRow = {
  date: string;
  /** Average metabolic power W/kg */
  metabolic_power: number | null;
  /** Peak metabolic power W/kg */
  metabolic_power_peak: number | null;
  /** High Metabolic Load Distance (metres) */
  high_metabolic_load_distance_m: number | null;
  /** Time above HML threshold (seconds) */
  time_above_hml_threshold_s: number | null;
  /** Whether this row has valid metabolic data (GNSS present, ≥1 field non-zero) */
  metabolic_data_valid: boolean;
};

export type MetabolicBaseline = {
  avgPowerMean: number | null;
  avgPowerStd: number | null;
  peakPowerMean: number | null;
  peakPowerStd: number | null;
  hmlDistanceMean: number | null;
  hmlDistanceStd: number | null;
  timeAboveThresholdMean: number | null;
  timeAboveThresholdStd: number | null;
  /** Number of valid baseline days used. */
  sampleCount: number;
};

export type MetabolicLoadInput = {
  metabolicPowerAvg: number | null;
  metabolicPowerPeak: number | null;
  hmlDistance: number | null;
  timeAboveThreshold: number | null;
  metabolicDataValid: boolean;
  baseline: MetabolicBaseline;
};

export type MetabolicLoadComputedRow = {
  metabolicPowerAvgZ: number | null;
  metabolicPowerPeakZ: number | null;
  hmlDistanceZ: number | null;
  timeAboveHmlThresholdZ: number | null;
  metabolicLoadScore: number | null;
  metabolicLoadBand: MetabolicLoadBand | null;
  metabolicFlag: MetabolicFlag;
  dataConfidenceMetabolic: number;
  confidence: MetabolicLoadConfidence;
};

// ─── Composite fatigue type ────────────────────────────────────────────────

export type CompositeFatigueType =
  | "normal"
  | "mechanical_fatigue"
  | "metabolic_fatigue"
  | "global_fatigue"
  | "recovery_mismatch"
  | "perceived_mismatch";

export type FatigueTypeInput = {
  mechanicalLoadScore: number | null;
  metabolicLoadScore: number | null;
  /** Internal stress/recovery markers poor despite low external load */
  recoveryMismatch?: boolean;
  /**
   * RPE z-score for this date (athlete's own 28-day rolling baseline).
   * When RPE is elevated but GPS load is not, signals perceived_mismatch.
   */
  rpeZScore?: number | null;
  /**
   * Session type for this date — adjusts perceived_mismatch threshold.
   * "match" raises the bar (high RPE is expected); "recovery" lowers it.
   */
  sessionType?: string | null;
};

/** Recommendation code for Decision Engine consumption. */
export type MetabolicRecommendationCode =
  | "REDUCE_CONDITIONING"
  | "REDUCE_TOTAL_LOAD"
  | "RECOVERY_EMPHASIS"
  | "MONITOR_RESPONSE"
  | "INVESTIGATE_PERCEIVED_LOAD"
  | "NO_METABOLIC_FLAG";

// ─── RPE source row ─────────────────────────────────────────────────────────

/**
 * One row of raw RPE data for a player (from session_rpe table).
 * Used to compute athlete-specific RPE baseline and z-score.
 */
export type RpeSourceRow = {
  date: string;
  /** Borg CR10 RPE value (1–10) */
  rpe: number;
  /**
   * Session type from the RPE submission.
   * Used to adjust perceived_mismatch threshold:
   *   match    → threshold 1.5  (high RPE expected on match days)
   *   recovery → threshold 0.5  (any elevation is a concern on recovery days)
   *   other    → threshold 1.0  (default)
   */
  session_type?: string | null;
};

// ─── Math helpers ──────────────────────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number | null, decimals: number): number | null {
  if (!isFiniteNumber(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Computes z-score. Returns null if std is 0 or null (avoids divide-by-zero).
 */
export function computeZScore(
  value: number | null,
  mean: number | null,
  std: number | null,
): number | null {
  if (!isFiniteNumber(value) || !isFiniteNumber(mean) || !isFiniteNumber(std)) return null;
  if (std <= 0) return null;
  return roundTo((value - mean) / std, 4);
}

// ─── Baseline computation ──────────────────────────────────────────────────

function dateMinusDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function meanOf(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdOf(values: number[], mean: number): number | null {
  if (values.length < 2) return null;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function extractPositiveValues(rows: MetabolicLoadSourceRow[], key: keyof MetabolicLoadSourceRow): number[] {
  return rows
    .map((row) => row[key])
    .filter((v): v is number => isFiniteNumber(v) && (v as number) >= 0);
}

/**
 * Compute athlete-specific rolling metabolic baseline for a given target date.
 * Uses the preceding `baselineWindowDays` days (not including target date).
 * Only rows where `metabolic_data_valid = true` are included.
 */
export function computeMetabolicBaseline(
  rows: MetabolicLoadSourceRow[],
  dateKey: string,
): MetabolicBaseline {
  const windowStart = dateMinusDays(dateKey, METABOLIC_CONFIG.baselineWindowDays);
  const relevant = rows.filter(
    (row) => row.date < dateKey && row.date >= windowStart && row.metabolic_data_valid,
  );

  function stats(values: number[]): { mean: number | null; std: number | null } {
    const mean = meanOf(values);
    if (mean == null) return { mean: null, std: null };
    return { mean, std: stdOf(values, mean) };
  }

  const avgPowerVals = extractPositiveValues(relevant, "metabolic_power");
  const peakPowerVals = extractPositiveValues(relevant, "metabolic_power_peak");
  const hmlVals = extractPositiveValues(relevant, "high_metabolic_load_distance_m");
  const timeVals = extractPositiveValues(relevant, "time_above_hml_threshold_s");

  const avgPower = stats(avgPowerVals);
  const peakPower = stats(peakPowerVals);
  const hml = stats(hmlVals);
  const time = stats(timeVals);

  return {
    avgPowerMean: avgPower.mean,
    avgPowerStd: avgPower.std,
    peakPowerMean: peakPower.mean,
    peakPowerStd: peakPower.std,
    hmlDistanceMean: hml.mean,
    hmlDistanceStd: hml.std,
    timeAboveThresholdMean: time.mean,
    timeAboveThresholdStd: time.std,
    sampleCount: relevant.length,
  };
}

// ─── RPE baseline + z-score ────────────────────────────────────────────────

/**
 * Minimum RPE sessions needed before computing a meaningful RPE z-score.
 * Lower than metabolic baseline because RPE is submitted more frequently.
 */
const RPE_MIN_SAMPLES = 4;

/**
 * Compute athlete-specific rolling RPE baseline for a target date.
 * Uses the preceding `baselineWindowDays` days (not including target date).
 */
export function computeRpeBaseline(
  rows: RpeSourceRow[],
  dateKey: string,
): { mean: number | null; std: number | null; sampleCount: number } {
  const windowStart = dateMinusDays(dateKey, METABOLIC_CONFIG.baselineWindowDays);
  const relevant = rows
    .filter((r) => r.date < dateKey && r.date >= windowStart)
    .map((r) => r.rpe)
    .filter((v): v is number => isFiniteNumber(v) && v > 0);

  const mean = meanOf(relevant);
  if (mean == null) return { mean: null, std: null, sampleCount: 0 };
  return {
    mean,
    std: stdOf(relevant, mean),
    sampleCount: relevant.length,
  };
}

/**
 * Compute RPE z-score for a given date.
 * Returns null if not enough baseline samples or no RPE on target date.
 */
export function computeRpeZScore(rows: RpeSourceRow[], dateKey: string): number | null {
  const today = rows.find((r) => r.date === dateKey);
  if (!today || !isFiniteNumber(today.rpe)) return null;

  const baseline = computeRpeBaseline(rows, dateKey);
  if (baseline.sampleCount < RPE_MIN_SAMPLES) return null;

  return computeZScore(today.rpe, baseline.mean, baseline.std);
}

// ─── Confidence ────────────────────────────────────────────────────────────

/**
 * Returns a 0–1 confidence value based on:
 * - whether metabolic data is valid for this session
 * - how many z-score inputs were available
 * - how large the baseline sample is
 */
export function computeMetabolicConfidence(
  metabolicDataValid: boolean,
  availableZScores: number,
  sampleCount: number,
): number {
  if (!metabolicDataValid) return 0;
  const coverageRatio = availableZScores / 4; // 4 possible z-scores
  const baselinePenalty = sampleCount < METABOLIC_CONFIG.minBaselineSamples ? 0.5 : 1.0;
  return roundTo(clamp(coverageRatio * baselinePenalty, 0, 1), 3) ?? 0;
}

// ─── Score computation ─────────────────────────────────────────────────────

/**
 * Computes the Metabolic Load Score (0–100) from normalised z-scores.
 *
 * Formula:
 *   rawComposite = Σ(weight_i * z_i) for available inputs
 *   score = clamp(center + multiplier * rawComposite, 0, 100)
 *
 * Returns null if fewer than 2 core metabolic inputs are available.
 */
export function computeMetabolicLoadScore(input: MetabolicLoadInput): MetabolicLoadComputedRow {
  const { baseline, metabolicDataValid } = input;

  const hmlZ = computeZScore(input.hmlDistance, baseline.hmlDistanceMean, baseline.hmlDistanceStd);
  const timeZ = computeZScore(
    input.timeAboveThreshold,
    baseline.timeAboveThresholdMean,
    baseline.timeAboveThresholdStd,
  );
  const peakZ = computeZScore(
    input.metabolicPowerPeak,
    baseline.peakPowerMean,
    baseline.peakPowerStd,
  );
  const avgZ = computeZScore(
    input.metabolicPowerAvg,
    baseline.avgPowerMean,
    baseline.avgPowerStd,
  );

  const availableCount = [hmlZ, timeZ, peakZ, avgZ].filter(isFiniteNumber).length;
  const confidence = computeMetabolicConfidence(metabolicDataValid, availableCount, baseline.sampleCount);

  // Need at least 2 valid z-scores to produce a meaningful score
  if (availableCount < 2 || !metabolicDataValid) {
    return {
      metabolicPowerAvgZ: avgZ,
      metabolicPowerPeakZ: peakZ,
      hmlDistanceZ: hmlZ,
      timeAboveHmlThresholdZ: timeZ,
      metabolicLoadScore: null,
      metabolicLoadBand: null,
      metabolicFlag: "none",
      dataConfidenceMetabolic: confidence,
      confidence: confidence === 0 ? "low" : "low",
    };
  }

  const { weights, scoreCenter, scoreMultiplier } = METABOLIC_CONFIG;

  // Weighted composite – only use available components, renormalize weights
  const allComponents = [
    { z: hmlZ, weight: weights.hmlDistance as number },
    { z: timeZ, weight: weights.timeAboveThreshold as number },
    { z: peakZ, weight: weights.peakPower as number },
    { z: avgZ, weight: weights.avgPower as number },
  ];
  const components = allComponents.filter(
    (c): c is { z: number; weight: number } => isFiniteNumber(c.z),
  );

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const rawComposite = components.reduce((sum, c) => sum + (c.z * c.weight) / totalWeight, 0);

  const rawScore = scoreCenter + scoreMultiplier * rawComposite;
  const metabolicLoadScore = roundTo(clamp(rawScore, 0, 100), 2);

  const metabolicLoadBand = classifyMetabolicLoadBand(metabolicLoadScore);
  const metabolicFlag = classifyMetabolicFlag(metabolicLoadScore);

  const confidenceLevel: MetabolicLoadConfidence =
    confidence >= 0.7 ? "high" : confidence >= 0.4 ? "medium" : "low";

  return {
    metabolicPowerAvgZ: avgZ,
    metabolicPowerPeakZ: peakZ,
    hmlDistanceZ: hmlZ,
    timeAboveHmlThresholdZ: timeZ,
    metabolicLoadScore,
    metabolicLoadBand,
    metabolicFlag,
    dataConfidenceMetabolic: confidence,
    confidence: confidenceLevel,
  };
}

// ─── Classification ─────────────────────────────────────────────────────────

export function classifyMetabolicLoadBand(score: number | null): MetabolicLoadBand | null {
  if (!isFiniteNumber(score)) return null;
  const { bands } = METABOLIC_CONFIG;
  if (score >= bands.very_high) return "very_high";
  if (score >= bands.high) return "high";
  if (score >= bands.moderate) return "moderate";
  return "low";
}

function classifyMetabolicFlag(score: number | null): MetabolicFlag {
  if (!isFiniteNumber(score) || score < 65) return "none";
  return "metabolic_fatigue";
}

/**
 * Classify composite fatigue type from mechanical + metabolic scores + RPE.
 *
 * Priority order:
 *   1. global_fatigue      – both GPS scores ≥ 65 (most critical)
 *   2. perceived_mismatch  – RPE z ≥ 1.0 but neither GPS score is elevated
 *                            (athlete feeling the work more than GPS shows)
 *   3. mechanical_fatigue  – mechanical ≥ 65, metabolic < 55
 *   4. metabolic_fatigue   – metabolic ≥ 65, mechanical < 55
 *   5. recovery_mismatch   – ACWR / stress-recovery flag
 *   6. normal
 *
 * perceived_mismatch threshold: RPE z-score ≥ 1.0 is one standard deviation
 * above the athlete's own rolling mean — a reliable signal that perceived
 * effort is elevated relative to their norm, even when GPS says otherwise.
 */
export function classifyFatigueType(input: FatigueTypeInput): CompositeFatigueType {
  const { mechanicalLoadScore, metabolicLoadScore, recoveryMismatch, rpeZScore, sessionType } = input;
  const mechHigh = isFiniteNumber(mechanicalLoadScore) && mechanicalLoadScore >= 65;
  const metaHigh = isFiniteNumber(metabolicLoadScore) && metabolicLoadScore >= 65;

  // 1. Both GPS streams are elevated — highest priority
  if (mechHigh && metaHigh) return "global_fatigue";

  // 2. RPE elevated but GPS is not.
  //    Threshold is session-type aware:
  //      match    → 1.5  (elevated RPE is expected after matches)
  //      recovery → 0.5  (any elevation on a recovery day is a signal)
  //      other    → 1.0  (default)
  const mismatchThreshold =
    sessionType === "match" ? 1.5 : sessionType === "recovery" ? 0.5 : 1.0;
  const rpeElevated = isFiniteNumber(rpeZScore) && (rpeZScore as number) >= mismatchThreshold;
  if (rpeElevated && !mechHigh && !metaHigh) return "perceived_mismatch";

  // 3–4. Single-stream GPS fatigue
  if (mechHigh && !metaHigh) return "mechanical_fatigue";
  if (metaHigh && !mechHigh) return "metabolic_fatigue";

  // 5. Recovery / ACWR mismatch
  if (recoveryMismatch) return "recovery_mismatch";

  return "normal";
}

// ─── Recommendation codes ──────────────────────────────────────────────────

/**
 * Returns a structured recommendation code for the Decision Engine.
 */
export function getMetabolicRecommendationCode(
  fatigueType: CompositeFatigueType,
): MetabolicRecommendationCode {
  switch (fatigueType) {
    case "metabolic_fatigue":
      return "REDUCE_CONDITIONING";
    case "global_fatigue":
      return "REDUCE_TOTAL_LOAD";
    case "recovery_mismatch":
      return "RECOVERY_EMPHASIS";
    case "mechanical_fatigue":
      return "MONITOR_RESPONSE";
    case "perceived_mismatch":
      return "INVESTIGATE_PERCEIVED_LOAD";
    default:
      return "NO_METABOLIC_FLAG";
  }
}

/**
 * Human-readable recommendation hints (for coach display).
 */
export function getMetabolicRecommendationHints(
  fatigueType: CompositeFatigueType,
): string[] {
  switch (fatigueType) {
    case "metabolic_fatigue":
      return [
        "Reduce conditioning volume",
        "Limit repeated sprint demand",
        "Avoid dense aerobic/anaerobic loading",
      ];
    case "global_fatigue":
      return [
        "Recovery emphasis day",
        "Lower total load across all modalities",
        "Increase monitoring frequency",
      ];
    case "mechanical_fatigue":
      return [
        "Reduce eccentric loading",
        "Limit heavy lower body and plyometrics",
        "Monitor deep deceleration exposure",
      ];
    case "recovery_mismatch":
      return [
        "Keep training flexible",
        "Lower intensity if subjective symptoms persist",
        "Monitor response to today's session",
      ];
    case "perceived_mismatch":
      return [
        "GPS load is normal but player is rating effort above their baseline",
        "Check for early fatigue, illness, or poor sleep",
        "Reduce session complexity — keep volume low today",
        "Follow up with player directly",
      ];
    default:
      return [];
  }
}

// ─── Delta and volatility ──────────────────────────────────────────────────

/**
 * Compute metabolic load scores for the last `windowDays` days before and
 * including `dateKey`. Returns [{date, score}] sorted ascending.
 * Used as input for delta and volatility calculations.
 */
export function computeMetabolicScoresWindow(
  rows: MetabolicLoadSourceRow[],
  dateKey: string,
  windowDays = 7,
): Array<{ date: string; score: number | null }> {
  const windowStart = dateMinusDays(dateKey, windowDays - 1);
  const dates: string[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    dates.push(dateMinusDays(dateKey, i));
  }
  return dates
    .filter((d) => d >= windowStart)
    .map((d) => {
      const current = rows.find((r) => r.date === d);
      if (!current) return { date: d, score: null };
      const baseline = computeMetabolicBaseline(rows, d);
      const computed = computeMetabolicLoadScore({
        metabolicPowerAvg: current.metabolic_power,
        metabolicPowerPeak: current.metabolic_power_peak,
        hmlDistance: current.high_metabolic_load_distance_m,
        timeAboveThreshold: current.time_above_hml_threshold_s,
        metabolicDataValid: current.metabolic_data_valid,
        baseline,
      });
      return { date: d, score: computed.metabolicLoadScore };
    });
}

/**
 * Delta score: today's score minus the most recent valid score N days ago.
 * Returns null if no valid comparison point is available.
 *
 *   > +5  → rising load
 *  -5–+5  → stable
 *   < -5  → falling / recovering
 */
export function computeMetabolicDelta(
  scoresWindow: Array<{ date: string; score: number | null }>,
  dateKey: string,
  lookbackDays = 5,
): number | null {
  const today = scoresWindow.find((s) => s.date === dateKey);
  if (!today || today.score == null) return null;

  const cutoff = dateMinusDays(dateKey, lookbackDays);
  const past = scoresWindow
    .filter((s) => s.date < dateKey && s.date >= cutoff && s.score != null)
    .sort((a, b) => b.date.localeCompare(a.date)); // most recent first

  if (!past.length || past[0].score == null) return null;
  return roundTo(today.score - past[0].score, 1);
}

/**
 * Volatility: population standard deviation of valid scores over a window.
 * High volatility (>15 points) = unpredictable load pattern.
 *
 * Returns null if fewer than 3 valid days exist in the window.
 */
export function computeMetabolicVolatility(
  scoresWindow: Array<{ date: string; score: number | null }>,
): number | null {
  const valid = scoresWindow.map((s) => s.score).filter((s): s is number => s != null);
  if (valid.length < 3) return null;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((sum, v) => sum + (v - mean) ** 2, 0) / valid.length;
  return roundTo(Math.sqrt(variance), 1);
}

// ─── Full pipeline helper ──────────────────────────────────────────────────

/**
 * Convenience: given a player's historical rows + target date + mechanical
 * score + optional RPE rows, computes the full metabolic load output.
 *
 * Returns null if no GPS row exists for the target date.
 * rpeRows are optional — omitting them disables perceived_mismatch detection.
 */
export function computeMetabolicLoad(
  rows: MetabolicLoadSourceRow[],
  dateKey: string,
  mechanicalLoadScore: number | null = null,
  rpeRows: RpeSourceRow[] = [],
): (MetabolicLoadComputedRow & {
  fatigueType: CompositeFatigueType;
  recommendationCode: MetabolicRecommendationCode;
  rpeZScore: number | null;
  deltaScore: number | null;
  volatility7d: number | null;
}) | null {
  const current = rows.find((row) => row.date === dateKey);
  if (!current) return null;

  const baseline = computeMetabolicBaseline(rows, dateKey);
  const computed = computeMetabolicLoadScore({
    metabolicPowerAvg: current.metabolic_power,
    metabolicPowerPeak: current.metabolic_power_peak,
    hmlDistance: current.high_metabolic_load_distance_m,
    timeAboveThreshold: current.time_above_hml_threshold_s,
    metabolicDataValid: current.metabolic_data_valid,
    baseline,
  });

  const rpeZScore = rpeRows.length > 0 ? computeRpeZScore(rpeRows, dateKey) : null;
  const todayRpe = rpeRows.find((r) => r.date === dateKey);
  const sessionType = todayRpe?.session_type ?? null;

  const fatigueType = classifyFatigueType({
    mechanicalLoadScore,
    metabolicLoadScore: computed.metabolicLoadScore,
    rpeZScore,
    sessionType,
  });

  const recommendationCode = getMetabolicRecommendationCode(fatigueType);

  // Delta and volatility — computed over a 7-day window
  const scoresWindow = computeMetabolicScoresWindow(rows, dateKey, 7);
  const deltaScore = computeMetabolicDelta(scoresWindow, dateKey, 5);
  const volatility7d = computeMetabolicVolatility(scoresWindow);

  return { ...computed, fatigueType, recommendationCode, rpeZScore, deltaScore, volatility7d };
}
