"use client";

import type { ReportDistributionResult, ReportDocument, ReportFormat } from "@/lib/micropulse/reporting";

type Props = {
  report: ReportDocument | null;
  selectedFormats: ReportFormat[];
  onGenerate: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onPreparePdf: () => void;
  onDistribute: () => void;
  distributionResult: ReportDistributionResult | null;
};

export default function ExportActionsBar({
  report,
  selectedFormats,
  onGenerate,
  onExportJson,
  onExportCsv,
  onPreparePdf,
  onDistribute,
  distributionResult,
}: Props) {
  const disabled = !report;
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onGenerate} className="rounded bg-black px-3 py-1.5 text-white">
          Generate report
        </button>
        <button type="button" onClick={onExportJson} disabled={disabled} className="rounded border px-3 py-1.5 disabled:opacity-50">
          Export JSON
        </button>
        <button type="button" onClick={onExportCsv} disabled={disabled} className="rounded border px-3 py-1.5 disabled:opacity-50">
          Export CSV
        </button>
        <button type="button" onClick={onPreparePdf} disabled={disabled} className="rounded border px-3 py-1.5 disabled:opacity-50">
          Download PDF
        </button>
        <button type="button" onClick={onDistribute} disabled={disabled || selectedFormats.length === 0} className="rounded border px-3 py-1.5 disabled:opacity-50">
          Queue distribution
        </button>
      </div>
      {distributionResult ? <div className="mt-2 text-[11px] text-gray-600">{distributionResult.summary}</div> : null}
    </div>
  );
}
