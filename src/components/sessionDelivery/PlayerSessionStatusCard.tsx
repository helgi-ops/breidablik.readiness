"use client";

import type { PlayerSessionStatusView } from "@/lib/micropulse/sessionDelivery";
import DeliveryStatusBadge from "./DeliveryStatusBadge";

type Props = {
  statusView: PlayerSessionStatusView | null;
  onAcknowledge?: () => void;
  onComplete?: () => void;
};

export default function PlayerSessionStatusCard({ statusView, onAcknowledge, onComplete }: Props) {
  if (!statusView) {
    return (
      <div className="rounded-xl border bg-white p-3 text-xs text-gray-500">
        <div className="font-semibold uppercase tracking-wide text-gray-600">Session status</div>
        <div className="mt-2">No assigned published session.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold uppercase tracking-wide text-gray-600">Session status</div>
        <DeliveryStatusBadge status={statusView.assignmentStatus} />
      </div>
      <div className="mt-2">{statusView.summary}</div>
      <div className="mt-1 text-[11px] text-gray-500">Last action: {statusView.lastActionAt ? new Date(statusView.lastActionAt).toLocaleString() : "-"}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAcknowledge}
          disabled={!onAcknowledge || statusView.hasAcknowledged || statusView.hasCompleted}
          className="rounded border px-3 py-1.5 text-xs font-medium text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Acknowledge
        </button>
        <button
          type="button"
          onClick={onComplete}
          disabled={!onComplete || statusView.hasCompleted}
          className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark complete
        </button>
      </div>
    </div>
  );
}
