import type { AutomationActionExecutionRecord, AutomationSummary, EscalationRecord, SmartAlertRecord } from "./types";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Aggregates alert/escalation/action state into compact automation summary. */
export function buildAutomationSummary(args: {
  alerts: SmartAlertRecord[];
  escalations: EscalationRecord[];
  actions: AutomationActionExecutionRecord[];
}): AutomationSummary {
  const openAlerts = args.alerts.filter((alert) => alert.status === "OPEN").length;
  const criticalAlerts = args.alerts.filter((alert) => alert.status === "OPEN" && (alert.severity === "CRITICAL" || alert.severity === "HIGH")).length;
  const escalationsOpen = args.escalations.filter((item) => item.status !== "CLOSED").length;
  const suppressedAlerts = args.alerts.filter((alert) => alert.status === "SUPPRESSED").length;
  const today = todayKey();
  const actionsExecutedToday = args.actions.filter((action) => action.executedAt?.slice(0, 10) === today && action.status === "EXECUTED").length;
  return {
    openAlerts,
    criticalAlerts,
    escalationsOpen,
    actionsExecutedToday,
    suppressedAlerts,
    summaryText: `${openAlerts} open alerts, ${criticalAlerts} critical/high, ${escalationsOpen} open escalations.`,
  };
}

export function summarizeOpenAlerts(alerts: SmartAlertRecord[]): string {
  const open = alerts.filter((item) => item.status === "OPEN").length;
  if (!open) return "No open alerts.";
  return `${open} open alert(s).`;
}

export function summarizeEscalationQueue(escalations: EscalationRecord[]): string {
  const open = escalations.filter((item) => item.status !== "CLOSED").length;
  if (!open) return "No open escalations.";
  return `${open} escalation item(s) require attention.`;
}

