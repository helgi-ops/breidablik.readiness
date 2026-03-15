import type { CoachRule, RulesEngineInput } from "./types";

/**
 * Resolve protected-player scoped rules for return-to-play / strategic protection contexts.
 */
export function getApplicableProtectedPlayerRules(input: RulesEngineInput, rules: CoachRule[]): CoachRule[] {
  if (!input.isProtectedPlayer) return [];
  const tags = new Set((input.playerTags ?? []).map((t) => String(t)));

  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.scope !== "PROTECTED_PLAYER") return false;
    if (!rule.appliesToTags?.length) return true;
    return rule.appliesToTags.some((tag) => tags.has(tag));
  });
}
