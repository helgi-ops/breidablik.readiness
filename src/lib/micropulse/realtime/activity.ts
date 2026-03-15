import type { RealtimeActivityItem, RealtimeDomainEvent } from "./types";
import { mapEventToActivityItem } from "./uiMapping";

/** Builds activity item from realtime domain event with deterministic fields. */
export function buildRealtimeActivityItem(event: RealtimeDomainEvent): RealtimeActivityItem {
  return mapEventToActivityItem(event);
}

/** Groups activity items by day key for compact activity feed rendering. */
export function groupRealtimeActivityItems(items: RealtimeActivityItem[]): Record<string, RealtimeActivityItem[]> {
  return items.reduce<Record<string, RealtimeActivityItem[]>>((acc, item) => {
    const key = String(item.timestamp ?? "").slice(0, 10) || "unknown";
    (acc[key] ??= []).push(item);
    return acc;
  }, {});
}

/** Summarizes recent activity feed density and severity mix. */
export function summarizeRecentActivity(items: RealtimeActivityItem[]): string {
  if (!items.length) return "No recent activity.";
  const critical = items.filter((item) => item.severity === "CRITICAL").length;
  const warning = items.filter((item) => item.severity === "WARNING").length;
  return `${items.length} recent event(s), ${critical} critical, ${warning} warning.`;
}

