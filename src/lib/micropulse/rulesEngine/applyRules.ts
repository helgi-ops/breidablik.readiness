import type { ExposureGuidanceTag, MatchContextTag, RecoveryFocusTag } from "@/lib/micropulse/prescriptionEngine";
import { DEFAULT_COACH_RULES } from "./defaultRules";
import { buildAppliedRuleExplanation, buildCoachReviewExplanation, buildRulesOverrideSummary } from "./explanations";
import { applyManualOverride } from "./manualOverride";
import { getApplicableMatchRules } from "./matchRules";
import { getApplicablePlayerRules } from "./playerRules";
import { getApplicableProtectedPlayerRules } from "./protectedPlayerRules";
import { getApplicableTeamRules } from "./teamRules";
import type {
  AppliedRuleResult,
  CoachRule,
  FinalRecommendationDecision,
  ManualOverrideDecision,
  RuleCondition,
  RuleEffect,
  RulesEngineInput,
  TeamRulesSummary,
  TrainingAction,
} from "./types";

const ACTION_SEVERITY: Record<TrainingAction, number> = {
  FULL: 0,
  MODIFIED: 1,
  RECOVERY: 2,
  HOLD: 3,
};

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Clone recommendation to guarantee original engine decision remains unchanged. */
export function clonePrescriptionDecision(input: RulesEngineInput["prescriptionDecision"]) {
  if (!input) return null;
  return {
    ...input,
    exposureGuidance: [...input.exposureGuidance],
    recoveryFocus: [...input.recoveryFocus],
    matchContext: [...input.matchContext],
    primaryDrivers: [...input.primaryDrivers],
    secondaryDrivers: [...input.secondaryDrivers],
  };
}

export function compareRecommendationSeverity(a: TrainingAction, b: TrainingAction): number {
  return ACTION_SEVERITY[a] - ACTION_SEVERITY[b];
}

function resolveFieldValue(input: RulesEngineInput, field: RuleCondition["field"], workingAction?: TrainingAction): unknown {
  if (field === "action") return workingAction ?? input.prescriptionDecision?.action ?? null;
  if (field === "modificationLevel") return input.prescriptionDecision?.modificationLevel ?? null;
  if (field === "intensityCap") return input.prescriptionDecision?.intensityCap ?? null;
  if (field === "volumeAdjustment") return input.prescriptionDecision?.volumeAdjustment ?? null;
  if (field === "playerTag") return input.playerTags ?? [];
  return (input as Record<string, unknown>)[field] ?? null;
}

/** Deterministic condition evaluation for rule matching. */
export function evaluateCondition(input: RulesEngineInput, condition: RuleCondition, workingAction?: TrainingAction): boolean {
  const left = resolveFieldValue(input, condition.field, workingAction);
  const right = condition.value;

  switch (condition.operator) {
    case "EQ":
      return left === right;
    case "NEQ":
      return left !== right;
    case "GT":
      return typeof left === "number" && typeof right === "number" && left > right;
    case "GTE":
      return typeof left === "number" && typeof right === "number" && left >= right;
    case "LT":
      return typeof left === "number" && typeof right === "number" && left < right;
    case "LTE":
      return typeof left === "number" && typeof right === "number" && left <= right;
    case "IN":
      return Array.isArray(right) ? right.includes(left as never) : false;
    case "NOT_IN":
      return Array.isArray(right) ? !right.includes(left as never) : true;
    case "CONTAINS":
      if (Array.isArray(left)) return left.includes(right as never);
      if (typeof left === "string") return right == null ? false : left.includes(String(right));
      return false;
    case "TRUE":
      return left === true;
    case "FALSE":
      return left === false;
    default:
      return false;
  }
}

/** Rule matches only when all conditions pass. */
export function evaluateRule(input: RulesEngineInput, rule: CoachRule, workingAction?: TrainingAction): boolean {
  if (!rule.enabled) return false;
  if (!rule.conditions.length) return true;
  return rule.conditions.every((condition) => evaluateCondition(input, condition, workingAction));
}

function addUnique<T extends string>(arr: T[], values: T[]): T[] {
  const set = new Set(arr);
  for (const value of values) set.add(value);
  return Array.from(set);
}

