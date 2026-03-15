import type {
  OrgAttentionItem,
  OrgAttentionQueueSummary,
  OrgPolicyInheritanceDecision,
  OrgTeamSnapshot,
} from "./types";

function itemId(teamId: string, category: string) {
  return `org-attn:${teamId}:${category}`;
}

/** Builds prioritized org-wide attention queue from team snapshots and policy conflicts. */
export function buildOrgAttentionQueue(args: {
  teamSnapshots: OrgTeamSnapshot[];
  policyInheritanceByTeam?: Record<string, OrgPolicyInheritanceDecision>;
}): OrgAttentionQueueSummary {
  const items: OrgAttentionItem[] = [];

  for (const team of args.teamSnapshots) {
    const critical = team.criticalRiskCount ?? 0;
    const pendingReviews = team.pendingReviewCount ?? 0;
    const completionRate = team.completionRate ?? null;

    if (critical > 0) {
      items.push({
        id: itemId(team.teamId, "risk"),
        teamId: team.teamId,
        teamName: team.teamName,
        category: "RISK",
        severity: critical >= 3 ? "CRITICAL" : "HIGH",
        title: "Critical risk concentration",
        summary: `${critical} critical-risk players in ${team.teamName}.`,
      });
    }

    if (pendingReviews > 0) {
      items.push({
        id: itemId(team.teamId, "workflow"),
        teamId: team.teamId,
        teamName: team.teamName,
        category: "WORKFLOW",
        severity: pendingReviews >= 5 ? "HIGH" : "MODERATE",
        title: "Review bottleneck",
        summary: `${pendingReviews} pending reviews in ${team.teamName}.`,
      });
    }

    if (completionRate != null && completionRate < 0.6) {
      items.push({
        id: itemId(team.teamId, "delivery"),
        teamId: team.teamId,
        teamName: team.teamName,
        category: "DELIVERY",
        severity: completionRate < 0.4 ? "HIGH" : "MODERATE",
        title: "Low delivery completion",
        summary: `${Math.round(completionRate * 100)}% completion in ${team.teamName}.`,
      });
    }

    const policy = args.policyInheritanceByTeam?.[team.teamId];
    if (policy && policy.unresolvedConflicts.length > 0) {
      items.push({
        id: itemId(team.teamId, "policy"),
        teamId: team.teamId,
        teamName: team.teamName,
        category: "POLICY",
        severity: "MODERATE",
        title: "Policy conflict",
        summary: policy.unresolvedConflicts.join(", "),
      });
    }
  }

  const severityWeight: Record<OrgAttentionItem["severity"], number> = {
    LOW: 1,
    MODERATE: 2,
    HIGH: 3,
    CRITICAL: 4,
  };

  items.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity] || a.title.localeCompare(b.title));

  const countsBySeverity: Record<string, number> = {
    LOW: items.filter((i) => i.severity === "LOW").length,
    MODERATE: items.filter((i) => i.severity === "MODERATE").length,
    HIGH: items.filter((i) => i.severity === "HIGH").length,
    CRITICAL: items.filter((i) => i.severity === "CRITICAL").length,
  };

  return {
    items,
    countsBySeverity,
    summaryText: `${countsBySeverity.CRITICAL} critical, ${countsBySeverity.HIGH} high, ${countsBySeverity.MODERATE} moderate org attention items.`,
  };
}
