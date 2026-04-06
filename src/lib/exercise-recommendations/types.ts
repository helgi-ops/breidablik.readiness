import type { Lang } from "@/lib/lang";

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

  // ─── Phase 1 / 2 flags ────────────────────────────────────────────────
  /** Elevated CNS fatigue detected — forces ISO / isometric regardless of readiness */
  neuralSuppressionFlag?: boolean;
  /** Session type is reduced/modified only — prevents high-demand options */
  modifiedOnlyFlag?: boolean;
  /** Knee irritation present — removes RFESS from unilateral options */
  kneeIrritationFlag?: boolean;

  // ─── Phase 3 flags ────────────────────────────────────────────────────
  /** General lower body soreness in GREEN state — biases explosive away from DB Snatch */
  lowerBodySorenessFlag?: boolean;
  /** Player is MD+1 or MD+2 (post-match residual window) — down-regulates CNS demand */
  postMatchResidualFlag?: boolean;
  /** Dense fixture schedule — biases explosive toward lowest CNS-cost option */
  scheduleCongestionFlag?: boolean;
  /** Posterior chain soreness — biases unilateral away from RFESS */
  posteriorChainSorenessFlag?: boolean;
  /** Quad-dominant soreness — restricts unilateral to isometric */
  quadDominantSorenessFlag?: boolean;
  /** Unilateral strength deficit detected — prioritises RFESS for asymmetry correction */
  unilateralDeficitFlag?: boolean;

  originalExerciseName?: string | null;

  /** Display language — controls playerText and UI label language */
  lang?: Lang;
}

/**
 * Audit trail produced alongside every recommendation result.
 * Visible to staff in debug mode; never shown to players.
 */
export interface RecommendationDebugInfo {
  /** Flags that were set to true and participated in the decision */
  activeFlags: string[];
  /** The reason code that ultimately drove the recommendation */
  selectedReasonCode: string | null;
  /** Full list of exercise IDs belonging to the detected group */
  groupExerciseIds: SupportedExerciseId[];
  /** Exercises removed from the allowed list and the reason each was excluded */
  exclusions: Array<{ exerciseId: SupportedExerciseId; reason: string }>;
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
  /** Audit trail for staff / debug views */
  debugInfo: RecommendationDebugInfo;
}

export interface ExerciseRecommendationUiInfo {
  badgeLabel: string | null;
  badgeTone: "neutral" | "warning" | "success";
  shortReason: string | null;
  playerReason: string | null;
}
