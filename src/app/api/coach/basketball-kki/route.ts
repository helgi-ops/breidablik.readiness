export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/coach/basketball-kki
 *   GET  ?url=<kki.is Leikur link>  (or ?gameId=&seasonId=)  → single-match read (box/factors/quarters/…).
 *   POST { save, url|gameId+seasonId, competitionCode, stage?, ownTeamName?, matchDate? }
 *        → persist ONE already-viewed game into basketball_fiba_games (tagged), so it reaches the player
 *          Match report + the league reads.
 *   POST { pullSchedule, seasonId, stageId?, competitionCode, stage?, teamName?, max? }
 *        → pull a whole competition's schedule and ingest every finished game our team plays in.
 *
 * Single-match reads come straight from KKÍ.is — the free baskethotel widget feed the kki.is match page
 * uses (FIBA LiveStats blocks server fetches with a 403; this is the robust public alternative). Returns
 * the FULL box score for BOTH teams, team totals and the Four Factors (Oliver 2004). The shot chart is a
 * separate image endpoint (/api/coach/player-stats/shot-chart). Coach-scoped, descriptive only — NEVER the
 * readiness colour, the load or the daily decision.
 *
 * Reserve / B-team games (e.g. a 1. deild side whose players are on the main roster) are stored under the
 * SAME owner_team_id as the main team but tagged with their own competition_code, so a player who plays
 * both sees all their games in one report (labelled per competition) while the Úrvalsdeild league read
 * stays competition-scoped and is never polluted.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseBoxScore, parseQuarterScores, parseAdvancedStats, parseGameDate, parseSchedule } from "@/lib/micropulse/basketballStats/parseWidget";
import { buildBoxScoreUrl, buildGameViewUrl, buildAdvancedStatsUrl, buildScheduleUrl, fetchWidget, parseKkiGameUrl, DEFAULT_STAGE_ID } from "@/lib/integrations/basketball/kkiWidget";
import { initialSurnameKey } from "@/lib/micropulse/statsIngestion/nameMatch";
import { currentBasketballSeasonLabel } from "@/lib/micropulse/basketballStats/season";

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

type P = {
  name: string; ref: string | null; min: string | null; pts: number;
  twoM: number; twoA: number; threeM: number; threeA: number; fgM: number; fgA: number; ftM: number; ftA: number;
  oreb: number; dreb: number; reb: number; ast: number; fouls: number; to: number; stl: number; blk: number;
  eff: number | null; pm: number | null;
};
type FF = { efg: number; tovPct: number; orebPct: number; ftRate: number; tp3: number };
type Team = { name: string; players: P[]; totals: Record<string, number>; factors?: FF | null };

/** Fetch + parse a KKÍ game's box score into per-team player rows (both sides). Throws on fetch failure. */
async function fetchTeams(gameId: string, seasonId: string, teamId: string): Promise<Team[]> {
  const rows = parseBoxScore(await fetchWidget(buildBoxScoreUrl(gameId, seasonId)), gameId, teamId, "baskethotel");
  if (rows.length === 0) return [];
  const player = (r: typeof rows[number]): P => ({
    name: r.playerName, ref: r.sourcePlayerRef, min: r.minutes == null ? null : String(r.minutes), pts: n(r.points),
    twoM: n(r.fgm) - n(r.tpm), twoA: n(r.fga) - n(r.tpa), threeM: n(r.tpm), threeA: n(r.tpa),
    fgM: n(r.fgm), fgA: n(r.fga), ftM: n(r.ftm), ftA: n(r.fta),
    oreb: n(r.oreb), dreb: n(r.dreb), reb: n(r.reb),
    ast: n(r.assists), fouls: n(r.fouls), to: n(r.turnovers), stl: n(r.steals), blk: n(r.blocks),
    eff: r.efficiency ?? null, pm: r.plusMinus ?? null,
  });
  const sum = (ps: P[], k: keyof P) => ps.reduce((a, p) => a + n(p[k] as number), 0);
  const byTeam = new Map<string, P[]>();
  for (const r of rows) { const t = r.team ?? "—"; const arr = byTeam.get(t) ?? []; arr.push(player(r)); byTeam.set(t, arr); }
  return [...byTeam.entries()].map(([name, players]) => ({
    name,
    players: players.sort((a, b) => b.pts - a.pts),
    totals: {
      pts: sum(players, "pts"), reb: sum(players, "reb"), oreb: sum(players, "oreb"), dreb: sum(players, "dreb"),
      ast: sum(players, "ast"), stl: sum(players, "stl"), blk: sum(players, "blk"), to: sum(players, "to"), fouls: sum(players, "fouls"),
      fgM: sum(players, "fgM"), fgA: sum(players, "fgA"), threeM: sum(players, "threeM"), threeA: sum(players, "threeA"),
      ftM: sum(players, "ftM"), ftA: sum(players, "ftA"), twoM: sum(players, "twoM"), twoA: sum(players, "twoA"),
    },
  }));
}

