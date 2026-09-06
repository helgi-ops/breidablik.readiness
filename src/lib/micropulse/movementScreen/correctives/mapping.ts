/**
 * Compensation → corrective set mapping. A movement-screen reading pulls an
 * ordered corrective block (inhibit → lengthen → activate → integrate), and when
 * several findings share a root cause (e.g. ankle-DF restriction + weak glutes)
 * the prescription DE-DUPLICATES to one combined priority rather than two
 * overlapping lists. Pure — no DB, no readiness colour. Rules recommend; the
 * coach confirms / overrides. Grounded in the EMG / %MVIC literature (see
 * docs/research/corrective-exercise-library-evidence.md).
 */
import type { Bi, StrengthEmphasis } from "../registry";
import type { ScreenReading } from "../interpret";
import { CORRECTIVE_BY_SLUG, CORRECTIVE_PHASE_LABEL, SEED_CORRECTIVE_EXERCISES, type CorrectiveExercise, type CorrectivePhase } from "./registry";

export type CompensationKey = "dynamic_valgus" | "hip_abductor_weakness" | "forward_trunk_lean" | "limited_dorsiflexion";
export type PriorityKey = "glute_med_max" | "ankle_dorsiflexion" | "posterior_chain" | "hip_flexor_length";

type Compensation = {
  key: CompensationKey;
  label: Bi;
  priorities: PriorityKey[];
  slugs: string[]; // ordered across phases
  citation: string;
};

const PRIORITY_LABEL: Record<PriorityKey, Bi> = {
  glute_med_max: { en: "Glute med/max + hip-ER strength", is: "Glute med/max + mjaðma-ER styrkur" },
  ankle_dorsiflexion: { en: "Ankle-dorsiflexion mobility", is: "Ökkla-dorsiflexion hreyfanleiki" },
  posterior_chain: { en: "Posterior-chain (glute max) strength", is: "Aftari-keðju (glute max) styrkur" },
  hip_flexor_length: { en: "Hip-flexor length", is: "Mjaðma-beygju lengd" },
};

/** The seed compensations, grounded in the OHSA evidence note. */
const COMPENSATIONS: Record<CompensationKey, Compensation> = {
  dynamic_valgus: {
    key: "dynamic_valgus",
    label: { en: "Dynamic knee valgus (MKD)", is: "Dynamic knee valgus (MKD)" },
    priorities: ["glute_med_max", "ankle_dorsiflexion"],
    slugs: [
      "smr_tfl_itband", "smr_adductors",
      "calf_stretch_gastroc", "ankle_df_knee_to_wall",
      "glute_bridge", "clamshell", "side_lying_hip_abduction", "half_kneeling_banded_hip_er", "standing_banded_hip_abduction", "side_plank_hip_abduction",
      "lateral_step_up", "crossover_step_up", "single_leg_squat", "rotational_single_leg_squat", "goblet_squat_knee_tracking",
    ],
    citation: "Bell 2008/2012; Padua 2012; Macrum 2012; Bell 2013 (trainable); Ebert/Macadam/Bolgla (%MVIC)",
  },
  hip_abductor_weakness: {
    key: "hip_abductor_weakness",
    label: { en: "Hip-abductor weakness (pelvic drop / frontal control)", is: "Mjaðma-fráfærslu veikleiki (mjaðmagrindar-fall / frontal stjórn)" },
    priorities: ["glute_med_max"],
    slugs: ["clamshell", "side_lying_hip_abduction", "standing_banded_hip_abduction", "side_plank_hip_abduction", "lateral_step_up", "single_leg_squat"],
    citation: "Bramah 2018; Powers 2010; Ebert/Macadam/Bolgla (%MVIC)",
  },
  forward_trunk_lean: {
    key: "forward_trunk_lean",
    label: { en: "Excessive forward trunk lean", is: "Óhóflegur framhalli búks" },
    priorities: ["posterior_chain", "ankle_dorsiflexion", "hip_flexor_length"],
    slugs: [
      "smr_calf", "calf_stretch_gastroc", "hip_flexor_stretch", "ankle_df_knee_to_wall",
      "glute_bridge", "quadruped_hip_extension",
      "barbell_hip_thrust", "split_squat", "goblet_squat_counterbalance",
    ],
    citation: "Gmax activation reviews (hip thrust/split squat); Macrum 2012 (ankle DF)",
  },
  limited_dorsiflexion: {
    key: "limited_dorsiflexion",
    label: { en: "Limited ankle dorsiflexion / squat depth", is: "Skert ökkla-dorsiflexion / hnébeygju-dýpt" },
    priorities: ["ankle_dorsiflexion"],
    slugs: ["smr_calf", "calf_stretch_gastroc", "ankle_df_knee_to_wall", "goblet_squat_counterbalance"],
    citation: "Macrum 2012 (ankle DF drives valgus/lean)",
  },
};

/** A screen finding's variable → its compensation (precise). */
const VARIABLE_COMPENSATION: Record<string, CompensationKey> = {
  knee_valgus: "dynamic_valgus",
  knee_valgus_contact: "dynamic_valgus",
  knee_valgus_absorption: "dynamic_valgus",
  knee_asymmetry: "dynamic_valgus",
  pelvic_drop: "hip_abductor_weakness",
  pelvic_obliquity: "hip_abductor_weakness",
  lateral_shift: "hip_abductor_weakness",
  trunk_lean_frontal: "hip_abductor_weakness",
  forward_lean: "forward_trunk_lean",
  squat_depth: "limited_dorsiflexion",
  heel_rise: "limited_dorsiflexion",
  posterior_pelvic_tilt: "limited_dorsiflexion",
};

