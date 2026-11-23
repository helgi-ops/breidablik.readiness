import "server-only";

/**
 * Goal plan requests (lota 2): database work. Server-only; called from the player and coach routes AFTER their own
 * auth and team checks, with the service-role client. Every change writes an event (audit trail: who, what, why).
 *
 * Never writes the readiness colour, `player_today_strength_override` or any Today source. Nothing is sent to the
 * player (no push, no email) in lota 2.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedLevels, allowedStarts, buildGoalPlan, ruleStart } from "./index";
import { loadTeamQualityPrefs, type TeamQualityPref } from "./teamPrefs";
import type { TrainingLevel } from "./levels";
import { loadGoalPlanBase } from "./loader";
import {
  DECISION_FROM,
  OPEN_STATUSES,
  autoStartDate,
  PLAYER_BLOCK_TEXT,
  RESUME_FROM_START_AFTER_DAYS,
  parseDecision,
  planEndDate,
  resumeDefaultWeek,
  resumedStartDate,
  type GoalDecision,
  type GoalPlanEventRow,
  type GoalPlanRow,
  type GoalPlanStatus,
} from "./requests";
import type { GoalPlan, GoalQuality } from "./types";
import type { SessionVersion } from "./today";
import { parseResultInput, type GoalResult, type SessionMark } from "./outcome";
import type { GoalPrioritySnapshot } from "./priority";
import { oneMainGoalCheck, type OpenGoal } from "./mainGoalRule";
import { readGoalSeason } from "./season";
import {
  GOAL_PLAN_PAUSED_IN_SEASON,
  IN_SEASON_PAUSE_REASON,
  goalSyncAction,
  startGate,
  type GoalSeasonRead,
  type StartGate,
} from "./seasonPause";

type Sb = SupabaseClient;

/** An error with the HTTP status the route should answer with. */
export class GoalPlanError extends Error {
  /** `is` = the Icelandic text, for errors the player can see. */
  constructor(public status: number, message: string, public is: string | null = null) {
    super(message);
  }
}

const ROW_COLS =
  "id, team_id, player_id, quality, status, player_note, proposal, plan, engine_version, content_version, start_override, start_date, end_date, coach_note, decision_reason, requested_at, reviewed_at, closed_at, paused_at, paused_week, paused_reason, season_override_at, auto_started";
const LIGHT_COLS =
  "id, team_id, player_id, quality, status, player_note, start_override, start_date, end_date, coach_note, decision_reason, requested_at, reviewed_at, closed_at, paused_at, paused_week, paused_reason, season_override_at, auto_started";

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

type SyncRow = {
  id: string; team_id: string; player_id: string; status: GoalPlanStatus; start_date: string | null; end_date: string | null;
  closed_at?: string | null; paused_at?: string | null; paused_week?: number | null; paused_reason?: string | null; season_override_at?: string | null;
};

/** Provenance stored on a season pause / resume event: which rule, and the season read it acted on. */
const seasonDetail = (s: GoalSeasonRead) => ({
  rule: GOAL_PLAN_PAUSED_IN_SEASON, season: s.season, phase: s.phase, season_source: s.source, next_preseason: s.nextPreseason,
});

/**
 * Applies the automatic changes, lazily whenever a plan is read (rules: `goalSyncAction` in seasonPause.ts):
 *   - the 8 weeks are over (today after `end_date`) → completed;
 *   - the player is marked injured / in rehab / in return-to-train (`unavailable`, read by the caller) → paused
 *     (injury), with the plan week, so the coach can pick it up there. Only a coach restarts it;
 *   - in season (`season`, read by the caller for the rows' team) → paused (in_season), unless the coach overrode;
 *   - paused for the season and pre-season has started → resumes on its own (week 1 after a long break), or switches
 *     to the injury pause when the player is injured then.
 * Optimistic: each update only applies while the row is still in the status it was read in. Returns the rows with
 * their new status. `season` null/absent = not read: no season change (the old behaviour).
 */
