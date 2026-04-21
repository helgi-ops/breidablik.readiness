import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

async function requireCoach(req: Request): Promise<{ userId: string; teamId: string }> {
  const sb = getSupabaseAdmin();

  // Debug: check bearer token
  const auth = req.headers.get("authorization") || "";
  const hasBearer = auth.startsWith("Bearer ");
  console.log("[team-invites] auth header present:", hasBearer, "length:", auth.length);

  // Debug: check cookie-based session
  try {
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const sbCookies = allCookies.filter(c => c.name.startsWith("sb-"));
    console.log("[team-invites] total cookies:", allCookies.length, "sb-cookies:", sbCookies.length, "names:", sbCookies.map(c => c.name));
  } catch (e) {
    console.log("[team-invites] cookie check error:", e);
  }

  try {
    const { coachUserId, teamId, role } = await requireCoachAccessForTeam(sb, req);
    console.log("[team-invites] auth OK — userId:", coachUserId, "teamId:", teamId, "role:", role);
    if (!teamId) throw new Error("No team context");
    return { userId: coachUserId, teamId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[team-invites] auth FAILED:", msg);
    throw err;
  }
}

/**
 * GET /api/team-invites — list invite links for coach's team
 */
export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("team_invite_links")
      .select("id, token, target_role, label, is_active, created_at, expires_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ links: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * POST /api/team-invites — create a new invite link
 * Body: { targetRole?: "PLAYER"|"COACH", label?: string, expiresInDays?: number }
 */
export async function POST(req: Request) {
  try {
    const { userId, teamId } = await requireCoach(req);
    const body = await req.json().catch(() => ({}));
    const targetRole = String(body.targetRole ?? "PLAYER").toUpperCase();
    if (targetRole !== "PLAYER" && targetRole !== "COACH") {
      return NextResponse.json({ error: "targetRole must be PLAYER or COACH" }, { status: 400 });
    }
    const label = body.label ? String(body.label).trim().slice(0, 100) : null;
    const expiresInDays = Math.min(Math.max(Number(body.expiresInDays) || 90, 1), 365);

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("team_invite_links")
      .insert({
        team_id: teamId,
        target_role: targetRole,
        created_by: userId,
        label,
        expires_at: new Date(Date.now() + expiresInDays * 86400000).toISOString(),
      })
      .select("id, token, target_role, label, is_active, created_at, expires_at")
      .single();
    if (error) throw error;

    const origin = req.headers.get("origin") || req.headers.get("x-forwarded-host") || "https://micropulse.is";
    const joinUrl = `${origin.startsWith("http") ? origin : `https://${origin}`}/join/${data.token}`;

    return NextResponse.json({ link: data, joinUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * DELETE /api/team-invites?id=... — deactivate a link
 */
export async function DELETE(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const url = new URL(req.url);
    const linkId = url.searchParams.get("id") ?? "";
    if (!linkId) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from("team_invite_links")
      .update({ is_active: false })
      .eq("id", linkId)
      .eq("team_id", teamId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
