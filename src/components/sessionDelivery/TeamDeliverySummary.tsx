"use client";

import type { TeamDeliverySummary as TeamDeliverySummaryType } from "@/lib/micropulse/sessionDelivery";

type Props = {
  summary: TeamDeliverySummaryType;
};

export default function TeamDeliverySummary({ summary }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Team delivery summary</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-6">
        <div className="rounded border bg-gray-50 p-2">Assigned: <span className="font-semibold">{summary.assignedCount}</span></div>
        <div className="rounded border bg-gray-50 p-2">Delivered: <span className="font-semibold">{summary.deliveredCount}</span></div>
        <div className="rounded border bg-gray-50 p-2">Seen: <span className="font-semibold">{summary.seenCount}</span></div>
        <div className="rounded border bg-gray-50 p-2">Acknowledged: <span className="font-semibold">{summary.acknowledgedCount}</span></div>
        <div className="rounded border bg-gray-50 p-2">Completed: <span className="font-semibold">{summary.completedCount}</span></div>
        <div className="rounded border bg-gray-50 p-2">Pending review: <span className="font-semibold">{summary.pendingReviewCount}</span></div>
      </div>
      <div className="mt-2">{summary.summaryText}</div>
      {!!summary.playersNeedingAttention.length && (
        <div className="mt-1 text-[11px] text-gray-600">
          Needs attention: {summary.playersNeedingAttention.map((player) => `${player.playerName || player.playerId || "Unknown"} (${player.reason})`).join(", ")}
        </div>
      )}
    </div>
  );
}