export async function syncGoalStatuses<T extends SyncRow>(
  sb: Sb, rows: T[], unavailable: Set<string>, today: string = todayIso(), season: GoalSeasonRead | null = null,
): Promise<T[]> {
  const out: T[] = [];
  const system = { userId: null, role: "system" as const };
  for (const r of rows) {
    const action = goalSyncAction(r, { unavailable: unavailable.has(r.player_id), season }, today);
    const now = new Date().toISOString();
    if (action.kind === "none") { out.push(r); continue; }
    if (action.kind === "complete") {
      const { data, error } = await sb.from("player_goal_plans").update({ status: "completed", closed_at: now, updated_at: now })
        .eq("id", r.id).eq("status", "approved").select("id");
      if (error) throw new Error(error.message);
      if (data?.length) await logEvent(sb, r, "completed", system, null, { end_date: r.end_date });
      out.push({ ...r, status: "completed", closed_at: now });
      continue;
    }
    if (action.kind === "pause") {
      const { data, error } = await sb.from("player_goal_plans")
        .update({ status: "paused", paused_at: now, paused_week: action.week, paused_reason: action.reason, updated_at: now })
        .eq("id", r.id).eq("status", "approved").select("id");
      if (error) throw new Error(error.message);
      if (data?.length) {
        await logEvent(sb, r, "paused", system,
          action.reason === "injury" ? "Marked injured, in rehab or returning to training." : IN_SEASON_PAUSE_REASON,
          { week: action.week, reason: action.reason, ...(action.reason === "in_season" && season ? seasonDetail(season) : {}) });
      }
      out.push({ ...r, status: "paused", paused_at: now, paused_week: action.week, paused_reason: action.reason });
      continue;
    }
    if (action.kind === "to_injury") {
      const { data, error } = await sb.from("player_goal_plans").update({ paused_reason: "injury", updated_at: now })
        .eq("id", r.id).eq("status", "paused").eq("paused_reason", "in_season").select("id");
      if (error) throw new Error(error.message);
      if (data?.length) await logEvent(sb, r, "paused", system, "Pre-season started while marked injured, in rehab or returning to training; the coach restarts it.", { reason: "injury", from: "in_season" });
      out.push({ ...r, paused_reason: "injury" });
      continue;
    }
    // resume
    const { data, error } = await sb.from("player_goal_plans").update({
      status: "approved", start_date: action.start, end_date: planEndDate(action.start),
      paused_at: null, paused_week: null, paused_reason: null, updated_at: now,
    }).eq("id", r.id).eq("status", "paused").eq("paused_reason", "in_season").select("id");
    if (error) throw new Error(error.message);
    if (data?.length) {
      await logEvent(sb, r, "resumed", system, "Pre-season started: the plan resumes on its own.", {
        from_week: action.fromWeek, resume_monday: action.resumeMonday, auto: true, ...(season ? seasonDetail(season) : {}),
      });
    }
    out.push({ ...r, status: "approved", start_date: action.start, end_date: planEndDate(action.start), paused_at: null, paused_week: null, paused_reason: null });
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
  args: {
    teamId: string; playerId: string; userId: string; quality: GoalQuality; note: string | null;
    /** Lota 7: the "most to gain" suggestion the player saw and what they did (null = none shown). */
    priority?: GoalPrioritySnapshot | null;
    /** Player choices are on for this player (read by the caller): the plan starts without the coach's approval. */
    autoStart?: boolean;
  },
): Promise<{ id: string; status: "requested" | "approved" | "paused" }> {
  const today = todayIso();
  const [{ base }, prefs] = await Promise.all([
    loadGoalPlanBase(sb, args.teamId, args.playerId, today),
    loadTeamQualityPrefs(sb, args.teamId),
  ]);
  // Lota 5: the proposal starts from the team's saved level and swaps (Programme Library).
  const pref = prefs[args.quality];
  const proposal = buildGoalPlan({ ...base, quality: args.quality, level: pref.level, swaps: pref.swaps });
  if (proposal.status === "blocked" && proposal.blocked) {
    throw new GoalPlanError(422, PLAYER_BLOCK_TEXT[proposal.blocked.reason].en, PLAYER_BLOCK_TEXT[proposal.blocked.reason].is);
  }
  if (args.autoStart) return startGoalByPlayer(sb, { ...args, input: { ...base, quality: args.quality }, teamPref: pref, today });
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
  await logEvent(sb, row, "requested", { userId: args.userId, role: "player" }, null, {
    quality: args.quality, rule_start: proposal.start, ...(args.priority ? { priority: args.priority } : {}),
  });
  return { id: row.id, status: "requested" };
}

/**
 * Player choices on (lota 3, 2026-11-17): the player's goal starts without approval. The plan is the one an approval
 * with no changes would freeze (rule start, the team's level and swaps, the same safety checks in `approvedPlan`),
 * starting the next Monday. Logged as requested (player) + approved (system, auto). No push, no email.
 */
async function startGoalByPlayer(
  sb: Sb,
  args: { teamId: string; playerId: string; userId: string; quality: GoalQuality; note: string | null; priority?: GoalPrioritySnapshot | null; input: GoalInput; teamPref: TeamQualityPref; today: string },
): Promise<{ id: string; status: "approved" | "paused" }> {
  const d: ApproveDecision = { action: "approve", startDate: autoStartDate(args.today), start: null, reason: null, noteToPlayer: null, level: null };
  const plan = approvedPlan(args.input, args.teamPref, d);
  const season = await readGoalSeason(sb, args.teamId, args.today, { withNext: true });
  const gate = startGate(season, d.startDate);
  const now = new Date().toISOString();
  const { data, error } = await sb.from("player_goal_plans").insert({
    team_id: args.teamId, player_id: args.playerId, quality: args.quality, player_note: args.note, proposal: plan,
    requested_by: args.userId, auto_started: true, ...gatedApproval(gate, plan, d, null, now),
  }).select("id, team_id, player_id").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new GoalPlanError(409, "You already have a goal open.", "Þú ert nú þegar með opið markmið.");
    throw new Error(error.message);
  }
  const row = data as { id: string; team_id: string; player_id: string };
  await logEvent(sb, row, "requested", { userId: args.userId, role: "player" }, null, {
    quality: args.quality, rule_start: plan.start, auto_start: true, ...(args.priority ? { priority: args.priority } : {}),
  });
  await logApproval(sb, row, { userId: null, role: "system" }, plan, { ...d, startDate: gate.start }, args.teamPref, { auto: true, ...gateExtra(gate, season), ...priorityExtra([], row.id, args.quality) });
  await logSeasonGate(sb, row, gate, season);
  return { id: row.id, status: gate.kind === "pause_until_preseason" ? "paused" : "approved" };
}

