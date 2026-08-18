/**
 * Parse the StatsBomb IQ TEAM-level "Match Stats" export — one row per match (own-team perspective,
 * with "Opposition …" columns for the against side). The coach can export a whole season or a
 * single game; both are the same shape (a Match + Date column and the ~230 metric columns), so this
 * handles 1..N rows. Maps each row's columns to sb_team_match_stats, resolving home/away from the
 * "Team A vs. Team B" match string in the route. This file is the AUTHORITATIVE source for the
 * team-level metrics the per-player export can't carry (possession-side %s, long balls split,
 * aggressive actions, clear/counter shots for & against, dribble %). Pure/serialisable.
 *
 * Descriptive football context — never touches readiness.
 * Cite: StatsBomb IQ metric glossary (team match stats export).
 */

/** sb_team_match_stats column ← exact file header (trailing spaces tolerated: keys are trimmed). */
const COLUMN_MAP: Record<string, string> = {
  goals: "Goals",
  goals_against: "Goals Conceded",
  xg: "Cumulative xG",
  xg_against: "Opposition xG",
  xg_per_shot: "xG/Shot",
  open_play_xg: "Open Play xG",
  shots: "Shots",
  shots_against: "Non Penalty Shots Faced",
  passes: "Passes",
  passing_pct: "Passing%",
  passes_into_box: "Passes Into Box",
  passes_final_third: "Non Throw-in Passes Into Final Third",
  through_balls: "Non Throw-in Through Balls",
  key_passes: "Non Throw-in Key Passes",
  deep_progressions: "Deep Progressions",
  crosses: "Crosses",
  long_balls: "Long Balls",
  long_ball_pct: "Long Ball%",
  long_ball_pressured: "Pressured Long Balls",
  long_ball_unpressured: "Unpressured Long Balls",
  dribble_pct: "Dribble%",
  box_touches: "Touches in box",
  pressures: "Pressures",
  counterpressures: "Counterpressures",
  pressures_opp_half_pct: "Pressures in Opposing Half%",
  aggressive_actions: "Aggressive Actions",
  tackles: "Tackles",
  interceptions: "Interceptions",
  fouls: "Fouls",
  clearances: "Clearances",
  def_action_regains: "Ball Recoveries",
  line_breaks: "Line Breaking Passes",
  clear_shots: "Clear Shots",
  clear_shots_against: "Opposition Clear Shots",
  counter_shots: "Counter Attacking Shots",
  counter_shots_against: "Opposition Counter Attacking Shots",
  obv: "OBV",
  pass_obv: "Pass OBV",
  shot_obv: "Shot OBV",
  carry_obv: "Dribble & Carry OBV",
  def_action_obv: "Defensive Action OBV",
  opposition_obv: "Opposition OBV",
  yellow_cards: "Yellow Cards",
  red_cards: "Red Cards",
};

/** Columns stored as a percentage (0–100) whose source value is a 0–1 fraction → scale ×100. */
const PCT_COLS = new Set(["passing_pct", "dribble_pct", "long_ball_pct", "pressures_opp_half_pct"]);

export type ParsedTeamMatch = {
  rawMatch: string;
  date: string | null;
  homeTeam: string;
  awayTeam: string;
  patch: Record<string, number | null>;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/** Excel-serial / Date / string → YYYY-MM-DD. Robust to how the sheet reader typed the cell. */
export function parseMatchDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && isFinite(v)) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000; // Excel 1900 epoch (incl. leap bug)
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const yy = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${yy}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  return null;
}

/** True when the header looks like the StatsBomb team-level Match Stats export. */
export function isSbTeamStatsFileHeader(headers: string[]): boolean {
  const h = headers.map((x) => String(x ?? "").replace(/﻿/g, "").trim());
  const has = (name: string) => h.some((x) => x === name);
  return has("Match") && has("Date") && (has("Cumulative xG") || has("Pressured Long Balls") || has("Opposition xG"));
}

/** Parse every match row → mapped sb_team_match_stats patch. Own/away resolution is left to the route. */
export function parseSbTeamStatsFile(rows: Array<Record<string, unknown>>): { matches: ParsedTeamMatch[] } {
  const matches: ParsedTeamMatch[] = [];
  for (const raw of rows) {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) row[String(k).replace(/﻿/g, "").trim()] = v;

    const rawMatch = String(row["Match"] ?? "").trim();
    if (!rawMatch) continue;
    const parts = rawMatch.split(/\s+vs\.?\s+/i);
    const homeTeam = (parts[0] ?? "").trim();
    const awayTeam = (parts[1] ?? "").trim();

    const patch: Record<string, number | null> = {};
    for (const [col, header] of Object.entries(COLUMN_MAP)) {
      let v = num(row[header]);
      if (v != null && PCT_COLS.has(col)) v = Math.round(v * 1000) / 10; // 0–1 → 0–100, 1 dp
      patch[col] = v;
    }

    matches.push({ rawMatch, date: parseMatchDate(row["Date"]), homeTeam, awayTeam, patch });
  }
  return { matches };
}
