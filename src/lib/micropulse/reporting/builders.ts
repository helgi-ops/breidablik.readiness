import {
  buildOrgPolicyInheritanceDecision,
  buildOrgReportingView,
  loadOrgPolicies,
  loadOrgTeamSnapshots,
  loadTeamOverrides,
  type OrgReportingView,
} from "@/lib/micropulse/orgIntelligence";
import { listAssignmentsForTeam } from "@/lib/micropulse/sessionDelivery";
import { loadAllSessionDraftRecords } from "@/lib/micropulse/sessionWorkflow";
import { getReportTemplate } from "./templates";
import type { ReportBuildContext, ReportDocument, ReportTemplateKey } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function reportId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
}

function makeOrgView(ctx: ReportBuildContext): OrgReportingView {
  const snapshots = loadOrgTeamSnapshots(ctx.organizationId ?? undefined);
  const defaults = loadOrgPolicies();
  const overrides = loadTeamOverrides();
  const policyInheritanceByTeam = Object.fromEntries(
    snapshots.map((team) => [
      team.teamId,
      buildOrgPolicyInheritanceDecision({ orgDefaults: defaults, teamOverrides: overrides[team.teamId] ?? null }),
    ]),
  );

  return buildOrgReportingView({
    organizationId: ctx.organizationId ?? undefined,
    organizationName: ctx.organizationName ?? undefined,
    teamSnapshots: snapshots,
    policyInheritanceByTeam,
  });
}

function section(id: string, title: string, kind: "TEXT" | "METRIC_GRID" | "TABLE" | "LIST", data: unknown) {
  return { id, title, kind, data };
}

/** Team-level daily summary document builder for coaching audience. */
export function buildTeamDailySummaryReport(ctx: ReportBuildContext): ReportDocument {
  const view = makeOrgView(ctx);
  const team = view.organizationSummary.teamSnapshots.find((t) => t.teamId === (ctx.teamId ?? t.teamId)) ?? view.organizationSummary.teamSnapshots[0];
  const tpl = getReportTemplate("TEAM_DAILY_SUMMARY");

  return {
    id: reportId("report"),
    templateKey: tpl.key,
    title: tpl.titleBuilder({ teamName: ctx.teamName ?? team?.teamName, date: ctx.generatedForDate }),
    audience: tpl.audience,
    scope: tpl.defaultScope,
    generatedAt: nowIso(),
    generatedForDate: ctx.generatedForDate ?? nowIso().slice(0, 10),
    organizationId: ctx.organizationId ?? null,
    teamId: team?.teamId ?? ctx.teamId ?? null,
    summaryLine: team?.summaryText ?? "No team summary available.",
    keyPoints: [
      `Drafts published: ${team?.publishedCount ?? 0}`,
      `Pending reviews: ${team?.pendingReviewCount ?? 0}`,
      `Completion rate: ${Math.round((team?.completionRate ?? 0) * 100)}%`,
    ],
    sections: [
      section("team-metrics", "Team metrics", "METRIC_GRID", team ?? null),
      section("attention", "Org attention", "LIST", view.attentionQueue.items.filter((i) => i.teamId === team?.teamId).slice(0, 8)),
    ],
    exportFormats: tpl.recommendedFormats,
    metadata: { templateIntent: tpl.sectionIntent },
  };
}

export function buildTeamWeeklySummaryReport(ctx: ReportBuildContext): ReportDocument {
  const daily = buildTeamDailySummaryReport(ctx);
  return {
    ...daily,
    id: reportId("report"),
    templateKey: "TEAM_WEEKLY_SUMMARY",
    title: getReportTemplate("TEAM_WEEKLY_SUMMARY").titleBuilder({ teamName: ctx.teamName ?? "Team" }),
    keyPoints: [
      ...daily.keyPoints,
      "Weekly cadence: include trend review and backlog closure.",
    ],
  };
}

