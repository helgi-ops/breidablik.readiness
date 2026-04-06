"use client";

import type { ExecutiveSummary } from "@/lib/micropulse/orgIntelligence";

type Props = {
  summary: ExecutiveSummary;
};

export default function ExecutiveSummaryStrip({ summary }: Props) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{summary.topSummaryLine}</div>
      <div className="mt-2 grid gap-2 md:grid-cols-3 text-xs text-slate-700">
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-600">Key points</div>
          <ul className="mt-1 list-disc pl-4">
            {summary.keyPoints.slice(0, 4).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-600">Risks</div>
          <ul className="mt-1 list-disc pl-4">
            {summary.risks.slice(0, 3).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-semibold uppercase tracking-wide text-slate-600">Action items</div>
          <ul className="mt-1 list-disc pl-4">
            {summary.actionItems.slice(0, 3).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
