export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Titan Google-Sheet auto-sync (Path B).
 *
 *   GET  (cron)  — syncs EVERY team with a published Titan sheet configured in team_integrations.
 *                  Authorised by TITAN_CRON_SECRET / CRON_SECRET (Vercel cron Bearer, x-cron-secret,
 *                  or ?secret=).
 *   POST (coach) — "Sync now" for the coach's OWN team only (Bearer user token; coach/admin/staff).
 *
 * Fetches each team's published `_synced_data` CSV, parses + upserts into player_external_load_daily
 * (source="titan"), and records last_synced_at / status on team_integrations. Descriptive — never the
 * readiness colour. Deduped by (player_id, date, source), so a daily run just refreshes recent rows.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getTeamsWithTitanSheet,
  syncTitanTeamFromSheet,
  recordTitanSyncStatus,
  isAllowedTitanSheetUrl,
  type TitanSheetConfig,
} from "@/lib/integrations/titan/sheetSync";

function isAuthorizedCron(req: Request): boolean {
  // Accept EITHER a Titan-specific secret or the shared CRON_SECRET (Vercel cron sends the latter as
  // `Authorization: Bearer <CRON_SECRET>`). No secret configured → allow (dev).
  const accepted = [process.env.TITAN_CRON_SECRET, process.env.CRON_SECRET]
    .map((s) => (s ?? "").trim()).filter(Boolean);
  if (accepted.length === 0) return true;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const provided = bearer || req.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  return provided !== "" && accepted.includes(provided);
}

async function resolveCoachTeam(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const sb = getSupabaseServer();
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user?.id) return null;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return null;
  return (prof as { team_id?: string } | null)?.team_id ?? null;
}

async function runSync(configs: TitanSheetConfig[]) {
  const sb = getSupabaseAdmin();
  const results: Array<{ teamId: string; ok: boolean; stored?: number; unmatched?: number; error?: string }> = [];
  for (const cfg of configs) {
    try {
      const r = await syncTitanTeamFromSheet(sb, cfg.teamId, cfg.publishedCsvUrl);
      await recordTitanSyncStatus(sb, cfg.teamId, true, null);
      results.push({ teamId: cfg.teamId, ok: true, stored: r.sessionsStored, unmatched: r.unmatchedCount });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync failed";
      await recordTitanSyncStatus(sb, cfg.teamId, false, msg);
      results.push({ teamId: cfg.teamId, ok: false, error: msg });
    }
  }
  return results;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req) && !(await resolveCoachTeam(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const sb = getSupabaseAdmin();
  const configs = await getTeamsWithTitanSheet(sb);
  const results = await runSync(configs);
  return NextResponse.json({ ok: results.every((r) => r.ok), teams: configs.length, results });
}

export async function POST(req: Request) {
  // "Sync now" for the coach's own team.
  const teamId = await resolveCoachTeam(req);
  if (!teamId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("team_integrations")
    .select("provider_metadata, status")
    .eq("team_id", teamId).eq("provider", "titan").maybeSingle();
  const meta = (data as { provider_metadata?: Record<string, unknown> } | null)?.provider_metadata ?? null;
  const url = meta && typeof meta.publishedCsvUrl === "string" ? meta.publishedCsvUrl : null;
  if (!url || !isAllowedTitanSheetUrl(url)) {
    return NextResponse.json({ ok: false, error: "No published Titan sheet configured for this team." }, { status: 400 });
  }
  const [result] = await runSync([{ teamId, publishedCsvUrl: url }]);
  return NextResponse.json({ ok: result.ok, result });
}
