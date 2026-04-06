import type { OrgTeamSnapshot, TeamComparisonMetricKey, TeamComparisonRow } from "./types";

function metricValue(team: OrgTeamSnapshot, metric: TeamComparisonMetricKey): number | null {
  switch (metric) {
    case "READINESS":
      return team.averageReadinessScore ?? null;
    case "INJURY_RISK":
      return team.averageInjuryRiskScore ?? null;
    case "PERFORMANCE":
      return team.averagePerformanceScore ?? null;
    case "LOAD_TOLERANCE":
      return team.averageLoadToleranceScore ?? null;
    case "COLLAPSE_RISK":
      return team.averageCollapseRiskScore ?? null;
    case "COMPLETION_RATE":
      return team.completionRate ?? null;
    case "PENDING_REVIEWS":
      return team.pendingReviewCount ?? null;
    case "HIGH_RISK_COUNT":
      return team.highRiskCount ?? null;
    case "RECOVERY_COUNT":
      return team.recoveryCount ?? null;
    default:
      return null;
  }
}

/** Builds row-oriented team comparison values across key org metrics. */
export function buildTeamComparisonRows(teams: OrgTeamSnapshot[]): TeamComparisonRow[] {
  return teams.map((team) => {
    const metricValues: Record<string, number | null> = {
      READINESS: metricValue(team, "READINESS"),
      INJURY_RISK: metricValue(team, "INJURY_RISK"),
      PERFORMANCE: metricValue(team, "PERFORMANCE"),
      LOAD_TOLERANCE: metricValue(team, "LOAD_TOLERANCE"),
      COLLAPSE_RISK: metricValue(team, "COLLAPSE_RISK"),
      COMPLETION_RATE: metricValue(team, "COMPLETION_RATE"),
      PENDING_REVIEWS: metricValue(team, "PENDING_REVIEWS"),
      HIGH_RISK_COUNT: metricValue(team, "HIGH_RISK_COUNT"),
      RECOVERY_COUNT: metricValue(team, "RECOVERY_COUNT"),
    };
    return {
      teamId: team.teamId,
      teamName: team.teamName,
      metricValues,
      comparisonSummary: `${team.teamName}: risk ${team.highRiskCount ?? 0}/${team.criticalRiskCount ?? 0} · completion ${Math.round(((team.completionRate ?? 0) * 100))}%`,
    };
  });
}

export function rankTeamsByMetric(rows: TeamComparisonRow[], metric: TeamComparisonMetricKey, direction: "asc" | "desc" = "desc"): TeamComparisonRow[] {
  return [...rows].sort((a, b) => {
    const av = a.metricValues[metric] ?? Number.NaN;
    const bv = b.metricValues[metric] ?? Number.NaN;
    if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
    if (!Number.isFinite(av)) return 1;
    if (!Number.isFinite(bv)) return -1;
    return direction === "desc" ? bv - av : av - bv;
  });
}

export function summarizeTeamComparison(rows: TeamComparisonRow[], metric: TeamComparisonMetricKey): string {
  const ranked = rankTeamsByMetric(rows, metric, "desc");
  const leader = ranked[0];
  if (!leader) return "No team data available.";
  const value = leader.metricValues[metric];
  if (value == null) return `No valid ${metric} data available.`;
  return `${leader.teamName} leads ${metric.toLowerCase().replaceAll("_", " ")} at ${typeof value === "number" ? value.toFixed(2) : value}.`;
}
