/**
 * GET /api/coach/movement-tests — the movement-test registry for the coach's
 * team (global library + any team-scoped custom tests), hydrated to full
 * definitions. Coach/staff only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { loadMovementTests } from "@/lib/micropulse/movementScreen/loader";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  if (!["COACH", "ADMIN", "STAFF"].includes(String(p.role ?? "").toUpperCase())) {
    return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  }
  const teamId = new URL(req.url).searchParams.get("team_id") ?? p.team_id ?? "";
  const tests = await loadMovementTests(sb, teamId);
  return NextResponse.json({ ok: true, tests });
}
