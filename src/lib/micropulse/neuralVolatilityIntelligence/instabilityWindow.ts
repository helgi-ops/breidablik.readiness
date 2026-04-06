import { clamp } from "./normalize";
import type { DriverContribution, InstabilityWindowBand, InstabilityWindowDecision, NormalizedNeuralVolatilityInput } from "./types";

function push(drivers: DriverContribution[], key: string, label: string, contribution: number, direction: DriverContribution["direction"], value?: number | null) {
  if (Math.abs(contribution) < 0.001) return;
  drivers.push({ key, label, contribution, direction, value: value ?? null });
}

function rank(drivers: DriverContribution[]) {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { primary: sorted.slice(0, 3), secondary: sorted.slice(3, 6) };
}

function avg(values: Array<number | null> | undefined): number | null {
  const clean = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function swings(values: Array<number | null> | undefined): number | null {
  const clean = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (clean.length < 2) return null;
  let total = 0;
  for (let i = 1; i < clean.length; i += 1) total += Math.abs(clean[i] - clean[i - 1]);
  return total / (clean.length - 1);
}

function bandFromScore(score: number): InstabilityWindowBand {
  if (score >= 75) return "HIGHLY_UNSTABLE";
  if (score >= 50) return "UNSTABLE";
  if (score >= 25) return "WATCH";
  return "STABLE";
}

/**
 * Detect instability windows and hidden fragility even when average readiness seems acceptable.
 */
export function buildInstabilityWindowDecision(input: NormalizedNeuralVolatilityInput): InstabilityWindowDecision {
  const drivers: DriverContribution[] = [];
  let score = 18;

  const vol = input.volatility7d ?? input.volatility5d ?? avg(input.volatilityHistory);
  if (vol != null) {
    const c = clamp(vol / 100, 0, 1) * 20;
    score += c;
    push(drivers, "volatility", "Volatility level", c, "risk", vol);
  }

  const readinessSwings = swings(input.readinessHistory);
  if (readinessSwings != null) {
    const c = clamp(readinessSwings / 20, 0, 1) * 18;
    score += c;
    push(drivers, "readiness_swings", "Day-to-day readiness swings", c, "risk", readinessSwings);
  }

  const dz = input.deltaZ;
  if (dz != null) {
    const c = clamp(Math.abs(dz) / 1.5, 0, 1) * 8;
    score += c;
    push(drivers, "delta_z", "Sharp readiness change", c, "risk", dz);
  }

  const stateHistory = input.athleteStateHistory ?? [];
  const transitions = stateHistory.reduce((acc, s, i) => (i > 0 && s !== stateHistory[i - 1] ? acc + 1 : acc), 0);
  if (transitions) {
    const c = Math.min(12, transitions * 2.5);
    score += c;
    push(drivers, "state_transitions", "Frequent state transitions", c, "risk", transitions);
  }

  const sleepSwing = swings(input.sleepHistory);
  if (sleepSwing != null) {
    const c = clamp(sleepSwing / 1.8, 0, 1) * 8;
    score += c;
    push(drivers, "sleep_swings", "Sleep instability", c, "risk", sleepSwing);
  }

  const sorenessSwing = swings(input.sorenessHistory);
  if (sorenessSwing != null) {
    const c = clamp(sorenessSwing / 1.8, 0, 1) * 8;
    score += c;
    push(drivers, "soreness_swings", "Soreness instability", c, "risk", sorenessSwing);
  }

  if (input.readinessState === "GREEN" && (input.neuralFatigueFlag || (input.neuralFatigueScore ?? 0) >= 6.5)) {
    score += 8;
    push(drivers, "readiness_neural_mismatch", "Readiness-neural mismatch", 8, "risk", input.neuralFatigueScore ?? null);
  }

  if ((input.volatility7d ?? input.volatility5d ?? 0) <= 20) {
    score -= 8;
    push(drivers, "low_volatility", "Low volatility stability", -8, "protective", input.volatility7d ?? input.volatility5d ?? null);
  }

  if (input.readinessState === "GREEN" && input.athleteState === "GREEN") {
    score -= 5;
    push(drivers, "aligned_green", "Aligned stable states", -5, "protective", null);
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
      band === "HIGHLY_UNSTABLE"
        ? "Instability window is highly elevated and requires close control."
        : band === "UNSTABLE"
        ? "Instability is elevated despite mixed top-line signals."
        : band === "WATCH"
        ? "Instability watch is active; monitor transitions closely."
        : "Recent pattern is stable.",
  };
}
