/**
 * Closed-loop strength: test → prescribe → retest.
 *
 * Turns the athlete's most recent Load-Velocity tests (lv_profile_tests) into a
 * per-lift estimated-1RM map, so a programme's "70% 1RM" can be shown as an
 * actual target weight. Matching is intentionally CONSERVATIVE — we only attach
 * a target when the prescribed exercise and the tested exercise map to the same
 * canonical lift, so we never put e.g. a back-squat 1RM behind a jump squat.
 */

export type LvTest = { exercise_label: string; est_one_rm: number | null; test_date: string };
export type OneRmEntry = { oneRm: number; testDate: string; canonical: string };

/** Days after which a strength test is considered stale and a retest is nudged. */
export const RETEST_DAYS = 42;

// Ordered most-specific → least-specific. The first phrase contained in the
// (normalised) exercise name wins, so "Goblet / Back Squat" → "back squat",
// while a plain "Jump Squat" → "jump squat" (never borrows a back-squat 1RM).
const CANONICAL_LIFTS = [
  "hang power clean", "power clean", "clean and jerk", "clean",
  "power snatch", "snatch",
  "front squat", "back squat", "jump squat", "goblet squat", "split squat", "squat",
  "trap-bar deadlift", "romanian deadlift", "rdl", "deadlift",
  "incline bench press", "bench press", "bench",
  "push press", "overhead press", "shoulder press", "press",
  "hip thrust", "nordic", "pull-up", "pull up", "chin-up", "row",
];

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The canonical lift a free-text exercise name maps to, or null if none. */
export function canonicalLift(name: string): string | null {
  const n = normalise(name);
  for (const lift of CANONICAL_LIFTS) {
    if (n.includes(lift)) return lift;
  }
  return null;
}

/** Build canonical-lift → latest est-1RM from a client's LV tests. */
export function buildOneRmMap(tests: LvTest[]): Map<string, OneRmEntry> {
  const map = new Map<string, OneRmEntry>();
  for (const t of tests) {
    if (t.est_one_rm == null || !(t.est_one_rm > 0)) continue;
    const canon = canonicalLift(t.exercise_label);
    if (!canon) continue;
    const existing = map.get(canon);
    if (!existing || t.test_date > existing.testDate) {
      map.set(canon, { oneRm: t.est_one_rm, testDate: t.test_date, canonical: canon });
    }
  }
  return map;
}

/** Target weight for a prescribed row, or null when there's no confident match
 *  or no %1RM on the row. pct1rm may be a fraction (0.7) or whole number (70). */
export function targetKg(
  exerciseName: string,
  pct1rm: number | null | undefined,
  oneRmMap: Map<string, OneRmEntry>,
): { kg: number; testDate: string } | null {
  if (pct1rm == null || !(pct1rm > 0)) return null;
  const canon = canonicalLift(exerciseName);
  if (!canon) return null;
  const entry = oneRmMap.get(canon);
  if (!entry) return null;
  const frac = pct1rm > 1 ? pct1rm / 100 : pct1rm;
  // Round to the nearest 2.5 kg (typical smallest plate jump).
  const raw = entry.oneRm * frac;
  const kg = Math.round(raw / 2.5) * 2.5;
  return { kg, testDate: entry.testDate };
}

/** True if a test date is older than the retest window. */
export function isStale(testDate: string, todayIso: string): boolean {
  const a = new Date(testDate + "T00:00:00Z").getTime();
  const b = new Date(todayIso + "T00:00:00Z").getTime();
  return (b - a) / 86_400_000 > RETEST_DAYS;
}
