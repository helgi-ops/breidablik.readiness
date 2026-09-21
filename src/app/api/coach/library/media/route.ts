export const runtime = "nodejs";

/**
 * /api/coach/library/media — the Coaching Library video/media view.
 *
 *   GET   ?team_id=&drill_id=  → { ok, media: ResolvedMedia[] }  (signed URLs for uploads)
 *   POST  { team_id?, owner_type?, title, kind, external_url?, storage_path?, tags?, drill_id?, note? }
 *   PATCH { id, ...fields }     → edit; { id, deleted:true } → soft-delete
 *
 * Coach-auth; access checked in code (mirrors the movement-screen route). RLS on the
 * table is the second gate. Content surface — never the readiness colour or decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { resolveMediaRows, type CoachMediaRow, type MediaKind, type MediaOwnerType } from "@/lib/micropulse/library/media";

type Ctx = { sb: ReturnType<typeof getSupabaseServer>; uid: string; teamId: string | null; role: string };

async function requireCoach(req: NextRequest): Promise<Ctx | { error: string; status: number }> {
  const sb = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes } = await sb.auth.getUser(token);
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

const MEDIA_COLS = "id, owner_type, owner_coach_id, team_id, title, kind, external_url, storage_path, tags, drill_id, note, created_at";

/** The rows this coach may see: his own coach-owned + team-owned for teams he coaches. */
async function loadVisible(ctx: Ctx, teamId: string | null, drillId: string | null): Promise<CoachMediaRow[]> {
  const teamIds: string[] = [];
  if (teamId) { if (await coachCanAccessTeam(ctx, teamId)) teamIds.push(teamId); }
  else {
    const { data: cts } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid);
    for (const r of (cts ?? []) as Array<{ team_id: string }>) teamIds.push(r.team_id);
    if (ctx.teamId && !teamIds.includes(ctx.teamId)) teamIds.push(ctx.teamId);
  }
  let q = ctx.sb.from("coach_media").select(MEDIA_COLS).is("deleted_at", null).order("created_at", { ascending: false });
  // coach-owned by me OR team-owned for my teams
  const ors = [`and(owner_type.eq.coach,owner_coach_id.eq.${ctx.uid})`];
  if (teamIds.length) ors.push(`and(owner_type.eq.team,team_id.in.(${teamIds.join(",")}))`);
  q = q.or(ors.join(","));
  if (drillId) q = q.eq("drill_id", drillId);
  const { data } = await q.limit(500);
  return (data ?? []) as CoachMediaRow[];
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const url = new URL(req.url);
  const teamId = url.searchParams.get("team_id");
  const drillId = url.searchParams.get("drill_id");
  const rows = await loadVisible(ctx, teamId, drillId);
  const media = await resolveMediaRows(ctx.sb, rows);
  return NextResponse.json({ ok: true, media });
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  const kind = String(body?.kind ?? "video") as MediaKind;
  const externalUrl = body?.external_url ? String(body.external_url).trim() : null;
  const storagePath = body?.storage_path ? String(body.storage_path).trim() : null;
  if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
  if (!externalUrl && !storagePath) return NextResponse.json({ ok: false, error: "A link or an uploaded file is required" }, { status: 400 });
  if (!["video", "image", "doc"].includes(kind)) return NextResponse.json({ ok: false, error: "Invalid kind" }, { status: 400 });

  // Default to team-owned (shared with staff) when a team context exists; else coach-owned.
  const ownerType = (String(body?.owner_type ?? "") as MediaOwnerType) || "team";
  const teamId = body?.team_id ? String(body.team_id) : ctx.teamId;
  let owner: { owner_type: MediaOwnerType; owner_coach_id: string | null; team_id: string | null };
  if (ownerType === "team" && teamId) {
    if (!(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    owner = { owner_type: "team", owner_coach_id: null, team_id: teamId };
  } else {
    owner = { owner_type: "coach", owner_coach_id: ctx.uid, team_id: null };
  }

  const tags = Array.isArray(body?.tags) ? (body.tags as unknown[]).map((x) => String(x).trim()).filter(Boolean) : [];
  const { data, error } = await ctx.sb.from("coach_media").insert({
    ...owner, title, kind, external_url: externalUrl, storage_path: storagePath,
    tags, drill_id: body?.drill_id ? String(body.drill_id) : null, note: body?.note ? String(body.note) : null,
    created_by: ctx.uid,
  }).select(MEDIA_COLS).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const [media] = await resolveMediaRows(ctx.sb, [data as CoachMediaRow]);
  return NextResponse.json({ ok: true, media });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  if (body?.deleted === true) {
    const { error } = await ctx.sb.from("coach_media").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body?.title === "string") patch.title = body.title.trim();
  if (typeof body?.note === "string") patch.note = body.note;
  if (Array.isArray(body?.tags)) patch.tags = (body.tags as unknown[]).map((x) => String(x).trim()).filter(Boolean);
  if ("drill_id" in body) patch.drill_id = body.drill_id ? String(body.drill_id) : null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  const { error } = await ctx.sb.from("coach_media").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
