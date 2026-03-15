import type { AutomationHistoryEntry, AutomationActionExecutionRecord, EscalationRecord, SmartAlertRecord } from "./types";

/** Builds one automation history entry for fired rules, actions, alerts, and escalations. */
export function buildAutomationHistoryEntry(args: {
  sourceEventId?: string | null;
  ruleId?: string | null;
  action?: AutomationActionExecutionRecord | null;
  alert?: SmartAlertRecord | null;
  escalation?: EscalationRecord | null;
  summary: string;
}): AutomationHistoryEntry {
  return {
    id: `history:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    sourceEventId: args.sourceEventId ?? null,
    ruleId: args.ruleId ?? null,
    actionId: args.action?.id ?? null,
    alertId: args.alert?.id ?? null,
    escalationId: args.escalation?.id ?? null,
    summary: args.summary,
  };
}

export function summarizeAutomationHistory(entries: AutomationHistoryEntry[]): string {
  if (!entries.length) return "No automation activity yet.";
  return `${entries.length} automation history item(s).`;
}

export function listRecentAutomationActions(entries: AutomationHistoryEntry[], limit = 20): AutomationHistoryEntry[] {
  return [...entries]
    .sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")))
    .slice(0, limit);
}

