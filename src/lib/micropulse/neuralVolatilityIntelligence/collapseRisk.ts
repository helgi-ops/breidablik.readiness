import { clamp } from "./normalize";
import type {
  CollapseRiskBand,
  CollapseRiskDecision,
  DriverContribution,
  FatigueAccumulationDecision,
  InstabilityWindowDecision,
  NormalizedNeuralVolatilityInput,
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

function bandFromScore(score: number): CollapseRiskBand {
  if (score >= 75) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 30) return "WATCH";
  return "LOW";
}

/**
 * Detect short-term collapse-risk windows by requiring aligned multi-signal pressure.
 */
export function buildCollapseRiskDecision(
  input: NormalizedNeuralVolatilityInput,
  fatigue: FatigueAccumulationDecision,
  instability: InstabilityWindowDecision,
  trend: TrendStateDecision,
): CollapseRiskDecision {
  const drivers: DriverContribution[] = [];
  let score = 12;

  const fatigueContrib = clamp(fatigue.score / 100, 0, 1) * 24;
  const instabilityContrib = clamp(instability.score / 100, 0, 1) * 22;
  score += fatigueContrib + instabilityContrib;
  push(drivers, "fatigue_accumulation", "Fatigue accumulation pressure", fatigueContrib, "risk", fatigue.score);
  push(drivers, "instability_window", "Instability pressure", instabilityContrib, "risk", instability.score);

  if (input.neuralFatigueFlag || (input.neuralFatigueScore ?? 0) >= 7) {
    score += 10;
    push(drivers, "neural_fatigue", "Current neural fatigue", 10, "risk", input.neuralFatigueScore ?? null);
  }

  if (input.deltaZ != null && input.deltaZ <= -0.4) {
    score += 8;
    push(drivers, "negative_delta_z", "Negative readiness trend", 8, "risk", input.deltaZ);
  }

  if (input.sorenessScore != null && input.sorenessScore <= 2) {
    score += 8;
    push(drivers, "soreness", "Low soreness score (caution)", 8, "risk", input.sorenessScore);
  }

  if (input.acuteChronicRatio != null) {
    const c = input.acuteChronicRatio >= 1.45 ? 10 : input.acuteChronicRatio >= 1.25 ? 6 : input.acuteChronicRatio <= 1.05 ? -4 : 0;
    score += c;
    push(drivers, "load_ratio", "Load ratio pressure", c, c >= 0 ? "risk" : "protective", input.acuteChronicRatio);
  }

  if ((input.matchCongestionScore ?? 0) >= 60) {
    score += 6;
    push(drivers, "congestion", "Schedule congestion", 6, "risk", input.matchCongestionScore ?? null);
  }

  if ((input.sleepScore ?? 3) >= 4 && (input.stressScore ?? 3) <= 2) {
    score -= 6;
    push(drivers, "recovery_markers", "Stable recovery markers", -6, "protective", input.sleepScore ?? null);
  }

  if (input.sessionMode === "recovery") {
    score -= 7;
    push(drivers, "recovery_mode", "Recovery session already applied", -7, "protective", null);
  }

  if (trend.direction === "IMPROVING") {
    score -= 5;
    push(drivers, "trend_improving", "Trend improving", -5, "protective", trend.scoreDelta ?? null);
  } else if (trend.direction === "SHARPLY_WORSENING") {
    score += 9;
    push(drivers, "trend_worsening", "Trend sharply worsening", 9, "risk", trend.scoreDelta ?? null);
  }

  // collapse risk requires multiple aligned drivers, not single-signal overshoot
  const alignedPressureSignals = [
    fatigue.score >= 50,
    instability.score >= 50,
    (input.neuralFatigueScore ?? 0) >= 7 || input.neuralFatigueFlag,
    (input.deltaZ ?? 0) <= -0.4,
    (input.acuteChronicRatio ?? 1) >= 1.3,
  ].filter(Boolean).length;

  if (alignedPressureSignals <= 1) score -= 12;
  if (alignedPressureSignals >= 3) score += 8;

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
      band === "CRITICAL"
        ? "Collapse-risk window is critical without immediate load protection."
        : band === "HIGH"
        ? "Collapse-risk window is high and should be actively managed."
        : band === "WATCH"
        ? "Collapse-risk watch is active; monitor first-block response."
        : "Collapse-risk pressure is low.",
  };
}
