export const runtime = "nodejs";

/**
 * GET/PUT /api/integrations/titan/sheet — the coach's Titan Google-Sheet auto-sync config.
 *
 *   GET → { ok, publishedCsvUrl, lastSyncedAt, lastSyncStatus, lastSyncError }
 *   PUT { publishedCsvUrl } → saves (or clears, when empty) the published `_synced_data` CSV URL on
 *        team_integrations (provider='titan'). Only an https docs.google.com publish URL is accepted.
 *
 * Coach/staff only, own team. The daily-sync cron reads this to fetch + ingest. Descriptive — never
 * the readiness colour.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAllowedTitanSheetUrl } from "@/lib/integrations/titan/sheetSync";

async function coachTeam(req: Request): Promise<{ userId: string; teamId: string } | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const sb = getSupabaseServer();
  const { data: userRes } = await sb.auth.getUser(token);
  const userId = userRes?.user?.id;
  if (!userId) return null;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return null;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  return teamId ? { userId, teamId } : null;
}

export async function GET(req: Request) {
  const ctx = await coachTeam(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("team_integrations")
    .select("provider_metadata, last_synced_at, last_sync_status, last_sync_error")
    .eq("team_id", ctx.teamId).eq("provider", "titan").maybeSingle();
  const row = data as { provider_metadata?: Record<string, unknown>; last_synced_at?: string; last_sync_status?: string; last_sync_error?: string } | null;
  const url = row?.provider_metadata && typeof row.provider_metadata.publishedCsvUrl === "string" ? row.provider_metadata.publishedCsvUrl : null;
  return NextResponse.json({
    ok: true,
    publishedCsvUrl: url,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastSyncStatus: row?.last_sync_status ?? null,
    lastSyncError: row?.last_sync_error ?? null,
  });
}

export async function PUT(req: Request) {
  const ctx = await coachTeam(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw = typeof body?.publishedCsvUrl === "string" ? body.publishedCsvUrl.trim() : "";
  if (raw && !isAllowedTitanSheetUrl(raw)) {
    return NextResponse.json({ ok: false, error: "Must be an https docs.google.com published-CSV URL (Publish to web → _synced_data → CSV)." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: existing } = await sb
    .from("team_integrations")
    .select("id, provider_metadata")
    .eq("team_id", ctx.teamId).eq("provider", "titan").maybeSingle();

  const prevMeta = (existing as { provider_metadata?: Record<string, unknown> } | null)?.provider_metadata ?? {};
  const provider_metadata = { ...prevMeta, publishedCsvUrl: raw || null };
  const now = new Date().toISOString();

  if (existing && (existing as { id?: string }).id) {
    const { error } = await sb.from("team_integrations")
      .update({ provider_metadata, status: raw ? "connected" : "disabled", connected_by_user_id: ctx.userId, updated_at: now })
      .eq("id", (existing as { id: string }).id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    const { error } = await sb.from("team_integrations").insert({
      team_id: ctx.teamId, provider: "titan", status: raw ? "connected" : "disabled",
      provider_metadata, connected_by_user_id: ctx.userId, created_at: now, updated_at: now,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, publishedCsvUrl: raw || null });
}
