/**
 * Session-delivery conflict summary — pure, null-safe.
 *
 * Before a coach sends a block/session onto a player's Today, we want to say honestly what it will
 * replace. Two things can already occupy those dates (see docs/session-delivery-model.md):
 *   1. an existing `player_today_strength_override` row (another coach send — block/session/corrective/
 *      auto). The override layer wins per date, so a new send overwrites it (same `player_id,entry_date`).
 *   2. an active per-player `custom_template_sets` window (a Custom Programme). The override layer sits
 *      ABOVE the periodised Custom Programme layer, so a sent day supersedes the Custom Programme on that
 *      date. We report window-level overlap (which is what the coach needs to know), not per-MD-day.
 *
 * This module has NO IO — the route fetches the rows and calls `summarizeDeliveryConflicts`. Never the
 * readiness colour; advisory only.
 */

export interface OverrideRow {
  entry_date: string;
  title?: string | null;
  origin?: string | null;
}

export interface CustomWindow {
  set_name?: string | null;
  table_name?: string | null;
  start_date: string;
  end_date: string;
  md_days?: string[] | null;
  note?: string | null;
}

export interface DeliveryConflicts {
  /** Target dates that already carry a coach-sent override (will be overwritten). */
  overrideDates: Array<{ date: string; title: string | null; origin: string | null }>;
  overrideCount: number;
  /** Active Custom Programme windows overlapping the target dates (will be superseded on those dates). */
  customWindows: Array<{ setName: string | null; note: string | null; startDate: string; endDate: string; daysCovered: number }>;
  supersedesCustom: boolean;
}

/** ISO yyyy-mm-dd compares correctly as a plain string, so no Date parsing is needed. */
function inWindow(dateIso: string, startIso: string, endIso: string): boolean {
  return dateIso >= startIso && dateIso <= endIso;
}

export function summarizeDeliveryConflicts(
  targetDates: string[],
  overrides: OverrideRow[] | null | undefined,
  windows: CustomWindow[] | null | undefined,
): DeliveryConflicts {
  const targets = new Set((targetDates ?? []).filter(Boolean));

  const overrideDates = (overrides ?? [])
    .filter((o) => o?.entry_date && targets.has(o.entry_date))
    .map((o) => ({ date: o.entry_date, title: o.title ?? null, origin: o.origin ?? null }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const customWindows = (windows ?? [])
    .map((w) => ({
      setName: w.set_name ?? null,
      note: w.note ?? null,
      startDate: w.start_date,
      endDate: w.end_date,
      daysCovered: [...targets].filter((d) => inWindow(d, w.start_date, w.end_date)).length,
    }))
    .filter((w) => w.daysCovered > 0)
    .sort((a, b) => b.daysCovered - a.daysCovered);

  return {
    overrideDates,
    overrideCount: overrideDates.length,
    customWindows,
    supersedesCustom: customWindows.length > 0,
  };
}
