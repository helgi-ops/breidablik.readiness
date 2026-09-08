/**
 * Unified deficit vocabulary — the controlled `QualityKey` set every source maps
 * onto, so the reconciler can aggregate the SAME quality across the movement
 * screen, the screening form, VALD, VBT, IMA and clinical assessment into ONE
 * deficit (not overlapping flags). Bridges the existing CompensationKey (corrective
 * routing) and the screening DeficitKey into one language, and back to the
 * corrective compensations so every plan item stays traceable. Pure — no DB.
 *
 * Descriptive only — never the readiness colour; a movement-screen quality is a
 * hypothesis, not a diagnosis; pain / red flags → clinician.
 */
import type { Bi } from "../movementScreen/registry";
import type { CompensationKey } from "../movementScreen/correctives/registry";
import type { DeficitKey, ResultDomain } from "../movementScreen/testCatalogue";

export type Domain = ResultDomain;

export type QualityKey =
  | "landing_valgus"
  | "glute_med_er_control"
  | "ankle_dorsiflexion_mobility"
  | "reactive_strength"
  | "eccentric_absorption"
  | "landing_stability"
  | "limb_asymmetry"
  | "posterior_chain_length"
  | "hip_rotation_mobility"
  | "thoracic_shoulder_mobility"
  | "trunk_antirotation";

export const QUALITY_LABEL: Record<QualityKey, Bi> = {
  landing_valgus: { en: "Frontal-plane knee control (valgus)", is: "Frontal-plana hné-stjórn (valgus)" },
  glute_med_er_control: { en: "Glute-med / hip-ER control", is: "Glute-med / mjaðma-ER stjórn" },
  ankle_dorsiflexion_mobility: { en: "Ankle-dorsiflexion mobility", is: "Ökkla-dorsiflexion hreyfanleiki" },
  reactive_strength: { en: "Reactive strength (RSI)", is: "Viðbragðsstyrkur (RSI)" },
  eccentric_absorption: { en: "Eccentric / landing absorption", is: "Eccentric / lendingar-deyfing" },
  landing_stability: { en: "Single-leg landing stability", is: "Einfætt lendingar-stöðugleiki" },
  limb_asymmetry: { en: "Left–right asymmetry (LSI)", is: "Hægri–vinstri ósamhverfa (LSI)" },
  posterior_chain_length: { en: "Posterior-chain / hamstring length", is: "Aftari-keðju / aftanlæris lengd" },
  hip_rotation_mobility: { en: "Hip-rotation mobility", is: "Mjaðma-snúnings hreyfanleiki" },
  thoracic_shoulder_mobility: { en: "Thoracic / shoulder mobility", is: "Brjósthryggjar / axlar hreyfanleiki" },
  trunk_antirotation: { en: "Trunk / anti-rotation control", is: "Búk / and-snúnings stjórn" },
};

/** Primary domain for a quality (drives which consumer reads it). */
export const QUALITY_DOMAIN: Record<QualityKey, Domain> = {
  landing_valgus: "movement_quality",
  glute_med_er_control: "motor_control",
  ankle_dorsiflexion_mobility: "mobility",
  reactive_strength: "power_reactive",
  eccentric_absorption: "motor_control",
  landing_stability: "balance",
  limb_asymmetry: "asymmetry",
  posterior_chain_length: "mobility",
  hip_rotation_mobility: "mobility",
  thoracic_shoulder_mobility: "mobility",
  trunk_antirotation: "motor_control",
};

/** CompensationKey (pose screen / VALD / corrective routing) → unified quality. */
export const COMPENSATION_QUALITY: Record<CompensationKey, QualityKey> = {
  dynamic_valgus: "landing_valgus",
  hip_abductor_weakness: "glute_med_er_control",
  forward_trunk_lean: "ankle_dorsiflexion_mobility",
  limited_dorsiflexion: "ankle_dorsiflexion_mobility",
  low_reactive_strength: "reactive_strength",
  poor_absorption: "eccentric_absorption",
  landing_instability: "landing_stability",
  limb_asymmetry: "limb_asymmetry",
};

/** Screening-form DeficitKey → unified quality. */
export const DEFICIT_QUALITY: Record<DeficitKey, QualityKey> = {
  frontal_valgus_control: "landing_valgus",
  hip_abductor_control: "glute_med_er_control",
  ankle_dorsiflexion: "ankle_dorsiflexion_mobility",
  posterior_chain_length: "posterior_chain_length",
  hip_rotation_mobility: "hip_rotation_mobility",
  thoracic_shoulder_mobility: "thoracic_shoulder_mobility",
  trunk_core_control: "trunk_antirotation",
  landing_mechanics: "landing_valgus",
  unilateral_reactive_control: "reactive_strength",
  eccentric_control: "eccentric_absorption",
  dynamic_single_leg_control: "landing_stability",
};

/** Quality → the corrective compensations it drives (plan traceability). */
export const QUALITY_COMPENSATION: Partial<Record<QualityKey, CompensationKey[]>> = {
  landing_valgus: ["dynamic_valgus"],
  glute_med_er_control: ["hip_abductor_weakness"],
  ankle_dorsiflexion_mobility: ["limited_dorsiflexion"],
  reactive_strength: ["low_reactive_strength"],
  eccentric_absorption: ["poor_absorption"],
  landing_stability: ["landing_instability"],
  limb_asymmetry: ["limb_asymmetry"],
  posterior_chain_length: ["forward_trunk_lean"],
  // hip_rotation_mobility / thoracic_shoulder_mobility / trunk_antirotation → no
  // corrective-compensation target yet (surface + strength/mobility work only).
};

/** Which consumer(s) a quality feeds, from its domain. */
export function feedsFor(domain: Domain): Array<"corrective" | "strength"> {
  const out: Array<"corrective" | "strength"> = [];
  if (["mobility", "movement_quality", "motor_control", "balance", "asymmetry"].includes(domain)) out.push("corrective");
  if (["strength", "power_reactive", "asymmetry"].includes(domain)) out.push("strength");
  return out.length ? out : ["corrective"];
}
