import type { PlayerPublishedSessionView } from "@/lib/micropulse/sessionWorkflow";
import type { NotificationChannel, SessionAssignmentRecord } from "./types";

function assignmentId(workflowId: string, sessionDate?: string, playerId?: string) {
  return `assign:${workflowId}:${sessionDate ?? "date"}:${playerId ?? "player"}`;
}

/** Builds assignment snapshot for a published session view. */
export function buildSessionAssignmentRecord(args: {
  workflowId: string;
  publishedSessionView: PlayerPublishedSessionView;
  playerId?: string;
  playerName?: string;
  teamId?: string;
  assignedBy?: string | null;
  deliveryChannels?: NotificationChannel[];
  version?: number;
}): SessionAssignmentRecord {
  const now = new Date().toISOString();
  const channels: NotificationChannel[] = args.deliveryChannels?.length ? args.deliveryChannels : ["IN_APP"];
  return {
    id: assignmentId(args.workflowId, args.publishedSessionView.date, args.playerId),
    workflowId: args.workflowId,
    playerId: args.playerId,
    playerName: args.playerName,
    teamId: args.teamId,
    sessionDate: args.publishedSessionView.date,
    publishedSessionView: args.publishedSessionView,
    assignmentStatus: "ASSIGNED",
    assignedAt: now,
    assignedBy: args.assignedBy ?? null,
    deliveredAt: null,
    seenAt: null,
    acknowledgedAt: null,
    completedAt: null,
    cancelledAt: null,
    lastReminderAt: null,
    deliveryChannels: channels,
    version: args.version ?? 1,
  };
}

/** Assigns published session and keeps deterministic versioning for updates. */
export function assignPublishedSession(args: {
  workflowId: string;
  publishedSessionView: PlayerPublishedSessionView;
  playerId?: string;
  playerName?: string;
  teamId?: string;
  assignedBy?: string | null;
  deliveryChannels?: NotificationChannel[];
  previous?: SessionAssignmentRecord | null;
}): SessionAssignmentRecord {
  const prev = args.previous ?? null;
  const base = buildSessionAssignmentRecord({
    workflowId: args.workflowId,
    publishedSessionView: args.publishedSessionView,
    playerId: args.playerId,
    playerName: args.playerName,
    teamId: args.teamId,
    assignedBy: args.assignedBy,
    deliveryChannels: args.deliveryChannels,
    version: (prev?.version ?? 0) + 1,
  });

  return {
    ...base,
    deliveredAt: prev?.deliveredAt ?? null,
    seenAt: prev?.seenAt ?? null,
    acknowledgedAt: prev?.acknowledgedAt ?? null,
    completedAt: prev?.completedAt ?? null,
    assignmentStatus: prev?.assignmentStatus === "COMPLETED" ? "DELIVERED" : base.assignmentStatus,
  };
}

export function cancelSessionAssignment(record: SessionAssignmentRecord): SessionAssignmentRecord {
  return {
    ...record,
    assignmentStatus: "CANCELLED",
    cancelledAt: new Date().toISOString(),
    version: record.version + 1,
  };
}
