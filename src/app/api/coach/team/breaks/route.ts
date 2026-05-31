/**
 * /api/coach/team/breaks — declared team rest periods.
 *
 *   GET    [?team_id=]            → current + upcoming breaks for the team
 *   POST   { startDate, endDate, label?, teamId? } → declare a break
 *   DELETE ?id=…                  → remove a break
 *
 * Auth: coach/admin/staff. Non-admins may only manage their own team (or a
 * team they have coach_teams access to).
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getTeamReturnPhase } from "@/lib/notifications/teamBreaks";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

async function requireCoachTeam(req: Request, requestedTeamId?: string | null) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 } as const;

  const ownTeam = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  const teamId = requestedTeamId || ownTeam;
  if (!teamId) return { error: "No team context", status: 400 } as const;

  if (role !== "ADMIN" && teamId !== ownTeam) {
    const { data: ct } = await sb.from("coach_teams").select("team_id")
      .eq("coach_id", userId).eq("team_id", teamId).maybeSingle();
    if (!ct) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, userId, teamId } as const;
}

export async function GET(req: Request) {
  const teamId = new URL(req.url).searchParams.get("team_id");
  const a = await requireCoachTeam(req, teamId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await a.sb
    .from("team_breaks")
    .select("id, start_date, end_date, label")
    .eq("team_id", a.teamId)
    .gte("end_date", today)
    .order("start_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const returnPhase = await getTeamReturnPhase(a.sb, a.teamId, today);
  return NextResponse.json({ ok: true, breaks: data ?? [], returnPhase });
}

export async function POST(req: Request) {
  let body: { startDate?: string; endDate?: string; label?: string; teamId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const a = await requireCoachTeam(req, body.teamId ?? null);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const start = (body.startDate ?? "").slice(0, 10);
  const end = (body.endDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: "startDate and endDate (YYYY-MM-DD) required" }, { status: 400 });
  }
  if (end < start) return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });

  const { data, error } = await a.sb
    .from("team_breaks")
    .insert({ team_id: a.teamId, start_date: start, end_date: end, label: (body.label ?? "").trim() || null, created_by: a.userId })
    .select("id, start_date, end_date, label")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, break: data });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const a = await requireCoachTeam(req, null);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await a.sb.from("team_breaks").delete().eq("id", id).eq("team_id", a.teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
