import type { RealtimeActivityItem, RealtimeDomainEvent, RealtimeUiUpdate } from "./types";

/** Maps domain events to minimal UI updates so live refresh stays scoped and efficient. */
export function mapRealtimeEventToUiUpdates(event: RealtimeDomainEvent): RealtimeUiUpdate[] {
  const base: RealtimeUiUpdate[] = [{ target: "ACTIVITY_FEED", updateType: "REFRESH", summary: "Activity feed updated." }];
  switch (event.type) {
    case "PLAYER_READINESS_UPDATED":
    case "PLAYER_RISK_UPDATED":
      return [...base, { target: "PLAYER_CARD", targetId: event.playerId ?? null, updateType: "REFRESH", summary: event.summary }];
    case "SESSION_DRAFT_UPDATED":
    case "SESSION_APPROVED":
    case "SESSION_PUBLISHED":
    case "WORKFLOW_STATUS_CHANGED":
      return [...base, { target: "WORKFLOW_PANEL", targetId: event.workflowId ?? null, updateType: "REFRESH", summary: event.summary }];
    case "SESSION_ASSIGNED":
    case "PLAYER_SESSION_SEEN":
    case "PLAYER_SESSION_ACKNOWLEDGED":
    case "PLAYER_SESSION_COMPLETED":
    case "REVIEW_REQUEST_OPENED":
    case "REVIEW_REQUEST_RESOLVED":
    case "STAFF_COMMENT_ADDED":
      return [
        ...base,
        { target: "WORKFLOW_PANEL", targetId: event.workflowId ?? null, updateType: "REFRESH", summary: event.summary },
        { target: "TEAM_SUMMARY", targetId: event.teamId ?? null, updateType: "REFRESH", summary: "Team operations updated." },
      ];
    case "INTEGRATION_IMPORT_COMPLETED":
    case "INTEGRATION_IMPORT_FAILED":
    case "SYNC_JOB_UPDATED":
    case "WEBHOOK_RECEIVED":
      return [...base, { target: "INTEGRATION_PANEL", targetId: event.provider ?? null, updateType: "REFRESH", summary: event.summary }];
    default:
      return base;
  }
}

/** Converts one domain event into compact activity feed item. */
export function mapEventToActivityItem(event: RealtimeDomainEvent): RealtimeActivityItem {
  return {
    id: `activity:${event.id}`,
    timestamp: event.createdAt ?? null,
    title: event.type.replaceAll("_", " "),
    summary: event.summary,
    severity: event.severity ?? "INFO",
    teamId: event.teamId ?? null,
    playerId: event.playerId ?? null,
    workflowId: event.workflowId ?? null,
    sourceEventType: event.type,
  };
}

/** Human-readable impact line for debug/status banners. */
export function summarizeRealtimeImpact(event: RealtimeDomainEvent, updates: RealtimeUiUpdate[]): string {
  return `${event.type} produced ${updates.length} UI update target(s).`;
}

