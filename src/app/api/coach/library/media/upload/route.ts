export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/coach/library/media/upload — multipart upload into the PRIVATE
 * coach-library-media bucket, then a coach_media row pointing at the object.
 *
 * Upload is the one line that grows the cloud bill, so it is opt-in: the UI defaults
 * to add-by-link (YouTube/Vimeo) and only calls this when a coach chooses to upload.
 * Player-identifiable video = minors → private bucket + signed URLs only. Size-capped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { COACH_LIBRARY_BUCKET, resolveMediaRows, type CoachMediaRow, type MediaKind, type MediaOwnerType } from "@/lib/micropulse/library/media";

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB — prefer links for anything larger
const ALLOWED = /^(video\/|image\/|application\/pdf$)/;

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

function kindForType(type: string): MediaKind {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "doc";
  return "video";
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Expected multipart form" }, { status: 400 });
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "File too large (max 200 MB) — use a YouTube/Vimeo link instead" }, { status: 413 });
  const type = file.type || "application/octet-stream";
  if (!ALLOWED.test(type)) return NextResponse.json({ ok: false, error: "Only video, image or PDF" }, { status: 415 });

  // Ownership (team-owned by default when a team context exists).
  const ownerType = (String(form.get("owner_type") ?? "") as MediaOwnerType) || "team";
  const teamId = form.get("team_id") ? String(form.get("team_id")) : ctx.teamId;
  let owner: { owner_type: MediaOwnerType; owner_coach_id: string | null; team_id: string | null };
  let pathPrefix: string;
  if (ownerType === "team" && teamId) {
    if (!(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    owner = { owner_type: "team", owner_coach_id: null, team_id: teamId };
    pathPrefix = `team/${teamId}`;
  } else {
    owner = { owner_type: "coach", owner_coach_id: ctx.uid, team_id: null };
    pathPrefix = `coach/${ctx.uid}`;
  }

  const safeName = (file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `${pathPrefix}/${crypto.randomUUID()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await ctx.sb.storage.from(COACH_LIBRARY_BUCKET).upload(path, buf, { contentType: type, upsert: false });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  const tags = String(form.get("tags") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const { data, error } = await ctx.sb.from("coach_media").insert({
    ...owner, title, kind: kindForType(type), external_url: null, storage_path: path,
    tags, drill_id: form.get("drill_id") ? String(form.get("drill_id")) : null,
    note: form.get("note") ? String(form.get("note")) : null, created_by: ctx.uid,
  }).select("id, owner_type, owner_coach_id, team_id, title, kind, external_url, storage_path, tags, drill_id, note, created_at").single();
  if (error) {
    await ctx.sb.storage.from(COACH_LIBRARY_BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const [media] = await resolveMediaRows(ctx.sb, [data as CoachMediaRow]);
  return NextResponse.json({ ok: true, media });
}
