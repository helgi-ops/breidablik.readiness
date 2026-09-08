/**
 * Exercise sources — the extensible routing hub. A movement-screen finding resolves
 * to a CompensationKey (the shared clinical vocabulary in registry.ts); every
 * exercise, from every contributing expert, declares the compensations it
 * `addresses`. The prescription engine unions the curated EMG/clinical library
 * (whose routing lives in mapping's COMPENSATIONS slug lists) with every ADDITIONAL
 * source registered here.
 *
 * TO ADD A NEW EXPERT'S EXERCISES (the key you asked for):
 *   1. Put the exercises in their own module (or a `corrective_exercises` DB rows),
 *      each carrying `source` + `addresses: CompensationKey[]` (+ phase, dose, cue).
 *   2. Append them to ADDITIONAL_CORRECTIVES below.
 * That is the whole contract — no change to the screen → compensation → plan
 * pipeline, the send path, the PDF, or the UI. The compensation key does the wiring.
 *
 * Rehab-support / training only — never a diagnosis, never the readiness colour.
 */
import type { Bi } from "../registry";
import type { CompensationKey, CorrectiveExercise, CorrectivePhase, ExerciseSource } from "./registry";
import { KING_PROGRAM, KING_PROGRAM_CITATION, type KingExercise } from "../king/program";

export const EXERCISE_SOURCE_LABEL: Record<ExerciseSource, Bi> = {
  emg_library: { en: "EMG / clinical library", is: "EMG / klínískt safn" },
  king: { en: "Enda King program", is: "Enda King prógramm" },
  custom: { en: "Club-added", is: "Bætt við af félagi" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Source: Enda King program. Routing = which King exercises treat which screen
// compensation (+ the NASM phase they slot into). ONLY the lower-limb / trunk
// exercises that map cleanly to a screen compensation are routed; the upper-body,
// breathing and foot items stay in the King template card (not auto-prescribed).
// ─────────────────────────────────────────────────────────────────────────────
const KING_ROUTING: Record<string, { phase: CorrectivePhase; addresses: CompensationKey[] }> = {
  // Motor Control — intersegmental / glute / hip control
  king_goblet_squat: { phase: "integrate", addresses: ["dynamic_valgus", "forward_trunk_lean"] },
  king_kneeling_knee_out: { phase: "activate", addresses: ["dynamic_valgus", "hip_abductor_weakness"] },
  king_prone_fig4_knee_lift: { phase: "activate", addresses: ["hip_abductor_weakness"] },
  king_sl_hip_thrust: { phase: "integrate", addresses: ["dynamic_valgus", "hip_abductor_weakness"] },
  king_slrdl_foot_band: { phase: "integrate", addresses: ["limb_asymmetry"] },
  king_slrdl_hand_band: { phase: "integrate", addresses: ["limb_asymmetry"] },
  king_step_up: { phase: "integrate", addresses: ["dynamic_valgus", "hip_abductor_weakness", "limb_asymmetry"] },
  // Run Mechanics / Plyometrics — reactive strength / landing
  king_banded_fig4_hold: { phase: "activate", addresses: ["hip_abductor_weakness", "landing_instability"] },
  king_dl_pogos: { phase: "integrate", addresses: ["low_reactive_strength"] },
  king_alt_sl_pogos: { phase: "integrate", addresses: ["low_reactive_strength", "limb_asymmetry"] },
  king_dl_sl_drop_landings: { phase: "integrate", addresses: ["poor_absorption", "landing_instability"] },
  king_line_hopping_side: { phase: "integrate", addresses: ["low_reactive_strength"] },
  king_line_hopping_fwd_back: { phase: "integrate", addresses: ["low_reactive_strength"] },
  king_banded_lateral_pushoff: { phase: "integrate", addresses: ["hip_abductor_weakness"] },
  king_crossover_banded_step: { phase: "integrate", addresses: ["dynamic_valgus", "hip_abductor_weakness"] },
  king_banded_fwd_hop_stick: { phase: "integrate", addresses: ["poor_absorption", "low_reactive_strength"] },
  // Strength (Level 1) — unilateral loading, landing, absorption
  king_sl_seated_cmj: { phase: "integrate", addresses: ["low_reactive_strength", "limb_asymmetry"] },
  king_sl_landing: { phase: "integrate", addresses: ["poor_absorption", "landing_instability", "limb_asymmetry"] },
  king_split_squat_bw: { phase: "integrate", addresses: ["dynamic_valgus", "limb_asymmetry"] },
  king_split_stance_rdl: { phase: "integrate", addresses: ["limb_asymmetry"] },
  king_slrdl_jammer: { phase: "integrate", addresses: ["limb_asymmetry"] },
  king_lateral_hip_banded_in_lunge: { phase: "integrate", addresses: ["dynamic_valgus", "hip_abductor_weakness"] },
};

const TARGET_KIND = "strengthen" as const;

/** Adapt a King program entry to the shared CorrectiveExercise shape so it flows
 *  through the same screen → compensation → plan pipeline, tagged with its source. */
function kingToCorrective(k: KingExercise, route: { phase: CorrectivePhase; addresses: CompensationKey[] }): CorrectiveExercise {
  return {
    slug: k.slug,
    name: k.name,
    cue: k.cue ?? k.target,
    phase: route.phase,
    target: k.target,
    targetKind: TARGET_KIND,
    dose: k.dose,
    frequency: { en: "per King week", is: "skv. King viku" },
    videoUrl: k.videoUrl ?? null,
    citation: KING_PROGRAM_CITATION,
    evidenceGrade: "moderate",
    source: "king",
    addresses: route.addresses,
  };
}

/** King exercises registered as prescribable correctives (only the routed ones). */
export const KING_CORRECTIVES: CorrectiveExercise[] = KING_PROGRAM
  .filter((k) => KING_ROUTING[k.slug])
  .map((k) => kingToCorrective(k, KING_ROUTING[k.slug]));

// ─────────────────────────────────────────────────────────────────────────────
// The registry of ADDITIONAL sources beyond the curated EMG/clinical library.
// Future experts append their (source-tagged, compensation-addressed) exercises.
// ─────────────────────────────────────────────────────────────────────────────
export const ADDITIONAL_CORRECTIVES: CorrectiveExercise[] = [
  ...KING_CORRECTIVES,
  // ...futureExpertCorrectives
];

export const ADDITIONAL_BY_SLUG: Record<string, CorrectiveExercise> = Object.fromEntries(
  ADDITIONAL_CORRECTIVES.map((e) => [e.slug, e]),
);

/** Additional-source exercises that address any of the fired compensations. */
export function additionalForCompensations(compKeys: CompensationKey[]): CorrectiveExercise[] {
  const set = new Set(compKeys);
  return ADDITIONAL_CORRECTIVES.filter((e) => (e.addresses ?? []).some((a) => set.has(a)));
}
