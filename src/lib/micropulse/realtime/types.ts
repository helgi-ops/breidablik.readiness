export type RealtimeDomainEventType =
  | "PLAYER_READINESS_UPDATED"
  | "PLAYER_RISK_UPDATED"
  | "SESSION_DRAFT_UPDATED"
  | "SESSION_APPROVED"
  | "SESSION_PUBLISHED"
  | "SESSION_ASSIGNED"
  | "PLAYER_SESSION_SEEN"
  | "PLAYER_SESSION_ACKNOWLEDGED"
  | "PLAYER_SESSION_COMPLETED"
  | "REVIEW_REQUEST_OPENED"
  | "REVIEW_REQUEST_RESOLVED"
  | "STAFF_COMMENT_ADDED"
  | "INTEGRATION_IMPORT_COMPLETED"
  | "INTEGRATION_IMPORT_FAILED"
  | "SYNC_JOB_UPDATED"
  | "WEBHOOK_RECEIVED"
  | "WORKFLOW_STATUS_CHANGED";

export type RealtimeScopeType = "PLAYER" | "TEAM" | "ORGANIZATION" | "WORKFLOW" | "INTEGRATION";

export type RealtimeChannelKey = "TEAM_OPERATIONS" | "PLAYER_DETAIL" | "ORG_OVERVIEW" | "WORKFLOW_EVENTS" | "INTEGRATION_HEALTH";

export type RealtimeDomainEvent = {
  id: string;
  type: RealtimeDomainEventType;
  scopeType: RealtimeScopeType;
  scopeId?: string | null;
  teamId?: string | null;
  organizationId?: string | null;
  playerId?: string | null;
  workflowId?: string | null;
  provider?: string | null;
  createdAt?: string | null;
  summary: string;
  payload?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  severity?: "INFO" | "NOTICE" | "WARNING" | "CRITICAL" | null;
};

export type RealtimeSubscriptionRequest = {
  channel: RealtimeChannelKey;
  organizationId?: string | null;
  teamId?: string | null;
  playerId?: string | null;
  workflowId?: string | null;
  role?: string | null;
};

export type RealtimeConnectionState = "CONNECTING" | "CONNECTED" | "DEGRADED" | "DISCONNECTED";

export type RealtimeActivityItem = {
  id: string;
  timestamp?: string | null;
  title: string;
  summary: string;
  severity?: "INFO" | "NOTICE" | "WARNING" | "CRITICAL" | null;
  teamId?: string | null;
  playerId?: string | null;
  workflowId?: string | null;
  sourceEventType?: RealtimeDomainEventType | null;
};

export type RealtimeUiUpdate = {
  target: "TEAM_SUMMARY" | "PLAYER_CARD" | "PLAYER_DETAIL" | "WORKFLOW_PANEL" | "INTEGRATION_PANEL" | "ACTIVITY_FEED";
  targetId?: string | null;
  updateType: "REFRESH" | "PATCH";
  patch?: Record<string, unknown> | null;
  summary: string;
};

export type RealtimeHealthSummary = {
  connectionState: RealtimeConnectionState;
  lastEventAt?: string | null;
  recentEventCount: number;
  droppedEventCount?: number | null;
  summaryText: string;
};

