/**
 * /api/pt/reports
 *
 * Upload / list / delete a PT client's performance reports (VALD ForceDecks,
 * NordBord, ForceFrame, etc.). The file lives in the private `pt-reports`
 * bucket; this returns short-lived signed URLs. Both sides can use it:
 *   - a COACH uploads/reads/deletes for a client on their team (player_id)
 *   - a PLAYER uploads/reads/deletes their OWN reports (player_id is ignored)
 *
 *   GET    ?player_id=…           — list reports (coach) / own reports (player)
 *   POST   multipart              — { player_id?, file, title?, source?, report_date? }
 *   DELETE { id }                 — remove file + record
 */

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";


type Ctx = { sb: SupabaseClient; uid: string; isCoach: boolean; teamId: string | null; selfPlayerId: string | null };

async function authenticate(req: NextRequest): Promise<Ctx | { error: string; status: number }> {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 };
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id, player_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null; player_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  const isCoach = ["COACH", "ADMIN", "STAFF"].includes(role);
  // A player may also be resolved via players.user_id when no profile.player_id.
  let selfPlayerId = p.player_id ?? null;
  if (!isCoach && !selfPlayerId) {
    const { data: pl } = await sb.from("players").select("id").eq("user_id", uid).maybeSingle();
    selfPlayerId = (pl as { id?: string } | null)?.id ?? null;
  }
  return { sb, uid, isCoach, teamId: p.team_id ?? null, selfPlayerId };
}

/** Resolve + authorise the target player for this request. */
async function resolveTarget(ctx: Ctx, requestedPlayerId: string | null): Promise<{ playerId: string; teamId: string | null } | { error: string; status: number }> {
  if (ctx.isCoach) {
    if (!requestedPlayerId) return { error: "player_id required", status: 400 };
    const { data: pl } = await ctx.sb.from("players").select("id, team_id").eq("id", requestedPlayerId).maybeSingle();
    const row = pl as { id?: string; team_id?: string | null } | null;
    if (!row?.id) return { error: "Client not found", status: 404 };
    // Non-admin coaches: client must be on their team (or via coach_teams).
    if (ctx.teamId && row.team_id && row.team_id !== ctx.teamId) {
      const { data: ct } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", row.team_id).maybeSingle();
      if (!ct) return { error: "Forbidden", status: 403 };
    }
    return { playerId: row.id, teamId: row.team_id ?? null };
  }
  // Player — always their own, ignoring any requested id.
  if (!ctx.selfPlayerId) return { error: "Not a player account", status: 403 };
  return { playerId: ctx.selfPlayerId, teamId: ctx.teamId };
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const url = new URL(req.url);
  const target = await resolveTarget(ctx, url.searchParams.get("player_id"));
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: target.status });

  const { data, error } = await ctx.sb
    .from("pt_client_reports")
    .select("id, title, source, report_date, file_name, file_size, file_path, extracted, extracted_status, created_at")
    .eq("player_id", target.playerId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Short-lived signed URLs (private bucket).
  const reports = await Promise.all(((data ?? []) as Array<Record<string, unknown>>).map(async (r) => {
    const { data: signed } = await ctx.sb.storage.from("pt-reports").createSignedUrl(String(r.file_path), 3600);
    return { ...r, file_path: undefined, url: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ ok: true, reports });
}

export async function POST(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  const target = await resolveTarget(ctx, (form.get("player_id") as string) || null);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: target.status });

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const okType = file.type.includes("pdf") || file.type.startsWith("image/");
  if (!okType) return NextResponse.json({ error: "Only PDF or image files are allowed" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });

  const title = ((form.get("title") as string) || file.name).trim().slice(0, 200);
  const source = ((form.get("source") as string) || "vald").trim().slice(0, 40);
  const reportDateRaw = (form.get("report_date") as string) || "";
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(reportDateRaw) ? reportDateRaw : null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${target.playerId}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await ctx.sb.storage.from("pt-reports").upload(filePath, buffer, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: "Upload failed: " + upErr.message }, { status: 500 });

  const { data: rec, error: insErr } = await ctx.sb
    .from("pt_client_reports")
    .insert({
      player_id: target.playerId, team_id: target.teamId, uploaded_by: ctx.uid,
      title, source, report_date: reportDate,
      file_name: file.name, file_path: filePath, file_size: file.size, mime_type: file.type,
    })
    .select("id").single();
  if (insErr) {
    await ctx.sb.storage.from("pt-reports").remove([filePath]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: rec.id });
}

export async function DELETE(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: rec } = await ctx.sb.from("pt_client_reports").select("id, player_id, file_path").eq("id", id).maybeSingle();
  const row = rec as { id?: string; player_id?: string; file_path?: string } | null;
  if (!row?.id) return NextResponse.json({ error: "Not found", status: 404 }, { status: 404 });

  // Authorise: player owns it, or coach has access to the report's player.
  const target = await resolveTarget(ctx, row.player_id ?? null);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: target.status });
  if (target.playerId !== row.player_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (row.file_path) await ctx.sb.storage.from("pt-reports").remove([row.file_path]);
  const { error } = await ctx.sb.from("pt_client_reports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
