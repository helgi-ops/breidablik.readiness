export type {
  AutomationTriggerType,
  AutomationScope,
  SmartAlertSeverity,
  AutomationActionType,
  AutomationRuleStatus,
  AutomationRuleCondition,
  AutomationRuleAction,
  AutomationRule,
  SmartAlertRecord,
  AutomationActionExecutionRecord,
  EscalationRecord,
  AutomationEvaluationResult,
  AutomationSummary,
  AutomationHistoryEntry,
} from "./types";

export { DEFAULT_AUTOMATION_RULES } from "./rules";
export { evaluateAutomationCondition, evaluateAutomationConditions, summarizeConditionMatch } from "./conditions";
export {
  buildCreateReviewRequestAction,
  buildSendNotificationAction,
  buildGenerateReportAction,
  buildOpenEscalationAction,
  buildAttentionFlagAction,
  executeAutomationAction,
} from "./actions";
export { buildSmartAlert, summarizeSmartAlert, acknowledgeSmartAlert, resolveSmartAlert } from "./alerts";
export { buildAlertDedupeKey, shouldSuppressAlert, applyAutomationCooldown, summarizeSuppressionDecision } from "./dedupe";
export { buildEscalationRecord, shouldEscalateAlert, escalateOpenIssue, summarizeEscalation } from "./escalation";
export { evaluateAutomationForEvent, evaluateAutomationForState, runAutomationEngine } from "./engine";
export { buildAutomationHistoryEntry, summarizeAutomationHistory, listRecentAutomationActions } from "./history";
export { buildAutomationSummary, summarizeOpenAlerts, summarizeEscalationQueue } from "./summary";
export {
  saveAutomationRule,
  loadAutomationRules,
  saveSmartAlert,
  loadSmartAlerts,
  saveAutomationActionExecution,
  loadAutomationActionExecutions,
  saveEscalationRecord,
  loadEscalationRecords,
  saveAutomationHistoryEntry,
  loadAutomationHistory,
} from "./persistence";