/**
 * The player withdraws a request the coach has not answered yet, or (player choices on) a plan that started without
 * approval and has not begun (`playerMayWithdraw`). Once a plan runs only the coach stops it.
 */
export async function cancelGoalRequest(sb: Sb, args: { playerId: string; userId: string }): Promise<void> {
  const now = new Date().toISOString();
  const today = todayIso();
  const cancel = { status: "cancelled", closed_at: now, updated_at: now };
  const { data, error } = await sb.from("player_goal_plans").update(cancel)
    .eq("player_id", args.playerId).eq("status", "requested")
    .select("id, team_id, player_id");
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as { id: string; team_id: string; player_id: string }[];
  let beforeStart = false;
  if (!rows.length) {
    const { data: d2, error: e2 } = await sb.from("player_goal_plans").update(cancel)
      .eq("player_id", args.playerId).eq("status", "approved").eq("auto_started", true).gt("start_date", today)
      .select("id, team_id, player_id");
    if (e2) throw new Error(e2.message);
    rows = (d2 ?? []) as { id: string; team_id: string; player_id: string }[];
    beforeStart = rows.length > 0;
  }
  if (!rows.length) throw new GoalPlanError(409, "There is nothing to withdraw. Once a plan has started, your coach can stop it.", "Ekkert að draga til baka. Þegar áætlun er byrjuð getur þjálfarinn stöðvað hana.");
  for (const r of rows) await logEvent(sb, r, "cancelled", { userId: args.userId, role: "player" }, null, beforeStart ? { before_start: true } : {});
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
  /** Lota 5: the levels the coach may pick for the chosen start (empty under 18 or once decided). */
  levels: TrainingLevel[];
  /** The team's saved level and swaps for this quality (the default the plan starts from). */
  teamPref: TeamQualityPref;
  events: GoalPlanEventRow[];
};

export async function loadGoalReview(
  sb: Sb,
  teamId: string,
  planId: string,
  chosenStart: string | null,
  chosenLevel: TrainingLevel | null = null,
): Promise<GoalReview> {
  const row = await loadTeamRow(sb, teamId, planId);
  const [{ data: evs, error }, { name, base }, prefs] = await Promise.all([
    sb.from("player_goal_plan_events").select("id, kind, actor_role, reason, detail, created_at").eq("plan_id", planId).order("created_at", { ascending: true }),
    loadGoalPlanBase(sb, teamId, row.player_id, todayIso()),
    loadTeamQualityPrefs(sb, teamId),
  ]);
  if (error) throw new Error(error.message);
  const input = { ...base, quality: row.quality };
  const teamPref = prefs[row.quality];
  const live = row.status === "requested";
  // Lota 5: a waiting request is previewed at the coach's level (default the team's) with the team's swaps.
  const liveInput = { ...input, startOverride: chosenStart, level: chosenLevel ?? teamPref.level, swaps: teamPref.swaps };
  const plan = live || !row.plan ? buildGoalPlan(liveInput) : row.plan;
  return {
    row,
    playerName: name,
    plan,
    ruleStart: ruleStart(input),
    starts: live ? allowedStarts(input) : [],
    levels: live ? allowedLevels(liveInput) : [],
    teamPref,
    events: (evs ?? []) as GoalPlanEventRow[],
  };
}

