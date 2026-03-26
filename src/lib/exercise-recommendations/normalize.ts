import { EXERCISE_LABELS_IS } from "./constants";
import type { RecommendationGroup, SupportedExerciseId } from "./types";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeExerciseNameToId(name: string): SupportedExerciseId | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  if (normalized.includes("db snatch") || normalized.includes("dumbbell snatch")) return "DB_SNATCH";
  if (
    normalized.includes("jump shrugs") ||
    normalized.includes("jump shrug") ||
    normalized.includes("barbell jump shrugs") ||
    normalized.includes("jump shrug from hang")
  ) {
    return "JUMP_SHRUGS";
  }
  if (normalized.includes("iso mid thigh pull") || normalized.includes("iso mid-thigh pull")) return "ISO_MID_THIGH_PULL";
  if (normalized.includes("mid thigh pull") || normalized.includes("mid-thigh pull")) return "MID_THIGH_PULL";
  if (normalized.includes("split stance trap bar deadlift")) return "SPLIT_STANCE_TRAP_BAR_DEADLIFT";
  if (normalized === "rfess" || normalized.includes("rear foot elevated split squat")) return "RFESS";
  if (
    normalized.includes("isometric split squat hold") ||
    normalized.includes("isometric split squat") ||
    normalized.includes("iso split squat hold") ||
    normalized.includes("split squat iso") ||
    normalized.includes("split squat hold")
  ) {
    return "ISOMETRIC_SPLIT_SQUAT_HOLD";
  }

  return null;
}

export function getRecommendationGroupForExercise(id: SupportedExerciseId): RecommendationGroup | null {
  if (id === "DB_SNATCH" || id === "JUMP_SHRUGS" || id === "MID_THIGH_PULL" || id === "ISO_MID_THIGH_PULL") {
    return "EXPLOSIVE_ACCESSORY";
  }
  if (id === "SPLIT_STANCE_TRAP_BAR_DEADLIFT" || id === "RFESS" || id === "ISOMETRIC_SPLIT_SQUAT_HOLD") {
    return "UNILATERAL_STRENGTH_ACCESSORY";
  }
  return null;
}

export function getSupportedExerciseLabel(id: SupportedExerciseId | null): string | null {
  if (!id) return null;
  return EXERCISE_LABELS_IS[id] ?? null;
}