/** Apply one rule effect to working recommendation. */
export function applyRuleEffect(
  recommendation: NonNullable<RulesEngineInput["prescriptionDecision"]>,
  effect: RuleEffect,
  ctx: { requiresCoachReview: boolean; notes: string[] },
): string | null {
  switch (effect.type) {
    case "setAction": {
      const next = String(effect.value ?? "").toUpperCase() as TrainingAction;
      if (next === "FULL" || next === "MODIFIED" || next === "RECOVERY" || next === "HOLD") {
        recommendation.action = next;
        return `setAction:${next}`;
      }
      return null;
    }
    case "setModificationLevel": {
      const next = String(effect.value ?? "").toUpperCase();
      if (next === "NONE" || next === "LIGHT" || next === "MODERATE" || next === "HEAVY") {
        recommendation.modificationLevel = next;
        return `setModificationLevel:${next}`;
      }
      return null;
    }
    case "setIntensityCap": {
      const next = String(effect.value ?? "").toUpperCase();
      if (next === "NO_CAP" || next === "CAP_HIGH" || next === "CAP_MODERATE" || next === "CAP_LOW" || next === "RECOVERY_ONLY") {
        recommendation.intensityCap = next;
        return `setIntensityCap:${next}`;
      }
      return null;
    }
    case "setVolumeAdjustment": {
      const next = String(effect.value ?? "").toUpperCase();
      if (next === "NO_REDUCTION" || next === "REDUCE_10" || next === "REDUCE_20" || next === "REDUCE_30" || next === "REDUCE_50") {
        recommendation.volumeAdjustment = next;
        return `setVolumeAdjustment:${next}`;
      }
      return null;
    }
    case "addExposureGuidance": {
      const values = asArray(effect.value).map((v) => String(v).toUpperCase() as ExposureGuidanceTag);
      recommendation.exposureGuidance = addUnique(recommendation.exposureGuidance, values);
      return values.length ? `addExposureGuidance:${values.join(",")}` : null;
    }
    case "removeExposureGuidance": {
      const values = new Set(asArray(effect.value).map((v) => String(v).toUpperCase()));
      recommendation.exposureGuidance = recommendation.exposureGuidance.filter((tag) => !values.has(tag));
      return values.size ? `removeExposureGuidance:${Array.from(values).join(",")}` : null;
    }
    case "addRecoveryFocus": {
      const values = asArray(effect.value).map((v) => String(v).toUpperCase() as RecoveryFocusTag);
      recommendation.recoveryFocus = addUnique(recommendation.recoveryFocus, values);
      return values.length ? `addRecoveryFocus:${values.join(",")}` : null;
    }
    case "removeRecoveryFocus": {
      const values = new Set(asArray(effect.value).map((v) => String(v).toUpperCase()));
      recommendation.recoveryFocus = recommendation.recoveryFocus.filter((tag) => !values.has(tag));
      return values.size ? `removeRecoveryFocus:${Array.from(values).join(",")}` : null;
    }
    case "addMatchContext": {
      const values = asArray(effect.value).map((v) => String(v).toUpperCase() as MatchContextTag);
      recommendation.matchContext = addUnique(recommendation.matchContext, values);
      return values.length ? `addMatchContext:${values.join(",")}` : null;
    }
    case "removeMatchContext": {
      const values = new Set(asArray(effect.value).map((v) => String(v).toUpperCase()));
      recommendation.matchContext = recommendation.matchContext.filter((tag) => !values.has(tag));
      return values.size ? `removeMatchContext:${Array.from(values).join(",")}` : null;
    }
    case "forceProtectedMode":
      recommendation.action = compareRecommendationSeverity(recommendation.action, "MODIFIED") < 0 ? "MODIFIED" : recommendation.action;
      recommendation.matchContext = addUnique(recommendation.matchContext, ["PROTECT_FOR_MATCH"]);
      return "forceProtectedMode";
    case "requireCoachReview":
      ctx.requiresCoachReview = true;
      return "requireCoachReview";
    case "capRecommendationSeverity": {
      const cap = String(effect.value ?? "").toUpperCase() as TrainingAction;
      if (!(cap in ACTION_SEVERITY)) return null;
      if (compareRecommendationSeverity(recommendation.action, cap) < 0) {
        recommendation.action = cap;
      }
      return `capRecommendationSeverity:${cap}`;
    }
    case "raiseRecommendationSeverity": {
      const floor = String(effect.value ?? "").toUpperCase() as TrainingAction;
      if (!(floor in ACTION_SEVERITY)) return null;
      if (compareRecommendationSeverity(recommendation.action, floor) > 0) {
        recommendation.action = floor;
      }
      return `raiseRecommendationSeverity:${floor}`;
    }
    case "setNote": {
      const note = String(effect.value ?? "").trim();
      if (!note) return null;
      ctx.notes.push(note);
      return `setNote:${note}`;
    }
    case "addTag":
      return null;
    default:
      return null;
  }
}

function sortedRules(input: RulesEngineInput, rules: CoachRule[]): CoachRule[] {
  const team = getApplicableTeamRules(input, rules);
  const player = getApplicablePlayerRules(input, rules);
  const match = getApplicableMatchRules(input, rules);
  const protectedRules = getApplicableProtectedPlayerRules(input, rules);

  const map = new Map<string, CoachRule>();
  for (const rule of [...team, ...player, ...match, ...protectedRules]) map.set(rule.id, rule);

  return Array.from(map.values()).sort((a, b) => b.priority - a.priority);
}

