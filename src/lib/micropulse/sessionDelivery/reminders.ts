import type { ReviewRequestRecord, SessionAssignmentRecord } from "./types";

const HOUR_MS = 60 * 60 * 1000;

function hoursSince(ts?: string | null): number | null {
  if (!ts) return null;
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff / HOUR_MS;
}

export function shouldSendAssignmentReminder(record: SessionAssignmentRecord): boolean {
  if (record.assignmentStatus === "COMPLETED" || record.assignmentStatus === "CANCELLED") return false;
  if (record.assignmentStatus === "SEEN" || record.assignmentStatus === "ACKNOWLEDGED") return false;
  const sinceAssigned = hoursSince(record.assignedAt);
  const sinceLastReminder = hoursSince(record.lastReminderAt);
  if (sinceAssigned == null || sinceAssigned < 4) return false;
  if (sinceLastReminder != null && sinceLastReminder < 3) return false;
  return true;
}

export function shouldSendCompletionReminder(record: SessionAssignmentRecord): boolean {
  if (record.assignmentStatus === "COMPLETED" || record.assignmentStatus === "CANCELLED") return false;
  if (!record.seenAt) return false;
  const sinceSeen = hoursSince(record.seenAt);
  const sinceLastReminder = hoursSince(record.lastReminderAt);
  if (sinceSeen == null || sinceSeen < 6) return false;
  if (sinceLastReminder != null && sinceLastReminder < 3) return false;
  return true;
}

export function buildReminderPlan(args: {
  assignments: SessionAssignmentRecord[];
  reviewRequests?: ReviewRequestRecord[];
}): {
  assignmentReminders: SessionAssignmentRecord[];
  completionReminders: SessionAssignmentRecord[];
  staleReviewRequests: ReviewRequestRecord[];
} {
  const assignmentReminders = args.assignments.filter(shouldSendAssignmentReminder);
  const completionReminders = args.assignments.filter(shouldSendCompletionReminder);
  const staleReviewRequests = (args.reviewRequests ?? []).filter((r) => {
    if (r.status !== "OPEN") return false;
    const age = hoursSince(r.requestedAt);
    return age != null && age >= 8;
  });

  return { assignmentReminders, completionReminders, staleReviewRequests };
}
