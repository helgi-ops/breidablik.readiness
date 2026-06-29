/**
 * Catapult capability — the single source of truth for the Lite vs Pro data shape.
 *
 * Lite (Core) teams have NO IMA and fewer GPS columns than Pro — NOT "Pro minus
 * IMA". Verified 2026-06 (Keflavík=Lite, Breiðablik=Pro). See the memory note
 * `lite-vs-pro-data-shape` for the full column matrix. Almost every Lite bug came
 * from code assuming the Pro shape, so every GPS/IMA surface MUST read by data
 * presence (never tier name) and route the Lite cases through these helpers.
 *
 * Pure, dependency-free, client- and server-safe. Covered by
 * __tests__/catapultCapability.test.ts.
 */

const toNum = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Sprint distance (metres). The V6 (top-speed) velocity band IS the sprint
 * distance; Lite units usually leave the separate `sprint_distance` field at 0
 * (no sprint threshold configured on the pod), so prefer V6 and fall back to
 * sprint_distance. Identical to sprint_distance on Pro. NEVER read raw
 * `sprint_distance` directly on a surface that must work for Lite.
 */
export function sprintDistanceM(row: Record<string, unknown>): number {
  return toNum(row.velocity_band6_total_distance) || toNum(row.sprint_distance);
}

/**
 * Catapult-recorded session length in minutes (≈ time on pitch). The match-minutes
 * fallback for Lite teams that don't enter minutes by hand: on a scheduled match
 * date with no manual `match_player_minutes`, treat a session of >= MIN_APPEARANCE
 * minutes as the player's appearance. 0 when absent (Pro leaves this empty).
 */
export function sessionDurationMin(row: Record<string, unknown>): number {
  return toNum(row.session_duration_minutes);
}

/** Minimum session/appearance length (minutes) to count as a real appearance —
 *  filters warmups when falling back to session duration. */
export const MIN_APPEARANCE_MINUTES = 20;

/**
 * Whether a metric is "live" for a squad: present (non-zero) for at least
 * `minShare` of the sampled players. Guards against a single stray row — e.g.
 * one Lite player who once logged a session with a Pro pod (Keflavík has exactly
 * one) — keeping a dead IMA axis alive. `values.some(v > 0)` is too loose. GPS
 * metrics are near-universal; genuine IMA is all-or-nothing per tier, so the
 * half-squad threshold separates them cleanly.
 */
export function isMetricLive(values: number[], minShare = 0.5): boolean {
  if (!values.length) return false;
  return values.filter((v) => v > 0).length / values.length >= minShare;
}

/** Genuine-IMA columns — all absent (≈0) on Lite. Presence ⇒ Pro/full data. */
export const GENUINE_IMA_COLUMNS = [
  "ima_accel", "ima_decel", "jumps",
  "ima_cod_left_high", "ima_cod_right_high",
  "fmp_total_duration_s",
] as const;

/**
 * True if a load row carries genuine IMA (Pro/full). Lite rows — which may still
 * have GPS `accel_decel_efforts` and B2-3 Gen2 efforts — return false: those are
 * NOT IMA. Use this (or a per-squad share via isMetricLive) to branch capability.
 */
export function rowHasGenuineIma(row: Record<string, unknown>): boolean {
  return GENUINE_IMA_COLUMNS.some((c) => toNum(row[c]) > 0);
}
