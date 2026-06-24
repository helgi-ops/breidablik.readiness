/**
 * sessionDuration — read-time derivation of a session's minutes.
 *
 * Core/Lite Catapult plans often leave `session_duration_minutes` NULL (Þór 0%,
 * Grindavík 0%, Afturelding ~60%), but they DO expose total_player_load (100%)
 * and player_load_per_minute (~86%). Since PL/min is, by definition, Player Load
 * per minute, the session length is the exact quotient:
 *
 *     minutes = total_player_load ÷ player_load_per_minute
 *
 * This is a READ-TIME helper (not a backfill) so it self-heals as new rows land,
 * and it tags provenance ("measured" vs "derived") rather than overwriting the
 * `source` column (which means the ingest source: catapult/manual). Guards
 * div-by-zero, clamps to a believable 1–200 min, rounds to 0.1.
 *
 * Unlocks per-minute intensity, "% of match" framing and session density on Core
 * data — software only, no new signals.
 */

export type DurationProvenance = "measured" | "derived";

export type SessionDuration = {
  /** Minutes, 0.1-rounded, clamped to [1, 200]; null when neither measured nor derivable. */
  minutes: number | null;
  /** Where the value came from; null when minutes is null. */
  source: DurationProvenance | null;
};

const MIN_MIN = 1;
const MAX_MIN = 200;

function isPos(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number) => Math.min(MAX_MIN, Math.max(MIN_MIN, v));

export type SessionDurationRow = {
  session_duration_minutes?: number | null;
  total_player_load?: number | null;
  player_load_per_minute?: number | null;
};

/**
 * Resolve a session's duration. Prefers the measured column; otherwise derives it
 * from total_player_load ÷ player_load_per_minute when that quotient is computable.
 */
export function resolveSessionDuration(row: SessionDurationRow): SessionDuration {
  const measured = row.session_duration_minutes;
  if (isPos(measured)) {
    return { minutes: round1(clamp(measured)), source: "measured" };
  }
  const pl = row.total_player_load;
  const plPerMin = row.player_load_per_minute;
  if (isPos(pl) && isPos(plPerMin)) {
    return { minutes: round1(clamp(pl / plPerMin)), source: "derived" };
  }
  return { minutes: null, source: null };
}

/** Convenience: just the minutes (null when unavailable). */
export function sessionDurationMinutes(row: SessionDurationRow): number | null {
  return resolveSessionDuration(row).minutes;
}