/**
 * Apply default + custom + manual override layers while preserving original engine recommendation.
 */
export function applyCoachRules(
  input: RulesEngineInput,
  rules: CoachRule[],
  manualOverride?: Partial<ManualOverrideDecision> | null,
): FinalRecommendationDecision {
  const engineRecommendation = clonePrescriptionDecision(input.prescriptionDecision);
  if (!engineRecommendation) {
    throw new Error("Rules engine requires prescriptionDecision in input");
  }

  const finalRecommendation = clonePrescriptionDecision(engineRecommendation)!;
  const allRules = sortedRules(input, [...DEFAULT_COACH_RULES, ...rules.filter((rule) => !DEFAULT_COACH_RULES.some((d) => d.id === rule.id))]);
  const appliedRules: AppliedRuleResult[] = [];
  let requiresCoachReview = false;
  const notes: string[] = [];

  for (const rule of allRules) {
    const snapshotInput: RulesEngineInput = {
      ...input,
      prescriptionDecision: finalRecommendation,
    };

    if (!evaluateRule(snapshotInput, rule, finalRecommendation.action)) continue;

    const effectsApplied: string[] = [];
    for (const effect of rule.effects) {
      const applied = applyRuleEffect(finalRecommendation, effect, { requiresCoachReview, notes });
      if (applied) effectsApplied.push(applied);
      if (effect.type === "requireCoachReview" && effect.value !== false) requiresCoachReview = true;
    }

    if (!effectsApplied.length) continue;

    appliedRules.push({
      ruleId: rule.id,
      ruleName: rule.name,
      scope: rule.scope,
      severity: rule.severity,
      effectsApplied,
      explanation: buildAppliedRuleExplanation(rule, effectsApplied),
    });
  }

  const afterRulesRecommendation = clonePrescriptionDecision(finalRecommendation)!;
  const manual = applyManualOverride(afterRulesRecommendation, {
    ...manualOverride,
    originalAction: engineRecommendation.action,
    originalInstruction: engineRecommendation.coachInstruction,
  });

  const final = manual.recommendation;

  const wasModifiedByRules =
    engineRecommendation.action !== afterRulesRecommendation.action ||
    engineRecommendation.intensityCap !== afterRulesRecommendation.intensityCap ||
    engineRecommendation.volumeAdjustment !== afterRulesRecommendation.volumeAdjustment ||
    engineRecommendation.coachInstruction !== afterRulesRecommendation.coachInstruction ||
    engineRecommendation.exposureGuidance.join("|") !== afterRulesRecommendation.exposureGuidance.join("|");

  const overrideSummary = buildRulesOverrideSummary({
    engineRecommendation,
    finalRecommendation: final,
    appliedRules,
    manualOverride: manual.manual,
    requiresCoachReview,
    notes,
  });

  if (!requiresCoachReview) {
    requiresCoachReview = buildCoachReviewExplanation({ appliedRules, manualOverride: manual.manual, input }).requiresReview;
  }

  return {
    engineRecommendation,
    finalRecommendation: final,
    appliedRules,
    manualOverride: manual.manual,
    requiresCoachReview,
    wasModifiedByRules,
    overrideSummary,
    confidence: final.confidence,
  };
}

/**
 * Aggregate rule-engine effects for team-level transparency.
 */
export function buildTeamRulesSummary(
  items: Array<{ playerId?: string; playerName?: string; decision: FinalRecommendationDecision; isProtectedPlayer?: boolean | null }>,
): TeamRulesSummary {
  const playerSummaries = items.map((row) => ({
    playerId: row.playerId,
    playerName: row.playerName,
    finalAction: row.decision.finalRecommendation.action,
    modified: row.decision.wasModifiedByRules || !!row.decision.manualOverride?.applied,
    reviewRequired: row.decision.requiresCoachReview,
    appliedRuleCount: row.decision.appliedRules.length,
  }));

  const overriddenPlayersCount = playerSummaries.filter((player) => player.modified).length;
  const reviewRequiredCount = playerSummaries.filter((player) => player.reviewRequired).length;
  const protectedPlayersCount = items.filter((row) => !!row.isProtectedPlayer).length;
  const rulesTriggeredCount = items.reduce((acc, row) => acc + row.decision.appliedRules.length, 0);

  return {
    overriddenPlayersCount,
    reviewRequiredCount,
    protectedPlayersCount,
    rulesTriggeredCount,
    summaryText: `${overriddenPlayersCount} adjusted, ${reviewRequiredCount} require review, ${protectedPlayersCount} protected profiles.`,
    playerSummaries,
  };
}
