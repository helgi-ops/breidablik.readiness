import { formatReportForEmailSummary, summarizeReportForRecipient } from "./formatters";
import type { ReportDistributionResult, ReportDocument, ReportExportArtifact, ReportFormat, ReportRecipient } from "./types";

export function buildEmailDistributionPayload(args: {
  report: ReportDocument;
  recipient: ReportRecipient;
  includeSummary?: boolean;
  artifacts?: ReportExportArtifact[];
}): {
  to: string;
  subject: string;
  body: string;
  attachments: Array<{ fileName: string }>;
} | null {
  if (!args.recipient.email || !args.recipient.enabled) return null;
  const summary = args.includeSummary === false ? "" : formatReportForEmailSummary(args.report);
  return {
    to: args.recipient.email,
    subject: `MicroPulse Report: ${args.report.title}`,
    body: `${summarizeReportForRecipient(args.report, args.recipient)}\n\n${summary}`,
    attachments: (args.artifacts ?? [])
      .filter((a) => a.format === "PDF" || a.format === "CSV" || a.format === "JSON")
      .map((a) => ({ fileName: a.fileName ?? `${a.format.toLowerCase()}-artifact` })),
  };
}

export function buildReportDistributionPlan(args: {
  report: ReportDocument;
  recipients: ReportRecipient[];
  formats: ReportFormat[];
}): {
  reportId: string;
  recipients: ReportRecipient[];
  channels: ReportFormat[];
  summary: string;
} {
  const recipients = args.recipients.filter((r) => r.enabled);
  return {
    reportId: args.report.id,
    recipients,
    channels: args.formats,
    summary: `${recipients.length} recipients via ${args.formats.join(", ")}.`,
  };
}

/** Distribution boundary; currently records deterministic simulated delivery result. */
export function distributeReport(args: {
  report: ReportDocument;
  recipients: ReportRecipient[];
  formats: ReportFormat[];
}): ReportDistributionResult {
  const recipients = args.recipients.filter((r) => r.enabled && (!!r.email || args.formats.some((f) => f !== "EMAIL")));
  const successCount = recipients.length;
  const failureCount = args.recipients.filter((r) => r.enabled).length - successCount;

  return {
    reportId: args.report.id,
    recipientCount: recipients.length,
    channelsUsed: args.formats,
    successCount,
    failureCount,
    summary: `Distribution prepared: ${successCount} success-ready, ${failureCount} blocked (missing target details).`,
  };
}

export function summarizeDistributionResult(result: ReportDistributionResult): string {
  return `${result.successCount}/${result.recipientCount} distribution-ready via ${result.channelsUsed.join(", ")}.`;
}