type ApproveDecision = Extract<GoalDecision, { action: "approve" }>;
type GoalInput = Parameters<typeof allowedStarts>[0];

/**
 * The plan an approval freezes, rebuilt here from fresh data (the server never trusts a plan sent from the browser):
 * only a start the safety rules allow, only a level offered for this player and start, the team's saved swaps.
 */
function approvedPlan(input: GoalInput, teamPref: TeamQualityPref, d: ApproveDecision): GoalPlan {
  if (d.start && !allowedStarts(input).some((s) => s.key === d.start)) {
    throw new GoalPlanError(422, "That start is not allowed for this player by the safety rules.", "Öryggisreglurnar leyfa ekki þetta upphaf fyrir leikmanninn.");
  }
  const forStart = { ...input, startOverride: d.start };
  if (d.level && !allowedLevels(forStart).includes(d.level)) {
    throw new GoalPlanError(422, "That level is not offered for this player and start (under 18, or drop jumps at beginner).", "Þetta stig er ekki í boði fyrir leikmanninn og upphafið (undir 18 ára, eða fallstökk á byrjendastigi).");
  }
  const plan = buildGoalPlan({ ...forStart, level: d.level ?? teamPref.level, swaps: teamPref.swaps });
  if (plan.status !== "ok") {
    throw new GoalPlanError(409, `No plan can be approved now: ${plan.blocked?.text.en ?? "blocked"}`, `Ekki hægt að samþykkja áætlun núna: ${plan.blocked?.text.is ?? "lokað"}`);
  }
  return plan;
}

const approvalCols = (plan: GoalPlan, d: ApproveDecision, coachUserId: string | null, now: string) => ({
  status: "approved" as const, plan, engine_version: plan.engineVersion, content_version: plan.contentVersion,
  start_override: plan.startOverride?.chosen ?? null, start_date: d.startDate, end_date: planEndDate(d.startDate),
  coach_note: d.noteToPlayer, decision_reason: d.reason, reviewed_by: coachUserId, reviewed_at: now, updated_at: now,
});

/**
 * The season gate on a new plan (GOAL_PLAN_PAUSED_IN_SEASON, 2026-11-22): in season the 8 weeks start on the Monday
 * of the next pre-season; when no saved season plan says when that is, the plan is approved and paused for the season
 * (it resumes on its own when pre-season starts). Out of season / season not known: the start as chosen.
 */
function gatedApproval(gate: StartGate, plan: GoalPlan, d: ApproveDecision, coachUserId: string | null, now: string) {
  const cols = approvalCols(plan, { ...d, startDate: gate.start }, coachUserId, now);
  return gate.kind === "pause_until_preseason"
    ? { ...cols, status: "paused" as const, paused_at: now, paused_week: 0, paused_reason: "in_season" as const }
    : cols;
}

/** The gate's provenance on the approval event, and the pause event when it pauses. */
async function logSeasonGate(sb: Sb, row: { id: string; team_id: string; player_id: string }, gate: StartGate, season: GoalSeasonRead) {
  if (gate.kind !== "pause_until_preseason") return;
  await logEvent(sb, row, "paused", { userId: null, role: "system" }, IN_SEASON_PAUSE_REASON, { week: 0, reason: "in_season", ...seasonDetail(season) });
}
const gateExtra = (gate: StartGate, season: GoalSeasonRead): Record<string, unknown> =>
  gate.kind === "as_chosen" ? {} : { season_gate: { kind: gate.kind, ...(gate.kind === "moved_to_preseason" ? { chosen: gate.chosen, preseason: gate.preseason } : {}), ...seasonDetail(season) } };

