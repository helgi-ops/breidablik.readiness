/**
 * Match review — turns one match's per-player football stats into the CITED facts a
 * coach recap is built from. Pure, IO-free. Rules compute these numbers; the AI layer
 * only phrases them (and is labelled AI). Descriptive context — it never touches the
 * readiness colour, load, or the daily decision.
 *
 * Own-squad only (v1): the surface reviews your own team's attacking output, who created
 * it, and who stood out — from player_match_stats for one (team, match_date).
 */

export type ReviewPlayer = {
  name: string;
  goals: number | null; assists: number | null; xg: number | null; shots: number | null;
  keyPasses: number | null; xgAssisted: number | null; xgChain: number | null;
  tackles: number | null; interceptions: number | null;
};

export type Named = { name: string; value: number };
export type MatchReviewFacts = {
  players: number;
  team: { xg: number; shots: number; goals: number; finishing: number }; // finishing = goals − xG
  threat: Named | null;                       // highest xG (best chances)
  creator: { name: string; value: number; metric: "xgAssisted" | "keyPasses" } | null;
  buildup: Named | null;                      // highest xG Chain (most involved in scoring moves)
  defender: Named | null;                     // highest tackles + interceptions
  overperformer: { name: string; goals: number; xg: number } | null;  // scored above his xG
  underperformer: { name: string; goals: number; xg: number } | null; // good chances, didn't score
};

const n = (v: number | null): number => (v == null || !Number.isFinite(v) ? 0 : v);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Argmax over players by a scorer, requiring a strictly positive value. */
function top(players: ReviewPlayer[], score: (p: ReviewPlayer) => number): Named | null {
  let best: Named | null = null;
  for (const p of players) {
    const v = score(p);
    if (v > 0 && (best == null || v > best.value)) best = { name: p.name, value: round2(v) };
  }
  return best;
}

export function buildMatchReview(players: ReviewPlayer[]): MatchReviewFacts {
  const team = {
    xg: round2(players.reduce((a, p) => a + n(p.xg), 0)),
    shots: players.reduce((a, p) => a + n(p.shots), 0),
    goals: players.reduce((a, p) => a + n(p.goals), 0),
    finishing: 0,
  };
  team.finishing = round2(team.goals - team.xg);

  const threat = top(players, (p) => n(p.xg));
  const byXa = top(players, (p) => n(p.xgAssisted));
  const byKp = top(players, (p) => n(p.keyPasses));
  const creator = byXa ? { name: byXa.name, value: byXa.value, metric: "xgAssisted" as const }
    : byKp ? { name: byKp.name, value: byKp.value, metric: "keyPasses" as const } : null;
  const buildup = top(players, (p) => n(p.xgChain));
  const defender = top(players, (p) => n(p.tackles) + n(p.interceptions));

  // Finishing outliers (only when the gap is meaningful).
  let over: MatchReviewFacts["overperformer"] = null;
  let under: MatchReviewFacts["underperformer"] = null;
  for (const p of players) {
    const g = n(p.goals), xg = n(p.xg);
    if (g >= 1 && g - xg >= 0.5 && (over == null || g - xg > over.goals - over.xg)) over = { name: p.name, goals: g, xg: round2(xg) };
    if (g === 0 && xg >= 0.5 && (under == null || xg > under.xg)) under = { name: p.name, goals: 0, xg: round2(xg) };
  }

  return { players: players.length, team, threat, creator, buildup, defender, overperformer: over, underperformer: under };
}
