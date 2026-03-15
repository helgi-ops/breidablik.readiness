"use client";

import type { AutomationHistoryEntry } from "@/lib/micropulse/automation";

type Props = {
  history: AutomationHistoryEntry[];
};

export default function AutomationHistoryPanel({ history }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Automation history</div>
      {!history.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No history records.</div> : null}
      <div className="mt-2 space-y-1">
        {history.slice(0, 40).map((item) => (
          <div key={item.id} className="rounded border bg-gray-50 p-2 text-[11px]">
            <div className="text-gray-800">{item.summary}</div>
            <div className="text-[10px] text-gray-500">
              {item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}
              {item.ruleId ? ` · rule ${item.ruleId}` : ""}
              {item.sourceEventId ? ` · event ${item.sourceEventId}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

