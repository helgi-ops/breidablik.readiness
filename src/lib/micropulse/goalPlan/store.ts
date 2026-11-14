import "server-only";

/**
 * Goal plan requests (lota 2): database work. Server-only; called from the player and coach routes AFTER their own
 * auth and team checks, with the service-role client. Every change writes an event (audit trail: who, what, why).
 *
 * Never writes the readiness colour, `player_today_strength_override` or any Today source. Nothing is sent to the
 * player (no push, no email) in lota 2.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedStarts, buildGoalPlan, ruleStart } from "./index";
import { loadGoalPlanBase } from "./loader";
import {
  DECISION_FROM,
  OPEN_STATUSES,
  PLAYER_BLOCK_TEXT,
  RESUME_FROM_START_AFTER_DAYS,
  parseDecision,
  planEndDate,
  resumeDefaultWeek,
  resumedStartDate,
  type GoalPlanEventRow,
  type GoalPlanRow,
  type GoalPlanStatus,
} from "./requests";
import type { GoalPlan, GoalQuality } from "./types";
import { PLAN_WEEKS } from "./common";
import { planWeekOn, type SessionVersion } from "./today";
import { parseResultInput, type GoalResult, type SessionMark } from "./outcome";

type Sb = SupabaseClient;

/** An error with the HTTP status the route should answer with. */
export class GoalPlanError extends Error {
  /** `is` = the Icelandic text, for errors the player can see. */
  constructor(public status: number, message: string, public is: string | null = null) {
    super(message);
  }
}

const ROW_COLS =
  "id, team_id, player_id, quality, status, player_note, proposal, plan, engine_version, content_version, start_override, start_date, end_date, coach_note, decision_reason, requested_at, reviewed_at, closed_at, paused_at, paused_week";
const LIGHT_COLS =
  "id, team_id, player_id, quality, status, player_note, start_override, start_date, end_date, coach_note, decision_reason, requested_at, reviewed_at, closed_at, paused_at, paused_week";

async function logEvent(
  sb: Sb,
  row: { id: string; team_id: string; player_id: string },
  kind: GoalPlanEventRow["kind"],
  actor: { userId: string | null; role: "player" | "coach" | "system" },
  reason: string | null,
  detail: Record<string, unknown> = {},
) {
  const { error } = await sb.from("player_goal_plan_events").insert({
    plan_id: row.id, team_id: row.team_id, player_id: row.player_id, kind,
    actor_user_id: actor.userId, actor_role: actor.role, reason, detail,
  });
  if (error) throw new Error(error.message);
}

const todayIso = () => new Date().toISOString().slice(0, 10);

// ─── Lota 3: automatic pause and end ───────────────────────────────────────

type SyncRow = { id: string; team_id: string; player_id: string; status: GoalPlanStatus; start_date: string | null; end_date: string | null; closed_at?: string | null; paused_at?: string | null; paused_week?: number | null };

/**
 * Applies the two automatic changes to approved plans, lazily whenever a plan is read:
 *   - the 8 weeks are over (today after `end_date`) → completed;
 *   - the player is marked injured / in rehab / in return-to-train (`unavailable`, read by the caller) → paused,
 *     with the plan week, so the coach can pick it up there. Only a coach restarts it.
 * Optimistic: each update only applies while the row is still "approved". Returns the rows with their new status.
 */
export async function syncGoalStatuses<T extends SyncRow>(sb: Sb, rows: T[], unavailable: Set<string>, today: string = todayIso()): Promise<T[]> {
  const out: T[] = [];
  for (const r of rows) {
    if (r.status !== "approved" || !r.start_date) { out.push(r); continue; }
    const now = new Date().toISOString();
    if (r.end_date && today > r.end_date) {
      const { data, error } = await sb.from("player_goal_plans").update({ status: "completed", closed_at: now, updated_at: now })
        .eq("id", r.id).eq("status", "approved").select("id");
      if (error) throw new Error(error.message);
      if (data?.length) await logEvent(sb, r, "completed", { userId: null, role: "system" }, null, { end_date: r.end_date });
      out.push({ ...r, status: "completed", closed_at: now });
      continue;
    }
    if (unavailable.has(r.player_id)) {
      const week = Math.max(0, Math.min(PLAN_WEEKS, planWeekOn(r.start_date, today)));
      const { data, error } = await sb.from("player_goal_plans").update({ status: "paused", paused_at: now, paused_week: week, updated_at: now })
        .eq("id", r.id).eq("status", "approved").select("id");
      if (error) throw new Error(error.message);
      if (data?.length) await logEvent(sb, r, "paused", { userId: null, role: "system" }, "Marked injured, in rehab or returning to training.", { week });
      out.push({ ...r, status: "paused", paused_at: now, paused_week: week });
      continue;
    }
    out.push(r);
  }
  return out;
}

