/**
 * Persistence for per-game basketball box scores → player_basketball_match_stats.
 * The season rollup is written to player_season_stats via the shared
 * seasonStatToDbRow (see rollup.ts + statsIngestion/persist).
 */

import type { BasketballBoxScoreRow } from "./types";

/** Natural key for idempotent upserts into player_basketball_match_stats. */
export const BASKETBALL_MATCH_CONFLICT = "team_id,source,game_id,source_player_ref";

export function basketballGameStatToDbRow(r: BasketballBoxScoreRow, playerId: string | null) {
  return {
    team_id: r.teamId,
    player_id: playerId,
    game_id: r.gameId,
    game_date: r.gameDate,
    opponent: r.opponent ?? null,
    home_away: r.homeAway ?? null,
    minutes: r.minutes ?? null,
    points: r.points ?? null,
    fgm: r.fgm ?? null, fga: r.fga ?? null,
    tpm: r.tpm ?? null, tpa: r.tpa ?? null,
    ftm: r.ftm ?? null, fta: r.fta ?? null,
    oreb: r.oreb ?? null, dreb: r.dreb ?? null, reb: r.reb ?? null,
    assists: r.assists ?? null,
    steals: r.steals ?? null,
    blocks: r.blocks ?? null,
    turnovers: r.turnovers ?? null,
    fouls: r.fouls ?? null,
    plus_minus: r.plusMinus ?? null,
    efficiency: r.efficiency ?? null,
    stats: r.stats,
    source: r.source,
    source_ref: r.sourceRef ?? r.gameId,
    source_player_ref: r.sourcePlayerRef,
    source_player_name: r.playerName,
    synced_at: new Date().toISOString(),
  };
}
