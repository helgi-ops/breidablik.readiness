/**
 * GET /api/coach/team/ima-presence
 *   → { ok, hasIma } — does the coach's team produce IMA-clock data (Vector Pro/S7)?
 *
 * Server-side (admin) count of player_external_load_daily.ima_clock_gen2 non-null in the
 * last 90 days for the team. Used by /coach/power-curve-intelligence to hide the IMA-clock
 * cards for Core/Lite clubs (no IMA) instead of showing them empty. Must be server-side:
 * this table is read via admin everywhere; a client count under RLS is unreliable (it
 * false-returned 0 for a Pro club with 1000+ IMA rows). Descriptive; never the colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: true, hasIma: false });

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { count } = await sb
    .from("player_external_load_daily")
    .select("player_id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .not("ima_clock_gen2", "is", null)
    .gte("date", since);

  return NextResponse.json({ ok: true, hasIma: (count ?? 0) > 0 });
}