async function logApproval(
  sb: Sb, row: { id: string; team_id: string; player_id: string }, actor: { userId: string | null; role: "coach" | "system" },
  plan: GoalPlan, d: ApproveDecision, teamPref: TeamQualityPref, extra: Record<string, unknown> = {},
) {
  if (plan.startOverride) {
    await logEvent(sb, row, "start_changed", actor, d.reason, { rule: plan.startOverride.rule, chosen: plan.startOverride.chosen });
  }
  await logEvent(sb, row, "approved", actor, null, {
    start_date: d.startDate, start: plan.start,
    // Lota 5: the level and swaps the plan was frozen with, and the team's saved level it started from.
    level: plan.level ?? "intermediate", team_level: teamPref.level, swaps: plan.swaps ?? {}, ...extra,
  });
}

// ─── The coach starts a plan from the Programme Library (2026-11-15) ────────

export type CoachStartPreview = {
  playerName: string | null;
  /** The plan as it would start now (fresh data, the chosen start and level, the team's swaps). */
  plan: GoalPlan;
  ruleStart: string | null;
  starts: ReturnType<typeof allowedStarts>;
  levels: TrainingLevel[];
  teamPref: TeamQualityPref;
  /** An open goal blocks a new one (one at a time). */
  openGoal: { id: string; quality: GoalQuality; status: GoalPlanStatus } | null;
};

/** What the coach would send: built from the player's own data, same rules as a player's request. Read-only. */
export async function loadCoachStartPreview(
  sb: Sb, teamId: string, playerId: string, quality: GoalQuality, chosenStart: string | null, chosenLevel: TrainingLevel | null,
): Promise<CoachStartPreview> {
  const [{ name, base }, prefs, openGoal] = await Promise.all([
    loadGoalPlanBase(sb, teamId, playerId, todayIso()),
    loadTeamQualityPrefs(sb, teamId),
    openGoalForPlayer(sb, teamId, playerId),
  ]);
  const input = { ...base, quality };
  const teamPref = prefs[quality];
  const live = { ...input, startOverride: chosenStart, level: chosenLevel ?? teamPref.level, swaps: teamPref.swaps };
  return {
    playerName: name, plan: buildGoalPlan(live), ruleStart: ruleStart(input),
    starts: allowedStarts(input), levels: allowedLevels(live), teamPref, openGoal,
  };
}

/**
 * The coach starts a goal plan for a player without a request from them: the same checks and frozen plan as an
 * approval, written in one step as "approved" (the player never sees a "waiting" request they did not make). The
 * audit trail says the coach started it. Nothing is sent (no push, no email); the player sees it on Today.
 */
export async function startGoalByCoach(
  sb: Sb,
  args: { teamId: string; playerId: string; coachUserId: string; quality: GoalQuality; body: unknown },
): Promise<{ id: string; status: "approved" | "paused" }> {
  const today = todayIso();
  const [{ base }, prefs, open] = await Promise.all([
    loadGoalPlanBase(sb, args.teamId, args.playerId, today),
    loadTeamQualityPrefs(sb, args.teamId),
    openGoalForPlayer(sb, args.teamId, args.playerId),
  ]);
  // Brief §6: one main goal at a time (the add-ons for injury prevention are not a goal and always apply).
  const priority = oneMainGoalCheck(open ? [open] : [], null, args.quality);
  if (!priority.ok) throw new GoalPlanError(409, priority.en, priority.is);
  const input = { ...base, quality: args.quality };
  const teamPref = prefs[args.quality];
  const rule = ruleStart(input);
  const b = args.body && typeof args.body === "object" ? (args.body as Record<string, unknown>) : {};
  const parsed = parseDecision({ ...b, action: "approve" }, today, rule);
  if (!parsed.ok) throw new GoalPlanError(400, parsed.error);
  const d = parsed.value as ApproveDecision;
  const plan = approvedPlan(input, teamPref, d);
  const season = await readGoalSeason(sb, args.teamId, today, { withNext: true });
  const gate = startGate(season, d.startDate);
  const now = new Date().toISOString();
  const { data, error } = await sb.from("player_goal_plans").insert({
    team_id: args.teamId, player_id: args.playerId, quality: args.quality, player_note: null, proposal: plan,
    requested_by: args.coachUserId, ...gatedApproval(gate, plan, d, args.coachUserId, now),
  }).select("id, team_id, player_id").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new GoalPlanError(409, "This player already has an open goal plan.", "Leikmaðurinn er nú þegar með opið markmiðsplan.");
    throw new Error(error.message);
  }
  const row = data as { id: string; team_id: string; player_id: string };
  const actor = { userId: args.coachUserId, role: "coach" as const };
  await logEvent(sb, row, "requested", actor, null, { quality: args.quality, rule_start: rule, by_coach: true, source: "programme_library" });
  await logApproval(sb, row, actor, plan, { ...d, startDate: gate.start }, teamPref, { ...gateExtra(gate, season), priority_rule: priority.adaptation });
  await logSeasonGate(sb, row, gate, season);
  return { id: row.id, status: gate.kind === "pause_until_preseason" ? "paused" : "approved" };
}

