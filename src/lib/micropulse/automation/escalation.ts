import type { EscalationRecord, SmartAlertRecord } from "./types";

function nowIso() {
  return new Date().toISOString();
}

/** Builds escalation record with deterministic level and scope metadata. */
export function buildEscalationRecord(args: {
  sourceAlertId?: string | null;
  scope: EscalationRecord["scope"];
  scopeId?: string | null;
  level: 1 | 2 | 3;
  title: string;
  summary: string;
  reason?: string | null;
}): EscalationRecord {
  return {
    id: `escalation:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    sourceAlertId: args.sourceAlertId ?? null,
    scope: args.scope,
    scopeId: args.scopeId ?? null,
    level: args.level,
    status: "OPEN",
    title: args.title,
    summary: args.summary,
    createdAt: nowIso(),
    escalatedAt: null,
    closedAt: null,
    reason: args.reason ?? null,
  };
}

/** Determines if alert should open escalation candidate based on severity + unresolved state. */
export function shouldEscalateAlert(alert: SmartAlertRecord, existingEscalations: EscalationRecord[]): boolean {
  if (alert.status !== "OPEN" && alert.status !== "ACKNOWLEDGED") return false;
  const highSeverity = alert.severity === "HIGH" || alert.severity === "CRITICAL";
  if (!highSeverity) return false;
  return !existingEscalations.some(
    (item) =>
      item.status !== "CLOSED" &&
      item.sourceAlertId === alert.id,
  );
}

export function escalateOpenIssue(record: EscalationRecord, reason?: string | null): EscalationRecord {
  const nextLevel = Math.min(3, record.level + 1) as 1 | 2 | 3;
  return {
    ...record,
    level: nextLevel,
    status: "ESCALATED",
    escalatedAt: nowIso(),
    reason: reason ?? record.reason ?? null,
  };
}

export function summarizeEscalation(record: EscalationRecord): string {
  return `L${record.level} ${record.status.toLowerCase()}: ${record.title}`;
}

