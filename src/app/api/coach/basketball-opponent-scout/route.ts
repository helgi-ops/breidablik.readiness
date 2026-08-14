export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // the KKÍ pull walks a season's schedule + per-game box scores

/**
 * /api/coach/basketball-opponent-scout
 *   GET ?list=1        → opponents this coach can scout (from their own fixtures) +
 *                        which are already scouted + the KKÍ season id
 *   GET ?opponent=…    → the stored scouting report (team profile + players + defend)
 *   POST { opponent }  → pull that opponent's whole season free from the KKÍ widget
 *
 * Own-team stats only hold your team; this scouts the opponent's OWN season (box scores
 * of every game they played) from the free public KKÍ feed. Descriptive scouting only —
 * it never touches the readiness colour, load, or the daily decision. Coach/team-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildBasketballOpponentReport, type OppPlayerGame } from "@/lib/micropulse/basketballOpponentReport";
import { scoutOpponentSeason } from "@/lib/integrations/basketball/scout";

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
  return { supabase, teamId } as const;
}

const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** The KKÍ season id + season label from the coach's own basketball feed config. */
async function seasonRef(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<{ seasonId: string | null; season: string }> {
  const { data } = await supabase.from("stat_ingestion_config").select("basketball_team_ref").eq("team_id", teamId).maybeSingle();
  const ref = (data as { basketball_team_ref?: string | null } | null)?.basketball_team_ref ?? null;
  const seasonId = ref ? ref.split(":")[0] : null;
  return { seasonId, season: seasonId ?? "" };
}

/** How a specific opponent played AGAINST US, from imported InStat Game Reports.
 *  Keyed by match_ref (our own game rows whose `opponent` folds to the selection),
 *  so it never shows another team's numbers — returns null when nothing matches. */
type FourFactorAvg = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null; games: number };
const foldName = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
async function loadOpponentFourFactors(supabase: ReturnType<typeof getSupabase>, teamId: string, opponent: string): Promise<FourFactorAvg | null> {
  const target = foldName(opponent);
  if (!target) return null;
  const { data: ownRows } = await supabase.from("basketball_team_match_stats")
    .select("match_ref, opponent")
    .eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game").eq("is_opponent", false);
  const refs = ((ownRows ?? []) as Array<{ match_ref: string; opponent: string | null }>)
    .filter((r) => foldName(r.opponent ?? "") === target).map((r) => r.match_ref);
  if (refs.length === 0) return null;
  const { data: oppRows } = await supabase.from("basketball_team_match_stats")
    .select("efg_pct, to_pct, oreb_pct, ftf, ppp")
    .eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game").eq("is_opponent", true)
    .in("match_ref", refs);
  const rows = (oppRows ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  const mean = (key: string, dp: number) => {
    const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * (dp === 2 ? 100 : 10)) / (dp === 2 ? 100 : 10) : null;
  };
  return { efgPct: mean("efg_pct", 1), toPct: mean("to_pct", 1), orebPct: mean("oreb_pct", 1), ftf: mean("ftf", 1), ppp: mean("ppp", 2), games: refs.length };
}

/** Build the opponent's scouting rows from imported InStat Game Reports — the
 *  opponent's per-player shooting lines we stored (opp_players) for every game we
 *  played them. Maps to the same OppPlayerGame shape the KKÍ path uses, so the one
 *  report engine serves both. Scoring/shooting only (the InStat FG table has no
 *  rebound/assist/defensive columns); those come from a KKÍ pull. */
