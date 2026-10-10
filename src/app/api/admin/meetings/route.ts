export const runtime = "nodejs";

/**
 * POST /api/admin/meetings — an ADMIN creates a meeting (document) INSIDE another
 * coach's library (or that coach's team library), landing under "Meetings".
 * Mirrors the insert shape of the coach POST (/api/coach/library/meetings), but the
 * owner is the TARGET coach, not the caller; created_by is the admin.
 *
 * Strictly ADMIN-gated (403 for non-admin / missing token). Uses the service-role
 * server client (bypasses RLS) like the other admin routes.
 *
 * An optional document is attached server-side (so we don't depend on the coach
 * attachments route's own auth): a media_id (an already-uploaded doc/video) →
 * kind:'media'; else an external_url (a link) → kind:'file'. Content surface —
 * never the readiness colour or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

const MEETING_TYPES = ["staff", "team", "1to1", "video-review", "other"] as const;

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

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin)
    return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
  const { sb, uid } = admin;

  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const targetCoachId = String(body.target_coach_id ?? "").trim();
  if (!targetCoachId)
    return NextResponse.json({ ok: false, error: "target_coach_id vantar" }, { status: 400 });

  const title = String(body.title ?? "").trim();
  if (!title)
    return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

  const meetingDate = String(body.meeting_date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate))
    return NextResponse.json({ ok: false, error: "A valid date (YYYY-MM-DD) is required" }, { status: 400 });

  const mt = body.meeting_type ? String(body.meeting_type) : null;
  if (mt && !(MEETING_TYPES as readonly string[]).includes(mt))
    return NextResponse.json({ ok: false, error: "Invalid meeting_type" }, { status: 400 });

  // Resolve the target coach → their team (the target team).
  const { data: targetProf } = await sb
    .from("profiles")
    .select("id, team_id")
    .eq("id", targetCoachId)
    .maybeSingle();
  const target = targetProf as { id?: string; team_id?: string | null } | null;
  if (!target?.id)
    return NextResponse.json({ ok: false, error: "Target coach not found" }, { status: 404 });

  // owner_scope: 'coach' (default — the coach's personal library) or 'team'.
  const owner_scope = body.owner_scope === "team" ? "team" : "coach";
  let owner: { owner_type: string; owner_coach_id: string | null; team_id: string | null };
  if (owner_scope === "team") {
    const targetTeamId = target.team_id ?? null;
    if (!targetTeamId)
      return NextResponse.json({ ok: false, error: "Target coach has no team" }, { status: 400 });
    owner = { owner_type: "team", owner_coach_id: null, team_id: targetTeamId };
  } else {
    owner = { owner_type: "coach", owner_coach_id: targetCoachId, team_id: null };
  }

  const { data: meeting, error } = await sb
    .from("coach_meetings")
    .insert({
      ...owner,
      title,
      meeting_date: meetingDate,
      meeting_type: mt,
      agenda: body.agenda ? String(body.agenda) : null,
      minutes: null,
      attendees: null,
      created_by: uid,
    })
    .select("id, owner_type, owner_coach_id, team_id, title, meeting_date, meeting_type, agenda, minutes, attendees, created_at, updated_at")
    .single();
  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const meetingId = (meeting as { id: string }).id;

  // Attach the document server-side (media wins over link when both are given).
  const mediaId = body.media_id ? String(body.media_id).trim() : "";
  const externalUrl = body.external_url ? String(body.external_url).trim() : "";
  if (mediaId) {
    const { error: attErr } = await sb
      .from("coach_meeting_attachments")
      .insert({ meeting_id: meetingId, kind: "media", media_id: mediaId, position: 0 });
    if (attErr)
      return NextResponse.json({ ok: false, error: attErr.message }, { status: 500 });
  } else if (externalUrl) {
    const { error: attErr } = await sb
      .from("coach_meeting_attachments")
      .insert({ meeting_id: meetingId, kind: "file", external_url: externalUrl, position: 0 });
    if (attErr)
      return NextResponse.json({ ok: false, error: attErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, meeting }, { status: 201 });
}
