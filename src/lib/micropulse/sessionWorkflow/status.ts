import type { SessionWorkflowStatus, WorkflowActionType } from "./types";

const TRANSITIONS: Record<SessionWorkflowStatus, SessionWorkflowStatus[]> = {
  GENERATED: ["DRAFT_SAVED", "IN_REVIEW", "ARCHIVED"],
  DRAFT_SAVED: ["IN_REVIEW", "APPROVED", "ARCHIVED"],
  IN_REVIEW: ["DRAFT_SAVED", "APPROVED", "ARCHIVED"],
  APPROVED: ["PUBLISHED", "DRAFT_SAVED", "IN_REVIEW", "ARCHIVED"],
  PUBLISHED: ["DRAFT_SAVED", "IN_REVIEW", "ARCHIVED"],
  ARCHIVED: [],
};

/** Deterministic status transition check for workflow safety. */
export function canTransitionWorkflowStatus(from: SessionWorkflowStatus, to: SessionWorkflowStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Maps workflow actions into explicit next status. */
export function getNextWorkflowStatus(current: SessionWorkflowStatus, actionType: WorkflowActionType): SessionWorkflowStatus {
  switch (actionType) {
    case "GENERATED":
      return "GENERATED";
    case "EDITED":
      return current === "APPROVED" || current === "PUBLISHED" ? "DRAFT_SAVED" : current;
    case "SAVED":
      return current === "GENERATED" ? "DRAFT_SAVED" : "DRAFT_SAVED";
    case "SUBMITTED_FOR_REVIEW":
      return "IN_REVIEW";
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "DRAFT_SAVED";
    case "PUBLISHED":
      return "PUBLISHED";
    case "UNPUBLISHED":
      return "DRAFT_SAVED";
    case "ARCHIVED":
      return "ARCHIVED";
    default:
      return current;
  }
}

export function isWorkflowEditable(status: SessionWorkflowStatus): boolean {
  return status !== "ARCHIVED";
}

export function isWorkflowApprovable(status: SessionWorkflowStatus): boolean {
  return status === "IN_REVIEW" || status === "DRAFT_SAVED";
}

export function isWorkflowPublishable(status: SessionWorkflowStatus): boolean {
  return status === "APPROVED";
}
