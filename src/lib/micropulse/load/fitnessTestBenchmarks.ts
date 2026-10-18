/**
 * Fitness-test REFERENCE BANDS — "what's a good result?" for the field tests coaches run.
 *
 * Published male-football ranges (literature), banded into below / developing / good / elite. These
 * are a REFERENCE, never a pass/fail: elite values skew high for a semi-pro / Besta deild level, so the
 * "good" floor is the realistic TARGET a coach flags against (`underBenchmark` = below "good"). The
 * squad/league-relative read on the Position Fitness Requirements board stays the operative benchmark;
 * this adds the absolute reference the raw test result otherwise lacks.
 *
 * Pure, no I/O. Descriptive conditioning context — it never touches the readiness colour.
 *
 * Cite: Bangsbo/Iaia/Krustrup 2008 (Yo-Yo) · Buchheit 2008 (30-15 IFT) · Léger 1982 (MSFT) ·
 *       Cazorla/Dupont (VAMEVAL/MAS) · Di Salvo 2007 / Sandford 2019 (max sprint speed) · Pettitt 2016.
 */

import type { Bi } from "./peakPeriod";
import type { FitnessTestType } from "./fitnessTests";

export type FitnessBand = "below" | "developing" | "good" | "elite";

export type FitnessBenchmark = {
  /** Whether a HIGHER result is better (distance/speed/level) or LOWER (a timed drill). */
  direction: "higher" | "lower";
  /** Tier edges in the test's own unit. For "higher": floors; for "lower": ceilings. */
  developing: number;
  good: number;   // the realistic semi-pro / Besta deild target — the flag floor
  elite: number;  // literature elite reference (skews high for the level)
  unit: string;
  cite: string;
};

// Male football, approximate published ranges. "good" = a realistic semi-pro target; "elite" = the
// literature top end (an aspiration at this level, not a pass mark).
export const FITNESS_BENCHMARKS: Partial<Record<FitnessTestType, FitnessBenchmark>> = {
  yo_yo_ir1:    { direction: "higher", developing: 1200, good: 1760, elite: 2200, unit: "m",    cite: "Bangsbo/Krustrup 2008" },
  yo_yo_ir2:    { direction: "higher", developing: 480,  good: 750,  elite: 1000, unit: "m",    cite: "Bangsbo/Krustrup 2008" },
  ift_30_15:    { direction: "higher", developing: 17.0, good: 18.5, elite: 20.5, unit: "km/h", cite: "Buchheit 2008" },
  msft_beep:    { direction: "higher", developing: 10.0, good: 12.0, elite: 13.5, unit: "level",cite: "Léger 1982 / football norms" },
  mas_vameval:  { direction: "higher", developing: 14.5, good: 16.0, elite: 17.5, unit: "km/h", cite: "Cazorla / Dupont 2010" },
  mas_run_4min: { direction: "higher", developing: 960,  good: 1070, elite: 1170, unit: "m",    cite: "Pettitt 2016 (MAS≈dist/4)" },
  sprint_max:   { direction: "higher", developing: 30.0, good: 32.0, elite: 34.0, unit: "km/h", cite: "Di Salvo 2007 (position-aware)" },
  // line_drill / suicide_17s are court-conditioning drills with no clean football norm → no band (honest).
};

/** A cross-test aerobic reference on the DERIVED MAS (km/h), used wherever a test yields a MAS. */
export const MAS_BENCHMARK: FitnessBenchmark = { direction: "higher", developing: 14.5, good: 16.0, elite: 17.5, unit: "km/h", cite: "Dupont 2010 / Buchheit 2008" };

export const BAND_LABEL: Record<FitnessBand, Bi> = {
  below:      { en: "Below", is: "Undir" },
  developing: { en: "Developing", is: "Í þróun" },
  good:       { en: "Good (target)", is: "Gott (mark)" },
  elite:      { en: "Elite", is: "Elíta" },
};

export function fitnessBenchmarkFor(type: string): FitnessBenchmark | null {
  return (FITNESS_BENCHMARKS as Record<string, FitnessBenchmark | undefined>)[type] ?? null;
}

export type FitnessClassification = {
  band: FitnessBand;
  /** Below the realistic "good" target → worth flagging. */
  underBenchmark: boolean;
  /** The target value (the "good" edge), in the test's unit. */
  target: number;
  unit: string;
  cite: string;
};

/** Band a value against a benchmark. `underBenchmark` = below the "good" (realistic) target. */
export function classifyFitness(bm: FitnessBenchmark, value: number): FitnessClassification {
  let band: FitnessBand;
  if (bm.direction === "higher") {
    band = value >= bm.elite ? "elite" : value >= bm.good ? "good" : value >= bm.developing ? "developing" : "below";
  } else {
    band = value <= bm.elite ? "elite" : value <= bm.good ? "good" : value <= bm.developing ? "developing" : "below";
  }
  return { band, underBenchmark: band === "below" || band === "developing", target: bm.good, unit: bm.unit, cite: bm.cite };
}

/** Convenience: classify a raw test result by its type, or null when the test has no published band. */
export function classifyFitnessResult(type: string, result: number | null | undefined): FitnessClassification | null {
  const bm = fitnessBenchmarkFor(type);
  if (!bm || typeof result !== "number" || !isFinite(result)) return null;
  return classifyFitness(bm, result);
}
