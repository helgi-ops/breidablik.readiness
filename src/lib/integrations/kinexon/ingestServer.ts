import "server-only";

/**
 * Shared Kinexon ingest — resolve athlete names to the team's own players and
 * upsert into player_external_load_daily (source='kinexon'). Mirrors the Titan
 * ingest and reuses the same accent-folding name matcher, so every provider
 * resolves names identically. Dedupe/upsert key is (player_id, date, source).
 *
 * Descriptive — writes the load table only, never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { kinexonRowToExternalLoad } from "./toExternalLoad";
import type { KinexonRow } from "./parseExport";
import { makeRosterResolver, type RosterPlayer } from "@/lib/integrations/shared/playerNameMatch";

export interface KinexonIngestResult {
  rowsParsed: number;
  athletesMatched: number;
  athletesUnmatched: string[];
  sessionsStored: number;
  skipped: number;
  storedCount: number;
  unmatchedCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  warnings: string[];
}

/** Resolve names on the given team + upsert the rows. The caller supplies an admin
 *  Supabase client. `indoor` marks Kinexon LPS (indoor) vs GPS (outdoor). */
export async function ingestKinexonRows(
  sb: SupabaseClient,
  teamId: string,
  incoming: KinexonRow[],
  opts: { parserWarnings?: string[]; indoor?: boolean } = {},
): Promise<KinexonIngestResult> {
  const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId);
  const resolve = makeRosterResolver((roster ?? []) as RosterPlayer[]);

  const unmatched = new Set<string>();
  const matchedPlayers = new Set<string>();
  const dates: string[] = [];
  const warnings: string[] = [...(opts.parserWarnings ?? [])];
  let skipped = 0;
  let stored = 0;

  for (const r of incoming) {
    const name = String(r?.playerName ?? "").trim();
    if (!name || !r?.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) { skipped++; continue; }
    const playerId = resolve(name);
    if (!playerId) { unmatched.add(name); continue; }
    const row = kinexonRowToExternalLoad(r, playerId, teamId, opts.indoor ?? true);
    if (!row) { skipped++; continue; }
    const { error } = await sb.from("player_external_load_daily").upsert(row, { onConflict: "player_id,date,source" });
    if (error) { warnings.push(`Upsert failed for ${row.external_athlete_id} on ${row.date}: ${error.message}`); continue; }
    matchedPlayers.add(playerId);
    dates.push(row.date);
    stored++;
  }

  dates.sort();
  return {
    rowsParsed: incoming.length,
    athletesMatched: matchedPlayers.size,
    athletesUnmatched: [...unmatched].sort(),
    sessionsStored: stored,
    skipped,
    storedCount: stored,
    unmatchedCount: unmatched.size,
    earliestDate: dates[0] ?? null,
    latestDate: dates[dates.length - 1] ?? null,
    warnings,
  };
}
