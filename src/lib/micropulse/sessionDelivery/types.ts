import type { PlayerPublishedSessionView } from "@/lib/micropulse/sessionWorkflow";

export type SessionAssignmentStatus =
  | "UNASSIGNED"
  | "ASSIGNED"
  | "DELIVERED"
  | "SEEN"
  | "ACKNOWLEDGED"
  | "COMPLETED"
  | "MISSED"
  | "CANCELLED";

export type NotificationChannel = "IN_APP" | "PUSH" | "EMAIL" | "NONE";

export type NotificationType =
  | "SESSION_ASSIGNED"
  | "SESSION_UPDATED"
  | "REVIEW_REQUESTED"
  | "REVIEW_APPROVED"
  | "REVIEW_REJECTED"
  | "PUBLISH_CONFIRMED"
  | "PLAYER_ACKNOWLEDGED"
  | "PLAYER_COMPLETED"
  | "REMINDER";

export type ReviewRequestStatus = "OPEN" | "FULFILLED" | "DECLINED" | "CANCELLED";

export type SessionCommentScope = "STAFF_ONLY" | "PLAYER_VISIBLE";

export type SessionAssignmentRecord = {
  id: string;
  workflowId: string;
  playerId?: string;
  playerName?: string;
  teamId?: string;
  sessionDate?: string;
  publishedSessionView: PlayerPublishedSessionView;
  assignmentStatus: SessionAssignmentStatus;
  assignedAt?: string | null;
  assignedBy?: string | null;
  deliveredAt?: string | null;
  seenAt?: string | null;
  acknowledgedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  lastReminderAt?: string | null;
  deliveryChannels: NotificationChannel[];
  version: number;
};

export type SessionNotificationEvent = {
  id: string;
  workflowId?: string | null;
  assignmentId?: string | null;
  playerId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  type: NotificationType;
  channel: NotificationChannel;
  timestamp?: string | null;
  status: "PENDING" | "SENT" | "DELIVERED" | "FAILED" | "READ";
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
};

export type ReviewRequestRecord = {
  id: string;
  workflowId: string;
  requestedBy?: string | null;
  requestedByName?: string | null;
  requestedTo?: string | null;
  requestedToName?: string | null;
  status: ReviewRequestStatus;
  requestedAt?: string | null;
  resolvedAt?: string | null;
  reason?: string | null;
  summary: string;
};

export type SessionCommentRecord = {
  id: string;
  workflowId: string;
  authorId?: string | null;
  authorName?: string | null;
  scope: SessionCommentScope;
  message: string;
  createdAt?: string | null;
  editedAt?: string | null;
};

export type PlayerSessionStatusView = {
  playerId?: string;
  playerName?: string;
  assignmentStatus: SessionAssignmentStatus;
  hasSeen: boolean;
  hasAcknowledged: boolean;
  hasCompleted: boolean;
  lastActionAt?: string | null;
  summary: string;
};

export type TeamDeliverySummary = {
  assignedCount: number;
  deliveredCount: number;
  seenCount: number;
  acknowledgedCount: number;
  completedCount: number;
  missedCount: number;
  pendingReviewCount: number;
  summaryText: string;
  playersNeedingAttention: Array<{ playerId?: string; playerName?: string; reason: string }>;
};
