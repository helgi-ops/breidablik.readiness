import { buildTeamAlerts } from "./alerts";
import { buildTeamRecommendation } from "./recommendations";
import type {
  CoachCommandPlayerSource,
  PlayerDecisionListItem,
  TeamDecisionResponse,
  TeamStatusOverviewData,
} from "./types";

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stateRank(player: PlayerDecisionListItem): number {
  if (player.state === "RED") {
    if (player.riskFlags.includes("injury_risk_high")) return 0;
    if (player.riskFlags.includes("high_acwr")) return 1;
    return 2;
  }
  if (player.state === "YELLOW") return player.riskFlags.length >= 2 ? 3 : 4;
  if (player.state === "GRAY") return player.riskFlags.includes("manual_review") ? 5 : 6;
  return 7;
}

export function mapPlayerRecommendationToListItem(player: CoachCommandPlayerSource): PlayerDecisionListItem {
  return {
    athleteId: player.athleteId,
    athleteName: player.athleteName,
    state: player.recommendation.state,
    sessionMode: player.recommendation.sessionMode,
    loadAdjustment: player.recommendation.loadAdjustment,
    topFlags: player.recommendation.riskFlags.slice(0, 2),
    coachSummary: player.recommendation.coachSummary,
    confidenceScore: player.recommendation.confidence.score,
    confidenceBand: player.recommendation.confidence.band,
    explanationFactors: player.recommendation.explanationFactors.slice(0, 5),
    constraints: player.recommendation.constraints,
    focus: player.recommendation.focus,
    riskFlags: player.recommendation.riskFlags,
    cmjRequired: player.cmjRequired ?? false,
    loadAlerts: player.loadAlerts ?? [],
    fatigueType: player.fatigueType ?? null,
    neuromuscularFatigue: player.neuromuscularFatigue ?? null,
  };
}

export function buildTeamStatusOverview(players: CoachCommandPlayerSource[]): TeamStatusOverviewData {
  const total = players.length;
  const green = players.filter((player) => player.recommendation.state === "GREEN").length;
  const yellow = players.filter((player) => player.recommendation.state === "YELLOW").length;
  const red = players.filter((player) => player.recommendation.state === "RED").length;
  const gray = players.filter((player) => player.recommendation.state === "GRAY").length;
  const validReadinessScores = players
    .map((player) => player.readinessScore)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const modified = players.filter((player) => player.recommendation.sessionMode === "modified").length;
  const recoveryOnly = players.filter((player) => player.recommendation.sessionMode === "recovery").length;
  const pendingReview = players.filter(
    (player) => player.recommendation.state === "GRAY" || player.recommendation.confidence.band === "low"
  ).length;
  const playersWithRiskFlags = players.filter((player) => player.recommendation.riskFlags.length > 0).length;

  return {
    counts: { green, yellow, red, gray, total },
    readinessDistributionPct: {
      green: total ? roundPct((green / total) * 100) : 0,
      yellow: total ? roundPct((yellow / total) * 100) : 0,
      red: total ? roundPct((red / total) * 100) : 0,
      gray: total ? roundPct((gray / total) * 100) : 0,
    },
    averageReadinessScore: average(validReadinessScores),
    playersWithRiskFlags,
    playersModified: modified,
    playersRecoveryOnly: recoveryOnly,
    playersPendingReview: pendingReview,
  };
}

export function buildTeamDecisionResponse(params: {
  date: string;
  generatedAt?: string;
  players: CoachCommandPlayerSource[];
}): TeamDecisionResponse {
  const playerItems = params.players
    .map(mapPlayerRecommendationToListItem)
    .sort((a, b) => {
      const rankDiff = stateRank(a) - stateRank(b);
      if (rankDiff !== 0) return rankDiff;
      if (a.state === "GREEN" || a.state === "YELLOW") {
        const confidenceDiff = b.confidenceScore - a.confidenceScore;
        if (confidenceDiff !== 0) return confidenceDiff;
      }
      return a.athleteName.localeCompare(b.athleteName);
    });

  return {
    date: params.date,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    teamStatusOverview: buildTeamStatusOverview(params.players),
    alerts: buildTeamAlerts(playerItems),
    teamRecommendation: buildTeamRecommendation(playerItems),
    players: playerItems,
  };
}
