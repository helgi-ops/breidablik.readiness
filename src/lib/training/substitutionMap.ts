export type ExerciseCategory =
  | "plyometric_vertical"
  | "plyometric_reactive"
  | "sprint_max_velocity"
  | "sprint_acceleration"
  | "strength_lower"
  | "strength_upper"
  | "accessory"
  | "rehab"
  | "unknown";

export type TissueKey = "achilles" | "hamstring" | "patellar";

export const substitutionMap: Record<ExerciseCategory, string[]> = {
  plyometric_vertical: ["trap_bar_jump", "kettlebell_jump", "isometric_mid_thigh_pull", "isometric_split_squat"],
  plyometric_reactive: ["pogos", "low_amplitude_jump", "isometric_ankle_hold"],
  sprint_max_velocity: ["sled_march", "a_skip", "tempo_run"],
  sprint_acceleration: ["sled_march", "march", "tempo_run"],
  strength_lower: [],
  strength_upper: [],
  accessory: [],
  rehab: [],
  unknown: [],
};

export const tissueProtectionMap: Record<TissueKey, string[]> = {
  achilles: ["isometric_soleus_hold", "isometric_calf_raise", "tempo_calf_raise"],
  hamstring: ["isometric_bridge", "hip_extension_hold", "tempo_rdl"],
  patellar: ["spanish_squat_hold", "isometric_split_squat", "tempo_split_squat"],
};

export function humanizeExerciseId(value: string): string {
  return value
    .split("_")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

export function classifyExerciseType(exercise: { name?: string | null; title?: string | null; tags?: string[] | null }): ExerciseCategory {
  const name = String(exercise.name ?? exercise.title ?? "").toLowerCase();
  const tags = Array.isArray(exercise.tags) ? exercise.tags.map((t) => String(t).toLowerCase()) : [];
  const blob = `${name} ${tags.join(" ")}`;

  if (
    blob.includes("rehab") ||
    blob.includes("isometric ankle") ||
    blob.includes("soleus") ||
    blob.includes("calf raise") ||
    blob.includes("spanish squat")
  ) {
    return "rehab";
  }

  if (blob.includes("depth jump") || blob.includes("reactive") || blob.includes("pogo")) return "plyometric_reactive";
  if (blob.includes("box jump") || blob.includes("jump")) return "plyometric_vertical";
  if (blob.includes("max velocity") || blob.includes("sprint")) return "sprint_max_velocity";
  if (blob.includes("accel") || blob.includes("march") || blob.includes("sled march")) return "sprint_acceleration";
  if (blob.includes("squat") || blob.includes("rdl") || blob.includes("hinge")) return "strength_lower";
  if (blob.includes("press") || blob.includes("row")) return "strength_upper";
  if (blob.includes("core") || blob.includes("mobility") || blob.includes("activation")) return "accessory";

  return "unknown";
}
