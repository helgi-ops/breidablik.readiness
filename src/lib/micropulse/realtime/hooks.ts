"use client";

import { useEffect, useRef, useState } from "react";
import { loadRecentActivityItems, loadRecentRealtimeEvents, loadRealtimeHealthSummary, saveRealtimeHealthSummary } from "./persistence";
import { getRealtimeStreamEventName, subscribeToRealtimeChannel, unsubscribeFromRealtimeChannel } from "./stream";
import { coalesceRealtimeUiUpdates, shouldThrottleUiUpdate } from "./throttle";
import { mapRealtimeEventToUiUpdates } from "./uiMapping";
import type { RealtimeActivityItem, RealtimeConnectionState, RealtimeDomainEvent, RealtimeHealthSummary, RealtimeSubscriptionRequest } from "./types";

type HookState = {
  connectionState: RealtimeConnectionState;
  lastEventAt: string | null;
  events: RealtimeDomainEvent[];
  activity: RealtimeActivityItem[];
  summary: RealtimeHealthSummary | null;
};

function useRealtimeSubscription(request: RealtimeSubscriptionRequest, options?: { pollMs?: number; eventLimit?: number; activityLimit?: number }) {
  const pollMs = options?.pollMs ?? 5000;
  const eventLimit = options?.eventLimit ?? 50;
  const activityLimit = options?.activityLimit ?? 50;

  // Keep initial SSR/client render deterministic; hydrate realtime cache after mount.
  const [state, setState] = useState<HookState>({
    connectionState: "CONNECTING",
    lastEventAt: null,
    events: [],
    activity: [],
    summary: null,
  });
  const knownEventIdsRef = useRef<Set<string>>(new Set());

  const requestSignature = `${request.channel}:${request.organizationId ?? "*"}:${request.teamId ?? "*"}:${request.playerId ?? "*"}:${request.workflowId ?? "*"}:${request.role ?? "*"}`;

  useEffect(() => {
    const hydrateFromStorage = () => {
      const summary = loadRealtimeHealthSummary();
      const events = loadRecentRealtimeEvents(eventLimit);
      const activity = loadRecentActivityItems(activityLimit);
      knownEventIdsRef.current = new Set(events.map((event) => event.id));
      setState((current) => ({
        ...current,
        connectionState: summary?.connectionState ?? current.connectionState,
        lastEventAt: summary?.lastEventAt ?? events[0]?.createdAt ?? current.lastEventAt,
        events,
        activity,
        summary,
      }));
    };

    const subscriptionId = subscribeToRealtimeChannel(request, (event) => {
      const updates = coalesceRealtimeUiUpdates(mapRealtimeEventToUiUpdates(event)).filter((u) => !shouldThrottleUiUpdate(u, 700));
      if (!updates.length) return;
      setState((current) => {
        if (knownEventIdsRef.current.has(event.id)) return current;
        knownEventIdsRef.current.add(event.id);
        const nextEvents = [event, ...current.events].slice(0, eventLimit);
        const nextActivity = loadRecentActivityItems(activityLimit);
        const summary = loadRealtimeHealthSummary();
        return {
          connectionState: "CONNECTED",
          lastEventAt: event.createdAt ?? current.lastEventAt,
          events: nextEvents,
          activity: nextActivity,
          summary,
        };
      });
    });

    const streamEventName = getRealtimeStreamEventName();
    const onWindowEvent = () => {
      const summary = loadRealtimeHealthSummary();
      const events = loadRecentRealtimeEvents(eventLimit);
      knownEventIdsRef.current = new Set(events.map((event) => event.id));
      setState((current) => ({
        ...current,
        connectionState: summary?.connectionState ?? "CONNECTED",
        lastEventAt: summary?.lastEventAt ?? current.lastEventAt,
        events,
        activity: loadRecentActivityItems(activityLimit),
        summary,
      }));
    };
    window.addEventListener(streamEventName, onWindowEvent as EventListener);
    const hydrateTimer = window.setTimeout(hydrateFromStorage, 0);

    const interval = window.setInterval(() => {
      const summary = loadRealtimeHealthSummary();
      const events = loadRecentRealtimeEvents(eventLimit);
      const activity = loadRecentActivityItems(activityLimit);
      const lastEventAt = summary?.lastEventAt ?? events[0]?.createdAt ?? null;
      const stale = !lastEventAt || Date.now() - new Date(lastEventAt).getTime() > pollMs * 3;
      const connectionState: RealtimeConnectionState = stale ? "DEGRADED" : summary?.connectionState ?? "CONNECTED";
      const nextSummary: RealtimeHealthSummary = {
        connectionState,
        lastEventAt,
        recentEventCount: summary?.recentEventCount ?? events.length,
        droppedEventCount: summary?.droppedEventCount ?? 0,
        summaryText: stale ? "degraded (polling fallback active)" : summary?.summaryText ?? "connected",
      };
      saveRealtimeHealthSummary(nextSummary);
      setState({
        connectionState,
        lastEventAt,
        events,
        activity,
        summary: nextSummary,
      });
    }, pollMs);

    return () => {
      window.clearTimeout(hydrateTimer);
      window.removeEventListener(streamEventName, onWindowEvent as EventListener);
      window.clearInterval(interval);
      unsubscribeFromRealtimeChannel(subscriptionId);
    };
  }, [request, requestSignature, pollMs, eventLimit, activityLimit]);

  return state;
}

export function useTeamRealtime(teamId?: string | null, role?: string | null) {
  return useRealtimeSubscription({
    channel: "TEAM_OPERATIONS",
    teamId: teamId ?? null,
    role: role ?? null,
  });
}

export function usePlayerRealtime(playerId?: string | null, teamId?: string | null, role?: string | null) {
  return useRealtimeSubscription({
    channel: "PLAYER_DETAIL",
    playerId: playerId ?? null,
    teamId: teamId ?? null,
    role: role ?? null,
  });
}

export function useWorkflowRealtime(teamId?: string | null, workflowId?: string | null, role?: string | null) {
  return useRealtimeSubscription({
    channel: "WORKFLOW_EVENTS",
    teamId: teamId ?? null,
    workflowId: workflowId ?? null,
    role: role ?? null,
  });
}

export function useIntegrationRealtime(organizationId?: string | null, role?: string | null) {
  return useRealtimeSubscription({
    channel: "INTEGRATION_HEALTH",
    organizationId: organizationId ?? null,
    role: role ?? null,
  });
}
