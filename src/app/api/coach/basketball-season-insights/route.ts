export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/basketball-season-insights
 *   GET  → the box-score Season Match Analysis for the coach's basketball team
 *          (season averages, per-game trend, home/away, per-opponent, leaders, and —
 *           where results are entered — record / margin / win-loss splits).
 *   POST { gameId, gameDate?, opponent?, pointsFor?, pointsAgainst } → save a final score.
 *
 * Own-team per-player box scores come from the KKÍ / Instat feed
 * (player_basketball_match_stats); final scores are coach-entered
 * (basketball_game_results). Descriptive context only — it never touches the readiness
 * colour, load, or the daily decision. Coach/team-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { buildBasketballSeason, type GameTotals, type GameResult } from "@/lib/micropulse/basketballSeason";
import {
  avgFactors, aggregateAdvancedShots, zonesFromAdvanced, playerZonesFromRows, hasZones,
  type FourFactorAvg, type ShotTypeAgg, type ZoneAgg, type PlayerZones,
} from "@/lib/micropulse/basketballStats/instatAggregate";
import { scopeToCurrentSeason, totalsPts, competitionsOf, resolveCompetition, competitionLabel, type FibaGame } from "@/lib/micropulse/basketballStats/fibaGamesRead";
import { initialSurnameKey } from "@/lib/micropulse/statsIngestion/nameMatch";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId, userId: userRes.user.id } as const;
}

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

type Row = Record<string, unknown>;

/** Sum the per-player box scores into one team total per game. */
function aggregateGames(rows: Row[]): GameTotals[] {
  const byGame = new Map<string, GameTotals>();
  for (const r of rows) {
    const gid = String(r.game_id ?? "");
    if (!gid) continue;
    let g = byGame.get(gid);
    if (!g) {
      const ha = String(r.home_away ?? "").toLowerCase();
      g = {
        gameId: gid, date: (r.game_date as string) ?? null, opponent: (r.opponent as string) ?? null,
        homeAway: ha === "home" ? "home" : ha === "away" ? "away" : null,
        pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fouls: 0,
      };
      byGame.set(gid, g);
    }
    g.pts += n(r.points); g.fgm += n(r.fgm); g.fga += n(r.fga); g.tpm += n(r.tpm); g.tpa += n(r.tpa);
    g.ftm += n(r.ftm); g.fta += n(r.fta); g.oreb += n(r.oreb); g.dreb += n(r.dreb); g.reb += n(r.reb);
    g.ast += n(r.assists); g.stl += n(r.steals); g.blk += n(r.blocks); g.tov += n(r.turnovers); g.fouls += n(r.fouls);
  }
  return Array.from(byGame.values());
}

