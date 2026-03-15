import { clamp } from "./normalize";
import type { DriverContribution, FatigueAccumulationBand, FatigueAccumulationDecision, NormalizedNeuralVolatilityInput } from "./types";

function push(drivers: DriverContribution[], key: string, label: string, contribution: number, direction: DriverContribution["direction"], value?: number | null) {
  if (Math.abs(contribution) < 0.001) return;
  drivers.push({ key, label, contribution, direction, value: value ?? null });
}

function sortDrivers(drivers: DriverContribution[]) {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { primary: sorted.slice(0, 3), secondary: sorted.slice(3, 6) };
}

function avg(values: Array<number | null> | undefined): number | null {
  const clean = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function bandFromScore(score: number): FatigueAccumulationBand {
  if (score >= 75) return "HEAVY";
  if (score >= 50) return "ELEVATED";
  if (score >= 25) return "BUILDING";
  return "LOW";
}

/**
 * Detect multi-day fatigue accumulation (distinct from one-day injury risk snapshots).
 */
export function buildFatigueAccumulationDecision(input: NormalizedNeuralVolatilityInput): FatigueAccumulationDecision {
  const drivers: DriverContribution[] = [];
  let score = 20;

  const neuralAvg = avg(input.neuralFatigueHistory);
  if (neuralAvg != null) {
    const c = clamp(neuralAvg / 10, 0, 1) * 22;
    score += c;
    push(drivers, "neural_history", "Repeated neural fatigue", c, "risk", neuralAvg);
  }

  const sorenessAvg = avg(input.sorenessHistory);
  if (sorenessAvg != null) {
    const c = clamp((3 - sorenessAvg) / 2, -1, 1) * 14;
    score += c;
    push(drivers, "soreness_history", "Soreness trend", c, c >= 0 ? "risk" : "protective", sorenessAvg);
  }

  const sleepAvg = avg(input.sleepHistory);
  if (sleepAvg != null) {
    const c = clamp((3 - sleepAvg) / 2, -1, 1) * 14;
    score += c;
    push(drivers, "sleep_history", "Sleep recovery trend", c, c >= 0 ? "risk" : "protective", sleepAvg);
  }

  const stressAvg = avg(input.stressHistory);
  if (stressAvg != null) {
    const c = clamp((stressAvg - 3) / 2, -1, 1) * 10;
    score += c;
    push(drivers, "stress_history", "Stress trend", c, c >= 0 ? "risk" : "protective", stressAvg);
  }

  const redYellowDays = (input.athleteStateHistory ?? []).filter((s) => s === "RED" || s === "YELLOW").length;
  if (redYellowDays) {
    const c = Math.min(14, redYellowDays * 3.5);
    score += c;
    push(drivers, "state_history", "Repeated caution states", c, "risk", redYellowDays);
  }

  const recoveryDays = (input.sessionModeHistory ?? []).filter((m) => m === "recovery").length;
  if (recoveryDays >= 1) {
    const c = -Math.min(8, recoveryDays * 3);
    score += c;
    push(drivers, "recovery_taken", "Recent recovery sessions", c, "protective", recoveryDays);
  }

  if (input.acuteChronicRatio != null) {
    const c = input.acuteChronicRatio >= 1.4 ? 10 : input.acuteChronicRatio >= 1.25 ? 5 : input.acuteChronicRatio <= 1.0 ? -3 : 0;
    score += c;
    push(drivers, "load_ratio", "Load accumulation pressure", c, c >= 0 ? "risk" : "protective", input.acuteChronicRatio);
  }

  if (input.matchCongestionScore != null) {
    const c = clamp(input.matchCongestionScore / 100, 0, 1) * 10;
    score += c;
    push(drivers, "congestion", "Schedule congestion", c, "risk", input.matchCongestionScore);
  }

  const vol = input.volatility7d ?? input.volatility5d ?? avg(input.volatilityHistory);
  if (vol != null) {
    const c = clamp((vol - 35) / 65, -1, 1) * 8;
    score += c;
    push(drivers, "volatility", "Volatility pressure", c, c >= 0 ? "risk" : "protective", vol);
  }

  score = clamp(score, 0, 100);
  const band = bandFromScore(score);
  const ranked = sortDrivers(drivers);

  return {
    score,
    band,
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.5, 0, 1),
    summary:
      band === "HEAVY"
        ? "Fatigue accumulation is heavy across recent days."
        : band === "ELEVATED"
        ? "Fatigue accumulation is elevated and should be managed."
        : band === "BUILDING"
        ? "Fatigue is building; monitor progression and adjust if needed."
        : "Fatigue accumulation remains low and controlled.",
  };
}
