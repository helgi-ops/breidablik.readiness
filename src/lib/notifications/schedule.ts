export type ReminderType = "first" | "second" | "manual";

export type ReminderProfile = "standard" | "breidablik_custom" | "none";

export type ScheduledSlot = {
  reminderType: Exclude<ReminderType, "manual">;
  slotKey: string;
  label: string;
  localTime: string;
};

const WEEKDAY_LABELS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Schedule per profile.
//   standard: simple daily schedule — single check-in reminder at 09:00.
//   breidablik_custom: legacy multi-slot schedule (Breiðablik historical).
//   none: no scheduled checkin reminders.
export const reminderSchedules: Record<ReminderProfile, Record<number, readonly string[]>> = {
  standard: {
    0: ["09:00"],
    1: ["09:00"],
    2: ["09:00"],
    3: ["09:00"],
    4: ["09:00"],
    5: ["09:00"],
    6: ["09:00"],
  },
  breidablik_custom: {
    1: ["09:00", "10:00"],
    2: ["12:00", "13:00"],
    3: ["09:00", "10:00"],
    4: ["12:00", "13:00"],
    5: ["09:00", "10:00"],
    6: ["09:00", "10:00"],
    0: ["09:00", "10:00"],
  },
  none: {},
};

// Backwards compat — kept so older imports of `reminderSchedule` keep working.
// Points to the breidablik_custom profile (the historical default).
export const reminderSchedule = reminderSchedules.breidablik_custom;

export function getOperationalTimezone() {
  const raw = String(process.env.APP_TIMEZONE || "Atlantic/Reykjavik").trim();

  // Common alias mistake in env files.
  const normalized = raw === "Europe/Reykjavik" ? "Atlantic/Reykjavik" : raw;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date());
    return normalized;
  } catch {
    return "Atlantic/Reykjavik";
  }
}

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

  const hour = Number(get("hour") || 0);
  const minute = Number(get("minute") || 0);

  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    weekday,
    hour,
    minute,
  };
}

function minutesFromHHMM(hhmm: string) {
  const [h, m] = hhmm.split(":").map((v) => Number(v));
  return h * 60 + m;
}

export function getCurrentScheduledSlot(args?: {
  now?: Date;
  timeZone?: string;
  toleranceMinutes?: number;
  profile?: ReminderProfile;
}): ScheduledSlot | null {
  const timeZone = args?.timeZone || getOperationalTimezone();
  const tolerance = args?.toleranceMinutes ?? 5;
  const now = args?.now ?? new Date();
  const profile: ReminderProfile = args?.profile ?? "breidablik_custom";

  const profileSchedule = reminderSchedules[profile];
  if (!profileSchedule) return null;

  const parts = getDateParts(now, timeZone);
  const slots = profileSchedule[parts.weekday];
  if (!slots || !slots.length) return null;

  const minuteOfDay = parts.hour * 60 + parts.minute;

  for (let i = 0; i < slots.length; i += 1) {
    const hhmm = slots[i]!;
    const slotMinute = minutesFromHHMM(hhmm);
    if (Math.abs(minuteOfDay - slotMinute) <= tolerance) {
      const reminderType: Exclude<ReminderType, "manual"> = i === 0 ? "first" : "second";
      const dayLabel = WEEKDAY_LABELS[parts.weekday];
      return {
        reminderType,
        slotKey: `${dayLabel}_${hhmm.replace(":", "")}`,
        label: `${dayLabel.toUpperCase()} ${hhmm}`,
        localTime: hhmm,
      };
    }
  }

  return null;
}

export function getDateKeyInTimezone(now = new Date(), timeZone = getOperationalTimezone()) {
  return getDateParts(now, timeZone).dateKey;
}

export function getNextScheduledSlot(args?: {
  now?: Date;
  timeZone?: string;
  profile?: ReminderProfile;
}): { weekday: number; slotTime: string; slotKey: string; label: string } {
  const now = args?.now ?? new Date();
  const timeZone = args?.timeZone || getOperationalTimezone();
  const profile: ReminderProfile = args?.profile ?? "breidablik_custom";
  const profileSchedule = reminderSchedules[profile] || {};
  const current = getDateParts(now, timeZone);
  const nowMinute = current.hour * 60 + current.minute;

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const wd = (current.weekday + dayOffset) % 7;
    const slots = profileSchedule[wd] || [];
    for (const slot of slots) {
      const slotMinute = minutesFromHHMM(slot);
      if (dayOffset === 0 && slotMinute <= nowMinute) continue;

      const dayLabel = WEEKDAY_LABELS[wd];
      return {
        weekday: wd,
        slotTime: slot,
        slotKey: `${dayLabel}_${slot.replace(":", "")}`,
        label: `${dayLabel.toUpperCase()} ${slot}`,
      };
    }
  }

  return {
    weekday: current.weekday,
    slotTime: "09:00",
    slotKey: `${WEEKDAY_LABELS[current.weekday]}_0900`,
    label: `${WEEKDAY_LABELS[current.weekday].toUpperCase()} 09:00`,
  };
}
