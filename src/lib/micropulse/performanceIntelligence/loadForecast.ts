import { clamp } from "./normalize";
import type { DriverContribution, LoadForecastDecision, LoadToleranceBand, NormalizedPerformanceIntelligenceInput } from "./types";

function push(
  drivers: DriverContribution[],
  key: string,
  label: string,
  contribution: number,
  direction: DriverContribution["direction"],
  value?: number | null,
  note?: string,
): void {
  if (Math.abs(contribution) < 0.001) return;
  drivers.push({ key, label, contribution, direction, value: value ?? null, note });
}

function topDrivers(drivers: DriverContribution[]): { primary: DriverContribution[]; secondary: DriverContribution[] } {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    primary: sorted.slice(0, 3),
    secondary: sorted.slice(3, 6),
  };
}

function loadBandFromScore(score: number): LoadToleranceBand {
  if (score < 25) return "RECOVERY_ONLY";
  if (score < 45) return "TOLERATES_LOW";
  if (score < 70) return "TOLERATES_MODERATE";
  return "TOLERATES_HIGH";
}

function mapBandToRecommendation(band: LoadToleranceBand): {
  recommendedMaxIntensity: "low" | "moderate" | "high";
  recommendedAction: "full" | "modified" | "recovery";
  summary: string;
} {
  if (band === "RECOVERY_ONLY") {
    return {
      recommendedMaxIntensity: "low",
      recommendedAction: "recovery",
      summary: "Current profile supports recovery-only loading until risk drivers stabilize.",
    };
  }
  if (band === "TOLERATES_LOW") {
    return {
      recommendedMaxIntensity: "low",
      recommendedAction: "modified",
      summary: "Current profile supports low loading with controlled exposure.",
    };
  }
  if (band === "TOLERATES_MODERATE") {
    return {
      recommendedMaxIntensity: "moderate",
      recommendedAction: "modified",
      summary: "Current profile supports moderate loading with monitored quality.",
    };
  }
  return {
    recommendedMaxIntensity: "high",
    recommendedAction: "full",
    summary: "Current profile supports high loading with standard monitoring.",
  };
}

/**
 * Deterministic load tolerance forecast (0-100, higher = more safely tolerable load).
 */
export function buildLoadForecastDecision(input: NormalizedPerformanceIntelligenceInput): LoadForecastDecision {
  const drivers: DriverContribution[] = [];
  let score = 55;

  const state = input.athleteState ?? input.readinessState ?? null;
  if (state === "RED") {
    score -= 34;
    push(drivers, "state", "Athlete state", -34, "negative", null, "RED");
  } else if (state === "YELLOW") {
    score -= 14;
    push(drivers, "state", "Athlete state", -14, "negative", null, "YELLOW");
  } else if (state === "GREEN") {
    score += 10;
    push(drivers, "state", "Athlete state", 10, "positive", null, "GREEN");
  }

  if (input.neuralFatigueFlag === true) {
    score -= 16;
    push(drivers, "neural_flag", "Neural fatigue flag", -16, "negative", 1);
  }

  if (input.neuralFatigueScore != null) {
    const contrib = -clamp(input.neuralFatigueScore / 10, 0, 1) * 12;
    score += contrib;
    push(drivers, "neural_score", "Neural fatigue score", contrib, "negative", input.neuralFatigueScore);
  }

  if (input.sorenessScore != null) {
    const contrib = clamp((input.sorenessScore - 3) / 2, -1, 1) * 10;
    score += contrib;
    push(drivers, "soreness", "Soreness status", contrib, contrib >= 0 ? "positive" : "negative", input.sorenessScore);
  }

  if (input.zScore != null) {
    const contrib = clamp(input.zScore / 2, -1, 1) * 9;
    score += contrib;
    push(drivers, "z_score", "Readiness z-score", contrib, contrib >= 0 ? "positive" : "negative", input.zScore);
  }

  if (input.deltaZ != null) {
    const contrib = clamp(input.deltaZ / 1.5, -1, 1) * 8;
    score += contrib;
    push(drivers, "delta_z", "Readiness trend", contrib, contrib >= 0 ? "positive" : "negative", input.deltaZ);
  }

  if (input.acuteChronicRatio != null) {
    const ratio = input.acuteChronicRatio;
    const contrib = ratio >= 1.45 ? -14 : ratio >= 1.25 ? -7 : ratio >= 0.85 && ratio <= 1.15 ? 5 : 0;
    score += contrib;
    push(drivers, "ac_ratio", "Load ratio", contrib, contrib >= 0 ? "positive" : "negative", ratio);
  }

  const vol = input.volatility7d ?? input.volatility5d;
  if (vol != null) {
    const contrib = -clamp(vol / 100, 0, 1) * 8;
    score += contrib;
    push(drivers, "volatility", "Volatility", contrib, "negative", vol);
  }

  if (input.sleepScore != null) {
    const contrib = clamp((input.sleepScore - 3) / 2, -1, 1) * 6;
    score += contrib;
    push(drivers, "sleep", "Sleep quality", contrib, contrib >= 0 ? "positive" : "negative", input.sleepScore);
  }

  if (input.stressScore != null) {
    const contrib = clamp((3 - input.stressScore) / 2, -1, 1) * 5;
    score += contrib;
    push(drivers, "stress", "Stress", contrib, contrib >= 0 ? "positive" : "negative", input.stressScore);
  }

  if (input.sessionMode === "recovery") {
    score -= 5;
    push(drivers, "session_mode", "Current session mode", -5, "negative", null, "recovery");
  } else if (input.sessionMode === "full") {
    score += 3;
    push(drivers, "session_mode", "Current session mode", 3, "positive", null, "full");
  }

  if (input.matchCongestionScore != null) {
    const contrib = -clamp(input.matchCongestionScore / 100, 0, 1) * 6;
    score += contrib;
    push(drivers, "congestion", "Match congestion", contrib, "negative", input.matchCongestionScore);
  }

  score = clamp(score, 0, 100);
  const band = loadBandFromScore(score);
  const recommendation = mapBandToRecommendation(band);
  const ranked = topDrivers(drivers);

  return {
    score,
    band,
    recommendedMaxIntensity: recommendation.recommendedMaxIntensity,
    recommendedAction: recommendation.recommendedAction,
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.55, 0, 1),
    summary: recommendation.summary,
  };
}
