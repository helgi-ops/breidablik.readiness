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

/** Season per-player leaders (per-game averages), by name (the feed is name-keyed). */
function leaders(rows: Row[]) {
  const byName = new Map<string, { games: number; pts: number; reb: number; ast: number }>();
  for (const r of rows) {
    const name = String(r.source_player_name ?? "").trim(); if (!name) continue;
    const a = byName.get(name) ?? { games: 0, pts: 0, reb: 0, ast: 0 };
    a.games += 1; a.pts += n(r.points); a.reb += n(r.reb); a.ast += n(r.assists);
    byName.set(name, a);
  }
  const list = Array.from(byName.entries()).map(([name, a]) => ({
    name, games: a.games,
    ppg: a.games ? Math.round((a.pts / a.games) * 10) / 10 : 0,
    rpg: a.games ? Math.round((a.reb / a.games) * 10) / 10 : 0,
    apg: a.games ? Math.round((a.ast / a.games) * 10) / 10 : 0,
  })).filter((p) => p.games >= 3);
  const top = (key: "ppg" | "rpg" | "apg") => list.slice().sort((x, y) => y[key] - x[key])[0] ?? null;
  return { scorer: top("ppg"), rebounder: top("rpg"), playmaker: top("apg") };
}

async function loadRows(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<Row[]> {
  return fetchAllPages<Row>((from, to) => supabase.from("player_basketball_match_stats")
    .select("game_id, game_date, opponent, home_away, points, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, reb, assists, steals, blocks, turnovers, fouls, source_player_name")
    .eq("team_id", teamId).range(from, to));
}

/** Season Four Factors from the InStat team feed (basketball_team_match_stats).
 *  Full-game rows only; averaged across games where the metric is reported.
 *  Purely descriptive — the "what wins games" read (Dean Oliver), never a signal. */
type FourFactorAvg = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null; games: number };
function avgFactors(rows: Array<Record<string, unknown>>): FourFactorAvg {
  const mean = (key: string) => {
    const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  return { efgPct: mean("efg_pct"), toPct: mean("to_pct"), orebPct: mean("oreb_pct"), ftf: mean("ftf"), ppp: (() => {
    const vals = rows.map((r) => r.ppp).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  })(), games: rows.length };
}

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

/** Season tactical-shot mix from the InStat team feed (advanced jsonb): how the
 *  team scores by FG playtype (pt_*) and offensive-efficiency type (eff_*). Own
 *  side only. Sums made/attempted across games → shooting% and share of volume.
 *  Descriptive — the "how we generate offence" read; never a signal. */
type ShotTypeAgg = { key: string; made: number; att: number; pct: number | null; sharePct: number | null };
function aggregateAdvancedShots(rows: Array<{ advanced: Record<string, unknown> | null }>, prefix: "pt" | "eff"): ShotTypeAgg[] {
  const sum: Record<string, { m: number; a: number }> = {};
  const re = new RegExp(`^${prefix}_(.+)_(m|a)$`);
  for (const r of rows) {
    const adv = (r.advanced ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(adv)) {
      const mm = k.match(re);
      if (!mm || typeof v !== "number" || !Number.isFinite(v)) continue;
      const base = mm[1];
      sum[base] ??= { m: 0, a: 0 };
      if (mm[2] === "m") sum[base].m += v; else sum[base].a += v;
    }
  }
  const totalAtt = Object.values(sum).reduce((acc, s) => acc + s.a, 0);
  return Object.entries(sum)
    .map(([key, s]) => ({
      key, made: s.m, att: s.a,
      pct: s.a > 0 ? Math.round((s.m / s.a) * 1000) / 10 : null,
      sharePct: totalAtt > 0 ? Math.round((s.a / totalAtt) * 1000) / 10 : null,
    }))
    .filter((r) => r.att > 0)
    .sort((a, b) => b.att - a.att);
}

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

/** Season shot-zone efficiency from the InStat per-player feed (advanced jsonb
 *  zone_* bands). Aggregates makes/attempts per court zone, team-wide and per
 *  player — the "shot chart" as text-zone efficiency. Own team, source=instat.
 *  Descriptive — never a signal. */
const ZONE_BASES = ["paint", "fg_lt2m", "fg_lt4m", "under_3pt_line", "3pt_lt8m", "3pt_gt8m"] as const;
type ZoneAgg = { key: string; made: number; att: number; pct: number | null };
type PlayerZones = { name: string; totalMade: number; totalAtt: number; zones: ZoneAgg[] };
function zonesFromAdvanced(advList: Array<Record<string, unknown>>): ZoneAgg[] {
  return ZONE_BASES.map((base) => {
    let m = 0, a = 0;
    for (const adv of advList) {
      const mm = adv[`zone_${base}_m`], aa = adv[`zone_${base}_a`];
      if (typeof mm === "number" && Number.isFinite(mm)) m += mm;
      if (typeof aa === "number" && Number.isFinite(aa)) a += aa;
    }
    return { key: base, made: m, att: a, pct: a > 0 ? Math.round((m / a) * 1000) / 10 : null };
  }).filter((z) => z.att > 0);
}
async function loadShotZones(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<{ team: ZoneAgg[]; players: PlayerZones[]; games: number } | null> {
  const { data } = await supabase.from("player_basketball_match_stats")
    .select("source_player_name, game_id, advanced")
    .eq("team_id", teamId).eq("source", "instat");
  const rows = (data ?? []) as Array<{ source_player_name: string | null; game_id: string | null; advanced: Record<string, unknown> | null }>;
  const withZones = rows.filter((r) => r.advanced && ZONE_BASES.some((b) => typeof r.advanced![`zone_${b}_a`] === "number"));
  if (withZones.length === 0) return null;
  const team = zonesFromAdvanced(withZones.map((r) => r.advanced ?? {}));
  const byPlayer = new Map<string, Array<Record<string, unknown>>>();
  for (const r of withZones) {
    const name = (r.source_player_name ?? "—").trim();
    (byPlayer.get(name) ?? byPlayer.set(name, []).get(name)!).push(r.advanced ?? {});
  }
  const players: PlayerZones[] = [...byPlayer.entries()].map(([name, advList]) => {
    const zones = zonesFromAdvanced(advList);
    return { name, zones, totalMade: zones.reduce((s, z) => s + z.made, 0), totalAtt: zones.reduce((s, z) => s + z.att, 0) };
  }).filter((p) => p.totalAtt > 0).sort((a, b) => b.totalAtt - a.totalAtt);
  const games = new Set(withZones.map((r) => r.game_id)).size;
  return { team, players, games };
}

async function loadResults(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<Record<string, GameResult>> {
  const { data } = await supabase.from("basketball_game_results").select("game_id, points_for, points_against").eq("team_id", teamId);
  const out: Record<string, GameResult> = {};
  for (const r of (data ?? []) as Array<{ game_id: string; points_for: number | null; points_against: number | null }>) {
    out[r.game_id] = { pointsFor: r.points_for, pointsAgainst: r.points_against };
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const rows = await loadRows(auth.supabase, auth.teamId);
  if (rows.length === 0) return NextResponse.json({ ok: true, hasData: false, season: null, leaders: null });
  const [results, fourFactors, quarters, tacticalShots, shotZones] = await Promise.all([
    loadResults(auth.supabase, auth.teamId),
    loadFourFactors(auth.supabase, auth.teamId),
    loadQuarterScoring(auth.supabase, auth.teamId),
    loadTacticalShots(auth.supabase, auth.teamId),
    loadShotZones(auth.supabase, auth.teamId),
  ]);
  const season = buildBasketballSeason({ games: aggregateGames(rows), results });
  return NextResponse.json({ ok: true, hasData: true, season, leaders: leaders(rows), fourFactors, quarters, tacticalShots, shotZones });
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
