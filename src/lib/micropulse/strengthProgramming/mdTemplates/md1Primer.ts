/**
 * MD-1 — Pre-match neural primer (~10 minutes)
 *
 * One day before the match: maintain freshness, no fatigue induction.
 * This is even lighter than MD-2 — we're days closer to the game.
 *
 * Evidence base:
 *   - García-Pinillos 2024 — Pre-match resistance priming: 1-2 min total
 *     iso work the day before match improves next-day CMJ + sprint.
 *   - Cuenca-Fernández 2024 — Acute iso conditioning improves jump
 *     performance hours-to-days later when load is minimal.
 *   - Comfort 2018 — IMTP recruits high-threshold motor units without
 *     metabolic cost; perfect for MD-1.
 *
 * Structure (~10 min total):
 *   1. Movement prep (3 min, glute activation + pogo)
 *   2. IMTP iso primer (4 min, 2 sets × 3s)
 *   3. ONE light ballistic (3 min, 1 set × 3 box jumps)
 *
 * That's it. No compound lifts. No eccentric load. No volume. Pure
 * potentiation. Adaptation engine drops the ballistic if sprint speed
 * dropped or VBT suppressed.
 *
 * NOTE: many teams skip strength entirely on MD-1 and only do field
 * activation. This template fits in 10 min so it can sit alongside
 * field warm-up without compromising freshness.
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

export function buildMd1Primer(): SessionBlock[] {
  // IMTP is even shorter on MD-1 than MD-2: 2 sets × 3s.
  const imtp = prescribe("ex_imtp_iso", "MD-1");
  const md1Imtp: PrescribedExercise = {
    ...imtp,
    dose: { ...imtp.dose, sets: 2, reps: "3s × 1" },
  };

  // Box jump: 1 set × 3 max-effort. Drop if sprint speed has dropped.
  const box = prescribe("ex_box_jump", "MD-2");
  const md1Box: PrescribedExercise = {
    ...box,
    dose: { ...box.dose, sets: 1, reps: "3", rest: "—" },
  };

  return [
    {
      id: "md1-prep",
      titleEN: "Movement prep",
      titleIS: "Hreyfilína",
      type: "PREP",
      exercises: [prescribe("mp_pogo_warmup", "MD-2")],
      noteEN: "Pogo bouncing only — 3 min. Save fresh ankles for tomorrow.",
      noteIS: "Bara pogo — 3 mín. Spara ökla fyrir morgundaginn.",
    },
    {
      id: "md1-iso-primer",
      titleEN: "Iso primer (IMTP)",
      titleIS: "Kyrr-primer (IMTP)",
      type: "POWER_PRIMER",
      exercises: [md1Imtp],
      noteEN:
        "2 brief maximal iso pulls. High-threshold motor unit recruitment " +
        "with zero metabolic cost. ~4 min including rest.",
      noteIS:
        "2 stutt max iso pulls. Vekur hraðar vöðvafrumur án nokkurar þreytu. " +
        "~4 mín með pásu.",
    },
    {
      id: "md1-light-ballistic",
      titleEN: "Light ballistic (optional)",
      titleIS: "Léttur ballistic (valfrjálst)",
      type: "POWER_PRIMER",
      exercises: [md1Box],
      noteEN:
        "1 set × 3 max-effort box jumps. Adaptation engine skips this " +
        "automatically if sprint speed has dropped today.",
      noteIS:
        "1 sett × 3 max-effort box jumps. Adaptation engine sleppir þessu " +
        "sjálfkrafa ef sprintkraftur er dottinn í dag.",
    },
  ];
}
