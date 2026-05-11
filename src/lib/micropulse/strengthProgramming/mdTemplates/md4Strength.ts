/**
 * MD-4 — Micro-dose strength (~20 minutes, low volume)
 *
 * This is THE MicroPulse philosophy: small, frequent, high-quality
 * exposure rather than infrequent big sessions. The name MicroPulse is
 * built around microdosing.
 *
 * Evidence base (research/Microdosing/):
 *   - Rønnestad 2023 — Microdosing strength: 15-20 min sessions 4-5×/week
 *     match or exceed 60 min 2×/week for in-season strength maintenance.
 *   - Aedo-Muñoz 2024 — Microdosing of Strength Training in Basketball
 *     During Congested Game Weeks (basketball, applies directly to soccer).
 *   - García-Pinillos 2024 — Resistance priming in pro Spanish soccer:
 *     76% of S&C coaches use short priming sessions.
 *   - Schoenfeld 2024 — Minimal-Dose Resistance Training: 1-3 hard sets
 *     per muscle per session preserves strength and hypertrophy.
 *
 * Why microdose:
 *   1. Preserves strength + power without next-day fatigue carryover.
 *   2. Fits in-season congested calendars (≥ 1 match/week, often 2).
 *   3. Better adherence — players actually do 20 min sessions.
 *   4. Injury prevention block (Nordic + Copenhagen) is non-negotiable
 *      and fits inside the 20-min window.
 *
 * Structure (~20 minutes total):
 *   1. Movement prep                        (4 min)
 *   2. Compound strength A — cluster set    (10 min, 3 sets only)
 *   3. Nordic hamstring (non-negotiable)    (3 min, 2 sets)
 *   4. Copenhagen adduction (non-negotiable) (3 min, 2 sets)
 *
 * That's it. No multi-exercise grocery list. ONE main lift + injury
 * prevention block. The 2 protective exercises stay because van Dyk
 * 2019 (51% hamstring reduction) and Harøy 2019 (41% groin reduction)
 * are the strongest team-sport injury-prevention evidence we have.
 *
 * Unilateral correction, RDL volume, hip thrust, iso finish — all of
 * those rotate IN over a weekly microcycle (different lift each MD-4),
 * NOT stacked into a single session.
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

/** Build the standard MD-4 microdose template (~20 min).
 *  This is the only MD-4 template — there is no "full volume" alternative.
 *  20 min IS the maximum. Coaches who want more can run a second microdose
 *  block later in the week, NOT extend this one. */
export function buildMd4Strength(): SessionBlock[] {
  // Reduce main lift to 3 cluster sets (down from 5) to fit microdose budget.
  // Cluster configuration is preserved — bar velocity at high % is the
  // adaptation we're paying for; reducing sets keeps total time under 10
  // minutes for this block.
  const mainLift = prescribe("ex_trap_bar_dl", "MD-4");
  const microdosedMain: PrescribedExercise = {
    ...mainLift,
    dose: { ...mainLift.dose, sets: 3 },
  };

  // Nordic — reduce to 2 sets (down from 3). Minimum effective dose:
  // 1-2 hard eccentric sets twice per week reduces hamstring injury 51%
  // (van Dyk 2019). Two sets here + one set on MD-3 = full weekly stim.
  const nordic = prescribe("ex_nordic_curl", "MD-4");
  const microdosedNordic: PrescribedExercise = {
    ...nordic,
    dose: { ...nordic.dose, sets: 2 },
  };

  // Copenhagen — reduce to 2 sets (down from 3). Harøy 2019 protocol
  // uses 1-2 sets per session, 3×/week. Two sets here is sufficient.
  const copenhagen = prescribe("ex_copenhagen", "MD-4");
  const microdosedCopenhagen: PrescribedExercise = {
    ...copenhagen,
    dose: { ...copenhagen.dose, sets: 2 },
  };

  return [
    // 1. Movement prep — 4 minutes
    {
      id: "md4-prep",
      titleEN: "Movement prep",
      titleIS: "Hreyfilína (warmup)",
      type: "PREP",
      exercises: [
        prescribe("mp_glute_activation", "MD-4"),
      ],
      noteEN: "4 min — glute activation only. Hip mobility is folded into the team field warm-up.",
      noteIS: "4 mín — glute virkjun. Liðamobility er hluti af team upphitun á velli.",
    },

    // 2. Compound strength A — ONE lift, cluster sets
    {
      id: "md4-compound",
      titleEN: "Compound strength (cluster)",
      titleIS: "Aðallyfta (cluster)",
      type: "COMPOUND",
      exercises: [microdosedMain],
      noteEN:
        "Cluster: 3 reps → 25s pause → repeat. 3 total sets. Stop at 20% velocity loss " +
        "(Pareja-Blanco 2017). The ONLY main lift today — rotate between trap-bar DL, " +
        "hip thrust, front squat across the season.",
      noteIS:
        "Cluster: 3 endur → 25s pása → endurtaka. Alls 3 sett. Stoppa við 20% velocity drop. " +
        "EINA aðallyftan í dag — rótera milli trap-bar DL, hip thrust, fram-hnébeygja yfir keppnistímabilið.",
    },

    // 3. Nordic — injury prevention (non-negotiable)
    {
      id: "md4-posterior",
      titleEN: "Nordic hamstring (prevention)",
      titleIS: "Nordic hamstring (forvörn)",
      type: "POSTERIOR",
      exercises: [microdosedNordic],
      noteEN:
        "Non-negotiable in microdose. 2 sets × 5 reps. " +
        "51% hamstring injury reduction (van Dyk 2019).",
      noteIS:
        "Non-negotiable í microdose. 2 sett × 5 reps. " +
        "51% færri hamstring meiðsl (van Dyk 2019).",
    },

    // 4. Copenhagen — injury prevention (non-negotiable)
    {
      id: "md4-adductor",
      titleEN: "Copenhagen adduction (prevention)",
      titleIS: "Copenhagen (forvörn)",
      type: "ADDUCTOR",
      exercises: [microdosedCopenhagen],
      noteEN:
        "Non-negotiable in microdose. 2 sets × 6 each side. " +
        "41% groin injury reduction (Harøy 2019).",
      noteIS:
        "Non-negotiable í microdose. 2 sett × 6 hvor fótur. " +
        "41% færri nárameiðsl (Harøy 2019).",
    },
  ];
}
