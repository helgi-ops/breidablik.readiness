import "server-only";

/**
 * Adapter B — Wyscout Data API sync (server-only).
 *
 * Same normalized model + same upsert as Adapter A (Excel), so a team can switch
 * source with identical downstream data. The orchestration — read config, resolve
 * players (remembered mapping first, then the matcher), persist mappings, upsert
 * player_season_stats — is complete and reused. The ONE piece that needs the
 * club's Wyscout Data API docs is the HTTP fetch + field mapping; it is isolated
 * in `fetchWyscoutSeasonStats` and, until the real contract is provided, throws
 * rather than GUESSING endpoints (the brief forbids guessing). Everything else is
 * production-ready, so completing Adapter B is a contained change to that seam.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isWyscoutApiConfigured } from "./config";
import { seasonStatToDbRow, SEASON_CONFLICT } from "@/lib/micropulse/statsIngestion/persist";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";
import type { PlayerSeasonStat, SquadPlayer } from "@/lib/micropulse/statsIngestion/types";

export type WyscoutSyncResult = {
  teamId: string;
  ok: boolean;
  reason?: "not_wyscout_api" | "missing_wyscout_team_id" | "api_not_configured" | "not_implemented" | "fetch_failed";
  detail?: string;
  upserted?: number;
  mapped?: number;
  unmatched?: number;
};

/**
 * THE SEAM — fill this when the Wyscout Data API contract is provided.
 *
 * Must return normalized PlayerSeasonStat[] with source = "wyscout_api",
 * sourcePlayerRef = the stable Wyscout player id, wyscoutPlayerName = display
 * name, and the long tail in `metrics`. Do NOT guess endpoints/fields — this
 * throws a labelled "not_implemented" until the real docs + a sample response
 * exist, so the scheduled job fails honestly instead of writing fabricated data.
 */
async function fetchWyscoutSeasonStats(
  _wyscoutTeamId: string,
  _season: string,
  _teamId: string,
): Promise<PlayerSeasonStat[]> {
  throw new Error(
    "not_implemented: provide the Wyscout Data API endpoint + auth scheme + a sample season-stats response to complete Adapter B (fetchWyscoutSeasonStats).",
  );
}

export async function syncWyscoutTeam(
  supabase: SupabaseClient,
  teamId: string,
  season: string,
): Promise<WyscoutSyncResult> {
  const { data: cfg } = await supabase
    .from("stat_ingestion_config")
    .select("source, wyscout_team_id, enabled")
    .eq("team_id", teamId)
    .maybeSingle();
  const c = cfg as { source?: string; wyscout_team_id?: string | null; enabled?: boolean } | null;
  if (!c || c.source !== "wyscout_api" || c.enabled === false) return { teamId, ok: false, reason: "not_wyscout_api" };
  if (!c.wyscout_team_id) return { teamId, ok: false, reason: "missing_wyscout_team_id" };
  if (!isWyscoutApiConfigured()) return { teamId, ok: false, reason: "api_not_configured" };

  let stats: PlayerSeasonStat[];
  try {
    stats = await fetchWyscoutSeasonStats(c.wyscout_team_id, season, teamId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return { teamId, ok: false, reason: msg.startsWith("not_implemented") ? "not_implemented" : "fetch_failed", detail: msg };
  }

  // Resolve players — remembered mapping first, then the (initial, surname) matcher.
  const { data: squadRows } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", teamId);
  const squad: SquadPlayer[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));
  const { data: mapRows } = await supabase.from("stat_player_mapping").select("source_player_ref, player_id").eq("team_id", teamId);
  const remembered = new Map<string, string | null>();
  for (const m of (mapRows ?? []) as Array<{ source_player_ref: string; player_id: string | null }>) {
    remembered.set(m.source_player_ref, m.player_id);
  }

  const resolved = stats.map((s) => {
    const mem = remembered.get(s.sourcePlayerRef);
    if (mem) return { stat: s, playerId: mem };
    const m = matchByInitialSurname(s.wyscoutPlayerName, squad);
    // The scheduled job never auto-applies a fuzzy guess — only an exact hit.
    return { stat: s, playerId: m.confidence === "exact" ? m.playerId : null };
  });

  // Persist newly-resolved mappings so the coach doesn't re-map next sync.
  const mappingUpserts = resolved.filter((r) => r.playerId).map((r) => ({
    team_id: teamId,
    source_player_ref: r.stat.sourcePlayerRef,
    wyscout_player_name: r.stat.wyscoutPlayerName,
    player_id: r.playerId,
    confidence: "exact",
    confirmed_at: new Date().toISOString(),
  }));
  if (mappingUpserts.length > 0) {
    await supabase.from("stat_player_mapping").upsert(mappingUpserts as never, { onConflict: "team_id,source_player_ref" });
  }

  const dbRows = resolved.map((r) => seasonStatToDbRow(r.stat, r.playerId));
  const { error } = await supabase.from("player_season_stats").upsert(dbRows as never, { onConflict: SEASON_CONFLICT });
  if (error) return { teamId, ok: false, reason: "fetch_failed", detail: `upsert: ${error.message}` };

  return {
    teamId, ok: true,
    upserted: dbRows.length,
    mapped: resolved.filter((r) => r.playerId).length,
    unmatched: resolved.filter((r) => !r.playerId).length,
  };
}
