import { PLAN_FEATURES } from "./features";
import type { MicroPulseFeatureKey, MicroPulsePlanKey } from "./types";

const PLAN_ORDER: Record<MicroPulsePlanKey, number> = {
  FREE: 1,
  PRO: 2,
  ELITE: 3,
};

export function getPlanFeatures(plan: MicroPulsePlanKey): MicroPulseFeatureKey[] {
  return PLAN_FEATURES[plan];
}

export function hasFeature(plan: MicroPulsePlanKey, feature: MicroPulseFeatureKey): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

export function isAtLeastPro(plan: MicroPulsePlanKey): boolean {
  return PLAN_ORDER[plan] >= PLAN_ORDER.PRO;
}

export function isElite(plan: MicroPulsePlanKey): boolean {
  return plan === "ELITE";
}
