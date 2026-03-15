import { summarizeSessionDraftDiff } from "./diff";
import type { SessionBlockEdit, SessionWorkflowEvent, WorkflowActionType } from "./types";

function eventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Base workflow event helper for deterministic audit records. */
export function buildWorkflowEvent(args: {
  workflowId: string;
  actionType: WorkflowActionType;
  actorId?: string | null;
  actorName?: string | null;
  summary: string;
  reason?: string | null;
  changes?: SessionBlockEdit[];
  metadata?: Record<string, unknown> | null;
}): SessionWorkflowEvent {
  return {
    id: eventId("wf"),
    workflowId: args.workflowId,
    actionType: args.actionType,
    actorId: args.actorId ?? null,
    actorName: args.actorName ?? null,
    timestamp: new Date().toISOString(),
    summary: args.summary,
    reason: args.reason ?? null,
    changes: args.changes ?? [],
    metadata: args.metadata ?? null,
  };
}

export function buildEditWorkflowEvent(args: {
  workflowId: string;
  actorId?: string | null;
  actorName?: string | null;
  changes: SessionBlockEdit[];
  reason?: string | null;
}): SessionWorkflowEvent {
  return buildWorkflowEvent({
    workflowId: args.workflowId,
    actionType: "EDITED",
    actorId: args.actorId,
    actorName: args.actorName,
    summary: `Draft edited: ${summarizeSessionDraftDiff(args.changes)}`,
    reason: args.reason,
    changes: args.changes,
  });
}

export function buildApprovalWorkflowEvent(args: {
  workflowId: string;
  actorId?: string | null;
  actorName?: string | null;
  reason?: string | null;
}): SessionWorkflowEvent {
  return buildWorkflowEvent({
    workflowId: args.workflowId,
    actionType: "APPROVED",
    actorId: args.actorId,
    actorName: args.actorName,
    summary: "Draft approved after staff review.",
    reason: args.reason,
  });
}

export function buildPublishWorkflowEvent(args: {
  workflowId: string;
  actorId?: string | null;
  actorName?: string | null;
  reason?: string | null;
}): SessionWorkflowEvent {
  return buildWorkflowEvent({
    workflowId: args.workflowId,
    actionType: "PUBLISHED",
    actorId: args.actorId,
    actorName: args.actorName,
    summary: "Approved draft published to player-facing session.",
    reason: args.reason,
  });
}