/** The player's approved or paused plan with the frozen plan (for the Today card). */
export async function activeGoalWithPlan(sb: Sb, playerId: string): Promise<GoalPlanRow | null> {
  const { data, error } = await sb.from("player_goal_plans").select(ROW_COLS)
    .eq("player_id", playerId).in("status", ["approved", "paused"]).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as GoalPlanRow | null) ?? null;
}

// ─── Player ────────────────────────────────────────────────────────────────

/** The player's open goal, or the latest closed one from the last 21 days (so a decline reason is seen). */
export async function playerCurrentGoal(sb: Sb, playerId: string): Promise<Omit<GoalPlanRow, "proposal" | "plan" | "engine_version" | "content_version"> | null> {
  const { data, error } = await sb.from("player_goal_plans").select(LIGHT_COLS)
    .eq("player_id", playerId).order("created_at", { ascending: false }).limit(5);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Omit<GoalPlanRow, "proposal" | "plan" | "engine_version" | "content_version">[];
  const open = rows.find((r) => OPEN_STATUSES.includes(r.status));
  if (open) return open;
  const cutoff = Date.now() - 21 * 86_400_000;
  const recent = rows.find((r) => new Date(r.closed_at ?? r.requested_at).getTime() >= cutoff);
  return recent ?? null;
}

export async function createGoalRequest(
  sb: Sb,
  args: { teamId: string; playerId: string; userId: string; quality: GoalQuality; note: string | null },
): Promise<{ id: string }> {
  const { base } = await loadGoalPlanBase(sb, args.teamId, args.playerId, todayIso());
  const proposal = buildGoalPlan({ ...base, quality: args.quality });
  if (proposal.status === "blocked" && proposal.blocked) {
    throw new GoalPlanError(422, PLAYER_BLOCK_TEXT[proposal.blocked.reason].en, PLAYER_BLOCK_TEXT[proposal.blocked.reason].is);
  }
  const { data, error } = await sb.from("player_goal_plans").insert({
    team_id: args.teamId, player_id: args.playerId, quality: args.quality, status: "requested",
    player_note: args.note, proposal, engine_version: proposal.engineVersion, content_version: proposal.contentVersion,
    requested_by: args.userId,
  }).select("id, team_id, player_id").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new GoalPlanError(409, "You already have a goal open.", "Þú ert nú þegar með opið markmið.");
    throw new Error(error.message);
  }
  const row = data as { id: string; team_id: string; player_id: string };
  await logEvent(sb, row, "requested", { userId: args.userId, role: "player" }, null, { quality: args.quality, rule_start: proposal.start });
  return { id: row.id };
}

/** The player withdraws a request the coach has not answered yet. */
export async function cancelGoalRequest(sb: Sb, args: { playerId: string; userId: string }): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await sb.from("player_goal_plans")
    .update({ status: "cancelled", closed_at: now, updated_at: now })
    .eq("player_id", args.playerId).eq("status", "requested")
    .select("id, team_id, player_id");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; team_id: string; player_id: string }[];
  if (!rows.length) throw new GoalPlanError(409, "There is no request waiting to withdraw.", "Engin beiðni bíður sem hægt er að draga til baka.");
  for (const r of rows) await logEvent(sb, r, "cancelled", { userId: args.userId, role: "player" }, null);
}

// ─── Coach ─────────────────────────────────────────────────────────────────

