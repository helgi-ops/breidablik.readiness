import type { OrgTeamSnapshot, PerformanceOverviewSummary } from "./types";

function top<T>(rows: T[], score: (row: T) => number, limit = 3): T[] {
  return [...rows].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

/** Builds cross-team performance operations summary. */
export function buildPerformanceOverviewSummary(teamSnapshots: OrgTeamSnapshot[]): PerformanceOverviewSummary {
  const teamsWithHighestPeakWindowCount = top(teamSnapshots, (t) => t.peakWindowCount ?? 0).map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    peakWindowCount: team.peakWindowCount ?? 0,
  }));

  const teamsWithHighestInstabilityCount = top(teamSnapshots, (t) => t.unstablePlayerCount ?? 0).map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    unstablePlayerCount: team.unstablePlayerCount ?? 0,
  }));

  const teamsWithHighestModifiedLoad = top(teamSnapshots, (t) => (t.modifiedCount ?? 0) + (t.recoveryCount ?? 0)).map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    modifiedLoadCount: (team.modifiedCount ?? 0) + (team.recoveryCount ?? 0),
  }));

  return {
    teamsWithHighestPeakWindowCount,
    teamsWithHighestInstabilityCount,
    teamsWithHighestModifiedLoad,
    summaryText: `${teamsWithHighestInstabilityCount[0]?.teamName ?? "No team"} has the highest instability load; ${teamsWithHighestPeakWindowCount[0]?.teamName ?? "no team"} has the largest peak-window opportunity.`,
  };
}
