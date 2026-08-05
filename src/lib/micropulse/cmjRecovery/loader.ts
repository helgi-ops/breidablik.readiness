/**
 * Match/HSR join for the expected post-match CMJ recovery model (item 2).
 *
 * Reuses the same source the post-match-recovery / MD-comparison surfaces use: the
 * team's most recent match from `match_schedule`, and each player's high-speed-
 * running distance in that match from `player_external_load_daily` (Catapult). HSR
 * (>5.5 m/s) is the fatigue driver (Hader 2019), NOT total distance.
 *
 * Server-side IO only; the modelling itself stays pure in ./index.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type MatchRecoveryInputs = {
  /** The team's most recent match on/before the decision date (ISO), or null. */
  matchDate: string | null;
  /** Per-player HSR metres (>5.5 m/s) in that match. Absent = did not feature. */
  hsrByPlayer: Map<string, number>;
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function loadMatchRecoveryInputs(
  sb: SupabaseClient,
  teamId: string,
  decisionDate: string,
): Promise<MatchRecoveryInputs> {
  const { data: matchRows } = await sb
    .from("match_schedule")
    .select("match_date")
    .eq("team_id", teamId)
    .lte("match_date", decisionDate)
    .order("match_date", { ascending: false })
    .limit(1);
  const matchDate = (matchRows?.[0] as { match_date?: string } | undefined)?.match_date ?? null;
  if (!matchDate) return { matchDate: null, hsrByPlayer: new Map() };

  const { data: loadRows } = await sb
    .from("player_external_load_daily")
    .select("player_id, high_speed_distance, velocity_band6_total_distance")
    .eq("team_id", teamId)
    .eq("source", "catapult")
    .eq("date", matchDate);

  const hsrByPlayer = new Map<string, number>();
  for (const r of (loadRows ?? []) as Array<Record<string, unknown>>) {
    // Prefer the HSR (>5.5 m/s) distance; fall back to the sprint (band 6) distance
    // when HSR isn't populated on this Catapult tier.
    const hsr = num(r.high_speed_distance) || num(r.velocity_band6_total_distance);
    if (hsr > 0) hsrByPlayer.set(String(r.player_id), hsr);
  }
  return { matchDate, hsrByPlayer };
}

/** Whole hours between the match date and the decision date (×24/day). null when
 *  either is missing or the match is in the future. Date-granular — kickoff time
 *  isn't stored, so MD+1 ≈ 24 h, MD+2 ≈ 48 h, matching the model's hour buckets. */
export function hoursPostMatch(matchDate: string | null, decisionDate: string): number | null {
  if (!matchDate) return null;
  const ms = Date.parse(`${decisionDate}T00:00:00Z`) - Date.parse(`${matchDate}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 86_400_000) * 24;
}
