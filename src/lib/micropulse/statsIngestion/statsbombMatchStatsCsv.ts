/**
 * StatsBomb IQ per-match "Match Stats" CSV (player grain) — pure parser, no IO.
 *
 * One row per PLAYER, BOTH teams, ONE match: `Team, Player, Shots, Goals, xG, …, xGChain,
 * OBV, Pass OBV, …, Pressures, …`. This is the clean, structured counterpart to the Match
 * Report PDF appendix — every metric is its own column, so no AI extraction is needed.
 *
 * The file carries NO match date (it's in the filename only) and no home/away flag — the
 * ingesting route supplies the date and resolves home/away from the fixtures if needed.
 *
 * Descriptive football data — never a readiness signal.
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v).replace(/﻿/g, "").trim());
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace("%", "");
  if (s === "" || s === "-" || s === "N/A") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export type MatchStatsCsvPlayer = {
  name: string; teamName: string;
  shots: number | null; goals: number | null; assists: number | null; xg: number | null; keyPasses: number | null; passes: number | null;
  metrics: Record<string, number>; // every numeric column, original header names
};
export type MatchStatsCsvParse = { teams: string[]; players: MatchStatsCsvPlayer[] };

/** Is this the per-match player "Match Stats" CSV? (Team+Player rows, no season minutes / SBD id). */
export function isStatsbombMatchStatsHeader(headers: string[]): boolean {
  const h = headers.map((x) => str(x));
  return h.includes("Team") && h.includes("Player") && !h.includes("Team Name") && !h.includes("Player SBD ID") && !h.includes("Minutes")
    && (h.includes("xGChain") || h.includes("OP xGChain") || (h.includes("OBV") && h.includes("Pressures")));
}

const IGNORE = new Set(["team", "player"]);

export function parseStatsbombMatchStats(rows: Row[]): MatchStatsCsvParse {
  const players: MatchStatsCsvPlayer[] = [];
  const teams = new Set<string>();
  for (const r of rows) {
    const name = str(r["Player"]);
    const teamName = str(r["Team"]);
    if (!name || !teamName) continue;
    teams.add(teamName);
    const metrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) { if (IGNORE.has(k.toLowerCase())) continue; const nv = num(v); if (nv != null) metrics[k] = nv; }
    players.push({
      name, teamName,
      shots: num(r["Shots"]), goals: num(r["Goals"]), assists: num(r["Assists"]), xg: num(r["xG"]),
      keyPasses: num(r["KP"]), passes: num(r["OP Pass"]),
      metrics,
    });
  }
  return { teams: [...teams], players };
}
