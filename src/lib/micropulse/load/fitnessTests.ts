/**
 * Standardized endurance / fitness tests store — the field tests coaches actually run (Yo-Yo,
 * 30-15 IFT, beep/MSFT, VAMEVAL, the 4-min max run, line drill, max sprint). One generic
 * `player_fitness_test` row per result; this lib is the registry + the HONEST derivations
 * (MAS / VO₂max) — a derived field is filled ONLY when the test actually supports that estimate,
 * otherwise null. Pure, no I/O.
 *
 * Descriptive load/conditioning context only — it feeds MAS/VIFT running-load & HIIT prescription
 * and the CS/D′ + ASR reads, but NEVER the readiness colour or the daily decision.
 *
 * Ref: Greinar/Tholpróf-fótbolti-korfubolti-yfirlit.md
 * Cite: Bangsbo/Iaia/Krustrup 2008 (Yo-Yo) · Buchheit 2008 (30-15 IFT) · Léger & Lambert 1982
 *       (20 m MSFT) · Cazorla/Léger (VAMEVAL/UMTT MAS) · Pettitt 2016 (CS↔MAS).
 */

import type { Bi } from "./peakPeriod";

export type FitnessTestType =
  | "yo_yo_ir1" | "yo_yo_ir2" | "ift_30_15" | "msft_beep" | "mas_vameval"
  | "mas_run_4min" | "line_drill" | "suicide_17s" | "sprint_max";

export interface FitnessTestDerived { masKmh: number | null; vo2maxEst: number | null }