export type GoalListItem = Omit<GoalPlanRow, "proposal" | "plan" | "engine_version" | "content_version"> & {
  player_name: string | null;
};

/** Open goals for the team (waiting first) and those closed in the last 30 days. */
export async function listTeamGoals(sb: Sb, teamId: string): Promise<GoalListItem[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: open, error: e1 }, { data: closed, error: e2 }] = await Promise.all([
    sb.from("player_goal_plans").select(`${LIGHT_COLS}, players(full_name)`).eq("team_id", teamId).in("status", OPEN_STATUSES)
      .order("requested_at", { ascending: true }),
    sb.from("player_goal_plans").select(`${LIGHT_COLS}, players(full_name)`).eq("team_id", teamId).not("status", "in", `(${OPEN_STATUSES.join(",")})`)
      .gte("updated_at", since).order("updated_at", { ascending: false }).limit(50),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const order: Record<GoalPlanStatus, number> = { requested: 0, paused: 1, approved: 2, declined: 3, cancelled: 3, completed: 3 };
  return ([...(open ?? []), ...(closed ?? [])] as unknown as (GoalListItem & { players?: { full_name: string | null } | null })[])
    .map(({ players, ...r }) => ({ ...r, player_name: players?.full_name ?? null }))
    .sort((a, b) => order[a.status] - order[b.status]);
}

export async function pendingGoalCount(sb: Sb, teamId: string): Promise<number> {
  const { count, error } = await sb.from("player_goal_plans").select("id", { count: "exact", head: true })
    .eq("team_id", teamId).eq("status", "requested");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadTeamRow(sb: Sb, teamId: string, planId: string): Promise<GoalPlanRow> {
  const { data, error } = await sb.from("player_goal_plans").select(ROW_COLS).eq("id", planId).eq("team_id", teamId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new GoalPlanError(404, "Goal plan not found on this team.");
  return data as unknown as GoalPlanRow;
}

export type GoalReview = {
  row: GoalPlanRow;
  playerName: string | null;
  /** For a waiting request: the plan as it would be approved now (fresh data, with the chosen start). For an
   *  approved plan: the frozen plan. */
  plan: GoalPlan;
  ruleStart: string | null;
  starts: ReturnType<typeof allowedStarts>;
  events: GoalPlanEventRow[];
};

export async function loadGoalReview(sb: Sb, teamId: string, planId: string, chosenStart: string | null): Promise<GoalReview> {
  const row = await loadTeamRow(sb, teamId, planId);
  const [{ data: evs, error }, { name, base }] = await Promise.all([
    sb.from("player_goal_plan_events").select("id, kind, actor_role, reason, detail, created_at").eq("plan_id", planId).order("created_at", { ascending: true }),
    loadGoalPlanBase(sb, teamId, row.player_id, todayIso()),
  ]);
  if (error) throw new Error(error.message);
  const input = { ...base, quality: row.quality };
  const live = row.status === "requested";
  const plan = live || !row.plan ? buildGoalPlan({ ...input, startOverride: chosenStart }) : row.plan;
  return {
    row,
    playerName: name,
    plan,
    ruleStart: ruleStart(input),
    starts: live ? allowedStarts(input) : [],
    events: (evs ?? []) as GoalPlanEventRow[],
  };
}

export async function decideGoal(
  sb: Sb,
  args: { teamId: string; planId: string; coachUserId: string; body: unknown },
): Promise<{ status: GoalPlanStatus }> {
  const row = await loadTeamRow(sb, args.teamId, args.planId);
  const today = todayIso();
  const { base } = await loadGoalPlanBase(sb, args.teamId, row.player_id, today);
  const input = { ...base, quality: row.quality };
  const rule = ruleStart(input);
  const parsed = parseDecision(args.body, today, rule);
  if (!parsed.ok) throw new GoalPlanError(400, parsed.error);
  const d = parsed.value;
  if (!DECISION_FROM[d.action].includes(row.status)) {
    throw new GoalPlanError(409, `This plan is "${row.status}", so it cannot be ${d.action === "stop" ? "stopped" : `${d.action}d`}.`);
  }
  const now = new Date().toISOString();
  const actor = { userId: args.coachUserId, role: "coach" as const };

  if (d.action === "approve") {
    if (d.start && !allowedStarts(input).some((s) => s.key === d.start)) {
      throw new GoalPlanError(422, "That start is not allowed for this player by the safety rules.");
    }
    // Rebuilt here from fresh data: the server never trusts a plan sent from the browser.
    const plan = buildGoalPlan({ ...input, startOverride: d.start });
    if (plan.status !== "ok") {
      throw new GoalPlanError(409, `No plan can be approved now: ${plan.blocked?.text.en ?? "blocked"}`);
    }
    const { data, error } = await sb.from("player_goal_plans").update({
      status: "approved", plan, engine_version: plan.engineVersion, content_version: plan.contentVersion,
      start_override: plan.startOverride?.chosen ?? null, start_date: d.startDate, end_date: planEndDate(d.startDate),
      coach_note: d.noteToPlayer, decision_reason: d.reason, reviewed_by: args.coachUserId, reviewed_at: now, updated_at: now,
    }).eq("id", row.id).eq("status", "requested").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new GoalPlanError(409, "Someone else answered this request first.");
    if (plan.startOverride) {
      await logEvent(sb, row, "start_changed", actor, d.reason, { rule: plan.startOverride.rule, chosen: plan.startOverride.chosen });
    }
    await logEvent(sb, row, "approved", actor, null, { start_date: d.startDate, start: plan.start });
    return { status: "approved" };
  }

  if (d.action === "resume") {
    if (input.unavailable) {
      throw new GoalPlanError(409, "The player is still marked injured, in rehab or returning to training. Clear that first.");
    }
    const pausedWeek = Math.max(1, row.paused_week ?? 1);
    const def = resumeDefaultWeek(row.paused_week, row.paused_at, today);
    if (d.fromWeek > pausedWeek) throw new GoalPlanError(400, `The plan can pick up at week ${pausedWeek} at the latest (where it paused).`);
    if (d.fromWeek > def && !d.reason) {
      throw new GoalPlanError(400, `After a break of more than ${RESUME_FROM_START_AFTER_DAYS} days the plan restarts from week 1; picking up later needs a reason (at least 5 characters).`);
    }
    const start = resumedStartDate(d.startDate, d.fromWeek);
    const { data, error } = await sb.from("player_goal_plans").update({
      status: "approved", start_date: start, end_date: planEndDate(start), paused_at: null, paused_week: null,
      coach_note: d.noteToPlayer ?? row.coach_note, updated_at: now,
    }).eq("id", row.id).eq("status", "paused").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new GoalPlanError(409, "This plan changed meanwhile; reload.");
    await logEvent(sb, row, "resumed", actor, d.reason, { from_week: d.fromWeek, resume_monday: d.startDate, default_week: def });
    return { status: "approved" };
  }

  if (d.action === "decline") {
    const { data, error } = await sb.from("player_goal_plans").update({
      status: "declined", decision_reason: d.reason, coach_note: d.noteToPlayer, reviewed_by: args.coachUserId,
      reviewed_at: now, closed_at: now, updated_at: now,
    }).eq("id", row.id).eq("status", "requested").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new GoalPlanError(409, "Someone else answered this request first.");
    await logEvent(sb, row, "declined", actor, d.reason);
    return { status: "declined" };
  }

  const { data, error } = await sb.from("player_goal_plans").update({
    status: "cancelled", decision_reason: d.reason, closed_at: now, updated_at: now,
  }).eq("id", row.id).in("status", DECISION_FROM.stop).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new GoalPlanError(409, "This plan changed meanwhile; reload.");
  await logEvent(sb, row, "stopped", actor, d.reason);
  return { status: "cancelled" };
}

/** Open goal for one player (coach view on Total Player Analysis). */
export async function openGoalForPlayer(sb: Sb, teamId: string, playerId: string): Promise<{ id: string; quality: GoalQuality; status: GoalPlanStatus } | null> {
  const { data, error } = await sb.from("player_goal_plans").select("id, quality, status")
    .eq("team_id", teamId).eq("player_id", playerId).in("status", OPEN_STATUSES).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string; quality: GoalQuality; status: GoalPlanStatus } | null) ?? null;
}

// ─── Lota 4: ticks and test results ────────────────────────────────────────

/** The player's latest plan that is open, or finished within `finishedDays` (for the finished card). */
export async function latestGoalWithPlan(sb: Sb, playerId: string, todayIso: string, finishedDays: number): Promise<GoalPlanRow | null> {
  const open = await activeGoalWithPlan(sb, playerId);
  if (open) return open;
  const since = new Date(Date.parse(`${todayIso}T00:00:00Z`) - finishedDays * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await sb.from("player_goal_plans").select(ROW_COLS)
    .eq("player_id", playerId).eq("status", "completed").gte("end_date", since)
    .order("end_date", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as GoalPlanRow | null) ?? null;
}

// ─── Lota 6: tests the coach still has to enter ────────────────────────────

export type GoalTestCandidate = {
  id: string; player_id: string; quality: GoalQuality; status: GoalPlanStatus;
  start_date: string | null; end_date: string | null; name: string | null;
};

/** Approved plans, and plans finished on or after `finishedSince`, on one team (light columns, with names). */
export async function teamGoalTestCandidates(sb: Sb, teamId: string, finishedSince: string): Promise<GoalTestCandidate[]> {
  const cols = "id, player_id, quality, status, start_date, end_date, players(full_name)";
  const [{ data: a, error: e1 }, { data: c, error: e2 }] = await Promise.all([
    sb.from("player_goal_plans").select(cols).eq("team_id", teamId).eq("status", "approved"),
    sb.from("player_goal_plans").select(cols).eq("team_id", teamId).eq("status", "completed").gte("end_date", finishedSince),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  return ([...(a ?? []), ...(c ?? [])] as unknown as (Omit<GoalTestCandidate, "name"> & { players?: { full_name: string | null } | null })[])
    .map(({ players, ...r }) => ({ ...r, name: players?.full_name ?? null }));
}

/** Coach-entered results for several plans at once. */
export async function goalResultsForPlans(sb: Sb, planIds: string[]): Promise<Map<string, GoalResult[]>> {
  const out = new Map<string, GoalResult[]>();
  if (!planIds.length) return out;
  const { data, error } = await sb.from("player_goal_plan_results").select("id, plan_id, measure, phase, value, test_date, note")
    .in("plan_id", planIds);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as Array<{ id: string; plan_id: string; measure: GoalResult["measure"]; phase: GoalResult["phase"]; value: number | string; test_date: string; note: string | null }>) {
    const list = out.get(r.plan_id) ?? [];
    list.push({ id: r.id, measure: r.measure, phase: r.phase, value: Number(r.value), test_date: String(r.test_date).slice(0, 10), note: r.note, source: "coach" });
    out.set(r.plan_id, list);
  }
  return out;
}

// ─── Lota 5: the player's history ──────────────────────────────────────────

/** Plans that ran (finished, or stopped after approval) on the player's current team, newest first. */
export async function playerGoalHistoryRows(sb: Sb, teamId: string, playerId: string, limit: number): Promise<GoalPlanRow[]> {
  const { data, error } = await sb.from("player_goal_plans").select(ROW_COLS)
    .eq("team_id", teamId).eq("player_id", playerId).in("status", ["completed", "cancelled"])
    .not("start_date", "is", null).not("plan", "is", null)
    .order("end_date", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GoalPlanRow[];
}

/** How many earlier goals the player has (for the sheet's "Earlier goals (n)" button). Light: a count only. */
export async function playerGoalHistoryCount(sb: Sb, teamId: string, playerId: string): Promise<number> {
  const { count, error } = await sb.from("player_goal_plans").select("id", { count: "exact", head: true })
    .eq("team_id", teamId).eq("player_id", playerId).in("status", ["completed", "cancelled"])
    .not("start_date", "is", null).not("plan", "is", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function goalSessionMarks(sb: Sb, planId: string): Promise<SessionMark[]> {
  const { data, error } = await sb.from("player_goal_plan_sessions").select("week, slot, status, session_date").eq("plan_id", planId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { week: number; slot: SessionMark["slot"]; status: SessionMark["status"]; session_date: string }[])
    .map((r) => ({ week: Number(r.week), slot: r.slot, status: r.status, session_date: String(r.session_date).slice(0, 10) }));
}

/**
 * The player ticks a session as done / not done, or clears the tick. The caller has already checked, from the
 * server's own placement, that this (week, slot) is placed on `date`, today or earlier this week.
 */
export async function markGoalSession(
  sb: Sb,
  args: { row: { id: string; team_id: string; player_id: string }; week: number; slot: SessionMark["slot"]; date: string; status: SessionMark["status"] | "clear"; version: SessionVersion | null; userId: string },
): Promise<void> {
  if (args.status === "clear") {
    const { error } = await sb.from("player_goal_plan_sessions").delete().eq("plan_id", args.row.id).eq("week", args.week).eq("slot", args.slot);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await sb.from("player_goal_plan_sessions").upsert({
    plan_id: args.row.id, team_id: args.row.team_id, player_id: args.row.player_id, week: args.week, slot: args.slot,
    session_date: args.date, status: args.status, version: args.version, marked_by: args.userId, updated_at: new Date().toISOString(),
  }, { onConflict: "plan_id,week,slot" });
  if (error) throw new Error(error.message);
}

export async function goalResults(sb: Sb, planId: string): Promise<GoalResult[]> {
  const { data, error } = await sb.from("player_goal_plan_results").select("id, measure, phase, value, test_date, note")
    .eq("plan_id", planId).order("test_date", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; measure: GoalResult["measure"]; phase: GoalResult["phase"]; value: number | string; test_date: string; note: string | null }[])
    .map((r) => ({ id: r.id, measure: r.measure, phase: r.phase, value: Number(r.value), test_date: String(r.test_date).slice(0, 10), note: r.note, source: "coach" as const }));
}

/** Results can be entered while a plan runs, is paused, or after it finished. */
const RESULT_STATUSES: GoalPlanStatus[] = ["approved", "paused", "completed"];

/** The coach enters a test result (start or retest). Checked against the plan's tests and dates; logged. */
export async function addGoalResult(sb: Sb, args: { teamId: string; planId: string; coachUserId: string; body: unknown }): Promise<{ id: string }> {
  const row = await loadTeamRow(sb, args.teamId, args.planId);
  if (!RESULT_STATUSES.includes(row.status) || !row.start_date || !row.end_date) {
    throw new GoalPlanError(409, "Results can be entered once the plan is approved.");
  }
  const parsed = parseResultInput(args.body, { quality: row.quality, startDate: row.start_date, endDate: row.end_date, todayIso: todayIso() });
  if (!parsed.ok) throw new GoalPlanError(400, parsed.error);
  const v = parsed.value;
  const { data, error } = await sb.from("player_goal_plan_results").insert({
    plan_id: row.id, team_id: row.team_id, player_id: row.player_id, measure: v.measure, phase: v.phase, value: v.value,
    test_date: v.testDate, note: v.note, entered_by: args.coachUserId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await logEvent(sb, row, "result_added", { userId: args.coachUserId, role: "coach" }, v.note, { measure: v.measure, phase: v.phase, value: v.value, test_date: v.testDate });
  return { id: (data as { id: string }).id };
}

/** The coach removes a result entered by mistake; logged with the value that was removed. */
export async function removeGoalResult(sb: Sb, args: { teamId: string; planId: string; resultId: string; coachUserId: string }): Promise<void> {
  const row = await loadTeamRow(sb, args.teamId, args.planId);
  const { data, error } = await sb.from("player_goal_plan_results").delete()
    .eq("id", args.resultId).eq("plan_id", row.id).select("measure, phase, value, test_date");
  if (error) throw new Error(error.message);
  const gone = (data ?? [])[0] as { measure: string; phase: string; value: number; test_date: string } | undefined;
  if (!gone) throw new GoalPlanError(404, "That result is not on this plan.");
  await logEvent(sb, row, "result_removed", { userId: args.coachUserId, role: "coach" }, null, gone);
}
