/**
 * /api/player/goal-plan — the player's own goal request (lota 2).
 *
 * GET    which qualities can be asked for now + the player's open (or recently closed) goal + how many earlier goals
 *        there are (a count; the list itself is /history, read only when opened). Light read.
 * POST   { quality, note?, switchedFrom? } ask for an 8-week add-on plan. `switchedFrom` = the quality the player had
 *        picked when they pressed "Switch" on the suggestion (lota 7); the suggestion is read again server-side. One open goal at a time (409). The rules build the
 *        proposal from the player's own data and store it; the coach approves, changes or declines it.
 *        Player choices on (team switch or the coach's one-player test, 2026-11-17): the plan starts the next Monday
 *        without approval (same rules and safety checks); the coach sees it and can stop it.
 * DELETE withdraw a request the coach has not answered yet, or a plan that started without approval and has not begun.
 *
 * The player is read from their own token, never from the body. Nothing here sends anything, reads or writes the
 * readiness colour, or touches Today's session. FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { loadGoalEligibility } from "@/lib/micropulse/goalPlan/loader";
import { cancelGoalRequest, createGoalRequest, playerGoalHistoryCount } from "@/lib/micropulse/goalPlan/store";
import { playerCurrentGoalSynced } from "@/lib/micropulse/goalPlan/todayLoader";
import { loadPlayerPriority } from "@/lib/micropulse/goalPlan/priorityLoader";
import { prioritySnapshot } from "@/lib/micropulse/goalPlan/priority";
import { goalFail, requireGoalPlayer } from "./_shared";
import { PLAYER_BLOCK_TEXT, autoStartDate, cleanPlayerNote, isGoalQuality, playerMayWithdraw } from "@/lib/micropulse/goalPlan/requests";
import { playerChoicesOnFor } from "@/lib/micropulse/strengthProgramming/playerPicksStore";

const today = () => new Date().toISOString().slice(0, 10);

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { playerId, teamId } = await requireGoalPlayer(sb, req);
    const [eligibility, current, historyCount, autoStart] = await Promise.all([
      loadGoalEligibility(sb, teamId, playerId),
      playerCurrentGoalSynced(sb, playerId),
      playerGoalHistoryCount(sb, teamId, playerId).catch(() => 0),
      playerChoicesOnFor(sb, teamId, playerId).catch(() => false),
    ]);
    return NextResponse.json({
      ok: true,
      historyCount,
      // Player choices on: a new goal starts without approval, on this Monday.
      autoStart,
      autoStartDate: autoStart ? autoStartDate(today()) : null,
      eligibility: eligibility.map((e) => ({ quality: e.quality, blocked: e.blocked, blockedText: e.blocked ? PLAYER_BLOCK_TEXT[e.blocked] : null })),
      current: current && {
        id: current.id, quality: current.quality, status: current.status, note: current.player_note,
        requestedAt: current.requested_at, startDate: current.start_date, endDate: current.end_date,
        coachNote: current.coach_note,
        pausedWeek: current.status === "paused" ? current.paused_week ?? null : null,
        // A decline reason is for the player; a reason for changing the start is the coach's own note.
        declineReason: current.status === "declined" ? current.decision_reason : null,
        autoStarted: !!current.auto_started,
        canWithdraw: playerMayWithdraw(current, today()),
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
    const body = (await req.json().catch(() => ({}))) as { quality?: unknown; note?: unknown; switchedFrom?: unknown };
    if (!isGoalQuality(body.quality)) return NextResponse.json({ error: "Pick top speed, acceleration, braking or vertical jump.", error_is: "Veldu hámarkshraða, hröðun, bremsun eða lóðrétt stökk." }, { status: 400 });
    const quality = body.quality;
    // Lota 7: the suggestion is read again here (not taken from the body) and stored with the request for the coach.
    // If the read fails, the request still goes through without it.
    const switchedFrom = isGoalQuality(body.switchedFrom) ? body.switchedFrom : null;
    const priority = await loadPlayerPriority(sb, teamId, playerId, new Date().toISOString().slice(0, 10))
      .then((p) => (p ? prioritySnapshot(p.reads, p.metric, quality, switchedFrom) : null))
      .catch(() => null);
    // Read on the server, never from the body. A failed read falls back to the request + approval flow.
    const autoStart = await playerChoicesOnFor(sb, teamId, playerId).catch(() => false);
    const res = await createGoalRequest(sb, { teamId, playerId, userId, quality, note: cleanPlayerNote(body.note), priority, autoStart });
    return NextResponse.json({ ok: true, id: res.id, status: res.status });
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
