import type { AteAthleteState, AteMdContext, AteSessionIntent } from "./types";

export const ATE_READINESS_BANDS: Record<AteAthleteState, { min: number; max: number }> = {
  GREEN_PLUS: { min: 75, max: 100 },
  GREEN: { min: 60, max: 74 },
  YELLOW: { min: 40, max: 59 },
  RED: { min: Number.NEGATIVE_INFINITY, max: 39 },
};

export const ATE_BORDERLINE_THRESHOLDS = {
  greenUpperBorderline: 64,
  greenPlusUpperBorderline: 78,
} as const;

export const ATE_DEFAULTS = {
  fallbackState: "YELLOW" as AteAthleteState,
  fallbackBlueprintId: "md2_power_primer",
  minVelocityLossCap: 0.03,
  minSafeSets: 1,
} as const;

export const ATE_SESSION_INTENT_BY_MD: Record<AteMdContext, AteSessionIntent> = {
  MD5: "PRIMER",
  MD4: "PRIMER",
  MD3: "FORCE",
  MD2: "POWER",
  MD1: "PRIMER",
  MD_PLUS_1: "RECOVERY",
  OFF: "RESET",
  UNKNOWN: "PRIMER",
};

export const ATE_BLUEPRINT_BY_MD: Partial<Record<AteMdContext, string>> = {
  MD3: "md3_lower_force",
  MD2: "md2_power_primer",
  MD1: "md1_neural_primer",
};

export const ATE_MD_REASON_BY_CONTEXT: Partial<Record<AteMdContext, "MD3_FORCE_DAY" | "MD2_POWER_DAY" | "MD1_PRIMER_DAY">> = {
  MD3: "MD3_FORCE_DAY",
  MD2: "MD2_POWER_DAY",
  MD1: "MD1_PRIMER_DAY",
};

