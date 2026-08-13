/**
 * Normalized basketball feed model.
 *
 * Whatever the clean source is (Hudl InStat Basketball, a Genius Sports /
 * baskethotel data API, …), its adapter emits these exact shapes — no source's
 * field names leak past the adapter, exactly like the Wyscout football model.
 * Descriptive box-score data only — NEVER a readiness signal.
 */

export type BasketballSource = "baskethotel" | "instat" | "genius" | "manual";

/**
 * Advanced (descriptive) metrics an InStat/Hudl-grade feed carries beyond the
 * KKÍ box score. Every field maps 1:1 to a nullable column added in
 * migration 20260813120000_basketball_advanced_metrics. All optional — a source
 * that doesn't report a metric leaves it undefined, never 0. NEVER a readiness
 * signal; these surface only in Season Match Analysis.
 */
export type BasketballAdvancedMetrics = {
  efgPct?: number | null;        // effective FG%
  tsPct?: number | null;         // true shooting%
  toPct?: number | null;         // turnover%
  orebPct?: number | null;       // offensive rebound%
  drebPct?: number | null;       // defensive rebound%
  ftf?: number | null;           // free-throw factor (FTM/FGA)
  ppp?: number | null;           // points per possession
  pointsOffTo?: number | null;
  secondChancePts?: number | null;
  pointsInPaint?: number | null;
  fastbreakPts?: number | null;
  deflections?: number | null;
  chargesDrawn?: number | null;
  usagePct?: number | null;
  astPct?: number | null;
  astToRatio?: number | null;
  /** Lossless catch-all → the `advanced` jsonb column (shot-zone splits,
   *  inbound PPP, lineup on/off, VPS, …). */
  extra?: Record<string, number | string | null>;
};

/** One player's box score for one game, normalized. `playerId` is resolved by
 *  the name-matcher; until then it's null and the row is surfaced, never guessed. */
export type BasketballBoxScoreRow = {
  teamId: string;
  playerId?: string | null;
  gameId: string;           // stable per-source game id (also source_ref)
  gameDate: string;         // ISO yyyy-mm-dd
  opponent?: string | null;
  homeAway?: "home" | "away" | null;
  // Core box score — all optional; a missing stat is null/undefined, never 0.
  minutes?: number | null;
  points?: number | null;
  fgm?: number | null; fga?: number | null;
  tpm?: number | null; tpa?: number | null;
  ftm?: number | null; fta?: number | null;
  oreb?: number | null; dreb?: number | null; reb?: number | null;
  assists?: number | null;
  steals?: number | null;
  blocks?: number | null;
  turnovers?: number | null;
  fouls?: number | null;
  plusMinus?: number | null;
  efficiency?: number | null;
  /** Advanced metrics (Four Factors + tracking). Optional — baskethotel omits it. */
  advanced?: BasketballAdvancedMetrics | null;
  /** The full raw box-score row, so nothing the feed reports is ever lost. */
  stats: Record<string, number | string | null>;
  source: BasketballSource;
  sourceRef?: string | null;      // feed reference (game id)
  sourcePlayerRef: string;        // stable per-source player id, else normalized name
  playerName: string;             // raw display name (mapping review + audit)
};

/**
 * One team's line for one period of one match → basketball_team_match_stats.
 * `isOpponent=false` is our own team, `true` is the opponent; `period='game'`
 * is the full-game total, 'q1'..'q4'/'ot1'.. are the splits. Only feeds that
 * carry team/quarter data (InStat/Hudl) emit these; baskethotel does not.
 */
export type BasketballTeamMatchRow = {
  ownerTeamId: string;
  matchRef: string;               // source game id, shared by both sides
  matchDate?: string | null;      // ISO yyyy-mm-dd
  opponent?: string | null;
  isOpponent: boolean;
  period: "game" | "q1" | "q2" | "q3" | "q4" | "ot1" | "ot2" | "ot3";
  points?: number | null;
  possessions?: number | null;
  fgm?: number | null; fga?: number | null;
  tpm?: number | null; tpa?: number | null;
  ftm?: number | null; fta?: number | null;
  oreb?: number | null; dreb?: number | null; reb?: number | null;
  assists?: number | null; steals?: number | null; blocks?: number | null;
  turnovers?: number | null; fouls?: number | null;
  advanced?: BasketballAdvancedMetrics | null;
  benchPts?: number | null;
  /** Lossless raw team line. */
  stats?: Record<string, number | string | null>;
  source: BasketballSource;
  sourceRef?: string | null;
};

/** A scheduled game as the games-list feed reports it. */
export type BasketballGame = {
  gameId: string;
  date: string;             // ISO yyyy-mm-dd
  homeTeam: string;
  awayTeam: string;
  homeScore?: number | null;
  awayScore?: number | null;
  finished: boolean;
};
