/**
 * deficitKey → CompensationKey bridge. The Movement Screening Assessment Form
 * produces a deficit ledger (canonical DeficitKeys aggregated across tests); this
 * maps those deficits onto the corrective/rehab routing key (CompensationKey) so
 * the FORM drives the corrective/strength plan exactly like the pose screen does.
 *
 * Only deficits that have a real corrective-compensation target are mapped;
 * mobility / thoracic / trunk findings (posterior_chain_length, hip_rotation_
 * mobility, thoracic_shoulder_mobility, trunk_core_control) surface on the ledger
 * / TPA but do NOT auto-generate correctives yet (honest — no matching corrective
 * set in the current library). Pure — no DB, no readiness colour.
 */
import type { CompensationKey } from "./registry";
import type { DeficitKey } from "../testCatalogue";

export const DEFICIT_COMPENSATION: Partial<Record<DeficitKey, CompensationKey[]>> = {
  frontal_valgus_control: ["dynamic_valgus"],
  hip_abductor_control: ["hip_abductor_weakness"],
  ankle_dorsiflexion: ["limited_dorsiflexion"],
  landing_mechanics: ["dynamic_valgus", "poor_absorption"],
  unilateral_reactive_control: ["low_reactive_strength", "limb_asymmetry"],
  eccentric_control: ["poor_absorption"],
  dynamic_single_leg_control: ["hip_abductor_weakness", "landing_instability"],
  // posterior_chain_length / hip_rotation_mobility / thoracic_shoulder_mobility /
  // trunk_core_control → no corrective-compensation target yet.
};

/** Compensations implied by a set of ledger deficits (deduped). */
export function compensationsForDeficits(deficits: Array<{ deficitKey: DeficitKey }>): CompensationKey[] {
  const set = new Set<CompensationKey>();
  for (const d of deficits) for (const c of DEFICIT_COMPENSATION[d.deficitKey] ?? []) set.add(c);
  return [...set];
}
