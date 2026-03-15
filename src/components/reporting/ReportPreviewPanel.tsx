"use client";

import type { ReportDocument } from "@/lib/micropulse/reporting";

type Props = {
  report: ReportDocument | null;
};

export default function ReportPreviewPanel({ report }: Props) {
  if (!report) {
    return (
      <div className="rounded-xl border bg-white p-3 text-xs text-gray-500">
        <div className="font-semibold uppercase tracking-wide text-gray-600">Report preview</div>
        <div className="mt-2">Generate a report to preview content.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold uppercase tracking-wide text-gray-600">Report preview</div>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">{report.audience}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-gray-900">{report.title}</div>
      <div className="mt-1 text-[11px] text-gray-600">{report.summaryLine}</div>
      <ul className="mt-2 list-disc pl-4 text-[11px]">
        {report.keyPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="mt-2 space-y-2">
        {report.sections.map((section) => (
          <div key={section.id} className="rounded border bg-gray-50 p-2">
            <div className="font-semibold">{section.title}</div>
            <div className="mt-1 text-[11px] text-gray-600">{section.kind}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
