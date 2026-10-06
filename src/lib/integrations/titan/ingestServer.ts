import "server-only";

/**
 * Shared Titan ingest — resolve athlete names to the team's own players and upsert into
 * player_external_load_daily (source="titan"). Used by BOTH the manual upload route and the
 * Google-Sheet auto-sync cron, so they resolve + store identically.
 *
 * Descriptive — writes the load table only, never the readiness colour. Dedupe/upsert key is
 * (player_id, date, source); re-ingesting the same session just refreshes the row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { titanRowToExternalLoad } from "./toExternalLoad";
import type { TitanRow } from "./parseSyncedData";

/** Case/spacing/punctuation-insensitive name key (keeps Icelandic letters intact). */
const normName = (s: string): string => s.toLowerCase().replace(/[,._]/g, " ").replace(/\s+/g, " ").trim();
/** Word-order-independent key so "Jón Ari" matches "Ari, Jón". */
const tokenKey = (s: string): string => normName(s).split(" ").filter(Boolean).sort().join(" ");

export interface TitanIngestResult {
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

/** Resolve names on the given team + upsert the rows. The caller supplies an admin Supabase client. */
export async function ingestTitanRows(sb: SupabaseClient, teamId: string, incoming: TitanRow[]): Promise<TitanIngestResult> {
  const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId);
  const byNorm = new Map<string, string>();
  const byToken = new Map<string, string>();
  const ambiguousToken = new Set<string>();
  for (const p of (roster ?? []) as Array<{ id: string; full_name: string | null }>) {
    const full = (p.full_name ?? "").trim();
    if (!full) continue;
    byNorm.set(normName(full), String(p.id));
    const tk = tokenKey(full);
    if (byToken.has(tk) && byToken.get(tk) !== String(p.id)) ambiguousToken.add(tk);
    else byToken.set(tk, String(p.id));
  }
  const resolve = (name: string): string | null => {
    const exact = byNorm.get(normName(name));
    if (exact) return exact;
    const tk = tokenKey(name);
    if (ambiguousToken.has(tk)) return null; // two players share these words → don't guess
    return byToken.get(tk) ?? null;
  };

  const unmatched = new Set<string>();
  const matchedPlayers = new Set<string>();
  const dates: string[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let stored = 0;

  for (const r of incoming) {
    const name = String(r?.playerName ?? "").trim();
    if (!name || !r?.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) { skipped++; continue; }
    const playerId = resolve(name);
    if (!playerId) { unmatched.add(name); continue; }
    const row = titanRowToExternalLoad(r, playerId, teamId);
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
