/**
 * /api/player/goal-plan/suggestion — "is the quality I picked the one I have most to gain in?" (lota 7).
 *
 * GET  for each quality the player could pick: either nothing, or a suggestion of another quality that is a clear
 *      weakness (bottom third of the same position on the team) while the picked one is not, in plain words. Read
 *      only, fetched when the player first picks a quality (the sheet's first load stays light).
 *
 * The player is read from their own token, never from the query. Only the player's own numbers and percentiles are
 * returned: never another player's name or number. No colour. Rules, not AI. Nothing here sends anything, reads or
 * writes the readiness colour, or touches Today's session. FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { loadPlayerPriority } from "@/lib/micropulse/goalPlan/priorityLoader";
import { OPEN_GOAL_QUALITIES } from "@/lib/micropulse/goalPlan/types";
import { goalFail, requireGoalPlayer } from "../_shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { playerId, teamId } = await requireGoalPlayer(sb, req);
    const read = await loadPlayerPriority(sb, teamId, playerId, new Date().toISOString().slice(0, 10));
    const byQuality = Object.fromEntries(OPEN_GOAL_QUALITIES.map((q) => {
      const p = read?.byQuality[q];
      return [q, p?.suggested && p.view ? { suggested: p.suggested, view: p.view } : null];
    }));
    return NextResponse.json({ ok: true, byQuality });
  } catch (e) {
    return goalFail(e);
  }
}
