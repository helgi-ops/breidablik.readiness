import "server-only";

/**
 * Goal plan: the team's season on a day, by the same rule the strength engine merges by (`goalSeasonOf`): the
 * coach's season-plan block first, else the week's phase (saved week setup, else the season plan's). Read-only.
 *
 * Used to build a new plan (out of season = up to 3 sessions a week, with the short session C; 2026-11-18), for the
 * gym-only goals' Today card (in season nothing is added) and to leave session C out once the season starts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCurrentBlock } from "@/lib/micropulse/strengthProgramming/resolveCurrentBlock";
import { goalSeasonOf } from "@/lib/micropulse/strengthProgramming/playerGoal";
import { fetchTeamContext } from "@/lib/micropulse/playerContext/domains";
import { planHasSessionC } from "./today";
import { isGymQuality, type GoalPlan, type GoalQuality } from "./types";

type Sb = SupabaseClient;

/** "build" = pre-season or off-season; in season or not known → "maintain". A failed read → "maintain". */
export async function goalSeasonForTeam(sb: Sb, teamId: string, todayIso: string): Promise<"build" | "maintain"> {
  try {
    const [block, ctx] = await Promise.all([resolveCurrentBlock(sb, teamId, todayIso), fetchTeamContext(sb, teamId, todayIso)]);
    const season = goalSeasonOf({ goalSeason: block ? { phase: block.phase, blockGoal: block.goalKey } : undefined, seasonPhase: ctx.seasonPhase });
    return season === "build" ? "build" : "maintain";
  } catch {
    return "maintain";
  }
}

/** The season a stored plan's Today card / placement needs: only gym-only goals and plans with a session C read it. */
export async function goalSeasonForPlan(
  sb: Sb, teamId: string, row: { quality: GoalQuality; plan: Pick<GoalPlan, "weeks"> }, todayIso: string,
): Promise<"build" | "maintain" | undefined> {
  return isGymQuality(row.quality) || planHasSessionC(row.plan) ? goalSeasonForTeam(sb, teamId, todayIso) : undefined;
}
