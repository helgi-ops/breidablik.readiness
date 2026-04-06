"use client";

import RealtimeConnectionBadge from "./RealtimeConnectionBadge";
import type { RealtimeHealthSummary } from "@/lib/micropulse/realtime";

type Props = {
  health: RealtimeHealthSummary | null;
  label?: string;
};

export default function LiveStatusBanner({ health, label }: Props) {
  const summary = health?.summaryText ?? "Live transport not initialized.";
  return (
    <div className="rounded-xl border bg-white p-2 text-xs text-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-gray-900">{label ?? "Live updates"}</div>
        <RealtimeConnectionBadge state={health?.connectionState ?? "DISCONNECTED"} />
      </div>
      <div className="mt-1 text-[11px] text-gray-600">{summary}</div>
      {health?.lastEventAt ? <div className="text-[10px] text-gray-500">Last event: {new Date(health.lastEventAt).toLocaleString()}</div> : null}
    </div>
  );
}

