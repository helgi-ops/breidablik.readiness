export const runtime = "nodejs";

/**
 * /api/coach/library/meetings/attachments — attach/detach drills, media, files or notes
 * on a meeting.
 *
 *   POST   { meeting_id, kind, drill_id?|media_id?|external_url?, note? }
 *   DELETE ?id=<attachment_id>
 *
 * Guarded by meeting access (RLS is the second gate). Content surface — no readiness.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

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

async function canAccessMeeting(ctx: Ctx, meetingId: string): Promise<boolean> {
  const { data: m } = await ctx.sb.from("coach_meetings").select("owner_type, owner_coach_id, team_id").eq("id", meetingId).maybeSingle();
  if (!m) return false;
  const mm = m as { owner_type: string; owner_coach_id: string | null; team_id: string | null };
  if (ctx.role === "ADMIN") return true;
  if (mm.owner_type === "coach") return mm.owner_coach_id === ctx.uid;
  if (mm.owner_type === "team" && mm.team_id) {
    if (ctx.teamId === mm.team_id) return true;
    const { data: ct } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", mm.team_id).maybeSingle();
    return !!ct;
  }
  return false;
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const meetingId = String(body?.meeting_id ?? "");
  const kind = String(body?.kind ?? "");
  if (!meetingId || !["drill", "media", "file", "note"].includes(kind)) return NextResponse.json({ ok: false, error: "meeting_id and a valid kind required" }, { status: 400 });
  if (!(await canAccessMeeting(ctx, meetingId))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const drillId = body?.drill_id ? String(body.drill_id) : null;
  const mediaId = body?.media_id ? String(body.media_id) : null;
  const externalUrl = body?.external_url ? String(body.external_url).trim() : null;
  const note = body?.note ? String(body.note) : null;
  if (kind === "drill" && !drillId) return NextResponse.json({ ok: false, error: "drill_id required" }, { status: 400 });
  if (kind === "media" && !mediaId) return NextResponse.json({ ok: false, error: "media_id required" }, { status: 400 });
  if (kind === "file" && !externalUrl) return NextResponse.json({ ok: false, error: "external_url required" }, { status: 400 });
  if (kind === "note" && !note) return NextResponse.json({ ok: false, error: "note required" }, { status: 400 });

  // Next position = current count.
  const { count } = await ctx.sb.from("coach_meeting_attachments").select("id", { count: "exact", head: true }).eq("meeting_id", meetingId);
  const { data, error } = await ctx.sb.from("coach_meeting_attachments").insert({
    meeting_id: meetingId, kind, drill_id: drillId, media_id: mediaId, external_url: externalUrl, note, position: count ?? 0,
  }).select("id, kind, drill_id, media_id, external_url, note, position").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, attachment: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const { data: att } = await ctx.sb.from("coach_meeting_attachments").select("meeting_id").eq("id", id).maybeSingle();
  if (!att) return NextResponse.json({ ok: true }); // already gone
  if (!(await canAccessMeeting(ctx, (att as { meeting_id: string }).meeting_id))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const { error } = await ctx.sb.from("coach_meeting_attachments").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
