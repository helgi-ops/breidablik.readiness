/**
 * /api/coach/goal-plans/start — the coach starts a player's goal plan from the Programme Library ("Speed & power"),
 * without a request from the player (2026-11-15).
 *
 * GET                                   the coach's team: active players, each with their open goal (if any).
 * GET ?playerId=&quality=[&start=&level=]  the plan as it would start now, built from that player's own data by the
 *                                       same rules as a player's request (`loadCoachStartPreview`). Read-only.
 * POST { playerId, quality, startDate (a Monday, within 28 days), start?, reason? (needed when the start differs
 *        from the rule's), level?, noteToPlayer? }
 *      writes the plan as approved in one step, with the same checks as approving a request (`startGoalByCoach`):
 *      one open goal per player, only safe starts and offered levels, the plan rebuilt and frozen on the server.
 *      The audit trail says the coach started it.
 *
 * Coach of the team only (requireCoachAccessForTeam on the coach's current team; the player must be on it). Nothing is
 * sent to the player (no push, no email): they see it on Today. Never reads or writes the readiness colour or Today's
 * session. FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { GoalPlanError, loadCoachStartPreview, startGoalByCoach } from "@/lib/micropulse/goalPlan/store";
import { OPEN_STATUSES, isGoalQuality, type GoalPlanStatus } from "@/lib/micropulse/goalPlan/requests";
import { isTrainingLevel } from "@/lib/micropulse/goalPlan/levels";
import type { GoalQuality } from "@/lib/micropulse/goalPlan/types";

export const runtime = "nodejs";

function fail(e: unknown) {
  if (e instanceof GoalPlanError) return NextResponse.json({ error: e.message, error_is: e.is }, { status: e.status });
  if (e instanceof Error && e.message === "Player not on this team") {
    return NextResponse.json({ error: "Player not on your team", error_is: "Leikmaðurinn er ekki í liðinu þínu" }, { status: 403 });
  }
  return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    const sp = new URL(req.url).searchParams;
    const playerId = sp.get("playerId");

    if (!playerId) {
      const [{ data: players, error: e1 }, { data: open, error: e2 }] = await Promise.all([
        sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true).order("full_name"),
        sb.from("player_goal_plans").select("id, player_id, quality, status").eq("team_id", teamId).in("status", OPEN_STATUSES),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      const openBy = new Map(((open ?? []) as { id: string; player_id: string; quality: GoalQuality; status: GoalPlanStatus }[]).map((g) => [g.player_id, { id: g.id, quality: g.quality, status: g.status }]));
      return NextResponse.json({
        ok: true,
        players: ((players ?? []) as { id: string; full_name: string | null }[]).map((p) => ({ id: p.id, name: p.full_name ?? "", openGoal: openBy.get(p.id) ?? null })),
      });
    }

    const quality = sp.get("quality");
    if (!isGoalQuality(quality)) return NextResponse.json({ error: "Unknown quality" }, { status: 400 });
    const start = sp.get("start");
    const level = sp.get("level");
    const preview = await loadCoachStartPreview(
      sb, teamId, playerId, quality,
      start && /^[a-z_]{1,40}$/.test(start) ? start : null,
      isTrainingLevel(level) ? level : null,
    );
    return NextResponse.json({ ok: true, ...preview });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { coachUserId, teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    if (!playerId) return NextResponse.json({ error: "Pick a player" }, { status: 400 });
    if (!isGoalQuality(body.quality)) return NextResponse.json({ error: "Unknown quality" }, { status: 400 });
    const res = await startGoalByCoach(sb, { teamId, playerId, coachUserId, quality: body.quality, body });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return fail(e);
  }
}
