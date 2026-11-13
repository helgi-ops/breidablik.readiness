/**
 * The flying-sprint dose — one set of numbers for every surface that tells a coach how to train top speed.
 *
 * Source: Haugen 2019 (best-practice guide for sprinters; MicroPulse read the full paper): 10–30 m at over
 * 98% of top speed after a 20–40 m build-up, 4+ min rest, 50–150 m flat out a session, 48–72 h between
 * sessions. The 3–5 runs follow from 50–150 m in 10–30 m runs.
 *
 * Kept in its own small file (no imports) so the Top-speed library (`./index`), Train like you Play
 * (`trainingPrescriptions`), development levers, the assessment recommender and the robustness catalog can
 * all read it without pulling the whole method library into their bundles. Each surface keeps its own voice;
 * only the numbers come from here. Reference content only: nothing here touches the readiness colour.
 */

type Bi = { en: string; is: string };
type Range = { min: number; max: number };

export const FLYING_SPRINT_DOSE = {
  reps: { min: 3, max: 5 },
  /** Metres run flat out per rep. */
  fastZoneM: { min: 10, max: 30 },
  /** Metres to build up speed before the fast zone. */
  buildUpM: { min: 20, max: 40 },
  /** Shortest rest between runs, minutes. */
  minRestMin: 4,
  /** Flat-out metres in one session (build-up excluded). */
  sessionM: { min: 50, max: 150 },
  /** Hours to the next top-speed session. */
  spacingH: { min: 48, max: 72 },
  /** Haugen 2019: "over 98% of top speed". */
  pctTopSpeed: 98,
  /** Short cite, matches `SPEED_REFS.haugen2019.short`. */
  cite: "Haugen 2019",
} as const;

const D = FLYING_SPRINT_DOSE;

/** "10–30" (en dash, as everywhere in the library). */
export const range = (r: Range): string => `${r.min}–${r.max}`;

/** Compact, language-neutral: "3–5 × 10–30 m". */
export const FLYING_REPS_X_ZONE = `${range(D.reps)} × ${range(D.fastZoneM)} m`;

/** The full dose line, as the Top-speed library shows it. */
export const FLYING_DOSE_LINE: Bi = {
  en: `${range(D.reps)} runs of ${range(D.fastZoneM)} m at full speed · ${D.minRestMin}+ min rest · ${range(D.sessionM)} m in all · ${range(D.spacingH)} h to the next one`,
  is: `${range(D.reps)} sprettir ${range(D.fastZoneM)} m á fullum hraða · ${D.minRestMin}+ mín hvíld · ${range(D.sessionM)} m alls · ${range(D.spacingH)} klst í næsta`,
};

/** The run itself, for a sentence: "a 20–40 m build-up, then 3–5 × 10–30 m flat out, 4+ min rest". */
export const FLYING_RUN_PHRASE: Bi = {
  en: `a ${range(D.buildUpM)} m build-up, then ${FLYING_REPS_X_ZONE} flat out, ${D.minRestMin}+ min rest`,
  is: `${range(D.buildUpM)} m aðhlaup, svo ${FLYING_REPS_X_ZONE} á fullum hraða, ${D.minRestMin}+ mín hvíld`,
};
