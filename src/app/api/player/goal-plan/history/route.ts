/**
 * /api/player/goal-plan/history — the player's earlier goals (lota 5).
 *
 * GET  plans that ran on the player's current team (finished, or stopped by the coach after approval), newest
 *      first, at most 8: the outcome in the player's own numbers, sessions ticked, the coach's note to the player.
 *      Read only, and only when the player opens "Earlier goals" (the sheet's first load reads a count only).
 *
 * The player is read from their own token, never from the query. No GPS numbers, no colour. Nothing here sends
 * anything, reads or writes the readiness colour, or touches Today's session. FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { loadGoalHistory } from "@/lib/micropulse/goalPlan/progressLoader";
import { goalFail, requireGoalPlayer } from "../_shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { playerId, teamId } = await requireGoalPlayer(sb, req);
    const items = await loadGoalHistory(sb, teamId, playerId, new Date().toISOString().slice(0, 10));
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return goalFail(e);
  }
}
