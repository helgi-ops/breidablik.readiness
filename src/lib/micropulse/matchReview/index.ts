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

/* ────────────────────────────────────────────────────────────────────────────
 * Match ANALYSIS — the richer, article-grade fact pack (v2). Adds the real team
 * picture (from sb_team_match_stats: OBV, set-piece vs open-play xG, possession,
 * passing, box touches, GK distribution) + the opponent side, on top of the own
 * per-player facts. Pure, IO-free. The route phrases it into sectioned prose (AI,
 * labelled) and renders the numbers/tables deterministically. Descriptive — never
 * touches the readiness colour, load, or the daily decision.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The own team's StatsBomb team-level row for one match (nulls where absent). */
export type TeamMatchNumbers = {
  goals: number | null; goalsAgainst: number | null;
  xg: number | null; xgAgainst: number | null; openPlayXg: number | null;
  shots: number | null; shotsAgainst: number | null;
  possessionPct: number | null; passingPct: number | null; boxTouches: number | null;
  obv: number | null; oppositionObv: number | null;
  setPieceXg: number | null; oppSetPieceGoals: number | null;
  gkPassLength: number | null; gkLongBallPct: number | null;
  /** Source-specific extra rows appended to "game in numbers" (e.g. the rich Wyscout team
   *  metrics: PPDA, attacks, crosses, progressive passes, duels won %). Own + opponent. */
  extraRows?: NumbersRow[];
};

/** One row of the "game in numbers" table. opp === null → the cell renders "—".
 *  `labelIs` (optional) is an inline Icelandic label for source-specific rows that
 *  aren't in the surfaces' static label maps. */
export type NumbersRow = { key: string; label: string; labelIs?: string; own: number | null; opp: number | null; decimals: number };

export type SeasonContext = { matches: number; setPieceGoalsConcededPerMatch: number | null; openPlayXgPerMatch: number | null };

export type MatchAnalysisInput = {
  header: { opponent: string | null; homeAway: string | null; competition: string | null; date: string; venue: string | null };
  players: ReviewPlayer[];
  playerObv?: Array<{ name: string; obv: number | null; isGoalkeeper?: boolean }>; // most-valuable-on-ball read
  team: TeamMatchNumbers | null;
  seasonContext?: SeasonContext | null;
};

export type MatchAnalysisFacts = {
  header: MatchAnalysisInput["header"] & { score: string | null };
  team: TeamMatchNumbers | null;
  hasTeamData: boolean;
  playerFacts: {
    threat: Named | null;          // biggest single chance (max player xG)
    creator: MatchReviewFacts["creator"];
    buildup: Named | null;         // max xGChain
    mostValuable: { name: string; value: number; isGoalkeeper: boolean } | null; // max player OBV
    defender: Named | null;
    overperformer: MatchReviewFacts["overperformer"];
    underperformer: MatchReviewFacts["underperformer"];
  };
  derived: {
    biggestChanceXg: number | null;         // = threat.value
    xgMinusBiggestChance: number | null;    // team xG minus the single biggest chance
    xgPerShotExSetPiece: number | null;     // open-play xG spread over open-play-ish shots
    openPlayShare: number | null;           // openPlayXg / xg
  };
  seasonContext: SeasonContext | null;
  gameInNumbers: NumbersRow[];
  confidence: { level: "low" | "medium" | "medium-high" | "high"; note: string };
};

