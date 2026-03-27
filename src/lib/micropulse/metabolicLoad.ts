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
  | "recovery_mismatch";

export type FatigueTypeInput = {
  mechanicalLoadScore: number | null;
  metabolicLoadScore: number | null;
  /** Internal stress/recovery markers poor despite low external load */
  recoveryMismatch?: boolean;
};

/** Recommendation code for Decision Engine consumption. */
export type MetabolicRecommendationCode =
  | "REDUCE_CONDITIONING"
  | "REDUCE_TOTAL_LOAD"
  | "RECOVERY_EMPHASIS"
  | "MONITOR_RESPONSE"
  | "NO_METABOLIC_FLAG";

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
 * Classify composite fatigue type from mechanical + metabolic scores.
 * Thresholds from v1 spec:
 *   mechanical ≥ 65 AND metabolic < 55 → mechanical_fatigue
 *   metabolic ≥ 65 AND mechanical < 55 → metabolic_fatigue
 *   both ≥ 65                          → global_fatigue
 *   recovery mismatch flag              → recovery_mismatch
 *   else                               → normal
 */
export function classifyFatigueType(input: FatigueTypeInput): CompositeFatigueType {
  const { mechanicalLoadScore, metabolicLoadScore, recoveryMismatch } = input;
  const mechHigh = isFiniteNumber(mechanicalLoadScore) && mechanicalLoadScore >= 65;
  const metaHigh = isFiniteNumber(metabolicLoadScore) && metabolicLoadScore >= 65;

  if (mechHigh && metaHigh) return "global_fatigue";
  if (mechHigh && !metaHigh) return "mechanical_fatigue";
  if (metaHigh && !mechHigh) return "metabolic_fatigue";
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
    default:
      return [];
  }
}

// ─── Full pipeline helper ──────────────────────────────────────────────────

/**
 * Convenience: given a player's historical rows + target date + mechanical
 * score, computes the full metabolic load output for that date.
 *
 * Returns null if no row exists for the target date.
 */
export function computeMetabolicLoad(
  rows: MetabolicLoadSourceRow[],
  dateKey: string,
  mechanicalLoadScore: number | null = null,
): (MetabolicLoadComputedRow & { fatigueType: CompositeFatigueType; recommendationCode: MetabolicRecommendationCode }) | null {
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

  const fatigueType = classifyFatigueType({
    mechanicalLoadScore,
    metabolicLoadScore: computed.metabolicLoadScore,
  });

  const recommendationCode = getMetabolicRecommendationCode(fatigueType);

  return { ...computed, fatigueType, recommendationCode };
}
