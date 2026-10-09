export const runtime = "nodejs";

/**
 * GET /api/admin/coaches — list coaches (profiles.role='COACH', team_id set) for
 * the admin "upload drills into another coach's library" picker.
 *
 * Strictly ADMIN-gated: the bearer token must resolve to a profile with role='ADMIN',
 * else 403. Uses the service-role server client (bypasses RLS) like the other routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

async function requireAdmin(req: NextRequest) {
  const sb = getSupabaseServer();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 as const };

  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 as const };

  const { data: prof } = await sb
    .from("profiles")
    .select("role, is_admin")
    .eq("id", userRes.user.id)
    .maybeSingle();

  // Admin = the canonical `is_admin` flag (what the /admin layout gates on) OR role='ADMIN'.
  const p = (prof as { role?: string; is_admin?: boolean } | null) ?? {};
  const isAdmin = p.is_admin === true || String(p.role ?? "").toUpperCase() === "ADMIN";
  if (!isAdmin) return { error: "Admin only", status: 403 as const };

  return { sb, uid: userRes.user.id };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin)
    return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const { data, error } = await admin.sb
    .from("profiles")
    .select("id, full_name, team_id")
    .eq("role", "COACH")
    .not("team_id", "is", null)
    .order("full_name", { ascending: true });

  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const coaches = (data ?? []).map((c) => ({
    id: c.id as string,
    full_name: (c.full_name as string | null) ?? "",
    team_id: c.team_id as string | null,
  }));

  return NextResponse.json({ ok: true, coaches });
}
