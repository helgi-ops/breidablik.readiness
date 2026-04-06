"use client";

import { listReportTemplates, type ReportFormat, type ReportScope, type ReportTemplateKey } from "@/lib/micropulse/reporting";

type Props = {
  templateKey: ReportTemplateKey;
  scope: ReportScope;
  formats: ReportFormat[];
  onChange: (next: { templateKey: ReportTemplateKey; scope: ReportScope; formats: ReportFormat[] }) => void;
};

const ALL_FORMATS: ReportFormat[] = ["PDF", "EMAIL", "CSV", "JSON"];

export default function ReportTemplateSelector({ templateKey, scope, formats, onChange }: Props) {
  const templates = listReportTemplates();
  const current = templates.find((t) => t.key === templateKey) ?? templates[0];

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Template selector</div>
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <select
          value={templateKey}
          onChange={(e) => onChange({ templateKey: e.target.value as ReportTemplateKey, scope, formats })}
          className="rounded border px-2 py-1"
        >
          {templates.map((template) => (
            <option key={template.key} value={template.key}>
              {template.key.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select value={scope} onChange={(e) => onChange({ templateKey, scope: e.target.value as ReportScope, formats })} className="rounded border px-2 py-1">
          <option value="TEAM">TEAM</option>
          <option value="MULTI_TEAM">MULTI TEAM</option>
          <option value="ORGANIZATION">ORGANIZATION</option>
        </select>
        <div className="rounded border bg-gray-50 px-2 py-1">Audience: {current.audience}</div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {ALL_FORMATS.map((format) => {
          const selected = formats.includes(format);
          return (
            <button
              key={format}
              type="button"
              onClick={() => {
                const nextFormats = selected ? formats.filter((f) => f !== format) : [...formats, format];
                onChange({ templateKey, scope, formats: nextFormats });
              }}
              className={`rounded border px-2 py-1 text-[11px] ${selected ? "bg-slate-100 font-semibold" : "bg-white"}`}
            >
              {format}
            </button>
          );
        })}
      </div>
    </div>
  );
}
