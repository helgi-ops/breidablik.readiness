import type { ReportDocument, ReportDistributionResult, ReportHistoryRecord } from "./types";

function historyId(templateKey: string) {
  return `report-history:${templateKey}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
}

export function buildReportHistoryRecord(args: {
  report: ReportDocument;
  generatedBy?: string | null;
  frequency?: ReportHistoryRecord["frequency"];
  distribution?: ReportDistributionResult | null;
}): ReportHistoryRecord {
  return {
    id: historyId(args.report.templateKey),
    templateKey: args.report.templateKey,
    generatedAt: args.report.generatedAt ?? new Date().toISOString(),
    generatedBy: args.generatedBy ?? null,
    frequency: args.frequency ?? "MANUAL",
    scope: args.report.scope,
    organizationId: args.report.organizationId ?? null,
    teamId: args.report.teamId ?? null,
    formats: args.report.exportFormats,
    recipientCount: args.distribution?.recipientCount ?? null,
    summary: args.distribution?.summary ?? args.report.summaryLine,
  };
}

export function summarizeReportHistory(records: ReportHistoryRecord[]): string {
  if (!records.length) return "No reports generated yet.";
  return `${records.length} reports generated. Latest: ${records[0]?.templateKey ?? "-"}.`;
}

export function listRecentReportsSummary(records: ReportHistoryRecord[], limit = 5): string[] {
  return [...records]
    .sort((a, b) => String(b.generatedAt ?? "").localeCompare(String(a.generatedAt ?? "")))
    .slice(0, limit)
    .map((record) => `${record.templateKey} · ${record.generatedAt ?? "-"} · ${record.summary}`);
}
