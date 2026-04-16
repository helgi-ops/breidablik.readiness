import type { RealtimeDomainEvent } from "@/lib/micropulse/realtime";
import { saveRealtimeActivityItem } from "@/lib/micropulse/realtime/persistence";
// Session delivery imports removed (feature removed)
import type { AutomationActionExecutionRecord, AutomationRule, AutomationRuleAction } from "./types";

function actionId() {
  return `action:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function buildExecution(args: {
  ruleId?: string | null;
  sourceEventId?: string | null;
  actionType: AutomationActionExecutionRecord["actionType"];
  status: AutomationActionExecutionRecord["status"];
  summary: string;
  metadata?: Record<string, unknown> | null;
}): AutomationActionExecutionRecord {
  return {
    id: actionId(),
    ruleId: args.ruleId ?? null,
    sourceEventId: args.sourceEventId ?? null,
    actionType: args.actionType,
    status: args.status,
    summary: args.summary,
    createdAt: new Date().toISOString(),
    executedAt: args.status === "EXECUTED" ? new Date().toISOString() : null,
    metadata: args.metadata ?? null,
  };
}

export function buildCreateReviewRequestAction(rule: AutomationRule, event: RealtimeDomainEvent): AutomationActionExecutionRecord {
  const summary = `Review request automation intent for workflow ${event.workflowId ?? "unknown"}.`;
  return buildExecution({
    ruleId: rule.id,
    sourceEventId: event.id,
    actionType: "CREATE_REVIEW_REQUEST",
    status: rule.requiresHumanReview ? "AWAITING_REVIEW" : "PENDING",
    summary,
  });
}

export function buildSendNotificationAction(rule: AutomationRule, event: RealtimeDomainEvent): AutomationActionExecutionRecord {
  return buildExecution({
    ruleId: rule.id,
    sourceEventId: event.id,
    actionType: "SEND_NOTIFICATION",
    status: rule.requiresHumanReview ? "AWAITING_REVIEW" : "PENDING",
    summary: "Notification automation intent created.",
  });
}

export function buildGenerateReportAction(rule: AutomationRule, event: RealtimeDomainEvent): AutomationActionExecutionRecord {
  return buildExecution({
    ruleId: rule.id,
    sourceEventId: event.id,
    actionType: "GENERATE_REPORT",
    status: rule.requiresHumanReview ? "AWAITING_REVIEW" : "PENDING",
    summary: "Report generation automation intent created.",
    metadata: {
      templateKey: rule.actions.find((a) => a.type === "GENERATE_REPORT")?.config?.templateKey ?? null,
    },
  });
}

export function buildOpenEscalationAction(rule: AutomationRule, event: RealtimeDomainEvent): AutomationActionExecutionRecord {
  return buildExecution({
    ruleId: rule.id,
    sourceEventId: event.id,
    actionType: "OPEN_ESCALATION",
    status: "PENDING",
    summary: "Escalation intent created.",
  });
}

export function buildAttentionFlagAction(rule: AutomationRule, event: RealtimeDomainEvent): AutomationActionExecutionRecord {
  return buildExecution({
    ruleId: rule.id,
    sourceEventId: event.id,
    actionType: "FLAG_FOR_ATTENTION",
    status: "EXECUTED",
    summary: "Item flagged for attention.",
  });
}

/** Executes safe automation intents; sensitive actions remain review-gated and explainable. */
export function executeAutomationAction(
  action: AutomationActionExecutionRecord,
  rule: AutomationRule,
  event: RealtimeDomainEvent,
  actionConfig?: AutomationRuleAction["config"] | null,
): AutomationActionExecutionRecord {
  if (action.status === "AWAITING_REVIEW") return action;

  try {
    switch (action.actionType) {
      case "CREATE_REVIEW_REQUEST": {
        // Session workflow feature removed — review requests no longer supported
        return { ...action, status: "SKIPPED", summary: "Skipped: session workflow feature removed." };
      }
      case "SEND_NOTIFICATION": {
        // No direct generic channel send in v1; keep explicit pending intent for bounded downstream executors.
        return { ...action, status: "PENDING", summary: "Notification queued as action intent." };
      }
      case "ADD_ACTIVITY_ITEM": {
        saveRealtimeActivityItem({
          id: `automation-activity:${action.id}`,
          timestamp: new Date().toISOString(),
          title: "Automation action",
          summary: action.summary,
          severity: "NOTICE",
          teamId: event.teamId ?? null,
          playerId: event.playerId ?? null,
          workflowId: event.workflowId ?? null,
          sourceEventType: event.type,
        });
        return { ...action, status: "EXECUTED", executedAt: new Date().toISOString() };
      }
      case "FLAG_FOR_ATTENTION":
      case "REQUEST_MANUAL_CONFIRMATION":
      case "CREATE_ALERT":
      case "GENERATE_REPORT":
      case "OPEN_ESCALATION":
      default:
        return action;
    }
  } catch (error) {
    return {
      ...action,
      status: "FAILED",
      summary: `Automation action failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      executedAt: new Date().toISOString(),
    };
  }
}
