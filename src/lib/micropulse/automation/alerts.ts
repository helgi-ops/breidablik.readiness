import type { SmartAlertRecord, SmartAlertSeverity } from "./types";

function safeNow(): string {
  return new Date().toISOString();
}

/** Builds one smart alert with deterministic metadata for audit and suppression handling. */
export function buildSmartAlert(args: {
  scope: SmartAlertRecord["scope"];
  scopeId?: string | null;
  teamId?: string | null;
  organizationId?: string | null;
  playerId?: string | null;
  severity: SmartAlertSeverity;
  title: string;
  summary: string;
  sourceEventId?: string | null;
  sourceRuleId?: string | null;
  dedupeKey?: string | null;
  cooldownUntil?: string | null;
}): SmartAlertRecord {
  return {
    id: `alert:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    scope: args.scope,
    scopeId: args.scopeId ?? null,
    teamId: args.teamId ?? null,
    organizationId: args.organizationId ?? null,
    playerId: args.playerId ?? null,
    severity: args.severity,
    title: args.title,
    summary: args.summary,
    sourceEventId: args.sourceEventId ?? null,
    sourceRuleId: args.sourceRuleId ?? null,
    status: "OPEN",
    createdAt: safeNow(),
    acknowledgedAt: null,
    resolvedAt: null,
    dedupeKey: args.dedupeKey ?? null,
    cooldownUntil: args.cooldownUntil ?? null,
  };
}

export function summarizeSmartAlert(alert: SmartAlertRecord): string {
  return `${alert.severity}: ${alert.title} (${alert.status.toLowerCase()})`;
}

export function acknowledgeSmartAlert(alert: SmartAlertRecord): SmartAlertRecord {
  return {
    ...alert,
    status: "ACKNOWLEDGED",
    acknowledgedAt: safeNow(),
  };
}

export function resolveSmartAlert(alert: SmartAlertRecord): SmartAlertRecord {
  return {
    ...alert,
    status: "RESOLVED",
    resolvedAt: safeNow(),
  };
}

