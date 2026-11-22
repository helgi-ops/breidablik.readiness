/**
 * /api/player/goal-plan — the player's own goal request (lota 2).
 *
 * GET    which qualities can be asked for now + the player's open (or recently closed) goal + how many earlier goals
 *        there are (a count; the list itself is /history, read only when opened). Light read. `dsiSuggestion`
 *        (goals step 3, 2026-11-18): the 8-week gym goal the player's force-plate tests suggest (DSI against the team:
 *        lower third → explosive, upper third → max_strength; goalSuggestion.ts), only for a player who can start a
 *        goal now; null otherwise. Rules, not AI; the player chooses.
 * POST   { quality, note?, switchedFrom? } ask for an 8-week add-on plan. `switchedFrom` = the quality the player had
 *        picked when they pressed "Switch" on the suggestion (lota 7); the suggestion is read again server-side. One open goal at a time (409). The rules build the
 *        proposal from the player's own data and store it; the coach approves, changes or declines it.
 *        Only a player who takes part (team on "Individualised + goals", or the coach let them in; three send modes,
 *        2026-11-17) can start one; it starts the next Monday without approval (same rules and safety checks); the
 *        coach sees it and can stop it. Others get 403.
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
import { readGoalSeason } from "@/lib/micropulse/goalPlan/season";
import { pausedReasonOf, startGate } from "@/lib/micropulse/goalPlan/seasonPause";
import { PLAYER_BLOCK_TEXT, autoStartDate, cleanPlayerNote, isGoalQuality, playerMayWithdraw } from "@/lib/micropulse/goalPlan/requests";
import { goalsWithoutApprovalFor } from "@/lib/micropulse/strengthProgramming/playerPicksStore";
import { loadDsiGoalSuggestions } from "@/lib/micropulse/strengthProgramming/loadDsiForTeam";

const today = () => new Date().toISOString().slice(0, 10);

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { playerId, teamId } = await requireGoalPlayer(sb, req);
    const [eligibility, current, historyCount, autoStart, dsi] = await Promise.all([
      loadGoalEligibility(sb, teamId, playerId),
      playerCurrentGoalSynced(sb, playerId),
      playerGoalHistoryCount(sb, teamId, playerId).catch(() => 0),
      goalsWithoutApprovalFor(sb, teamId, playerId).catch(() => false),
      // Fail-safe: any error → no suggestion (loadDsiGoalSuggestions never throws).
      loadDsiGoalSuggestions(sb, teamId, today()),
    ]);
    const open = !!current && (current.status === "requested" || current.status === "approved" || current.status === "paused");
    const sug = autoStart && !open ? dsi.get(playerId) ?? null : null;
    // Only a goal the player can pick right now (not blocked by injury / return / age).
    const dsiSuggestion = sug && eligibility.some((e) => e.quality === sug.goal && !e.blocked) ? sug : null;
    // In season a new goal starts at the next pre-season (GOAL_PLAN_PAUSED_IN_SEASON); read only when one can start.
    const gate = autoStart && !open ? startGate(await readGoalSeason(sb, teamId, today(), { withNext: true }), autoStartDate(today())) : null;
    return NextResponse.json({
      ok: true,
      historyCount,
      // The player takes part (three send modes, 2026-11-17): a new goal starts without approval, on this Monday.
      // Not taking part → the sheet shows no goal list (a running or earlier goal still shows).
      autoStart,
      autoStartDate: gate ? gate.start : autoStart ? autoStartDate(today()) : null,
      // "moved_to_preseason" / "pause_until_preseason": in season, the sheet says the goal starts at pre-season.
      startGate: gate?.kind ?? null,
      dsiSuggestion,
      eligibility: eligibility.map((e) => ({ quality: e.quality, blocked: e.blocked, blockedText: e.blocked ? PLAYER_BLOCK_TEXT[e.blocked] : null })),
      current: current && {
        id: current.id, quality: current.quality, status: current.status, note: current.player_note,
        requestedAt: current.requested_at, startDate: current.start_date, endDate: current.end_date,
        coachNote: current.coach_note,
        pausedWeek: current.status === "paused" ? current.paused_week ?? null : null,
        pausedReason: pausedReasonOf(current),
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
    // Read on the server, never from the body. Three send modes (2026-11-17): a player starts a goal only when they
    // take part under the team's mode (or the coach let them in); it then starts without approval.
    const autoStart = await goalsWithoutApprovalFor(sb, teamId, playerId).catch(() => null);
    if (autoStart === null) return NextResponse.json({ error: "Could not check. Try again.", error_is: "Tókst ekki að athuga. Reyndu aftur." }, { status: 503 });
    if (!autoStart) {
      return NextResponse.json({
        error: "Choosing your own goal isn't on for you right now. Your coach turns it on.",
        error_is: "Að velja þér markmið er ekki opið fyrir þig núna. Þjálfarinn opnar það.",
      }, { status: 403 });
    }
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
