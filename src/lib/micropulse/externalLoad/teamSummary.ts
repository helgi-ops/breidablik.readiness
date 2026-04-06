import { buildTeamExternalLoadAlerts, buildTeamExternalLoadCohorts } from "./teamAlerts";
import { buildTeamExternalLoadSummaryLines } from "./teamExplanations";
import { buildTeamExternalLoadPlayerSnapshots, buildTeamExternalLoadTrend } from "./teamSignals";
import type { TeamExternalLoadPlayerInput, TeamExternalLoadSummary } from "./teamTypes";

function deriveTeamState(args: {
  totalPlayers: number;
  availablePlayers: number;
  highCount: number;
  elevatedCount: number;
  sprintCount: number;
  decelCount: number;
  repeatedCount: number;
}): TeamExternalLoadSummary["teamState"] {
  const { totalPlayers, availablePlayers, highCount, elevatedCount, sprintCount, decelCount, repeatedCount } = args;
  if (!totalPlayers || availablePlayers / totalPlayers < 0.5) return "unknown";
  if (highCount >= 7 || highCount / availablePlayers >= 0.4 || repeatedCount >= 4 || elevatedCount >= Math.max(6, Math.ceil(availablePlayers * 0.5))) {
    return "high";
  }
  if (highCount >= 4 || highCount / availablePlayers >= 0.25 || sprintCount >= 4 || decelCount >= 4 || repeatedCount >= 3 || elevatedCount >= Math.max(3, Math.ceil(availablePlayers * 0.3))) {
    return "elevated";
  }
  return "normal";
}

export function buildTeamExternalLoadSummary(args: {
  date: string;
  teamId: string;
  players: TeamExternalLoadPlayerInput[];
}): TeamExternalLoadSummary {
  const snapshots = buildTeamExternalLoadPlayerSnapshots(args.players);
  const counts = {
    totalPlayers: snapshots.length,
    normal: snapshots.filter((snapshot) => snapshot.externalLoadState === "normal").length,
    elevated: snapshots.filter((snapshot) => snapshot.externalLoadState === "elevated").length,
    high: snapshots.filter((snapshot) => snapshot.externalLoadState === "high").length,
    unknown: snapshots.filter((snapshot) => snapshot.externalLoadState === "unknown").length,
  };

  const cohorts = buildTeamExternalLoadCohorts({ snapshots, inputs: args.players });
  const teamState = deriveTeamState({
    totalPlayers: counts.totalPlayers,
    availablePlayers: Math.max(0, counts.totalPlayers - counts.unknown),
    highCount: cohorts.highLoadPlayers.length,
    elevatedCount: cohorts.elevatedLoadPlayers.length,
    sprintCount: cohorts.sprintExposurePlayers.length,
    decelCount: cohorts.decelBurdenPlayers.length,
    repeatedCount: cohorts.repeatedBurdenPlayers.length,
  });
  const trend = buildTeamExternalLoadTrend({
    date: args.date,
    inputs: args.players,
    snapshots,
    teamState,
  });
  const alerts = buildTeamExternalLoadAlerts({
    totalPlayers: counts.totalPlayers,
    teamState,
    cohorts,
  });

  const summary: TeamExternalLoadSummary = {
    date: args.date,
    teamId: args.teamId,
    teamState,
    counts,
    cohorts,
    trend,
    alerts,
    summaryLines: [],
  };

  summary.summaryLines = buildTeamExternalLoadSummaryLines(summary);
  return summary;
}
