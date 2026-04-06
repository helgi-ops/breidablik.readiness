import type { RealtimeDomainEvent } from "@/lib/micropulse/realtime";
import {
  applyAutomationCooldown,
  buildAlertDedupeKey,
  shouldSuppressAlert,
} from "./dedupe";
import { evaluateAutomationConditions } from "./conditions";
import { buildSmartAlert } from "./alerts";
import {
  buildAttentionFlagAction,
  buildCreateReviewRequestAction,
  buildGenerateReportAction,
  buildOpenEscalationAction,
  buildSendNotificationAction,
  executeAutomationAction,
} from "./actions";
import { buildEscalationRecord, shouldEscalateAlert } from "./escalation";
import { buildAutomationHistoryEntry } from "./history";
import {
  loadAutomationRules,
  loadEscalationRecords,
  loadSmartAlerts,
  saveAutomationActionExecution,
  saveAutomationHistoryEntry,
  saveEscalationRecord,
  saveSmartAlert,
} from "./persistence";
import type {
  AutomationActionExecutionRecord,
  AutomationEvaluationResult,
  AutomationRule,
  EscalationRecord,
  SmartAlertRecord,
} from "./types";

function buildEvaluationContext(event: RealtimeDomainEvent): Record<string, unknown> {
  return {
    event,
    eventType: event.type,
    scopeType: event.scopeType,
    severity: event.severity ?? null,
    teamId: event.teamId ?? null,
    playerId: event.playerId ?? null,
    workflowId: event.workflowId ?? null,
    provider: event.provider ?? null,
    payload: event.payload ?? null,
  };
}

function toAlertSeverity(rule: AutomationRule): SmartAlertRecord["severity"] {
  const configured = String(rule.actions.find((action) => action.type === "CREATE_ALERT")?.config?.severity ?? "").toUpperCase();
  if (configured === "CRITICAL" || configured === "HIGH" || configured === "WARNING" || configured === "NOTICE" || configured === "INFO") {
    return configured;
  }
  if (rule.priority >= 95) return "CRITICAL";
  if (rule.priority >= 80) return "HIGH";
  if (rule.priority >= 65) return "WARNING";
  if (rule.priority >= 45) return "NOTICE";
  return "INFO";
}

function toAlertTitle(rule: AutomationRule): string {
  return String(rule.actions.find((action) => action.type === "CREATE_ALERT")?.config?.title ?? rule.name);
}

