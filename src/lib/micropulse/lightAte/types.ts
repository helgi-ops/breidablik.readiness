export type LightAteAthleteState =
  | "GREEN_PLUS"
  | "GREEN"
  | "YELLOW"
  | "RED";

export type LightAteNeuralFatigueBand =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "VERY_HIGH";

export type LightAteYesterdayLoadBand =
  | "LOW"
  | "MODERATE"
  | "HIGH";

export type LightAteMdContext =
  | "MD5"
  | "MD4"
  | "MD3"
  | "MD2"
  | "MD1"
  | "MD_PLUS_1"
  | "OFF"
  | "UNKNOWN";

export type LightAteReasonCode =
  | "HIGH_READINESS"
  | "NORMAL_READINESS"
  | "LOW_READINESS"
  | "VERY_LOW_READINESS"
  | "LOW_NEURAL_FATIGUE"
  | "MODERATE_NEURAL_FATIGUE"
  | "HIGH_NEURAL_FATIGUE"
  | "VERY_HIGH_NEURAL_FATIGUE"
  | "HIGH_YESTERDAY_LOAD"
  | "EXTERNAL_PLAYER_LOAD_SPIKE"
  | "SPRINT_DISTANCE_SPIKE"
  | "MD_TEMPLATE_SELECTED"
  | "STATE_REDUCED"
  | "VL_CAPPED_BY_MD"
  | "CONTRAST_DISABLED"
  | "PRIMER_REPLACED"
  | "REST_EXTENDED"
  | "DEFAULT_TEMPLATE";

export interface LightAteModifiers {
  velocityLossCap?: number | null;
  reduceSetsBy?: number;
  extendRestSeconds?: number;
  disableContrast?: boolean;
  replaceBallisticPrimer?: boolean;
}

export interface LightAteDecisionInput {
  readinessScore?: number | null;
  neuralFatigueBand?: LightAteNeuralFatigueBand | null;
  yesterdayLoadBand?: LightAteYesterdayLoadBand | null;
  externalLoad?: {
    playerLoad?: number | null;
    playerLoad7DayAverage?: number | null;
    sprintDistance?: number | null;
    sprintDistance7DayAverage?: number | null;
  } | null;
  mdContext: LightAteMdContext;
}

export interface LightAteDecisionResult {
  templateId: string;
  athleteState: LightAteAthleteState;
  modifiers: LightAteModifiers;
  reasons: LightAteReasonCode[];
  riskFlags: string[];
}
