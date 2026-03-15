import { loadAdminConfigSnapshotFromStorage } from "@/lib/micropulse/adminConfig";
import { listAssignmentsForTeam } from "@/lib/micropulse/sessionDelivery";
import { loadAllSessionDraftRecords } from "@/lib/micropulse/sessionWorkflow";
import type { OrgTeamSnapshot } from "./types";

type TeamRef = { teamId: string; teamName: string; teamType?: string | null };

const TEAM_OVERRIDE_KEY = "micropulse.orgTeamOverrides.v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Loads known teams for org-level reporting from current workflow data sources. */
export function loadOrganizationTeams(organizationId?: string): TeamRef[] {
  void organizationId;
  const workflows = loadAllSessionDraftRecords();
  const unique = new Map<string, TeamRef>();
  for (const record of workflows) {
    const teamId = record.teamId ?? "default-team";
    if (!unique.has(teamId)) {
      unique.set(teamId, {
        teamId,
        teamName: teamId === "default-team" ? "Default Team" : `Team ${teamId}`,
      });
    }
  }
  if (unique.size === 0) {
    unique.set("default-team", { teamId: "default-team", teamName: "Default Team" });
  }
  return Array.from(unique.values());
}

/** Loads org team snapshots by grouping existing team workflow + delivery records. */
export function loadOrgTeamSnapshots(organizationId?: string): OrgTeamSnapshot[] {
  void organizationId;
  const teams = loadOrganizationTeams();
  const workflows = loadAllSessionDraftRecords();

  return teams.map((team) => {
    const teamWorkflows = workflows.filter((record) => (record.teamId ?? "default-team") === team.teamId);
    const assignments = listAssignmentsForTeam(team.teamId);

    const actionCounts = teamWorkflows.reduce(
      (acc, record) => {
        const action = record.workingDraft?.draftAction;
        if (action === "FULL") acc.full += 1;
        else if (action === "MODIFIED") acc.modified += 1;
        else if (action === "RECOVERY") acc.recovery += 1;
        else if (action === "HOLD") acc.hold += 1;
        return acc;
      },
      { full: 0, modified: 0, recovery: 0, hold: 0 },
    );

    const publishedCount = teamWorkflows.filter((r) => r.status === "PUBLISHED").length;
    const inReviewCount = teamWorkflows.filter((r) => r.status === "IN_REVIEW").length;
    const approvedCount = teamWorkflows.filter((r) => r.status === "APPROVED").length;
    const generatedDraftCount = teamWorkflows.filter((r) => r.status === "GENERATED").length;

    const assignedCount = assignments.filter((a) => a.assignmentStatus !== "CANCELLED" && a.assignmentStatus !== "UNASSIGNED").length;
    const completedCount = assignments.filter((a) => !!a.completedAt).length;
    const missedCount = assignments.filter((a) => a.assignmentStatus === "MISSED").length;

    const highRiskCount = teamWorkflows.filter((r) => r.workingDraft?.draftAction === "RECOVERY" || r.workingDraft?.draftAction === "HOLD").length;
    const criticalRiskCount = teamWorkflows.filter((r) => r.workingDraft?.draftAction === "HOLD").length;

    return {
      teamId: team.teamId,
      teamName: team.teamName,
      teamType: team.teamType ?? null,
      athleteCount: teamWorkflows.length,
      averageReadinessScore: null,
      averageInjuryRiskScore: null,
      averagePerformanceScore: null,
      averageLoadToleranceScore: null,
      averageCollapseRiskScore: null,
      highRiskCount,
      criticalRiskCount,
      recoveryCount: actionCounts.recovery,
      modifiedCount: actionCounts.modified,
      fullCount: actionCounts.full,
      holdCount: actionCounts.hold,
      generatedDraftCount,
      inReviewCount,
      approvedCount,
      publishedCount,
      assignedCount,
      completedCount,
      missedCount,
      pendingReviewCount: inReviewCount,
      protectedPlayerCount: null,
      unstablePlayerCount: null,
      peakWindowCount: null,
      completionRate: assignedCount > 0 ? completedCount / assignedCount : null,
      summaryText: `${team.teamName}: ${publishedCount} published, ${completedCount} completed, ${inReviewCount} pending review.`,
    } as OrgTeamSnapshot;
  });
}

/** Loads org-wide default policy values from admin config snapshot. */
export function loadOrgPolicies(): Record<string, unknown> {
  const snapshot = loadAdminConfigSnapshotFromStorage();
  return {
    ...snapshot.teamPolicy,
    matchdayTemplates: snapshot.matchdayTemplates,
  };
}

/** Loads team-level override map; placeholder until persistent org/team policy storage exists. */
export function loadTeamOverrides(): Record<string, Record<string, unknown>> {
  if (typeof window === "undefined") return {};
  return safeParse<Record<string, Record<string, unknown>>>(window.localStorage.getItem(TEAM_OVERRIDE_KEY), {});
}

/** Saves team-level org override map in local storage boundary for now. */
export function saveTeamOverrides(overrides: Record<string, Record<string, unknown>>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEAM_OVERRIDE_KEY, JSON.stringify(overrides));
}

export function loadOrgWorkflowSummaries() {
  return loadOrgTeamSnapshots().map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    generatedDraftCount: team.generatedDraftCount ?? 0,
    inReviewCount: team.inReviewCount ?? 0,
    approvedCount: team.approvedCount ?? 0,
    publishedCount: team.publishedCount ?? 0,
  }));
}

export function loadOrgDeliverySummaries() {
  return loadOrgTeamSnapshots().map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    assignedCount: team.assignedCount ?? 0,
    completedCount: team.completedCount ?? 0,
    missedCount: team.missedCount ?? 0,
    completionRate: team.completionRate ?? null,
  }));
}
