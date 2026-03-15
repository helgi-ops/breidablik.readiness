import type { ReportFrequency, ReportScheduleConfig } from "./types";

function weekdayLocal(now: Date): number {
  return now.getDay();
}

function hhmm(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** Determines if a scheduled report should run at current local time. */
export function shouldGenerateScheduledReport(config: ReportScheduleConfig, now = new Date()): boolean {
  if (!config.enabled) return false;
  if (config.frequency === "MANUAL") return false;

  const nowTime = hhmm(now);
  const targetTime = config.localTime ?? "09:00";
  if (nowTime < targetTime) return false;

  if (config.frequency === "DAILY") return true;
  if (config.frequency === "WEEKLY") {
    const dow = config.dayOfWeek ?? 1;
    return weekdayLocal(now) === dow;
  }

  return false;
}

export function buildScheduledReportRun(config: ReportScheduleConfig, now = new Date()): {
  scheduleId: string;
  templateKey: ReportScheduleConfig["templateKey"];
  due: boolean;
  frequency: ReportFrequency;
  summary: string;
} {
  const due = shouldGenerateScheduledReport(config, now);
  return {
    scheduleId: config.id,
    templateKey: config.templateKey,
    due,
    frequency: config.frequency,
    summary: due
      ? `Scheduled run due for ${config.templateKey} (${config.frequency.toLowerCase()}).`
      : `No run due now for ${config.templateKey}.`,
  };
}

export function summarizeScheduleConfig(config: ReportScheduleConfig): string {
  if (config.frequency === "MANUAL") return "Manual only.";
  if (config.frequency === "DAILY") return `Daily at ${config.localTime ?? "09:00"}.`;
  return `Weekly on day ${config.dayOfWeek ?? 1} at ${config.localTime ?? "09:00"}.`;
}
