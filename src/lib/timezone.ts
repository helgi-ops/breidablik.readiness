import "server-only";

function timeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE || "Atlantic/Reykjavik";
}

export function getTodayDateKey(timeZone = getAppTimezone(), now = new Date()): string {
  const { year, month, day } = timeParts(now, timeZone);
  return `${year}-${month}-${day}`;
}

