// src/lib/microdose.ts
import { supabase } from "@/lib/supabaseClient";

/** YYYY-MM-DD */
export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export type DecisionRow = {
  player_id: string;
  entry_date: string;
  total_score: number | null;
  readiness_level: "GREEN_PLUS" | "GREEN" | "YELLOW" | "RED" | string;
  md_day: string;
  allow_strength: boolean;
  allow_power: boolean;
  isometrics_only: boolean;
  strength_vl_max: number | null;
  power_vl_max: number | null;
  max_complexes: number | null;
  player_explanation: string;
  coach_explanation: string;
};

export type AllowedExerciseRow = {
  player_id: string;
  entry_date: string;
  readiness_level: string;
  md_day: string;
  exercise_id: string;
  exercise_name: string;
  category: string;
  pattern: string | null;
  equipment: string | null;
  is_isometric: boolean;
  is_ballistic: boolean;
};

/**
 * Reads latest decision row for a player (by entry_date desc)
 */
export async function fetchLatestDecisionForPlayer(playerId: string) {
  const { data, error } = await supabase
    .from("v_readiness_auto_decision")
    .select(
      "player_id,entry_date,total_score,readiness_level,md_day,allow_strength,allow_power,isometrics_only,strength_vl_max,power_vl_max,max_complexes,player_explanation,coach_explanation"
    )
    .eq("player_id", playerId)
    .order("entry_date", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data?.[0] ?? null) as DecisionRow | null;
}

/**
 * Reads allowed exercises for a given player+date
 */
export async function fetchAllowedExercisesForEntry(playerId: string, entryDate: string) {
  const { data, error } = await supabase
    .from("v_allowed_exercises_for_entry")
    .select(
      "player_id,entry_date,readiness_level,md_day,exercise_id,exercise_name,category,pattern,equipment,is_isometric,is_ballistic"
    )
    .eq("player_id", playerId)
    .eq("entry_date", entryDate)
    .order("category", { ascending: true })
    .order("exercise_name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AllowedExerciseRow[];
}
