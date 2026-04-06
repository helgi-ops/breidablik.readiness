"use client";

import type { RealtimeActivityItem } from "@/lib/micropulse/realtime";

type Props = {
  teamId?: string | null;
  items: RealtimeActivityItem[];
};

export default function LiveTeamUpdatesPanel({ teamId, items }: Props) {
  const filtered = items.filter((item) => !teamId || item.teamId === teamId || item.teamId == null);
  const workflowChanges = filtered.filter((item) => item.sourceEventType?.includes("SESSION_") || item.sourceEventType === "WORKFLOW_STATUS_CHANGED").length;
  const playerCompletions = filtered.filter((item) => item.sourceEventType === "PLAYER_SESSION_COMPLETED").length;
  const reviewChanges = filtered.filter((item) => item.sourceEventType?.includes("REVIEW_REQUEST")).length;
  const integrationNotes = filtered.filter((item) => item.sourceEventType?.includes("INTEGRATION_") || item.sourceEventType === "SYNC_JOB_UPDATED").length;

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Live team updates</div>
      <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-2">
        <div className="rounded border bg-gray-50 px-2 py-1">Workflow changes: <span className="font-semibold">{workflowChanges}</span></div>
        <div className="rounded border bg-gray-50 px-2 py-1">Player completions: <span className="font-semibold">{playerCompletions}</span></div>
        <div className="rounded border bg-gray-50 px-2 py-1">Review updates: <span className="font-semibold">{reviewChanges}</span></div>
        <div className="rounded border bg-gray-50 px-2 py-1">Integration notes: <span className="font-semibold">{integrationNotes}</span></div>
      </div>
      <div className="mt-2 text-[11px] text-gray-600">{filtered.length} scoped update(s) in recent activity window.</div>
    </div>
  );
}

