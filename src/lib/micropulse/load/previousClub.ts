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
 * Use `EXCLUDE_PREV_CLUB_OR` in a team-aggregation query (supabase `.or(...)`),
 * or `isPrevClubRow` to filter already-fetched rows in JS (the right tool when a
 * query is dual-use — the same rows feed both a per-player and a team result, so
 * only the team roll-up gets filtered). Do NOT apply either to a per-player read.
 *
 * IMPORTANT — why `.or(is.null, neq.true)` and not `.not(...)`:
 * `raw_payload_json->>'previous_club'` is TEXT, and a normal row has the key
 * absent (NULL), not 'false'. So:
 *   - `.not(col, "is", "true")` → `NOT (col IS TRUE)` errors: "argument of IS
 *     TRUE must be type boolean, not type text".
 *   - `.not(col, "eq", "true")` → `NOT (col = 'true')`; for a NULL row that is
 *     `NOT NULL` = NULL, so PostgREST drops every normal (null-flag) row — i.e.
 *     it would wipe the real team data. Catastrophic.
 * The OR form keeps NULL rows (via is.null) and any non-'true' value, dropping
 * only the tagged previous-club rows — matching `col IS DISTINCT FROM 'true'`.
 */

/** SQL predicate (for tests / raw SQL): keep rows that are NOT previous-club. */
export const EXCLUDE_PREV_CLUB_SQL = "(raw_payload_json->>'previous_club') is distinct from 'true'";

/**
 * supabase-js `.or(...)` argument that excludes previous-club rows from a team
 * aggregation query while keeping every normal (null-flag) row:
 *   query.or(EXCLUDE_PREV_CLUB_OR)
 * Generates `(raw_payload_json->>'previous_club' IS NULL OR
 *            raw_payload_json->>'previous_club' <> 'true')`.
 */
export const EXCLUDE_PREV_CLUB_OR =
  "raw_payload_json->>previous_club.is.null,raw_payload_json->>previous_club.neq.true";

/** True when a fetched row is a previous-club (pre-transfer) session. */
export const isPrevClubRow = (r: { raw_payload_json?: Record<string, unknown> | null } | null | undefined): boolean =>
  String(r?.raw_payload_json?.["previous_club"] ?? "") === "true";
