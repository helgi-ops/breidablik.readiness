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

export type WellnessClass = 1 | 2 | 3 | 4; // 1 = well below his own norm … 4 = above it

export const WELLNESS_CLASS_COUNT = 4;

/** Bin a total_score (5..25) into the ordinal wellness class by ABSOLUTE bands. Retained
 *  for reference; the engine now targets the PERSONAL-NORM class below. */
export function classFromTotalScore(total: number | null | undefined): WellnessClass | null {
  if (total == null || !Number.isFinite(total)) return null;
  if (total >= 17) return 4; // GREEN_PLUS
  if (total >= 14) return 3; // GREEN
  if (total >= 11) return 2; // YELLOW
  return 1; // RED
}

/**
 * The forecast target — a wellness class relative to the PLAYER'S OWN norm (like the rest
 * of the app). Absolute bands cluster everyone at the top (most check-ins are GREEN_PLUS),
 * leaving no spread for the model to learn; a personal-norm z-score gives real variation
 * and catches a dip BELOW his usual even when the absolute value stays high.
 *  z ≤ −0.6 = clearly below his usual (1) · ≤ −0.15 = a touch below (2) ·
 *  < +0.6 = his usual (3) · ≥ +0.6 = above his usual (4).
 * A rock-steady player (sd ≈ 0) reads "his usual" (3) — never a fabricated dip.
 */
export function classFromPersonalNorm(
  total: number | null | undefined,
  playerMean: number | null,
  playerSd: number | null,
): WellnessClass | null {
  if (total == null || !Number.isFinite(total)) return null;
  if (playerMean == null || playerSd == null || playerSd < 0.5) return 3; // no usable spread → his usual
  const z = (total - playerMean) / playerSd;
  if (z <= -0.6) return 1;
  if (z <= -0.15) return 2;
  if (z < 0.6) return 3;
  return 4;
}

export type Bi = { en: string; is: string };

/** Plain, coach-readable label per class — now RELATIVE to the player's own norm. */
export function classLabel(c: WellnessClass): Bi {
  switch (c) {
    case 4: return { en: "Above his usual", is: "Yfir sínu venjulega" };
    case 3: return { en: "His usual", is: "Sitt venjulega" };
    case 2: return { en: "A touch below", is: "Örlítið undir venju" };
    case 1: return { en: "Below his usual", is: "Undir sinni venju" };
  }
}

/** Traffic-light tone for a class — for the banner/verdict tone, NOT the canonical colour. */
export function classTone(c: WellnessClass): "good" | "watch" | "concern" {
  return c >= 3 ? "good" : c === 2 ? "watch" : "concern";
}
