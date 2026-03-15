import { buildOrgAttentionQueue } from "./attentionQueue";
import { buildExecutiveSummary } from "./executiveSummary";
import { buildMedicalOverviewSummary } from "./medicalSummary";
import { buildOrganizationSummary } from "./organizationSummary";
import { buildPerformanceOverviewSummary } from "./performanceSummary";
import { buildTeamComparisonRows } from "./teamComparison";
import type {
  OrgPolicyInheritanceDecision,
  OrgReportingView,
  OrgRoleView,
  OrgTeamSnapshot,
  OrganizationSummary,
  RoleSpecificOrgView,
} from "./types";

/** Composes full organization reporting view from aggregated team snapshots. */
export function buildOrgReportingView(args: {
  organizationId?: string;
  organizationName?: string;
  teamSnapshots: OrgTeamSnapshot[];
  policyInheritanceByTeam?: Record<string, OrgPolicyInheritanceDecision>;
}): OrgReportingView {
  const organizationSummary = buildOrganizationSummary({
    organizationId: args.organizationId,
    organizationName: args.organizationName,
    teamSnapshots: args.teamSnapshots,
  });
  const medicalOverview = buildMedicalOverviewSummary(organizationSummary.teamSnapshots);
  const performanceOverview = buildPerformanceOverviewSummary(organizationSummary.teamSnapshots);
  const attentionQueue = buildOrgAttentionQueue({
    teamSnapshots: organizationSummary.teamSnapshots,
    policyInheritanceByTeam: args.policyInheritanceByTeam,
  });
  const executiveSummary = buildExecutiveSummary({ organizationSummary, medicalOverview, performanceOverview, attentionQueue });

  return {
    organizationSummary,
    medicalOverview,
    performanceOverview,
    executiveSummary,
    attentionQueue,
    teamComparisonRows: buildTeamComparisonRows(organizationSummary.teamSnapshots),
    policyInheritanceByTeam: args.policyInheritanceByTeam ?? {},
  };
}

function narrowAttentionForRole(view: OrgReportingView, role: OrgRoleView) {
  if (role === "EXECUTIVE" || role === "ADMIN") return view.attentionQueue;
  if (role === "MEDICAL") {
    return {
      ...view.attentionQueue,
      items: view.attentionQueue.items.filter((i) => i.category === "RISK" || i.category === "STAFF" || i.category === "DELIVERY"),
    };
  }
  if (role === "PERFORMANCE") {
    return {
      ...view.attentionQueue,
      items: view.attentionQueue.items.filter((i) => i.category === "RISK" || i.category === "WORKFLOW" || i.category === "DELIVERY"),
    };
  }
  return {
    ...view.attentionQueue,
    items: view.attentionQueue.items.filter((i) => i.category !== "POLICY"),
  };
}

/** Shapes org reporting output by role without changing underlying deterministic data. */
export function buildRoleSpecificOrgView(role: OrgRoleView, view: OrgReportingView): RoleSpecificOrgView {
  const base: RoleSpecificOrgView = {
    role,
    organizationSummary: view.organizationSummary,
    executiveSummary: view.executiveSummary,
    attentionQueue: narrowAttentionForRole(view, role),
    teamComparisonRows: view.teamComparisonRows,
  };

  if (role === "EXECUTIVE") {
    return base;
  }

  if (role === "MEDICAL") {
    return {
      ...base,
      medicalOverview: view.medicalOverview,
    };
  }

  if (role === "PERFORMANCE" || role === "COACHING") {
    return {
      ...base,
      performanceOverview: view.performanceOverview,
      medicalOverview: role === "PERFORMANCE" ? view.medicalOverview : undefined,
    };
  }

  return {
    ...base,
    medicalOverview: view.medicalOverview,
    performanceOverview: view.performanceOverview,
    policyInheritanceByTeam: view.policyInheritanceByTeam,
  };
}

export function emptyOrgSummary(organizationName = "Organization"): OrganizationSummary {
  return {
    organizationName,
    totalTeams: 0,
    totalAthletes: 0,
    teamSnapshots: [],
    summaryText: "No team data available.",
  };
}