type InstatOppPlayer = { name?: string; minutes?: number | null; points?: number | null; fg?: { m: number | null; a: number | null }; threePt?: { m: number | null; a: number | null } };
type CourtRegion = { key: "paint" | "mid" | "three"; made: number; att: number; pct: number | null };
/** Sum the opponent's shot-map regions across our head-to-head games. */
function aggregateCourtRegions(perGame: CourtRegion[][]): CourtRegion[] | null {
  const acc = new Map<CourtRegion["key"], { m: number; a: number }>();
  for (const g of perGame) for (const r of g) {
    const cur = acc.get(r.key) ?? { m: 0, a: 0 };
    cur.m += r.made ?? 0; cur.a += r.att ?? 0;
    acc.set(r.key, cur);
  }
  const order: CourtRegion["key"][] = ["paint", "mid", "three"];
  const out = order.filter((k) => acc.has(k)).map((k) => {
    const s = acc.get(k)!;
    return { key: k, made: s.m, att: s.a, pct: s.a > 0 ? Math.round((s.m / s.a) * 1000) / 10 : null };
  });
  return out.length ? out : null;
}
async function loadInstatOpponentGames(supabase: ReturnType<typeof getSupabase>, teamId: string, opponent: string): Promise<{ games: OppPlayerGame[]; gameCount: number; courtRegions: CourtRegion[] | null }> {
  const target = foldName(opponent);
  if (!target) return { games: [], gameCount: 0, courtRegions: null };
  const { data: ownRows } = await supabase.from("basketball_team_match_stats")
    .select("match_ref, match_date, opponent, advanced")
    .eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game").eq("is_opponent", false);
  const rows = ((ownRows ?? []) as Array<{ match_ref: string; match_date: string | null; opponent: string | null; advanced: Record<string, unknown> | null }>)
    .filter((r) => foldName(r.opponent ?? "") === target && Array.isArray((r.advanced ?? {}).opp_players));
  const games: OppPlayerGame[] = [];
  const refs = new Set<string>();
  const courtPerGame: CourtRegion[][] = [];
  for (const r of rows) {
    refs.add(r.match_ref);
    const adv = r.advanced ?? {};
    const opp = (adv.opp_players ?? []) as InstatOppPlayer[];
    for (const p of opp) {
      const name = String(p.name ?? "—").trim();
      games.push({
        gameId: r.match_ref, gameDate: r.match_date ?? null, opponent: null, homeAway: null,
        playerName: name, playerRef: `instat:${foldName(name)}`,
        minutes: num(p.minutes), points: num(p.points),
        fgm: num(p.fg?.m), fga: num(p.fg?.a), tpm: num(p.threePt?.m), tpa: num(p.threePt?.a),
        ftm: null, fta: null, oreb: null, dreb: null, reb: null,
        assists: null, steals: null, blocks: null, turnovers: null, fouls: null,
      });
    }
    if (Array.isArray(adv.opp_court_regions)) courtPerGame.push(adv.opp_court_regions as CourtRegion[]);
  }
  return { games, gameCount: refs.size, courtRegions: aggregateCourtRegions(courtPerGame) };
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const url = new URL(req.url);

  if (url.searchParams.get("list")) {
    const { seasonId } = await seasonRef(auth.supabase, auth.teamId);
    // Opponents the coach has actually faced (from own games) — the scoutable set.
    const { data: own } = await auth.supabase.from("player_basketball_match_stats").select("opponent").eq("team_id", auth.teamId);
    const opponents = Array.from(new Set(((own ?? []) as Array<{ opponent: string | null }>).map((r) => (r.opponent ?? "").trim()).filter(Boolean))).sort();
    const { data: scouted } = await auth.supabase.from("scout_basketball_season").select("opponent_name, games, synced_at").eq("owner_team_id", auth.teamId);
    const scoutMap = new Map(((scouted ?? []) as Array<{ opponent_name: string; games: number | null; synced_at: string | null }>).map((s) => [s.opponent_name, s]));
    return NextResponse.json({
      ok: true, seasonId,
      opponents: opponents.map((name) => ({ name, scouted: scoutMap.has(name), games: scoutMap.get(name)?.games ?? null, syncedAt: scoutMap.get(name)?.synced_at ?? null })),
    });
  }

  const opponent = (url.searchParams.get("opponent") ?? "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent is required" }, { status: 400 });
  const oppFourFactors = await loadOpponentFourFactors(auth.supabase, auth.teamId, opponent);
  const { data: seasonRow } = await auth.supabase.from("scout_basketball_season")
    .select("id, games, synced_at, season_id").eq("owner_team_id", auth.teamId).eq("opponent_name", opponent).maybeSingle();
  if (!seasonRow) {
    // No KKÍ season pulled — build the report from imported InStat Game Reports
    // (our head-to-head games) if we have any. Scouting via InStat, not just KKÍ.
    const instat = await loadInstatOpponentGames(auth.supabase, auth.teamId, opponent);
    if (instat.games.length > 0) {
      const report = buildBasketballOpponentReport(opponent, instat.games);
      return NextResponse.json({ ok: true, scouted: true, reportSource: "instat", instatGames: instat.gameCount, report, oppFourFactors, oppCourtRegions: instat.courtRegions });
    }
    return NextResponse.json({ ok: true, scouted: false, report: null, oppFourFactors });
  }
  const scoutSeasonId = (seasonRow as { id: string }).id;
  const { data: rows } = await auth.supabase.from("scout_basketball_player_game")
    .select("game_id, game_date, opponent, home_away, player_name, player_ref, minutes, points, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, reb, assists, steals, blocks, turnovers, fouls")
    .eq("scout_season_id", scoutSeasonId).limit(5000);
  const games: OppPlayerGame[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    gameId: String(r.game_id ?? ""), gameDate: (r.game_date as string) ?? null, opponent: (r.opponent as string) ?? null,
    homeAway: r.home_away === "home" ? "home" : r.home_away === "away" ? "away" : null,
    playerName: String(r.player_name ?? "—"), playerRef: String(r.player_ref ?? r.player_name ?? ""),
    minutes: num(r.minutes), points: num(r.points), fgm: num(r.fgm), fga: num(r.fga), tpm: num(r.tpm), tpa: num(r.tpa),
    ftm: num(r.ftm), fta: num(r.fta), oreb: num(r.oreb), dreb: num(r.dreb), reb: num(r.reb),
    assists: num(r.assists), steals: num(r.steals), blocks: num(r.blocks), turnovers: num(r.turnovers), fouls: num(r.fouls),
  }));
  const report = buildBasketballOpponentReport(opponent, games);
  return NextResponse.json({ ok: true, scouted: true, reportSource: "kki", syncedAt: (seasonRow as { synced_at: string | null }).synced_at, report, oppFourFactors });
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const opponent = String(body?.opponent ?? "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent is required" }, { status: 400 });
  const { seasonId, season } = await seasonRef(auth.supabase, auth.teamId);
  if (!seasonId) return NextResponse.json({ ok: false, error: "No KKÍ season configured for this team (set the basketball feed reference first)." }, { status: 400 });
  const res = await scoutOpponentSeason(auth.supabase, auth.teamId, seasonId, opponent, season);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error ?? "Scout pull failed" }, { status: 502 });
  return NextResponse.json({ ok: true, games: res.games, rows: res.rows });
}
