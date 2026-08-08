/**
 * StatsBomb IQ "Player Match Stats" CSV parser — pure, no IO.
 *
 * IQ exports one file **per player**: one row per match (no player-name column —
 * the player identity is chosen by the coach at upload). `Match` is "Home vs. Away",
 * values are per-match totals (Passes 41, Shots 1 — NOT per-90), so no conversion.
 * Output is the normalized `PlayerMatchStat` the Wyscout API adapter would emit, so
 * the route reuses `matchStatToDbRow` + `MATCH_CONFLICT` to upsert player_match_stats.
 *
 * The club is inferred from the Match strings (the team present in every fixture) to
 * set opponent + home/away. The empty Iceland 360 columns are dropped. Descriptive
 * football data — never touches the readiness colour.
 */

import type { PlayerMatchStat } from "./types";
import { normTeam } from "./wyscoutTeamStats";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace("%", "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
// Accept a "YYYY-MM-DD" string, a JS Date, or an Excel date serial (XLSX may hand back
// any of these depending on how the sheet was read — a CSV date often arrives as a serial).
const toIso = (v: unknown): string | null => {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 90000) { // days since 1899-12-30 (date-only serial; round off the float artifact)
    const d = new Date((Math.round(v) - 25569) * 86400000);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  }
  const m = str(v).match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const DROP360 = /^(Line Breaking Passes|Ball Receipts in Space|Space Received)/i;

/** A player-match export = per-match rows (Match + Date) with no Player/Team-Name
 * column. Must EXCLUDE the per-match TEAM Match Stats export, which shares Match+Date+OBV
 * and also has no Player column — its tell is the team-only opposition aggregates
 * (Opposition Passes / Opposition xG), which a per-player file never carries. NB: do NOT
 * use "Non Penalty Shots Faced" as a team tell — a GOALKEEPER's per-player file carries it
 * too (shots he faced), and excluding it wrongly rejected keeper stats. The positive tell
 * is broad enough to catch keepers (Game SBD ID / Shots Faced / Saves), not only outfielders. */
export function isStatsbombPlayerMatchHeader(headers: string[]): boolean {
  const h = headers.map((x) => str(x));
  const teamOnly = h.includes("Opposition Passes") || h.includes("Opposition xG");
  const playerTell = h.includes("Game SBD ID") || h.includes("OBV") || h.includes("Non Penalty xG")
    || h.includes("Passes") || h.includes("Shots Faced") || h.includes("Saves");
  return h.includes("Match") && h.includes("Date") && !h.includes("Player") && !h.includes("Team Name") && !teamOnly && playerTell;
}

function inferClub(splits: Array<[string, string] | null>): string | null {
  const counts = new Map<string, { name: string; n: number }>();
  for (const s of splits) if (s) for (const t of s) { const k = normTeam(t); const e = counts.get(k) ?? { name: t, n: 0 }; e.n++; counts.set(k, e); }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.name ?? null;
}

export function parseStatsbombPlayerMatch(
  rows: Row[],
  ctx: { teamId: string; playerName: string; sourcePlayerRef: string; sourceRef?: string | null; clubName?: string },
): { stats: PlayerMatchStat[]; skipped: { player: string; team: string; reason: string }[] } {
  const skipped: { player: string; team: string; reason: string }[] = [];
  const splits = rows.map((r) => { const m = str(r["Match"]).split(/\s+vs\.?\s+/i); return m.length === 2 ? [m[0].trim(), m[1].trim()] as [string, string] : null; });
  const clubN = normTeam(ctx.clubName ?? inferClub(splits) ?? "");

  const stats: PlayerMatchStat[] = [];
  rows.forEach((r, i) => {
    const date = toIso(r["Date"]);
    if (!date) { skipped.push({ player: ctx.playerName, team: "", reason: "no match date" }); return; }
    const sp = splits[i];
    const isHome = sp ? normTeam(sp[0]) === clubN : null;
    const opponent = sp ? (isHome ? sp[1] : sp[0]) : null;

    const metrics: Record<string, number | string | null> = {};
    for (const [k, v] of Object.entries(r)) {
      if (DROP360.test(k)) continue;
      const nv = num(v);
      if (nv != null) metrics[k] = nv;
      else if (str(v) !== "") metrics[k] = str(v);
    }
    stats.push({
      teamId: ctx.teamId, matchDate: date, opponent, homeAway: isHome == null ? null : isHome ? "home" : "away",
      minutes: num(r["Minutes"]),
      goals: num(r["Goals & Penalty Goals"]) ?? num(r["Non Penalty Goals"]),
      assists: num(r["Assists"]),
      xg: num(r["Non Penalty xG"]),
      shots: num(r["Shots"]),
      passes: num(r["Passes"]),
      keyPasses: num(r["Key Passes"]),
      metrics,
      source: "statsbomb_csv", sourceRef: ctx.sourceRef ?? null,
      sourcePlayerRef: ctx.sourcePlayerRef, wyscoutPlayerName: ctx.playerName,
    });
  });
  return { stats, skipped };
}