export async function decideGoal(
  sb: Sb,
  args: { teamId: string; planId: string; coachUserId: string; body: unknown },
): Promise<{ status: GoalPlanStatus }> {
  const row = await loadTeamRow(sb, args.teamId, args.planId);
  const today = todayIso();
  const [{ base }, prefs] = await Promise.all([
    loadGoalPlanBase(sb, args.teamId, row.player_id, today),
    loadTeamQualityPrefs(sb, args.teamId),
  ]);
  const input = { ...base, quality: row.quality };
  const teamPref = prefs[row.quality];
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
    // Brief §6: one main goal at a time. The index holds it too; this says which plan is in the way, in words.
    const priority = oneMainGoalCheck(await openGoalsForPlayer(sb, args.teamId, row.player_id), row.id, row.quality);
    if (!priority.ok) throw new GoalPlanError(409, priority.en, priority.is);
    const plan = approvedPlan(input, teamPref, d);
    const season = await readGoalSeason(sb, args.teamId, today, { withNext: true });
    const gate = startGate(season, d.startDate);
    const { data, error } = await sb.from("player_goal_plans").update(gatedApproval(gate, plan, d, args.coachUserId, now))
      .eq("id", row.id).eq("status", "requested").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new GoalPlanError(409, "Someone else answered this request first.");
    await logApproval(sb, row, actor, plan, { ...d, startDate: gate.start }, teamPref, { ...gateExtra(gate, season), priority_rule: priority.adaptation });
    await logSeasonGate(sb, row, gate, season);
    return { status: gate.kind === "pause_until_preseason" ? "paused" : "approved" };
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
    // In season the plan would pause again on the next read: the coach may still restart it (the coach decides last),
    // with a reason, and the automatic in-season pause then leaves this plan alone (logged override).
    const season = await readGoalSeason(sb, args.teamId, today);
    const override = season.season === "maintain";
    if (override && !d.reason) {
      throw new GoalPlanError(400, "In season goal plans pause until the next pre-season. To restart it now anyway, write a reason (at least 5 characters).",
        "Á keppnistímabili eru markmiðsplön í bið fram að næsta undirbúningstímabili. Til að setja planið samt af stað núna, skrifaðu ástæðu (minnst 5 stafir).");
    }
    const start = resumedStartDate(d.startDate, d.fromWeek);
    const { data, error } = await sb.from("player_goal_plans").update({
      status: "approved", start_date: start, end_date: planEndDate(start), paused_at: null, paused_week: null, paused_reason: null,
      ...(override ? { season_override_at: now } : {}),
      coach_note: d.noteToPlayer ?? row.coach_note, updated_at: now,
    }).eq("id", row.id).eq("status", "paused").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new GoalPlanError(409, "This plan changed meanwhile; reload.");
    await logEvent(sb, row, "resumed", actor, d.reason, {
      from_week: d.fromWeek, resume_monday: d.startDate, default_week: def, paused_reason: row.paused_reason ?? "injury",
      ...(override ? { in_season_override: true, ...seasonDetail(season) } : {}),
    });
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

/** Every open plan of one player (one at most, by the index; read as a list so the priority check sees them all). */
async function openGoalsForPlayer(sb: Sb, teamId: string, playerId: string): Promise<OpenGoal[]> {
  const { data, error } = await sb.from("player_goal_plans").select("id, quality, status")
    .eq("team_id", teamId).eq("player_id", playerId).in("status", OPEN_STATUSES).limit(5);
  if (error) throw new Error(error.message);
  return (data ?? []) as OpenGoal[];
}

/** The priority rule on an approval event (the insert already proved no other plan is open). */
const priorityExtra = (open: OpenGoal[], planId: string, quality: GoalQuality): Record<string, unknown> => {
  const c = oneMainGoalCheck(open, planId, quality);
  return c.ok ? { priority_rule: c.adaptation } : {};
};

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
