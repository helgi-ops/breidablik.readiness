import { clamp } from "./normalize";
import type {
  CollapseRiskDecision,
  DriverContribution,
  FatigueAccumulationDecision,
  InstabilityWindowDecision,
  NormalizedNeuralVolatilityInput,
  PeakWindowBand,
  PeakWindowDecision,
  TrendStateDecision,
} from "./types";

function push(drivers: DriverContribution[], key: string, label: string, contribution: number, direction: DriverContribution["direction"], value?: number | null) {
  if (Math.abs(contribution) < 0.001) return;
  drivers.push({ key, label, contribution, direction, value: value ?? null });
}

function rank(drivers: DriverContribution[]) {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { primary: sorted.slice(0, 3), secondary: sorted.slice(3, 6) };
}

function bandFromScore(score: number): PeakWindowBand {
  if (score >= 75) return "PEAK";
  if (score >= 50) return "OPEN";
  if (score >= 25) return "APPROACHING";
  return "NOT_READY";
}

/**
 * Identify performance peak windows from aligned positive recovery + stability signals.
 */
export function buildPeakWindowDecision(
  input: NormalizedNeuralVolatilityInput,
  fatigue: FatigueAccumulationDecision,
  instability: InstabilityWindowDecision,
  collapseRisk: CollapseRiskDecision,
  trend: TrendStateDecision,
): PeakWindowDecision {
  const drivers: DriverContribution[] = [];
  let score = 35;

  if (input.readinessState === "GREEN" || input.athleteState === "GREEN") {
    score += 14;
    push(drivers, "green_state", "Green readiness state", 14, "positive", null);
  }

  if (input.neuralFatigueFlag || (input.neuralFatigueScore ?? 0) >= 7) {
    score -= 14;
    push(drivers, "neural_fatigue", "Neural fatigue pressure", -14, "negative", input.neuralFatigueScore ?? null);
  } else {
    score += 8;
    push(drivers, "low_neural", "Low neural fatigue", 8, "positive", input.neuralFatigueScore ?? null);
  }

  if ((input.sorenessScore ?? 3) >= 4) {
    score += 9;
    push(drivers, "soreness_good", "Soreness supports readiness", 9, "positive", input.sorenessScore ?? null);
  } else if ((input.sorenessScore ?? 3) <= 2) {
    score -= 9;
    push(drivers, "soreness_low", "Soreness caution", -9, "negative", input.sorenessScore ?? null);
  }

  if ((input.sleepScore ?? 3) >= 4 && (input.energyScore ?? 3) >= 4) {
    score += 10;
    push(drivers, "sleep_energy", "Sleep and energy quality", 10, "positive", input.sleepScore ?? null);
  }

  if ((input.volatility7d ?? input.volatility5d ?? 0) <= 25) {
    score += 8;
    push(drivers, "low_volatility", "Stable volatility profile", 8, "positive", input.volatility7d ?? input.volatility5d ?? null);
  }

  if (fatigue.band === "HEAVY" || instability.band === "HIGHLY_UNSTABLE" || collapseRisk.band === "CRITICAL") {
    score -= 20;
    push(drivers, "high_pressure", "Heavy fatigue/instability pressure", -20, "negative", null);
  }

  if (trend.direction === "IMPROVING") {
    score += 7;
    push(drivers, "trend_improving", "Trend improving", 7, "positive", trend.scoreDelta ?? null);
  } else if (trend.direction === "SHARPLY_WORSENING") {
    score -= 9;
    push(drivers, "trend_worsening", "Trend worsening", -9, "negative", trend.scoreDelta ?? null);
  }

  if ((input.matchCongestionScore ?? 0) >= 65 || (input.upcomingMatchInDays ?? 99) <= 1) {
    score -= 6;
    push(drivers, "congestion", "Congestion pressure", -6, "negative", input.matchCongestionScore ?? null);
  }

  score = clamp(score, 0, 100);
  const band = bandFromScore(score);
  const sorted = rank(drivers);

  return {
    score,
    band,
    primaryDrivers: sorted.primary,
    secondaryDrivers: sorted.secondary,
    confidence: clamp(input.dataConfidence ?? 0.5, 0, 1),
    summary:
      band === "PEAK"
        ? "Peak-performance window appears open."
        : band === "OPEN"
        ? "Performance window is open with manageable constraints."
        : band === "APPROACHING"
        ? "Peak window is approaching but not fully open."
        : "Peak window is not open under current conditions.",
  };
}
