import { buildReviewRequestNotification } from "./notifications";
import type { ReviewRequestRecord, SessionNotificationEvent } from "./types";

function requestId(workflowId: string) {
  return `review:${workflowId}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
}

export function createReviewRequest(args: {
  workflowId: string;
  requestedBy?: string | null;
  requestedByName?: string | null;
  requestedTo?: string | null;
  requestedToName?: string | null;
  reason?: string | null;
}): { request: ReviewRequestRecord; notifications: SessionNotificationEvent[] } {
  const request: ReviewRequestRecord = {
    id: requestId(args.workflowId),
    workflowId: args.workflowId,
    requestedBy: args.requestedBy ?? null,
    requestedByName: args.requestedByName ?? null,
    requestedTo: args.requestedTo ?? null,
    requestedToName: args.requestedToName ?? null,
    status: "OPEN",
    requestedAt: new Date().toISOString(),
    resolvedAt: null,
    reason: args.reason ?? null,
    summary: `Review requested from ${args.requestedToName ?? "staff"}`,
  };

  return {
    request,
    notifications: [
      buildReviewRequestNotification({
        workflowId: args.workflowId,
        requestedTo: args.requestedTo,
        requestedToName: args.requestedToName,
        requestedByName: args.requestedByName,
      }),
    ],
  };
}

export function resolveReviewRequest(request: ReviewRequestRecord): ReviewRequestRecord {
  return {
    ...request,
    status: "FULFILLED",
    resolvedAt: new Date().toISOString(),
    summary: "Review fulfilled.",
  };
}

export function declineReviewRequest(request: ReviewRequestRecord, reason?: string | null): ReviewRequestRecord {
  return {
    ...request,
    status: "DECLINED",
    resolvedAt: new Date().toISOString(),
    reason: reason ?? request.reason ?? null,
    summary: "Review request declined.",
  };
}

export function buildReviewRequestSummary(requests: ReviewRequestRecord[]): string {
  const open = requests.filter((r) => r.status === "OPEN").length;
  if (!requests.length) return "No review requests.";
  if (!open) return "All review requests resolved.";
  return `${open} review request${open === 1 ? "" : "s"} open.`;
}
