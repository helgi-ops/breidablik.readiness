/**
 * MD+1 (HIGH minutes ≥ 60) — protective iso lower-body flush (~10 min)
 *
 * A player who played a full match absorbed the eccentric lower-body load of
 * the game. The day after, we do NOT add eccentric compound work on top — we
 * give the lower body an ISOMETRIC-only dose (tendon-friendly, low-stress,
 * accelerates DOMS recovery vs total rest — Howatson & Milak 2009) and move the
 * real strength stimulus to the FRESH upper body, appended by the engine from
 * the team palette. "iso á neðri hluta og styrktaræfingar á efri."
 *
 * Evidence base:
 *   - Carling 2018 — ~60 min match exposure = recovery day next
 *   - Nédélec 2012 — post-match fatigue persists 24–48h
 *   - Howatson & Milak 2009 — light work day after > total rest for DOMS
 *   - Lim & Childs 2020 — long isometrics for tendon adaptation, pain-friendly
 *
 * Structure (~10 min): movement prep + mobility flush, then a long-iso lower
 * block (single-leg iso ham bridge + Spanish squat) — no eccentric load, no
 * plyometrics, no compound. The engine appends the upper-body strength block.
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

export function buildMdPlus1IsoLower(): SessionBlock[] {
  // Long isometrics dosed from MD-4 (30s holds, 70% MVC) — tendon maintenance,
  // no eccentric load. Trim to 2 sets: this is a protective recovery dose, not a
  // full tendon-adaptation session.
  const isoHam = prescribe("ex_iso_ham_bridge_long", "MD-4");
  const isoQuad = prescribe("ex_spanish_squat", "MD-4");
  const trim = (ex: PrescribedExercise): PrescribedExercise => ({ ...ex, dose: { ...ex.dose, sets: 2 } });

  return [
    {
      id: "mdplus1-prep",
      titleEN: "Movement prep + mobility flush",
      titleIS: "Hreyfilína + mobility flush",
      type: "PREP",
      exercises: [
        prescribe("mp_hip_mobility", "MD-3"),
        prescribe("mp_glute_activation", "MD-3"),
      ],
      noteEN:
        "Hip mobility flow + glute activation. ~5 min. Light movement to flush " +
        "soreness the day after a full match (Howatson & Milak 2009).",
      noteIS:
        "Mjaðmaliðsflæði + glute virkjun. ~5 mín. Létt hreyfing til að flush-a " +
        "sárindi daginn eftir heilan leik (Howatson & Milak 2009).",
    },
    {
      id: "mdplus1-iso-lower",
      titleEN: "Isometric lower body (played 60+ min)",
      titleIS: "Ísómetría neðri líkami (spilaði 60+ mín)",
      type: "ISO_FINISH",
      exercises: [trim(isoHam), trim(isoQuad)],
      noteEN:
        "Long isometrics only — the lower body took the match's eccentric load, so " +
        "no eccentric compound today. 2 × 30s holds, tendon-friendly. Upper-body " +
        "strength (fresh tissue) is added below.",
      noteIS:
        "Aðeins langar ísómetríur — neðri líkami tók eccentric álag leiksins, því " +
        "ekkert eccentric compound í dag. 2 × 30s hald, sinavænt. Efri-líkama styrkur " +
        "(óþreytt) bætist við að neðan.",
    },
  ];
}
