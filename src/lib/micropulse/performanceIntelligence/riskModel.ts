import { clamp } from "./normalize";
import type { DriverContribution, InjuryRiskBand, InjuryRiskDecision, NormalizedPerformanceIntelligenceInput, ReadinessState } from "./types";

function normalizeVolatility(input: NormalizedPerformanceIntelligenceInput): number | null {
  const v = input.volatility7d ?? input.volatility5d;
  if (v == null) return null;
  return clamp(v / 100, 0, 1);
}

function normalizeLikertRisk(v: number | null | undefined): number | null {
  if (v == null) return null;
  return clamp((5 - v) / 4, 0, 1);
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

function stateRiskContribution(state: ReadinessState | null | undefined): number {
  if (state === "RED") return 22;
  if (state === "YELLOW") return 10;
  if (state === "GRAY") return 6;
  if (state === "GREEN") return -8;
  return 0;
}

export function riskBandFromScore(score: number): InjuryRiskBand {
  if (score >= 75) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 30) return "MODERATE";
  return "LOW";
}

export function summarizeInjuryRiskBand(band: InjuryRiskBand): string {
  if (band === "CRITICAL") return "Critical injury risk pattern detected. Recovery-first approach is advised.";
  if (band === "HIGH") return "High injury risk pattern detected. Training exposure should be reduced.";
  if (band === "MODERATE") return "Moderate injury risk pattern. Controlled loading is advised.";
  return "Low injury risk pattern with stable support signals.";
}

/**
 * Deterministic, explainable injury risk model (0-100) from readiness + load + recovery context.
 */
export function buildInjuryRiskDecision(input: NormalizedPerformanceIntelligenceInput): InjuryRiskDecision {
  const drivers: DriverContribution[] = [];
  let score = 28;

  const state = input.athleteState ?? input.readinessState ?? null;
  const stateContrib = stateRiskContribution(state);
  score += stateContrib;
  push(drivers, "state", "Readiness state", stateContrib, stateContrib >= 0 ? "risk" : "protective", null, state ?? undefined);

  const neuralScore = input.neuralFatigueScore != null ? clamp(input.neuralFatigueScore / 10, 0, 1) : input.neuralFatigueFlag ? 0.75 : null;
  if (neuralScore != null) {
    const contrib = neuralScore * 18;
    score += contrib;
    push(drivers, "neural_fatigue", "Neural fatigue", contrib, "risk", input.neuralFatigueScore ?? (input.neuralFatigueFlag ? 1 : 0));
  }

  const sorenessRisk = normalizeLikertRisk(input.sorenessScore);
  if (sorenessRisk != null) {
    const contrib = sorenessRisk * 14;
    score += contrib;
    push(drivers, "soreness", "Soreness burden", contrib, contrib > 0 ? "risk" : "protective", input.sorenessScore);
  }

  const sleepRisk = normalizeLikertRisk(input.sleepScore);
  if (sleepRisk != null) {
    const contrib = sleepRisk * 12;
    score += contrib;
    push(drivers, "sleep", "Sleep quality", contrib, contrib > 0 ? "risk" : "protective", input.sleepScore);
  }

  if (input.stressScore != null) {
    const contrib = clamp((input.stressScore - 3) / 2, -1, 1) * 8;
    score += contrib;
    push(drivers, "stress", "Stress load", contrib, contrib > 0 ? "risk" : "protective", input.stressScore);
  }

  if (input.zScore != null) {
    const contrib = clamp((-input.zScore) / 2, -1, 1) * 12;
    score += contrib;
    push(drivers, "z_score", "Readiness deviation (z-score)", contrib, contrib > 0 ? "risk" : "protective", input.zScore);
  }

  if (input.deltaZ != null) {
    const contrib = clamp((-input.deltaZ) / 1.5, -1, 1) * 10;
    score += contrib;
    push(drivers, "delta_z", "Readiness trend (delta-z)", contrib, contrib > 0 ? "risk" : "protective", input.deltaZ);
  }

  const volNorm = normalizeVolatility(input);
  if (volNorm != null) {
    const contrib = clamp((volNorm - 0.35) / 0.65, -1, 1) * 10;
    score += contrib;
    push(drivers, "volatility", "Readiness volatility", contrib, contrib > 0 ? "risk" : "protective", input.volatility7d ?? input.volatility5d);
  }

  if (input.acuteChronicRatio != null) {
    const ratio = input.acuteChronicRatio;
    const contrib = ratio >= 1.5 ? 14 : ratio >= 1.3 ? 9 : ratio >= 1.15 ? 4 : ratio < 0.8 ? -3 : 0;
    score += contrib;
    push(drivers, "ac_ratio", "Acute:chronic load relationship", contrib, contrib > 0 ? "risk" : "protective", ratio);
  }

  if (input.matchCongestionScore != null) {
    const contrib = clamp(input.matchCongestionScore / 100, 0, 1) * 8;
    score += contrib;
    push(drivers, "congestion", "Match congestion", contrib, "risk", input.matchCongestionScore);
  }

  if (input.travelLoadScore != null) {
    const contrib = clamp(input.travelLoadScore / 100, 0, 1) * 5;
    score += contrib;
    push(drivers, "travel", "Travel load", contrib, "risk", input.travelLoadScore);
  }

  if (input.sessionMode === "recovery") {
    score -= 6;
    push(drivers, "recovery_mode", "Recovery session mode", -6, "protective", null, "recovery");
  }

  score = clamp(score, 0, 100);
  const band = riskBandFromScore(score);
  const ranked = topDrivers(drivers);

  return {
    score,
    band,
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.55, 0, 1),
    summary: summarizeInjuryRiskBand(band),
  };
}
