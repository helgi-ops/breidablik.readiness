import { buildCatapultReadinessContextFromRows } from "./catapultReadiness";
import type { TeamExternalLoadAlert, TeamExternalLoadCohorts, TeamExternalLoadPlayerSnapshot, TeamExternalLoadPlayerInput } from "./teamTypes";

function recentAvailableDates(historyRows: TeamExternalLoadPlayerInput["historyRows"], limit: number): string[] {
  return Array.from(new Set(historyRows.map((row) => row.date))).sort().slice(-limit);
}

function hasRepeatedBurden(input: TeamExternalLoadPlayerInput): boolean {
  const dates = recentAvailableDates(input.historyRows, 3);
  if (dates.length < 2) return false;

  let highDays = 0;
  let elevatedOrHighDays = 0;
  let severeMechanicalDays = 0;

  for (const date of dates) {
    const context = buildCatapultReadinessContextFromRows({
      rows: input.historyRows.filter((row) => row.date <= date),
      date,
    });
    if (!context.today || context.signals.dataQuality === "insufficient") continue;
    if (context.signals.externalLoadState === "high") highDays += 1;
    if (context.signals.externalLoadState === "high" || context.signals.externalLoadState === "elevated") {
      elevatedOrHighDays += 1;
    }
    if ((context.signals.decelSpike ?? 0) >= 1.3 || (context.signals.hirSpike ?? 0) >= 1.3 || (context.signals.densityStressRatio ?? 0) >= 1.2) {
      severeMechanicalDays += 1;
    }
  }

  return highDays >= 2 || elevatedOrHighDays >= 3 || severeMechanicalDays >= 3;
}

export function buildTeamExternalLoadCohorts(args: {
  snapshots: TeamExternalLoadPlayerSnapshot[];
  inputs: TeamExternalLoadPlayerInput[];
}): TeamExternalLoadCohorts {
  const repeatedIds = new Set(
    args.inputs.filter((input) => hasRepeatedBurden(input)).map((input) => input.playerId),
  );

  return {
    highLoadPlayers: args.snapshots.filter((snapshot) => snapshot.externalLoadState === "high"),
    elevatedLoadPlayers: args.snapshots.filter((snapshot) => snapshot.externalLoadState === "elevated" || snapshot.externalLoadState === "high"),
    sprintExposurePlayers: args.snapshots.filter(
      (snapshot) => (snapshot.band6ExposureRatio ?? 0) >= 1.25 || (snapshot.maxVelocityExposureRatio ?? 0) >= 1.05,
    ),
    decelBurdenPlayers: args.snapshots.filter((snapshot) => (snapshot.decelSpike ?? 0) >= 1.3),
    repeatedBurdenPlayers: args.snapshots.filter((snapshot) => repeatedIds.has(snapshot.playerId)),
    insufficientDataPlayers: args.snapshots.filter(
      (snapshot) => snapshot.externalLoadState === "unknown" || snapshot.dataQuality === "insufficient",
    ),
  };
}

export function buildTeamExternalLoadAlerts(args: {
  totalPlayers: number;
  teamState: "normal" | "elevated" | "high" | "unknown";
  cohorts: TeamExternalLoadCohorts;
}): TeamExternalLoadAlert[] {
  const { totalPlayers, teamState, cohorts } = args;
  const alerts: TeamExternalLoadAlert[] = [];

  if (teamState === "unknown") {
    alerts.push({
      code: "catapult_coverage_partial",
      severity: "info",
      title: "Catapult coverage is limited today.",
      body: "Use today’s external-load picture as supporting context rather than a full team read.",
      playerIds: cohorts.insufficientDataPlayers.map((player) => player.playerId),
    });
    return alerts;
  }

  if (cohorts.repeatedBurdenPlayers.length >= 3) {
    alerts.push({
      code: "catapult_repeated_burden",
      severity: cohorts.repeatedBurdenPlayers.length >= 5 ? "high" : "moderate",
      title: "Repeated high external load observed in a small player cohort.",
      body: "Several players have carried elevated burden across multiple recent Catapult days.",
      playerIds: cohorts.repeatedBurdenPlayers.map((player) => player.playerId),
    });
  }

  const highShare = totalPlayers > 0 ? cohorts.highLoadPlayers.length / totalPlayers : 0;
  if (cohorts.highLoadPlayers.length >= 7 || highShare >= 0.4) {
    alerts.push({
      code: "catapult_broad_high_load",
      severity: "high",
      title: "External load is high across a larger group today.",
      body: "Multiple players are carrying clearly elevated external load into today’s decision window.",
      playerIds: cohorts.highLoadPlayers.map((player) => player.playerId),
    });
  } else if (cohorts.highLoadPlayers.length >= 4 || highShare >= 0.25 || teamState === "elevated") {
    alerts.push({
      code: "catapult_elevated_cluster",
      severity: "moderate",
      title: "External load elevated across multiple players today.",
      body: "A meaningful cohort is above recent external-load norms and may need tighter load management.",
      playerIds: cohorts.elevatedLoadPlayers.map((player) => player.playerId),
    });
  }

  if (cohorts.sprintExposurePlayers.length >= 4) {
    alerts.push({
      code: "catapult_sprint_cluster",
      severity: cohorts.sprintExposurePlayers.length >= 6 ? "high" : "moderate",
      title: "Sprint exposure cluster detected.",
      body: "Part of the squad is carrying higher-than-typical sprint or top-speed exposure.",
      playerIds: cohorts.sprintExposurePlayers.map((player) => player.playerId),
    });
  }

  if (cohorts.decelBurdenPlayers.length >= 4) {
    alerts.push({
      code: "catapult_decel_cluster",
      severity: cohorts.decelBurdenPlayers.length >= 6 ? "high" : "moderate",
      title: "Deceleration burden elevated across the group.",
      body: "Braking and eccentric stress are elevated across several players today.",
      playerIds: cohorts.decelBurdenPlayers.map((player) => player.playerId),
    });
  }

  if (!alerts.length) {
    alerts.push({
      code: "catapult_within_range",
      severity: "info",
      title: "External load mostly within expected team range.",
      body: "Most available Catapult profiles are sitting near their recent external-load norms.",
      playerIds: [],
    });
  }

  return alerts.slice(0, 3);
}
