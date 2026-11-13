import "server-only";

/**
 * Goal plan, lota 3: server reads for the player's Today card and the automatic pause / end.
 *
 * Read-only here; the status changes themselves are written by `store.ts` (`syncGoalStatuses`).
 *   - Availability: `player_injuries` injured / rehab / return-to-train (the same light read as the request screen).
 *   - The team week: `week_plans` day types and the fixture list (`match_schedule` + week_plans GAME), the same two
 *     sources the strength engine uses for the MD context.
 *   - Today's colour: `v_coach_readiness_today_v8.final_color`, the canonical verdict colour. Only read.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { UNAVAILABLE_STATUS } from "./loader";
import { activeGoalWithPlan, listTeamGoals, playerCurrentGoal, syncGoalStatuses, type GoalListItem } from "./store";
import { addDays, buildGoalTodayCard, mondayOf, placementFor, planWeekOn, toDayColour, toTeamDayType, type GoalTodayCard, type TeamCalendar } from "./today";
import type { GoalPlan } from "./types";
import type { GoalPlanStatus } from "./requests";

type Sb = SupabaseClient;

/** Players (of the given ids) marked injured, in rehab or in return-to-train. */
export async function unavailablePlayerIds(sb: Sb, playerIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(playerIds)];
  if (!ids.length) return new Set();
  const { data, error } = await sb.from("player_injuries").select("player_id").in("player_id", ids).in("status", UNAVAILABLE_STATUS);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { player_id: string }[]).map((r) => r.player_id));
}

/** Coach list with the automatic pause / end applied first. */
export async function listTeamGoalsSynced(sb: Sb, teamId: string): Promise<GoalListItem[]> {
  const rows = await listTeamGoals(sb, teamId);
  const approved = rows.filter((r) => r.status === "approved");
  if (!approved.length) return rows;
  const synced = await syncGoalStatuses(sb, rows, await unavailablePlayerIds(sb, approved.map((r) => r.player_id)));
  const order: Record<GoalPlanStatus, number> = { requested: 0, paused: 1, approved: 2, declined: 3, cancelled: 3, completed: 3 };
  return synced.sort((a, b) => order[a.status] - order[b.status]);
}

/** The player's current goal (request screen) with the automatic pause / end applied first. */
export async function playerCurrentGoalSynced(sb: Sb, playerId: string) {
  const row = await playerCurrentGoal(sb, playerId);
  if (!row || row.status !== "approved") return row;
  const [synced] = await syncGoalStatuses(sb, [row], await unavailablePlayerIds(sb, [playerId]));
  return synced;
}

/** The team week around `todayIso`: last week (for the Sunday → Monday gap) to 5 days after this Sunday. */
export async function loadTeamCalendar(sb: Sb, teamId: string, todayIso: string): Promise<TeamCalendar> {
  const monday = mondayOf(todayIso);
  const from = addDays(monday, -11);
  const to = addDays(monday, 6 + 5);
  const [fixtures, plans] = await Promise.all([
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
    sb.from("week_plans").select("day_date, day_type").eq("team_id", teamId).gte("day_date", from).lte("day_date", to),
  ]);
  const games = new Set<string>();
  for (const r of (fixtures.data ?? []) as { match_date: string | null }[]) if (r.match_date) games.add(String(r.match_date).slice(0, 10));
  const days: TeamCalendar["days"] = {};
  for (const r of (plans.data ?? []) as { day_date: string; day_type: string | null }[]) {
    const t = toTeamDayType(r.day_type);
    if (!t) continue;
    const d = String(r.day_date).slice(0, 10);
    days[d] = t;
    if (t === "game") games.add(d);
  }
  return { days, games: [...games] };
}

/**
 * The player's goal card for Today, or null (no approved / paused plan, plan over, or a blocked plan).
 * Pauses or ends the plan first when the rules say so.
 */
export async function loadGoalToday(sb: Sb, teamId: string, playerId: string, todayIso: string): Promise<GoalTodayCard | null> {
  const row = await activeGoalWithPlan(sb, playerId);
  if (!row || !row.plan || !row.start_date || row.team_id !== teamId) return null;
  const [synced] = row.status === "approved"
    ? await syncGoalStatuses(sb, [row], await unavailablePlayerIds(sb, [playerId]), todayIso)
    : [row];
  if (synced.status !== "approved" && synced.status !== "paused") return null;

  if (synced.status === "paused") {
    return buildGoalTodayCard({
      quality: row.quality, status: "paused", plan: row.plan, startDate: row.start_date, todayIso,
      cal: { days: {}, games: [] }, colour: null, coachNote: row.coach_note, pausedWeek: synced.paused_week ?? null,
    });
  }

  const [cal, colourRes] = await Promise.all([
    loadTeamCalendar(sb, teamId, todayIso),
    sb.from("v_coach_readiness_today_v8").select("final_color").eq("player_id", playerId).eq("entry_date", todayIso).limit(1).maybeSingle(),
  ]);
  const colour = toDayColour((colourRes.data as { final_color?: string | null } | null)?.final_color);
  return buildGoalTodayCard({
    quality: row.quality, status: "approved", plan: row.plan, startDate: row.start_date, todayIso, cal, colour, coachNote: row.coach_note,
  });
}

export type CoachWeekView = {
  week: number;
  sessions: { slot: string; focus: { en: string; is: string }; date: string | null; md: string | null }[];
  weekKnown: boolean;
};

/** For the coach's review of an approved plan: the plan week today and where this week's sessions land. */
export async function coachWeekView(
  sb: Sb,
  teamId: string,
  row: { status: GoalPlanStatus; quality: GoalTodayCard["quality"]; plan: GoalPlan | null; start_date: string | null },
  todayIso: string,
): Promise<CoachWeekView | null> {
  if (row.status !== "approved" || !row.plan || !row.start_date) return null;
  const week = planWeekOn(row.start_date, todayIso);
  if (week < 1 || week > row.plan.weeks.length) return { week, sessions: [], weekKnown: true };
  const cal = await loadTeamCalendar(sb, teamId, todayIso);
  const placement = placementFor(row.plan, row.quality, row.start_date, todayIso, cal);
  const sessions = (row.plan.weeks.find((w) => w.week === week)?.sessions ?? []).map((s) => {
    const p = placement?.placed.find((x) => x.slot === s.slot) ?? null;
    return { slot: s.slot, focus: s.focus, date: p?.date ?? null, md: p?.md ?? null };
  });
  return { week, sessions, weekKnown: placement?.weekKnown ?? true };
}
