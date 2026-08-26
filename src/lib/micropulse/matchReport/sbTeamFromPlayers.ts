/**
 * Aggregate a match's per-player StatsBomb rows (player_match_stats.metrics, from
 * the "Match Stats" squad CSV) into TEAM-level metrics, so the team match report
 * can show pressures / crosses / key passes / OBV components / aerials etc. even
 * when only the per-player file was imported (no separate team-stats file).
 *
 * ONLY the metrics that map cleanly + unambiguously from the per-player export are
 * derived — genuinely team-only metrics (PPDA, deep progressions, directness,
 * pressures-in-opp-half %) are left for the team file, never guessed. Pure / IO-free.
 */

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

type Metrics = Record<string, unknown>;

/** Sum of one per-player metric key across the squad (null when no player had it). */
function sumKey(rows: Metrics[], key: string): number | null {
  let total = 0, seen = false;
  for (const r of rows) {
    const v = num(r[key]);
    if (v != null) { total += v; seen = true; }
  }
  return seen ? total : null;
}

/** Team key ← per-player CSV key, summed. These are counting stats / OBV components. */
const SUM_MAP: Record<string, string> = {
  pressures: "Pressures",
  counterpressures: "Counterpressures Pressures",
  crosses: "Cross",
  key_passes: "KP",
  long_balls: "LB",
  through_balls: "TB",
  tackles: "T",
  interceptions: "I",
  passes_final_third: "OP F3 Pass",
  pass_obv: "Pass OBV",
  shot_obv: "Shot OBV",
  carry_obv: "D&C OBV",
  def_action_obv: "DA OBV",
  aerials_won: "AerWin",
};

const round2 = (n: number) => Number(n.toFixed(2));

/**
 * Returns the team-level values derivable from the per-player rows. Keys match the
 * sb_team_match_stats columns the report reads. Empty object when no rows.
 */
export function aggregateSbTeamFromPlayers(rows: Metrics[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!rows.length) return out;

  for (const [teamKey, csvKey] of Object.entries(SUM_MAP)) {
    const s = sumKey(rows, csvKey);
    if (s != null) out[teamKey] = /obv/i.test(teamKey) ? round2(s) : s;
  }

  // Aerial contested count reconstructed from each player's win% (won ÷ win%),
  // so the report's aerial_win_pct = won / total can compute a team rate.
  let aerTotal = 0, aerSeen = false;
  for (const r of rows) {
    const won = num(r["AerWin"]); const pct = num(r["Aer%"]);
    if (won != null && won > 0 && pct != null && pct > 0) { aerTotal += won / (pct / 100); aerSeen = true; }
    else if (won != null && won > 0) { aerTotal += won; aerSeen = true; } // pct missing → treat as all won
  }
  if (aerSeen) out.aerials_total = Math.round(aerTotal);

  // Cross completion % — successful (Cross × Cross%) ÷ attempted, team-weighted.
  let crossAtt = 0, crossMade = 0, crossSeen = false;
  for (const r of rows) {
    const c = num(r["Cross"]); const p = num(r["Cross%"]);
    if (c != null && c > 0) { crossAtt += c; crossMade += p != null ? (c * p) / 100 : 0; crossSeen = true; }
  }
  if (crossSeen && crossAtt > 0) out.cross_pct = round2((crossMade / crossAtt) * 100);

  return out;
}
