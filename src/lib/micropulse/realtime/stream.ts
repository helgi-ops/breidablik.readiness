import { canEventFlowToChannel } from "./channels";
import { buildEventDedupeKey, shouldDedupeEvent } from "./dedupe";
import { buildRealtimeActivityItem } from "./activity";
import { saveRealtimeActivityItem, saveRealtimeEvent, saveRealtimeHealthSummary, loadRealtimeHealthSummary } from "./persistence";
import type { RealtimeConnectionState, RealtimeDomainEvent, RealtimeHealthSummary, RealtimeSubscriptionRequest } from "./types";
import { runAutomationEngine } from "@/lib/micropulse/automation";

type Subscriber = {
  id: string;
  request: RealtimeSubscriptionRequest;
  onEvent: (event: RealtimeDomainEvent) => void;
};

const subscribers = new Map<string, Subscriber>();
const STREAM_EVENT = "micropulse:realtime:event";

function nextHealth(eventAt: string, recentEventCountDelta = 1, state: RealtimeConnectionState = "CONNECTED"): RealtimeHealthSummary {
  const current = loadRealtimeHealthSummary();
  const recentEventCount = (current?.recentEventCount ?? 0) + recentEventCountDelta;
  return {
    connectionState: state,
    lastEventAt: eventAt,
    recentEventCount,
    droppedEventCount: current?.droppedEventCount ?? 0,
    summaryText: `${state.toLowerCase()} · ${recentEventCount} recent events`,
  };
}

function dispatchLocalEvent(event: RealtimeDomainEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STREAM_EVENT, { detail: event }));
}

/** Publishes event into local realtime stream with dedupe, persistence, and subscriber fan-out. */
export function publishRealtimeEvent(event: RealtimeDomainEvent): { delivered: number; deduped: boolean } {
  if (shouldDedupeEvent(event)) {
    const current = loadRealtimeHealthSummary();
    saveRealtimeHealthSummary({
      connectionState: current?.connectionState ?? "CONNECTED",
      lastEventAt: current?.lastEventAt ?? event.createdAt ?? null,
      recentEventCount: current?.recentEventCount ?? 0,
      droppedEventCount: (current?.droppedEventCount ?? 0) + 1,
      summaryText: current?.summaryText ?? "deduped",
    });
    return { delivered: 0, deduped: true };
  }

  const normalized: RealtimeDomainEvent = {
    ...event,
    createdAt: event.createdAt ?? new Date().toISOString(),
    dedupeKey: event.dedupeKey ?? buildEventDedupeKey(event),
  };
  saveRealtimeEvent(normalized);
  saveRealtimeActivityItem(buildRealtimeActivityItem(normalized));
  runAutomationEngine({ event: normalized });
  saveRealtimeHealthSummary(nextHealth(normalized.createdAt ?? new Date().toISOString()));

  let delivered = 0;
  for (const subscriber of subscribers.values()) {
    if (!canEventFlowToChannel(normalized, subscriber.request)) continue;
    subscriber.onEvent(normalized);
    delivered += 1;
  }

  dispatchLocalEvent(normalized);
  return { delivered, deduped: false };
}

/** Registers subscriber callback for scoped realtime channel events. */
export function subscribeToRealtimeChannel(
  request: RealtimeSubscriptionRequest,
  onEvent: (event: RealtimeDomainEvent) => void,
): string {
  const id = `sub:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  subscribers.set(id, { id, request, onEvent });
  const health = loadRealtimeHealthSummary();
  saveRealtimeHealthSummary({
    connectionState: "CONNECTED",
    lastEventAt: health?.lastEventAt ?? null,
    recentEventCount: health?.recentEventCount ?? 0,
    droppedEventCount: health?.droppedEventCount ?? 0,
    summaryText: "connected",
  });
  return id;
}

export function unsubscribeFromRealtimeChannel(subscriptionId: string): void {
  subscribers.delete(subscriptionId);
  if (subscribers.size === 0) {
    const health = loadRealtimeHealthSummary();
    saveRealtimeHealthSummary({
      connectionState: "DEGRADED",
      lastEventAt: health?.lastEventAt ?? null,
      recentEventCount: health?.recentEventCount ?? 0,
      droppedEventCount: health?.droppedEventCount ?? 0,
      summaryText: "degraded (no active subscriptions)",
    });
  }
}

/** Handles external incoming event (SSE/ws/polling) through common publish path. */
export function handleIncomingRealtimeEvent(event: RealtimeDomainEvent): { delivered: number; deduped: boolean } {
  return publishRealtimeEvent(event);
}

export function getRealtimeStreamEventName(): string {
  return STREAM_EVENT;
}
