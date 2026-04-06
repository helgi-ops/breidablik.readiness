import type {
  ReportExportArtifact,
  ReportHistoryRecord,
  ReportRecipient,
  ReportScheduleConfig,
  ReportTemplateKey,
} from "./types";

const SCHEDULES_KEY = "micropulse.reporting.schedules.v1";
const HISTORY_KEY = "micropulse.reporting.history.v1";
const ARTIFACTS_KEY = "micropulse.reporting.artifacts.v1";
const RECIPIENTS_KEY = "micropulse.reporting.recipients.v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** Persistence boundary for reporting configs/history/artifacts. */
export function saveReportScheduleConfig(config: ReportScheduleConfig): ReportScheduleConfig {
  const all = loadReportScheduleConfigs();
  writeJson(SCHEDULES_KEY, [config, ...all.filter((x) => x.id !== config.id)]);
  return config;
}

export function loadReportScheduleConfigs(): ReportScheduleConfig[] {
  return readJson<ReportScheduleConfig[]>(SCHEDULES_KEY, []);
}

export function saveReportHistoryRecord(record: ReportHistoryRecord): ReportHistoryRecord {
  const all = loadReportHistory();
  writeJson(HISTORY_KEY, [record, ...all.filter((x) => x.id !== record.id)].slice(0, 1000));
  return record;
}

export function loadReportHistory(): ReportHistoryRecord[] {
  return readJson<ReportHistoryRecord[]>(HISTORY_KEY, []).sort((a, b) => String(b.generatedAt ?? "").localeCompare(String(a.generatedAt ?? "")));
}

export function saveReportExportArtifact(artifact: ReportExportArtifact): ReportExportArtifact {
  const others = readJson<ReportExportArtifact[]>(ARTIFACTS_KEY, []).filter((x) => x.reportId !== artifact.reportId || x.id === artifact.id);
  writeJson(ARTIFACTS_KEY, [artifact, ...others.filter((x) => x.id !== artifact.id)]);
  return artifact;
}

export function loadReportExportArtifacts(reportId?: string): ReportExportArtifact[] {
  const all = readJson<ReportExportArtifact[]>(ARTIFACTS_KEY, []);
  if (!reportId) return all;
  return all.filter((x) => x.reportId === reportId);
}

export function saveReportRecipientConfig(templateKey: ReportTemplateKey, recipients: ReportRecipient[]): ReportRecipient[] {
  const all = readJson<Record<string, ReportRecipient[]>>(RECIPIENTS_KEY, {});
  all[templateKey] = recipients;
  writeJson(RECIPIENTS_KEY, all);
  return recipients;
}

export function loadReportRecipientConfig(templateKey: ReportTemplateKey): ReportRecipient[] {
  const all = readJson<Record<string, ReportRecipient[]>>(RECIPIENTS_KEY, {});
  return all[templateKey] ?? [];
}
