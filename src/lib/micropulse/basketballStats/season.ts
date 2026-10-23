/**
 * Icelandic basketball season helpers (pure, no IO). The domestic season runs ~Aug→May and is
 * labelled "YYYY-YY" (e.g. "2026-27"). Used to tag ingested games and to scope a player's game
 * report to the CURRENT season so last season's games don't linger in the Match tab.
 */

/** The season label for a date — the season that August..December of year Y belongs to is "Y-(Y+1)". */
export function currentBasketballSeasonLabel(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1-12
  const start = m >= 8 ? y : y - 1; // Jan-Jul still belongs to the season that started last August
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Leading (start) year of a "YYYY-YY"/"YYYY-YYYY" label, or null when it is not a season label
 *  (e.g. a bare numeric KKÍ id, or null). */
export function seasonStartYear(label: string | null | undefined): number | null {
  const m = /^(\d{4})-\d{2,4}$/.exec(String(label ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** The newest season label in a set, by start year; null when none are season-shaped. */
export function latestSeason(labels: Array<string | null | undefined>): string | null {
  let best: { label: string; y: number } | null = null;
  for (const l of labels) {
    const y = seasonStartYear(l);
    if (y == null) continue;
    if (!best || y > best.y) best = { label: String(l), y };
  }
  return best?.label ?? null;
}
