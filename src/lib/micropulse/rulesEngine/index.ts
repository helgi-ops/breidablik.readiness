// Future persistence model:
// - organization_rules
// - team_rules
// - player_rule_assignments
// - manual_override_audit_log

export type {
  AppliedRuleResult,
  CoachRule,
  FinalRecommendationDecision,
  ManualOverrideDecision,
  RuleCondition,
  RuleConditionOperator,
  RuleEffect,
  RuleFieldKey,
  RuleScope,
  RuleSeverity,
  RulesEngineInput,
  TeamRulesSummary,
} from "./types";

export { DEFAULT_COACH_RULES } from "./defaultRules";
export { getApplicableTeamRules, filterEnabledTeamRules } from "./teamRules";
export { getApplicablePlayerRules } from "./playerRules";
export { getApplicableMatchRules } from "./matchRules";
export { getApplicableProtectedPlayerRules } from "./protectedPlayerRules";
export { buildManualOverrideDecision, applyManualOverride } from "./manualOverride";
export {
  applyCoachRules,
  buildTeamRulesSummary,
  evaluateCondition,
  evaluateRule,
  applyRuleEffect,
  compareRecommendationSeverity,
  clonePrescriptionDecision,
} from "./applyRules";
export { buildRulesOverrideSummary, buildAppliedRuleExplanation, buildCoachReviewExplanation } from "./explanations";
