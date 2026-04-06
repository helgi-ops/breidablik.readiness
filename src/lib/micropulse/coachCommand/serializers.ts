import type { PlayerDecisionListItem, TeamDecisionResponse } from "./types";

function roundNullable(value: number | null, decimals = 2): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const power = 10 ** decimals;
  return Math.round(value * power) / power;
}

export function serializePlayerDecisionListItem(player: PlayerDecisionListItem): PlayerDecisionListItem {
  return {
    ...player,
    loadAdjustment: roundNullable(player.loadAdjustment, 2),
    confidenceScore: roundNullable(player.confidenceScore, 2) ?? 0,
    explanationFactors: player.explanationFactors.map((factor) => ({
      ...factor,
      impactScore: roundNullable(factor.impactScore, 0) ?? 0,
    })),
  };
}

export function serializeTeamDecisionResponse(response: TeamDecisionResponse): TeamDecisionResponse {
  return {
    ...response,
    teamStatusOverview: {
      ...response.teamStatusOverview,
      averageReadinessScore: roundNullable(response.teamStatusOverview.averageReadinessScore, 1),
      readinessDistributionPct: {
        green: roundNullable(response.teamStatusOverview.readinessDistributionPct.green, 1) ?? 0,
        yellow: roundNullable(response.teamStatusOverview.readinessDistributionPct.yellow, 1) ?? 0,
        red: roundNullable(response.teamStatusOverview.readinessDistributionPct.red, 1) ?? 0,
        gray: roundNullable(response.teamStatusOverview.readinessDistributionPct.gray, 1) ?? 0,
      },
    },
    teamRecommendation: {
      ...response.teamRecommendation,
      loadAdjustmentSuggestion: roundNullable(response.teamRecommendation.loadAdjustmentSuggestion, 2),
    },
    players: response.players.map(serializePlayerDecisionListItem),
  };
}
