"use client";

import type { RealtimeActivityItem } from "@/lib/micropulse/realtime";

type Props = {
  items: RealtimeActivityItem[];
  title?: string;
};

function sevClass(severity: RealtimeActivityItem["severity"]): string {
  if (severity === "CRITICAL") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "WARNING") return "border-amber-200 bg-amber-50 text-amber-800";
  if (severity === "NOTICE") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export default function ActivityFeedPanel({ items, title }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title ?? "Activity feed"}</div>
      {!items.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No recent live activity.</div> : null}
      <div className="mt-2 space-y-1">
        {items.slice(0, 20).map((item) => (
          <div key={item.id} className="rounded border bg-gray-50 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium text-gray-900">{item.title}</div>
              <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${sevClass(item.severity)}`}>{item.severity ?? "INFO"}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-600">{item.summary}</div>
            <div className="text-[10px] text-gray-500">
              {item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}
              {item.teamId ? ` · team ${item.teamId}` : ""}
              {item.playerId ? ` · player ${item.playerId}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

