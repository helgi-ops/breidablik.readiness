export type {
  ReportAudience,
  ReportScope,
  ReportFormat,
  ReportFrequency,
  ReportTemplateKey,
  ReportRecipient,
  ReportScheduleConfig,
  ReportSection,
  ReportDocument,
  PdfRenderModel,
  ReportExportArtifact,
  ReportDistributionResult,
  ReportHistoryRecord,
  ReportTemplateDefinition,
  ReportBuildContext,
} from "./types";

export { REPORT_TEMPLATES, getReportTemplate, listReportTemplates } from "./templates";

export {
  buildTeamDailySummaryReport,
  buildTeamWeeklySummaryReport,
  buildMedicalRiskReport,
  buildPerformanceOverviewReport,
  buildExecutiveWeeklyBrief,
  buildOrgMultiTeamSummaryReport,
  buildDeliveryWorkflowReport,
  buildReportDocument,
} from "./builders";

export {
  formatReportForEmailSummary,
  formatReportForCsv,
  formatReportForJson,
  summarizeReportForRecipient,
} from "./formatters";

export { buildPdfRenderModel } from "./pdfModel";

export {
  exportReportAsJson,
  exportReportAsCsv,
  exportReportAsPdfModel,
  buildReportExportArtifacts,
} from "./exporters";

export {
  shouldGenerateScheduledReport,
  buildScheduledReportRun,
  summarizeScheduleConfig,
} from "./schedule";

export {
  buildReportDistributionPlan,
  buildEmailDistributionPayload,
  distributeReport,
  summarizeDistributionResult,
} from "./distribution";

export {
  buildReportHistoryRecord,
  summarizeReportHistory,
  listRecentReportsSummary,
} from "./history";

export {
  saveReportScheduleConfig,
  loadReportScheduleConfigs,
  saveReportHistoryRecord,
  loadReportHistory,
  saveReportExportArtifact,
  loadReportExportArtifacts,
  saveReportRecipientConfig,
  loadReportRecipientConfig,
} from "./persistence";
