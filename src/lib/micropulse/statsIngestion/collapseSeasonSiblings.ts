import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeStatsbombSiblingRows, type SiblingRow } from "./mergeSeasonSiblings";

/**
 * Enforce one statsbomb_csv season row per player — by MERGING, not discarding.
 *
 * The StatsBomb "Squad" export (source_player_ref sb:<SBD id>) and the "Player Stats"
 * export (sbname:<name>, no SBD id) give the SAME player DIFFERENT refs, and each
 * carries something the other lacks: the Squad file is the deeper metric set + full
 * roster + physicals (age/height/foot); the Player Stats file is the ONLY one that
 * carries "Primary Position". Importing both used to leave two rows (double picker /
 * double-counted percentile pool), and the earlier fix simply DELETED the sibling —
 * which threw away whichever half wasn't in the last-uploaded file (position, or the
 * deeper metrics).
 *
 * This unions the sibling rows' `metrics` bags into ONE canonical row so a mixed
 * Squad + Player-Stats import keeps BOTH halves: the Squad's richer numbers AND the
 * Player-Stats position. The pure merge lives in mergeSeasonSiblings.ts (unit-tested);
 * here we just fetch the siblings, apply the merge, and drop the leftovers.
 *
 * Best-effort and per-player scoped; never throws (a cleanup miss must not fail the
 * import). Descriptive football data — never touches the readiness colour.
 */
export async function collapseStatsbombSeasonSiblings(
  supabase: SupabaseClient,
  teamId: string,
  season: string,
  written: Array<{ name: string | null | undefined; ref: string | null | undefined }>,
): Promise<void> {
  // De-dupe the written names so we visit each player once regardless of how many
  // rows referenced them in this import.
  const names = Array.from(new Set(written.map((w) => (w.name ?? "").trim()).filter(Boolean)));
  for (const nm of names) {
    try {
      const { data } = await supabase
        .from("player_season_stats")
        .select("id, source_player_ref, player_id, minutes, goals, assists, xg, metrics")
        .eq("team_id", teamId)
        .eq("season", season)
        .eq("source", "statsbomb_csv")
        .ilike("wyscout_player_name", nm);
      const rows = (data ?? []) as SiblingRow[];
      const plan = mergeStatsbombSiblingRows(rows);
      if (!plan) continue; // 0 or 1 row — nothing to collapse

      await supabase.from("player_season_stats").update(plan.update).eq("id", plan.canonicalId);
      if (plan.staleIds.length) await supabase.from("player_season_stats").delete().in("id", plan.staleIds);
    } catch { /* best-effort — a cleanup failure must not break the import */ }
  }
}
