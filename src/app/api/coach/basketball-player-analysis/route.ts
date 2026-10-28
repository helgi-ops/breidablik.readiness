export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/basketball-player-analysis
 *   GET  ?list=1       → the squad's players that have game data (name + games), for the picker.
 *   POST { player }    → that player's within-squad percentile read (scoring / rebounding /
 *                        playmaking / defence / efficiency), from the SAME merged box-score
 *                        source as Season Match Analysis: all InStat per-player rows plus the
 *                        current-season KKÍ box for games InStat doesn't cover. No upload here —
 *                        it reads what Single/Season Match Analysis already ingested.
 *
 * Descriptive scouting — never touches the readiness colour, load, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { scopeToCurrentSeason, type FibaGame, type FibaBoxRow } from "@/lib/micropulse/basketballStats/fibaGamesRead";
import { initialSurnameKey } from "@/lib/micropulse/statsIngestion/nameMatch";
import { aggregatePlayers, buildBasketballPlayerAnalysis, type BoxLine, type PlayerSeason } from "@/lib/micropulse/basketballStats/basketballPlayerAnalysis";

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

const foldNm = (s: string | null | undefined) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const gkey = (date: string | null, opp: string | null) => `${date ?? "-"}|${foldNm(opp)}`;

/** Merged per-game box lines — InStat per-player rows, plus the current-season KKÍ box for any
 *  game InStat doesn't cover (matched by date + folded opponent). Then aggregate to seasons. */
async function loadSquadSeasons(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<PlayerSeason[]> {
  const { data: prows } = await supabase.from("player_basketball_match_stats")
    .select("game_date, opponent, source_player_name, points, reb, oreb, dreb, assists, steals, blocks, turnovers, fgm, fga, tpm, tpa, ftm, fta")
    .eq("team_id", teamId);
  const lines: BoxLine[] = [];
  const covered = new Set<string>();
  for (const r of ((prows ?? []) as Array<Record<string, unknown>>)) {
    covered.add(gkey(r.game_date as string | null, r.opponent as string | null));
    lines.push({
      name: String(r.source_player_name ?? ""), pts: r.points as number, reb: r.reb as number, oreb: r.oreb as number, dreb: r.dreb as number,
      ast: r.assists as number, stl: r.steals as number, blk: r.blocks as number, tov: r.turnovers as number,
      fgm: r.fgm as number, fga: r.fga as number, tpm: r.tpm as number, tpa: r.tpa as number, ftm: r.ftm as number, fta: r.fta as number,
    });
  }
  const { data: fiba } = await supabase.from("basketball_fiba_games")
    .select("match_id, match_date, opp_name, own_box, season").eq("owner_team_id", teamId);
  const { games } = scopeToCurrentSeason(((fiba ?? []) as FibaGame[]));
  for (const g of games) {
    if (covered.has(gkey(g.match_date, g.opp_name))) continue; // InStat covers this game
    for (const b of ((Array.isArray(g.own_box) ? g.own_box : []) as FibaBoxRow[])) {
      lines.push({ name: String(b.name ?? ""), pts: b.pts, reb: b.reb, oreb: b.oreb, dreb: b.dreb, ast: b.ast, stl: b.stl, blk: b.blk, tov: b.tov, fgm: b.fgm, fga: b.fga, tpm: b.tpm, tpa: b.tpa, ftm: b.ftm, fta: b.fta });
    }
  }
  return aggregatePlayers(lines, initialSurnameKey);
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const seasons = await loadSquadSeasons(auth.supabase, auth.teamId);
  const players = seasons
    .map((p) => ({ name: p.name, games: p.games, ppg: p.ppg }))
    .sort((a, b) => b.ppg - a.ppg);
  return NextResponse.json({ ok: true, players, hasData: players.length > 0 });
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const player = String(body?.player ?? "").trim();
  if (!player) return NextResponse.json({ ok: false, error: "player is required" }, { status: 400 });
  const seasons = await loadSquadSeasons(auth.supabase, auth.teamId);
  const analysis = buildBasketballPlayerAnalysis(seasons, player, initialSurnameKey);
  if (!analysis) return NextResponse.json({ ok: false, error: "No data for that player." }, { status: 404 });
  return NextResponse.json({ ok: true, analysis });
}
