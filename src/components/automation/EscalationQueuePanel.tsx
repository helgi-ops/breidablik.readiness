"use client";

import type { EscalationRecord } from "@/lib/micropulse/automation";

type Props = {
  escalations: EscalationRecord[];
};

export default function EscalationQueuePanel({ escalations }: Props) {
  const open = escalations.filter((item) => item.status !== "CLOSED");
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Escalation queue</div>
      {!open.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No open escalations.</div> : null}
      <div className="mt-2 space-y-1">
        {open.slice(0, 30).map((record) => (
          <div key={record.id} className="rounded border bg-gray-50 p-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-gray-900">{record.title}</div>
              <span className="rounded border bg-white px-1.5 py-0.5 text-[10px] font-semibold">L{record.level}</span>
            </div>
            <div className="text-gray-600">{record.summary}</div>
            <div className="text-gray-500">{record.status} · {record.createdAt ? new Date(record.createdAt).toLocaleString() : "-"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

