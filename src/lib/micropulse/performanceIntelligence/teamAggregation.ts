import { clamp } from "./normalize";
import type {
  InjuryRiskBand,
  LoadToleranceBand,
  PerformanceBand,
  PerformanceIntelligenceDecision,
  TeamPerformanceIntelligenceSummary,
} from "./types";

type TeamDecisionInput = Array<{ playerId?: string; playerName?: string; decision: PerformanceIntelligenceDecision }>;

const DEFAULT_RISK_COUNTS: Record<InjuryRiskBand, number> = {
  LOW: 0,
  MODERATE: 0,
  HIGH: 0,
  CRITICAL: 0,
};

const DEFAULT_PERF_COUNTS: Record<PerformanceBand, number> = {
  PEAK: 0,
  READY: 0,
  MANAGEABLE: 0,
  FATIGUED: 0,
  AT_RISK: 0,
};

const DEFAULT_LOAD_COUNTS: Record<LoadToleranceBand, number> = {
  TOLERATES_HIGH: 0,
  TOLERATES_MODERATE: 0,
  TOLERATES_LOW: 0,
  RECOVERY_ONLY: 0,
};

/**
 * Aggregate player-level performance intelligence into a deterministic team summary.
 */
export function buildTeamPerformanceIntelligenceSummary(decisions: TeamDecisionInput): TeamPerformanceIntelligenceSummary {
  const injuryRiskCounts: Record<InjuryRiskBand, number> = { ...DEFAULT_RISK_COUNTS };
  const performanceBandCounts: Record<PerformanceBand, number> = { ...DEFAULT_PERF_COUNTS };
  const loadToleranceCounts: Record<LoadToleranceBand, number> = { ...DEFAULT_LOAD_COUNTS };

  let riskTotal = 0;
  let perfTotal = 0;

  for (const item of decisions) {
    injuryRiskCounts[item.decision.injuryRisk.band] += 1;
    performanceBandCounts[item.decision.performanceForecast.band] += 1;
    loadToleranceCounts[item.decision.loadForecast.band] += 1;
    riskTotal += item.decision.injuryRisk.score;
    perfTotal += item.decision.performanceForecast.score;
  }

  const highRiskPlayers = [...decisions]
    .filter((d) => d.decision.injuryRisk.band === "HIGH" || d.decision.injuryRisk.band === "CRITICAL")
    .sort((a, b) => b.decision.injuryRisk.score - a.decision.injuryRisk.score)
    .slice(0, 8)
    .map((d) => ({
      playerId: d.playerId,
      playerName: d.playerName,
      riskScore: d.decision.injuryRisk.score,
      riskBand: d.decision.injuryRisk.band,
    }));

  const recoveryRecommendedPlayers = [...decisions]
    .filter((d) => d.decision.loadForecast.recommendedAction === "recovery")
    .slice(0, 12)
    .map((d) => ({
      playerId: d.playerId,
      playerName: d.playerName,
      loadBand: d.decision.loadForecast.band,
      recommendedAction: d.decision.loadForecast.recommendedAction,
    }));

  const n = decisions.length || 1;
  const averageRiskScore = clamp(riskTotal / n, 0, 100);
  const averagePerformanceScore = clamp(perfTotal / n, 0, 100);

  const teamSummaryText =
    injuryRiskCounts.CRITICAL > 0
      ? "Team risk profile is elevated with critical cases requiring recovery-first planning."
      : injuryRiskCounts.HIGH > 0
      ? "Team risk profile is moderately elevated; protect high-risk players and control load exposure."
      : performanceBandCounts.PEAK + performanceBandCounts.READY >= Math.ceil(decisions.length * 0.6)
      ? "Most players project as ready; maintain standard plan with targeted monitoring."
      : "Team profile is mixed; use role-based load control and early session check-ins.";

  return {
    injuryRiskCounts,
    performanceBandCounts,
    loadToleranceCounts,
    highRiskPlayers,
    recoveryRecommendedPlayers,
    averageRiskScore,
    averagePerformanceScore,
    teamSummaryText,
  };
}
