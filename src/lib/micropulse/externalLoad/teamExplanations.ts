import type { TeamExternalLoadSummary } from "./teamTypes";

export function buildTeamExternalLoadSummaryLines(summary: TeamExternalLoadSummary): string[] {
  if (summary.teamState === "unknown") {
    return ["Catapult coverage is partial today."];
  }

  const lines: string[] = [];

  if (summary.cohorts.repeatedBurdenPlayers.length >= 3) {
    lines.push("Recent external load remains high in a repeated-burden cohort.");
  }

  if (summary.teamState === "high") {
    lines.push("External load is high across a meaningful part of the squad.");
  } else if (summary.teamState === "elevated") {
    lines.push("External load is elevated in a small cohort today.");
  } else {
    lines.push("Most players are within expected recent external load range.");
  }

  if (summary.cohorts.decelBurdenPlayers.length >= 4) {
    lines.push("Deceleration burden is elevated across several players.");
  } else if (summary.cohorts.sprintExposurePlayers.length >= 4) {
    lines.push("Sprint exposure is higher than usual across part of the squad.");
  }

  if (summary.trend.playerLoadTrend === "up") {
    lines.push("Team external load is trending upward versus recent days.");
  }

  return lines.slice(0, 3);
}