async function loadRows(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<Row[]> {
  return fetchAllPages<Row>((from, to) => supabase.from("player_basketball_match_stats")
    .select("game_id, game_date, opponent, home_away, points, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, reb, assists, steals, blocks, turnovers, fouls, source_player_name")
    .eq("team_id", teamId).range(from, to));
}

/** Season Four Factors from the InStat team feed — full-game rows, averaged.
 *  The "what wins games" read (Dean Oliver). Aggregation in instatAggregate. */
async function loadFourFactors(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<{ own: FourFactorAvg; opp: FourFactorAvg } | null> {
  const { data } = await supabase.from("basketball_team_match_stats")
    .select("is_opponent, efg_pct, to_pct, oreb_pct, ftf, ppp")
    .eq("owner_team_id", teamId).eq("period", "game").eq("source", "instat");
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  return {
    own: avgFactors(rows.filter((r) => r.is_opponent === false)),
    opp: avgFactors(rows.filter((r) => r.is_opponent === true)),
  };
}

/** Season per-quarter scoring from the InStat team feed: average own vs opponent
 *  points in each quarter (the "how we start / finish games" read). Descriptive. */
type QuarterScoring = { own: (number | null)[]; opp: (number | null)[]; games: number };
async function loadQuarterScoring(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<QuarterScoring | null> {
  const { data } = await supabase.from("basketball_team_match_stats")
    .select("is_opponent, period, points")
    .eq("owner_team_id", teamId).eq("source", "instat")
    .in("period", ["q1", "q2", "q3", "q4"]);
  const rows = (data ?? []) as Array<{ is_opponent: boolean; period: string; points: number | null }>;
  if (rows.length === 0) return null;
  const avgFor = (isOpp: boolean, period: string): number | null => {
    const vals = rows.filter((r) => r.is_opponent === isOpp && r.period === period)
      .map((r) => r.points).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const periods = ["q1", "q2", "q3", "q4"] as const;
  return {
    own: periods.map((p) => avgFor(false, p)),
    opp: periods.map((p) => avgFor(true, p)),
    games: rows.filter((r) => !r.is_opponent && r.period === "q1").length,
  };
}

/** Season tactical-shot mix (FG playtypes pt_* + offensive-efficiency eff_*) from
 *  the InStat team feed, own side. Aggregation in instatAggregate. */
async function loadTacticalShots(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<{ playtypes: ShotTypeAgg[]; efficiency: ShotTypeAgg[]; games: number } | null> {
  const { data } = await supabase.from("basketball_team_match_stats")
    .select("advanced")
    .eq("owner_team_id", teamId).eq("period", "game").eq("source", "instat").eq("is_opponent", false);
  const rows = (data ?? []) as Array<{ advanced: Record<string, unknown> | null }>;
  if (rows.length === 0) return null;
  const playtypes = aggregateAdvancedShots(rows, "pt");
  const efficiency = aggregateAdvancedShots(rows, "eff");
  if (playtypes.length === 0 && efficiency.length === 0) return null;
  return { playtypes, efficiency, games: rows.length };
}

/** Season shot-zone efficiency from the InStat per-player feed — team-wide + per
 *  player, the "shot chart" as zone efficiency. Aggregation in instatAggregate. */
async function loadShotZones(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<{ team: ZoneAgg[]; players: PlayerZones[]; games: number } | null> {
  const { data } = await supabase.from("player_basketball_match_stats")
    .select("source_player_name, game_id, advanced")
    .eq("team_id", teamId).eq("source", "instat");
  const rows = (data ?? []) as Array<{ source_player_name: string | null; game_id: string | null; advanced: Record<string, unknown> | null }>;
  const withZones = rows.filter((r) => hasZones(r.advanced));
  if (withZones.length === 0) return null;
  const team = zonesFromAdvanced(withZones.map((r) => r.advanced ?? {}));
  const players = playerZonesFromRows(withZones);
  const games = new Set(withZones.map((r) => r.game_id)).size;
  return { team, players, games };
}

/** The authoritative full-season team averages from the InStat "Team comparison" export
 *  (period 'season'), if imported. Distinct from the per-game-log averages (which cover
 *  only games with per-player detail). */
async function loadSeasonTeam(supabase: ReturnType<typeof getSupabase>, teamId: string) {
  const { data } = await supabase.from("basketball_team_match_stats")
    .select("points, possessions, ppp, efg_pct, reb, oreb, dreb, assists, steals, turnovers, blocks, advanced")
    .eq("owner_team_id", teamId).eq("period", "season").eq("source", "instat").eq("is_opponent", false)
    .order("synced_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const adv = ((data as { advanced?: Record<string, unknown> }).advanced ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const r = data as Record<string, unknown>;
  return {
    gamesPlayed: n(adv.games_played), seasonLabel: (adv.season_label as string | null) ?? null,
    points: n(r.points), possessions: n(r.possessions), ppp: n(r.ppp), efgPct: n(r.efg_pct),
    fgPct: n(adv.fg_pct), tpPct: n(adv.tp_pct), ftPct: n(adv.ft_pct),
    reb: n(r.reb), oreb: n(r.oreb), dreb: n(r.dreb), assists: n(r.assists), steals: n(r.steals), turnovers: n(r.turnovers), blocks: n(r.blocks),
  };
}

async function loadResults(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<Record<string, GameResult>> {
  const { data } = await supabase.from("basketball_game_results").select("game_id, points_for, points_against").eq("team_id", teamId);
  const out: Record<string, GameResult> = {};
  for (const r of (data ?? []) as Array<{ game_id: string; points_for: number | null; points_against: number | null }>) {
    out[r.game_id] = { pointsFor: r.points_for, pointsAgainst: r.points_against };
  }
  return out;
}

const foldNm = (s: string | null | undefined) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const gkey = (date: string | null, opp: string | null) => `${date ?? "-"}|${foldNm(opp)}`;
const round1 = (x: number) => Math.round(x * 10) / 10;
type PlayerLine = { name: string; pts: number; reb: number; ast: number };

/** The Season read, MERGING the InStat per-player feed with the KKÍ box-score feed by (date,
 *  opponent): every game shows once. An InStat game uses its richer totals/players; a KKÍ-only
 *  game uses its box. Prevents one InStat upload from hiding the rest of the KKÍ season.
 *  The InStat-only extras (Four Factors, quarters, shot zones) are loaded separately and simply
 *  cover whichever games have InStat. */
async function loadMergedSeason(
  supabase: ReturnType<typeof getSupabase>, teamId: string, requestedComp: string | null,
  instatRows: Row[], coachResults: Record<string, GameResult>,
) {
  // KKÍ games (current season; one competition when a reserve side is also present).
  const { data } = await supabase.from("basketball_fiba_games")
    .select("match_id, match_date, opp_name, own_box, own_totals, opp_totals, competition_code, season")
    .eq("owner_team_id", teamId);
  const { games: allFiba } = scopeToCurrentSeason(((data ?? []) as FibaGame[]));
  const competitions = competitionsOf(allFiba);
  const competition = resolveCompetition(allFiba, requestedComp);
  const kkiGames = competitions.length > 1 ? allFiba.filter((g) => (g.competition_code ?? null) === competition) : allFiba;

  // InStat team 'game' rows (the Games-file season box + single-match team row). Carries own
  // points + box totals; the opponent points come from advanced.opp_players (single-match) or
  // basketball_game_results (Games file). Used for win/loss and as a season source in its own
  // right so a team that uploads ONLY the Games file still gets a full season read.
  const { data: iteam } = await supabase.from("basketball_team_match_stats")
    .select("match_ref, match_date, opponent, points, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, reb, assists, steals, blocks, turnovers, fouls, advanced")
    .eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game").eq("is_opponent", false);
  type ITeamRow = { match_ref: string; match_date: string | null; opponent: string | null; points: number | null; fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null; oreb: number | null; dreb: number | null; reb: number | null; assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null; fouls: number | null; advanced: { opp_players?: Array<{ points?: number | null }> } | null };
  const iteamRows = (iteam ?? []) as ITeamRow[];
  const instatPts = new Map<string, { own: number; opp: number }>();
  for (const r of iteamRows) {
    const opp = Array.isArray(r.advanced?.opp_players) ? r.advanced!.opp_players!.reduce((a, p) => a + (Number(p?.points) || 0), 0) : 0;
    instatPts.set(gkey(r.match_date, r.opponent), { own: Number(r.points) || 0, opp });
  }

  type Merged = { total: GameTotals; result: GameResult | null; players: PlayerLine[] };
  const byKey = new Map<string, Merged>();

  // KKÍ games first.
  for (const g of kkiGames) {
    const key = gkey(g.match_date, g.opp_name);
    const box = Array.isArray(g.own_box) ? g.own_box : [];
    const total: GameTotals = { gameId: String(g.match_id ?? key), date: g.match_date, opponent: g.opp_name ?? null, homeAway: null, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fouls: 0 };
    const players: PlayerLine[] = [];
    for (const b of box) {
      total.pts += n(b.pts); total.fgm += n(b.fgm); total.fga += n(b.fga); total.tpm += n(b.tpm); total.tpa += n(b.tpa);
      total.ftm += n(b.ftm); total.fta += n(b.fta); total.oreb += n(b.oreb); total.dreb += n(b.dreb); total.reb += n(b.reb);
      total.ast += n(b.ast); total.stl += n(b.stl); total.blk += n(b.blk); total.tov += n(b.tov);
      if (b.name) players.push({ name: String(b.name), pts: n(b.pts), reb: n(b.reb), ast: n(b.ast) });
    }
    const pf = totalsPts(g.own_totals), pa = totalsPts(g.opp_totals);
    byKey.set(key, { total, result: (pf || pa) ? { pointsFor: pf, pointsAgainst: pa } : null, players });
  }

  // InStat games override the same matchup (richer); add any InStat-only games.
  const instPlayersByKey = new Map<string, PlayerLine[]>();
  for (const r of instatRows) {
    const key = gkey((r.game_date as string | null) ?? null, (r.opponent as string | null) ?? null);
    const arr = instPlayersByKey.get(key) ?? [];
    arr.push({ name: String(r.source_player_name ?? "").trim(), pts: n(r.points), reb: n(r.reb), ast: n(r.assists) });
    instPlayersByKey.set(key, arr);
  }
  for (const gt of aggregateGames(instatRows)) {
    const key = gkey(gt.date, gt.opponent);
    const prev = byKey.get(key);
    const pts = instatPts.get(key);
    const result = prev?.result ?? (pts ? { pointsFor: pts.own || gt.pts, pointsAgainst: pts.opp } : (gt.pts ? { pointsFor: gt.pts, pointsAgainst: 0 } : null));
    byKey.set(key, { total: gt, result, players: instPlayersByKey.get(key) ?? [] });
  }

  // Third source: InStat team rows (Games-file season box) for any game NOT already covered by
  // the KKÍ box or the InStat per-player feed — team totals only (no per-player lines).
  for (const r of iteamRows) {
    const key = gkey(r.match_date, r.opponent);
    if (byKey.has(key)) continue;
    const total: GameTotals = {
      gameId: r.match_ref, date: r.match_date, opponent: r.opponent ?? null, homeAway: null,
      pts: n(r.points), fgm: n(r.fgm), fga: n(r.fga), tpm: n(r.tpm), tpa: n(r.tpa), ftm: n(r.ftm), fta: n(r.fta),
      oreb: n(r.oreb), dreb: n(r.dreb), reb: n(r.reb), ast: n(r.assists), stl: n(r.steals), blk: n(r.blocks), tov: n(r.turnovers), fouls: n(r.fouls),
    };
    const pts = instatPts.get(key);
    const result = coachResults[r.match_ref] ?? (pts && (pts.own || pts.opp) ? { pointsFor: pts.own || total.pts, pointsAgainst: pts.opp } : null);
    byKey.set(key, { total, result, players: [] });
  }

  if (byKey.size === 0) return null;

  const totals = [...byKey.values()].map((m) => m.total);
  const results: Record<string, GameResult> = { ...coachResults };
  for (const m of byKey.values()) if (m.result && !(m.total.gameId in results)) results[m.total.gameId] = m.result;

  // Leaders — merge player lines across games by SURNAME KEY (InStat and KKÍ spell names
  // differently: "Asta Grimsdottir" vs "Ásta Júlía Grímsdóttir"), keeping the fuller name.
  const byPlayer = new Map<string, { name: string; games: number; pts: number; reb: number; ast: number }>();
  for (const m of byKey.values()) for (const p of m.players) {
    const k = initialSurnameKey(p.name); if (!k) continue;
    const a = byPlayer.get(k) ?? { name: p.name, games: 0, pts: 0, reb: 0, ast: 0 };
    a.games += 1; a.pts += p.pts; a.reb += p.reb; a.ast += p.ast;
    if (p.name.length > a.name.length) a.name = p.name;
    byPlayer.set(k, a);
  }
  const list = [...byPlayer.values()].filter((a) => a.games >= 3).map((a) => ({
    name: a.name, games: a.games, ppg: round1(a.pts / a.games), rpg: round1(a.reb / a.games), apg: round1(a.ast / a.games),
  }));
  const top = (key: "ppg" | "rpg" | "apg") => list.slice().sort((x, y) => y[key] - x[key])[0] ?? null;

  return {
    season: buildBasketballSeason({ games: totals, results }),
    leaders: { scorer: top("ppg"), rebounder: top("rpg"), playmaker: top("apg") },
    competitions: competitions.length > 1 ? competitions : [],
    competition, competitionLabel: competitionLabel(competition),
    source: instatRows.length ? "instat" : "kki",
  };
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const requestedComp = new URL(req.url).searchParams.get("competition");
  const [rows, seasonTeam, coachResults] = await Promise.all([
    loadRows(auth.supabase, auth.teamId),
    loadSeasonTeam(auth.supabase, auth.teamId),
    loadResults(auth.supabase, auth.teamId),
  ]);
  const merged = await loadMergedSeason(auth.supabase, auth.teamId, requestedComp, rows, coachResults);
  if (!merged) return NextResponse.json({ ok: true, hasData: false, season: null, leaders: null, seasonTeam });

  // InStat-only extras (cover whichever games have an InStat upload); null when no InStat yet.
  const [fourFactors, quarters, tacticalShots, shotZones] = await Promise.all([
    loadFourFactors(auth.supabase, auth.teamId),
    loadQuarterScoring(auth.supabase, auth.teamId),
    loadTacticalShots(auth.supabase, auth.teamId),
    loadShotZones(auth.supabase, auth.teamId),
  ]);
  return NextResponse.json({
    ok: true, hasData: true, season: merged.season, leaders: merged.leaders,
    fourFactors, quarters, tacticalShots, shotZones, seasonTeam, source: merged.source,
    competitions: merged.competitions, competition: merged.competition, competitionLabel: merged.competitionLabel,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const gameId = String(body?.gameId ?? "").trim();
  if (!gameId) return NextResponse.json({ ok: false, error: "gameId is required" }, { status: 400 });
  const toIntOrNull = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const x = Math.round(Number(v));
    return Number.isFinite(x) && x >= 0 ? x : null;
  };
  const row = {
    team_id: auth.teamId, game_id: gameId,
    game_date: body?.gameDate ?? null, opponent: body?.opponent ?? null,
    points_for: toIntOrNull(body?.pointsFor), points_against: toIntOrNull(body?.pointsAgainst),
    updated_by: auth.userId, updated_at: new Date().toISOString(),
  };
  const { error } = await auth.supabase.from("basketball_game_results").upsert(row, { onConflict: "team_id,game_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