/** Four Factors (Oliver 2004) between the two teams. */
function withFourFactors(teams: Team[]): Team[] {
  const factorsFor = (t: Team, opp: Team): FF => {
    const b = t.totals, o = opp.totals;
    return {
      efg: b.fgA > 0 ? (b.fgM + 0.5 * b.threeM) / b.fgA : 0,
      tovPct: b.fgA + 0.44 * b.ftA + b.to > 0 ? b.to / (b.fgA + 0.44 * b.ftA + b.to) : 0,
      orebPct: b.oreb + o.dreb > 0 ? b.oreb / (b.oreb + o.dreb) : 0,
      ftRate: b.fgA > 0 ? b.ftM / b.fgA : 0,
      tp3: b.threeA > 0 ? b.threeM / b.threeA : 0,
    };
  };
  return teams.length === 2
    ? teams.map((t, i) => ({ ...t, factors: factorsFor(t, teams[i === 0 ? 1 : 0]) }))
    : teams.map((t) => ({ ...t, factors: null }));
}

/** The box-score shape the player Match report + league reads expect (FIBA own_box/opp_box keys). */
function storedBox(players: P[]) {
  return players.map((p) => ({
    name: p.name, min: p.min, pts: p.pts, reb: p.reb, oreb: p.oreb, dreb: p.dreb, ast: p.ast,
    stl: p.stl, blk: p.blk, tov: p.to, fgm: p.fgM, fga: p.fgA, tpm: p.threeM, tpa: p.threeA,
    ftm: p.ftM, fta: p.ftA, pip: 0, pm: p.pm,
  }));
}
function storedTotals(t: Team) {
  return {
    pts: t.totals.pts, reb: t.totals.reb, oreb: t.totals.oreb, dreb: t.totals.dreb, ast: t.totals.ast,
    stl: t.totals.stl, blk: t.totals.blk, tov: t.totals.to, fgm: t.totals.fgM, fga: t.totals.fgA,
    tpm: t.totals.threeM, tpa: t.totals.threeA, ftm: t.totals.ftM, fta: t.totals.ftA,
  };
}

/** Decide which of the two sides is OUR team: most roster-name overlap wins, else a name match, else an
 *  explicit ownTeamName override. Returns [ownIndex, reason] or null when it can't be resolved. */
function resolveOwnSide(
  teams: Team[], rosterKeys: Set<string>, teamName: string | null, ownTeamName?: string | null,
): { ownIdx: number; how: string } | null {
  if (teams.length === 0) return null;
  if (teams.length === 1) return { ownIdx: 0, how: "only side" };
  if (ownTeamName) {
    const want = norm(ownTeamName);
    const i = teams.findIndex((t) => { const x = norm(t.name); return x === want || x.includes(want) || want.includes(x); });
    if (i >= 0) return { ownIdx: i, how: "name override" };
  }
  // Roster overlap (initial+surname) — robust even if the B-team is named slightly differently.
  const overlap = teams.map((t) => t.players.reduce((c, p) => c + (rosterKeys.has(initialSurnameKey(p.name)) ? 1 : 0), 0));
  const best = Math.max(...overlap);
  if (best > 0 && overlap.filter((c) => c === best).length === 1) return { ownIdx: overlap.indexOf(best), how: `roster overlap (${best})` };
  // Fall back to a name match against the configured team name.
  if (teamName) {
    const want = norm(teamName);
    const i = teams.findIndex((t) => { const x = norm(t.name); return x === want || x.includes(want) || want.includes(x); });
    if (i >= 0) return { ownIdx: i, how: "team name" };
  }
  return null;
}

async function authCoach(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "No team", status: 400 } as const;
  return { supabase, teamId } as const;
}

/** Resolve a season_id from the link, else the team's configured KKÍ season. */
async function resolveSeason(supabase: ReturnType<typeof getSupabase>, teamId: string, fromLink: string | null): Promise<string> {
  if (fromLink && /^\d+$/.test(fromLink)) return fromLink;
  const { data: cfg } = await supabase.from("stat_ingestion_config").select("basketball_team_ref").eq("team_id", teamId).maybeSingle();
  return (((cfg as { basketball_team_ref?: string | null } | null)?.basketball_team_ref ?? "").split(":")[0] ?? "").trim();
}

