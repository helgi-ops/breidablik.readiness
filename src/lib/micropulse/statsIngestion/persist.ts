/**
 * Shared persistence for normalized season stats — used by BOTH adapters
 * (Excel import route and the Wyscout API sync) so they write identically.
 */

import type { PlayerSeasonStat, PlayerMatchStat } from "./types";

/** The natural key for idempotent upserts into player_season_stats. */
export const SEASON_CONFLICT = "team_id,season,source,source_player_ref";
/** The natural key for idempotent upserts into player_match_stats. */
export const MATCH_CONFLICT = "team_id,match_date,source,source_player_ref";

/** Map a normalized PlayerSeasonStat to the player_season_stats row shape. */
export function seasonStatToDbRow(s: PlayerSeasonStat, playerId: string | null) {
  return {
    team_id: s.teamId,
    player_id: playerId,
    season: s.season,
    competition: s.competition ?? null,
    minutes: s.minutes ?? null,
    goals: s.goals ?? null,
    assists: s.assists ?? null,
    shots: s.shots ?? null,
    shots_on_target: s.shotsOnTarget ?? null,
    passes: s.passes ?? null,
    pass_accuracy_pct: s.passAccuracyPct ?? null,
    key_passes: s.keyPasses ?? null,
    duels_won: s.duelsWon ?? null,
    xg: s.xg ?? null,
    rating: s.rating ?? null,
    metrics: s.metrics,
    source: s.source,
    source_ref: s.sourceRef ?? null,
    source_player_ref: s.sourcePlayerRef,
    wyscout_player_name: s.wyscoutPlayerName,
    synced_at: new Date().toISOString(),
  };
}

/** Map a normalized PlayerMatchStat to the player_match_stats row shape. */
export function matchStatToDbRow(s: PlayerMatchStat, playerId: string | null) {
  return {
    team_id: s.teamId,
    player_id: playerId,
    match_date: s.matchDate,
    opponent: s.opponent ?? null,
    home_away: s.homeAway ?? null,
    minutes: s.minutes ?? null,
    goals: s.goals ?? null,
    assists: s.assists ?? null,
    shots: s.shots ?? null,
    shots_on_target: s.shotsOnTarget ?? null,
    passes: s.passes ?? null,
    pass_accuracy_pct: s.passAccuracyPct ?? null,
    key_passes: s.keyPasses ?? null,
    duels_won: s.duelsWon ?? null,
    xg: s.xg ?? null,
    rating: s.rating ?? null,
    metrics: s.metrics,
    source: s.source,
    source_ref: s.sourceRef ?? null,
    source_player_ref: s.sourcePlayerRef,
    wyscout_player_name: s.wyscoutPlayerName,
    synced_at: new Date().toISOString(),
  };
}
