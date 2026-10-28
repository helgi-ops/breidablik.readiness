/**
 * InStat (Hudl) basketball SINGLE-MATCH "Players" export — per-player box for ONE game.
 *
 * A coach downloads the per-game Players table: one WORKBOOK with a sheet per team
 * ("<Team> - Box score"), each row a player's line FOR THAT GAME (minutes "mm:ss",
 * points, FG/3P/FT, rebounds, …). Full InStat column names (same as the season Players
 * export) — unlike the speculative abbreviated `INSTAT_FIELD_MAP`, which this does NOT use.
 *
 * Distinct from the season export: the single-match sheet has "Minutes" but NO
 * "Games played" column (that is the discriminator). Two sides come in one file, so the
 * caller resolves which sheet is our club (fold-match the team name) and routes the
 * opponent side to the team row's advanced bag, exactly like the Game Report PDF path.
 *
 * Pure (no IO). source='instat'. Purely descriptive — NEVER touches the readiness
 * colour, load, or the daily decision.
 */

import type { BasketballBoxScoreRow, BasketballAdvancedMetrics } from "./types";
import type { InstatIngestContext } from "./statsInstatBasketball";
import { num, minutesToNumber } from "./statsInstatPlayersCsv";

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function cell(row: Record<string, unknown>, aliases: string[]): unknown {
  const wanted = new Set(aliases.map(norm));
  for (const [k, v] of Object.entries(row)) if (wanted.has(norm(k))) return v;
  return undefined;
}

const round1 = (n: number | null): number | null => (n == null ? null : Math.round(n * 10) / 10);
const round2 = (n: number | null): number | null => (n == null ? null : Math.round(n * 100) / 100);

/** A sheet is a single-match per-player box iff it has Player + Minutes + a basketball
 *  shooting/rebounding tell, but NOT "Games played" (which marks the SEASON export). */
export function isInstatMatchPlayersHeader(headers: string[]): boolean {
  const set = new Set(headers.map(norm));
  if (!set.has("player") || !set.has("minutes")) return false;
  if (set.has("games played")) return false; // that's the season export
  const tell = ["field goals attempted", "3 pt field goals made", "offensive rebounds", "defensive rebounds"];
  const hasTell = tell.some((t) => set.has(t));
  const looksFootball = ["xg", "obv", "xgchain", "opposition passes"].some((t) => set.has(t));
  return hasTell && !looksFootball;
}

/** "<Team> - Box score" → "<Team>". Falls back to the whole sheet name. */
export function teamNameFromSheet(sheetName: string): string {
  return sheetName.replace(/\s*[-–—]\s*box\s*score\s*$/i, "").trim() || sheetName.trim();
}

function isPlayerRow(name: string): boolean {
  const f = name.toLowerCase().trim();
  return f.length > 0 && !["total", "totals", "team", "opponent", "average", "averages", "average per game"].includes(f);
}

/** One InStat single-match player row → a normalized per-game box score row. */
function normalizeMatchPlayer(row: Record<string, unknown>, ctx: InstatIngestContext): BasketballBoxScoreRow {
  const name = String(cell(row, ["Player"]) ?? "").trim();

  const points = num(cell(row, ["Points"]));
  const fgm = num(cell(row, ["Field goals made"]));
  const fga = num(cell(row, ["Field goals attempted"]));
  const tpm = num(cell(row, ["3-pt field goals made", "3 pt field goals made"]));
  const tpa = num(cell(row, ["3-pt field goals attempted", "3 pt field goals attempted"]));
  const ftm = num(cell(row, ["Free throws made"]));
  const fta = num(cell(row, ["Free throws attempted"]));
  const assists = num(cell(row, ["Assists"]));
  const turnovers = num(cell(row, ["Turnovers"]));

  // eFG% and TS% derived from the counting stats (scale-invariant); ppp straight from InStat.
  const efgPct = fga != null && fga > 0 && fgm != null ? round1(((fgm + 0.5 * (tpm ?? 0)) / fga) * 100) : null;
  const tsDen = (fga ?? 0) + 0.44 * (fta ?? 0);
  const tsPct = points != null && tsDen > 0 ? round1((points / (2 * tsDen)) * 100) : null;
  const astTo = assists != null && turnovers != null && turnovers > 0 ? round2(assists / turnovers) : null;

  const advanced = {
    efgPct, tsPct,
    ppp: num(cell(row, ["Points per player's possession", "Points per player s possession"])),
    astToRatio: astTo,
    deflections: num(cell(row, ["Deflections"])),
  } as BasketballAdvancedMetrics;

  // Keep the whole raw row so nothing the feed reports is lost.
  const stats: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(row)) stats[k] = v == null ? null : typeof v === "number" || typeof v === "string" ? v : String(v);

  return {
    teamId: ctx.ownerTeamId,
    gameId: ctx.matchRef,
    gameDate: ctx.matchDate ?? "",
    opponent: ctx.opponent ?? null,
    homeAway: ctx.homeAway ?? null,
    minutes: minutesToNumber(cell(row, ["Minutes"])),
    points, fgm, fga, tpm, tpa, ftm, fta,
    oreb: num(cell(row, ["Offensive rebounds"])),
    dreb: num(cell(row, ["Defensive rebounds"])),
    reb: num(cell(row, ["Rebounds"])),
    assists,
    steals: num(cell(row, ["Steals"])),
    blocks: num(cell(row, ["Blocks"])),
    turnovers,
    fouls: num(cell(row, ["Fouls"])),
    plusMinus: num(cell(row, ["Plus/Minus", "Plus Minus", "+/-"])),
    advanced,
    stats,
    source: "instat",
    sourceRef: ctx.matchRef,
    sourcePlayerRef: `instat:${name.toLowerCase()}`,
    playerName: name,
  };
}

export type InstatMatchSide = { teamName: string; players: BasketballBoxScoreRow[] };

/**
 * Parse one team's single-match sheet → per-player box rows for that game.
 * Non-player rows (totals, blanks) are skipped and surfaced, never guessed.
 */
export function parseInstatMatchPlayers(
  rawRows: Record<string, unknown>[],
  ctx: InstatIngestContext,
): { players: BasketballBoxScoreRow[]; skipped: { player: string; reason: string }[] } {
  const players: BasketballBoxScoreRow[] = [];
  const skipped: { player: string; reason: string }[] = [];
  for (const row of rawRows) {
    const name = String(cell(row, ["Player"]) ?? "").trim();
    if (!isPlayerRow(name)) { skipped.push({ player: name || "(blank)", reason: "not a player row" }); continue; }
    players.push(normalizeMatchPlayer(row, ctx));
  }
  return { players, skipped };
}
