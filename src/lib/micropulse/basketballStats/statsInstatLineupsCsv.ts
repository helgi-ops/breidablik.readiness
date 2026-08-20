/**
 * InStat (Hudl) basketball "Lineups" export — season 5-man units.
 *
 * A coach downloads the Lineups table (one row per five-man unit, per-game averages)
 * as CSV/Excel. This adapter parses it into lineup rows: the members (jersey + name),
 * minutes/possessions/points/plus-minus, and the box columns. Pure (no IO), mirroring
 * the per-player CSV adapter. Members are resolved to the squad upstream (the upload
 * route reuses the same name matcher as the per-player path).
 *
 * Purely descriptive — feeds the Lineup Intelligence board; NEVER touches the readiness
 * colour, load, or the daily decision.
 */

export type LineupMemberToken = { jersey: string | null; name: string };

export type ParsedLineup = {
  lineupHash: string;               // sorted jerseys joined (e.g. "4-6-11-12-17"); idempotency key
  members: LineupMemberToken[];
  minutes: number | null;           // per-game average minutes the unit shared the floor
  possessions: number | null;
  points: number | null;
  plusMinus: number | null;
  fga: number | null; fgm: number | null;
  tpa: number | null; tpm: number | null;
  fta: number | null; ftm: number | null;
  oreb: number | null; dreb: number | null; reb: number | null;
  assists: number | null; steals: number | null; turnovers: number | null; fouls: number | null;
  fgPct: number | null; tpPct: number | null; ftPct: number | null;
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Read a cell by any of several header aliases (case/punctuation-insensitive). */
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

/**
 * Fingerprint the Lineups export: a "Lineup" column + "Plus/Minus" + "Possessions".
 * Distinct from the per-player table (which has a player-name column, not "Lineup").
 */
export function isInstatLineupsHeader(headers: string[]): boolean {
  const set = new Set(headers.map(norm));
  return set.has("lineup") && set.has("plus minus") && set.has("possessions");
}

/** "4 D. Rodriguez" → { jersey: "4", name: "D. Rodriguez" }; "D. Rodriguez" → jersey null. */
function parseMember(token: string): LineupMemberToken | null {
  const t = token.trim();
  if (!t) return null;
  const m = /^(\d+)\s+(.*)$/.exec(t);
  if (m) return { jersey: m[1], name: m[2].trim() };
  return { jersey: null, name: t };
}

/** Sorted jersey list joined; falls back to normalized names when a jersey is missing. */
function hashOf(members: LineupMemberToken[]): string {
  const keys = members.map((m) => m.jersey ?? m.name.toLowerCase().replace(/[^a-z]/g, ""));
  return [...keys].sort((a, b) => a.localeCompare(b, "en", { numeric: true })).join("-");
}

/** A row is a real lineup line if the Lineup cell names five members and isn't a total. */
function isTotalRow(lineupCell: string): boolean {
  const f = lineupCell.toLowerCase().trim();
  return f.length === 0 || ["total", "totals", "average", "averages", "average per game", "team"].includes(f);
}

/**
 * Parse InStat Lineups rows → parsed 5-man units. Non-lineup rows (totals, blanks,
 * rows that don't resolve to ≥2 members) are skipped and surfaced, never guessed.
 */
export function parseInstatLineups(
  rawRows: Record<string, unknown>[],
): { lineups: ParsedLineup[]; skipped: { lineup: string; reason: string }[] } {
  const lineups: ParsedLineup[] = [];
  const skipped: { lineup: string; reason: string }[] = [];

  for (const row of rawRows) {
    const lineupCell = String(cell(row, ["Lineup"]) ?? "").trim();
    if (isTotalRow(lineupCell)) {
      skipped.push({ lineup: lineupCell || "(blank)", reason: "not a lineup row" });
      continue;
    }
    const members = lineupCell.split(",").map(parseMember).filter((m): m is LineupMemberToken => m != null);
    if (members.length < 2) {
      skipped.push({ lineup: lineupCell, reason: "could not parse members" });
      continue;
    }
    lineups.push({
      lineupHash: hashOf(members),
      members,
      minutes: minutesToNumber(cell(row, ["Minutes"])),
      possessions: num(cell(row, ["Possessions"])),
      points: num(cell(row, ["Points"])),
      plusMinus: num(cell(row, ["Plus/Minus", "Plus Minus", "+/-"])),
      fga: num(cell(row, ["Field goals attempted"])),
      fgm: num(cell(row, ["Field goals made"])),
      tpa: num(cell(row, ["3-pt field goals attempted"])),
      tpm: num(cell(row, ["3-pt field goals made"])),
      fta: num(cell(row, ["Free throws attempted"])),
      ftm: num(cell(row, ["Free throws made"])),
      oreb: num(cell(row, ["Offensive rebounds"])),
      dreb: num(cell(row, ["Defensive rebounds"])),
      reb: num(cell(row, ["Rebounds"])),
      assists: num(cell(row, ["Assists"])),
      steals: num(cell(row, ["Steals"])),
      turnovers: num(cell(row, ["Turnovers"])),
      fouls: num(cell(row, ["Fouls"])),
      fgPct: num(cell(row, ["Field goals, %", "Field goals %"])),
      tpPct: num(cell(row, ["3-pt field goals, %", "3-pt field goals %"])),
      ftPct: num(cell(row, ["Free throws, %", "Free throws %"])),
    });
  }
  return { lineups, skipped };
}

/** "14:29" → 14.483 minutes; a bare number passes through; "-"/"" → null. */
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

/** Distinct members across all lineups (for the one-time name-mapping step). */
export function distinctMembers(lineups: ParsedLineup[]): LineupMemberToken[] {
  const byKey = new Map<string, LineupMemberToken>();
  for (const l of lineups) for (const m of l.members) {
    const key = `${m.jersey ?? ""}|${m.name.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, m);
  }
  return [...byKey.values()];
}
