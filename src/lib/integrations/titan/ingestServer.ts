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

/**
 * Titan/Hudl prefixes some exports with a smashed lowercase username token
 * (e.g. "helenarafns Helena Rafnsdóttir"). Strip a leading all-lowercase,
 * space-less token when a properly-capitalised real name follows it (≥2 more
 * tokens, the next starting uppercase), so it maps to the roster. Conservative:
 * only strips when the tell is unambiguous — never a genuine lowercase forename.
 */
function stripLeadingUsername(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 3) return name;
  const first = parts[0];
  const isUsernameToken = /^[a-záðéíóúýþæö0-9]+$/.test(first) && first === first.toLowerCase() && !/\s/.test(first);
  const restLooksProper = parts.slice(1, 3).every((t) => /^[A-ZÁÐÉÍÓÚÝÞÆÖ]/.test(t));
  return isUsernameToken && restLooksProper ? parts.slice(1).join(" ") : name;
}

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

/** Resolve names on the given team + upsert the rows. The caller supplies an admin Supabase client.
 *  `parserWarnings` carries non-blocking export warnings (duplicate/missing columns) from the parser
 *  so both the manual upload and the Sheet cron surface them in the same result. */
export async function ingestTitanRows(sb: SupabaseClient, teamId: string, incoming: TitanRow[], parserWarnings: string[] = []): Promise<TitanIngestResult> {
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
  const resolveOne = (name: string): string | null => {
    const exact = byNorm.get(normName(name));
    if (exact) return exact;
    const tk = tokenKey(name);
    if (ambiguousToken.has(tk)) return null; // two players share these words → don't guess
    return byToken.get(tk) ?? null;
  };
  const resolve = (name: string): string | null => {
    const direct = resolveOne(name);
    if (direct) return direct;
    // Fallback: strip a leading Titan/Hudl username token and retry.
    const stripped = stripLeadingUsername(name);
    return stripped !== name ? resolveOne(stripped) : null;
  };

  const unmatched = new Set<string>();
  const matchedPlayers = new Set<string>();
  const dates: string[] = [];
  const warnings: string[] = [...parserWarnings];
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
