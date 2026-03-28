import { getOperationalTimezone } from "@/lib/notifications/schedule";

export type RpeReminderType = "first" | "second" | "manual";

export type RpeReminderSlot = {
  reminderType: Exclude<RpeReminderType, "manual">;
  time: string;
  slotKey: string;
  label: string;
};

type WeekdaySlotConfig = Record<number, readonly string[]>;

const DAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// RPE reminder windows — sent AFTER training so players can rate the session.
// Mon/Wed/Fri/Sat: training at 11:00, ends ~12:30 → first reminder 14:00, second 15:00
// Tue/Thu: training at 14:00, ends ~15:30 → first reminder 16:00, second 17:00
// Sun: no training (empty)
export const rpeReminderConfig: {
  weekendEnabled: boolean;
  weekdaySlots: WeekdaySlotConfig;
  copy: Record<RpeReminderType, { title: string; body: string }>;
} = {
  weekendEnabled: true,
  weekdaySlots: {
    1: ["14:00", "15:00"], // Mon — after 11:00 training
    2: ["16:00", "17:00"], // Tue — after 14:00 training
    3: ["14:00", "15:00"], // Wed
    4: ["16:00", "17:00"], // Thu
    5: ["14:00", "15:00"], // Fri
    6: ["14:00", "15:00"], // Sat — after 11:00 training
    0: [],                  // Sun — no training
  },
  copy: {
    first: {
      title: "Session RPE reminder",
      body: "Please rate today's session so the staff can monitor load and recovery.",
    },
    second: {
      title: "Session RPE reminder",
      body: "Please rate today's session so the staff can monitor load and recovery.",
    },
    manual: {
      title: "Session RPE reminder",
      body: "Please rate today's session so the staff can monitor load and recovery.",
    },
  },
};

function getDateParts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayRaw = get("weekday").toLowerCase();
  const weekday =
    weekdayRaw === "sun"
      ? 0
      : weekdayRaw === "mon"
      ? 1
      : weekdayRaw === "tue"
      ? 2
      : weekdayRaw === "wed"
      ? 3
      : weekdayRaw === "thu"
      ? 4
      : weekdayRaw === "fri"
      ? 5
      : 6;
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    weekday,
    hour: Number(get("hour") || 0),
    minute: Number(get("minute") || 0),
  };
}

function getWeekdayFromDateKey(dateKey: string, timeZone: string): number {
  const date = new Date(`${dateKey}T12:00:00Z`);
  return getDateParts(date, timeZone).weekday;
}

function minutesFromHHMM(hhmm: string) {
  const [h, m] = hhmm.split(":").map((v) => Number(v));
  return h * 60 + m;
}

export function getReminderSlotsForDate(date: Date, timeZone = getOperationalTimezone()): RpeReminderSlot[] {
  const parts = getDateParts(date, timeZone);
  const slots = rpeReminderConfig.weekdaySlots[parts.weekday] ?? [];
  if (!rpeReminderConfig.weekendEnabled && (parts.weekday === 0 || parts.weekday === 6)) return [];

  const day = DAY_LABELS[parts.weekday];
  return slots.map((time, index) => ({
    reminderType: index === 0 ? "first" : "second",
    time,
    slotKey: `${day}_${time.replace(":", "")}`,
    label: `${day.toUpperCase()} ${time}`,
  }));
}

export function getReminderSlotsForDateKey(dateKey: string, timeZone = getOperationalTimezone()): RpeReminderSlot[] {
  const weekday = getWeekdayFromDateKey(dateKey, timeZone);
  if (!rpeReminderConfig.weekendEnabled && (weekday === 0 || weekday === 6)) return [];

  const slots = rpeReminderConfig.weekdaySlots[weekday] ?? [];
  const day = DAY_LABELS[weekday];
  return slots.map((time, index) => ({
    reminderType: index === 0 ? "first" : "second",
    time,
    slotKey: `${day}_${time.replace(":", "")}`,
    label: `${day.toUpperCase()} ${time}`,
  }));
}

export function getCurrentScheduledSlot(args?: {
  now?: Date;
  timeZone?: string;
  toleranceMinutes?: number;
}): RpeReminderSlot | null {
  const now = args?.now ?? new Date();
  const timeZone = args?.timeZone ?? getOperationalTimezone();
  const tolerance = args?.toleranceMinutes ?? 6;
  const parts = getDateParts(now, timeZone);
  const slots = getReminderSlotsForDate(now, timeZone);
  if (!slots.length) return null;

  const minuteOfDay = parts.hour * 60 + parts.minute;
  for (const slot of slots) {
    const slotMinute = minutesFromHHMM(slot.time);
    if (Math.abs(minuteOfDay - slotMinute) <= tolerance) {
      return slot;
    }
  }
  return null;
}

export function isPlayerExpectedForRpe(args: {
  dateKey: string;
  timeZone?: string;
  player?: { is_active?: boolean | null } | null;
}): boolean {
  if (args.player?.is_active === false) return false;
  const slots = getReminderSlotsForDateKey(args.dateKey, args.timeZone ?? getOperationalTimezone());
  return slots.length > 0;
}

