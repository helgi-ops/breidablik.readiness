/**
 * Previous-club rows in `player_external_load_daily`.
 *
 * When a player transfers in we import his GPS history from his previous club so
 * his own baseline / return-to-training / readiness norm work from day one.
 * Those rows are tagged `raw_payload_json->>'previous_club' = 'true'` (and
 * `club_era = 'pre_breidablik'`).
 *
 * The rule: a previous-club row COUNTS FOR THE PLAYER, NOT FOR THE TEAM.
 *  - INCLUDE in any single-player surface (personal load history, ACWR/chronic
 *    baseline, return-to-training baseline, readiness norm, game report, match
 *    movement, personal today-load target). It's his real body data.
 *  - EXCLUDE from any TEAM-level aggregate that rolls multiple players together
 *    by date (team totals/averages, squad "typical day", reporting rollups) —
 *    he wasn't on the team on those dates, so it must not inflate team numbers.
 *
 * Use the SQL predicate in team-aggregation queries (supabase `.not(...)` form
 * below), or `isPrevClubRow` to filter already-fetched rows in JS. Do NOT apply
 * either to per-player reads.
 */

/** PostgREST/SQL predicate: keep rows that are NOT previous-club (team aggregates). */
export const EXCLUDE_PREV_CLUB_SQL = "(raw_payload_json->>'previous_club') is distinct from 'true'";

/**
 * supabase-js filter arguments for excluding previous-club rows from a team
 * aggregation query. Spread into `.not(...)`:
 *   query.not(...EXCLUDE_PREV_CLUB_NOT)
 */
export const EXCLUDE_PREV_CLUB_NOT = ["raw_payload_json->>previous_club", "is", "true"] as const;

/** True when a fetched row is a previous-club (pre-transfer) session. */
export const isPrevClubRow = (r: { raw_payload_json?: Record<string, unknown> | null } | null | undefined): boolean =>
  String(r?.raw_payload_json?.["previous_club"] ?? "") === "true";
