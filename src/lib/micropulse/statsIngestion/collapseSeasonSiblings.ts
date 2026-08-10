import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enforce one statsbomb_csv season row per player. The StatsBomb "Squad" export
 * (source_player_ref sb:<SBD id>) and the "Player Stats" export (sbname:<name>, no
 * SBD id) give the SAME player DIFFERENT refs — so importing both would leave two
 * rows that duplicate the player picker and double-count the percentile pool.
 *
 * After the caller has upserted its rows, this removes any sibling row for the same
 * (team, season, player name) that carries a DIFFERENT ref than the one just written
 * — so a mixed Squad + Player-Stats import self-heals on any import path. Best-effort
 * and per-player scoped; never throws (a cleanup miss must not fail the import).
 * Descriptive football data — never touches the readiness colour.
 */
export async function collapseStatsbombSeasonSiblings(
  supabase: SupabaseClient,
  teamId: string,
  season: string,
  written: Array<{ name: string | null | undefined; ref: string | null | undefined }>,
): Promise<void> {
  for (const w of written) {
    const nm = (w.name ?? "").trim();
    const ref = (w.ref ?? "").trim();
    if (!nm || !ref) continue;
    try {
      await supabase
        .from("player_season_stats")
        .delete()
        .eq("team_id", teamId)
        .eq("season", season)
        .eq("source", "statsbomb_csv")
        .ilike("wyscout_player_name", nm)
        .neq("source_player_ref", ref);
    } catch { /* best-effort — a cleanup failure must not break the import */ }
  }
}
