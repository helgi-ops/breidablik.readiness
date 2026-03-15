"use client";

import type { ImportConflictRecord } from "@/lib/micropulse/integrations";

type Props = {
  conflicts: ImportConflictRecord[];
};

function severityClass(severity: ImportConflictRecord["severity"]): string {
  if (severity === "HIGH") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "MODERATE") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export default function ImportConflictPanel({ conflicts }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Import conflicts</div>
      {!conflicts.length ? <div className="mt-2 rounded border bg-gray-50 p-2 text-[11px] text-gray-600">No unresolved conflicts.</div> : null}
      <div className="mt-2 space-y-1">
        {conflicts.slice(0, 40).map((conflict) => (
          <div key={conflict.id} className="rounded border bg-gray-50 p-2 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-gray-900">{conflict.type}</div>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityClass(conflict.severity)}`}>{conflict.severity}</span>
            </div>
            <div className="mt-1 text-gray-700">{conflict.summary}</div>
            <div className="text-gray-500">
              {conflict.provider}
              {conflict.playerName ? ` · ${conflict.playerName}` : ""}
              {conflict.externalAthleteId ? ` · ${conflict.externalAthleteId}` : ""}
              {conflict.createdAt ? ` · ${conflict.createdAt}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

