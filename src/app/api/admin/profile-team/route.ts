export const runtime = "nodejs";

/**
 * POST /api/admin/profile-team { userId, teamId }  (teamId null = no team)
 *
 * Admin moves a player between teams: the player row is moved by the admin UI, this keeps the
 * linked account's team in step. Admin only.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { requireAdminUser } from "@/lib/auth/requireAdmin";

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    await requireAdminUser(sb, req);

    const body = (await req.json().catch(() => ({}))) as { userId?: unknown; teamId?: unknown };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const teamId = typeof body.teamId === "string" && body.teamId.trim() ? body.teamId.trim() : null;
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    const { error } = await sb.from("profiles").update({ team_id: teamId }).eq("id", userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return auth;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
