import type { RealtimeActivityItem, RealtimeDomainEvent, RealtimeHealthSummary } from "./types";

const EVENTS_KEY = "micropulse.realtime.events.v1";
const ACTIVITY_KEY = "micropulse.realtime.activity.v1";
const HEALTH_KEY = "micropulse.realtime.health.v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** Client persistence boundary for realtime event cache; replace with scalable event store when available. */
export function saveRealtimeEvent(event: RealtimeDomainEvent): RealtimeDomainEvent {
  const all = loadRecentRealtimeEvents(500);
  writeJson(EVENTS_KEY, [event, ...all.filter((item) => item.id !== event.id)].slice(0, 1000));
  return event;
}

export function loadRecentRealtimeEvents(limit = 100): RealtimeDomainEvent[] {
  return readJson<RealtimeDomainEvent[]>(EVENTS_KEY, [])
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, limit);
}

export function saveRealtimeActivityItem(item: RealtimeActivityItem): RealtimeActivityItem {
  const all = loadRecentActivityItems(500);
  writeJson(ACTIVITY_KEY, [item, ...all.filter((entry) => entry.id !== item.id)].slice(0, 1000));
  return item;
}

export function loadRecentActivityItems(limit = 100): RealtimeActivityItem[] {
  return readJson<RealtimeActivityItem[]>(ACTIVITY_KEY, [])
    .sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")))
    .slice(0, limit);
}

export function saveRealtimeHealthSummary(summary: RealtimeHealthSummary): RealtimeHealthSummary {
  writeJson(HEALTH_KEY, summary);
  return summary;
}

export function loadRealtimeHealthSummary(): RealtimeHealthSummary | null {
  return readJson<RealtimeHealthSummary | null>(HEALTH_KEY, null);
}

