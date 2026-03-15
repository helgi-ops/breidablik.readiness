import { clamp } from "./normalize";
import type { DriverContribution, NormalizedPerformanceIntelligenceInput, PerformanceBand, PerformanceForecastDecision, ReadinessState } from "./types";

function normalizeLikertPositive(v: number | null | undefined): number | null {
  if (v == null) return null;
  return clamp((v - 1) / 4, 0, 1);
}

function normalizeVolatility(input: NormalizedPerformanceIntelligenceInput): number | null {
  const v = input.volatility7d ?? input.volatility5d;
  if (v == null) return null;
  return clamp(v / 100, 0, 1);
}

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

function stateContribution(state: ReadinessState | null | undefined): number {
  if (state === "GREEN") return 10;
  if (state === "YELLOW") return -10;
  if (state === "RED") return -24;
  if (state === "GRAY") return -6;
  return 0;
}

function bandFromScore(score: number): PerformanceBand {
  if (score >= 85) return "PEAK";
  if (score >= 70) return "READY";
  if (score >= 55) return "MANAGEABLE";
  if (score >= 35) return "FATIGUED";
  return "AT_RISK";
}

function summarizePerformanceBand(band: PerformanceBand): string {
  if (band === "PEAK") return "Projected performance state is peak-ready for high-quality output.";
  if (band === "READY") return "Projected performance state is ready with normal execution quality.";
  if (band === "MANAGEABLE") return "Projected performance is manageable; quality can be preserved with control.";
  if (band === "FATIGUED") return "Projected performance is reduced by fatigue-related drivers.";
  return "Projected performance is at-risk; protect output and prioritize recovery control.";
}

/**
 * Deterministic short-horizon performance forecast (0-100, higher is better).
 */
export function buildPerformanceForecastDecision(input: NormalizedPerformanceIntelligenceInput): PerformanceForecastDecision {
  const drivers: DriverContribution[] = [];
  let score = 60;

  const readinessState = input.readinessState ?? input.athleteState ?? null;
  const stateContrib = stateContribution(readinessState);
  score += stateContrib;
  push(drivers, "readiness_state", "Readiness state", stateContrib, stateContrib >= 0 ? "positive" : "negative", null, readinessState ?? undefined);

  if (input.readinessScore != null) {
    const contrib = clamp((input.readinessScore - 50) / 50, -1, 1) * 10;
    score += contrib;
    push(drivers, "readiness_score", "Readiness score", contrib, contrib >= 0 ? "positive" : "negative", input.readinessScore);
  }

  if (input.zScore != null) {
    const contrib = clamp(input.zScore / 2, -1, 1) * 10;
    score += contrib;
    push(drivers, "z_score", "Readiness deviation (z-score)", contrib, contrib >= 0 ? "positive" : "negative", input.zScore);
  }

  if (input.deltaZ != null) {
    const contrib = clamp(input.deltaZ / 1.5, -1, 1) * 8;
    score += contrib;
    push(drivers, "delta_z", "Readiness trend (delta-z)", contrib, contrib >= 0 ? "positive" : "negative", input.deltaZ);
  }

  const energy = normalizeLikertPositive(input.energyScore);
  if (energy != null) {
    const contrib = (energy - 0.5) * 14;
    score += contrib;
    push(drivers, "energy", "Energy", contrib, contrib >= 0 ? "positive" : "negative", input.energyScore);
  }

  const sleep = normalizeLikertPositive(input.sleepScore);
  if (sleep != null) {
    const contrib = (sleep - 0.5) * 12;
    score += contrib;
    push(drivers, "sleep", "Sleep quality", contrib, contrib >= 0 ? "positive" : "negative", input.sleepScore);
  }

  const mood = normalizeLikertPositive(input.moodScore);
  if (mood != null) {
    const contrib = (mood - 0.5) * 8;
    score += contrib;
    push(drivers, "mood", "Mood", contrib, contrib >= 0 ? "positive" : "negative", input.moodScore);
  }

  if (input.stressScore != null) {
    const contrib = clamp((3 - input.stressScore) / 2, -1, 1) * 8;
    score += contrib;
    push(drivers, "stress", "Stress", contrib, contrib >= 0 ? "positive" : "negative", input.stressScore);
  }

  if (input.sorenessScore != null) {
    const contrib = clamp((input.sorenessScore - 3) / 2, -1, 1) * 10;
    score += contrib;
    push(drivers, "soreness", "Soreness status", contrib, contrib >= 0 ? "positive" : "negative", input.sorenessScore);
  }

  const volNorm = normalizeVolatility(input);
  if (volNorm != null) {
    const contrib = clamp((0.4 - volNorm) / 0.4, -1, 1) * 8;
    score += contrib;
    push(drivers, "volatility", "Volatility stability", contrib, contrib >= 0 ? "positive" : "negative", input.volatility7d ?? input.volatility5d);
  }

  const neuralRisk = input.neuralFatigueScore != null ? clamp(input.neuralFatigueScore / 10, 0, 1) : input.neuralFatigueFlag ? 0.75 : null;
  if (neuralRisk != null) {
    const contrib = -neuralRisk * 14;
    score += contrib;
    push(drivers, "neural_fatigue", "Neural fatigue", contrib, "negative", input.neuralFatigueScore ?? (input.neuralFatigueFlag ? 1 : 0));
  }

  if (input.acuteChronicRatio != null) {
    const ratio = input.acuteChronicRatio;
    const contrib = ratio >= 1.45 ? -10 : ratio >= 1.25 ? -5 : ratio >= 0.85 && ratio <= 1.15 ? 4 : 0;
    score += contrib;
    push(drivers, "ac_ratio", "Load balance", contrib, contrib >= 0 ? "positive" : "negative", ratio);
  }

  if (input.matchCongestionScore != null) {
    const contrib = -clamp(input.matchCongestionScore / 100, 0, 1) * 7;
    score += contrib;
    push(drivers, "congestion", "Match congestion", contrib, "negative", input.matchCongestionScore);
  }

  score = clamp(score, 0, 100);
  const band = bandFromScore(score);
  const ranked = topDrivers(drivers);

  return {
    score,
    band,
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.55, 0, 1),
    summary: summarizePerformanceBand(band),
  };
}
