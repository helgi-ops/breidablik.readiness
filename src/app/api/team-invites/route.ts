import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

async function requireCoach(req: Request): Promise<{ userId: string; teamId: string }> {
  const sb = getSupabaseAdmin();
  const debug: Record<string, unknown> = {};

  // Step 1: Check bearer token
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  debug.hasBearer = !!bearerToken;
  debug.bearerLen = bearerToken.length;

  // Step 2: Try to get user from bearer
  let userId: string | null = null;
  if (bearerToken) {
    const { data: u, error: ue } = await sb.auth.getUser(bearerToken);
    debug.bearerUserId = u?.user?.id ?? null;
    debug.bearerError = ue?.message ?? null;
    if (!ue && u?.user?.id) userId = u.user.id;
  }

  // Step 3: Try cookie fallback
  if (!userId) {
    try {
      const { createServerClient } = await import("@supabase/ssr");
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const allCookies = cookieStore.getAll();
      const sbCookies = allCookies.filter((c: { name: string }) => c.name.startsWith("sb-"));
      debug.totalCookies = allCookies.length;
      debug.sbCookieCount = sbCookies.length;
      debug.sbCookieNames = sbCookies.map((c: { name: string }) => c.name);

      if (sbCookies.length > 0) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const serverClient = createServerClient(url, anon, {
          cookies: {
            getAll() { return cookieStore.getAll().map((c: { name: string; value: string }) => ({ name: c.name, value: c.value })); },
            setAll() { /* read-only */ },
          },
        });
        const { data, error } = await serverClient.auth.getUser();
        debug.cookieUserId = data?.user?.id ?? null;
        debug.cookieError = error?.message ?? null;
        if (!error && data?.user?.id) userId = data.user.id;
      }
    } catch (e) {
      debug.cookieFallbackError = e instanceof Error ? e.message : String(e);
    }
  }

  debug.resolvedUserId = userId;

  if (!userId) {
    throw Object.assign(new Error("Unauthorized"), { debug });
  }

  // Step 4: Check profile role
  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userId)
    .maybeSingle();

  debug.profile = prof;
  debug.profileError = profErr?.message ?? null;

  const role = String((prof as any)?.role ?? "").toUpperCase();
  debug.resolvedRole = role;

  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) {
    throw Object.assign(new Error("Forbidden"), { debug });
  }

  const teamId = (prof as any)?.team_id;
  if (!teamId) throw Object.assign(new Error("No team context"), { debug });

  return { userId, teamId };
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
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg, debug: err?.debug ?? null }, { status });
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
    if (!["PLAYER", "COACH", "EXEC"].includes(targetRole)) {
      return NextResponse.json({ error: "targetRole must be PLAYER, COACH or EXEC" }, { status: 400 });
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
