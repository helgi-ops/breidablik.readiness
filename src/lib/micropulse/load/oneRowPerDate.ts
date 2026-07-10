/**
 * One effective `player_external_load_daily` row per (player,) date.
 *
 * A coach can make a MANUAL GPS entry (`source='manual'`) when a pod was
 * forgotten or broke — e.g. a broken pod logged 1 m of distance and the coach
 * corrects it to the real 2274 m. That manual entry is a CORRECTION and must
 * OVERRIDE the catapult reading for that (player, date) everywhere load is read
 * per player. But the raw table keeps BOTH rows (`catapult` and `manual`) for
 * the day, so a naive per-day series would either show the bogus pod value or
 * double-count the date.
 *
 * `oneRowPerDate` collapses a single player's rows to one per date, with a
 * `source='manual'` row winning over `catapult` (or any other provider) for the
 * same date. Result is sorted by date ascending.
 *
 * SCOPE: this is a PER-PLAYER resolver. Only ever pass rows for ONE player.
 * Never use it to dedupe across players — a team aggregate must first split by
 * player, resolve each player's rows here, then roll up (see `oneRowPerPlayerDate`).
 * Always `SELECT` the `source` column so the resolver can see manual vs catapult.
 */

/** Manual coach entries override the pod reading for the same date. */
const MANUAL_SOURCE = "manual";

/**
 * Collapse ONE player's load rows to one effective row per date; a
 * `source='manual'` row overrides `source='catapult'` (or any other) for that
 * date. Returns rows sorted by date ascending.
 */
export function oneRowPerDate<T extends { date: string; source?: string | null }>(rows: T[]): T[] {
  const byDate = new Map<string, T>();
  for (const r of rows) {
    const d = String(r.date);
    // First row for the date wins by default; a manual row always overrides.
    if (!byDate.has(d) || String(r.source) === MANUAL_SOURCE) byDate.set(d, r);
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * Team-aggregate helper: collapse a multi-player set to one effective row per
 * (player, date) — manual wins per player-date — WITHOUT collapsing across
 * players. Use before rolling multiple players together by date so a
 * manually-corrected day counts once at its corrected value. Sort is by
 * player then date.
 */
export function oneRowPerPlayerDate<T extends { player_id?: string | null; date: string; source?: string | null }>(
  rows: T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const r of rows) {
    const key = `${String(r.player_id ?? "")}|${String(r.date)}`;
    if (!byKey.has(key) || String(r.source) === MANUAL_SOURCE) byKey.set(key, r);
  }
  return [...byKey.values()].sort((a, b) => {
    const p = String(a.player_id ?? "").localeCompare(String(b.player_id ?? ""));
    return p !== 0 ? p : String(a.date).localeCompare(String(b.date));
  });
}
