import type { OrgRoleView } from "@/lib/micropulse/orgIntelligence";

export type ReportAudience = "EXECUTIVE" | "MEDICAL" | "PERFORMANCE" | "COACHING" | "ADMIN";
export type ReportScope = "TEAM" | "ORGANIZATION" | "MULTI_TEAM";
export type ReportFormat = "PDF" | "EMAIL" | "CSV" | "JSON";
export type ReportFrequency = "MANUAL" | "DAILY" | "WEEKLY";

export type ReportTemplateKey =
  | "TEAM_DAILY_SUMMARY"
  | "TEAM_WEEKLY_SUMMARY"
  | "MEDICAL_RISK_REPORT"
  | "PERFORMANCE_OVERVIEW"
  | "EXECUTIVE_WEEKLY_BRIEF"
  | "ORG_MULTI_TEAM_SUMMARY"
  | "DELIVERY_WORKFLOW_REPORT";

export type ReportRecipient = {
  id?: string;
  name?: string | null;
  email?: string | null;
  audience?: ReportAudience | null;
  role?: string | null;
  enabled: boolean;
};

export type ReportScheduleConfig = {
  id: string;
  templateKey: ReportTemplateKey;
  scope: ReportScope;
  frequency: ReportFrequency;
  enabled: boolean;
  organizationId?: string | null;
  teamId?: string | null;
  recipients: ReportRecipient[];
  sendFormat: ReportFormat[];
  localTime?: string | null;
  dayOfWeek?: number | null;
  includeAttachments?: boolean;
  includeEmailSummary?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ReportSection = {
  id: string;
  title: string;
  kind: "TEXT" | "METRIC_GRID" | "TABLE" | "LIST";
  data: unknown;
};

export type ReportDocument = {
  id: string;
  templateKey: ReportTemplateKey;
  title: string;
  audience: ReportAudience;
  scope: ReportScope;
  generatedAt?: string | null;
  generatedForDate?: string | null;
  organizationId?: string | null;
  teamId?: string | null;
  summaryLine: string;
  keyPoints: string[];
  sections: ReportSection[];
  exportFormats: ReportFormat[];
  metadata?: Record<string, unknown> | null;
};

export type PdfRenderModel = {
  title: string;
  subtitle?: string | null;
  generatedAt?: string | null;
  summaryLine: string;
  sections: Array<{
    title: string;
    kind: "TEXT" | "METRIC_GRID" | "TABLE" | "LIST";
    rows?: unknown[];
    text?: string[];
  }>;
  footerNote?: string | null;
};

export type ReportExportArtifact = {
  id: string;
  reportId: string;
  format: ReportFormat;
  fileName?: string | null;
  storagePath?: string | null;
  generatedAt?: string | null;
  status: "PENDING" | "GENERATED" | "FAILED";
};

export type ReportDistributionResult = {
  reportId: string;
  recipientCount: number;
  channelsUsed: ReportFormat[];
  successCount: number;
  failureCount: number;
  summary: string;
};

export type ReportHistoryRecord = {
  id: string;
  templateKey: ReportTemplateKey;
  generatedAt?: string | null;
  generatedBy?: string | null;
  frequency?: ReportFrequency | null;
  scope: ReportScope;
  organizationId?: string | null;
  teamId?: string | null;
  formats: ReportFormat[];
  recipientCount?: number | null;
  summary: string;
};

export type ReportTemplateDefinition = {
  key: ReportTemplateKey;
  audience: ReportAudience;
  defaultScope: ReportScope;
  recommendedFormats: ReportFormat[];
  defaultFrequency: ReportFrequency;
  titleBuilder: (ctx?: { teamName?: string | null; organizationName?: string | null; date?: string | null }) => string;
  sectionIntent: string[];
};

export type ReportBuildContext = {
  organizationId?: string | null;
  organizationName?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  generatedForDate?: string | null;
  roleView?: OrgRoleView;
};
