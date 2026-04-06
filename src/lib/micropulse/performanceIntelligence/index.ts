import { buildPerformanceIntelligenceCoachSummary, buildPerformanceIntelligenceExplanationLines } from "./explanations";
import { buildLoadForecastDecision } from "./loadForecast";
import { buildNormalizedPerformanceIntelligenceInput, clamp } from "./normalize";
import { buildPerformanceForecastDecision } from "./performanceModel";
import { buildInjuryRiskDecision } from "./riskModel";
import type { NormalizedPerformanceIntelligenceInput, PerformanceIntelligenceDecision } from "./types";

export type {
  DriverContribution,
  InjuryRiskBand,
  InjuryRiskDecision,
  LoadForecastDecision,
  LoadToleranceBand,
  NormalizedPerformanceIntelligenceInput,
  PerformanceBand,
  PerformanceForecastDecision,
  PerformanceIntelligenceDecision,
  TeamPerformanceIntelligenceSummary,
} from "./types";

export { buildNormalizedPerformanceIntelligenceInput } from "./normalize";
export { buildInjuryRiskDecision, riskBandFromScore, summarizeInjuryRiskBand } from "./riskModel";
export { buildPerformanceForecastDecision } from "./performanceModel";
export { buildLoadForecastDecision } from "./loadForecast";
export { buildPerformanceIntelligenceCoachSummary, buildPerformanceIntelligenceExplanationLines, formatDriverLabel } from "./explanations";
export { buildTeamPerformanceIntelligenceSummary } from "./teamAggregation";
export { buildTeamRiskMap } from "./teamRiskMap";
export { buildWeeklyRiskReport } from "./weeklyReport";
export { buildPlayerRiskTrend } from "./riskTrend";
export { buildTeamOutlook } from "./teamOutlook";
export { buildVolatilityTrend } from "./volatilityTrend";

/**
 * Build an end-to-end deterministic Performance Intelligence decision.
 */
export function buildPerformanceIntelligenceDecision(raw: unknown): PerformanceIntelligenceDecision {
  const input: NormalizedPerformanceIntelligenceInput = buildNormalizedPerformanceIntelligenceInput(raw);
  const injuryRisk = buildInjuryRiskDecision(input);
  const performanceForecast = buildPerformanceForecastDecision(input);
  const loadForecast = buildLoadForecastDecision(input);

  const provisional: PerformanceIntelligenceDecision = {
    injuryRisk,
    performanceForecast,
    loadForecast,
    coachSummary: "",
    explanationLines: [],
    confidence: 0,
  };

  provisional.coachSummary = buildPerformanceIntelligenceCoachSummary(provisional);
  provisional.explanationLines = buildPerformanceIntelligenceExplanationLines(provisional);
  provisional.confidence = clamp((injuryRisk.confidence + performanceForecast.confidence + loadForecast.confidence) / 3, 0, 1);

  return provisional;
}
