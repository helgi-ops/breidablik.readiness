"use client";

import { useState } from "react";
import type { ReviewRequestRecord } from "@/lib/micropulse/sessionDelivery";

type Props = {
  requests: ReviewRequestRecord[];
  onCreate: (args: { requestedToName: string; reason?: string | null }) => void;
  onResolve: (id: string) => void;
  onDecline: (id: string) => void;
};

export default function ReviewRequestPanel({ requests, onCreate, onResolve, onDecline }: Props) {
  const [reviewer, setReviewer] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Review requests</div>

      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <input
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="Reviewer name"
          className="rounded border px-2 py-1 text-xs"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          className="rounded border px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => {
            if (!reviewer.trim()) return;
            onCreate({ requestedToName: reviewer.trim(), reason: reason.trim() || null });
            setReason("");
          }}
          className="rounded border px-3 py-1.5 text-xs font-medium text-gray-800"
        >
          Request
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {requests.map((request) => (
          <div key={request.id} className="rounded border bg-gray-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{request.requestedToName || "Reviewer"}</div>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">{request.status}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-600">{request.reason || request.summary}</div>
            <div className="mt-1 text-[11px] text-gray-500">Requested: {request.requestedAt ? new Date(request.requestedAt).toLocaleString() : "-"}</div>
            {request.status === "OPEN" ? (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onResolve(request.id)} className="rounded border px-2 py-1 text-[11px]">
                  Resolve
                </button>
                <button type="button" onClick={() => onDecline(request.id)} className="rounded border px-2 py-1 text-[11px]">
                  Decline
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {!requests.length ? <div className="text-[11px] text-gray-500">No review requests yet.</div> : null}
      </div>
    </div>
  );
}
