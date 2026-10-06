import "server-only";

/**
 * Titan Google-Sheet auto-sync (Path B). The Titan workbook publishes its `_synced_data` tab to the
 * web as CSV (File → Share → Publish to web → that tab → CSV) — a read-only, no-auth URL. We fetch it
 * on a daily cron, parse it with the same parser the upload page uses, and upsert into
 * player_external_load_daily with source="titan" via the shared ingest helper.
 *
 * SSRF guard: only https URLs on docs.google.com are fetched — the published-CSV host — so a stored
 * URL can never point the server at an internal or arbitrary host. Descriptive; never the colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTitanCsv } from "./parseSyncedData";
import { ingestTitanRows, type TitanIngestResult } from "./ingestServer";
import { isAllowedTitanSheetUrl } from "./sheetUrl";

export { isAllowedTitanSheetUrl };

/** Fetch the published CSV text. Throws on a disallowed URL or a non-200 response. */
export async function fetchPublishedTitanCsv(url: string): Promise<string> {
  if (!isAllowedTitanSheetUrl(url)) {
    throw new Error("Not an allowed Google published-CSV URL (must be an https docs.google.com publish link).");
  }
  const res = await fetch(url, { redirect: "follow", headers: { accept: "text/csv,text/plain,*/*" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  // A sheet that isn't actually published returns an HTML sign-in page, not CSV — detect that.
  if (/^\s*<(?:!doctype|html)/i.test(text)) {
    throw new Error("The URL returned HTML, not CSV — make sure the _synced_data tab is Published to web as CSV.");
  }
  return text;
}

/** Fetch + parse + ingest one team's published Titan sheet. */
export async function syncTitanTeamFromSheet(sb: SupabaseClient, teamId: string, publishedCsvUrl: string): Promise<TitanIngestResult> {
  const csv = await fetchPublishedTitanCsv(publishedCsvUrl);
  const { rows } = parseTitanCsv(csv);
  return ingestTitanRows(sb, teamId, rows);
}

export interface TitanSheetConfig {
  teamId: string;
  publishedCsvUrl: string;
}

/** All teams that have a Titan sheet configured in team_integrations (provider='titan'). */
export async function getTeamsWithTitanSheet(sb: SupabaseClient): Promise<TitanSheetConfig[]> {
  const { data } = await sb
    .from("team_integrations")
    .select("team_id, status, provider_metadata")
    .eq("provider", "titan");
  const out: TitanSheetConfig[] = [];
  for (const r of (data ?? []) as Array<{ team_id: string; status: string | null; provider_metadata: Record<string, unknown> | null }>) {
    if (String(r.status ?? "").toLowerCase() === "disabled") continue;
    const url = r.provider_metadata && typeof r.provider_metadata.publishedCsvUrl === "string" ? r.provider_metadata.publishedCsvUrl : null;
    if (url && isAllowedTitanSheetUrl(url)) out.push({ teamId: String(r.team_id), publishedCsvUrl: url });
  }
  return out;
}

/** Record the outcome of a sync attempt on the team_integrations row. Best-effort. */
export async function recordTitanSyncStatus(
  sb: SupabaseClient,
  teamId: string,
  ok: boolean,
  detail: string | null,
): Promise<void> {
  try {
    await sb.from("team_integrations").update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: ok ? "ok" : "error",
      last_sync_error: ok ? null : (detail ?? "error"),
      updated_at: new Date().toISOString(),
    }).eq("team_id", teamId).eq("provider", "titan");
  } catch { /* best-effort */ }
}
