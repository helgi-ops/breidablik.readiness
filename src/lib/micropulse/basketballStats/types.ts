/**
 * Normalized basketball feed model.
 *
 * Whatever the clean source is (Hudl InStat Basketball, a Genius Sports /
 * baskethotel data API, …), its adapter emits these exact shapes — no source's
 * field names leak past the adapter, exactly like the Wyscout football model.
 * Descriptive box-score data only — NEVER a readiness signal.
 */

export type BasketballSource = "baskethotel" | "instat" | "genius" | "manual";

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
  /** The full raw box-score row, so nothing the feed reports is ever lost. */
  stats: Record<string, number | string | null>;
  source: BasketballSource;
  sourceRef?: string | null;      // feed reference (game id)
  sourcePlayerRef: string;        // stable per-source player id, else normalized name
  playerName: string;             // raw display name (mapping review + audit)
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
