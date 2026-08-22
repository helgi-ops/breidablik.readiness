/**
 * StatsBomb "Pass network" (per-player) CSV parser — pure, no IO.
 *
 * Columns: Team, Player, Passes, OBV. One row per player in a single match: the player's
 * passing volume and passing OBV. Narrow file (no Minutes/xG/Goals/Shots, no Match/Date,
 * no Passer/Receiver) — the detector leans on that narrowness so it is not confused with
 * the richer whole-squad match export. Both teams appear; club inferred as most frequent.
 * Output feeds sb_match_player_passing.
 *
 * Descriptive football data — never touches the readiness colour or the daily decision.
 */

import { normTeam } from "./wyscoutTeamStats";
import { normalizeName } from "./nameMatch";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace("%", "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export type PlayerPassing = {
  teamName: string;
  playerName: string;
  playerRef: string;
  passes: number | null;
  obv: number | null;
  raw: Record<string, unknown>;
};

// Columns that appear in the richer whole-squad / player-match exports but NOT in the
// narrow Pass network file — their presence rules a Pass network file out.
const RICH_COLS = ["match", "date", "minutes", "xg", "non penalty xg", "goals", "shots", "assists", "team name", "passer", "receiver"];

/** A Pass network file = Team + Player + Passes + OBV, and none of the richer columns. */
export function isStatsbombPassNetworkHeader(headers: string[]): boolean {
  const h = headers.map((x) => str(x).toLowerCase());
  const has = (c: string) => h.includes(c);
  const core = has("team") && has("player") && has("passes") && has("obv");
  const rich = RICH_COLS.some((c) => h.includes(c));
  return core && !rich;
}

/** Which team is "the club" (most rows). */
export function inferPassNetworkClub(rows: Row[]): string | null {
  const counts = new Map<string, { name: string; n: number }>();
  for (const r of rows) {
    const t = str(r["Team"]);
    if (!t) continue;
    const k = normTeam(t);
    const e = counts.get(k) ?? { name: t, n: 0 };
    e.n++; counts.set(k, e);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.name ?? null;
}

export function parseStatsbombPassNetwork(
  rows: Row[],
): { players: PlayerPassing[]; skipped: { row: string; reason: string }[] } {
  const skipped: { row: string; reason: string }[] = [];
  const players: PlayerPassing[] = [];
  for (const r of rows) {
    const teamName = str(r["Team"]);
    const playerName = str(r["Player"]);
    if (!teamName || !playerName) {
      skipped.push({ row: `${teamName} ${playerName}`, reason: "missing team/player" });
      continue;
    }
    players.push({
      teamName,
      playerName, playerRef: normalizeName(playerName),
      passes: num(r["Passes"]),
      obv: num(r["OBV"]),
      raw: { Team: teamName, Player: playerName, Passes: r["Passes"] ?? null, OBV: r["OBV"] ?? null },
    });
  }
  return { players, skipped };
}
