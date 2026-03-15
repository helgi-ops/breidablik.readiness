import type { SessionDraft, SessionIntensityBand, SessionType } from "@/lib/micropulse/autoSessionBuilder";

export type SessionWorkflowStatus = "GENERATED" | "DRAFT_SAVED" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED";

export type WorkflowActionType =
  | "GENERATED"
  | "EDITED"
  | "SAVED"
  | "SUBMITTED_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "ARCHIVED";

export type SessionBlockEdit = {
  blockId: string;
  field: "included" | "durationMin" | "sets" | "reps" | "intensity" | "title" | "description";
  from: unknown;
  to: unknown;
  editedBy?: string | null;
  editedAt?: string | null;
  reason?: string | null;
};

export type SessionDraftRecord = {
  id: string;
  playerId?: string;
  playerName?: string;
  teamId?: string;
  date?: string;
  originalGeneratedDraft: SessionDraft;
  workingDraft: SessionDraft;
  approvedDraft?: SessionDraft | null;
  publishedDraft?: SessionDraft | null;
  status: SessionWorkflowStatus;
  version: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  lastEditedBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  publishedBy?: string | null;
  publishedAt?: string | null;
};

export type SessionWorkflowEvent = {
  id: string;
  workflowId: string;
  actionType: WorkflowActionType;
  actorId?: string | null;
  actorName?: string | null;
  timestamp?: string | null;
  summary: string;
  reason?: string | null;
  changes?: SessionBlockEdit[];
  metadata?: Record<string, unknown> | null;
};

export type SessionApprovalDecision = {
  canApprove: boolean;
  approvalWarnings: string[];
  summary: string;
};

export type SessionPublishDecision = {
  canPublish: boolean;
  publishWarnings: string[];
  summary: string;
};

export type PlayerPublishedSessionView = {
  playerId?: string;
  playerName?: string;
  date?: string;
  sessionType: SessionType;
  title: string;
  summary: string;
  blocks: Array<{
    id: string;
    title: string;
    description?: string;
    durationMin?: number | null;
    sets?: number | null;
    reps?: string | null;
    intensity?: SessionIntensityBand | null;
  }>;
  notes?: string[];
  publishedAt?: string | null;
};

export type TeamWorkflowSummary = {
  generatedCount: number;
  savedCount: number;
  inReviewCount: number;
  approvedCount: number;
  publishedCount: number;
  reviewNeededPlayers: Array<{ playerId?: string; playerName?: string }>;
  unpublishedApprovedPlayers: Array<{ playerId?: string; playerName?: string }>;
  summaryText: string;
};
