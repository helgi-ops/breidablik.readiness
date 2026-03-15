import type { SessionAssignmentRecord, SessionAssignmentStatus, PlayerSessionStatusView } from "./types";

function nextStatus(current: SessionAssignmentStatus, target: SessionAssignmentStatus): SessionAssignmentStatus {
  const order: SessionAssignmentStatus[] = ["UNASSIGNED", "ASSIGNED", "DELIVERED", "SEEN", "ACKNOWLEDGED", "COMPLETED", "MISSED", "CANCELLED"];
  const currentIdx = order.indexOf(current);
  const targetIdx = order.indexOf(target);
  if (current === "CANCELLED" || current === "MISSED") return current;
  if (targetIdx > currentIdx) return target;
  return current;
}

export function markSessionSeen(record: SessionAssignmentRecord): SessionAssignmentRecord {
  const ts = record.seenAt ?? new Date().toISOString();
  return {
    ...record,
    assignmentStatus: nextStatus(record.assignmentStatus, "SEEN"),
    deliveredAt: record.deliveredAt ?? ts,
    seenAt: ts,
    version: record.version + 1,
  };
}

export function acknowledgeSession(record: SessionAssignmentRecord): SessionAssignmentRecord {
  const ts = record.acknowledgedAt ?? new Date().toISOString();
  return {
    ...record,
    assignmentStatus: nextStatus(record.assignmentStatus, "ACKNOWLEDGED"),
    deliveredAt: record.deliveredAt ?? ts,
    seenAt: record.seenAt ?? ts,
    acknowledgedAt: ts,
    version: record.version + 1,
  };
}

export function completeSession(record: SessionAssignmentRecord): SessionAssignmentRecord {
  const ts = record.completedAt ?? new Date().toISOString();
  return {
    ...record,
    assignmentStatus: "COMPLETED",
    deliveredAt: record.deliveredAt ?? ts,
    seenAt: record.seenAt ?? ts,
    acknowledgedAt: record.acknowledgedAt ?? ts,
    completedAt: ts,
    version: record.version + 1,
  };
}

export function buildPlayerSessionStatusView(record: SessionAssignmentRecord): PlayerSessionStatusView {
  const lastActionAt =
    record.completedAt ?? record.acknowledgedAt ?? record.seenAt ?? record.deliveredAt ?? record.assignedAt ?? null;

  return {
    playerId: record.playerId,
    playerName: record.playerName,
    assignmentStatus: record.assignmentStatus,
    hasSeen: !!record.seenAt,
    hasAcknowledged: !!record.acknowledgedAt,
    hasCompleted: !!record.completedAt,
    lastActionAt,
    summary:
      record.assignmentStatus === "COMPLETED"
        ? "Session completed."
        : record.assignmentStatus === "ACKNOWLEDGED"
        ? "Session acknowledged by player."
        : record.assignmentStatus === "SEEN"
        ? "Session has been opened by player."
        : record.assignmentStatus === "ASSIGNED" || record.assignmentStatus === "DELIVERED"
        ? "Session assigned and awaiting player action."
        : record.assignmentStatus === "CANCELLED"
        ? "Assignment was cancelled."
        : record.assignmentStatus === "MISSED"
        ? "Session was missed."
        : "Session not assigned.",
  };
}
