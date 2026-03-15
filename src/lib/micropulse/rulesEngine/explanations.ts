import type { CoachRule, FinalRecommendationDecision, ManualOverrideDecision, RulesEngineInput } from "./types";

export function buildAppliedRuleExplanation(rule: CoachRule, effectsApplied: string[]): string {
  if (!effectsApplied.length) return `${rule.name} evaluated.`;
  return `${rule.name} applied: ${effectsApplied.join(", ")}.`;
}

export function buildCoachReviewExplanation(args: {
  appliedRules: FinalRecommendationDecision["appliedRules"];
  manualOverride?: ManualOverrideDecision | null;
  input?: RulesEngineInput;
}): { requiresReview: boolean; note: string } {
  if (args.appliedRules.some((rule) => rule.effectsApplied.some((effect) => effect.startsWith("requireCoachReview")))) {
    return { requiresReview: true, note: "Rule-set requires coach review before final confirmation." };
  }
  if (args.manualOverride?.applied) {
    return { requiresReview: true, note: "Manual override applied; confirm rationale before lock." };
  }
  if (args.input?.isProtectedPlayer && args.input?.injuryRiskBand === "HIGH") {
    return { requiresReview: true, note: "Protected player with high risk should be reviewed." };
  }
  return { requiresReview: false, note: "No additional review requirement." };
}

/**
 * Build concise summary distinguishing engine, rule-adjusted, and manual final layers.
 */
export function buildRulesOverrideSummary(args: {
  engineRecommendation: FinalRecommendationDecision["engineRecommendation"];
  finalRecommendation: FinalRecommendationDecision["finalRecommendation"];
  appliedRules: FinalRecommendationDecision["appliedRules"];
  manualOverride?: ManualOverrideDecision | null;
  requiresCoachReview: boolean;
  notes?: string[];
}): string {
  const engine = args.engineRecommendation.action;
  const final = args.finalRecommendation.action;

  if (args.manualOverride?.applied) {
    return `Engine: ${engine}. Rules: ${args.appliedRules.length} applied. Manual override set final action to ${final}${args.manualOverride.reason ? ` (${args.manualOverride.reason})` : ""}.`;
  }

  if (args.appliedRules.length) {
    return `Engine: ${engine}. Rules adjusted final action to ${final}.${args.requiresCoachReview ? " Coach review required." : ""}`;
  }

  return `Final recommendation matches engine action (${final}).`;
}
