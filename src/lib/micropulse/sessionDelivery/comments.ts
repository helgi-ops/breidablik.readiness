import type { SessionCommentRecord, SessionCommentScope } from "./types";

function commentId(workflowId: string) {
  return `comment:${workflowId}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
}

export function addSessionComment(args: {
  workflowId: string;
  authorId?: string | null;
  authorName?: string | null;
  scope: SessionCommentScope;
  message: string;
}): SessionCommentRecord {
  return {
    id: commentId(args.workflowId),
    workflowId: args.workflowId,
    authorId: args.authorId ?? null,
    authorName: args.authorName ?? null,
    scope: args.scope,
    message: args.message.trim(),
    createdAt: new Date().toISOString(),
    editedAt: null,
  };
}

export function editSessionComment(comment: SessionCommentRecord, message: string): SessionCommentRecord {
  return {
    ...comment,
    message: message.trim(),
    editedAt: new Date().toISOString(),
  };
}

export function listSessionComments(comments: SessionCommentRecord[], workflowId: string, includePlayerVisibleOnly = false): SessionCommentRecord[] {
  return comments
    .filter((c) => c.workflowId === workflowId)
    .filter((c) => (includePlayerVisibleOnly ? c.scope === "PLAYER_VISIBLE" : true))
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
}

export function buildCommentSummary(comments: SessionCommentRecord[]): string {
  if (!comments.length) return "No comments.";
  const staffOnly = comments.filter((c) => c.scope === "STAFF_ONLY").length;
  const playerVisible = comments.filter((c) => c.scope === "PLAYER_VISIBLE").length;
  return `${comments.length} comments · ${staffOnly} staff-only · ${playerVisible} player-visible.`;
}
