export const runtime = "nodejs";

/**
 * /api/coach/basketball-win-factors — "what wins games in this league".
 *
 *   GET ?list=1                          → the league-seasons available (from tagged games).
 *   GET ?competition=&season=&stage=     → computeWinFactors over that league's stored games.
 *
 * Reads the per-game team boxes already in basketball_fiba_games (source 'fibalivestats'),
 * tagged with competition/season/stage. Descriptive analytics only — never touches the
 * readiness colour or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { computeWinFactors, teamGamesFromFibaGame, type TeamGame } from "@/lib/micropulse/basketballStats/winFactors";

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

type GameRow = { own_name: string | null; opp_name: string | null; own_totals: Record<string, unknown> | null; opp_totals: Record<string, unknown> | null; match_id: string | null; competition_code: string | null; season: string | null; stage: string | null };

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { supabase, teamId } = auth;
  const p = new URL(req.url).searchParams;

  // List available league-seasons (tagged games only).
  const { data: all } = await supabase.from("basketball_fiba_games")
    .select("own_name, opp_name, own_totals, opp_totals, match_id, competition_code, season, stage")
    .eq("owner_team_id", teamId).not("competition_code", "is", null);
  const rows = (all ?? []) as GameRow[];
  const leagues = new Map<string, { competition: string; season: string; stage: string; games: number }>();
  for (const r of rows) {
    if (!r.competition_code || !r.season) continue;
    const stage = r.stage ?? "regular";
    const key = `${r.competition_code}|${r.season}|${stage}`;
    const e = leagues.get(key) ?? { competition: r.competition_code, season: r.season, stage, games: 0 };
    e.games++; leagues.set(key, e);
  }
  const leagueList = [...leagues.values()].sort((a, b) => b.games - a.games);

  if (p.get("list")) return NextResponse.json({ ok: true, leagues: leagueList });

  const competition = (p.get("competition") ?? leagueList[0]?.competition ?? "").trim();
  const season = (p.get("season") ?? leagueList[0]?.season ?? "").trim();
  const stage = (p.get("stage") ?? leagueList[0]?.stage ?? "regular").trim();
  if (!competition || !season) return NextResponse.json({ ok: true, hasData: false, leagues: leagueList });

  const sel = rows.filter((r) => r.competition_code === competition && r.season === season && (r.stage ?? "regular") === stage);
  const teamGames: TeamGame[] = sel.flatMap((g) => teamGamesFromFibaGame(g));
  if (teamGames.length < 4) return NextResponse.json({ ok: true, hasData: false, leagues: leagueList, competition, season, stage });

  const read = computeWinFactors(teamGames);
  return NextResponse.json({ ok: true, hasData: true, leagues: leagueList, competition, season, stage, read });
}