export interface FitnessTestDef {
  key: FitnessTestType;
  label: Bi;
  unit: string;            // result_unit: 'm' | 'km/h' | 'level' | 's'
  resultLabel: Bi;         // what result_value means, for the entry form
  hint: Bi;                // one-line protocol/what-it-measures hint
  /** Honest derivation from the primary result (+ optional secondary fields). null when unsupported. */
  derive: (result: number) => FitnessTestDerived;
  citation: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const none: FitnessTestDerived = { masKmh: null, vo2maxEst: null };

export const FITNESS_TESTS: Record<FitnessTestType, FitnessTestDef> = {
  yo_yo_ir1: {
    key: "yo_yo_ir1", unit: "m",
    label: { en: "Yo-Yo IR1", is: "Yo-Yo IR1" },
    resultLabel: { en: "Total distance (m)", is: "Heildarvegalengd (m)" },
    hint: { en: "2×20 m shuttles, 10 s active recovery, to exhaustion → intermittent endurance.", is: "2×20 m fram/til baka, 10 s virk hvíld, til uppgjafar → millibils-þol." },
    derive: (d) => ({ masKmh: null, vo2maxEst: r1(0.0084 * d + 36.4) }), // Bangsbo 2008
    citation: "Bangsbo, Iaia & Krustrup 2008",
  },
  yo_yo_ir2: {
    key: "yo_yo_ir2", unit: "m",
    label: { en: "Yo-Yo IR2", is: "Yo-Yo IR2" },
    resultLabel: { en: "Total distance (m)", is: "Heildarvegalengd (m)" },
    hint: { en: "Faster start than IR1 — taxes anaerobic capacity more.", is: "Hraðari byrjun en IR1 — reynir meira á loftfirrta getu." },
    derive: (d) => ({ masKmh: null, vo2maxEst: r1(0.0136 * d + 45.3) }), // Bangsbo 2008
    citation: "Bangsbo, Iaia & Krustrup 2008",
  },
  ift_30_15: {
    key: "ift_30_15", unit: "km/h",
    label: { en: "30-15 IFT", is: "30-15 IFT" },
    resultLabel: { en: "VIFT — final speed (km/h)", is: "VIFT — lokahraði (km/klst)" },
    hint: { en: "30 s run / 15 s rest, +0.5 km/h per stage with COD. VIFT individualises HIIT (% VIFT).", is: "30 s hlaup / 15 s hvíld, +0,5 km/klst á stig með stefnubreytingum. VIFT einstaklingsmiðar HIIT (% VIFT)." },
    // VIFT bundles aerobic power + COD + accel/decel — it is NOT a clean MAS, and a VO₂max estimate
    // needs age/sex/mass. Keep the honest output: VIFT itself (the result) drives %VIFT prescription.
    derive: () => none,
    citation: "Buchheit 2008",
  },
  msft_beep: {
    key: "msft_beep", unit: "level",
    label: { en: "Beep test (20 m MSFT)", is: "Bíp-test (20 m)" },
    resultLabel: { en: "Final level (e.g. 12.5)", is: "Lokastig (t.d. 12,5)" },
    hint: { en: "20 m shuttles at rising speed to exhaustion → MAS from the final running speed.", is: "20 m fram/til baka á stigvaxandi hraða til uppgjafar → MAS úr lokahraðanum." },
    // Running speed at level L = 8 + 0.5·(L−1) km/h ≈ MAS. VO₂max (Léger) needs age → null here.
    derive: (level) => ({ masKmh: level >= 1 ? r1(8 + 0.5 * (Math.floor(level) - 1)) : null, vo2maxEst: null }),
    citation: "Léger & Lambert 1982",
  },
  mas_vameval: {
    key: "mas_vameval", unit: "km/h",
    label: { en: "VAMEVAL / UMTT (MAS)", is: "VAMEVAL / UMTT (MAS)" },
    resultLabel: { en: "MAS (km/h)", is: "MAS (km/klst)" },
    hint: { en: "Incremental track run, +0.5 km/h per min → maximal aerobic speed directly.", is: "Stigvaxandi braut, +0,5 km/klst á mín → hámarks loftháður hraði beint." },
    derive: (mas) => ({ masKmh: mas > 0 ? r1(mas) : null, vo2maxEst: null }),
    citation: "Cazorla / Léger (VAMEVAL/UMTT)",
  },
  mas_run_4min: {
    key: "mas_run_4min", unit: "m",
    label: { en: "4-min max run", is: "4-mín hámarkshlaup" },
    resultLabel: { en: "Distance in 4 min (m)", is: "Vegalengd á 4 mín (m)" },
    hint: { en: "Go as far as you can in 4 min → MAS = distance ÷ 4.", is: "Farðu eins langt og þú getur á 4 mín → MAS = vegalengd ÷ 4." },
    derive: (d) => ({ masKmh: d > 0 ? r1((d / 4) * 0.06) : null, vo2maxEst: null }),
    citation: "Pettitt 2016 (CS↔MAS)",
  },
  line_drill: {
    key: "line_drill", unit: "s",
    label: { en: "Line drill", is: "Line drill" },
    resultLabel: { en: "Time (s)", is: "Tími (s)" },
    hint: { en: "Baseline→FT→half→far FT→far baseline, timed → court conditioning & repeatability.", is: "Grunnlína→víta→miðja→fjær víta→fjær grunnlína, tímamælt → völlunar-þol og endurtekning." },
    derive: () => none,
    citation: "—",
  },
  suicide_17s: {
    key: "suicide_17s", unit: "s",
    label: { en: "17s (suicides)", is: "17s (suicides)" },
    resultLabel: { en: "Time (s)", is: "Tími (s)" },
    hint: { en: "~15 m sideline-to-sideline ×17 under 60 s → anaerobic / repeated effort.", is: "~15 m hlið-í-hlið ×17 undir 60 s → loftfirrt / endurtekning." },
    derive: () => none,
    citation: "—",
  },
  sprint_max: {
    key: "sprint_max", unit: "km/h",
    label: { en: "Max sprint (MSS)", is: "Hámarkssprettur (MSS)" },
    resultLabel: { en: "Max sprint speed (km/h)", is: "Hámarkshraði (km/klst)" },
    hint: { en: "Flying max sprint → MSS. With MAS gives the Anaerobic Speed Reserve (MSS − MAS).", is: "Flug-hámarkssprettur → MSS. Með MAS gefur Anaerobic Speed Reserve (MSS − MAS)." },
    derive: () => none, // MSS is the result; ASR is computed in criticalSpeed.ts
    citation: "Sandford 2019 · Buchheit 2013 (ASR)",
  },
};

export const FITNESS_TEST_TYPES = Object.keys(FITNESS_TESTS) as FitnessTestType[];

export function isFitnessTestType(x: unknown): x is FitnessTestType {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(FITNESS_TESTS, x);
}

/** Honest derived fields for a result. Unknown type or non-finite result → nulls. */
export function deriveFitnessTest(type: string, result: number | null | undefined): FitnessTestDerived {
  if (!isFitnessTestType(type) || typeof result !== "number" || !isFinite(result)) return { ...none };
  return FITNESS_TESTS[type].derive(result);
}
