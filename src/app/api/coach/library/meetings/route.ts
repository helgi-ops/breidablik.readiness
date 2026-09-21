export const runtime = "nodejs";

/**
 * /api/coach/library/meetings — the Coaching Library meetings view.
 *
 *   GET   ?team_id=            → { ok, meetings: [...] }  (list, newest first)
 *   GET   ?id=                 → { ok, meeting, attachments }  (detail; media signed)
 *   POST  { team_id?, owner_type?, title, meeting_date, meeting_type?, agenda?, minutes?, attendees? }
 *   PATCH { id, ...fields } | { id, deleted:true }
 *
 * Coach-auth; access checked in code (mirrors the movement-screen route). RLS is the
 * second gate. Content surface — never the readiness colour or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { resolveMediaRows, type CoachMediaRow } from "@/lib/micropulse/library/media";

type Ctx = { sb: ReturnType<typeof getSupabaseServer>; uid: string; teamId: string | null; role: string };

async function requireCoach(req: NextRequest): Promise<Ctx | { error: string; status: number }> {
  const sb = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const tk = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!tk) return { error: "Missing auth", status: 401 };
  const { data: userRes } = await sb.auth.getUser(tk);
  if (!userRes?.user) return { error: "Invalid token", status: 401 };
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 };
  return { sb, uid, teamId: p.team_id ?? null, role };
}

async function coachCanAccessTeam(ctx: Ctx, teamId: string): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  if (ctx.teamId && ctx.teamId === teamId) return true;
  const { data: ct } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", teamId).maybeSingle();
  return !!ct;
}

const MEETING_COLS = "id, owner_type, owner_coach_id, team_id, title, meeting_date, meeting_type, agenda, minutes, attendees, created_at, updated_at";

/** True if this coach may see/edit the given meeting (coach-owned by me, or team I coach). */
async function canAccessMeeting(ctx: Ctx, m: { owner_type: string; owner_coach_id: string | null; team_id: string | null }): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  if (m.owner_type === "coach") return m.owner_coach_id === ctx.uid;
  if (m.owner_type === "team" && m.team_id) return coachCanAccessTeam(ctx, m.team_id);
  return false;
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const { data: m } = await ctx.sb.from("coach_meetings").select(MEETING_COLS).eq("id", id).is("deleted_at", null).maybeSingle();
    if (!m) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (!(await canAccessMeeting(ctx, m as { owner_type: string; owner_coach_id: string | null; team_id: string | null }))) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const { data: atts } = await ctx.sb
      .from("coach_meeting_attachments")
      .select("id, kind, drill_id, media_id, external_url, note, position")
      .eq("meeting_id", id).order("position", { ascending: true });
    const rows = (atts ?? []) as Array<{ id: string; kind: string; drill_id: string | null; media_id: string | null; external_url: string | null; note: string | null; position: number }>;

    // Resolve drill names + media (signed URLs) for display.
    const drillIds = rows.filter((r) => r.drill_id).map((r) => r.drill_id as string);
    const mediaIds = rows.filter((r) => r.media_id).map((r) => r.media_id as string);
    const [{ data: drillRows }, { data: mediaRows }] = await Promise.all([
      drillIds.length ? ctx.sb.from("drill_library").select("id, drill_name").in("id", drillIds) : Promise.resolve({ data: [] }),
      mediaIds.length ? ctx.sb.from("coach_media").select("id, owner_type, owner_coach_id, team_id, title, kind, external_url, storage_path, tags, drill_id, note, created_at").in("id", mediaIds).is("deleted_at", null) : Promise.resolve({ data: [] }),
    ]);
    const drillName = new Map(((drillRows ?? []) as Array<{ id: string; drill_name: string }>).map((d) => [d.id, d.drill_name]));
    const resolvedMedia = await resolveMediaRows(ctx.sb, (mediaRows ?? []) as CoachMediaRow[]);
    const mediaById = new Map(resolvedMedia.map((x) => [x.id, x]));
    const attachments = rows.map((r) => ({
      ...r,
      drill_name: r.drill_id ? drillName.get(r.drill_id) ?? null : null,
      media: r.media_id ? mediaById.get(r.media_id) ?? null : null,
    }));
    return NextResponse.json({ ok: true, meeting: m, attachments });
  }

  const teamId = url.searchParams.get("team_id");
  const ors = [`and(owner_type.eq.coach,owner_coach_id.eq.${ctx.uid})`];
  const teamIds: string[] = [];
  if (teamId) { if (await coachCanAccessTeam(ctx, teamId)) teamIds.push(teamId); }
  else {
    const { data: cts } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid);
    for (const r of (cts ?? []) as Array<{ team_id: string }>) teamIds.push(r.team_id);
    if (ctx.teamId && !teamIds.includes(ctx.teamId)) teamIds.push(ctx.teamId);
  }
  if (teamIds.length) ors.push(`and(owner_type.eq.team,team_id.in.(${teamIds.join(",")}))`);
  const { data } = await ctx.sb.from("coach_meetings").select(MEETING_COLS).is("deleted_at", null).or(ors.join(",")).order("meeting_date", { ascending: false }).limit(300);
  return NextResponse.json({ ok: true, meetings: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  const meetingDate = String(body?.meeting_date ?? "").trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) return NextResponse.json({ ok: false, error: "Title and a valid date are required" }, { status: 400 });
  const mt = body?.meeting_type ? String(body.meeting_type) : null;
  if (mt && !["staff", "team", "1to1", "video-review", "other"].includes(mt)) return NextResponse.json({ ok: false, error: "Invalid meeting_type" }, { status: 400 });

  const ownerType = String(body?.owner_type ?? "") || "team";
  const teamId = body?.team_id ? String(body.team_id) : ctx.teamId;
  let owner: { owner_type: string; owner_coach_id: string | null; team_id: string | null };
  if (ownerType === "team" && teamId) {
    if (!(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    owner = { owner_type: "team", owner_coach_id: null, team_id: teamId };
  } else {
    owner = { owner_type: "coach", owner_coach_id: ctx.uid, team_id: null };
  }
  const { data, error } = await ctx.sb.from("coach_meetings").insert({
    ...owner, title, meeting_date: meetingDate, meeting_type: mt,
    agenda: body?.agenda ? String(body.agenda) : null, minutes: body?.minutes ? String(body.minutes) : null,
    attendees: body?.attendees ? String(body.attendees) : null, created_by: ctx.uid,
  }).select(MEETING_COLS).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, meeting: data });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  // Guard: only a coach who can access the meeting may change it (RLS is the second gate).
  const { data: m } = await ctx.sb.from("coach_meetings").select("owner_type, owner_coach_id, team_id").eq("id", id).maybeSingle();
  if (!m || !(await canAccessMeeting(ctx, m as { owner_type: string; owner_coach_id: string | null; team_id: string | null }))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (body?.deleted === true) {
    const { error } = await ctx.sb.from("coach_meetings").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "meeting_date", "meeting_type", "agenda", "minutes", "attendees"] as const) {
    if (k in body) patch[k] = body[k] === "" ? null : body[k];
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  const { error } = await ctx.sb.from("coach_meetings").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
