/**
 * /api/coach/goal-plans/requests — goal plans players asked for on the coach's current team (lota 2).
 *
 * GET           open goals (waiting first) + those closed in the last 30 days, with player names. Applies the
 *               automatic pause (injured / rehab / return-to-train) and end of plan first (lota 3).
 *               Each item carries `testDue` (lota 6): the start test or retest the coach still has to enter, or null.
 * GET ?count=1  only the number waiting for an answer (sidebar badge).
 *
 * Coach of the team only (requireCoachAccessForTeam on the coach's current team). FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { pendingGoalCount } from "@/lib/micropulse/goalPlan/store";
import { listTeamGoalsSynced } from "@/lib/micropulse/goalPlan/todayLoader";
import { loadTeamGoalTestsDue } from "@/lib/micropulse/goalPlan/progressLoader";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    if (new URL(req.url).searchParams.get("count") === "1") {
      return NextResponse.json({ ok: true, pending: await pendingGoalCount(sb, teamId) });
    }
    const items = await listTeamGoalsSynced(sb, teamId);
    // After the sync, so a plan that just paused or ended is read in its new status.
    const due = await loadTeamGoalTestsDue(sb, teamId, new Date().toISOString().slice(0, 10)).catch(() => []);
    const byPlan = new Map(due.map((d) => [d.planId, { need: d.need, daysToEnd: d.daysToEnd }]));
    return NextResponse.json({ ok: true, items: items.map((i) => ({ ...i, testDue: byPlan.get(i.id) ?? null })) });
  } catch (e) {
    return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
