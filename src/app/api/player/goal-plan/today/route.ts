/**
 * GET /api/player/goal-plan/today — the player's goal card for Today (lota 3).
 *
 * { card: null } when there is no approved or paused plan. Otherwise this week's sessions placed around the team's
 * matches, today's session in today's version (the check-in colour is only READ: yellow = lighter, red = skip), and
 * the layered copy. Reading it also applies the automatic pause (injured / rehab / return-to-train) and end of plan.
 *
 * The player is read from the token. It never writes the colour or Today's session. FREE-locked teams get 402
 * (the card stays hidden).
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { loadGoalToday } from "@/lib/micropulse/goalPlan/todayLoader";
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
