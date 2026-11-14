/**
 * /api/coach/goal-plans/requests/[id] — one goal plan for the coach to review (lota 2).
 *
 * GET ?start=<branch>  the request, its audit trail, the starts the safety rules allow, and the plan: for a waiting
 *                      request it is rebuilt from today's data with the chosen start (preview of what would be
 *                      approved); for an approved plan it is the frozen plan.
 *
 * Lota 3: an approved plan also returns `weekView` (plan week today + where this week's sessions land); a paused
 * plan returns `resumeDefault` (the week it picks up at by default).
 *
 * Lota 4: an approved, paused, finished or stopped plan also returns `progress` — the test results (coach entries +
 * VALD jump height), the outcome against the "clear change" mark, sessions ticked, and GPS context.
 *
 * Lota 5: GET ?level=<beginner|intermediate|advanced> previews a waiting request at that level (default the team's
 * saved level); the response adds `levels` (offered for the chosen start) and `teamPref` (team's level and swaps).
 *
 * Coach of the plan's team only. Read-only. FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { GoalPlanError, loadGoalReview } from "@/lib/micropulse/goalPlan/store";
import { coachWeekView } from "@/lib/micropulse/goalPlan/todayLoader";
import { resumeDefaultWeek } from "@/lib/micropulse/goalPlan/requests";
import { loadGoalProgress } from "@/lib/micropulse/goalPlan/progressLoader";
import { isTrainingLevel } from "@/lib/micropulse/goalPlan/levels";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = getSupabaseServer();
    const { teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    const sp = new URL(req.url).searchParams;
    const start = sp.get("start");
    const level = sp.get("level");
    const review = await loadGoalReview(
      sb,
      teamId,
      id,
      start && /^[a-z_]{1,40}$/.test(start) ? start : null,
      isTrainingLevel(level) ? level : null,
    );
    const todayIso = new Date().toISOString().slice(0, 10);
    const [weekView, progress] = await Promise.all([
      coachWeekView(sb, teamId, review.row, todayIso),
      loadGoalProgress(sb, teamId, review.row, todayIso),
    ]);
    const resumeDefault = review.row.status === "paused" ? resumeDefaultWeek(review.row.paused_week, review.row.paused_at, todayIso) : null;
    return NextResponse.json({ ok: true, ...review, weekView, resumeDefault, progress });
  } catch (e) {
    if (e instanceof GoalPlanError) return NextResponse.json({ error: e.message }, { status: e.status });
    return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
