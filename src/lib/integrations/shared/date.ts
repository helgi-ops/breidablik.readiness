/**
 * Converts a Date into UTC YYYY-MM-DD.
 */
export function toIsoDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns an inclusive-exclusive UTC window for one calendar date.
 */
export function getUtcDateWindow(dateString: string): { start: string; end: string } {
  const start = `${dateString}T00:00:00.000Z`;
  const day = new Date(start);
  day.setUTCDate(day.getUTCDate() + 1);
  return { start, end: day.toISOString() };
}

/**
 * Placeholder for future project-local timezone windows.
 * v1 intentionally reuses UTC windows to stay deterministic.
 */
export function maybeProjectLocalDateWindow(dateString: string): { start: string; end: string } {
  return getUtcDateWindow(dateString);
}

