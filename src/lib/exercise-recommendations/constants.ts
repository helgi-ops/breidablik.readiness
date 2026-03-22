import type { RecommendationGroup, SupportedExerciseId } from "./types";

export const EXPLOSIVE_ACCESSORY_OPTIONS: SupportedExerciseId[] = [
  "DB_SNATCH",
  "JUMP_SHRUGS",
  "MID_THIGH_PULL",
  "ISO_MID_THIGH_PULL",
];

export const UNILATERAL_STRENGTH_OPTIONS: SupportedExerciseId[] = [
  "SPLIT_STANCE_TRAP_BAR_DEADLIFT",
  "RFESS",
  "ISOMETRIC_SPLIT_SQUAT_HOLD",
];

export const EXERCISE_LABELS_IS: Record<SupportedExerciseId, string> = {
  DB_SNATCH: "DB Snatch",
  JUMP_SHRUGS: "Jump Shrugs",
  MID_THIGH_PULL: "Mid-Thigh Pull",
  ISO_MID_THIGH_PULL: "ISO Mid-Thigh Pull",
  SPLIT_STANCE_TRAP_BAR_DEADLIFT: "Split Stance Trap Bar Deadlift",
  RFESS: "RFESS",
  ISOMETRIC_SPLIT_SQUAT_HOLD: "Isometric Split Squat Hold",
};

export const GROUP_OPTIONS: Record<RecommendationGroup, SupportedExerciseId[]> = {
  EXPLOSIVE_ACCESSORY: EXPLOSIVE_ACCESSORY_OPTIONS,
  UNILATERAL_STRENGTH_ACCESSORY: UNILATERAL_STRENGTH_OPTIONS,
};
