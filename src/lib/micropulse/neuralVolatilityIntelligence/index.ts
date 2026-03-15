import { buildCollapseRiskDecision } from "./collapseRisk";
import { buildNeuralVolatilityCoachSummary, buildNeuralVolatilityExplanationLines } from "./explanations";
import { buildFatigueAccumulationDecision } from "./fatigueAccumulation";
import { buildInstabilityWindowDecision } from "./instabilityWindow";
import { buildNormalizedNeuralVolatilityInput, clamp } from "./normalize";
import { buildPeakWindowDecision } from "./peakWindow";
import { buildTrendStateDecision } from "./trendState";
import type { NeuralVolatilityIntelligenceDecision, NormalizedNeuralVolatilityInput } from "./types";

export type {
  CollapseRiskBand,
  CollapseRiskDecision,
  DriverContribution,
  FatigueAccumulationBand,
  FatigueAccumulationDecision,
  InstabilityWindowBand,
  InstabilityWindowDecision,
  NeuralVolatilityIntelligenceDecision,
  NormalizedNeuralVolatilityInput,
  NvSessionMode,
  NvState,
  PeakWindowBand,
  PeakWindowDecision,
  TeamNeuralVolatilitySummary,
  TrendDirection,
  TrendStateDecision,
} from "./types";

export { buildNormalizedNeuralVolatilityInput, toFiniteNumber, clamp, sanitizeHistory, deriveConfidence } from "./normalize";
export { buildFatigueAccumulationDecision } from "./fatigueAccumulation";
export { buildInstabilityWindowDecision } from "./instabilityWindow";
export { buildCollapseRiskDecision } from "./collapseRisk";
export { buildPeakWindowDecision } from "./peakWindow";
export { buildTrendStateDecision } from "./trendState";
export { buildNeuralVolatilityCoachSummary, buildNeuralVolatilityExplanationLines, formatNeuralVolatilityDriverLabel } from "./explanations";
export { buildTeamNeuralVolatilitySummary } from "./teamAggregation";

/**
 * Build deterministic neural+volatility intelligence on top of existing readiness/PI signals.
 */
export function buildNeuralVolatilityIntelligenceDecision(raw: unknown): NeuralVolatilityIntelligenceDecision {
  const input: NormalizedNeuralVolatilityInput = buildNormalizedNeuralVolatilityInput(raw);
  const fatigueAccumulation = buildFatigueAccumulationDecision(input);
  const instabilityWindow = buildInstabilityWindowDecision(input);
  const trendState = buildTrendStateDecision(input);
  const collapseRisk = buildCollapseRiskDecision(input, fatigueAccumulation, instabilityWindow, trendState);
  const peakWindow = buildPeakWindowDecision(input, fatigueAccumulation, instabilityWindow, collapseRisk, trendState);

  const decision: NeuralVolatilityIntelligenceDecision = {
    fatigueAccumulation,
    instabilityWindow,
    collapseRisk,
    peakWindow,
    trendState,
    coachSummary: "",
    explanationLines: [],
    confidence: 0,
  };

  decision.coachSummary = buildNeuralVolatilityCoachSummary(decision);
  decision.explanationLines = buildNeuralVolatilityExplanationLines(decision);
  decision.confidence = clamp(
    (fatigueAccumulation.confidence + instabilityWindow.confidence + collapseRisk.confidence + peakWindow.confidence + trendState.confidence) / 5,
    0,
    1,
  );

  return decision;
}
