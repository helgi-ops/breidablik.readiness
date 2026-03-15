import type { CoachRule, RulesEngineInput } from "./types";

/**
 * Return team-scoped enabled rules that apply to current input context.
 */
export function getApplicableTeamRules(input: RulesEngineInput, rules: CoachRule[]): CoachRule[] {
  const teamId = input.teamId ?? null;
  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.scope !== "TEAM" && rule.scope !== "GLOBAL" && rule.scope !== "ORGANIZATION") return false;
    if (!rule.appliesToTeamIds?.length) return true;
    if (!teamId) return false;
    return rule.appliesToTeamIds.includes(teamId);
  });
}

export function filterEnabledTeamRules(rules: CoachRule[]): CoachRule[] {
  return rules.filter((rule) => rule.enabled && (rule.scope === "TEAM" || rule.scope === "GLOBAL" || rule.scope === "ORGANIZATION"));
}
