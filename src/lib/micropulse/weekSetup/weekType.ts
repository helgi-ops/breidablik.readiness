/**
 * Week type — the ONE shared declaration.
 *
 * Previously declared twice, inconsistently: `CoachClient.tsx` had only
 * ONE_MATCH | TWO_MATCHES, and `week-setup/page.tsx` added NO_MATCH. Neither
 * supported a three-game week, which basketball needs (a week is defined by how
 * many games fall in it, 0–3). This is the single source both import.
 *
 * THREE_MATCHES is stored in `coach_week_setup.week_type`; the CHECK constraint
 * there was widened to accept it (migration
 * 20260721160000_coach_week_setup_allow_three_matches.sql).
 */

export type WeekType = "NO_MATCH" | "ONE_MATCH" | "TWO_MATCHES" | "THREE_MATCHES";

/** Number of games the week type represents (0–3). */
export function gameCount(weekType: WeekType): 0 | 1 | 2 | 3 {
  switch (weekType) {
    case "NO_MATCH": return 0;
    case "ONE_MATCH": return 1;
    case "TWO_MATCHES": return 2;
    case "THREE_MATCHES": return 3;
  }
}

/** All week types in ascending game-count order. */
export const WEEK_TYPES: readonly WeekType[] = [
  "NO_MATCH",
  "ONE_MATCH",
  "TWO_MATCHES",
  "THREE_MATCHES",
] as const;

/** Narrow an arbitrary stored string to a WeekType, defaulting to ONE_MATCH. */
export function coerceWeekType(v: unknown): WeekType {
  return v === "NO_MATCH" || v === "ONE_MATCH" || v === "TWO_MATCHES" || v === "THREE_MATCHES"
    ? v
    : "ONE_MATCH";
}