export function buildMedicalRiskReport(ctx: ReportBuildContext): ReportDocument {
  const view = makeOrgView(ctx);
  const tpl = getReportTemplate("MEDICAL_RISK_REPORT");
  return {
    id: reportId("report"),
    templateKey: tpl.key,
    title: tpl.titleBuilder({ organizationName: ctx.organizationName ?? view.organizationSummary.organizationName }),
    audience: tpl.audience,
    scope: tpl.defaultScope,
    generatedAt: nowIso(),
    generatedForDate: ctx.generatedForDate ?? nowIso().slice(0, 10),
    organizationId: ctx.organizationId ?? null,
    summaryLine: view.medicalOverview.summaryText,
    keyPoints: [
      `High risk: ${view.medicalOverview.totalHighRiskPlayers}`,
      `Critical risk: ${view.medicalOverview.totalCriticalRiskPlayers}`,
      `Recovery recommended: ${view.medicalOverview.totalRecoveryRecommended}`,
    ],
    sections: [
      section("medical-overview", "Medical overview", "METRIC_GRID", view.medicalOverview),
      section("teams-needing-review", "Teams needing review", "TABLE", view.medicalOverview.teamsMostInNeedOfReview),
      section("attention", "Medical attention items", "LIST", view.attentionQueue.items.filter((i) => i.category === "RISK")),
    ],
    exportFormats: tpl.recommendedFormats,
    metadata: { templateIntent: tpl.sectionIntent },
  };
}

export function buildPerformanceOverviewReport(ctx: ReportBuildContext): ReportDocument {
  const view = makeOrgView(ctx);
  const tpl = getReportTemplate("PERFORMANCE_OVERVIEW");
  return {
    id: reportId("report"),
    templateKey: tpl.key,
    title: tpl.titleBuilder({ organizationName: ctx.organizationName ?? view.organizationSummary.organizationName }),
    audience: tpl.audience,
    scope: tpl.defaultScope,
    generatedAt: nowIso(),
    generatedForDate: ctx.generatedForDate ?? nowIso().slice(0, 10),
    organizationId: ctx.organizationId ?? null,
    summaryLine: view.performanceOverview.summaryText,
    keyPoints: [
      `Top peak window team: ${view.performanceOverview.teamsWithHighestPeakWindowCount[0]?.teamName ?? "-"}`,
      `Top instability team: ${view.performanceOverview.teamsWithHighestInstabilityCount[0]?.teamName ?? "-"}`,
    ],
    sections: [
      section("performance-overview", "Performance overview", "METRIC_GRID", view.performanceOverview),
      section("team-comparison", "Team comparison", "TABLE", view.teamComparisonRows),
    ],
    exportFormats: tpl.recommendedFormats,
    metadata: { templateIntent: tpl.sectionIntent },
  };
}

export function buildExecutiveWeeklyBrief(ctx: ReportBuildContext): ReportDocument {
  const view = makeOrgView(ctx);
  const tpl = getReportTemplate("EXECUTIVE_WEEKLY_BRIEF");
  return {
    id: reportId("report"),
    templateKey: tpl.key,
    title: tpl.titleBuilder({ organizationName: ctx.organizationName ?? view.organizationSummary.organizationName }),
    audience: tpl.audience,
    scope: tpl.defaultScope,
    generatedAt: nowIso(),
    generatedForDate: ctx.generatedForDate ?? nowIso().slice(0, 10),
    organizationId: ctx.organizationId ?? null,
    summaryLine: view.executiveSummary.topSummaryLine,
    keyPoints: [...view.executiveSummary.keyPoints],
    sections: [
      section("executive-risks", "Risks", "LIST", view.executiveSummary.risks),
      section("executive-positives", "Positives", "LIST", view.executiveSummary.positives),
      section("executive-actions", "Action items", "LIST", view.executiveSummary.actionItems),
    ],
    exportFormats: tpl.recommendedFormats,
    metadata: { templateIntent: tpl.sectionIntent },
  };
}

