import type { PerformanceIntelligenceDecision } from "./types";

export type TeamRiskMapPlayer = {
  playerId?: string;
  playerName?: string;
  riskBand: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  riskScore: number;
  recommendedAction: "full" | "modified" | "recovery";
};

export type TeamRiskMap = {
  lowRisk: TeamRiskMapPlayer[];
  moderateRisk: TeamRiskMapPlayer[];
  highRisk: TeamRiskMapPlayer[];
  criticalRisk: TeamRiskMapPlayer[];
  recoveryRecommended: TeamRiskMapPlayer[];
};

type SourceEntry =
  | PerformanceIntelligenceDecision
  | { playerId?: string; playerName?: string; decision: PerformanceIntelligenceDecision };

/**
 * Group players into deterministic risk map buckets for coach-side visualization.
 */
export function buildTeamRiskMap(players: SourceEntry[]): TeamRiskMap {
  const out: TeamRiskMap = {
    lowRisk: [],
    moderateRisk: [],
    highRisk: [],
    criticalRisk: [],
    recoveryRecommended: [],
  };

  for (const entry of players) {
    const wrapped = "decision" in entry ? entry : { decision: entry };
    const d = wrapped.decision;
    const item: TeamRiskMapPlayer = {
      playerId: wrapped.playerId,
      playerName: wrapped.playerName,
      riskBand: d.injuryRisk.band,
      riskScore: d.injuryRisk.score,
      recommendedAction: d.loadForecast.recommendedAction,
    };

    if (item.riskBand === "LOW") out.lowRisk.push(item);
    else if (item.riskBand === "MODERATE") out.moderateRisk.push(item);
    else if (item.riskBand === "HIGH") out.highRisk.push(item);
    else out.criticalRisk.push(item);

    if (item.recommendedAction === "recovery") out.recoveryRecommended.push(item);
  }

  const byRiskDesc = (a: TeamRiskMapPlayer, b: TeamRiskMapPlayer) => b.riskScore - a.riskScore;
  out.lowRisk.sort(byRiskDesc);
  out.moderateRisk.sort(byRiskDesc);
  out.highRisk.sort(byRiskDesc);
  out.criticalRisk.sort(byRiskDesc);
  out.recoveryRecommended.sort(byRiskDesc);

  return out;
}
