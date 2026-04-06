"use client";

import type { OrgAttentionQueueSummary } from "@/lib/micropulse/orgIntelligence";

type Props = {
  summary: OrgAttentionQueueSummary;
};

function severityTone(severity: string) {
  if (severity === "CRITICAL") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "HIGH") return "border-amber-200 bg-amber-50 text-amber-700";
  if (severity === "MODERATE") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function OrgAttentionQueue({ summary }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Org attention queue</div>
      <div className="mt-1 text-[11px] text-gray-600">{summary.summaryText}</div>
      <div className="mt-2 space-y-2">
        {summary.items.map((item) => (
          <div key={item.id} className="rounded border bg-gray-50 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">{item.title}</div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityTone(item.severity)}`}>{item.severity}</span>
            </div>
            <div className="mt-1 text-[11px] text-gray-600">{item.teamName ? `${item.teamName} · ` : ""}{item.summary}</div>
          </div>
        ))}
        {!summary.items.length ? <div className="text-[11px] text-gray-500">No org-level attention items.</div> : null}
      </div>
    </div>
  );
}
