/**
 * The plan builder (`PlanBuilder.tsx`) authors loads as "kg" | "velocity" | "%1RM" | "RPE", but
 * `individual_training_prescriptions.load_type` only accepts 'absolute_kg' | 'pct_1rm' | 'rpe_target' |
 * 'bodyweight' (check constraint). Map at assign time so a plan built in the plan builder can be assigned.
 * A bar-speed ("velocity") load has no DB load type — the speed rule rides in the `vbt` column.
 * Values already in the DB vocabulary pass through; anything unknown becomes null (never a failed insert).
 */
export type DbLoadType = "absolute_kg" | "pct_1rm" | "rpe_target" | "bodyweight";

const DB_TYPES = new Set<string>(["absolute_kg", "pct_1rm", "rpe_target", "bodyweight"]);
const AUTHOR_TO_DB: Record<string, DbLoadType | null> = {
  kg: "absolute_kg",
  "%1RM": "pct_1rm",
  RPE: "rpe_target",
  velocity: null,
};

export function toDbLoadType(raw: unknown): DbLoadType | null {
  if (typeof raw !== "string") return null;
  if (DB_TYPES.has(raw)) return raw as DbLoadType;
  return Object.prototype.hasOwnProperty.call(AUTHOR_TO_DB, raw) ? AUTHOR_TO_DB[raw] : null;
}
