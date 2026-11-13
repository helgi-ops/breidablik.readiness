/**
 * /api/coach/goal-plans/requests/[id]/results — the coach's test results for a goal plan (lota 4).
 *
 * POST   { measure, phase: "baseline" | "retest", value, testDate, note? }  enter a result (start or retest)
 * DELETE ?resultId=<uuid>                                                     remove one entered by mistake
 *
 * Only the tests the plan uses (top speed: flying 20 m or a top-speed test; acceleration: 10 m; braking: cut test
 * and 10 m; jump: jump height), dated from 4 weeks before the start to 3 weeks after the end. Every entry and removal
 * is in the plan's history. Coach of the plan's team only; FREE-locked teams get 402. Never touches the readiness
 * colour or Today's session.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { GoalPlanError, addGoalResult, removeGoalResult } from "@/lib/micropulse/goalPlan/store";

export const runtime = "nodejs";

const fail = (e: unknown) => {
  if (e instanceof GoalPlanError) return NextResponse.json({ error: e.message }, { status: e.status });
  return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = getSupabaseServer();
    const { coachUserId, teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ ok: true, ...(await addGoalResult(sb, { teamId, planId: id, coachUserId, body })) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = getSupabaseServer();
    const { coachUserId, teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    const resultId = new URL(req.url).searchParams.get("resultId") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(resultId)) return NextResponse.json({ error: "Which result?" }, { status: 400 });
    await removeGoalResult(sb, { teamId, planId: id, resultId, coachUserId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