export async function GET(req: NextRequest) {
  const a = await authCoach(req);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const { supabase, teamId } = a;

  const sp = new URL(req.url).searchParams;
  const parsed = sp.get("url") ? parseKkiGameUrl(sp.get("url")!) : { gameId: sp.get("gameId"), seasonId: sp.get("seasonId") };
  const gameId = (parsed.gameId ?? "").trim();
  if (!/^\d+$/.test(gameId)) return NextResponse.json({ ok: false, error: "Could not read a game_id from that link." }, { status: 400 });
  const seasonId = await resolveSeason(supabase, teamId, parsed.seasonId);
  if (!/^\d+$/.test(seasonId)) return NextResponse.json({ ok: false, error: "No season_id in the link and none configured." }, { status: 400 });

  let teams: Team[];
  try {
    teams = withFourFactors(await fetchTeams(gameId, seasonId, teamId));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "KKÍ fetch failed" }, { status: 502 });
  }
  if (teams.length === 0) return NextResponse.json({ ok: false, error: "No box score for that game." }, { status: 404 });

  // Quarter line score + advanced team-comparison stats — both best-effort.
  let quarters: { a: number[]; b: number[] } | null = null;
  let advanced: Array<{ label: string; a: string; b: string }> = [];
  await Promise.all([
    (async () => { try { quarters = parseQuarterScores(await fetchWidget(buildGameViewUrl(gameId, seasonId))); } catch { /* optional */ } })(),
    (async () => { try { advanced = parseAdvancedStats(await fetchWidget(buildAdvancedStatsUrl(gameId, seasonId))); } catch { /* optional */ } })(),
  ]);

  const allPlayers = teams.flatMap((t) => t.players.map((p) => ({ ...p, team: t.name })));
  const leaderIn = (key: keyof P, labelEn: string, labelIs: string) => {
    const top = allPlayers.reduce<(typeof allPlayers)[number] | null>((best, p) => (n(p[key] as number) > n((best?.[key] as number) ?? -1) ? p : best), null);
    return top && n(top[key] as number) > 0 ? { labelEn, labelIs, name: top.name, team: top.team, value: n(top[key] as number) } : null;
  };
  const leaders = [
    leaderIn("pts", "Points", "Stig"), leaderIn("reb", "Rebounds", "Fráköst"), leaderIn("ast", "Assists", "Stoðsendingar"),
    leaderIn("stl", "Steals", "Stolnir"), leaderIn("blk", "Blocks", "Varin skot"),
  ].filter((x): x is NonNullable<typeof x> => x != null);

  return NextResponse.json({ ok: true, gameId, seasonId, teams, quarters, advanced, leaders });
}

type SaveResult = { ok: true; gameId: string; own: string; opp: string; how: string; date: string | null } | { ok: false; gameId: string; error: string };

/** Fetch one KKÍ game, resolve our side, and upsert it into basketball_fiba_games (tagged). */
async function ingestOne(
  supabase: ReturnType<typeof getSupabase>, teamId: string, gameId: string, seasonId: string,
  rosterKeys: Set<string>, teamName: string | null,
  tag: { competitionCode: string; season: string; stage: string }, ownTeamName?: string | null, matchDate?: string | null,
): Promise<SaveResult> {
  let teams: Team[];
  try { teams = await fetchTeams(gameId, seasonId, teamId); }
  catch (e) { return { ok: false, gameId, error: e instanceof Error ? e.message : "fetch failed" }; }
  if (teams.length < 2) return { ok: false, gameId, error: "no two-team box score" };

  const own = resolveOwnSide(teams, rosterKeys, teamName, ownTeamName);
  if (!own) return { ok: false, gameId, error: "Could not tell which side is your team — pass the team name." };
  const ownTeam = teams[own.ownIdx];
  const oppTeam = teams[own.ownIdx === 0 ? 1 : 0];

  let date = matchDate && /^\d{4}-\d{2}-\d{2}$/.test(matchDate) ? matchDate : null;
  if (!date) { try { date = parseGameDate(await fetchWidget(buildGameViewUrl(gameId, seasonId))); } catch { /* no date */ } }

  const { error } = await supabase.from("basketball_fiba_games").upsert({
    owner_team_id: teamId, match_id: `kki-${gameId}`, match_date: date, own_tno: 1,
    own_name: ownTeam.name, opp_name: oppTeam.name,
    own_totals: storedTotals(ownTeam), opp_totals: storedTotals(oppTeam),
    own_box: storedBox(ownTeam.players), opp_box: storedBox(oppTeam.players),
    competition_code: tag.competitionCode, season: tag.season, stage: tag.stage,
    synced_at: new Date().toISOString(),
  } as never, { onConflict: "owner_team_id,match_id" });
  if (error) return { ok: false, gameId, error: `save failed: ${error.message}` };
  return { ok: true, gameId, own: ownTeam.name, opp: oppTeam.name, how: own.how, date };
}

