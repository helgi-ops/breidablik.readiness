/**
 * MD-2 — Micro-dose activation primer (~15 minutes)
 *
 * Two days before the match — neural priming, no fatigue induction.
 *
 * Evidence base:
 *   - Cuenca-Fernández 2024 — Acute iso conditioning improves CMJ.
 *   - García-Pinillos 2024 — Pre-match resistance priming improves
 *     next-day performance in pro Spanish soccer (76% adoption).
 *   - Comfort 2018 — IMTP wakes high-threshold motor units without
 *     metabolic cost.
 *
 * Structure (~15 minutes total):
 *   1. Movement prep             (3 min)
 *   2. IMTP iso primer           (5 min, 3 sets × 5s)
 *   3. Light ballistic primer    (4 min, 2 sets × 3 box jumps)
 *   4. Brief mobility close      (3 min)
 *
 * Two days out, the budget is even tighter than MD-4/MD-3. Less is more.
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

export function buildMd2Activation(): SessionBlock[] {
  return [
    {
      id: "md2-prep",
      titleEN: "Movement prep",
      titleIS: "Hreyfilína",
      type: "PREP",
      exercises: [
        prescribe("mp_pogo_warmup", "MD-2"),
      ],
      noteEN: "Pogo bouncing to wake ankle stiffness — 3 min.",
      noteIS: "Pogo til að vekja ökla stiffness — 3 mín.",
    },
    {
      id: "md2-iso-primer",
      titleEN: "Isometric primer (IMTP)",
      titleIS: "Kyrr-primer (IMTP)",
      type: "POWER_PRIMER",
      exercises: [
        prescribe("ex_imtp_iso", "MD-2"),
      ],
      noteEN: "3 sets × 5s @ 100% MVC. Brief, maximal, no fatigue induction.",
      noteIS: "3 sett × 5s @ 100% MVC. Stutt, hámarks, engin þreyta.",
    },
    {
      id: "md2-light-ballistic",
      titleEN: "Light ballistic primer",
      titleIS: "Léttur ballistic primer",
      type: "POWER_PRIMER",
      exercises: [
        prescribe("ex_box_jump", "MD-2"),
      ],
      noteEN: "2 sets × 3 max-effort jumps. Adaptation engine skips if sprint speed dropped.",
      noteIS: "2 sett × 3 max-effort stökk. Adaptation engine sleppir ef sprintkraftur dottinn.",
    },
  ];
}
