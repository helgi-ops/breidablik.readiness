import type { CoachRule, RulesEngineInput } from "./types";

/**
 * Resolve match-context rules for md-day and congestion-specific behavior.
 */
export function getApplicableMatchRules(input: RulesEngineInput, rules: CoachRule[]): CoachRule[] {
  const dayType = input.dayType ?? null;

  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.scope !== "MATCH_CONTEXT") return false;

    if (!rule.conditions.length) return true;
    if (dayType == null) return true;

    return rule.conditions.some((condition) => condition.field === "dayType")
      ? rule.conditions.some((condition) => condition.field === "dayType" && condition.value === dayType)
      : true;
  });
}
