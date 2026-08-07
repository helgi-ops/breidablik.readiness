/**
 * StatsBomb IQ "Player Stats" export → opponent-scouting player rows.
 *
 * This is the season player export (one row per player: Name, Team, Minutes, then
 * per-90 rate metrics) a coach pulls for the OPPONENT so the "key players — who to
 * stop" block can rank their most dangerous men. Distinct from the Squad export
 * (which is keyed on "Player" + Player SBD ID and feeds player_season_stats).
 *
 * Per-90 rates are converted to season totals (× minutes / 90) so goals/assists read
 * like the Wyscout scout export; xG / xA stay continuous. Descriptive context only.
 */

export type ScoutPlayerParsed = {
  player_name: string; position: string | null;
  minutes: number | null; goals: number | null; xg: number | null;
  assists: number | null; xa: number | null; received_passes: number | null;
};

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "N/A" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Is this a StatsBomb Player Stats export (Name + Team + per-90 metrics, not a Squad file)? */
export function isStatsbombScoutPlayerHeader(headers: string[]): boolean {
  const h = headers.map((x) => String(x ?? "").replace(/﻿/g, "").trim());
  return h.includes("Name") && h.includes("Team") && !h.includes("Player")
    && (h.includes("Non Penalty xG") || h.includes("xG Assisted") || h.includes("Non Penalty Goals"));
}

export function parseStatsbombScoutPlayers(rows: Record<string, unknown>[], opts: { teamName?: string } = {}): ScoutPlayerParsed[] {
  const want = opts.teamName ? norm(opts.teamName) : null;
  const out: ScoutPlayerParsed[] = [];
  for (const r of rows) {
    const name = String(r["Name"] ?? "").trim();
    if (!name) continue;
    const team = String(r["Team"] ?? "").trim();
    // When a team is given, keep only that team's players (accent/spacing tolerant).
    if (want && team && norm(team) !== want) continue;
    const minutes = num(r["Minutes"]);
    const per90ToTotal = (v: number | null, dp: number): number | null =>
      v != null && minutes != null && minutes > 0 ? Math.round((v * minutes) / 90 * 10 ** dp) / 10 ** dp : null;
    out.push({
      player_name: name, position: null, minutes,
      // Goals & Pen Goals (total goal threat) and Assists → whole counts; xG / xA continuous.
      goals: per90ToTotal(num(r["Goals & Pen Goals"]) ?? num(r["Non Penalty Goals"]), 0),
      xg: per90ToTotal(num(r["Non Penalty xG"]), 2),
      assists: per90ToTotal(num(r["Assists"]), 0),
      xa: per90ToTotal(num(r["xG Assisted"]), 2),
      received_passes: null,
    });
  }
  return out;
}
