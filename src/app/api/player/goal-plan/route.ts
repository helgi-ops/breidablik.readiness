/**
 * /api/player/goal-plan — the player's own goal request (lota 2).
 *
 * GET    which qualities can be asked for now + the player's open (or recently closed) goal + how many earlier goals
 *        there are (a count; the list itself is /history, read only when opened). Light read.
 * POST   { quality, note? } ask for an 8-week add-on plan. One open goal at a time (409). The rules build the
 *        proposal from the player's own data and store it; the coach approves, changes or declines it.
 * DELETE withdraw a request the coach has not answered yet.
 *
 * The player is read from their own token, never from the body. Nothing here sends anything, reads or writes the
 * readiness colour, or touches Today's session. FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { loadGoalEligibility } from "@/lib/micropulse/goalPlan/loader";
import { cancelGoalRequest, createGoalRequest, playerGoalHistoryCount } from "@/lib/micropulse/goalPlan/store";
import { playerCurrentGoalSynced } from "@/lib/micropulse/goalPlan/todayLoader";
import { goalFail, requireGoalPlayer } from "./_shared";
import { PLAYER_BLOCK_TEXT, cleanPlayerNote, isGoalQuality } from "@/lib/micropulse/goalPlan/requests";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { playerId, teamId } = await requireGoalPlayer(sb, req);
    const [eligibility, current, historyCount] = await Promise.all([
      loadGoalEligibility(sb, teamId, playerId),
      playerCurrentGoalSynced(sb, playerId),
      playerGoalHistoryCount(sb, teamId, playerId).catch(() => 0),
    ]);
    return NextResponse.json({
      ok: true,
      historyCount,
      eligibility: eligibility.map((e) => ({ quality: e.quality, blocked: e.blocked, blockedText: e.blocked ? PLAYER_BLOCK_TEXT[e.blocked] : null })),
      current: current && {
        id: current.id, quality: current.quality, status: current.status, note: current.player_note,
        requestedAt: current.requested_at, startDate: current.start_date, endDate: current.end_date,
        coachNote: current.coach_note,
        pausedWeek: current.status === "paused" ? current.paused_week ?? null : null,
        // A decline reason is for the player; a reason for changing the start is the coach's own note.
        declineReason: current.status === "declined" ? current.decision_reason : null,
      },
    });
  } catch (e) {
    return goalFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { userId, playerId, teamId } = await requireGoalPlayer(sb, req);
    const body = (await req.json().catch(() => ({}))) as { quality?: unknown; note?: unknown };
    if (!isGoalQuality(body.quality)) return NextResponse.json({ error: "Pick top speed, acceleration, braking or vertical jump.", error_is: "Veldu hámarkshraða, hröðun, bremsun eða lóðrétt stökk." }, { status: 400 });
    const res = await createGoalRequest(sb, { teamId, playerId, userId, quality: body.quality, note: cleanPlayerNote(body.note) });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    return goalFail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { userId, playerId } = await requireGoalPlayer(sb, req);
    await cancelGoalRequest(sb, { playerId, userId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return goalFail(e);
  }
}
