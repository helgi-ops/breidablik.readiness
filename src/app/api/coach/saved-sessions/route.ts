export const runtime = "nodejs";

/**
 * /api/coach/saved-sessions
 *
 * GET  — list saved sessions for the team
 *        ?team_id=...
 * POST — save a new session
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";


async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing authentication", status: 401 };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 };

  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();

  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role))
    return { error: "Insufficient permissions", status: 403 };

  const primaryTeamId = prof?.team_id as string | null;
  if (!primaryTeamId) return { error: "Coach not linked to a team", status: 400 };

  if (!targetTeamId) return { userId, teamId: primaryTeamId, role };
  if (targetTeamId === primaryTeamId) return { userId, teamId: targetTeamId, role };

  const { data: coachRow } = await supabase
    .from("coach_teams")
    .select("team_id")
    .eq("coach_id", userId)
    .eq("team_id", targetTeamId)
    .maybeSingle();

  if (!coachRow) return { error: "No access to this team", status: 403 };
  return { userId, teamId: targetTeamId, role };
}

/* ── GET: list saved sessions ────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const teamId = req.nextUrl.searchParams.get("team_id");
    const auth = await getCoachTeam(req, teamId);
    if ("error" in auth)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("saved_sessions")
      .select(
        "id, session_name, md_day, target_pl, items, totals, created_by, created_at, updated_at, published_at, published_by, session_date, focus_points"
      )
      .eq("team_id", auth.teamId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, sessions: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/* ── POST: save a new session ────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const teamId = body.team_id as string | undefined;
    const auth = await getCoachTeam(req, teamId);
    if ("error" in auth)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const sessionName = (body.session_name ?? "").trim();
    const mdDay = (body.md_day ?? "").trim();
    const targetPl = body.target_pl != null ? Number(body.target_pl) : null;
    const items = body.items ?? [];
    const totals = body.totals ?? null;
    const sessionDate =
      typeof body.session_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.session_date)
        ? body.session_date
        : null;
    const focusPoints = Array.isArray(body.focus_points)
      ? body.focus_points.map((f: unknown) => String(f ?? "").trim()).filter(Boolean).slice(0, 8)
      : [];

    if (!Array.isArray(items) || items.length === 0)
      return NextResponse.json({ ok: false, error: "Session must have at least one drill" }, { status: 400 });

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("saved_sessions")
      .insert({
        team_id: auth.teamId,
        created_by: auth.userId,
        session_name: sessionName,
        md_day: mdDay,
        target_pl: targetPl,
        items,
        totals,
        session_date: sessionDate,
        focus_points: focusPoints,
      })
      .select("id, session_name, md_day, created_at, session_date, focus_points")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, session: data }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
