/**
 * /api/coach/goal-plans/requests/[id]/decision — the coach answers a goal request (lota 2).
 *
 * POST { action: "approve", startDate (a Monday, within 28 days), start? (branch key), reason?, noteToPlayer? }
 *      { action: "decline", reason, noteToPlayer? }
 *      { action: "stop", reason }               (an approved or paused plan)
 *
 * Approving rebuilds the plan on the server from today's data and freezes it; a browser never sends the plan.
 * Choosing another start than the rule's needs a reason and must be one the safety rules allow (under 18 keeps the
 * youth level, a player braking hard a lot keeps technique only, flying sprints need a recent fast run). Every
 * decision is logged with who and why. Nothing is sent to the player in lota 2. FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { GoalPlanError, decideGoal } from "@/lib/micropulse/goalPlan/store";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = getSupabaseServer();
    const { coachUserId, teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const res = await decideGoal(sb, { teamId, planId: id, coachUserId, body });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    if (e instanceof GoalPlanError) return NextResponse.json({ error: e.message }, { status: e.status });
    return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
