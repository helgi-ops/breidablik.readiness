import type {
  ReviewRequestRecord,
  SessionAssignmentRecord,
  SessionCommentRecord,
  SessionNotificationEvent,
} from "./types";
import { buildRealtimeDomainEvent, publishRealtimeEvent } from "@/lib/micropulse/realtime";

const ASSIGNMENTS_KEY = "micropulse.sessionDelivery.assignments.v1";
const NOTIFICATIONS_KEY = "micropulse.sessionDelivery.notifications.v1";
const REVIEWS_KEY = "micropulse.sessionDelivery.reviews.v1";
const COMMENTS_KEY = "micropulse.sessionDelivery.comments.v1";

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

/** Persistence boundary for Phase 10; swap with API/DB services when available. */
export function saveAssignmentRecord(record: SessionAssignmentRecord): SessionAssignmentRecord {
  const all = readJson<SessionAssignmentRecord[]>(ASSIGNMENTS_KEY, []);
  writeJson(
    ASSIGNMENTS_KEY,
    [record, ...all.filter((r) => r.id !== record.id)].sort((a, b) => String(b.sessionDate ?? "").localeCompare(String(a.sessionDate ?? ""))),
  );
  const statusToEventType =
    record.assignmentStatus === "COMPLETED"
      ? "PLAYER_SESSION_COMPLETED"
      : record.assignmentStatus === "ACKNOWLEDGED"
        ? "PLAYER_SESSION_ACKNOWLEDGED"
        : record.assignmentStatus === "SEEN"
          ? "PLAYER_SESSION_SEEN"
          : "SESSION_ASSIGNED";
  publishRealtimeEvent(
    buildRealtimeDomainEvent({
      type: statusToEventType,
      scopeType: record.playerId ? "PLAYER" : "WORKFLOW",
      scopeId: record.playerId ?? record.workflowId,
      teamId: record.teamId ?? null,
      playerId: record.playerId ?? null,
      workflowId: record.workflowId,
      summary: `Session status updated to ${record.assignmentStatus.toLowerCase()}.`,
      payload: {
        assignmentStatus: record.assignmentStatus,
        workflowId: record.workflowId,
      },
      severity: record.assignmentStatus === "MISSED" ? "WARNING" : "INFO",
      dedupeKey: `assignment:${record.workflowId}:${record.assignmentStatus}`,
    }),
  );
  return record;
}

export function loadAssignmentRecord(id: string): SessionAssignmentRecord | null {
  return readJson<SessionAssignmentRecord[]>(ASSIGNMENTS_KEY, []).find((r) => r.id === id) ?? null;
}

export function loadAssignmentByWorkflowId(workflowId: string): SessionAssignmentRecord | null {
  return readJson<SessionAssignmentRecord[]>(ASSIGNMENTS_KEY, []).find((r) => r.workflowId === workflowId) ?? null;
}

export function loadAssignmentsForPlayer(playerId: string): SessionAssignmentRecord[] {
  return readJson<SessionAssignmentRecord[]>(ASSIGNMENTS_KEY, []).filter((r) => r.playerId === playerId);
}

export function listAssignmentsForTeam(teamId?: string | null): SessionAssignmentRecord[] {
  const all = readJson<SessionAssignmentRecord[]>(ASSIGNMENTS_KEY, []);
  if (!teamId) return all;
  return all.filter((r) => r.teamId === teamId);
}

export function saveNotificationEvent(event: SessionNotificationEvent): SessionNotificationEvent {
  const all = readJson<SessionNotificationEvent[]>(NOTIFICATIONS_KEY, []);
  writeJson(NOTIFICATIONS_KEY, [event, ...all.filter((e) => e.id !== event.id)].slice(0, 5000));
  return event;
}

export function listNotificationEventsForWorkflow(workflowId: string): SessionNotificationEvent[] {
  return readJson<SessionNotificationEvent[]>(NOTIFICATIONS_KEY, [])
    .filter((e) => e.workflowId === workflowId)
    .sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")));
}

export function saveReviewRequest(request: ReviewRequestRecord): ReviewRequestRecord {
  const all = readJson<ReviewRequestRecord[]>(REVIEWS_KEY, []);
  writeJson(REVIEWS_KEY, [request, ...all.filter((r) => r.id !== request.id)]);
  const opened = request.status === "OPEN";
  publishRealtimeEvent(
    buildRealtimeDomainEvent({
      type: opened ? "REVIEW_REQUEST_OPENED" : "REVIEW_REQUEST_RESOLVED",
      scopeType: "WORKFLOW",
      scopeId: request.workflowId,
      workflowId: request.workflowId,
      summary: opened ? "Review request opened." : `Review request ${request.status.toLowerCase()}.`,
      payload: {
        status: request.status,
        requestedToName: request.requestedToName ?? null,
        requestedByName: request.requestedByName ?? null,
      },
      severity: opened ? "WARNING" : "NOTICE",
      dedupeKey: `review:${request.workflowId}:${request.status}`,
    }),
  );
  return request;
}

export function listReviewRequestsForWorkflow(workflowId: string): ReviewRequestRecord[] {
  return readJson<ReviewRequestRecord[]>(REVIEWS_KEY, [])
    .filter((r) => r.workflowId === workflowId)
    .sort((a, b) => String(b.requestedAt ?? "").localeCompare(String(a.requestedAt ?? "")));
}

export function saveSessionComment(comment: SessionCommentRecord): SessionCommentRecord {
  const all = readJson<SessionCommentRecord[]>(COMMENTS_KEY, []);
  writeJson(COMMENTS_KEY, [comment, ...all.filter((c) => c.id !== comment.id)]);
  publishRealtimeEvent(
    buildRealtimeDomainEvent({
      type: "STAFF_COMMENT_ADDED",
      scopeType: "WORKFLOW",
      scopeId: comment.workflowId,
      workflowId: comment.workflowId,
      summary: `${comment.scope === "STAFF_ONLY" ? "Staff" : "Player-visible"} comment added.`,
      payload: {
        scope: comment.scope,
        authorName: comment.authorName ?? null,
      },
      dedupeKey: `comment:${comment.workflowId}:${comment.id}`,
      severity: "INFO",
    }),
  );
  return comment;
}

export function listSessionCommentsForWorkflow(workflowId: string): SessionCommentRecord[] {
  return readJson<SessionCommentRecord[]>(COMMENTS_KEY, [])
    .filter((c) => c.workflowId === workflowId)
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
}

export function updatePlayerSessionStatus(record: SessionAssignmentRecord): SessionAssignmentRecord {
  return saveAssignmentRecord(record);
}