/** Fallback: a strength emphasis → compensation, for findings without a precise map. */
const EMPHASIS_COMPENSATION: Partial<Record<StrengthEmphasis, CompensationKey>> = {
  hip_abductor_er: "hip_abductor_weakness",
  posterior_chain: "forward_trunk_lean",
  mobility: "limited_dorsiflexion",
};

const PHASE_ORDER: CorrectivePhase[] = ["inhibit", "lengthen", "activate", "integrate"];
const MVIC_ORDER = { low: 0, moderate: 1, high: 2, very_high: 3, undefined: 0 } as const;

export type CorrectivePhaseGroup = { phase: CorrectivePhase; label: Bi; items: CorrectiveExercise[] };
export type CorrectivePrescription = {
  compensations: Array<{ key: CompensationKey; label: Bi }>;
  priorities: Array<{ key: PriorityKey; label: Bi }>;
  phases: CorrectivePhaseGroup[];
  references: string[];
  caveat: Bi;
  reScreenInDays: number;
};

const CAVEAT: Bi = {
  en: "Corrective focus for a trainable movement compensation — re-screen in ~5 weeks to confirm it closed (Bell 2013). This improves movement quality; it is NOT an injury-risk reduction claim (Bonazza 2017; Dorrel 2015). Pain / red flags → clinician.",
  is: "Leiðréttingar-áhersla á þjálfanlega hreyfi-uppbót — endurskima eftir ~5 vikur til að staðfesta að hún hafi lokast (Bell 2013). Bætir hreyfigæði; er EKKI fullyrðing um minnkun meiðsla-áhættu (Bonazza 2017; Dorrel 2015). Verkur / rauð flögg → klíníker.",
};

/** Which compensations a set of screen readings implies (deduped). */
export function compensationsForReadings(readings: ScreenReading[]): CompensationKey[] {
  const keys = new Set<CompensationKey>();
  for (const r of readings) {
    const byVar = VARIABLE_COMPENSATION[r.variableKey];
    if (byVar) { keys.add(byVar); continue; }
    const byEmph = EMPHASIS_COMPENSATION[r.strengthEmphasis];
    if (byEmph) keys.add(byEmph);
  }
  return [...keys];
}

/**
 * Build the ordered, de-duplicated corrective block for a screen's readings.
 * Returns null when nothing maps to a grounded corrective set.
 */
export function prescribeCorrectives(readings: ScreenReading[]): CorrectivePrescription | null {
  const compKeys = compensationsForReadings(readings);
  if (!compKeys.length) return null;
  const comps = compKeys.map((k) => COMPENSATIONS[k]);

  // De-duplicated union of corrective exercises across every fired compensation.
  const slugSeen = new Set<string>();
  const exercises: CorrectiveExercise[] = [];
  for (const c of comps) {
    for (const slug of c.slugs) {
      if (slugSeen.has(slug)) continue;
      const ex = CORRECTIVE_BY_SLUG[slug];
      if (ex) { exercises.push(ex); slugSeen.add(slug); }
    }
  }

  // Group by phase, ordered inhibit → lengthen → activate → integrate; within the
  // activate phase, order by measured %MVIC (low → very-high).
  const phases: CorrectivePhaseGroup[] = [];
  for (const phase of PHASE_ORDER) {
    const items = exercises.filter((e) => e.phase === phase);
    if (!items.length) continue;
    if (phase === "activate") items.sort((a, b) => MVIC_ORDER[a.mvic?.band ?? "undefined"] - MVIC_ORDER[b.mvic?.band ?? "undefined"]);
    phases.push({ phase, label: CORRECTIVE_PHASE_LABEL[phase], items });
  }

  // Combined priorities (deduped across compensations) — the shared root cause.
  const prioSeen = new Set<PriorityKey>();
  const priorities: Array<{ key: PriorityKey; label: Bi }> = [];
  for (const c of comps) for (const p of c.priorities) if (!prioSeen.has(p)) { prioSeen.add(p); priorities.push({ key: p, label: PRIORITY_LABEL[p] }); }

  // References — the compensation cause citations + the exercises' EMG citations.
  const refs = new Set<string>();
  for (const c of comps) refs.add(c.citation);
  for (const e of exercises) { refs.add(e.citation); if (e.mvic) refs.add(e.mvic.citation); }

  return {
    compensations: comps.map((c) => ({ key: c.key, label: c.label })),
    priorities,
    phases,
    references: [...refs],
    caveat: CAVEAT,
    reScreenInDays: 35,
  };
}

/** Flatten a prescription to the `{ block, items }` structure the player card /
 *  strength override / periodised week already render (buildSessionBlocks). */
export function prescriptionToStructure(p: CorrectivePrescription, isEN: boolean): Array<{ block: string; items: string[] }> {
  const L = (b: Bi) => (isEN ? b.en : b.is);
  return p.phases.map((grp) => ({
    block: L(grp.label),
    items: grp.items.map((e) => {
      const dose = L(e.dose);
      const cue = L(e.cue);
      return `${L(e.name)} — ${dose}${cue ? ` · ${cue}` : ""}`;
    }),
  }));
}

export { SEED_CORRECTIVE_EXERCISES };
