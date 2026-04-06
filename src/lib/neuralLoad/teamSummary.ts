import type { NeuralLoadClassification, NeuralLoadState, NextDayRisk, ReadinessTrajectory, TeamNeuralLoadSummary } from "@/lib/neuralLoad/types";

function pickDominantState(counts: Record<NeuralLoadState, number>): NeuralLoadState {
  const ordered: NeuralLoadState[] = ["CRITICAL", "HIGH", "RISING", "STABLE"];
  let best: NeuralLoadState = "STABLE";
  let bestCount = -1;
  for (const s of ordered) {
    const c = counts[s] ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = s;
    }
  }
  return best;
}

function dominantTrajectory(items: NeuralLoadClassification[]): ReadinessTrajectory {
  const counts: Record<ReadinessTrajectory, number> = { IMPROVING: 0, FLAT: 0, DECLINING: 0 };
  for (const i of items) counts[i.readinessTrajectory] += 1;
  if (counts.DECLINING >= counts.FLAT && counts.DECLINING >= counts.IMPROVING) return "DECLINING";
  if (counts.IMPROVING >= counts.FLAT && counts.IMPROVING >= counts.DECLINING) return "IMPROVING";
  return "FLAT";
}

function dominantRisk(items: NeuralLoadClassification[]): NextDayRisk {
  const counts: Record<NextDayRisk, number> = { LOW: 0, MODERATE: 0, HIGH: 0 };
  for (const i of items) counts[i.nextDayRisk] += 1;
  if (counts.HIGH >= counts.MODERATE && counts.HIGH >= counts.LOW) return "HIGH";
  if (counts.MODERATE >= counts.LOW && counts.MODERATE >= counts.HIGH) return "MODERATE";
  return "LOW";
}

export function buildTeamNeuralLoadSummary(items: NeuralLoadClassification[]): TeamNeuralLoadSummary {
  const counts: Record<NeuralLoadState, number> = { STABLE: 0, RISING: 0, HIGH: 0, CRITICAL: 0 };
  for (const i of items) counts[i.neuralLoadState] += 1;

  const dominantState = pickDominantState(counts);
  const trajectorySummary = dominantTrajectory(items);
  const nextDayRiskSummary = dominantRisk(items);
  const highRiskCount = items.filter((i) => i.nextDayRisk === "HIGH").length;
  const highOrCritical = (counts.HIGH ?? 0) + (counts.CRITICAL ?? 0);

  const summaryText =
    items.length === 0
      ? "No neural-load data available."
      : `Team neural load is ${dominantState.toLowerCase()}, trajectory ${trajectorySummary.toLowerCase()}, with ${highOrCritical} HIGH/CRITICAL players and ${highRiskCount} high next-day-risk cases.`;

  return {
    dominantState,
    trajectorySummary,
    nextDayRiskSummary,
    counts,
    highRiskCount,
    summaryText,
  };
}

export default buildTeamNeuralLoadSummary;
