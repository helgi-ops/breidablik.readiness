"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildReportDistributionPlan,
  buildReportDocument,
  buildReportExportArtifacts,
  buildReportHistoryRecord,
  distributeReport,
  exportReportAsCsv,
  exportReportAsJson,
  exportReportAsPdfModel,
  getReportTemplate,
  listReportTemplates,
  loadReportExportArtifacts,
  loadReportHistory,
  loadReportRecipientConfig,
  loadReportScheduleConfigs,
  saveReportExportArtifact,
  saveReportHistoryRecord,
  saveReportRecipientConfig,
  saveReportScheduleConfig,
  type ReportDistributionResult,
  type ReportDocument,
  type ReportFormat,
  type ReportRecipient,
  type ReportScheduleConfig,
  type ReportScope,
  type ReportTemplateKey,
} from "@/lib/micropulse/reporting";
import ReportTemplateSelector from "./ReportTemplateSelector";
import ReportPreviewPanel from "./ReportPreviewPanel";
import ExportActionsBar from "./ExportActionsBar";
import ReportSchedulePanel from "./ReportSchedulePanel";
import ReportRecipientManager from "./ReportRecipientManager";
import ReportHistoryPanel from "./ReportHistoryPanel";
import { downloadReportPdf } from "./ReportPdf";

function defaultSchedule(templateKey: ReportTemplateKey): ReportScheduleConfig {
  const tpl = getReportTemplate(templateKey);
  return {
    id: `schedule:${templateKey.toLowerCase()}`,
    templateKey,
    scope: tpl.defaultScope,
    frequency: tpl.defaultFrequency,
    enabled: false,
    organizationId: "default-org",
    teamId: null,
    recipients: [],
    sendFormat: tpl.recommendedFormats,
    localTime: "09:00",
    dayOfWeek: 1,
    includeAttachments: true,
    includeEmailSummary: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function downloadText(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportingCenterPage() {
  const templates = listReportTemplates();
  const [templateKey, setTemplateKey] = useState<ReportTemplateKey>(templates[0].key);
  const [scope, setScope] = useState<ReportScope>(templates[0].defaultScope);
  const [formats, setFormats] = useState<ReportFormat[]>(templates[0].recommendedFormats);
  const [report, setReport] = useState<ReportDocument | null>(null);
  const [distributionResult, setDistributionResult] = useState<ReportDistributionResult | null>(null);
  const [history, setHistory] = useState(() => loadReportHistory());
  const [schedules, setSchedules] = useState<ReportScheduleConfig[]>(() => {
    const existing = loadReportScheduleConfigs();
    if (existing.length) return existing;
    return templates.map((t) => defaultSchedule(t.key));
  });
  const [recipients, setRecipients] = useState<ReportRecipient[]>(() => loadReportRecipientConfig(templateKey));

  useEffect(() => {
    setRecipients(loadReportRecipientConfig(templateKey));
  }, [templateKey]);

  const artifacts = useMemo(() => (report ? loadReportExportArtifacts(report.id) : []), [report]);

  function persistSchedules(next: ReportScheduleConfig[]) {
    setSchedules(next);
    for (const schedule of next) saveReportScheduleConfig(schedule);
  }

  function generateReport() {
    const nextReport = buildReportDocument(templateKey, {
      organizationId: "default-org",
      organizationName: "MicroPulse Organization",
      teamId: scope === "TEAM" ? "default-team" : null,
      teamName: scope === "TEAM" ? "Default Team" : null,
      generatedForDate: new Date().toISOString().slice(0, 10),
    });
    nextReport.scope = scope;
    nextReport.exportFormats = formats;
    setReport(nextReport);

    const historyRecord = buildReportHistoryRecord({
      report: nextReport,
      generatedBy: "coach",
      frequency: "MANUAL",
      distribution: null,
    });
    saveReportHistoryRecord(historyRecord);
    setHistory(loadReportHistory());
  }

  function exportJson() {
    if (!report) return;
    const json = exportReportAsJson(report);
    downloadText(`${report.templateKey.toLowerCase()}.json`, json);
    for (const artifact of buildReportExportArtifacts(report, ["JSON"])) saveReportExportArtifact(artifact);
    setHistory(loadReportHistory());
  }

  function exportCsv() {
    if (!report) return;
    const csv = exportReportAsCsv(report);
    downloadText(`${report.templateKey.toLowerCase()}.csv`, csv);
    for (const artifact of buildReportExportArtifacts(report, ["CSV"])) saveReportExportArtifact(artifact);
    setHistory(loadReportHistory());
  }

  async function preparePdf() {
    if (!report) return;
    const pdfModel = exportReportAsPdfModel(report);
    const dateStr = report.generatedForDate ?? new Date().toISOString().slice(0, 10);
    await downloadReportPdf(pdfModel, `${report.templateKey.toLowerCase()}-${dateStr}.pdf`);
    for (const artifact of buildReportExportArtifacts(report, ["PDF"])) saveReportExportArtifact(artifact);
    setHistory(loadReportHistory());
  }

  function distribute() {
    if (!report) return;
    const plan = buildReportDistributionPlan({ report, recipients, formats });
    const result = distributeReport({ report, recipients: plan.recipients, formats: plan.channels });
    setDistributionResult(result);

    const historyRecord = buildReportHistoryRecord({
      report,
      generatedBy: "coach",
      frequency: "MANUAL",
      distribution: result,
    });
    saveReportHistoryRecord(historyRecord);

    for (const artifact of buildReportExportArtifacts(report, formats)) saveReportExportArtifact(artifact);
    setHistory(loadReportHistory());
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reporting Center</h1>
        <p className="text-sm text-gray-600">Manual and scheduled report generation with role-aware templates, export models, and distribution boundaries.</p>
      </div>

      <ReportTemplateSelector
        templateKey={templateKey}
        scope={scope}
        formats={formats}
        onChange={(next) => {
          setTemplateKey(next.templateKey);
          setScope(next.scope);
          setFormats(next.formats);
        }}
      />

      <ExportActionsBar
        report={report}
        selectedFormats={formats}
        onGenerate={generateReport}
        onExportJson={exportJson}
        onExportCsv={exportCsv}
        onPreparePdf={preparePdf}
        onDistribute={distribute}
        distributionResult={distributionResult}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportPreviewPanel report={report} />
        <ReportRecipientManager
          recipients={recipients}
          onChange={(next) => {
            setRecipients(next);
            saveReportRecipientConfig(templateKey, next);
          }}
        />
      </div>

      <ReportSchedulePanel
        schedules={schedules}
        onToggleEnabled={(id) => {
          persistSchedules(schedules.map((schedule) => (schedule.id === id ? { ...schedule, enabled: !schedule.enabled, updatedAt: new Date().toISOString() } : schedule)));
        }}
        onSave={(config) => {
          persistSchedules(schedules.map((schedule) => (schedule.id === config.id ? { ...config, updatedAt: new Date().toISOString() } : schedule)));
        }}
      />

      <ReportHistoryPanel history={history} />

      {artifacts.length ? (
        <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Recent artifacts for preview report</div>
          <div className="mt-2 space-y-1">
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="rounded border bg-gray-50 px-2 py-1">
                {artifact.format} · {artifact.fileName} · {artifact.status}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
