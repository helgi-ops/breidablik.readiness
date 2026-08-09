import "server-only";

/**
 * Basketball opponent scouting pull (server-only). Reuses the free public KKÍ
 * (baskethotel) widget walk — the same schedule + box-score endpoints the own-team
 * sync uses — but keeps the OPPONENT's rows and stores them in the scout tables, so a
 * coach can profile any league team without paying for a feed. Descriptive scouting
 * only — never touches the readiness colour or the daily decision.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildScheduleUrl, buildBoxScoreUrl, fetchWidget, DEFAULT_STAGE_ID } from "./kkiWidget";
import { parseBoxScore, parseSchedule } from "@/lib/micropulse/basketballStats/parseWidget";
import { normalizeName } from "@/lib/micropulse/statsIngestion/nameMatch";

export type ScoutPullResult = { ok: boolean; games: number; rows: number; error?: string };

/**
 * Pull `opponentName`'s whole KKÍ season (box scores of every game they played) and
 * persist it under `ownerTeamId` in scout_basketball_*.
 */
export async function scoutOpponentSeason(
  supabase: SupabaseClient,
  ownerTeamId: string,
  seasonId: string,
  opponentName: string,
  season: string,
): Promise<ScoutPullResult> {
  const filter = normalizeName(opponentName);
  const matches = (name: string | null) => name != null && normalizeName(name) === filter;

  // 1) Walk the season schedule; keep finished games the opponent played.
  const games: Array<{ gameId: string; date: string; home: string; away: string }> = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 30; page++) {
    let sched: string;
    try { sched = await fetchWidget(buildScheduleUrl(seasonId, DEFAULT_STAGE_ID, page)); } catch { break; }
    const parsed = parseSchedule(sched).filter((g) => g.finished);
    const fresh = parsed.filter((g) => !seen.has(g.gameId));
    if (fresh.length === 0) break;
    for (const g of fresh) {
      seen.add(g.gameId);
      if (matches(g.homeTeam) || matches(g.awayTeam)) games.push({ gameId: g.gameId, date: g.date, home: g.homeTeam, away: g.awayTeam });
    }
  }

  // 2) Per game: parse the box score, keep the OPPONENT's rows, tag context.
  type Row = ReturnType<typeof parseBoxScore>[number] & { gameDate: string; opponent: string; homeAway: "home" | "away" };
  const rows: Row[] = [];
  for (const g of games) {
    let box: string;
    try { box = await fetchWidget(buildBoxScoreUrl(g.gameId, seasonId)); } catch { continue; }
    const isHome = matches(g.home);
    for (const r of parseBoxScore(box, g.gameId, ownerTeamId, "baskethotel")) {
      if (!matches(r.team)) continue;
      rows.push({ ...r, gameDate: g.date, opponent: isHome ? g.away : g.home, homeAway: isHome ? "home" : "away" });
    }
  }
  if (rows.length === 0) return { ok: false, games: 0, rows: 0, error: "No finished games found for that opponent in this KKÍ season." };

  const gameCount = new Set(rows.map((r) => r.gameId)).size;
  const nowIso = new Date().toISOString();

  // Upsert the scout-season header, then replace its per-game rows.
  const { data: seasonRow, error: sErr } = await supabase.from("scout_basketball_season").upsert({
    owner_team_id: ownerTeamId, opponent_name: opponentName, season, season_id: seasonId,
    source: "baskethotel", games: gameCount, synced_at: nowIso, updated_at: nowIso,
  }, { onConflict: "owner_team_id,opponent_name,season" }).select("id").maybeSingle();
  if (sErr || !seasonRow) return { ok: false, games: gameCount, rows: 0, error: sErr?.message ?? "scout season upsert failed" };
  const scoutSeasonId = (seasonRow as { id: string }).id;

  await supabase.from("scout_basketball_player_game").delete().eq("scout_season_id", scoutSeasonId);
  const insertRows = rows.map((r) => ({
    scout_season_id: scoutSeasonId, game_id: r.gameId, game_date: r.gameDate || null, opponent: r.opponent, home_away: r.homeAway,
    player_name: r.playerName, player_ref: r.sourcePlayerRef,
    minutes: r.minutes, points: r.points, fgm: r.fgm, fga: r.fga, tpm: r.tpm, tpa: r.tpa, ftm: r.ftm, fta: r.fta,
    oreb: r.oreb, dreb: r.dreb, reb: r.reb, assists: r.assists, steals: r.steals, blocks: r.blocks, turnovers: r.turnovers, fouls: r.fouls,
    plus_minus: r.plusMinus, efficiency: r.efficiency, stats: r.stats, source: "baskethotel",
  }));
  const { error: iErr } = await supabase.from("scout_basketball_player_game").insert(insertRows as never);
  if (iErr) return { ok: false, games: gameCount, rows: 0, error: iErr.message };

  return { ok: true, games: gameCount, rows: insertRows.length };
}
