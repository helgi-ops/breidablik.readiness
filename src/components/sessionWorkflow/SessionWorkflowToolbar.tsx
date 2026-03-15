"use client";

import React from "react";
import type { SessionApprovalDecision, SessionPublishDecision, SessionWorkflowStatus } from "@/lib/micropulse/sessionWorkflow";

type Props = {
  status: SessionWorkflowStatus;
  onSubmitForReview: () => void;
  onApprove: () => void;
  onPublish: () => void;
  onUnpublish?: () => void;
  approvalDecision: SessionApprovalDecision;
  publishDecision: SessionPublishDecision;
};

export default function SessionWorkflowToolbar({
  status,
  onSubmitForReview,
  onApprove,
  onPublish,
  onUnpublish,
  approvalDecision,
  publishDecision,
}: Props) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Session Workflow</div>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-gray-700">{status}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSubmitForReview}
          disabled={status === "IN_REVIEW" || status === "APPROVED" || status === "PUBLISHED" || status === "ARCHIVED"}
          className="rounded border px-3 py-1.5 text-xs font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Submit for Review
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={!approvalDecision.canApprove}
          className="rounded border px-3 py-1.5 text-xs font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={!publishDecision.canPublish}
          className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Publish
        </button>
        {onUnpublish ? (
          <button
            type="button"
            onClick={onUnpublish}
            disabled={status !== "PUBLISHED"}
            className="rounded border px-3 py-1.5 text-xs font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Unpublish
          </button>
        ) : null}
      </div>

      <div className="mt-2 text-[11px] text-gray-600">
        {status === "PUBLISHED" ? "Player-facing session is currently published." : "Published session is only visible to players after explicit publish."}
      </div>
    </div>
  );
}
