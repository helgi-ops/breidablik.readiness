import type { ReviewRequestRecord, SessionAssignmentRecord, TeamDeliverySummary } from "./types";

export function buildTeamDeliverySummary(assignments: SessionAssignmentRecord[], reviewRequests: ReviewRequestRecord[] = []): TeamDeliverySummary {
  const assignedCount = assignments.filter((a) => a.assignmentStatus !== "UNASSIGNED" && a.assignmentStatus !== "CANCELLED").length;
  const deliveredCount = assignments.filter((a) => !!a.deliveredAt).length;
  const seenCount = assignments.filter((a) => !!a.seenAt).length;
  const acknowledgedCount = assignments.filter((a) => !!a.acknowledgedAt).length;
  const completedCount = assignments.filter((a) => !!a.completedAt).length;
  const missedCount = assignments.filter((a) => a.assignmentStatus === "MISSED").length;
  const pendingReviewCount = reviewRequests.filter((r) => r.status === "OPEN").length;

  const playersNeedingAttention = assignments
    .filter((a) => a.assignmentStatus === "ASSIGNED" || a.assignmentStatus === "DELIVERED" || a.assignmentStatus === "MISSED")
    .map((a) => ({
      playerId: a.playerId,
      playerName: a.playerName,
      reason:
        a.assignmentStatus === "MISSED"
          ? "Session missed"
          : a.assignmentStatus === "DELIVERED"
          ? "Delivered but not seen"
          : "Assigned awaiting delivery/seen",
    }));

  return {
    assignedCount,
    deliveredCount,
    seenCount,
    acknowledgedCount,
    completedCount,
    missedCount,
    pendingReviewCount,
    summaryText: `${completedCount}/${assignedCount || 0} completed · ${pendingReviewCount} pending review · ${playersNeedingAttention.length} need attention.`,
    playersNeedingAttention,
  };
}
