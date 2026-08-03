import type { ReportTemplateDefinition, ReportTemplateKey } from "./types";

export const REPORT_TEMPLATES: Record<ReportTemplateKey, ReportTemplateDefinition> = {
  TEAM_DAILY_SUMMARY: {
    key: "TEAM_DAILY_SUMMARY",
    audience: "COACHING",
    defaultScope: "TEAM",
    recommendedFormats: ["EMAIL", "PDF", "JSON"],
    defaultFrequency: "DAILY",
    titleBuilder: (ctx) => `${ctx?.teamName ?? "Team"} Daily Summary`,
    sectionIntent: ["Team status", "Risk and action", "Workflow/delivery"],
  },
  TEAM_WEEKLY_SUMMARY: {
    key: "TEAM_WEEKLY_SUMMARY",
    audience: "COACHING",
    defaultScope: "TEAM",
    recommendedFormats: ["PDF", "EMAIL", "CSV"],
    defaultFrequency: "WEEKLY",
    titleBuilder: (ctx) => `${ctx?.teamName ?? "Team"} Weekly Summary`,
    sectionIntent: ["Weekly operations", "Risk trends", "Completion trends"],
  },
  MEDICAL_RISK_REPORT: {
    key: "MEDICAL_RISK_REPORT",
    audience: "MEDICAL",
    defaultScope: "MULTI_TEAM",
    recommendedFormats: ["PDF", "EMAIL", "JSON"],
    defaultFrequency: "DAILY",
    titleBuilder: (ctx) => `${ctx?.organizationName ?? "Org"} Medical Risk Report`,
    sectionIntent: ["High/critical risk", "Recovery load", "Teams needing review"],
  },
  PERFORMANCE_OVERVIEW: {
    key: "PERFORMANCE_OVERVIEW",
    audience: "PERFORMANCE",
    defaultScope: "MULTI_TEAM",
    recommendedFormats: ["PDF", "EMAIL", "CSV"],
    defaultFrequency: "WEEKLY",
    titleBuilder: (ctx) => `${ctx?.organizationName ?? "Org"} Performance Overview`,
    sectionIntent: ["Instability and peak windows", "Load profile", "Team comparison"],
  },
  EXECUTIVE_WEEKLY_BRIEF: {
    key: "EXECUTIVE_WEEKLY_BRIEF",
    audience: "EXECUTIVE",
    defaultScope: "ORGANIZATION",
    recommendedFormats: ["PDF", "EMAIL"],
    defaultFrequency: "WEEKLY",
    titleBuilder: (ctx) => `${ctx?.organizationName ?? "Organization"} Executive Weekly Brief`,
    sectionIntent: ["Top summary", "Risks", "Action items"],
  },
  ORG_MULTI_TEAM_SUMMARY: {
    key: "ORG_MULTI_TEAM_SUMMARY",
    audience: "ADMIN",
    defaultScope: "MULTI_TEAM",
    recommendedFormats: ["PDF", "CSV", "JSON"],
    defaultFrequency: "WEEKLY",
    titleBuilder: (ctx) => `${ctx?.organizationName ?? "Organization"} Multi-team Summary`,
    sectionIntent: ["Cross-team status", "Comparison", "Attention queue"],
  },
  DELIVERY_WORKFLOW_REPORT: {
    key: "DELIVERY_WORKFLOW_REPORT",
    audience: "ADMIN",
    defaultScope: "MULTI_TEAM",
    recommendedFormats: ["EMAIL", "CSV", "JSON"],
    defaultFrequency: "DAILY",
    titleBuilder: (ctx) => `${ctx?.organizationName ?? "Organization"} Delivery Workflow Report`,
    sectionIntent: ["Workflow backlog", "Delivery completion", "Pending attention"],
  },
  RTP_ASSESSMENT: {
    key: "RTP_ASSESSMENT",
    audience: "MEDICAL",
    defaultScope: "TEAM",
    recommendedFormats: ["PDF"],
    defaultFrequency: "MANUAL",
    titleBuilder: (ctx) => `${ctx?.teamName ?? "Player"} Return-to-Play Assessment`,
    sectionIntent: ["Injury context", "Force-plate battery", "Asymmetry", "Clearance decision"],
  },
};

export function getReportTemplate(key: ReportTemplateKey): ReportTemplateDefinition {
  return REPORT_TEMPLATES[key];
}

export function listReportTemplates(): ReportTemplateDefinition[] {
  return Object.values(REPORT_TEMPLATES);
}
