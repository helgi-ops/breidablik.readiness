"use client";

import { useState } from "react";
import type { SessionCommentRecord, SessionCommentScope } from "@/lib/micropulse/sessionDelivery";

type Props = {
  comments: SessionCommentRecord[];
  onAddComment: (args: { message: string; scope: SessionCommentScope }) => void;
};

export default function SessionCommentsPanel({ comments, onAddComment }: Props) {
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState<SessionCommentScope>("STAFF_ONLY");

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Comments</div>
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add comment"
          className="rounded border px-2 py-1 text-xs"
        />
        <select value={scope} onChange={(e) => setScope(e.target.value as SessionCommentScope)} className="rounded border px-2 py-1 text-xs">
          <option value="STAFF_ONLY">Staff only</option>
          <option value="PLAYER_VISIBLE">Player visible</option>
        </select>
        <button
          type="button"
          onClick={() => {
            if (!message.trim()) return;
            onAddComment({ message: message.trim(), scope });
            setMessage("");
            setScope("STAFF_ONLY");
          }}
          className="rounded border px-3 py-1.5 text-xs font-medium text-gray-800"
        >
          Add
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {comments.map((comment) => (
          <div key={comment.id} className="rounded border bg-gray-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{comment.authorName || "Staff"}</div>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">{comment.scope}</span>
            </div>
            <div className="mt-1">{comment.message}</div>
            <div className="mt-1 text-[11px] text-gray-500">{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : "-"}</div>
          </div>
        ))}
        {!comments.length ? <div className="text-[11px] text-gray-500">No comments yet.</div> : null}
      </div>
    </div>
  );
}
