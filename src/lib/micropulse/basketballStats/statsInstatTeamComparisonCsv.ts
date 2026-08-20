/**
 * InStat (Hudl) basketball "Team comparison" export — the team's own SEASON averages.
 *
 * Despite the name it is a single team's per-game averages over the whole season, in a
 * key/value layout (label | value | "Average per game"), NOT a tabular sheet — so it is
 * read as a matrix (array-of-arrays), not header-keyed rows. This adapter pulls the season
 * label + the averages into one team-season row.
 *
 * The full-season averages (all 34 games) are authoritative even when only some games'
 * detail is imported. Pure (no IO). Purely descriptive — NEVER touches the readiness
 * colour, load, or the daily decision.
 */

export type InstatTeamSeason = {
  season: string | null;              // parsed from the header cell if present (e.g. "2025-2026")
  gamesPlayed: number | null;
  possessions: number | null;
  points: number | null;
  ppp: number | null;
  fgm: number | null; fga: number | null; fgPct: number | null;
  tpm: number | null; tpa: number | null; tpPct: number | null;
  ftm: number | null; fta: number | null; ftPct: number | null;
  reb: number | null; oreb: number | null; dreb: number | null;
  assists: number | null; steals: number | null; turnovers: number | null; blocks: number | null;
  fouls: number | null; foulsDrawn: number | null;
  efgPct: number | null;              // derived (FGM+0.5*3PM)/FGA
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** InStat numeric cell → number|null. Handles "-", "", "43.7%", numbers, strings. */
export function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s === "-" || s === "—") return null;
  const n = Number(s.replace(/%$/, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const round = (n: number | null, d = 1): number | null => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

/**
 * Fingerprint the Team comparison matrix: col-0 labels include the season-averages tells
 * ("Points per possession" + "Possessions" + "Games played"). Robust to the header row.
 */
export function isInstatTeamComparisonMatrix(matrix: unknown[][]): boolean {
  const labels = new Set(matrix.map((r) => norm(r?.[0])));
  return labels.has("points per possession") && labels.has("possessions") && labels.has("games played");
}

/** Season string out of the header cell ("… Season 2025-2026 …" → "2025-2026"). */
function seasonFromHeader(matrix: unknown[][]): string | null {
  for (const r of matrix) for (const cell of r ?? []) {
    const m = /season\s*(\d{4}\D+\d{4}|\d{4})/i.exec(String(cell ?? ""));
    if (m) return m[1].replace(/\s+/g, "");
  }
  return null;
}

/** Parse the Team comparison matrix → one team-season averages row. */
export function parseInstatTeamComparison(matrix: unknown[][]): InstatTeamSeason {
  // label → value (first numeric col after the label).
  const byLabel = new Map<string, number | null>();
  for (const r of matrix) {
    const label = norm(r?.[0]);
    if (!label) continue;
    // The value is the first non-empty cell after col 0.
    let value: number | null = null;
    for (let i = 1; i < (r?.length ?? 0); i++) {
      if (r[i] != null && String(r[i]).trim() !== "") { value = num(r[i]); break; }
    }
    if (!byLabel.has(label)) byLabel.set(label, value);
  }
  const g = (label: string) => byLabel.get(norm(label)) ?? null;

  const fgm = g("Field goals made"), fga = g("Field goals attempted"), tpm = g("3-pt field goals made");
  const efgPct = fgm != null && tpm != null && fga != null && fga > 0 ? round(((fgm + 0.5 * tpm) / fga) * 100, 1) : null;

  return {
    season: seasonFromHeader(matrix),
    gamesPlayed: g("Games played"),
    possessions: g("Possessions"),
    points: g("Points"),
    ppp: g("Points per possession"),
    fgm, fga, fgPct: g("Field goals, %") ?? g("Field goals %"),
    tpm, tpa: g("3-pt field goals attempted"), tpPct: g("3-pt field goals, %") ?? g("3-pt field goals %"),
    ftm: g("Free throws made"), fta: g("Free throws attempted"), ftPct: g("Free throws, %") ?? g("Free throws %"),
    reb: g("Rebounds"), oreb: g("Offensive rebounds"), dreb: g("Defensive rebounds"),
    assists: g("Assists"), steals: g("Steals"), turnovers: g("Turnovers"), blocks: g("Blocks"),
    fouls: g("Fouls"), foulsDrawn: g("Fouls drawn"),
    efgPct,
  };
}
