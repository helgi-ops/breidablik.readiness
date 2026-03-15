import type { RealtimeDomainEvent } from "./types";

const recentKeys = new Map<string, number>();

/** Builds deterministic dedupe key for bursty event sources. */
export function buildEventDedupeKey(event: RealtimeDomainEvent): string {
  return event.dedupeKey ?? `${event.type}:${event.scopeType}:${event.scopeId ?? event.playerId ?? event.teamId ?? event.workflowId ?? event.provider ?? "global"}`;
}

/** Returns true when event should be dropped as near-duplicate within short time window. */
export function shouldDedupeEvent(event: RealtimeDomainEvent, windowMs = 3000): boolean {
  const key = buildEventDedupeKey(event);
  const now = Date.now();
  const seenAt = recentKeys.get(key);
  recentKeys.set(key, now);
  if (!seenAt) return false;
  return now - seenAt < windowMs;
}

/** Filters duplicate events while preserving chronological order. */
export function filterDuplicateEvents(events: RealtimeDomainEvent[], windowMs = 3000): RealtimeDomainEvent[] {
  const local = new Map<string, number>();
  const out: RealtimeDomainEvent[] = [];
  for (const event of events) {
    const key = buildEventDedupeKey(event);
    const ts = new Date(event.createdAt ?? new Date().toISOString()).getTime();
    const last = local.get(key);
    if (last != null && ts - last < windowMs) continue;
    local.set(key, ts);
    out.push(event);
  }
  return out;
}

