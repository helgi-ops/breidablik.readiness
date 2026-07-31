export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never statically cache — always read live DB

/**
 * /api/coach/player-stats/basketball-matches
 *
 * Per-game basketball box scores (player_basketball_match_stats) for the coach's
 * team, grouped by game. Populated by the KKÍ feed sync. Descriptive — never
 * touches the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error } = await supabase.auth.getUser(token);
  if (error || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { teamId, supabase } as const;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const madeAtt = (m: number | null, a: number | null) => (m == null && a == null ? null : `${m ?? 0}/${a ?? 0}`);

export async function GET(req: NextRequest) {
  const ctx = await authTeam(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const { data: rows, error } = await supabase
    .from("player_basketball_match_stats")
    .select("game_id, game_date, opponent, home_away, minutes, points, fgm, fga, tpm, tpa, ftm, fta, reb, assists, steals, blocks, turnovers, plus_minus, source_player_name, players:player_id(full_name)")
    .eq("team_id", teamId)
    .order("game_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by game (game_id), players sorted by points desc.
  const byGame = new Map<string, { gameId: string; date: string | null; opponent: string | null; homeAway: string | null; players: unknown[] }>();
  for (const r0 of (rows ?? []) as Array<Record<string, unknown>>) {
    const gid = String(r0.game_id ?? "");
    const g = byGame.get(gid) ?? { gameId: gid, date: (r0.game_date as string) ?? null, opponent: (r0.opponent as string) ?? null, homeAway: (r0.home_away as string) ?? null, players: [] };
    const pj = Array.isArray(r0.players) ? r0.players[0] : r0.players;
    g.players.push({
      name: (pj as { full_name?: string } | null)?.full_name ?? r0.source_player_name ?? "—",
      minutes: num(r0.minutes),
      points: num(r0.points),
      reb: num(r0.reb), assists: num(r0.assists), steals: num(r0.steals), blocks: num(r0.blocks), turnovers: num(r0.turnovers),
      fg: madeAtt(num(r0.fgm), num(r0.fga)), tp: madeAtt(num(r0.tpm), num(r0.tpa)), ft: madeAtt(num(r0.ftm), num(r0.fta)),
      plusMinus: num(r0.plus_minus),
    });
    byGame.set(gid, g);
  }
  const games = [...byGame.values()].map((g) => ({
    ...g,
    players: (g.players as Array<{ points: number | null }>).sort((a, b) => (b.points ?? 0) - (a.points ?? 0)),
  }));

  return NextResponse.json({ games });
}
