/**
 * GET /api/player/goal-plan/today — the player's goal card for Today (lota 3).
 *
 * { card: null } when there is no approved or paused plan. Otherwise this week's sessions placed around the team's
 * matches, today's session in today's version (the check-in colour is only READ: yellow = lighter, red = skip), and
 * the layered copy. Reading it also applies the automatic pause (injured / rehab / return-to-train) and end of plan.
 *
 * After the last week (lota 4) the card shows the outcome for 14 days.
 *
 * POST { slot: "A" | "B" | "C", status: "done" | "skipped" | "clear" } — the player ticks one of this week's sessions
 * (only one the rules placed on today or earlier). Returns the refreshed card.
 *
 * The player is read from the token. It never writes the colour or Today's session. FREE-locked teams get 402
 * (the card stays hidden).
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { loadGoalToday, markGoalToday } from "@/lib/micropulse/goalPlan/todayLoader";
import { goalFail, requireGoalPlayer } from "../_shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { playerId, teamId } = await requireGoalPlayer(sb, req);
    const todayIso = new Date().toISOString().slice(0, 10);
    return NextResponse.json({ ok: true, card: await loadGoalToday(sb, teamId, playerId, todayIso) });
  } catch (e) {
    return goalFail(e);
  }
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { playerId, teamId, userId } = await requireGoalPlayer(sb, req);
    const body = await req.json().catch(() => ({}));
    const todayIso = new Date().toISOString().slice(0, 10);
    return NextResponse.json({ ok: true, card: await markGoalToday(sb, { teamId, playerId, userId, body, todayIso }) });
  } catch (e) {
    return goalFail(e);
  }
}
