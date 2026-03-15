import type { NotificationChannel, SessionAssignmentRecord, SessionNotificationEvent } from "./types";

function eventId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function baseEvent(args: {
  workflowId?: string | null;
  assignmentId?: string | null;
  playerId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  type: SessionNotificationEvent["type"];
  channel: NotificationChannel;
  title: string;
  message: string;
  status?: SessionNotificationEvent["status"];
  metadata?: Record<string, unknown> | null;
}): SessionNotificationEvent {
  return {
    id: eventId("notify"),
    workflowId: args.workflowId ?? null,
    assignmentId: args.assignmentId ?? null,
    playerId: args.playerId ?? null,
    actorId: args.actorId ?? null,
    actorName: args.actorName ?? null,
    type: args.type,
    channel: args.channel,
    timestamp: new Date().toISOString(),
    status: args.status ?? "PENDING",
    title: args.title,
    message: args.message,
    metadata: args.metadata ?? null,
  };
}

export function buildAssignmentNotification(record: SessionAssignmentRecord, channel: NotificationChannel): SessionNotificationEvent {
  return baseEvent({
    workflowId: record.workflowId,
    assignmentId: record.id,
    playerId: record.playerId,
    type: "SESSION_ASSIGNED",
    channel,
    status: "SENT",
    title: "Session assigned",
    message: `${record.playerName ?? "Player"} has a published training session for ${record.sessionDate ?? "today"}.`,
  });
}

export function buildSessionUpdatedNotification(record: SessionAssignmentRecord, channel: NotificationChannel): SessionNotificationEvent {
  return baseEvent({
    workflowId: record.workflowId,
    assignmentId: record.id,
    playerId: record.playerId,
    type: "SESSION_UPDATED",
    channel,
    status: "SENT",
    title: "Session updated",
    message: `Your training session for ${record.sessionDate ?? "today"} was updated.`,
  });
}

export function buildReviewRequestNotification(args: {
  workflowId: string;
  requestedTo?: string | null;
  requestedToName?: string | null;
  requestedByName?: string | null;
  channel?: NotificationChannel;
}): SessionNotificationEvent {
  return baseEvent({
    workflowId: args.workflowId,
    playerId: args.requestedTo ?? null,
    type: "REVIEW_REQUESTED",
    channel: args.channel ?? "IN_APP",
    status: "SENT",
    title: "Session review requested",
    message: `${args.requestedByName ?? "Staff"} requested your review.`,
  });
}

export function buildPublishConfirmedNotification(record: SessionAssignmentRecord, channel: NotificationChannel): SessionNotificationEvent {
  return baseEvent({
    workflowId: record.workflowId,
    assignmentId: record.id,
    playerId: record.playerId,
    type: "PUBLISH_CONFIRMED",
    channel,
    status: "SENT",
    title: "Session published",
    message: "Your training session is ready.",
  });
}

export function buildPlayerAcknowledgedNotification(record: SessionAssignmentRecord, channel: NotificationChannel): SessionNotificationEvent {
  return baseEvent({
    workflowId: record.workflowId,
    assignmentId: record.id,
    playerId: record.playerId,
    type: "PLAYER_ACKNOWLEDGED",
    channel,
    status: "SENT",
    title: "Player acknowledged session",
    message: `${record.playerName ?? "Player"} acknowledged the session.`,
  });
}

export function buildPlayerCompletedNotification(record: SessionAssignmentRecord, channel: NotificationChannel): SessionNotificationEvent {
  return baseEvent({
    workflowId: record.workflowId,
    assignmentId: record.id,
    playerId: record.playerId,
    type: "PLAYER_COMPLETED",
    channel,
    status: "SENT",
    title: "Player completed session",
    message: `${record.playerName ?? "Player"} marked the session complete.`,
  });
}

export function buildReminderNotification(record: SessionAssignmentRecord, channel: NotificationChannel, reason: string): SessionNotificationEvent {
  return baseEvent({
    workflowId: record.workflowId,
    assignmentId: record.id,
    playerId: record.playerId,
    type: "REMINDER",
    channel,
    status: "PENDING",
    title: "Session reminder",
    message: `Reminder for ${record.playerName ?? "player"}: ${reason}`,
  });
}

/** Creates assignment + publish notifications for selected delivery channels. */
export function buildNotificationEventsForAssignment(args: {
  record: SessionAssignmentRecord;
  includeUpdate?: boolean;
}): SessionNotificationEvent[] {
  const out: SessionNotificationEvent[] = [];
  for (const channel of args.record.deliveryChannels) {
    out.push(buildAssignmentNotification(args.record, channel));
    out.push(buildPublishConfirmedNotification(args.record, channel));
    if (args.includeUpdate) out.push(buildSessionUpdatedNotification(args.record, channel));
  }
  return out;
}
