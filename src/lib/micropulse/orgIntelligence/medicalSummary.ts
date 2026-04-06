import type { MedicalOverviewSummary, OrgTeamSnapshot } from "./types";

/** Builds a medical-focused cross-team operational summary. */
export function buildMedicalOverviewSummary(teamSnapshots: OrgTeamSnapshot[]): MedicalOverviewSummary {
  const totalHighRiskPlayers = teamSnapshots.reduce((acc, team) => acc + (team.highRiskCount ?? 0), 0);
  const totalCriticalRiskPlayers = teamSnapshots.reduce((acc, team) => acc + (team.criticalRiskCount ?? 0), 0);
  const totalRecoveryRecommended = teamSnapshots.reduce((acc, team) => acc + (team.recoveryCount ?? 0), 0);

  const teamsMostInNeedOfReview = [...teamSnapshots]
    .map((team) => ({ teamId: team.teamId, teamName: team.teamName, pendingReviewCount: team.pendingReviewCount ?? 0 }))
    .sort((a, b) => b.pendingReviewCount - a.pendingReviewCount)
    .slice(0, 3);

  return {
    totalHighRiskPlayers,
    totalCriticalRiskPlayers,
    totalRecoveryRecommended,
    teamsMostInNeedOfReview,
    summaryText: `${totalCriticalRiskPlayers} critical-risk players across org. ${teamsMostInNeedOfReview[0]?.teamName ?? "No team"} has the highest pending review load.`,
  };
}
