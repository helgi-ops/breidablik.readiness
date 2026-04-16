import { loadAdminConfigSnapshotFromStorage } from "@/lib/micropulse/adminConfig";
// Session workflow/delivery imports removed (feature removed)
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

/** Loads known teams for org-level reporting. Session workflow data source removed. */
export function loadOrganizationTeams(organizationId?: string): TeamRef[] {
  void organizationId;
  return [{ teamId: "default-team", teamName: "Default Team" }];
}

/** Loads org team snapshots. Session workflow data source removed — returns defaults. */
export function loadOrgTeamSnapshots(organizationId?: string): OrgTeamSnapshot[] {
  void organizationId;
  const teams = loadOrganizationTeams();

  return teams.map((team) => {
    return {
      teamId: team.teamId,
      teamName: team.teamName,
      teamType: team.teamType ?? null,
      athleteCount: 0,
      averageReadinessScore: null,
      averageInjuryRiskScore: null,
      averagePerformanceScore: null,
      averageLoadToleranceScore: null,
      averageCollapseRiskScore: null,
      highRiskCount: 0,
      criticalRiskCount: 0,
      recoveryCount: 0,
      modifiedCount: 0,
      fullCount: 0,
      holdCount: 0,
      generatedDraftCount: 0,
      inReviewCount: 0,
      approvedCount: 0,
      publishedCount: 0,
      assignedCount: 0,
      completedCount: 0,
      missedCount: 0,
      pendingReviewCount: 0,
      protectedPlayerCount: null,
      unstablePlayerCount: null,
      peakWindowCount: null,
      completionRate: null,
      summaryText: `${team.teamName}: no workflow data.`,
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
