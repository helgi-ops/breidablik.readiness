/**
 * The forecast TARGET — a wellness class, kept deliberately separate from the canonical
 * verdict colour.
 *
 * MicroPulse already has a wellness index: `readiness_entries.total_score` = the sum of
 * the 5 check-in items (fatigue_energy, sleep_quality, sleep_duration, stress_mood,
 * muscle_soreness), each 1–5, so 5..25 (25 = best). We forecast the CLASS of a future
 * day's total_score, binned into the same four bands the app already uses.
 *
 * IMPORTANT: we derive the class ourselves from `total_score` and NEVER read or write
 * `readiness_entries.color` / `v_coach_readiness_today_v8.final_color`. The Outlook is a
 * forward-looking, labelled signal that lives alongside today's colour, never replaces
 * it (CLAUDE.md: one source, one verdict). The bands mirror the app's legacy
 * total_score banding (migration 20260502160000) so the class means what a coach expects
 * — but the mapping lives here, decoupled from the trigger-written colour.
 */

export type WellnessClass = 1 | 2 | 3 | 4; // 1 = lowest wellness, 4 = highest

export const WELLNESS_CLASS_COUNT = 4;

/** Bin a total_score (5..25) into the ordinal wellness class. Null score → null. */
export function classFromTotalScore(total: number | null | undefined): WellnessClass | null {
  if (total == null || !Number.isFinite(total)) return null;
  if (total >= 17) return 4; // GREEN_PLUS
  if (total >= 14) return 3; // GREEN
  if (total >= 11) return 2; // YELLOW
  return 1; // RED
}

export type Bi = { en: string; is: string };

/** Plain, coach-readable label per class (no jargon). */
export function classLabel(c: WellnessClass): Bi {
  switch (c) {
    case 4: return { en: "Very fresh", is: "Mjög ferskur" };
    case 3: return { en: "Fresh", is: "Ferskur" };
    case 2: return { en: "Slightly down", is: "Örlítið niðri" };
    case 1: return { en: "Flat", is: "Flatur" };
  }
}

/** Traffic-light tone for a class — for the banner/verdict tone, NOT the canonical colour. */
export function classTone(c: WellnessClass): "good" | "watch" | "concern" {
  return c >= 3 ? "good" : c === 2 ? "watch" : "concern";
}
