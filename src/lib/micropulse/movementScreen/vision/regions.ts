/**
 * Movement-analysis ENGINE — the curated, machine-checkable knowledge the AI
 * vision analysis is grounded in (OsteoSport pattern, layer 1). Body regions +
 * the assessable fields per region. The model is handed THIS as a lens (allowed
 * region keys + allowed field ids), never a raw library; its output is then
 * filtered against these known-valid keys (see schema.ts `normalize…`), so the
 * rest of the app can trust the region + priority fields it returns and wire
 * them into the assessment (carry-over).
 *
 * Screening / training only — never a diagnosis, never the readiness colour.
 */
import type { Bi } from "../registry";

export type RegionKey = "cervical" | "thoracic" | "shoulder" | "lumbar" | "hip" | "knee" | "ankle_foot";

export type RegionField = {
  id: string;
  label: Bi;
  /** What the field looks at — a coaching cue, not a diagnostic claim. */
  note?: Bi;
};

export type MovementRegion = {
  key: RegionKey;
  label: Bi;
  fields: RegionField[];
};

/** The curated engine. Field ids are the allowed `priorityFieldIds`. */
export const REGIONS: MovementRegion[] = [
  {
    key: "cervical",
    label: { en: "Cervical spine", is: "Hálshryggur" },
    fields: [
      { id: "forward_head", label: { en: "Forward-head posture", is: "Fram-höfuðstaða" } },
      { id: "cervical_rotation_rom", label: { en: "Cervical rotation ROM", is: "Háls-snúnings hreyfisvið" } },
    ],
  },
  {
    key: "thoracic",
    label: { en: "Thoracic spine", is: "Brjósthryggur" },
    fields: [
      { id: "thoracic_extension", label: { en: "Thoracic extension", is: "Brjósthryggs-extension" }, note: { en: "Seated / over-a-support extension.", is: "Sitjandi / yfir stuðning extension." } },
      { id: "seated_rotation", label: { en: "Seated rotation", is: "Sitjandi snúningur" } },
      { id: "overhead_reach_wall", label: { en: "Overhead reach at the wall", is: "Yfir-höfuð reach við vegg" } },
    ],
  },
  {
    key: "shoulder",
    label: { en: "Shoulder", is: "Öxl" },
    fields: [
      { id: "shoulder_flexion_prom_vs_arom", label: { en: "Shoulder flexion — PROM vs AROM", is: "Axla-flexion — PROM vs AROM" }, note: { en: "Passive vs active overhead range.", is: "Óvirkt vs virkt yfir-höfuð svið." } },
      { id: "overhead_stability", label: { en: "Overhead stability", is: "Yfir-höfuð stöðugleiki" } },
      { id: "scapular_control", label: { en: "Scapular control / symmetry", is: "Herðablaða-stjórn / samhverfa" } },
    ],
  },
  {
    key: "lumbar",
    label: { en: "Lumbar spine / pelvis", is: "Lendahryggur / mjaðmagrind" },
    fields: [
      { id: "anterior_pelvic_tilt", label: { en: "Anterior pelvic tilt / lordosis", is: "Anterior pelvic tilt / lordósa" } },
      { id: "posterior_pelvic_tilt_buttwink", label: { en: "Posterior tilt (butt wink)", is: "Posterior tilt (butt wink)" } },
      { id: "lumbo_pelvic_control", label: { en: "Lumbo-pelvic / core control", is: "Lendar-mjaðma / core stjórn" } },
    ],
  },
  {
    key: "hip",
    label: { en: "Hip", is: "Mjöðm" },
    fields: [
      { id: "hip_flexion_mobility", label: { en: "Hip-flexion mobility / depth", is: "Mjaðma-beygju hreyfanleiki / dýpt" } },
      { id: "hip_abductor_strength", label: { en: "Hip-abductor (glute med) strength", is: "Mjaðma-fráfærslu (glute med) styrkur" } },
      { id: "hip_hinge_pattern", label: { en: "Hip-hinge pattern", is: "Mjaðma-hinge mynstur" } },
      { id: "hip_ir_er_rom", label: { en: "Hip IR / ER ROM", is: "Mjaðma innsnúnings / útsnúnings svið" } },
    ],
  },
  {
    key: "knee",
    label: { en: "Knee", is: "Hné" },
    fields: [
      { id: "dynamic_valgus_mkd", label: { en: "Dynamic valgus / medial knee displacement", is: "Dynamic valgus / miðlæg hné-hliðrun" } },
      { id: "single_leg_squat_control", label: { en: "Single-leg squat control", is: "Einfætt hnébeygju-stjórn" } },
      { id: "knee_flexion_depth", label: { en: "Knee-flexion depth", is: "Hnébeygju-dýpt" } },
    ],
  },
  {
    key: "ankle_foot",
    label: { en: "Ankle / foot", is: "Ökkli / fótur" },
    fields: [
      { id: "ankle_dorsiflexion_wb", label: { en: "Weight-bearing ankle dorsiflexion", is: "Hlaðin ökkla-dorsiflexion" }, note: { en: "Knee-to-wall lunge.", is: "Hné-að-vegg lunge." } },
      { id: "calcaneal_eversion", label: { en: "Calcaneal eversion / arch", is: "Calcaneal eversion / ilrist" } },
      { id: "foot_pronation", label: { en: "Foot pronation", is: "Fótpronation" } },
    ],
  },
];

export const REGION_BY_KEY: Record<string, MovementRegion> = Object.fromEntries(REGIONS.map((r) => [r.key, r]));
export const REGION_KEYS: RegionKey[] = REGIONS.map((r) => r.key);
/** region key → the set of its valid field ids (for defensive normalization). */
export const FIELD_IDS_BY_REGION: Map<string, Set<string>> = new Map(
  REGIONS.map((r) => [r.key, new Set(r.fields.map((f) => f.id))]),
);

export function fieldLabel(regionKey: string, fieldId: string): Bi | null {
  return REGION_BY_KEY[regionKey]?.fields.find((f) => f.id === fieldId)?.label ?? null;
}
