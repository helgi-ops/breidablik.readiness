import type { CoachRule, RulesEngineInput } from "./types";

/**
 * Resolve player-scoped rules for individual constraints/protection patterns.
 */
export function getApplicablePlayerRules(input: RulesEngineInput, rules: CoachRule[]): CoachRule[] {
  const playerId = input.playerId ?? null;
  const tags = new Set((input.playerTags ?? []).map((t) => String(t)));

  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.scope !== "PLAYER") return false;

    const playerMatch = !rule.appliesToPlayerIds?.length || (playerId != null && rule.appliesToPlayerIds.includes(playerId));
    const tagMatch = !rule.appliesToTags?.length || rule.appliesToTags.some((tag) => tags.has(tag));

    return playerMatch && tagMatch;
  });
}