export function buildMatchAnalysis(input: MatchAnalysisInput): MatchAnalysisFacts {
  const { header, players, team } = input;
  const hasTeamData = !!team && team.xg != null;

  // ── per-player facts (reuse the compact engine's argmax helpers) ──
  const review = buildMatchReview(players);
  const threat = review.threat;
  let mostValuable: MatchAnalysisFacts["playerFacts"]["mostValuable"] = null;
  for (const p of input.playerObv ?? []) {
    const v = n(p.obv);
    if (p.obv != null && (mostValuable == null || v > mostValuable.value)) mostValuable = { name: p.name, value: round2(v), isGoalkeeper: !!p.isGoalkeeper };
  }

  // ── derived, cited reads ──
  const biggestChanceXg = threat ? threat.value : null;
  const teamXg = team?.xg ?? null;
  const xgMinusBiggestChance = teamXg != null && biggestChanceXg != null ? round2(Math.max(0, teamXg - biggestChanceXg)) : null;
  const openPlayXg = team?.openPlayXg ?? null;
  const shots = team?.shots ?? null;
  const xgPerShotExSetPiece = openPlayXg != null && shots && shots > 0 ? round2(openPlayXg / shots) : null;
  const openPlayShare = openPlayXg != null && teamXg && teamXg > 0 ? round2(openPlayXg / teamXg) : null;

  // ── the two-column "game in numbers" table (opp === null → "—") ──
  const oppPossession = team?.possessionPct != null ? round2(100 - team.possessionPct) : null;
  const gameInNumbers: NumbersRow[] = team ? [
    { key: "goals", label: "Goals", own: team.goals, opp: team.goalsAgainst, decimals: 0 },
    { key: "xg", label: "xG", own: team.xg, opp: team.xgAgainst, decimals: 2 },
    { key: "openPlayXg", label: "Open-play xG", own: team.openPlayXg, opp: null, decimals: 2 },
    { key: "shots", label: "Shots", own: team.shots, opp: team.shotsAgainst, decimals: 0 },
    { key: "possession", label: "Possession %", own: team.possessionPct, opp: oppPossession, decimals: 0 },
    { key: "passing", label: "Passing %", own: team.passingPct, opp: null, decimals: 0 },
    { key: "obv", label: "OBV (value of actions)", own: team.obv, opp: team.oppositionObv, decimals: 2 },
    { key: "boxTouches", label: "Touches in box", own: team.boxTouches, opp: null, decimals: 0 },
    { key: "setPieceXg", label: "Set-piece xG", own: team.setPieceXg, opp: null, decimals: 2 },
    { key: "biggestChance", label: "Biggest chance (xG)", own: biggestChanceXg, opp: null, decimals: 2 },
    // Source-specific rows (e.g. the rich Wyscout team metrics) — appended, then the whole
    // table is pruned of rows with no value on EITHER side so a source only ever shows what it
    // actually carries (Wyscout's StatsBomb-only rows above fall away; SB's extras are absent).
    ...(team.extraRows ?? []),
  ].filter((r) => r.own != null || r.opp != null) : [];

  // ── confidence: coverage of the two signal sources + season maturity ──
  const mapped = players.length;
  const seasonMatches = input.seasonContext?.matches ?? 0;
  const level: MatchAnalysisFacts["confidence"]["level"] =
    hasTeamData && mapped >= 8 && seasonMatches >= 8 ? "medium-high"
    : hasTeamData && mapped >= 5 ? "medium"
    : hasTeamData || mapped >= 5 ? "low" : "low";
  const note = hasTeamData
    ? `StatsBomb match report + per-player stats (${mapped} players). xG and OBV are models with uncertainty; the figures describe what happened, they do not predict.`
    : `Per-player stats only (${mapped} players) — import the StatsBomb Match Stats file for this game to add the team picture (OBV, set pieces, possession).`;

  return {
    header: { ...header, score: team && team.goals != null && team.goalsAgainst != null ? `${team.goals}–${team.goalsAgainst}` : null },
    team,
    hasTeamData,
    playerFacts: {
      threat, creator: review.creator, buildup: review.buildup, mostValuable,
      defender: review.defender, overperformer: review.overperformer, underperformer: review.underperformer,
    },
    derived: { biggestChanceXg, xgMinusBiggestChance, xgPerShotExSetPiece, openPlayShare },
    seasonContext: input.seasonContext ?? null,
    gameInNumbers,
    confidence: { level, note },
  };
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
