import "server-only";

/**
 * "One session, one whole" (2026-11-17): today's session B gym lifts for each player on a running 8-week goal plan,
 * read by the strength send routes and the coach preview. Read-only; one query for the team's running plans and, only
 * when there is one, one read of the team week. Any failure → an empty map, so delivery is exactly as before.
 *
 * Status changes (pause on injury, end after week 8) are NOT made here: the goal card and the coach list do that.
 * An injured player gets no strength session anyway (rehab only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoalPlanGym } from "@/lib/micropulse/strengthProgramming/goalPlanGym";
import { goalPlanGymFor } from "./gymForSession";
import { loadTeamCalendar } from "./todayLoader";
import type { GoalPlan, GoalQuality } from "./types";

type Row = { id: string; player_id: string; quality: GoalQuality; plan: GoalPlan | null; start_date: string | null };

export async function loadGoalPlanGym(
  sb: SupabaseClient,
  teamId: string,
  todayIso: string,
  playerIds?: string[],
): Promise<Map<string, GoalPlanGym>> {
  const out = new Map<string, GoalPlanGym>();
  try {
    if (playerIds && !playerIds.length) return out;
    let q = sb.from("player_goal_plans").select("id, player_id, quality, plan, start_date").eq("team_id", teamId).eq("status", "approved");
    if (playerIds) q = q.in("player_id", playerIds);
    const { data, error } = await q;
    if (error) return out;
    const rows = ((data ?? []) as Row[]).filter((r) => r.plan && r.start_date);
    if (!rows.length) return out;
    const cal = await loadTeamCalendar(sb, teamId, todayIso);
    for (const r of rows) {
      const g = goalPlanGymFor({ planId: r.id, quality: r.quality, plan: r.plan!, startDate: r.start_date!, todayIso, cal });
      if (g) out.set(r.player_id, g);
    }
    return out;
  } catch {
    return new Map();
  }
}
