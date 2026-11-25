/**
 * Keep another season's window out of a season row (season_plans.overrides).
 *
 * The hub saves the whole season window (pre-season start, season end, off-season start, next pre-season
 * start, block goals/lengths/deloads) with most edits. When it was saved to the wrong year, Breiðablik's 2027
 * row carried 2026's end (2026-10-24), so the strength engine read April–June 2027 as off-season (2026-11-25).
 * This drops, from an incoming patch only, the dates that cannot belong to `seasonYear`:
 *  - seasonEnd / offseasonStart before the season's own year;
 *  - preseasonStart outside [June of the year before, end of the year] (pre-seasons may open in Nov/Dec);
 *  - nextPreseasonStart before June of the season's year;
 *  - start-keyed block goals / lengths / deloads before June of the year before (index keys always kept).
 * Seasons that run across New Year (basketball) still fit: their dates sit inside these bounds. Pure.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function guardSeasonWindow(seasonYear: number, patch: Record<string, unknown>): { patch: Record<string, unknown>; dropped: string[] } {
  const y = Math.round(seasonYear);
  if (!Number.isFinite(y)) return { patch, dropped: [] };
  const out: Record<string, unknown> = { ...patch };
  const dropped: string[] = [];
  const floorPrev = `${y - 1}-06-01`, floorThis = `${y}-06-01`, yearStart = `${y}-01-01`, yearEnd = `${y}-12-31`;
  const drop = (k: string) => { delete out[k]; dropped.push(k); };
  const iso = (k: string) => (typeof out[k] === "string" && ISO.test(out[k] as string) ? (out[k] as string) : null);

  for (const k of ["seasonEnd", "offseasonStart"]) { const v = iso(k); if (v && v < yearStart) drop(k); }
  { const v = iso("preseasonStart"); if (v && (v < floorPrev || v > yearEnd)) drop("preseasonStart"); }
  { const v = iso("nextPreseasonStart"); if (v && v < floorThis) drop("nextPreseasonStart"); }
  for (const k of ["blockGoals", "blockWeeks", "blockDeload"]) {
    const m = out[k];
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const kept: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(m as Record<string, unknown>)) {
      if (ISO.test(key) && key < floorPrev) { dropped.push(`${k}.${key}`); continue; }
      kept[key] = val;
    }
    out[k] = kept;
  }
  return { patch: out, dropped };
}
