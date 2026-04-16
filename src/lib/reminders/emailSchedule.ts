import "server-only";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import type { TrainingSlotsConfig } from "@/lib/config/teamTrainingSlots";

export type EmailReminderType = "readiness" | "rpe";

export type EmailScheduleMatch = {
  type: EmailReminderType;
  slotKey: string;
  localTime: string;
  dateKey: string;
  timeZone: string;
} | null;

function localParts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayRaw = get("weekday").toLowerCase();
  const weekday = weekdayRaw === "sun" ? 0 : weekdayRaw === "mon" ? 1 : weekdayRaw === "tue" ? 2 : weekdayRaw === "wed" ? 3 : weekdayRaw === "thu" ? 4 : weekdayRaw === "fri" ? 5 : 6;
  const hour = Number(get("hour") || 0);
  const minute = Number(get("minute") || 0);
  return { weekday, minuteOfDay: hour * 60 + minute };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function matchReadinessEmailSchedule(args?: {
  now?: Date;
  timeZone?: string;
  toleranceMinutes?: number;
  teamOverride?: TrainingSlotsConfig | null;
}): EmailScheduleMatch {
  const now = args?.now ?? new Date();
  const timeZone = args?.timeZone ?? getOperationalTimezone();
  const tolerance = args?.toleranceMinutes ?? 6;
  const dateKey = getDateKeyInTimezone(now, timeZone);
  const { minuteOfDay } = localParts(now, timeZone);
  const localTime = args?.teamOverride?.readiness_reminder_time ?? "09:00";
  const target = hhmmToMinutes(localTime);

  if (Math.abs(minuteOfDay - target) > tolerance) return null;
  return {
    type: "readiness",
    slotKey: `daily_${localTime.replace(":", "")}`,
    localTime,
    dateKey,
    timeZone,
  };
}

export function matchRpeEmailSchedule(args?: {
  now?: Date;
  timeZone?: string;
  toleranceMinutes?: number;
  teamOverride?: TrainingSlotsConfig | null;
}): EmailScheduleMatch {
  const now = args?.now ?? new Date();
  const timeZone = args?.timeZone ?? getOperationalTimezone();
  const tolerance = args?.toleranceMinutes ?? 6;
  const dateKey = getDateKeyInTimezone(now, timeZone);
  const { weekday, minuteOfDay } = localParts(now, timeZone);

  const override = args?.teamOverride ?? null;
  const defaultWeekday = override?.rpe_email_time_weekday ?? "14:00";
  const defaultTueThu = override?.rpe_email_time_tue_thu ?? "16:30";
  const target = weekday === 2 || weekday === 4 ? defaultTueThu : defaultWeekday;
  const targetMinute = hhmmToMinutes(target);

  if (Math.abs(minuteOfDay - targetMinute) > tolerance) return null;
  return {
    type: "rpe",
    slotKey: `daily_${target.replace(":", "")}`,
    localTime: target,
    dateKey,
    timeZone,
  };
}
