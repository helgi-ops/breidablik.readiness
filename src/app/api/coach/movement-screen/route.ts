/**
 * Movement screens (coach / medical staff only). A screen attaches an
 * Onform-style video (uploaded to the PRIVATE `movement-screen-videos` bucket) or
 * its exported angles / external URL to a player + date + test, records findings,
 * and stores the interpreted readings (finding → corrective/strength lever, with
 * confidence + RTP/red-flag routing).
 *
 * Screening/training only — never a diagnosis, never the readiness colour. Video
 * is consent- and access-gated (team-scoped; active data_processing consent).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMovementTest, loadPlayerMovementScreens } from "@/lib/micropulse/movementScreen/loader";
import { interpretScreen, type ScreenContext, type ScreenFinding } from "@/lib/micropulse/movementScreen/interpret";

export const runtime = "nodejs";

type Ctx = { sb: SupabaseClient; uid: string; teamId: string | null; role: string };

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

/** Active data_processing consent gate (mirrors the consent-status read). */
async function hasActiveConsent(ctx: Ctx, playerId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data } = await ctx.sb
    .from("player_consents")
    .select("id")
    .eq("player_id", playerId)
    .eq("consent_type", "data_processing")
    .is("revoked_at", null)
    .or(`valid_to.is.null,valid_to.gt.${nowIso}`)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const url = new URL(req.url);
  const playerId = url.searchParams.get("player_id");
  const teamId = url.searchParams.get("team_id") ?? ctx.teamId;
  if (!teamId) return NextResponse.json({ error: "No team context" }, { status: 400 });
  if (!(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (playerId) {
    const screens = await loadPlayerMovementScreens(ctx.sb, playerId);
    return NextResponse.json({ ok: true, screens });
  }
  // Team-wide recent screens (no signed URLs in the list view).
  const { data } = await ctx.sb
    .from("movement_screens")
    .select("id, player_id, player_name_raw, test_slug, screen_date, confidence, red_flag, rtp_flag, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ ok: true, screens: data ?? [] });
}

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  const teamId = String(form.get("team_id") ?? ctx.teamId ?? "");
  if (!teamId) return NextResponse.json({ error: "No team context" }, { status: 400 });
  if (!(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const playerId = (form.get("player_id") as string | null) || null;
  const playerNameRaw = (form.get("player_name_raw") as string | null) || null;
  const testSlug = String(form.get("test_slug") ?? "");
  const screenDate = String(form.get("screen_date") ?? "");
  const videoUrl = (form.get("video_url") as string | null) || null;
  if (!testSlug || !/^\d{4}-\d{2}-\d{2}$/.test(screenDate)) {
    return NextResponse.json({ error: "test_slug and a valid screen_date are required" }, { status: 400 });
  }

  const test = getMovementTest(testSlug);
  if (!test) return NextResponse.json({ error: `Unknown test: ${testSlug}` }, { status: 400 });

  // Consent gate: a linked player must have active data_processing consent before
  // we store PHI-adjacent likeness data.
  if (playerId && !(await hasActiveConsent(ctx, playerId))) {
    return NextResponse.json(
      { error: "Player consent (data_processing) is required before storing a movement screen for this player." },
      { status: 403 },
    );
  }

  let findings: ScreenFinding[] = [];
  let context: ScreenContext = {};
  let anglesJson: unknown = null;
  try {
    findings = JSON.parse(String(form.get("findings") ?? "[]")) as ScreenFinding[];
    context = JSON.parse(String(form.get("context") ?? "{}")) as ScreenContext;
    const aj = form.get("angles_json") as string | null;
    anglesJson = aj ? JSON.parse(aj) : null;
  } catch {
    return NextResponse.json({ error: "findings / context / angles_json must be valid JSON" }, { status: 400 });
  }

  const result = interpretScreen(test, findings, context);

  // Optional video upload(s) → private bucket. A coach can attach one clip per
  // viewpoint (front / side / back); `views` is a parallel array of view tags.
  // Uploaded videos are rolled back if the row insert fails.
  let filePath: string | null = null;
  let fileName: string | null = null;
  const videos: Array<{ path: string; name: string; view: string | null }> = [];
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  let views: unknown[] = [];
  try { views = JSON.parse(String(form.get("views") ?? "[]")); } catch { views = []; }
  const ALLOWED_VIEWS = new Set(["front", "side", "back"]);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.size > MAX_VIDEO_BYTES) {
      if (videos.length) await ctx.sb.storage.from("movement-screen-videos").remove(videos.map((v) => v.path)).catch(() => {});
      return NextResponse.json({ error: "Video exceeds 100 MB" }, { status: 400 });
    }
    const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "screen.mp4";
    const path = `${teamId}/${crypto.randomUUID()}-${safe}`;
    const buf = Buffer.from(await f.arrayBuffer());
    const { error: upErr } = await ctx.sb.storage.from("movement-screen-videos").upload(path, buf, { contentType: f.type || "video/mp4", upsert: false });
    if (upErr) {
      if (videos.length) await ctx.sb.storage.from("movement-screen-videos").remove(videos.map((v) => v.path)).catch(() => {});
      return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
    }
    const rawView = typeof views[i] === "string" ? String(views[i]) : null;
    videos.push({ path, name: safe, view: rawView && ALLOWED_VIEWS.has(rawView) ? rawView : null });
  }
  if (videos.length) { filePath = videos[0].path; fileName = videos[0].name; }

  const { data: inserted, error: insErr } = await ctx.sb
    .from("movement_screens")
    .insert({
      team_id: teamId,
      player_id: playerId,
      player_name_raw: playerNameRaw,
      test_slug: testSlug,
      screen_date: screenDate,
      file_path: filePath,
      file_name: fileName,
      videos,
      video_url: videoUrl,
      angles_json: anglesJson,
      findings,
      context,
      result,
      confidence: result.confidence,
      red_flag: result.redFlag,
      rtp_flag: result.rtpFlag,
      created_by: ctx.uid,
    })
    .select("id")
    .single();

  if (insErr) {
    if (videos.length) await ctx.sb.storage.from("movement-screen-videos").remove(videos.map((v) => v.path)).catch(() => {});
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id ?? null, result });
}
