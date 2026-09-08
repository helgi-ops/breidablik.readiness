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
import { CORRECTIVE_BY_SLUG, CORRECTIVE_PHASE_LABEL, SEED_CORRECTIVE_EXERCISES, type CorrectiveExercise, type CorrectivePhase, type CompensationKey } from "./registry";
import { additionalForCompensations } from "./exerciseSources";

// The routing key lives in the registry (shared vocabulary); re-exported here so
// existing importers (route.ts, rehabTracks.ts, …) keep working unchanged.
export type { CompensationKey } from "./registry";
export type PriorityKey =
  | "glute_med_max" | "ankle_dorsiflexion" | "posterior_chain" | "hip_flexor_length"
  | "reactive_strength" | "eccentric_absorption" | "single_leg_control" | "unilateral_weaker_side";

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
  reactive_strength: { en: "Reactive strength (plyometric progression)", is: "Viðbragðsstyrkur (plyometric stigmögnun)" },
  eccentric_absorption: { en: "Eccentric / landing absorption", is: "Eccentric / lendingar-deyfing" },
  single_leg_control: { en: "Single-leg control + balance", is: "Einfætt stjórn + jafnvægi" },
  unilateral_weaker_side: { en: "Unilateral loading (weaker side)", is: "Einhliða álag (veikari hlið)" },
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
  low_reactive_strength: {
    key: "low_reactive_strength",
    label: { en: "Low reactive strength (RSI)", is: "Lág viðbragðsstyrkur (RSI)" },
    priorities: ["reactive_strength"],
    slugs: ["pogo_hops", "single_leg_hops", "drop_landing_soft_catch"],
    citation: "Flanagan & Comyns 2008 (RSI / plyometric progression)",
  },
  poor_absorption: {
    key: "poor_absorption",
    label: { en: "Stiff / low-absorption landing", is: "Stíf / lítil deyfing við lendingu" },
    priorities: ["eccentric_absorption"],
    slugs: ["drop_landing_soft_catch", "eccentric_step_down", "split_squat"],
    citation: "Padua 2009 (LESS — landing absorption)",
  },
  landing_instability: {
    key: "landing_instability",
    label: { en: "Poor landing stability", is: "Léleg lendingar-stöðugleiki" },
    priorities: ["single_leg_control"],
    slugs: ["single_leg_balance", "drop_landing_soft_catch", "single_leg_squat"],
    citation: "Padua 2009; Ross & Guskiewicz 2005 (time to stabilization)",
  },
  limb_asymmetry: {
    key: "limb_asymmetry",
    label: { en: "Left/right asymmetry (limb symmetry index)", is: "Hægri/vinstri ósamhverfa (útlima-samhverfa)" },
    priorities: ["unilateral_weaker_side"],
    slugs: ["side_lying_hip_abduction", "single_leg_squat", "lateral_step_up", "split_squat"],
    citation: "Grindem 2016; Reid 2007 (LSI / RTP)",
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
  // Single-leg drop jump signature findings.
  rsi: "low_reactive_strength",
  knee_flexion_absorption: "poor_absorption",
  landing_sway: "landing_instability",
  lsi: "limb_asymmetry",
};

/** Fallback: a strength emphasis → compensation, for findings without a precise map. */
const EMPHASIS_COMPENSATION: Partial<Record<StrengthEmphasis, CompensationKey>> = {
  hip_abductor_er: "hip_abductor_weakness",
  posterior_chain: "forward_trunk_lean",
  mobility: "limited_dorsiflexion",
  plyometric: "low_reactive_strength",
  eccentric: "poor_absorption",
  unilateral: "limb_asymmetry",
};

const PHASE_ORDER: CorrectivePhase[] = ["inhibit", "lengthen", "activate", "integrate"];
const MVIC_ORDER = { low: 0, moderate: 1, high: 2, very_high: 3, undefined: 0 } as const;

export type CorrectivePhaseGroup = { phase: CorrectivePhase; label: Bi; items: CorrectiveExercise[] };
/** An objective input (e.g. a VALD force-plate signal) behind a compensation. */
export type ObjectiveSignal = { source: string; detail: Bi; ageDays: number; compensationLabel: Bi };
export type CorrectivePrescription = {
  compensations: Array<{ key: CompensationKey; label: Bi }>;
  priorities: Array<{ key: PriorityKey; label: Bi }>;
  phases: CorrectivePhaseGroup[];
  references: string[];
  caveat: Bi;
  reScreenInDays: number;
  /** Objective inputs (VALD) that contributed, with source + value + age. */
  objectiveSignals?: ObjectiveSignal[];
  /** The concrete data the plan was built from (screens + region assessment). */
  sources?: Array<{ kind: "screen" | "region"; label: Bi }>;
};

/** The display label for a compensation key (for objective-signal attribution). */
export function compensationLabel(key: CompensationKey): Bi {
  return COMPENSATIONS[key].label;
}

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

/** A region-assessment field id → the compensation it implies (grounded fields only). */
export const REGION_FIELD_COMPENSATION: Record<string, CompensationKey> = {
  dynamic_valgus_mkd: "dynamic_valgus",
  single_leg_squat_control: "dynamic_valgus",
  hip_abductor_strength: "hip_abductor_weakness",
  hip_hinge_pattern: "forward_trunk_lean",
  ankle_dorsiflexion_wb: "limited_dorsiflexion",
  knee_flexion_depth: "limited_dorsiflexion",
};

/** Compensations implied by a region assessment's flagged (moderate+) fields. */
export function compensationsForRegionFields(fields: Array<{ fieldId: string; severity: string }>): CompensationKey[] {
  const keys = new Set<CompensationKey>();
  for (const f of fields) {
    if (f.severity !== "moderate" && f.severity !== "marked") continue;
    const c = REGION_FIELD_COMPENSATION[f.fieldId];
    if (c) keys.add(c);
  }
  return [...keys];
}

/**
 * Build the ordered, de-duplicated corrective block for a screen's readings.
 * Returns null when nothing maps to a grounded corrective set.
 */
export function prescribeCorrectives(readings: ScreenReading[]): CorrectivePrescription | null {
  return prescribeForCompensations(compensationsForReadings(readings));
}

/** As above, from a region assessment's flagged fields. */
export function prescribeForRegionFields(fields: Array<{ fieldId: string; severity: string }>): CorrectivePrescription | null {
  return prescribeForCompensations(compensationsForRegionFields(fields));
}

/** The shared core: an ordered, de-duplicated corrective block for a set of compensations. */
export function prescribeForCompensations(compKeys: CompensationKey[]): CorrectivePrescription | null {
  if (!compKeys.length) return null;
  const comps = compKeys.map((k) => COMPENSATIONS[k]);

  // De-duplicated union of corrective exercises across every fired compensation.
  // First the curated EMG/clinical library (ordered), then every ADDITIONAL source
  // (Enda King today, other experts later) whose exercises address these
  // compensations — routed purely by the compensation key, no pipeline change.
  const slugSeen = new Set<string>();
  const exercises: CorrectiveExercise[] = [];
  for (const c of comps) {
    for (const slug of c.slugs) {
      if (slugSeen.has(slug)) continue;
      const ex = CORRECTIVE_BY_SLUG[slug];
      if (ex) { exercises.push(ex); slugSeen.add(slug); }
    }
  }
  for (const ex of additionalForCompensations(compKeys)) {
    if (slugSeen.has(ex.slug)) continue;
    exercises.push(ex); slugSeen.add(ex.slug);
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