function buildActionIntents(rule: AutomationRule, event: RealtimeDomainEvent): AutomationActionExecutionRecord[] {
  const intents: AutomationActionExecutionRecord[] = [];
  for (const action of rule.actions) {
    switch (action.type) {
      case "CREATE_REVIEW_REQUEST":
        intents.push(buildCreateReviewRequestAction(rule, event));
        break;
      case "SEND_NOTIFICATION":
        intents.push(buildSendNotificationAction(rule, event));
        break;
      case "GENERATE_REPORT":
        intents.push(buildGenerateReportAction(rule, event));
        break;
      case "OPEN_ESCALATION":
        intents.push(buildOpenEscalationAction(rule, event));
        break;
      case "FLAG_FOR_ATTENTION":
        intents.push(buildAttentionFlagAction(rule, event));
        break;
      case "REQUEST_MANUAL_CONFIRMATION":
        intents.push({
          id: `action:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          ruleId: rule.id,
          sourceEventId: event.id,
          actionType: "REQUEST_MANUAL_CONFIRMATION",
          status: "AWAITING_REVIEW",
          summary: "Manual confirmation requested by automation.",
          createdAt: new Date().toISOString(),
          executedAt: null,
          metadata: null,
        });
        break;
      default:
        break;
    }
  }
  return intents;
}

/** Evaluates rules for one domain event and builds alert/action/escalation outputs without side effects. */
export function evaluateAutomationForEvent(
  event: RealtimeDomainEvent,
  rules: AutomationRule[] = loadAutomationRules(),
): AutomationEvaluationResult {
  const enabled = rules
    .filter((rule) => rule.status === "ENABLED" && rule.triggerType === "DOMAIN_EVENT")
    .filter((rule) => !rule.eventTypes || rule.eventTypes.includes(event.type))
    .sort((a, b) => b.priority - a.priority);

  const context = buildEvaluationContext(event);
  const matchedRules = enabled.filter((rule) => evaluateAutomationConditions(rule.conditions, context));

  const alertsToCreate: SmartAlertRecord[] = [];
  const actionsToExecute: AutomationActionExecutionRecord[] = [];
  const escalationCandidates: EscalationRecord[] = [];

  for (const rule of matchedRules) {
    const hasAlertAction = rule.actions.some((action) => action.type === "CREATE_ALERT");
    if (hasAlertAction) {
      const scopeId = event.scopeId ?? event.playerId ?? event.teamId ?? event.workflowId ?? event.provider ?? null;
      const dedupeKey = buildAlertDedupeKey({
        sourceRuleId: rule.id,
        sourceEventId: event.id,
        scope: rule.scope,
        scopeId,
        playerId: event.playerId ?? null,
        teamId: event.teamId ?? null,
        title: toAlertTitle(rule),
      });
      const built = applyAutomationCooldown(
        buildSmartAlert({
          scope: rule.scope,
          scopeId,
          teamId: event.teamId ?? null,
          organizationId: event.organizationId ?? null,
          playerId: event.playerId ?? null,
          severity: toAlertSeverity(rule),
          title: toAlertTitle(rule),
          summary: `${rule.name}: ${event.summary}`,
          sourceEventId: event.id,
          sourceRuleId: rule.id,
          dedupeKey,
        }),
        rule.cooldownMinutes ?? null,
      );
      alertsToCreate.push(built);
    }
    actionsToExecute.push(...buildActionIntents(rule, event));
  }

  const existingEscalations = loadEscalationRecords();
  for (const alert of alertsToCreate) {
    if (shouldEscalateAlert(alert, existingEscalations)) {
      escalationCandidates.push(
        buildEscalationRecord({
          sourceAlertId: alert.id,
          scope: alert.scope,
          scopeId: alert.scopeId ?? null,
          level: alert.severity === "CRITICAL" ? 3 : alert.severity === "HIGH" ? 2 : 1,
          title: `Escalation: ${alert.title}`,
          summary: `Unresolved ${alert.severity.toLowerCase()} alert requires escalation.`,
          reason: "Severity threshold",
        }),
      );
    }
  }

  return {
    matchedRules,
    alertsToCreate,
    actionsToExecute,
    escalationCandidates,
    summary: matchedRules.length ? `${matchedRules.length} automation rule(s) matched.` : "No automation rules matched.",
  };
}

/** State-based evaluation hook for future scheduled checks; currently event-compatible wrapper. */
export function evaluateAutomationForState(
  stateContext: Record<string, unknown>,
  rules: AutomationRule[] = loadAutomationRules(),
): AutomationEvaluationResult {
  const syntheticEvent: RealtimeDomainEvent = {
    id: `state-event:${Date.now()}`,
    type: "WORKFLOW_STATUS_CHANGED",
    scopeType: "TEAM",
    summary: "State threshold evaluation",
    payload: stateContext,
    createdAt: new Date().toISOString(),
  };
  return evaluateAutomationForEvent(syntheticEvent, rules);
}

/** Runs evaluation + bounded side effects (alert persistence/action execution/escalation/history). */
export function runAutomationEngine(args: {
  event: RealtimeDomainEvent;
  rules?: AutomationRule[];
  executeActions?: boolean;
}): AutomationEvaluationResult {
  const evaluation = evaluateAutomationForEvent(args.event, args.rules ?? loadAutomationRules());
  const existingAlerts = loadSmartAlerts();
  const persistedAlerts: SmartAlertRecord[] = [];

  for (const alert of evaluation.alertsToCreate) {
    const suppressed = shouldSuppressAlert(alert, existingAlerts);
    const finalAlert = suppressed ? { ...alert, status: "SUPPRESSED" as const } : alert;
    saveSmartAlert(finalAlert);
    persistedAlerts.push(finalAlert);
    saveAutomationHistoryEntry(
      buildAutomationHistoryEntry({
        sourceEventId: args.event.id,
        ruleId: finalAlert.sourceRuleId ?? null,
        alert: finalAlert,
        summary: suppressed ? `Alert suppressed: ${finalAlert.title}` : `Alert created: ${finalAlert.title}`,
      }),
    );
  }

  const executedActions: AutomationActionExecutionRecord[] = [];
  for (const action of evaluation.actionsToExecute) {
    const rule = evaluation.matchedRules.find((item) => item.id === action.ruleId);
    if (!rule) continue;
    const actionConfig = rule.actions.find((candidate) => candidate.type === action.actionType)?.config ?? null;
    const finalAction =
      args.executeActions === false
        ? action
        : executeAutomationAction(action, rule, args.event, actionConfig);
    saveAutomationActionExecution(finalAction);
    executedActions.push(finalAction);
    saveAutomationHistoryEntry(
      buildAutomationHistoryEntry({
        sourceEventId: args.event.id,
        ruleId: finalAction.ruleId ?? null,
        action: finalAction,
        summary: `Action ${finalAction.actionType} ${finalAction.status.toLowerCase()}.`,
      }),
    );
  }

  const persistedEscalations: EscalationRecord[] = [];
  for (const escalation of evaluation.escalationCandidates) {
    saveEscalationRecord(escalation);
    persistedEscalations.push(escalation);
    saveAutomationHistoryEntry(
      buildAutomationHistoryEntry({
        sourceEventId: args.event.id,
        escalation,
        summary: `Escalation opened: ${escalation.title}`,
      }),
    );
  }

  return {
    ...evaluation,
    alertsToCreate: persistedAlerts,
    actionsToExecute: executedActions,
    escalationCandidates: persistedEscalations,
    summary: `${evaluation.summary} ${persistedAlerts.length} alerts, ${executedActions.length} actions, ${persistedEscalations.length} escalations.`,
  };
}

