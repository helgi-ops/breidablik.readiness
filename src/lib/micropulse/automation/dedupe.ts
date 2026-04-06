import type { SmartAlertRecord } from "./types";

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

/** Stable alert dedupe key based on rule/event/scope to suppress repetitive noise. */
export function buildAlertDedupeKey(args: {
  sourceRuleId?: string | null;
  sourceEventId?: string | null;
  scope: SmartAlertRecord["scope"];
  scopeId?: string | null;
  playerId?: string | null;
  teamId?: string | null;
  title: string;
}): string {
  return [
    args.sourceRuleId ?? "rule:*",
    args.scope,
    args.scopeId ?? args.playerId ?? args.teamId ?? "scope:*",
    args.title.toLowerCase(),
  ].join("::");
}

/** Returns true when matching open/acknowledged alert is inside cooldown window and should be suppressed. */
export function shouldSuppressAlert(alert: SmartAlertRecord, existing: SmartAlertRecord[]): boolean {
  const now = Date.now();
  return existing.some((item) => {
    if (!item.dedupeKey || !alert.dedupeKey || item.dedupeKey !== alert.dedupeKey) return false;
    if (item.status !== "OPEN" && item.status !== "ACKNOWLEDGED") return false;
    if (!item.cooldownUntil) return false;
    return new Date(item.cooldownUntil).getTime() > now;
  });
}

/** Applies cooldown metadata to alert based on rule cooldown minutes. */
export function applyAutomationCooldown(alert: SmartAlertRecord, cooldownMinutes?: number | null): SmartAlertRecord {
  if (!cooldownMinutes || cooldownMinutes <= 0) return alert;
  const createdAt = alert.createdAt ?? new Date().toISOString();
  return {
    ...alert,
    cooldownUntil: addMinutes(createdAt, cooldownMinutes),
  };
}

export function summarizeSuppressionDecision(args: { suppressed: boolean; reason: string }): string {
  return args.suppressed ? `Suppressed: ${args.reason}` : `Not suppressed: ${args.reason}`;
}

