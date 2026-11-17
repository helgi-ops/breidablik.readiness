/**
 * /api/player/strength-picks — the player chooses which of the team's exercises they want in their own strength
 * session (player exercise picks, lota 1) and one strength goal (lota 2), 2026-11-17.
 *
 * GET → { ok, enabled, groups, picks, locked, goals, goal, goalLocked, updatedAt, updatedByRole }. `enabled: false`
 *       when the coach has not turned picks on for the team or for this player (test), or the team has no list —
 *       the sheet then says so and offers nothing.
 * PUT { slot, ids } → saves one group (first choice first; [] clears it) and returns the same shape.
 * PUT { goal }      → saves the goal ("stronger" | "power" | "robust" | null) and returns the same shape.
 *
 * The player comes from the login token, never the body; the team is the player's own team. FREE-locked teams get
 * 402. Checks: known group, a group with a real choice, every id on the team's list for that group, at most the
 * group's max, group not locked by the coach. Applies from the next session sent; nothing is sent (no push, no
 * email) and Today's session already sent is not changed. Writes only through playerPicksStore.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getPlayerTeamId, requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { GOAL_DAYS, STRENGTH_GOALS, STRENGTH_GOAL_LABEL, validateGoal, validatePlayerPick } from "@/lib/micropulse/strengthProgramming/playerPicks";
import {
  PicksError,
  choicesOn,
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

const GOALS = STRENGTH_GOALS.map((id) => ({ id, ...STRENGTH_GOAL_LABEL[id], days: GOAL_DAYS[id] }));

async function state(sb: Sb, playerId: string, teamId: string) {
  const cfg = await readTeamPickConfig(sb, teamId);
  const row = await readPlayerPicks(sb, playerId, teamId, cfg.slots);
  if (!choicesOn(cfg, row)) return { ok: true, enabled: false as const };
  const { testEnabled: _t, ...mine } = row;
  void _t;
  return { ok: true, enabled: true as const, groups: pickGroups(cfg.slots), goals: GOALS, ...mine };
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
