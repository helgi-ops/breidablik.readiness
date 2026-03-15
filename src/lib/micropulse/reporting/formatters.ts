import type { ReportDocument, ReportRecipient } from "./types";

/** Formats concise email body summary for a report document. */
export function formatReportForEmailSummary(report: ReportDocument): string {
  const points = report.keyPoints.slice(0, 5).map((p) => `- ${p}`).join("\n");
  return `${report.title}\n\n${report.summaryLine}\n\n${points}`;
}

function flattenSectionData(sectionData: unknown): Record<string, string | number | boolean | null> {
  if (!sectionData || typeof sectionData !== "object") return { value: String(sectionData ?? "") };
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(sectionData as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v == null) {
      out[k] = v as string | number | boolean | null;
    }
  }
  return out;
}

/** Converts report sections to flat CSV rows where possible. */
export function formatReportForCsv(report: ReportDocument): string {
  const rows: Array<Record<string, string | number | boolean | null>> = [];
  for (const section of report.sections) {
    if (Array.isArray(section.data)) {
      for (const row of section.data) {
        rows.push({ section: section.title, ...flattenSectionData(row) });
      }
    } else {
      rows.push({ section: section.title, ...flattenSectionData(section.data) });
    }
  }

  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csvRows = [headers.join(",")];
  for (const row of rows) {
    csvRows.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  return csvRows.join("\n");
}

export function formatReportForJson(report: ReportDocument): string {
  return JSON.stringify(report, null, 2);
}

export function summarizeReportForRecipient(report: ReportDocument, recipient: ReportRecipient): string {
  const target = recipient.name || recipient.email || "recipient";
  return `${target}: ${report.summaryLine}`;
}
