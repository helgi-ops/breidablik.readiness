/**
 * The team's saved level and exercise swaps per quality (Programme Library "Speed & power", `team_quality_plan_prefs`).
 * Server-side read, filtered on the team. Lota 5: a player's goal plan starts from these — the level is the default
 * the coach can change at approval, the swaps are applied as saved (only the exercise changes, never the dose).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LEVEL, isTrainingLevel, type TrainingLevel } from "./levels";
import { validateSwaps, type SwapChoices } from "./swaps";
import { GOAL_QUALITIES, type GoalQuality } from "./types";

export type TeamQualityPref = { level: TrainingLevel; swaps: SwapChoices };

export const NO_TEAM_PREF: TeamQualityPref = { level: DEFAULT_LEVEL, swaps: {} };

/** Every quality, defaulting to intermediate and no swaps when the team never saved one. */
export async function loadTeamQualityPrefs(sb: SupabaseClient, teamId: string): Promise<Record<GoalQuality, TeamQualityPref>> {
  const out = Object.fromEntries(GOAL_QUALITIES.map((q) => [q, NO_TEAM_PREF])) as Record<GoalQuality, TeamQualityPref>;
  const { data, error } = await sb.from("team_quality_plan_prefs").select("quality, level, swaps").eq("team_id", teamId);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as { quality: string; level: string; swaps: unknown }[]) {
    if (!(GOAL_QUALITIES as string[]).includes(r.quality)) continue;
    const q = r.quality as GoalQuality;
    out[q] = { level: isTrainingLevel(r.level) ? r.level : DEFAULT_LEVEL, swaps: validateSwaps(q, r.swaps) ?? {} };
  }
  return out;
}
