export type ReadinessState = "GREEN" | "YELLOW" | "RED";
export type RiskState = "LOW" | "MODERATE" | "HIGH";
export type TrainingMode = "PUSH" | "MAINTAIN" | "MODIFY" | "PROTECT" | "REGENERATE";

export type SupportedExerciseId =
  | "DB_SNATCH"
  | "JUMP_SHRUGS"
  | "MID_THIGH_PULL"
  | "ISO_MID_THIGH_PULL"
  | "SPLIT_STANCE_TRAP_BAR_DEADLIFT"
  | "RFESS"
  | "ISOMETRIC_SPLIT_SQUAT_HOLD";

export type RecommendationGroup =
  | "EXPLOSIVE_ACCESSORY"
  | "UNILATERAL_STRENGTH_ACCESSORY";

export interface ExerciseRecommendationInput {
  readinessState?: ReadinessState | null;
  riskState?: RiskState | null;
  trainingMode?: TrainingMode | null;
  neuralSuppressionFlag?: boolean;
  modifiedOnlyFlag?: boolean;
  kneeIrritationFlag?: boolean;
  originalExerciseName?: string | null;
}

export interface ExerciseRecommendationResult {
  originalExerciseId: SupportedExerciseId | null;
  group: RecommendationGroup | null;
  recommendedExerciseId: SupportedExerciseId | null;
  allowedExerciseIds: SupportedExerciseId[];
  restrictedExerciseIds: SupportedExerciseId[];
  reasonCode: string | null;
  coachText: string | null;
  playerText: string | null;
  shouldRenderRecommendation: boolean;
}

export interface ExerciseRecommendationUiInfo {
  badgeLabel: string | null;
  badgeTone: "neutral" | "warning" | "success";
  shortReason: string | null;
  playerReason: string | null;
}
