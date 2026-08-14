export const runtime = "nodejs";

/**
 * GET /api/coach/basketball-match-insights
 *
 * The SINGLE-GAME InStat read for basketball (the counterpart of the season read):
 *   • no ?gameId       → the list of imported InStat games (match_ref + date +
 *                        opponent + own/opp score), newest first, for the picker.
 *   • ?gameId=<ref>    → that one game: team box (own/opp), Four Factors, per-quarter
 *                        scoring, FG-playtype + efficiency mix, and shot zones
 *                        (team + per player).
 *
 * Reuses the same pure aggregation as the season read (instatAggregate), applied to
 * one game instead of the whole season. Descriptive — never touches the readiness
 * colour, load, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import {
  avgFactors, aggregateAdvancedShots, zonesFromAdvanced, playerZonesFromRows, hasZones,
} from "@/lib/micropulse/basketballStats/instatAggregate";

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

type TeamRow = { match_ref: string; match_date: string | null; opponent: string | null; is_opponent: boolean; period: string; points: number | null; advanced: Record<string, unknown> | null } & Record<string, unknown>;

/** List of imported InStat games (own-side game rows), paired with opponent points. */
async function loadGamesList(supabase: ReturnType<typeof getSupabase>, teamId: string) {
  const { data } = await supabase.from("basketball_team_match_stats")
    .select("match_ref, match_date, opponent, is_opponent, points")
    .eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game");
  const rows = (data ?? []) as Array<{ match_ref: string; match_date: string | null; opponent: string | null; is_opponent: boolean; points: number | null }>;
  const byRef = new Map<string, { matchRef: string; date: string | null; opponent: string | null; ownPoints: number | null; oppPoints: number | null }>();
  for (const r of rows) {
    const g = byRef.get(r.match_ref) ?? { matchRef: r.match_ref, date: r.match_date, opponent: r.opponent, ownPoints: null, oppPoints: null };
    if (r.is_opponent) g.oppPoints = r.points; else { g.ownPoints = r.points; g.opponent = r.opponent ?? g.opponent; g.date = r.match_date ?? g.date; }
    byRef.set(r.match_ref, g);
  }
  return [...byRef.values()].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const gameId = new URL(req.url).searchParams.get("gameId");

  if (!gameId) {
    return NextResponse.json({ ok: true, games: await loadGamesList(auth.supabase, auth.teamId) });
  }

  // Single game — team rows (own + opp, all periods) + per-player rows.
  const { data: teamData } = await auth.supabase.from("basketball_team_match_stats")
    .select("match_ref, match_date, opponent, is_opponent, period, points, efg_pct, to_pct, oreb_pct, ftf, ppp, advanced")
    .eq("owner_team_id", auth.teamId).eq("source", "instat").eq("match_ref", gameId);
  const teamRows = (teamData ?? []) as TeamRow[];
  if (teamRows.length === 0) return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });

  const ownGame = teamRows.find((r) => r.period === "game" && r.is_opponent === false) ?? null;
  const oppGame = teamRows.find((r) => r.period === "game" && r.is_opponent === true) ?? null;

  const fourFactors = ownGame || oppGame ? {
    own: avgFactors(ownGame ? [ownGame] : []),
    opp: avgFactors(oppGame ? [oppGame] : []),
  } : null;

  const qPoints = (isOpp: boolean) => (["q1", "q2", "q3", "q4"] as const).map((p) => {
    const row = teamRows.find((r) => r.period === p && r.is_opponent === isOpp);
    return typeof row?.points === "number" ? row.points : null;
  });
  const hasQuarters = teamRows.some((r) => ["q1", "q2", "q3", "q4"].includes(r.period));
  const quarters = hasQuarters ? { own: qPoints(false), opp: qPoints(true), games: 1 } : null;

  const ownAdv = ownGame ? [{ advanced: ownGame.advanced }] : [];
  const playtypes = aggregateAdvancedShots(ownAdv, "pt");
  const efficiency = aggregateAdvancedShots(ownAdv, "eff");
  const tacticalShots = playtypes.length || efficiency.length ? { playtypes, efficiency, games: 1 } : null;

  const { data: playerData } = await auth.supabase.from("player_basketball_match_stats")
    .select("source_player_name, advanced")
    .eq("team_id", auth.teamId).eq("source", "instat").eq("game_id", gameId);
  const playerRows = ((playerData ?? []) as Array<{ source_player_name: string | null; advanced: Record<string, unknown> | null }>).filter((r) => hasZones(r.advanced));
  const shotZones = playerRows.length ? {
    team: zonesFromAdvanced(playerRows.map((r) => r.advanced ?? {})),
    players: playerZonesFromRows(playerRows),
    games: 1,
  } : null;

  return NextResponse.json({
    ok: true,
    match: {
      matchRef: gameId,
      date: ownGame?.match_date ?? oppGame?.match_date ?? null,
      opponent: ownGame?.opponent ?? null,
      ownPoints: ownGame?.points ?? null,
      oppPoints: oppGame?.points ?? null,
    },
    fourFactors, quarters, tacticalShots, shotZones,
  });
}
