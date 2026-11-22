import "server-only";

/**
 * Goal plan: the team's season on a day, by the same rule the strength engine merges by (`goalSeasonOf`): the
 * coach's season-plan block first, else the week's phase (saved week setup, else the season plan's). Read-only.
 *
 * Used to build a new plan (out of season = up to 3 sessions a week, with the short session C; 2026-11-18), for the
 * gym-only goals' Today card, to leave session C out once the season starts, and (2026-11-22) to pause plans in
 * season and start new ones at the next pre-season (`seasonPause.ts`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCurrentBlock } from "@/lib/micropulse/strengthProgramming/resolveCurrentBlock";
import { goalSeasonOf } from "@/lib/micropulse/strengthProgramming/playerGoal";
import { fetchTeamContext } from "@/lib/micropulse/playerContext/domains";
import { planPhasesAround } from "@/lib/micropulse/weekSetup/weekPhaseServer";
import type { GoalPlan, GoalQuality } from "./types";
import { UNKNOWN_SEASON, cardSeasonOf, nextPreseasonStart, phaseOfWord, type GoalSeasonRead } from "./seasonPause";

type Sb = SupabaseClient;

/**
 * The season with where it came from: "build" / "maintain" / "unknown". `withNext` also reads the next pre-season
 * start (needed only to start or resume a plan; the plan phases are cached 10 min per team). A failed read →
 * "unknown" (today's behaviour, no automatic pause).
 */
export async function readGoalSeason(sb: Sb, teamId: string, todayIso: string, opts: { withNext?: boolean } = {}): Promise<GoalSeasonRead> {
  try {
    const [block, ctx] = await Promise.all([resolveCurrentBlock(sb, teamId, todayIso), fetchTeamContext(sb, teamId, todayIso)]);
    const season = goalSeasonOf({ goalSeason: block ? { phase: block.phase, blockGoal: block.goalKey } : undefined, seasonPhase: ctx.seasonPhase });
    const phase = block?.phase ?? phaseOfWord(ctx.seasonPhase);
    const source = block?.phase ? "season_plan_block" : phase ? "week_phase" : "none";
    let nextPreseason: string | null = null;
    if (opts.withNext && season === "maintain") {
      nextPreseason = await nextPreseasonFor(sb, teamId, todayIso);
    }
    return { season, phase, nextPreseason, source };
  } catch {
    return UNKNOWN_SEASON;
  }
}

/** The next pre-season's first day after today (season plans; cached), or null. Never throws. */
export async function nextPreseasonFor(sb: Sb, teamId: string, todayIso: string): Promise<string | null> {
  return planPhasesAround(sb, teamId, todayIso).then((p) => nextPreseasonStart(p, todayIso)).catch(() => null);
}

/** "build" = pre-season or off-season; in season or not known → "maintain". A failed read → "maintain". */
export async function goalSeasonForTeam(sb: Sb, teamId: string, todayIso: string): Promise<"build" | "maintain"> {
  return cardSeasonOf(await readGoalSeason(sb, teamId, todayIso));
}

/** The season a stored plan's Today card / placement needs. Every plan reads it since 2026-11-20: in pre-/off-season
 *  the gym sessions go on the heavy days (`gymOnHeavyDays`), so the card, the tick, adherence, the coach's view and
 *  the strength engine must place the same days. */
export async function goalSeasonForPlan(
  sb: Sb, teamId: string, _row: { quality: GoalQuality; plan: Pick<GoalPlan, "weeks"> }, todayIso: string,
): Promise<"build" | "maintain"> {
  return goalSeasonForTeam(sb, teamId, todayIso);
}
