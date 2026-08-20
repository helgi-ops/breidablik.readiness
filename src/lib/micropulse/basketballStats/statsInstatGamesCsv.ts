/**
 * InStat (Hudl) basketball "Games" export — per-game TEAM box score (season game log).
 *
 * A coach downloads the Games table (one row per game + an "Average per game" row). This
 * adapter parses each game's own-team box, home/away (from the "vs "/"@ " opponent prefix)
 * and result (from the "own:opp" score), and derives the Four Factors the season read
 * averages (eFG%, TO%, FTF, PPP; OREB% needs the opponent's DREB, so it stays null). One
 * parsed game → one own-side basketball_team_match_stats row (period 'game').
 *
 * Pure (no IO). Purely descriptive — NEVER touches the readiness colour, load, or the
 * daily decision. The row count is read from the file (don't assume 34 or "last 10").
 */

export type InstatGameTeam = {
  matchDate: string | null;         // ISO (year inferred from the season), or null if unparseable
  opponent: string | null;
  homeAway: "home" | "away" | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  result: "W" | "L" | "D" | null;
  possessions: number | null;
  points: number | null;
  fgm: number | null; fga: number | null;
  tpm: number | null; tpa: number | null;
  ftm: number | null; fta: number | null;
  oreb: number | null; dreb: number | null; reb: number | null;
  assists: number | null; steals: number | null; turnovers: number | null; blocks: number | null; fouls: number | null;
  // Four Factors (own side) derived from the box.
  efgPct: number | null; toPct: number | null; ftf: number | null; ppp: number | null;
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function cell(row: Record<string, unknown>, aliases: string[]): unknown {
  const wanted = new Set(aliases.map(norm));
  for (const [k, v] of Object.entries(row)) if (wanted.has(norm(k))) return v;
  return undefined;
}

/** InStat numeric cell → number|null. Handles "-", "", "45.5%", numbers, strings. */
export function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s === "-" || s === "—") return null;
  const n = Number(s.replace(/%$/, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const round = (n: number | null, d = 2): number | null => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

/** Fingerprint the Games export: Date + Opponent + Score + Possessions. */
export function isInstatGamesHeader(headers: string[]): boolean {
  const set = new Set(headers.map(norm));
  return set.has("date") && set.has("opponent") && set.has("score") && set.has("possessions");
}

/** "vs Haukar" → {homeAway:"home", opponent:"Haukar"}; "@ Haukar" → away. */
function parseOpponent(raw: string): { homeAway: "home" | "away" | null; opponent: string | null } {
  const s = raw.trim();
  if (!s) return { homeAway: null, opponent: null };
  if (/^vs\b/i.test(s)) return { homeAway: "home", opponent: s.replace(/^vs\s*/i, "").trim() || null };
  if (/^@/.test(s)) return { homeAway: "away", opponent: s.replace(/^@\s*/, "").trim() || null };
  return { homeAway: null, opponent: s };
}

/** "95:70" → {for:95, against:70}. */
function parseScore(raw: string): { pf: number | null; pa: number | null } {
  const m = /^(\d+)\s*[:\-]\s*(\d+)$/.exec(String(raw).trim());
  if (!m) return { pf: null, pa: null };
  return { pf: Number(m[1]), pa: Number(m[2]) };
}

/** Season string → the two calendar years (Icelandic season spans autumn→spring). */
function seasonYears(season: string): { start: number | null; end: number | null } {
  const two = /(\d{4})\D+(\d{4})/.exec(season);
  if (two) return { start: Number(two[1]), end: Number(two[2]) };
  const one = /(\d{4})/.exec(season);
  if (one) return { start: Number(one[1]), end: Number(one[1]) };
  return { start: null, end: null };
}

/** "05/17" + season "2025-2026" → "2026-05-17" (Aug+ = first year, else second). */
export function mmddToIso(raw: string, season: string): string | null {
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                 // already ISO
  const m = /^(\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (!m) return null;
  const mo = Number(m[1]), d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const { start, end } = seasonYears(season);
  let yr: number | null = end ?? start;
  if (start != null && end != null && start !== end) yr = mo >= 8 ? start : end;
  if (yr == null) return null;
  return `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A row is a real game line if it has a score-or-opponent and isn't the average row. */
function isGameRow(opponent: string, score: string): boolean {
  const f = `${opponent} ${score}`.toLowerCase();
  if (/average per game|averages?\b/.test(f)) return false;
  return opponent.trim().length > 0 || /\d+\s*[:\-]\s*\d+/.test(score);
}

/**
 * Parse InStat Games rows → per-game own-team box + derived Four Factors. The
 * "Average per game" summary row and blanks are skipped and surfaced, never guessed.
 */
export function parseInstatGames(
  rawRows: Record<string, unknown>[],
  season: string,
): { games: InstatGameTeam[]; skipped: { game: string; reason: string }[] } {
  const games: InstatGameTeam[] = [];
  const skipped: { game: string; reason: string }[] = [];

  for (const row of rawRows) {
    const oppRaw = String(cell(row, ["Opponent"]) ?? "").trim();
    const scoreRaw = String(cell(row, ["Score"]) ?? "").trim();
    if (!isGameRow(oppRaw, scoreRaw)) {
      skipped.push({ game: oppRaw || "(blank)", reason: "not a game row" });
      continue;
    }
    const { homeAway, opponent } = parseOpponent(oppRaw);
    const { pf, pa } = parseScore(scoreRaw);
    const result: "W" | "L" | "D" | null = pf == null || pa == null ? null : pf > pa ? "W" : pf < pa ? "L" : "D";

    const possessions = num(cell(row, ["Possessions"]));
    const points = num(cell(row, ["Points"]));
    const fgm = num(cell(row, ["Field goals made"]));
    const fga = num(cell(row, ["Field goals attempted"]));
    const tpm = num(cell(row, ["3-pt field goals made"]));
    const tpa = num(cell(row, ["3-pt field goals attempted"]));
    const ftm = num(cell(row, ["Free throws made"]));
    const fta = num(cell(row, ["Free throws attempted"]));
    const tov = num(cell(row, ["Turnovers"]));

    // Four Factors (own side). OREB% needs the opponent's DREB, absent here → null.
    const efgPct = fgm != null && tpm != null && fga != null && fga > 0 ? round(((fgm + 0.5 * tpm) / fga) * 100, 1) : null;
    const toPct = tov != null && possessions != null && possessions > 0 ? round((tov / possessions) * 100, 1) : null;
    const ftf = ftm != null && fga != null && fga > 0 ? round(ftm / fga, 3) : null;
    const ppp = points != null && possessions != null && possessions > 0 ? round(points / possessions, 2)
      : (num(cell(row, ["Points per possession"])) ?? null);

    games.push({
      matchDate: mmddToIso(String(cell(row, ["Date"]) ?? ""), season),
      opponent, homeAway,
      pointsFor: pf ?? points, pointsAgainst: pa, result,
      possessions, points: points ?? pf,
      fgm, fga, tpm, tpa, ftm, fta,
      oreb: num(cell(row, ["Offensive rebounds"])),
      dreb: num(cell(row, ["Defensive rebounds"])),
      reb: num(cell(row, ["Rebounds"])),
      assists: num(cell(row, ["Assists"])),
      steals: num(cell(row, ["Steals"])),
      turnovers: tov,
      blocks: num(cell(row, ["Blocks"])),
      fouls: num(cell(row, ["Fouls"])),
      efgPct, toPct, ftf, ppp,
    });
  }
  return { games, skipped };
}
