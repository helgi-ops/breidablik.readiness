/**
 * Persistence for per-game basketball box scores → player_basketball_match_stats.
 * The season rollup is written to player_season_stats via the shared
 * seasonStatToDbRow (see rollup.ts + statsIngestion/persist).
 */

import type {
  BasketballAdvancedMetrics,
  BasketballBoxScoreRow,
  BasketballTeamMatchRow,
} from "./types";

/** Natural key for idempotent upserts into player_basketball_match_stats. */
export const BASKETBALL_MATCH_CONFLICT = "team_id,source,game_id,source_player_ref";

/** Natural key for idempotent upserts into basketball_team_match_stats. */
export const BASKETBALL_TEAM_MATCH_CONFLICT =
  "owner_team_id,source,match_ref,is_opponent,period";

/** Advanced metrics → the nullable numeric columns + `advanced` jsonb catch-all.
 *  Shared by the player and team mappers so both stores stay one shape. */
function advancedToColumns(a: BasketballAdvancedMetrics | null | undefined) {
  return {
    efg_pct: a?.efgPct ?? null,
    ts_pct: a?.tsPct ?? null,
    to_pct: a?.toPct ?? null,
    oreb_pct: a?.orebPct ?? null,
    dreb_pct: a?.drebPct ?? null,
    ftf: a?.ftf ?? null,
    ppp: a?.ppp ?? null,
    points_off_to: a?.pointsOffTo ?? null,
    second_chance_pts: a?.secondChancePts ?? null,
    points_in_paint: a?.pointsInPaint ?? null,
    fastbreak_pts: a?.fastbreakPts ?? null,
    advanced: a?.extra ?? {},
  };
}

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
    ...advancedToColumns(r.advanced),
    // Player-only advanced columns (not present on the team store).
    deflections: r.advanced?.deflections ?? null,
    charges_drawn: r.advanced?.chargesDrawn ?? null,
    usage_pct: r.advanced?.usagePct ?? null,
    ast_pct: r.advanced?.astPct ?? null,
    ast_to_ratio: r.advanced?.astToRatio ?? null,
    stats: r.stats,
    source: r.source,
    source_ref: r.sourceRef ?? r.gameId,
    source_player_ref: r.sourcePlayerRef,
    source_player_name: r.playerName,
    synced_at: new Date().toISOString(),
  };
}

/** One normalized team line → a basketball_team_match_stats row. Idempotent on
 *  BASKETBALL_TEAM_MATCH_CONFLICT. Only InStat/Hudl-grade feeds emit these. */
export function basketballTeamMatchToDbRow(r: BasketballTeamMatchRow) {
  return {
    owner_team_id: r.ownerTeamId,
    match_ref: r.matchRef,
    match_date: r.matchDate ?? null,
    opponent: r.opponent ?? null,
    is_opponent: r.isOpponent,
    period: r.period,
    points: r.points ?? null,
    possessions: r.possessions ?? null,
    fgm: r.fgm ?? null, fga: r.fga ?? null,
    tpm: r.tpm ?? null, tpa: r.tpa ?? null,
    ftm: r.ftm ?? null, fta: r.fta ?? null,
    oreb: r.oreb ?? null, dreb: r.dreb ?? null, reb: r.reb ?? null,
    assists: r.assists ?? null, steals: r.steals ?? null, blocks: r.blocks ?? null,
    turnovers: r.turnovers ?? null, fouls: r.fouls ?? null,
    ...advancedToColumns(r.advanced),
    bench_pts: r.benchPts ?? null,
    stats: r.stats ?? {},
    source: r.source,
    source_ref: r.sourceRef ?? r.matchRef,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
