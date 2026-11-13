/**
 * /api/coach/goal-plans/requests — goal plans players asked for on the coach's current team (lota 2).
 *
 * GET           open goals (waiting first) + those closed in the last 30 days, with player names.
 * GET ?count=1  only the number waiting for an answer (sidebar badge).
 *
 * Coach of the team only (requireCoachAccessForTeam on the coach's current team). FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { listTeamGoals, pendingGoalCount } from "@/lib/micropulse/goalPlan/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    if (new URL(req.url).searchParams.get("count") === "1") {
      return NextResponse.json({ ok: true, pending: await pendingGoalCount(sb, teamId) });
    }
    return NextResponse.json({ ok: true, items: await listTeamGoals(sb, teamId) });
  } catch (e) {
    return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
