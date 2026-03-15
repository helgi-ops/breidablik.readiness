import type { RealtimeDomainEvent, RealtimeDomainEventType } from "./types";

type EventArgs = Omit<RealtimeDomainEvent, "id" | "createdAt" | "dedupeKey"> & { dedupeKey?: string | null };

function buildEvent(args: EventArgs): RealtimeDomainEvent {
  return {
    ...args,
    id: `rt:${args.type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    dedupeKey: args.dedupeKey ?? null,
  };
}

function defaultSummary(type: RealtimeDomainEventType): string {
  return type.replaceAll("_", " ").toLowerCase();
}

/** Shared deterministic realtime event factory used at domain boundaries. */
export function buildRealtimeDomainEvent(args: {
  type: RealtimeDomainEventType;
  scopeType: RealtimeDomainEvent["scopeType"];
  scopeId?: string | null;
  teamId?: string | null;
  organizationId?: string | null;
  playerId?: string | null;
  workflowId?: string | null;
  provider?: string | null;
  summary?: string;
  payload?: Record<string, unknown> | null;
  severity?: RealtimeDomainEvent["severity"];
  dedupeKey?: string | null;
}): RealtimeDomainEvent {
  return buildEvent({
    ...args,
    summary: args.summary ?? defaultSummary(args.type),
  });
}

export function buildPlayerReadinessUpdatedEvent(args: { playerId: string; teamId?: string | null; summary?: string; payload?: Record<string, unknown> | null }) {
  return buildRealtimeDomainEvent({
    type: "PLAYER_READINESS_UPDATED",
    scopeType: "PLAYER",
    scopeId: args.playerId,
    playerId: args.playerId,
    teamId: args.teamId ?? null,
    summary: args.summary ?? "Player readiness updated.",
    payload: args.payload ?? null,
    dedupeKey: `readiness:${args.playerId}`,
  });
}

export function buildPlayerRiskUpdatedEvent(args: { playerId: string; teamId?: string | null; summary?: string; payload?: Record<string, unknown> | null }) {
  return buildRealtimeDomainEvent({
    type: "PLAYER_RISK_UPDATED",
    scopeType: "PLAYER",
    scopeId: args.playerId,
    playerId: args.playerId,
    teamId: args.teamId ?? null,
    summary: args.summary ?? "Player risk updated.",
    payload: args.payload ?? null,
    dedupeKey: `risk:${args.playerId}`,
  });
}

export function buildSessionPublishedEvent(args: { workflowId: string; playerId?: string | null; teamId?: string | null; summary?: string }) {
  return buildRealtimeDomainEvent({
    type: "SESSION_PUBLISHED",
    scopeType: "WORKFLOW",
    scopeId: args.workflowId,
    workflowId: args.workflowId,
    playerId: args.playerId ?? null,
    teamId: args.teamId ?? null,
    summary: args.summary ?? "Session published.",
    dedupeKey: `session_published:${args.workflowId}`,
    severity: "NOTICE",
  });
}

export function buildPlayerSessionCompletedEvent(args: { playerId?: string | null; teamId?: string | null; workflowId?: string | null; summary?: string }) {
  return buildRealtimeDomainEvent({
    type: "PLAYER_SESSION_COMPLETED",
    scopeType: args.playerId ? "PLAYER" : "TEAM",
    scopeId: args.playerId ?? args.teamId ?? null,
    playerId: args.playerId ?? null,
    teamId: args.teamId ?? null,
    workflowId: args.workflowId ?? null,
    summary: args.summary ?? "Player session completed.",
    dedupeKey: `session_completed:${args.playerId ?? args.workflowId ?? "unknown"}`,
    severity: "NOTICE",
  });
}

export function buildReviewRequestOpenedEvent(args: { workflowId: string; teamId?: string | null; summary?: string }) {
  return buildRealtimeDomainEvent({
    type: "REVIEW_REQUEST_OPENED",
    scopeType: "WORKFLOW",
    scopeId: args.workflowId,
    workflowId: args.workflowId,
    teamId: args.teamId ?? null,
    summary: args.summary ?? "Review request opened.",
    dedupeKey: `review_open:${args.workflowId}`,
    severity: "WARNING",
  });
}

export function buildIntegrationImportCompletedEvent(args: { provider: string; teamId?: string | null; summary?: string; payload?: Record<string, unknown> | null }) {
  return buildRealtimeDomainEvent({
    type: "INTEGRATION_IMPORT_COMPLETED",
    scopeType: "INTEGRATION",
    scopeId: args.provider,
    provider: args.provider,
    teamId: args.teamId ?? null,
    summary: args.summary ?? `${args.provider} import completed.`,
    payload: args.payload ?? null,
    dedupeKey: `import_ok:${args.provider}`,
    severity: "INFO",
  });
}

export function buildSyncJobUpdatedEvent(args: { provider: string; summary?: string; payload?: Record<string, unknown> | null; severity?: RealtimeDomainEvent["severity"] }) {
  return buildRealtimeDomainEvent({
    type: "SYNC_JOB_UPDATED",
    scopeType: "INTEGRATION",
    scopeId: args.provider,
    provider: args.provider,
    summary: args.summary ?? `${args.provider} sync job updated.`,
    payload: args.payload ?? null,
    dedupeKey: `sync_job:${args.provider}`,
    severity: args.severity ?? "NOTICE",
  });
}

export function buildWorkflowStatusChangedEvent(args: {
  workflowId: string;
  teamId?: string | null;
  playerId?: string | null;
  summary?: string;
  payload?: Record<string, unknown> | null;
  severity?: RealtimeDomainEvent["severity"];
}) {
  return buildRealtimeDomainEvent({
    type: "WORKFLOW_STATUS_CHANGED",
    scopeType: "WORKFLOW",
    scopeId: args.workflowId,
    workflowId: args.workflowId,
    teamId: args.teamId ?? null,
    playerId: args.playerId ?? null,
    summary: args.summary ?? "Workflow status changed.",
    payload: args.payload ?? null,
    dedupeKey: `workflow:${args.workflowId}`,
    severity: args.severity ?? "NOTICE",
  });
}
