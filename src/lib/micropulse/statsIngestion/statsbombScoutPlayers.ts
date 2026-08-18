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
  // The full per-90 numeric bag (original StatsBomb column names) when the export is
  // the rich Player Stats file (carries OBV etc.) — drives the Players-tab per-90
  // percentile analysis. NULL for a thin export (Players tab stays an honest empty state).
  metrics: Record<string, number> | null;
};

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "N/A" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Is this a StatsBomb Player Stats export (Name + Team + Minutes, not a Squad "Player" file)?
 *  Signature is Name+Team+Minutes so EVERY category download (shooting, passing, pressing, OBV,
 *  set-pieces…) is accepted — earlier we required a shooting-specific column, which wrongly skipped
 *  the pressures/OBV/tackles files and left the merged bag missing most analysis metrics. */
export function isStatsbombScoutPlayerHeader(headers: string[]): boolean {
  const h = headers.map((x) => String(x ?? "").replace(/﻿/g, "").trim());
  return h.includes("Name") && h.includes("Team") && h.includes("Minutes") && !h.includes("Player");
}

export function parseStatsbombScoutPlayers(rows: Record<string, unknown>[], opts: { teamName?: string } = {}): ScoutPlayerParsed[] {
  const want = opts.teamName ? norm(opts.teamName) : null;
  // A scout player export is usually ONE team's players. Only filter by team when the
  // file actually mixes teams — and then loosely (the typed name "KR" must still match
  // the export's "KR Reykjavík"). A single-team file is kept whole, name mismatch or not.
  const distinctTeams = new Set(rows.map((r) => norm(String(r["Team"] ?? ""))).filter(Boolean));
  const filterByTeam = want != null && distinctTeams.size > 1;
  const teamMatches = (team: string) => { const t = norm(team); return t === want || (want != null && (t.includes(want) || want.includes(t))); };
  // The rich Player Stats export carries the per-90 analysis metrics (OBV etc.); the
  // thin one does not. Detect once from the header so we only tag `metrics` when real.
  const headerKeys = rows.length ? Object.keys(rows[0]) : [];
  const isRich = headerKeys.includes("OBV") || headerKeys.includes("Deep Progressions") || headerKeys.includes("Pass OBV");
  const out: ScoutPlayerParsed[] = [];
  for (const r of rows) {
    const name = String(r["Name"] ?? "").trim();
    if (!name) continue;
    const team = String(r["Team"] ?? "").trim();
    if (filterByTeam && team && !teamMatches(team)) continue;
    const minutes = num(r["Minutes"]);
    const per90ToTotal = (v: number | null, dp: number): number | null =>
      v != null && minutes != null && minutes > 0 ? Math.round((v * minutes) / 90 * 10 ** dp) / 10 ** dp : null;
    // Keep the whole per-90 numeric row (original column names) for the analysis engine.
    let metrics: Record<string, number> | null = null;
    if (isRich) {
      metrics = {};
      for (const [k, v] of Object.entries(r)) { const nv = num(v); if (nv != null) metrics[k] = nv; }
    }
    out.push({
      player_name: name, position: String(r["Primary Position"] ?? r["Position"] ?? "").trim() || null, minutes,
      // Goals & Pen Goals (total goal threat) and Assists → whole counts; xG / xA continuous.
      goals: per90ToTotal(num(r["Goals & Pen Goals"]) ?? num(r["Non Penalty Goals"]), 0),
      xg: per90ToTotal(num(r["Non Penalty xG"]), 2),
      assists: per90ToTotal(num(r["Assists"]), 0),
      xa: per90ToTotal(num(r["xG Assisted"]), 2),
      received_passes: null,
      metrics,
    });
  }
  return out;
}

/**
 * Merge SEVERAL StatsBomb "Player Stats" category exports (each a different metric group — shooting,
 * passing, pressures, OBV… — for the same squad, keyed on Name) into one rich per-player bag, then
 * parse. StatsBomb splits its player stats across many downloads; a coach grabs them all for an
 * opponent, and this unions them so the Players-tab per-90 analysis sees the full metric set. Each
 * category's columns are distinct, so there is no real conflict; first non-empty value wins.
 */
export function mergeStatsbombScoutPlayerFiles(files: Array<Record<string, unknown>[]>, opts: { teamName?: string } = {}): ScoutPlayerParsed[] {
  const byName = new Map<string, Record<string, unknown>>();
  for (const rows of files) {
    for (const r of rows) {
      const name = String(r["Name"] ?? "").trim();
      if (!name) continue;
      const key = norm(name);
      const merged = byName.get(key) ?? {};
      for (const [k, v] of Object.entries(r)) {
        const cur = merged[k];
        if (cur == null || cur === "") merged[k] = v; // keep the first non-empty value per column
      }
      byName.set(key, merged);
    }
  }
  return parseStatsbombScoutPlayers([...byName.values()], opts);
}