export async function POST(req: NextRequest) {
  const a = await authCoach(req);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  const { supabase, teamId } = a;

  let body: {
    save?: boolean; pullSchedule?: boolean; url?: string; gameId?: string; seasonId?: string; stageId?: string;
    competitionCode?: string; stage?: string; season?: string; ownTeamName?: string; teamName?: string; matchDate?: string; max?: number;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Expected JSON body" }, { status: 400 }); }

  const competitionCode = String(body.competitionCode ?? "").trim();
  if (!competitionCode) return NextResponse.json({ ok: false, error: "competitionCode is required (which competition these games belong to)." }, { status: 400 });
  const stage = String(body.stage ?? "regular").trim() || "regular";
  // Human season label (e.g. "2026-27") — tags the game for season-scoping. Defaults to the current
  // basketball season, NEVER a bare numeric KKÍ id (that would break season ordering in the report).
  const seasonLabel = String(body.season ?? "").trim() || currentBasketballSeasonLabel();

  const { data: teamRow } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  const teamName = (teamRow as { name?: string } | null)?.name ?? null;
  const { data: roster } = await supabase.from("players").select("full_name, is_active").eq("team_id", teamId);
  const rosterKeys = new Set(((roster ?? []) as Array<{ full_name: string | null; is_active: boolean | null }>)
    .filter((p) => p.is_active !== false).map((p) => initialSurnameKey(p.full_name ?? "")).filter(Boolean));

  // ── Bulk: pull a whole competition's schedule and ingest every finished game our team plays. ──
  if (body.pullSchedule) {
    const seasonId = String(body.seasonId ?? "").trim();
    if (!/^\d+$/.test(seasonId)) return NextResponse.json({ ok: false, error: "A numeric season_id is required to pull a schedule." }, { status: 400 });
    const stageId = String(body.stageId ?? "").trim() || DEFAULT_STAGE_ID;
    const want = norm(body.teamName?.trim() || teamName || "");
    if (!want) return NextResponse.json({ ok: false, error: "No team name to match in the schedule — pass teamName." }, { status: 400 });
    const season = seasonLabel;
    const tag = { competitionCode, season, stage };

    // Walk schedule pages until one returns no new games (cap to be kind to the feed).
    const games: Array<{ gameId: string; date: string; home: string; away: string }> = [];
    const seen = new Set<string>();
    for (let page = 0; page < 6; page++) {
      let parsedGames;
      try { parsedGames = parseSchedule(await fetchWidget(buildScheduleUrl(seasonId, stageId, page))); }
      catch { break; }
      const fresh = parsedGames.filter((g) => g.finished && !seen.has(g.gameId));
      if (fresh.length === 0) break;
      for (const g of fresh) {
        seen.add(g.gameId);
        const mine = norm(g.homeTeam).includes(want) || want.includes(norm(g.homeTeam)) || norm(g.awayTeam).includes(want) || want.includes(norm(g.awayTeam));
        if (mine) games.push({ gameId: g.gameId, date: g.date, home: g.homeTeam, away: g.awayTeam });
      }
    }
    if (games.length === 0) return NextResponse.json({ ok: false, error: `No finished games for "${body.teamName || teamName}" in that season/stage.` }, { status: 404 });

    const cap = Math.min(40, Math.max(1, Number(body.max) || 40));
    const results: SaveResult[] = [];
    for (const g of games.slice(0, cap)) {
      results.push(await ingestOne(supabase, teamId, g.gameId, season, rosterKeys, teamName, tag, body.ownTeamName, g.date || null));
    }
    await supabase.from("basketball_fiba_ingest_blocks").upsert({
      owner_team_id: teamId, competition_code: competitionCode, season, stage,
      gameid_start: 0, gameid_end: 0, games_ingested: results.filter((r) => r.ok).length, computed_at: new Date().toISOString(),
    } as never, { onConflict: "owner_team_id,competition_code,season,stage" }).then(() => {}, () => {});
    return NextResponse.json({
      ok: true, pullSchedule: true, competitionCode, season, stage,
      found: games.length, imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results,
    });
  }

  // ── Single: persist one already-viewed game. ──
  if (body.save) {
    const parsed = body.url ? parseKkiGameUrl(body.url) : { gameId: body.gameId ?? null, seasonId: body.seasonId ?? null };
    const gameId = (parsed.gameId ?? "").trim();
    if (!/^\d+$/.test(gameId)) return NextResponse.json({ ok: false, error: "Could not read a game_id." }, { status: 400 });
    const seasonId = await resolveSeason(supabase, teamId, parsed.seasonId);
    if (!/^\d+$/.test(seasonId)) return NextResponse.json({ ok: false, error: "No season_id in the link and none configured." }, { status: 400 });
    const r = await ingestOne(supabase, teamId, gameId, seasonId, rosterKeys, teamName,
      { competitionCode, season: seasonLabel, stage }, body.ownTeamName, body.matchDate);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  return NextResponse.json({ ok: false, error: "Nothing to do — pass save or pullSchedule." }, { status: 400 });
}
