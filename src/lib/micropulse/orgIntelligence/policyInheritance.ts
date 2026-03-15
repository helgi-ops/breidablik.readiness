import type { OrgPolicyInheritanceDecision } from "./types";

function toRecord(obj: unknown): Record<string, unknown> {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : {};
}

/** Resolves org defaults with team overrides while keeping explicit team precedence. */
export function resolveInheritedPolicies<T extends Record<string, unknown>>(orgDefaults: T, teamOverrides?: Partial<T> | null): T {
  return { ...orgDefaults, ...(teamOverrides ?? {}) };
}

export function buildOrgPolicyInheritanceDecision(args: {
  orgDefaults: Record<string, unknown>;
  teamOverrides?: Record<string, unknown> | null;
}): OrgPolicyInheritanceDecision {
  const defaults = toRecord(args.orgDefaults);
  const overrides = toRecord(args.teamOverrides);

  const organizationDefaultsApplied: string[] = [];
  const teamOverridesApplied: string[] = [];
  const unresolvedConflicts: string[] = [];

  const keys = new Set([...Object.keys(defaults), ...Object.keys(overrides)]);
  for (const key of keys) {
    if (!(key in overrides)) {
      organizationDefaultsApplied.push(key);
      continue;
    }
    const dv = defaults[key];
    const ov = overrides[key];
    if (ov === undefined) {
      organizationDefaultsApplied.push(key);
      continue;
    }
    if (typeof dv !== "undefined" && typeof ov !== typeof dv) {
      unresolvedConflicts.push(`${key} type mismatch`);
      continue;
    }
    teamOverridesApplied.push(key);
  }

  return {
    organizationDefaultsApplied,
    teamOverridesApplied,
    unresolvedConflicts,
    summary: `${teamOverridesApplied.length} team override(s), ${organizationDefaultsApplied.length} inherited default(s), ${unresolvedConflicts.length} conflict(s).`,
  };
}

export function summarizePolicyInheritance(decision: OrgPolicyInheritanceDecision): string {
  if (decision.unresolvedConflicts.length > 0) {
    return `Policy conflicts: ${decision.unresolvedConflicts.join(", ")}.`;
  }
  if (decision.teamOverridesApplied.length === 0) {
    return "All team settings inherit organization defaults.";
  }
  return `${decision.teamOverridesApplied.length} team-specific policy overrides active.`;
}
