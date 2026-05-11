/**
 * MD+1 — Post-match recovery / light flush (~15 minutes)
 *
 * One day after the match — recovery dominates.
 *
 * IMPORTANT branching:
 *   - Players who PLAYED ≥ 60 min: the main decision engine sets verdict
 *     = RECOVERY (Carling 2018, Nédélec 2012). RULE 10 in adaptationRules
 *     strips strength blocks → only the recovery / mobility blocks remain.
 *   - Players who DNP'd or played < 60 min: this template runs as-is.
 *     They need a stim — but a measured one. We give them a slimmer
 *     version of MD-3 power (single round French Contrast) so they
 *     don't fall behind their week's training load.
 *
 * Evidence base:
 *   - Carling 2018 — 60 min match exposure = recovery day next
 *   - Nédélec 2012 — Post-match fatigue persists 24–48h
 *   - Howatson & Milak 2009 — Light eccentric work day after exercise
 *     accelerates DOMS recovery vs total rest (active recovery > rest)
 *   - Rønnestad 2023 — Microdose stim for non-starters keeps the
 *     training pool from de-training across congested fixtures
 *
 * Structure for DNP / non-starters (~15 minutes):
 *   1. Movement prep + mobility flush      (5 min)
 *   2. ONE explosive primer (jump shrug)   (5 min, 2 sets × 3)
 *   3. Long iso ham (tendon maintenance)   (5 min, 2 sets × 30s)
 *
 * Structure for starters (verdict-driven, no strength):
 *   Mobility + aerobic flush only — comes from recovery_protocols module.
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

export function buildMdPlus1Recovery(): SessionBlock[] {
  // Jump shrug from MD-3 dosing but reduced to 2 sets × 3 (microdose stim).
  const shrug = prescribe("ex_jump_shrug", "MD-3");
  const md1Shrug: PrescribedExercise = {
    ...shrug,
    dose: { ...shrug.dose, sets: 2 },
  };

  // Long iso ham bridge from MD-4 dosing — kept full (tendon work is
  // protective, low-stress, ideal for the day after a match).
  const isoHam = prescribe("ex_iso_ham_bridge_long", "MD-4");

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
        "Hip mobility flow + glute activation. ~5 min. Doubles as light " +
        "movement to flush soreness (Howatson & Milak 2009).",
      noteIS:
        "Mjaðmaliðsflæði + glute virkjun. ~5 mín. Tvöfaldast sem létt " +
        "hreyfing til að flush-a sárindi (Howatson & Milak 2009).",
    },
    {
      id: "mdplus1-explosive-stim",
      titleEN: "Explosive primer (DNP only)",
      titleIS: "Sprengikraftur primer (DNP eingöngu)",
      type: "POWER_PRIMER",
      exercises: [md1Shrug],
      noteEN:
        "Jump shrug 2 sets × 3 — microdose stim for players who did NOT " +
        "play 60+ min. Verdict engine strips this for starters.",
      noteIS:
        "Jump shrug 2 sett × 3 — microdose stim fyrir leikmenn sem spiluðu " +
        "EKKI 60+ mín. Verdict engine fjarlægir þetta fyrir byrjunarlið.",
    },
    {
      id: "mdplus1-iso-ham",
      titleEN: "Long iso ham bridge (tendon maintenance)",
      titleIS: "Lang iso ham bridge (sinaviðhald)",
      type: "ISO_FINISH",
      exercises: [isoHam],
      noteEN:
        "2 × 30s single-leg iso glute bridge. Tendon maintenance dose; " +
        "no eccentric load. Safe for both starters and DNP.",
      noteIS:
        "2 × 30s einfætt iso glute bridge. Sinaviðhalds-skammtur; " +
        "ekkert eccentric álag. Öruggt fyrir bæði byrjunarlið og DNP.",
    },
  ];
}