export function buildOrgMultiTeamSummaryReport(ctx: ReportBuildContext): ReportDocument {
  const view = makeOrgView(ctx);
  const tpl = getReportTemplate("ORG_MULTI_TEAM_SUMMARY");

  return {
    id: reportId("report"),
    templateKey: tpl.key,
    title: tpl.titleBuilder({ organizationName: ctx.organizationName ?? view.organizationSummary.organizationName }),
    audience: tpl.audience,
    scope: tpl.defaultScope,
    generatedAt: nowIso(),
    generatedForDate: ctx.generatedForDate ?? nowIso().slice(0, 10),
    organizationId: ctx.organizationId ?? null,
    summaryLine: view.organizationSummary.summaryText,
    keyPoints: [
      `Teams: ${view.organizationSummary.totalTeams}`,
      `High risk total: ${view.organizationSummary.totalHighRisk ?? 0}`,
      `Pending reviews: ${view.organizationSummary.totalPendingReviews ?? 0}`,
    ],
    sections: [
      section("org-summary", "Organization summary", "METRIC_GRID", view.organizationSummary),
      section("team-comparison", "Team comparison", "TABLE", view.teamComparisonRows),
      section("attention", "Attention queue", "LIST", view.attentionQueue.items),
    ],
    exportFormats: tpl.recommendedFormats,
    metadata: { templateIntent: tpl.sectionIntent },
  };
}

export function buildDeliveryWorkflowReport(ctx: ReportBuildContext): ReportDocument {
  const tpl = getReportTemplate("DELIVERY_WORKFLOW_REPORT");
  const workflows = loadAllSessionDraftRecords();
  const assignments = listAssignmentsForTeam(ctx.teamId ?? undefined);

  const pendingReviews = workflows.filter((w) => w.status === "IN_REVIEW").length;
  const published = workflows.filter((w) => w.status === "PUBLISHED").length;
  const completed = assignments.filter((a) => !!a.completedAt).length;

  return {
    id: reportId("report"),
    templateKey: tpl.key,
    title: tpl.titleBuilder({ organizationName: ctx.organizationName }),
    audience: tpl.audience,
    scope: ctx.teamId ? "TEAM" : tpl.defaultScope,
    generatedAt: nowIso(),
    generatedForDate: ctx.generatedForDate ?? nowIso().slice(0, 10),
    organizationId: ctx.organizationId ?? null,
    teamId: ctx.teamId ?? null,
    summaryLine: `${pendingReviews} pending reviews · ${published} published workflows · ${completed} completed deliveries.`,
    keyPoints: [
      `Pending reviews: ${pendingReviews}`,
      `Published workflows: ${published}`,
      `Completed deliveries: ${completed}`,
    ],
    sections: [
      section("workflow", "Workflow records", "TABLE", workflows.slice(0, 50)),
      section("delivery", "Delivery records", "TABLE", assignments.slice(0, 50)),
    ],
    exportFormats: tpl.recommendedFormats,
    metadata: { templateIntent: tpl.sectionIntent },
  };
}

export function buildReportDocument(templateKey: ReportTemplateKey, ctx: ReportBuildContext): ReportDocument {
  switch (templateKey) {
    case "TEAM_DAILY_SUMMARY":
      return buildTeamDailySummaryReport(ctx);
    case "TEAM_WEEKLY_SUMMARY":
      return buildTeamWeeklySummaryReport(ctx);
    case "MEDICAL_RISK_REPORT":
      return buildMedicalRiskReport(ctx);
    case "PERFORMANCE_OVERVIEW":
      return buildPerformanceOverviewReport(ctx);
    case "EXECUTIVE_WEEKLY_BRIEF":
      return buildExecutiveWeeklyBrief(ctx);
    case "ORG_MULTI_TEAM_SUMMARY":
      return buildOrgMultiTeamSummaryReport(ctx);
    case "DELIVERY_WORKFLOW_REPORT":
      return buildDeliveryWorkflowReport(ctx);
    default:
      return buildOrgMultiTeamSummaryReport(ctx);
  }
}
