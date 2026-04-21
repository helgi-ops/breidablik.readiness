import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

type Profile = { role: string | null; team_id: string | null };

async function requireCoach(req: Request): Promise<{ userId: string; teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdmin();
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) throw new Error("Unauthorized");

  const { data: p, error: pe } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", u.user.id)
    .maybeSingle();
  if (pe) throw new Error(pe.message);
  const prof = p as Profile | null;
  const role = String(prof?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!prof?.team_id) throw new Error("No team context");
  return { userId: u.user.id, teamId: prof.team_id };
}

/**
 * GET /api/team-invites — list invite links for coach's team
 */
export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const sb = getAdmin();
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

    const sb = getAdmin();
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

    const sb = getAdmin();
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
