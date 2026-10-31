/**
 * Shared player-name matcher for external-load ingests (Titan, Kinexon, …).
 *
 * IMU/GPS exports strip accents and sometimes reorder names or prefix a smashed
 * username, so the roster (accented, "Last, First" or "First Last") and the
 * export must compare on a common, accent-free, word-order-independent key.
 *
 * Extracted from the Titan ingest so every provider resolves names identically.
 * Pure (no IO): build a resolver from the roster, then resolve each export name.
 */

/** Fold Icelandic/diacritic letters to ASCII — "Björk"→"Bjork",
 *  "Sverrisdóttir"→"Sverrisdottir". NFD strips combining marks; ð/þ/æ/ø/ö map
 *  explicitly (they don't decompose). */
export const foldDiacritics = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/ö/g, "o");

/** Case/spacing/punctuation- AND accent-insensitive name key. */
export const normName = (s: string): string =>
  foldDiacritics(s.toLowerCase()).replace(/[,._]/g, " ").replace(/\s+/g, " ").trim();

/** Word-order-independent key so "Jón Ari" matches "Ari, Jón". */
export const tokenKey = (s: string): string => normName(s).split(" ").filter(Boolean).sort().join(" ");

/**
 * Some exports prefix a smashed lowercase username token
 * (e.g. "helenarafns Helena Rafnsdóttir"). Strip a leading all-lowercase,
 * space-less token when a properly-capitalised real name follows (≥2 more
 * tokens, the next starting uppercase). Conservative — never a genuine lowercase
 * forename.
 */
export function stripLeadingUsername(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 3) return name;
  const first = parts[0];
  const isUsernameToken = /^[a-záðéíóúýþæö0-9]+$/.test(first) && first === first.toLowerCase() && !/\s/.test(first);
  const restLooksProper = parts.slice(1, 3).every((t) => /^[A-ZÁÐÉÍÓÚÝÞÆÖ]/.test(t));
  return isUsernameToken && restLooksProper ? parts.slice(1).join(" ") : name;
}

export type RosterPlayer = { id: string; full_name: string | null };

/** Build a name→playerId resolver for one team's roster. Returns null when a name
 *  can't be matched unambiguously (never guesses between two players). */
export function makeRosterResolver(roster: RosterPlayer[]): (name: string) => string | null {
  const byNorm = new Map<string, string>();
  const byToken = new Map<string, string>();
  const ambiguousToken = new Set<string>();
  const rosterTokens: Array<{ id: string; tokens: string[] }> = [];
  for (const p of roster) {
    const full = (p.full_name ?? "").trim();
    if (!full) continue;
    byNorm.set(normName(full), String(p.id));
    const tk = tokenKey(full);
    if (byToken.has(tk) && byToken.get(tk) !== String(p.id)) ambiguousToken.add(tk);
    else byToken.set(tk, String(p.id));
    rosterTokens.push({ id: String(p.id), tokens: tk.split(" ").filter(Boolean) });
  }
  const resolveOne = (name: string): string | null => {
    const exact = byNorm.get(normName(name));
    if (exact) return exact;
    const tk = tokenKey(name);
    if (ambiguousToken.has(tk)) return null; // two players share these words → don't guess
    return byToken.get(tk) ?? null;
  };
  // Last-resort SUBSET match: one name's tokens fully contain the other's (both ≥2
  // tokens). Commits only when EXACTLY ONE roster player qualifies.
  const subsetResolve = (name: string): string | null => {
    const ex = tokenKey(name).split(" ").filter(Boolean);
    if (ex.length < 2) return null;
    const exSet = new Set(ex);
    const hits = rosterTokens.filter((r) =>
      r.tokens.length >= 2 && (r.tokens.every((t) => exSet.has(t)) || ex.every((t) => r.tokens.includes(t))),
    );
    return hits.length === 1 ? hits[0].id : null;
  };
  return (name: string): string | null => {
    const direct = resolveOne(name);
    if (direct) return direct;
    const stripped = stripLeadingUsername(name);
    const viaStrip = stripped !== name ? resolveOne(stripped) : null;
    if (viaStrip) return viaStrip;
    return subsetResolve(name);
  };
}
