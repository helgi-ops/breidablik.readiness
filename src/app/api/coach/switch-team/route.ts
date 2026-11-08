export const runtime = "nodejs";

/**
 * POST /api/coach/switch-team { teamId }
 *
 * Changes the signed-in coach's active team (profiles.team_id, which scopes the coach surface).
 * Only to a team they coach (coach_teams); admins may pick any team. The browser can no longer write
 * profiles.team_id directly, so this is the one way to switch.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { requireCoachUserId } from "@/lib/notifications/auth";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { isAdminUser } from "@/lib/auth/requireAdmin";

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const body = (await req.json().catch(() => ({}))) as { teamId?: unknown };
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

    const userId = await requireCoachUserId(sb, req);
    if (!(await isAdminUser(sb, userId))) await requireCoachAccessForTeam(sb, req, teamId);

    const { error } = await sb.from("profiles").update({ team_id: teamId }).eq("id", userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, teamId });
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return auth;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
