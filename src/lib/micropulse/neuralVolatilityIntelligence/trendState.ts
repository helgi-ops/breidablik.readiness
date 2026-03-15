import { clamp } from "./normalize";
import type { DriverContribution, NormalizedNeuralVolatilityInput, TrendDirection, TrendStateDecision } from "./types";

function push(
  drivers: DriverContribution[],
  key: string,
  label: string,
  contribution: number,
  direction: DriverContribution["direction"],
  value?: number | null,
): void {
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

function firstLastDelta(values: Array<number | null> | undefined): number | null {
  const clean = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (clean.length < 2) return null;
  return clean[clean.length - 1] - clean[0];
}

function directionFromDelta(delta: number): TrendDirection {
  if (delta <= -12) return "SHARPLY_WORSENING";
  if (delta <= -4) return "WORSENING";
  if (delta >= 6) return "IMPROVING";
  return "STABLE";
}

function proxyCurrentRisk(input: NormalizedNeuralVolatilityInput): number {
  let risk = 40;
  if (input.neuralFatigueFlag || (input.neuralFatigueScore ?? 0) >= 7) risk += 20;
  else if ((input.neuralFatigueScore ?? 0) >= 5) risk += 10;
  if ((input.sorenessScore ?? 3) <= 2) risk += 12;
  if ((input.sleepScore ?? 3) <= 2) risk += 10;
  if ((input.stressScore ?? 3) >= 4) risk += 8;
  if ((input.volatility7d ?? input.volatility5d ?? 0) >= 60) risk += 10;
  if ((input.deltaZ ?? 0) <= -0.4) risk += 10;
  if (input.athleteState === "RED" || input.readinessState === "RED") risk += 15;
  if (input.athleteState === "GREEN" && (input.sleepScore ?? 3) >= 4 && (input.sorenessScore ?? 3) >= 4) risk -= 12;
  return clamp(risk, 0, 100);
}

/**
 * Classify short-term trend direction from history + current snapshot.
 */
export function buildTrendStateDecision(input: NormalizedNeuralVolatilityInput): TrendStateDecision {
  const drivers: DriverContribution[] = [];

  const historyRisk = input.riskHistory ?? [];
  const historyAvg = avg(historyRisk);
  const historyDelta = firstLastDelta(historyRisk);
  const currentRiskProxy = proxyCurrentRisk(input);

  let scoreDelta = 0;
  if (historyAvg != null) {
    scoreDelta = currentRiskProxy - historyAvg;
    const c = clamp(Math.abs(scoreDelta) / 20, 0, 1) * (scoreDelta >= 0 ? -9 : 9);
    push(drivers, "risk_vs_avg", "Current vs recent risk", c, c >= 0 ? "positive" : "negative", scoreDelta);
  }

  if (historyDelta != null) {
    const c = clamp(Math.abs(historyDelta) / 20, 0, 1) * (historyDelta >= 0 ? -8 : 8);
    push(drivers, "risk_history_trend", "Recent risk trend", c, c >= 0 ? "positive" : "negative", historyDelta);
    scoreDelta += -historyDelta * 0.6;
  }

  const readinessDelta = firstLastDelta(input.readinessHistory);
  if (readinessDelta != null) {
    const c = clamp(Math.abs(readinessDelta) / 18, 0, 1) * (readinessDelta >= 0 ? 7 : -7);
    push(drivers, "readiness_trend", "Readiness trend", c, c >= 0 ? "positive" : "negative", readinessDelta);
    scoreDelta += readinessDelta * 0.35;
  }

  const neuralDelta = firstLastDelta(input.neuralFatigueHistory);
  if (neuralDelta != null) {
    const c = clamp(Math.abs(neuralDelta) / 4, 0, 1) * (neuralDelta >= 0 ? -8 : 8);
    push(drivers, "neural_trend", "Neural fatigue trend", c, c >= 0 ? "negative" : "positive", neuralDelta);
    scoreDelta += -neuralDelta * 2;
  }

  const sorenessDelta = firstLastDelta(input.sorenessHistory);
  if (sorenessDelta != null) {
    const c = clamp(Math.abs(sorenessDelta) / 2, 0, 1) * (sorenessDelta >= 0 ? 5 : -5);
    push(drivers, "soreness_trend", "Soreness trend", c, c >= 0 ? "positive" : "negative", sorenessDelta);
    scoreDelta += sorenessDelta * 1.2;
  }

  const direction = directionFromDelta(scoreDelta);
  const ranked = rank(drivers);

  return {
    direction,
    scoreDelta: Number(scoreDelta.toFixed(2)),
    primaryDrivers: ranked.primary,
    secondaryDrivers: ranked.secondary,
    confidence: clamp(input.dataConfidence ?? 0.5, 0, 1),
    summary:
      direction === "SHARPLY_WORSENING"
        ? "Short-term trend is sharply worsening."
        : direction === "WORSENING"
          ? "Short-term trend is worsening."
          : direction === "IMPROVING"
            ? "Short-term trend is improving."
            : "Short-term trend is stable.",
  };
}
