import type { MicroPulsePlanKey, OrganizationPlanAssignment } from "./types";

const ACTIVE_STATUSES = new Set<NonNullable<OrganizationPlanAssignment["status"]>>(["ACTIVE", "TRIAL"]);

function toEpoch(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isActive(assignment: OrganizationPlanAssignment): boolean {
  if (!assignment.status) return true;
  return ACTIVE_STATUSES.has(assignment.status);
}

function latestByAssignedAt(items: OrganizationPlanAssignment[]): OrganizationPlanAssignment | null {
  if (!items.length) return null;
  return [...items].sort((a, b) => toEpoch(b.assignedAt) - toEpoch(a.assignedAt))[0] ?? null;
}

/**
 * Resolve organization-level assignment (safe fallback is FREE when absent/inactive).
 */
export function resolveOrganizationPlan(assignments: OrganizationPlanAssignment[], organizationId?: string | null): MicroPulsePlanKey {
  const scoped = assignments.filter((item) => !item.teamId && item.organizationId === (organizationId ?? null) && isActive(item));
  return latestByAssignedAt(scoped)?.activePlan ?? "FREE";
}

/**
 * Resolve optional team-level assignment when teams can override org defaults.
 */
export function resolveTeamPlan(assignments: OrganizationPlanAssignment[], teamId?: string | null): MicroPulsePlanKey | null {
  if (!teamId) return null;
  const scoped = assignments.filter((item) => item.teamId === teamId && isActive(item));
  return latestByAssignedAt(scoped)?.activePlan ?? null;
}

/**
 * Resolve effective plan. Team overrides are supported but optional.
 */
export function resolveEffectivePlan(args: {
  assignments: OrganizationPlanAssignment[];
  organizationId?: string | null;
  teamId?: string | null;
  allowTeamOverride?: boolean;
}): MicroPulsePlanKey {
  const orgPlan = resolveOrganizationPlan(args.assignments, args.organizationId);
  if (!args.allowTeamOverride) return orgPlan;
  const teamPlan = resolveTeamPlan(args.assignments, args.teamId);
  return teamPlan ?? orgPlan;
}

export function summarizePlanAssignment(plan: MicroPulsePlanKey, status?: OrganizationPlanAssignment["status"] | null): string {
  const normalizedStatus = status ?? "ACTIVE";
  if (normalizedStatus === "TRIAL") return `${plan} plan (trial)`;
  if (normalizedStatus === "PAST_DUE") return `${plan} plan (past due)`;
  if (normalizedStatus === "INACTIVE") return `${plan} plan (inactive)`;
  return `${plan} plan (active)`;
}
