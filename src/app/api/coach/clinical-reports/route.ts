/**
 * Clinical / physio report uploads (coach / medical staff only). Stores the PDF
 * in the PRIVATE `clinical-reports` bucket and creates a `clinical_reports` row.
 * Health data — team-scoped; a report can be uploaded before the player exists
 * (player_id null + player_name_raw), to auto-link on player creation.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Verify the coach may act on `teamId` (their profile team or a coach_teams row). */
async function coachCanAccessTeam(ctx: Ctx, teamId: string): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  if (ctx.teamId && ctx.teamId === teamId) return true;
  const { data: ct } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", teamId).maybeSingle();
  return !!ct;
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const url = new URL(req.url);
  const playerId = url.searchParams.get("player_id");
  const teamId = url.searchParams.get("team_id") ?? ctx.teamId;
  if (!teamId) return NextResponse.json({ error: "No team context" }, { status: 400 });
  if (!(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let q = ctx.sb
    .from("clinical_reports")
    .select("id, player_id, player_name_raw, report_date, clinician_name, clinician_licence, clinic, file_name, file_path, extracted_json, status, confirmed_by, confirmed_at, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  if (playerId) q = q.eq("player_id", playerId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reports = await Promise.all(((data ?? []) as Array<Record<string, unknown>>).map(async (r) => {
    const { data: signed } = await ctx.sb.storage.from("clinical-reports").createSignedUrl(String(r.file_path), 3600);
    return { ...r, file_path: undefined, url: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ ok: true, reports });
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.type && !file.type.includes("pdf")) return NextResponse.json({ error: "PDF only" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 400 });

  const requestedPlayerId = (form.get("player_id") as string | null)?.trim() || null;
  const playerNameRaw = (form.get("player_name_raw") as string | null)?.trim() || null;
  const reportDate = (form.get("report_date") as string | null)?.trim() || null;

  // Resolve the team: from the player (if linked) else the posted team_id / the coach's team.
  let teamId: string | null = null;
  let playerId: string | null = null;
  if (requestedPlayerId) {
    const { data: pl } = await ctx.sb.from("players").select("id, team_id, full_name").eq("id", requestedPlayerId).maybeSingle();
    const row = pl as { id?: string; team_id?: string | null; full_name?: string | null } | null;
    if (!row?.id) return NextResponse.json({ error: "Player not found" }, { status: 404 });
    playerId = row.id;
    teamId = row.team_id ?? null;
  } else {
    teamId = (form.get("team_id") as string | null)?.trim() || ctx.teamId;
    if (!playerNameRaw) return NextResponse.json({ error: "player_name_raw required when no player_id (upload-before-player)" }, { status: 400 });
  }
  if (!teamId) return NextResponse.json({ error: "No team context" }, { status: 400 });
  if (!(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "report.pdf";
  const filePath = `${teamId}/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await ctx.sb.storage.from("clinical-reports").upload(filePath, buffer, { contentType: file.type || "application/pdf", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: rec, error: insErr } = await ctx.sb
    .from("clinical_reports")
    .insert({
      team_id: teamId,
      player_id: playerId,
      player_name_raw: playerNameRaw,
      report_date: reportDate || null,
      file_path: filePath,
      file_name: file.name,
      status: "uploaded",
      uploaded_by: ctx.uid,
    })
    .select("id, status")
    .single();
  if (insErr) {
    await ctx.sb.storage.from("clinical-reports").remove([filePath]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: rec.id, status: rec.status });
}
