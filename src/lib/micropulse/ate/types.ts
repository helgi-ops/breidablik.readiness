export type AteAthleteState =
  | "GREEN_PLUS"
  | "GREEN"
  | "YELLOW"
  | "RED";

export type AteNeuralFatigueBand =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "VERY_HIGH";

export type AteYesterdayLoadBand =
  | "LOW"
  | "MODERATE"
  | "HIGH";

export type AteMdContext =
  | "MD5"
  | "MD4"
  | "MD3"
  | "MD2"
  | "MD1"
  | "MD_PLUS_1"
  | "OFF"
  | "UNKNOWN";

export type AteSessionIntent =
  | "FORCE"
  | "FORCE_POWER"
  | "POWER"
  | "PRIMER"
  | "RECOVERY"
  | "RESET";

export type AteReasonCode =
  | "HIGH_READINESS"
  | "NORMAL_READINESS"
  | "LOW_READINESS"
  | "VERY_LOW_READINESS"
  | "LOW_NEURAL_FATIGUE"
  | "MODERATE_NEURAL_FATIGUE"
  | "HIGH_NEURAL_FATIGUE"
  | "VERY_HIGH_NEURAL_FATIGUE"
  | "HIGH_YESTERDAY_LOAD"
  | "MD3_FORCE_DAY"
  | "MD2_POWER_DAY"
  | "MD1_PRIMER_DAY"
  | "RED_RESET_DAY"
  | "FORCE_COST_REDUCED"
  | "BALLISTIC_REPLACED"
  | "CONTRAST_DISABLED"
  | "REST_EXTENDED"
  | "VL_TIGHTENED"
  | "DEFAULT_BLUEPRINT";

export interface AteParameterModifiers {
  reduceSetsBy?: number;
  tightenVelocityLossBy?: number;
  extendRestSeconds?: number;
  disableContrast?: boolean;
  replaceBallisticPrimer?: boolean;
}

export interface AteDecisionInput {
  readinessScore?: number | null;
  neuralFatigueBand?: AteNeuralFatigueBand | null;
  yesterdayLoadBand?: AteYesterdayLoadBand | null;
  mdContext: AteMdContext;
}

export interface AteDecisionResult {
  athleteState: AteAthleteState;
  sessionIntent: AteSessionIntent;
  blueprintId: string;
  decisionReasons: AteReasonCode[];
  parameterModifiers: AteParameterModifiers;
  riskFlags: string[];
}
