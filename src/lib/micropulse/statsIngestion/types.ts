/**
 * Source-agnostic normalized football-stats model.
 *
 * Both adapters (Wyscout Excel import, Wyscout Data API) emit these exact shapes
 * — no Wyscout column names leak past the adapter. A stable core set is typed;
 * the long tail of Wyscout's 150+ metrics rides in `metrics`. Descriptive
 * football data only — NEVER a readiness signal.
 */

export type StatSource = "wyscout_excel" | "wyscout_api" | "manual" | "baskethotel" | "statsbomb_csv";

/** The stable, typed core carried by every source. All optional — a source may
 *  not report every metric, and a missing metric is null/undefined, never 0. */
export type CoreStatFields = {
  minutes?: number | null;
  goals?: number | null;
  assists?: number | null;
  shots?: number | null;
  shotsOnTarget?: number | null;
  passes?: number | null;
  passAccuracyPct?: number | null;
  keyPasses?: number | null;
  duelsWon?: number | null;
  xg?: number | null;
  rating?: number | null;
};

/** One player's stats for one match, normalized. `playerId` is resolved later by
 *  the name-matcher; until then it's null and the row lives in the unmatched tray. */
export type PlayerMatchStat = CoreStatFields & {
  teamId: string;
  playerId?: string | null;
  matchDate: string; // ISO yyyy-mm-dd
  opponent?: string | null;
  homeAway?: "home" | "away" | null;
  /** Long tail of source metrics, keyed by a normalized metric name. */
  metrics: Record<string, number | string | null>;
  source: StatSource;
  sourceRef?: string | null;        // wyscout match id or uploaded file name
  /** Stable per-source player identity (wyscout id, else normalized raw name). */
  sourcePlayerRef: string;
  /** Raw display name from the source, for the mapping review UI + audit. */
  wyscoutPlayerName: string;
};

/** One player's season aggregate, normalized. */
export type PlayerSeasonStat = CoreStatFields & {
  teamId: string;
  playerId?: string | null;
  season: string;
  competition?: string | null;
  metrics: Record<string, number | string | null>;
  source: StatSource;
  sourceRef?: string | null;
  sourcePlayerRef: string;
  wyscoutPlayerName: string;
};

/** A team-squad row the name-matcher resolves against. */
export type SquadPlayer = { id: string; fullName: string };
