import { formatReportForCsv, formatReportForJson } from "./formatters";
import { buildPdfRenderModel } from "./pdfModel";
import type { PdfRenderModel, ReportDocument, ReportExportArtifact, ReportFormat } from "./types";

function artifactId(reportId: string, format: ReportFormat) {
  return `artifact:${reportId}:${format}:${Date.now()}`;
}

export function exportReportAsJson(report: ReportDocument): string {
  return formatReportForJson(report);
}

export function exportReportAsCsv(report: ReportDocument): string {
  return formatReportForCsv(report);
}

/** Returns structured PDF model; binary rendering can be wired later. */
export function exportReportAsPdfModel(report: ReportDocument): PdfRenderModel {
  return buildPdfRenderModel(report);
}

export function buildReportExportArtifacts(report: ReportDocument, formats: ReportFormat[]): ReportExportArtifact[] {
  return formats.map((format) => ({
    id: artifactId(report.id, format),
    reportId: report.id,
    format,
    fileName: `${report.templateKey.toLowerCase()}-${(report.generatedForDate ?? "today")}.${format.toLowerCase() === "email" ? "txt" : format.toLowerCase()}`,
    storagePath: null,
    generatedAt: new Date().toISOString(),
    status: "GENERATED",
  }));
}
