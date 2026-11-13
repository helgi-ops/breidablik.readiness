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
import { GoalPlanError, goalSessionMarks, latestGoalWithPlan, listTeamGoals, markGoalSession, playerCurrentGoal, syncGoalStatuses, type GoalListItem } from "./store";
import { addDays, buildGoalFinishedCard, buildGoalTodayCard, mondayOf, placementFor, planWeekOn, sessionForColour, toDayColour, type GoalTodayCard, type TeamCalendar } from "./today";
import type { GoalPlan, GoalSessionSlot } from "./types";
import type { GoalPlanStatus } from "./requests";
import { FINISHED_CARD_DAYS } from "./outcome";
import { loadGoalProgress, loadTeamCalendarRange } from "./progressLoader";

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
  return loadTeamCalendarRange(sb, teamId, addDays(monday, -11), addDays(monday, 6 + 5));
}

/**
 * The player's goal card for Today, or null (no plan, a blocked plan, or finished more than 14 days ago).
 * Pauses or ends the plan first when the rules say so. After the last week: the finished card (lota 4).
 */
export async function loadGoalToday(sb: Sb, teamId: string, playerId: string, todayIso: string): Promise<GoalTodayCard | null> {
  const row = await latestGoalWithPlan(sb, playerId, todayIso, FINISHED_CARD_DAYS);
  if (!row || !row.plan || !row.start_date || row.team_id !== teamId) return null;
  const [synced] = row.status === "approved"
    ? await syncGoalStatuses(sb, [row], await unavailablePlayerIds(sb, [playerId]), todayIso)
    : [row];
  if (synced.status === "completed") {
    if (!row.end_date || addDays(row.end_date, FINISHED_CARD_DAYS) < todayIso) return null;
    const progress = await loadGoalProgress(sb, teamId, { ...row, status: "completed" }, todayIso);
    if (!progress) return null;
    return buildGoalFinishedCard({
      quality: row.quality, plan: row.plan, endDate: row.end_date, todayIso, outcome: progress.outcome, adherence: progress.adherence, coachNote: row.coach_note,
    });
  }
  if (synced.status !== "approved" && synced.status !== "paused") return null;

  if (synced.status === "paused") {
    return buildGoalTodayCard({
      quality: row.quality, status: "paused", plan: row.plan, startDate: row.start_date, todayIso,
      cal: { days: {}, games: [] }, colour: null, coachNote: row.coach_note, pausedWeek: synced.paused_week ?? null,
    });
  }

  const [cal, colourRes, marks] = await Promise.all([
    loadTeamCalendar(sb, teamId, todayIso),
    sb.from("v_coach_readiness_today_v8").select("final_color").eq("player_id", playerId).eq("entry_date", todayIso).limit(1).maybeSingle(),
    goalSessionMarks(sb, row.id),
  ]);
  const colour = toDayColour((colourRes.data as { final_color?: string | null } | null)?.final_color);
  return buildGoalTodayCard({
    quality: row.quality, status: "approved", plan: row.plan, startDate: row.start_date, todayIso, cal, colour, coachNote: row.coach_note, marks,
  });
}

/**
 * The player ticks one of this week's sessions (done / not done / clear). Only an approved plan, only a session the
 * rules placed this week on today or earlier: the server places the week itself, so the browser can't tick a day
 * that wasn't offered. Returns the refreshed card.
 */
export async function markGoalToday(
  sb: Sb,
  args: { teamId: string; playerId: string; userId: string; body: unknown; todayIso: string },
): Promise<GoalTodayCard | null> {
  const b = (args.body ?? {}) as Record<string, unknown>;
  const slot = b.slot === "A" || b.slot === "B" || b.slot === "C" ? (b.slot as GoalSessionSlot) : null;
  const status = b.status === "done" || b.status === "skipped" || b.status === "clear" ? b.status : null;
  if (!slot || !status) throw new GoalPlanError(400, "Pick a session and done / not done.", "Veldu æfingu og búið / ekki gert.");
  const row = await latestGoalWithPlan(sb, args.playerId, args.todayIso, 0);
  if (!row || row.status !== "approved" || !row.plan || !row.start_date || row.team_id !== args.teamId) {
    throw new GoalPlanError(409, "There is no running goal plan to tick.", "Engin markmiðsáætlun í gangi til að merkja.");
  }
  const week = planWeekOn(row.start_date, args.todayIso);
  const cal = await loadTeamCalendar(sb, args.teamId, args.todayIso);
  const placed = placementFor(row.plan, row.quality, row.start_date, args.todayIso, cal)?.placed.find((p) => p.slot === slot) ?? null;
  if (!placed || placed.date > args.todayIso) {
    throw new GoalPlanError(409, "That session isn't on today or earlier this week.", "Sú æfing er ekki í dag eða fyrr í vikunni.");
  }
  let version: ReturnType<typeof sessionForColour>["version"] | null = null;
  if (status !== "clear") {
    const { data } = await sb.from("v_coach_readiness_today_v8").select("final_color").eq("player_id", args.playerId).eq("entry_date", placed.date).limit(1).maybeSingle();
    const session = row.plan.weeks.find((w) => w.week === week)?.sessions.find((s) => s.slot === slot);
    if (session) version = sessionForColour(session, toDayColour((data as { final_color?: string | null } | null)?.final_color)).version;
  }
  await markGoalSession(sb, { row, week, slot, date: placed.date, status, version, userId: args.userId });
  return loadGoalToday(sb, args.teamId, args.playerId, args.todayIso);
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
