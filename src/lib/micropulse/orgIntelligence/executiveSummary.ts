import type {
  ExecutiveSummary,
  MedicalOverviewSummary,
  OrganizationSummary,
  PerformanceOverviewSummary,
  OrgAttentionQueueSummary,
} from "./types";

/** Builds concise leadership-level summary from org metrics. */
export function buildExecutiveSummary(args: {
  organizationSummary: OrganizationSummary;
  medicalOverview: MedicalOverviewSummary;
  performanceOverview: PerformanceOverviewSummary;
  attentionQueue: OrgAttentionQueueSummary;
}): ExecutiveSummary {
  const org = args.organizationSummary;
  const medical = args.medicalOverview;
  const perf = args.performanceOverview;

  const topSummaryLine = `${org.organizationName ?? "Organization"}: ${org.totalTeams} teams, ${org.totalCriticalRisk ?? 0} critical-risk players, ${Math.round((org.deliveryCompletionRate ?? 0) * 100)}% delivery completion.`;

  const keyPoints = [
    `${medical.totalRecoveryRecommended} players are in recovery recommendation states.`,
    `${org.totalPendingReviews ?? 0} workflow reviews are pending.`,
    perf.summaryText,
  ];

  const risks = [
    (org.totalCriticalRisk ?? 0) > 0 ? `${org.totalCriticalRisk} critical-risk players need immediate oversight.` : "No critical-risk concentration detected.",
    args.attentionQueue.items[0]?.summary ?? "No urgent cross-team bottleneck detected.",
  ];

  const positives = [
    `Completion rate is ${Math.round((org.deliveryCompletionRate ?? 0) * 100)}%.`,
    `${org.totalFull ?? 0} full training recommendations remain active across teams.`,
  ];

  const actionItems = [
    (org.totalPendingReviews ?? 0) > 0 ? "Clear pending review backlog before next training cycle." : "Maintain current review throughput.",
    medical.teamsMostInNeedOfReview[0] ? `Prioritize ${medical.teamsMostInNeedOfReview[0].teamName} for medical-performance review alignment.` : "No team-specific escalation needed.",
  ];

  return {
    organizationName: org.organizationName,
    topSummaryLine,
    keyPoints,
    risks,
    positives,
    actionItems,
  };
}
