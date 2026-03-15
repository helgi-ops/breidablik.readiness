import type { PerformanceIntelligenceDecision } from "./types";

export type TeamOutlookBand = "Stable" | "Elevated" | "High Risk";

export type TeamOutlook = {
  teamRiskIndex: number;
  band: TeamOutlookBand;
};

/**
 * Build a simple team outlook from average injury risk score.
 */
export function buildTeamOutlook(decisions: PerformanceIntelligenceDecision[]): TeamOutlook {
  const teamRiskIndex = decisions.length
    ? decisions.reduce((sum, d) => sum + d.injuryRisk.score, 0) / decisions.length
    : 0;

  const band: TeamOutlookBand =
    teamRiskIndex >= 65 ? "High Risk" : teamRiskIndex >= 42 ? "Elevated" : "Stable";

  return {
    teamRiskIndex,
    band,
  };
}
