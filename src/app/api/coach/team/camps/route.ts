/**
 * /api/coach/team/camps — declared TRAINING CAMPS (æfingaferð): concentrated-load periods (the opposite of
 * a team_break). During a camp the macro/meso bump each training day's load by `loadPct` and, when
 * `twoADay`, turn rest days into extra sessions.
 *
 *   GET    [?team_id=]                                        → upcoming camps for the team
 *   POST   { startDate, endDate, label?, loadPct?, twoADay?, teamId? } → declare a camp
 *   PATCH  { id, startDate?, endDate?, label?, loadPct?, twoADay? }    → edit a camp
 *   DELETE ?id=…                                              → remove a camp
 *
 * Auth: coach/admin/staff. Non-admins may only manage their own team (or a team they have coach_teams access to).
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

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
    const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", teamId).maybeSingle();
    if (!ct) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, userId, teamId } as const;
}

const clampPct = (v: unknown): number => Math.max(0, Math.min(60, Math.round(Number(v) || 0)));
const SEL = "id, start_date, end_date, label, load_pct, two_a_day";

export async function GET(req: Request) {
  const teamId = new URL(req.url).searchParams.get("team_id");
  const a = await requireCoachTeam(req, teamId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await a.sb
    .from("team_camps").select(SEL).eq("team_id", a.teamId).gte("end_date", today)
    .order("start_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, camps: data ?? [] });
}

export async function POST(req: Request) {
  let body: { startDate?: string; endDate?: string; label?: string; loadPct?: number; twoADay?: boolean; teamId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const a = await requireCoachTeam(req, body.teamId ?? null);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const start = (body.startDate ?? "").slice(0, 10), end = (body.endDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: "startDate and endDate (YYYY-MM-DD) required" }, { status: 400 });
  }
  if (end < start) return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
  const { data, error } = await a.sb
    .from("team_camps")
    .insert({ team_id: a.teamId, start_date: start, end_date: end, label: (body.label ?? "").trim() || null, load_pct: clampPct(body.loadPct ?? 15), two_a_day: !!body.twoADay, created_by: a.userId })
    .select(SEL).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, camp: data });
}

export async function PATCH(req: Request) {
  let body: { id?: string; startDate?: string; endDate?: string; label?: string; loadPct?: number; twoADay?: boolean; teamId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const a = await requireCoachTeam(req, body.teamId ?? null);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.startDate && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate.slice(0, 10))) patch.start_date = body.startDate.slice(0, 10);
  if (body.endDate && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate.slice(0, 10))) patch.end_date = body.endDate.slice(0, 10);
  if (body.label !== undefined) patch.label = (body.label ?? "").trim() || null;
  if (body.loadPct !== undefined) patch.load_pct = clampPct(body.loadPct);
  if (body.twoADay !== undefined) patch.two_a_day = !!body.twoADay;
  if (patch.start_date && patch.end_date && (patch.end_date as string) < (patch.start_date as string)) {
    return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const { data, error } = await a.sb.from("team_camps").update(patch).eq("id", body.id).eq("team_id", a.teamId).select(SEL).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, camp: data });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const a = await requireCoachTeam(req, null);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await a.sb.from("team_camps").delete().eq("id", id).eq("team_id", a.teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
