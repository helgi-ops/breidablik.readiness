/**
 * /api/player/goal-plan — the player's own goal request (lota 2).
 *
 * GET    which qualities can be asked for now + the player's open (or recently closed) goal. Light read.
 * POST   { quality, note? } ask for an 8-week add-on plan. One open goal at a time (409). The rules build the
 *        proposal from the player's own data and store it; the coach approves, changes or declines it.
 * DELETE withdraw a request the coach has not answered yet.
 *
 * The player is read from their own token, never from the body. Nothing here sends anything, reads or writes the
 * readiness colour, or touches Today's session. FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getPlayerTeamId, requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { loadGoalEligibility } from "@/lib/micropulse/goalPlan/loader";
import { GoalPlanError, cancelGoalRequest, createGoalRequest, playerCurrentGoal } from "@/lib/micropulse/goalPlan/store";
import { PLAYER_BLOCK_TEXT, cleanPlayerNote, isGoalQuality } from "@/lib/micropulse/goalPlan/requests";

export const runtime = "nodejs";

type Sb = ReturnType<typeof getSupabaseServer>;

async function resolvePlayer(sb: Sb, req: Request) {
  const { userId, playerId } = await requireAuthedPlayerId(sb, req);
  const teamId = await getPlayerTeamId(sb, playerId);
  if (!teamId) throw new GoalPlanError(403, "No team");
  const { data: locked } = await sb.rpc("is_free_locked_team", { p_team_id: teamId });
  if (locked === true) throw new GoalPlanError(402, "Not on this plan");
  return { userId, playerId, teamId };
}

function fail(e: unknown) {
  if (e instanceof GoalPlanError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof Error && e.message === "Authenticated user is not mapped to a player") {
    return NextResponse.json({ error: "Not a player account" }, { status: 403 });
  }
  return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { playerId, teamId } = await resolvePlayer(sb, req);
    const [eligibility, current] = await Promise.all([loadGoalEligibility(sb, teamId, playerId), playerCurrentGoal(sb, playerId)]);
    return NextResponse.json({
      ok: true,
      eligibility: eligibility.map((e) => ({ quality: e.quality, blocked: e.blocked, blockedText: e.blocked ? PLAYER_BLOCK_TEXT[e.blocked] : null })),
      current: current && {
        id: current.id, quality: current.quality, status: current.status, note: current.player_note,
        requestedAt: current.requested_at, startDate: current.start_date, endDate: current.end_date,
        coachNote: current.coach_note,
        // A decline reason is for the player; a reason for changing the start is the coach's own note.
        declineReason: current.status === "declined" ? current.decision_reason : null,
      },
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { userId, playerId, teamId } = await resolvePlayer(sb, req);
    const body = (await req.json().catch(() => ({}))) as { quality?: unknown; note?: unknown };
    if (!isGoalQuality(body.quality)) return NextResponse.json({ error: "Pick top speed, acceleration, braking or vertical jump." }, { status: 400 });
    const res = await createGoalRequest(sb, { teamId, playerId, userId, quality: body.quality, note: cleanPlayerNote(body.note) });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { userId, playerId } = await resolvePlayer(sb, req);
    await cancelGoalRequest(sb, { playerId, userId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
