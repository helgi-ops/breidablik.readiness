import type { OrgTeamSnapshot, OrganizationSummary } from "./types";

function avg(nums: Array<number | null | undefined>): number | null {
  const valid = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function sum(nums: Array<number | null | undefined>): number {
  return nums.reduce<number>((acc, n) => acc + (typeof n === "number" && Number.isFinite(n) ? n : 0), 0);
}

/** Builds one normalized team snapshot for org-level aggregation. */
export function buildOrgTeamSnapshot(input: OrgTeamSnapshot): OrgTeamSnapshot {
  const assigned = input.assignedCount ?? 0;
  const completed = input.completedCount ?? 0;
  const completionRate = assigned > 0 ? completed / assigned : input.completionRate ?? null;

  return {
    ...input,
    completionRate,
    summaryText:
      input.summaryText ??
      `${input.teamName}: ${input.highRiskCount ?? 0} high risk, ${input.pendingReviewCount ?? 0} pending reviews, ${Math.round((completionRate ?? 0) * 100)}% completion.`,
  };
}

/** Aggregates multiple team snapshots into organization summary totals and averages. */
export function buildOrganizationSummary(args: {
  organizationId?: string;
  organizationName?: string;
  teamSnapshots: OrgTeamSnapshot[];
}): OrganizationSummary {
  const teamSnapshots = args.teamSnapshots.map(buildOrgTeamSnapshot);
  const totalTeams = teamSnapshots.length;

  const totalAthletes = sum(teamSnapshots.map((t) => t.athleteCount));
  const totalHighRisk = sum(teamSnapshots.map((t) => t.highRiskCount));
  const totalCriticalRisk = sum(teamSnapshots.map((t) => t.criticalRiskCount));
  const totalRecovery = sum(teamSnapshots.map((t) => t.recoveryCount));
  const totalModified = sum(teamSnapshots.map((t) => t.modifiedCount));
  const totalFull = sum(teamSnapshots.map((t) => t.fullCount));
  const totalHold = sum(teamSnapshots.map((t) => t.holdCount));
  const totalPendingReviews = sum(teamSnapshots.map((t) => t.pendingReviewCount));
  const totalPublished = sum(teamSnapshots.map((t) => t.publishedCount));
  const totalCompleted = sum(teamSnapshots.map((t) => t.completedCount));

  const deliveryCompletionRate = totalPublished > 0 ? totalCompleted / totalPublished : null;
  const orgAttentionCount = teamSnapshots.filter((t) => (t.pendingReviewCount ?? 0) > 0 || (t.criticalRiskCount ?? 0) > 0 || (t.missedCount ?? 0) > 0).length;

  return {
    organizationId: args.organizationId,
    organizationName: args.organizationName,
    totalTeams,
    totalAthletes: totalAthletes || null,
    teamSnapshots,
    averageReadinessScore: avg(teamSnapshots.map((t) => t.averageReadinessScore)),
    averageInjuryRiskScore: avg(teamSnapshots.map((t) => t.averageInjuryRiskScore)),
    averagePerformanceScore: avg(teamSnapshots.map((t) => t.averagePerformanceScore)),
    averageLoadToleranceScore: avg(teamSnapshots.map((t) => t.averageLoadToleranceScore)),
    averageCollapseRiskScore: avg(teamSnapshots.map((t) => t.averageCollapseRiskScore)),
    totalHighRisk,
    totalCriticalRisk,
    totalRecovery,
    totalModified,
    totalFull,
    totalHold,
    totalPendingReviews,
    totalPublished,
    totalCompleted,
    orgAttentionCount,
    deliveryCompletionRate,
    summaryText: `${totalTeams} teams · ${totalCriticalRisk} critical risk · ${totalPendingReviews} pending reviews · ${Math.round((deliveryCompletionRate ?? 0) * 100)}% completion.`,
  };
}
