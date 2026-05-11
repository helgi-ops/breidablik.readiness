/**
 * MD-3 — Micro-dose power / explosive (~20 minutes, low volume)
 *
 * Microdose philosophy: 2 rounds of French Contrast instead of 3, ONE
 * Olympic derivative pick, ONE med-ball power finisher. ~20 minutes
 * total. The neural stimulus is what matters — volume is the enemy
 * 3 days before a match.
 *
 * Evidence base:
 *   - Cormie 2011 — high-velocity work preserves RFD with minimal fatigue.
 *   - Liu 2023 — French Contrast Method for soccer power.
 *   - Pareja-Blanco 2017 — 10% velocity loss is the power-preserving cap.
 *   - Rønnestad 2023 — Microdosing across the week beats one big day.
 *
 * Structure (~20 minutes total):
 *   1. Movement prep + plyo primer       (4 min)
 *   2. French Contrast — 2 rounds        (12 min)
 *   3. Med-ball power finisher           (3 min)
 *
 * What we removed from the original 3-round design:
 *   - Round 3 (was diminishing returns by then)
 *   - Standalone Olympic derivative block (the contrast already has
 *     mid-thigh pull / jump shrug embedded)
 *   - Single-leg power block (the contrast's plyometric slot covers it)
 *   - Long mobility close (3 min is enough)
 */

import type { SessionBlock, PrescribedExercise, MdContext } from "../types";
import { getExercise } from "../exerciseLibrary";

function prescribe(exerciseId: string, mdContext: MdContext): PrescribedExercise {
  const ex = getExercise(exerciseId);
  const dose = ex.defaultDosing[mdContext];
  if (!dose) throw new Error(`Exercise ${exerciseId} has no dosing for ${mdContext}`);
  return {
    exerciseId: ex.id,
    nameEN: ex.nameEN,
    nameIS: ex.nameIS,
    category: ex.category,
    dose,
    rationale: ex.evidence,
  };
}

export function buildMd3Power(): SessionBlock[] {
  // Take the standard French Contrast doses but reduce sets in the
  // contrast quadruplet so each is run for 2 rounds rather than 3.
  // Each contrast exercise's default dose is "sets: 3-4 reps: 3-4" — we
  // halve sets to 2 for microdose; reps stay sharp at 3.
  const reduceForMicrodose = (ex: PrescribedExercise): PrescribedExercise => ({
    ...ex,
    dose: { ...ex.dose, sets: 2 },
  });

  return [
    // 1. Movement prep + plyo primer combined to save time
    {
      id: "md3-prep",
      titleEN: "Movement prep + plyo primer",
      titleIS: "Hreyfilína + plyo primer",
      type: "PREP",
      exercises: [
        prescribe("mp_pogo_warmup", "MD-3"),
      ],
      noteEN: "Pogo bouncing primes ankle stiffness + tendon SSC reflex. 4 min total.",
      noteIS: "Pogo gefur ökla stiffness + sin SSC reflex. Alls 4 mín.",
    },

    // 2. French Contrast complex — 2 rounds only (microdose)
    {
      id: "md3-french-contrast",
      titleEN: "French Contrast complex (2 rounds)",
      titleIS: "French Contrast komplex (2 hringir)",
      type: "FRENCH_CONTRAST",
      exercises: [
        reduceForMicrodose(prescribe("ex_back_squat", "MD-3")),
        reduceForMicrodose(prescribe("ex_box_jump", "MD-3")),
        reduceForMicrodose(prescribe("ex_trap_bar_jump_squat", "MD-3")),
        reduceForMicrodose(prescribe("ex_mb_rotational_throw", "MD-3")),
      ],
      noteEN:
        "Run as ONE complex per round: heavy squat 3 reps → 30s rest → box jump 3 → " +
        "30s → jump squat 3 → 30s → MB rotational 4/side. Then 3 min between rounds. " +
        "2 rounds total — power transfer is preserved at lower volume (Rønnestad 2023).",
      noteIS:
        "Keyra sem EITT komplex per hring: þung squat 3 endur → 30s → box jump 3 → " +
        "30s → jump squat 3 → 30s → MB snúningskast 4/hlið. Svo 3 mín milli hringja. " +
        "Alls 2 hringir — kraftur helst þrátt fyrir lægra volume (Rønnestad 2023).",
    },

    // 3. Med-ball finisher — 3 min concentric-dominant
    {
      id: "md3-medball",
      titleEN: "Med-ball power finisher",
      titleIS: "Med-ball lokun",
      type: "MED_BALL",
      exercises: [
        reduceForMicrodose(prescribe("ex_mb_scoop_throw", "MD-3")),
      ],
      noteEN: "Triple-extension power, no eccentric load. ~3 min.",
      noteIS: "Triple-extension kraftur, ekkert eccentric álag. ~3 mín.",
    },
  ];
}
