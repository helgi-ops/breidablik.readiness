/**
 * matchLabel — format a match opponent + venue consistently.
 *
 * Coaches sometimes type the venue straight into the opponent name ("FH (H)")
 * AND set the home/away flag, so naive `${opponent} (H)` rendering doubles up
 * ("FH (H) (H)"). The home/away flag is the single source of truth: strip any
 * venue token already in the name, then append the flag's venue once. When no
 * flag is set, leave whatever the coach typed untouched (don't lose their note).
 */

// Trailing "(H)" / "(A)" / "(Home)" / "(Away)" / "(Heima)" / "(Úti)" etc.
const VENUE_TOKEN = /\s*\((?:h|a|home|away|heima|úti|uti|heimaleikur|útileikur|utileikur)\)\s*$/i;

/** Remove any trailing venue marker(s) the coach typed into the opponent name. */
export function stripVenue(name: string): string {
  let s = name.trim();
  while (VENUE_TOKEN.test(s)) s = s.replace(VENUE_TOKEN, "").trim();
  return s;
}

/**
 * Canonical match label. `isHome` (the flag) decides the venue; the typed venue
 * is stripped so it never appears twice. `isHome == null` → return the coach's
 * text as-is (the flag isn't set, so don't strip their hand-written venue).
 */
export function formatMatchLabel(
  opponent: string | null | undefined,
  isHome: boolean | null | undefined,
  labels: { home: string; away: string },
): string {
  const base = (opponent ?? "—").trim();
  if (isHome == null) return base;
  return `${stripVenue(base)} (${isHome ? labels.home : labels.away})`;
}
