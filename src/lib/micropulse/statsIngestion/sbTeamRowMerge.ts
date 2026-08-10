import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Merge-upsert one match's team row into sb_team_match_stats (source='statsbomb').
 *
 * Two single-match uploads can each contribute part of the row: the per-player "whole
 * squad" file aggregates to xG / OBV / shots / box touches; the team "Match Stats"
 * summary carries possession / passing %. So we MERGE rather than replace — a non-null
 * value in `patch` wins, but any field it leaves null keeps whatever a previous upload
 * (or the season Team Stats import) already stored. Either file, uploaded in any order,
 * accumulates into one complete row. Descriptive only — never touches the readiness colour.
 */
export async function mergeUpsertSbTeamRow(
  supabase: SupabaseClient,
  teamId: string,
  matchDate: string,
  patch: Record<string, unknown>,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("sb_team_match_stats")
    .select("*")
    .eq("team_id", teamId).eq("match_date", matchDate).eq("source", "statsbomb")
    .maybeSingle();

  const base: Record<string, unknown> = existing ? { ...(existing as Record<string, unknown>) } : {};
  delete base.id; delete base.created_at;

  const merged: Record<string, unknown> = { ...base, team_id: teamId, match_date: matchDate, source: "statsbomb", updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) {
    if (v != null) merged[k] = v;          // a real value always wins
    else if (!(k in merged)) merged[k] = null; // initialise the column if nothing had it
  }

  const { error } = await supabase.from("sb_team_match_stats").upsert(merged, { onConflict: "team_id,match_date,source" });
  return error?.message ?? null;
}
