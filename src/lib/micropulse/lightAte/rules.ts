import type { LightAteAthleteState, LightAteMdContext } from "./types";

export const LIGHT_ATE_STATE_THRESHOLDS: Record<LightAteAthleteState, { min: number; max: number }> = {
  GREEN_PLUS: { min: 75, max: 100 },
  GREEN: { min: 60, max: 74 },
  YELLOW: { min: 40, max: 59 },
  RED: { min: Number.NEGATIVE_INFINITY, max: 39 },
};

export const LIGHT_ATE_MD_VL_CAPS: Record<LightAteMdContext, number | null> = {
  MD5: 0.2,
  MD4: 0.2,
  MD3: 0.15,
  MD2: 0.1,
  MD1: 0.05,
  MD_PLUS_1: 0.05,
  OFF: null,
  UNKNOWN: null,
};

export const LIGHT_ATE_LIMITS = {
  maxStructuralChanges: 1,
  maxParameterModifiers: 3,
  minVelocityLossCap: 0.03,
  minSafeSetsReduction: 0,
  maxRestExtensionSeconds: 60,
} as const;

export const LIGHT_ATE_DEFAULTS = {
  fallbackState: "YELLOW" as LightAteAthleteState,
  fallbackTemplateId: "md2_power_primer",
} as const;
