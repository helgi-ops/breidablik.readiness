/**
 * InStat (Hudl) basketball "Players" export — per-player SEASON averages.
 *
 * A coach downloads the Players table (one row per player, per-game averages over the
 * season). This adapter parses it into season rows shaped for player_season_stats, using
 * the EXACT metric keys the basketball catalog reads (playerBasketballStats) so the
 * existing player-stats surfaces render it with no extra wiring — plus the two fields the
 * KKI box score does NOT carry: Plus/Minus per game and Points per (player's) possession.
 *
 * Pure (no IO). Written with source='instat'; KKI 'baskethotel' stays canonical (the
 * overview prefers the InStat season row per player where both exist). Purely descriptive
 * — NEVER touches the readiness colour, load, or the daily decision.
 */

export type InstatSeasonPlayer = {
  sourcePlayerRef: string;          // instat:<lowercase full name> — shared with the per-player path
  playerName: string;
  jersey: string | null;
  games: number | null;
  minutesTotal: number | null;      // season total (per-game average x games)
  metrics: Record<string, number | null>;
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

/** "35:08" → 35.133 minutes; a bare number passes through; "-"/"" → null. */
export function minutesToNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s === "-" || s === "—") return null;
  const mm = /^(\d+):(\d{1,2})$/.exec(s);
  if (mm) return Math.round((Number(mm[1]) + Number(mm[2]) / 60) * 1000) / 1000;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const round = (n: number | null, d = 2): number | null => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

/**
 * Fingerprint the Players SEASON export: a "Player" column + "Games played" (the
 * discriminator from the single-game per-player table, which has no games count).
 */
export function isInstatPlayersSeasonHeader(headers: string[]): boolean {
  const set = new Set(headers.map(norm));
  return set.has("player") && set.has("games played");
}

/** A row is a real player line if it has a non-empty name that isn't a total. */
function isPlayerRow(name: string): boolean {
  const f = name.toLowerCase().trim();
  return f.length > 0 && !["total", "totals", "team", "opponent", "average", "averages", "average per game"].includes(f);
}

/**
 * Parse InStat Players season rows → season averages keyed for the basketball catalog.
 * Non-player rows (totals, blanks) are skipped and surfaced, never guessed.
 */
export function parseInstatPlayersSeason(
  rawRows: Record<string, unknown>[],
): { players: InstatSeasonPlayer[]; skipped: { player: string; reason: string }[] } {
  const players: InstatSeasonPlayer[] = [];
  const skipped: { player: string; reason: string }[] = [];

  for (const row of rawRows) {
    const name = String(cell(row, ["Player"]) ?? "").trim();
    if (!isPlayerRow(name)) {
      skipped.push({ player: name || "(blank)", reason: "not a player row" });
      continue;
    }
    const jerseyRaw = cell(row, ["Jersey number", "Jersey", "Number"]);
    const jersey = jerseyRaw == null || String(jerseyRaw).trim() === "" ? null : String(jerseyRaw).trim();
    const games = num(cell(row, ["Games played"]));
    const minPerGame = minutesToNumber(cell(row, ["Minutes"]));

    // Per-game averages (the sheet is "Average per game").
    const ppg = num(cell(row, ["Points"]));
    const fgaPg = num(cell(row, ["Field goals attempted"]));
    const ftaPg = num(cell(row, ["Free throws attempted"]));
    const astPg = num(cell(row, ["Assists"]));
    const toPg = num(cell(row, ["Turnovers"]));

    // Derive True Shooting % and Assist-to-turnover from the per-game figures (ratios are
    // scale-invariant, so per-game inputs give the same result as season totals).
    const tsDen = (fgaPg ?? 0) + 0.44 * (ftaPg ?? 0);
    const ts = ppg != null && (fgaPg != null || ftaPg != null) && tsDen > 0 ? round((ppg / (2 * tsDen)) * 100, 1) : null;
    const astTo = astPg != null && toPg != null && toPg > 0 ? round(astPg / toPg, 2) : null;

    const metrics: Record<string, number | null> = {
      "Games": games,
      "Points per game": ppg,
      "Rebounds per game": num(cell(row, ["Rebounds"])),
      "Assists per game": astPg,
      "Steals per game": num(cell(row, ["Steals"])),
      "Blocks per game": num(cell(row, ["Blocks"])),
      "Turnovers per game": toPg,
      "Offensive rebounds per game": num(cell(row, ["Offensive rebounds"])),
      "Defensive rebounds per game": num(cell(row, ["Defensive rebounds"])),
      "Field goals %": num(cell(row, ["Field goals, %", "Field goals %"])),
      "Three-point %": num(cell(row, ["3-pt field goals, %", "3-pt field goals %"])),
      "Free throws %": num(cell(row, ["Free throws, %", "Free throws %"])),
      "True shooting %": ts,
      "Assist to turnover": astTo,
      // The two fields the KKI box score does NOT carry:
      "Plus/Minus per game": num(cell(row, ["Plus/Minus", "Plus Minus", "+/-"])),
      "Points per possession": num(cell(row, ["Points per player's possession", "Points per player s possession"])),
      // Extra descriptive fields (surface in the all-metrics view).
      "Fouls per game": num(cell(row, ["Fouls"])),
      "Fouls drawn per game": num(cell(row, ["Fouls drawn"])),
    };

    players.push({
      sourcePlayerRef: `instat:${name.toLowerCase()}`,
      playerName: name,
      jersey,
      games,
      minutesTotal: minPerGame != null && games != null ? Math.round(minPerGame * games) : null,
      metrics,
    });
  }
  return { players, skipped };
}
