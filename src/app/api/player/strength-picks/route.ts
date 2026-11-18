/**
 * /api/player/strength-picks — the player chooses which of the team's exercises they want in their own strength
 * session (player exercise picks, lota 1) and one strength goal (lota 2), 2026-11-17.
 *
 * GET → { ok, enabled, goalRow, groups, picks, locked, goals, goal, goalLocked, retiredGoal, updatedAt, updatedByRole }.
 *       `enabled: false` when the player doesn't take part under the team's send mode (sendMode.ts: "Individualised +
 *       goals", unless the coach took them out, or let in on another mode), or the team has no list — the sheet then
 *       says so and offers nothing. `goalRow` (2026-11-17): show the "My goal" row on Today — the player takes part,
 *       or has a goal plan (running or earlier) to look at.
 * PUT { slot, ids } → saves one group (first choice first; [] clears it) and returns the same shape.
 * PUT { goal }      → saves the goal ("robust" | null) and returns the same shape. Goals step 3 (2026-11-18):
 *                     "stronger" / "power" are retired (400 code "retired"); the 8-week gym goals replace them.
 *                     `goals` lists only the goals that can still be chosen; `goal` is the active goal or null;
 *                     `retiredGoal` is the line for a retired goal still stored (it adds nothing), or null.
 *
 * The player comes from the login token, never the body; the team is the player's own team. FREE-locked teams get
 * 402. Checks: known group, a group with a real choice, every id on the team's list for that group, at most the
 * group's max, group not locked by the coach. Applies from the next session sent; nothing is sent (no push, no
 * email) and Today's session already sent is not changed. Writes only through playerPicksStore.
 *
 * The force-plate (DSI) suggestion moved to My goal on 2026-11-18 (/api/player/goal-plan): it names an 8-week gym goal.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getPlayerTeamId, requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { ACTIVE_STRENGTH_GOALS, GOAL_DAYS, STRENGTH_GOAL_LABEL, activeGoal, retiredGoalNote, validateGoal, validatePlayerPick } from "@/lib/micropulse/strengthProgramming/playerPicks";
import {
  PicksError,
  choicesOn,
  playerTakesPart,
  pickGroups,
  readPlayerPicks,
  readTeamPickConfig,
  saveGoal,
  savePicks,
} from "@/lib/micropulse/strengthProgramming/playerPicksStore";

export const runtime = "nodejs";

type Sb = ReturnType<typeof getSupabaseServer>;

async function requirePicksPlayer(sb: Sb, req: Request) {
  const { userId, playerId } = await requireAuthedPlayerId(sb, req);
  const teamId = await getPlayerTeamId(sb, playerId);
  if (!teamId) throw new PicksError(403, "No team", "Ekkert lið");
  const { data: locked } = await sb.rpc("is_free_locked_team", { p_team_id: teamId });
  if (locked === true) throw new PicksError(402, "Not on this plan", "Ekki í áskrift liðsins");
  return { userId, playerId, teamId };
}

function fail(e: unknown) {
  if (e instanceof PicksError) return NextResponse.json({ error: e.message, error_is: e.is }, { status: e.status });
  if (e instanceof Error && e.message === "Authenticated user is not mapped to a player") {
    return NextResponse.json({ error: "Not a player account", error_is: "Ekki leikmannsaðgangur" }, { status: 403 });
  }
  return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
}

const GOALS = ACTIVE_STRENGTH_GOALS.map((id) => ({ id, ...STRENGTH_GOAL_LABEL[id], days: GOAL_DAYS[id] }));

/** Has the player any 8-week goal plan on this team (running, waiting or earlier)? One small read. Fail → false. */
async function hasGoalPlan(sb: Sb, playerId: string, teamId: string): Promise<boolean> {
  const { data, error } = await sb.from("player_goal_plans").select("id").eq("player_id", playerId).eq("team_id", teamId).limit(1);
  return !error && (data ?? []).length > 0;
}

async function state(sb: Sb, playerId: string, teamId: string) {
  const cfg = await readTeamPickConfig(sb, teamId);
  const row = await readPlayerPicks(sb, playerId, teamId, cfg.slots);
  const goalRow = playerTakesPart(cfg, row) || (await hasGoalPlan(sb, playerId, teamId));
  if (!choicesOn(cfg, row)) return { ok: true, enabled: false as const, goalRow };
  const { testEnabled: _t, choicesOff: _o, ...mine } = row;
  void _t; void _o;
  return {
    ok: true, enabled: true as const, goalRow, groups: pickGroups(cfg.slots), goals: GOALS, ...mine,
    goal: activeGoal(row.goal), retiredGoal: retiredGoalNote(row.goal),
  };
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { playerId, teamId } = await requirePicksPlayer(sb, req);
    return NextResponse.json(await state(sb, playerId, teamId));
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { userId, playerId, teamId } = await requirePicksPlayer(sb, req);
    const body = (await req.json().catch(() => null)) as { slot?: unknown; ids?: unknown; goal?: unknown } | null;
    if (!body) return NextResponse.json({ error: "Bad body", error_is: "Ógild beiðni" }, { status: 400 });

    const cfg = await readTeamPickConfig(sb, teamId);
    const current = await readPlayerPicks(sb, playerId, teamId, cfg.slots);
    if (!choicesOn(cfg, current)) {
      return NextResponse.json({ error: "Your coach has not turned this on.", error_is: "Þjálfarinn þinn hefur ekki kveikt á þessu." }, { status: 403 });
    }
    if ("goal" in body) {
      const g = validateGoal(body.goal, current.goalLocked);
      if (!g.ok) return NextResponse.json({ error: g.error.en, error_is: g.error.is, code: g.error.code }, { status: g.error.code === "locked" ? 403 : 400 });
      await saveGoal(sb, { playerId, teamId, slots: cfg.slots, goal: g.goal, actor: { role: "player", userId } });
      return NextResponse.json(await state(sb, playerId, teamId));
    }
    const v = validatePlayerPick(String(body.slot ?? ""), body.ids, cfg.slots, current.locked);
    if (!v.ok) return NextResponse.json({ error: v.error.en, error_is: v.error.is, code: v.error.code }, { status: v.error.code === "locked" ? 403 : 400 });

    await savePicks(sb, { playerId, teamId, slots: cfg.slots, slot: v.slot, ids: v.ids, actor: { role: "player", userId } });
    return NextResponse.json(await state(sb, playerId, teamId));
  } catch (e) {
    return fail(e);
  }
}
