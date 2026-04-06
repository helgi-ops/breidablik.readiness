"use client";

import type { IntegrationImportRecord } from "@/lib/micropulse/integrations";

type Props = {
  imports: IntegrationImportRecord[];
};

export default function ImportHistoryPanel({ imports }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Import history</div>
      {!imports.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No imports yet.</div> : null}
      <div className="mt-2 space-y-1">
        {imports.slice(0, 30).map((record) => (
          <div key={record.id} className="rounded border bg-gray-50 p-2 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-gray-900">{record.provider} · {record.importMode}</div>
              <div className="rounded border bg-white px-1.5 py-0.5 text-[10px] font-semibold">{record.status}</div>
            </div>
            <div className="mt-1 text-gray-600">
              Imported {record.importedCount} · Failed {record.failedCount} · Unmatched {record.unmatchedCount}
            </div>
            <div className="text-gray-500">Completed: {record.completedAt ?? "—"} · {record.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

