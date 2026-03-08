export type FatigueType = "NONE" | "SYSTEMIC" | "NEURAL" | "TISSUE" | "MIXED";
export type FatigueSeverity = "LOW" | "MODERATE" | "HIGH";
export type FatigueConfidence = "LOW" | "MEDIUM" | "HIGH";
export type TrainingModifier =
  | "NEURAL_LOW_DENSITY"
  | "NEURAL_LOW_CONTACT"
  | "NEURAL_EXTENDED_REST"
  | "KEEP_QUALITY_HIGH"
  | "ADD_NEURAL_RESET"
  | "TISSUE_SWAP_BALLISTIC"
  | "TISSUE_PROTECT_ACHILLES"
  | "TISSUE_PROTECT_HAMSTRING"
  | "TISSUE_PROTECT_PATELLAR"
  | "ADD_TENDON_RELOAD"
  | "SYSTEMIC_REDUCE_VOLUME"
  | "SYSTEMIC_SIMPLIFY_SESSION"
  | "SYSTEMIC_RECOVERY_BIAS";

export type PainLocation =
  | "ACHILLES"
  | "HAMSTRING"
  | "PATELLAR"
  | "GROIN"
  | "CALF"
  | "ADDUCTOR"
  | "OTHER"
  | null;

export type FatigueInput = {
  playerId: string;
  playerName?: string;

  energy: number | null;
  sleepQuality: number | null;
  sleepDuration: number | null;
  stress: number | null;
  soreness: number | null;

  totalScore: number | null;
  sten: number | null;
  zReadiness: number | null;
  deltaZ: number | null;

  lowStenDays: number;
  poorWellnessCount: number | null;

  hsrHighYesterday: boolean;
  accelHighYesterday: boolean;
  decelHighYesterday: boolean;
  totalDistanceHighYesterday: boolean;
  intensityHighYesterday: boolean;
  matchMinutesHigh: boolean;
  scheduleCongestion: boolean;
  travelFlag: boolean;

  hasPainFlag: boolean;
  painLocation: PainLocation;
  repeatedSameComplaint: boolean;
  localComplaintMatchesLoad: boolean;

  mdDay: string | null;
  teamVolatilityHigh: boolean;

  hasWellnessData: boolean;
  hasLoadData: boolean;
};

export type FatigueClassification = {
  playerId: string;
  primaryFatigueType: FatigueType;
  severity: FatigueSeverity;
  confidence: FatigueConfidence;
  score: number;
  drivers: string[];
  recommendedModifiers: TrainingModifier[];
  reasonCodes: string[];
};
