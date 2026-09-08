/**
 * King "Initial Ax" assessment schema — the reusable MicroPulse rehab-assessment
 * data model, from a real King assessment template (`Anton L/Anton L Rehab.xlsx`).
 *
 * Three field groups, each scored R/L with a note and a pain flag ("brought on
 * groin pain / painfree on discharge"):
 *   1. Joint ROM / special tests
 *   2. Strength (0–5, Oxford scale)
 *   3. Global movement
 *
 * This structure feeds Total Player Analysis (athlete-axis weaknesses — a lopsided
 * R/L strength or a provoked-pain flag is an ABSOLUTE per-player finding, like the
 * movement screen, NOT a squad percentile) and GATES the King program.
 *
 * Assessment RECORDS are athlete health data → consent- and access-gated exactly
 * like clinical reports; only this neutral SCHEMA lives here. Rehab-support /
 * screening only — never a diagnosis, never the readiness colour. Pure data.
 */
import type { Bi } from "../registry";

/** How a field is scored. */
export type KingScoreType =
  | "rom" // degrees / qualitative range
  | "strength_0_5" // Oxford 0–5 manual muscle test
  | "movement"; // qualitative global-movement quality

export type KingAssessmentField = {
  id: string;
  label: Bi;
  scoreType: KingScoreType;
  /** Scored on both sides (R / L). */
  bilateral: boolean;
  /** Can carry a "provoked pain / painfree" flag. */
  painFlag: boolean;
  hint?: Bi;
};

export type KingAssessmentGroup = {
  id: string;
  label: Bi;
  fields: KingAssessmentField[];
};

const rom = (id: string, en: string, is: string, painFlag = false): KingAssessmentField =>
  ({ id, label: { en, is }, scoreType: "rom", bilateral: true, painFlag });
const str = (id: string, en: string, is: string): KingAssessmentField =>
  ({ id, label: { en, is }, scoreType: "strength_0_5", bilateral: true, painFlag: true });
const mov = (id: string, en: string, is: string, bilateral = false): KingAssessmentField =>
  ({ id, label: { en, is }, scoreType: "movement", bilateral, painFlag: false });

export const KING_ASSESSMENT_SCHEMA: KingAssessmentGroup[] = [
  {
    id: "rom_special",
    label: { en: "Joint ROM / special tests", is: "Liðferill / sérpróf" },
    fields: [
      rom("shoulder_er", "Shoulder external rotation", "Axlar-útsnúningur"),
      rom("shoulder_ir", "Shoulder internal rotation", "Axlar-innsnúningur"),
      rom("hip_ir", "Hip internal rotation", "Mjaðma-innsnúningur"),
      rom("hip_er", "Hip external rotation", "Mjaðma-útsnúningur"),
      rom("thomas", "Thomas test (hip-flexor / rec fem length)", "Thomas-próf (mjaðma-beygju / rec fem lengd)", true),
      rom("faber", "FABER", "FABER", true),
      rom("knee_flexion", "Knee flexion", "Hné-beygja"),
      rom("knee_extension", "Knee extension", "Hné-rétta"),
      rom("tibial_torsion", "Tibial torsion", "Sköflungs-snúningur"),
      rom("ankle_df", "Ankle dorsiflexion", "Ökkla-dorsiflexion"),
      rom("ankle_pf", "Ankle plantarflexion", "Ökkla-plantarflexion"),
      rom("rearfoot_inv", "Rearfoot inversion", "Aftur-fótar innsnúningur"),
      rom("rearfoot_ev", "Rearfoot eversion", "Aftur-fótar útsnúningur"),
      rom("forefoot_inv", "Forefoot inversion", "Fram-fótar innsnúningur"),
      rom("forefoot_ev", "Forefoot eversion", "Fram-fótar útsnúningur"),
      rom("first_mtp", "1st MTP", "1. MTP"),
    ],
  },
  {
    id: "strength",
    label: { en: "Strength (0–5, R/L, pain flag)", is: "Styrkur (0–5, H/V, verkja-flagg)" },
    fields: [
      str("obliques", "Obliques", "Skálvöðvar (obliques)"),
      str("hip_flexion", "Hip flexion", "Mjaðma-beygja"),
      str("deep_rotators", "Deep rotators", "Djúpir snúningsvöðvar"),
      str("hip_abd_active", "Hip abduction (active)", "Mjaðma-fráfærsla (virk)"),
      str("hip_abd_passive", "Hip abduction (passive)", "Mjaðma-fráfærsla (óvirk)"),
      str("hip_abduction", "Hip abduction", "Mjaðma-fráfærsla"),
      str("hip_abduction_er", "Hip abduction / ER", "Mjaðma-fráfærsla / ER"),
      str("hip_adduction", "Hip adduction", "Mjaðma-aðfærsla"),
      str("hip_adduction_magnus", "Hip adduction (magnus)", "Mjaðma-aðfærsla (magnus)"),
      str("hip_ext_sl", "Hip extension (short lever)", "Mjaðma-rétta (stuttur vogur)"),
      str("hip_ext_ll", "Hip extension (long lever)", "Mjaðma-rétta (langur vogur)"),
      str("irq", "Inner-range quads (IRQ)", "Inner-range framlæri (IRQ)"),
      str("irh_prone", "Inner-range hamstring, prone (IRH)", "Inner-range aftanlæri, á maga (IRH)"),
      str("peroneals", "Peroneals", "Peroneal-vöðvar"),
      str("tib_post", "Tibialis posterior", "Tibialis posterior"),
      str("fhl", "Flexor hallucis longus (FHL)", "Flexor hallucis longus (FHL)"),
      str("cuff_er", "Shoulder cuff, external rotation", "Axlar-cuff, útsnúningur"),
      str("cuff_ir", "Shoulder cuff, internal rotation", "Axlar-cuff, innsnúningur"),
    ],
  },
  {
    id: "global_movement",
    label: { en: "Global movement", is: "Heildar-hreyfing" },
    fields: [
      mov("standing_posture", "Standing posture (sway)", "Standandi líkamsstaða (sveifla)"),
      mov("whole_body_rotation", "Whole-body rotation", "Heildar-líkams snúningur", true),
      mov("dl_squat", "Double-leg squat", "Tvífætt hnébeygja"),
      mov("sl_squat", "Single-leg squat", "Einfætt hnébeygja", true),
      mov("dl_calf_raise", "Double-leg calf raise", "Tvífætt kálfalyfta"),
      mov("sl_calf_raise", "Single-leg calf raise", "Einfætt kálfalyfta", true),
    ],
  },
];

export const KING_ASSESSMENT_BY_ID: Record<string, KingAssessmentField> = Object.fromEntries(
  KING_ASSESSMENT_SCHEMA.flatMap((g) => g.fields.map((f) => [f.id, f])),
);

export const KING_ASSESSMENT_CAVEAT: Bi = {
  en: "King 'Initial Ax' rehab-assessment schema. Records are athlete health data — consent- and access-gated like clinical reports. Rehab-support / screening only; never a diagnosis, never the readiness colour. The clinician scores and gates the program.",
  is: "King 'Initial Ax' endurhæfingar-mats skema. Skráningar eru heilsugögn íþróttamanns — samþykkis- og aðgangs-varin eins og klínískar skýrslur. Endurhæfingar-stuðningur / skimun eingöngu; aldrei greining, aldrei lita-mat. Klíníker skorar og stýrir prógramminu.",
};
