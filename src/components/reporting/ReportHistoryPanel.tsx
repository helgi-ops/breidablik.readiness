"use client";

import type { ReportHistoryRecord } from "@/lib/micropulse/reporting";

type Props = {
  history: ReportHistoryRecord[];
};

export default function ReportHistoryPanel({ history }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Report history</div>
      <div className="mt-2 space-y-2">
        {history.map((record) => (
          <div key={record.id} className="rounded border bg-gray-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{record.templateKey.replaceAll("_", " ")}</div>
              <div className="text-[11px] text-gray-500">{record.generatedAt ? new Date(record.generatedAt).toLocaleString() : "-"}</div>
            </div>
            <div className="mt-1 text-[11px] text-gray-600">
              {record.scope} · {record.frequency ?? "MANUAL"} · {record.formats.join(", ")} · Recipients: {record.recipientCount ?? 0}
            </div>
            <div className="mt-1">{record.summary}</div>
          </div>
        ))}
        {!history.length ? <div className="text-[11px] text-gray-500">No report history yet.</div> : null}
      </div>
    </div>
  );
}
