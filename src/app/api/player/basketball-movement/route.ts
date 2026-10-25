export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/player/basketball-movement
 *
 * GET — the PLAYER's OWN indoor movement from Titan IMU sessions (player_external_load_daily,
 * source='titan'): PlayerLoad, load/min, duration, jumps and time-in-intensity (settled/low/mid/high),
 * per session. Each session is flagged game-day when its date matches one of the team's games (from
 * basketball_fiba_games), with the opponent. Self-scoped. Basketball has no GPS — this is the movement
 * read in place of the football match-movement. Descriptive — never the readiness colour.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { scopeToCurrentSeason, type FibaGame } from "@/lib/micropulse/basketballStats/fibaGamesRead";

const nn = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const foldDate = (d: string | null | undefined) => String(d ?? "").slice(0, 10);

type MovementProfile = { settled?: number | null; low?: number | null; mid?: number | null; high?: number | null } | null;

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try { ({ playerId } = await requireAuthedPlayerId(sb, req)); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 }); }

  const { data: p } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  const teamId = (p?.team_id as string | null) ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "Player not linked to a team" }, { status: 400 });

  const { data: team } = await sb.from("teams").select("sport").eq("id", teamId).maybeSingle();
  const isBasketball = String((team as { sport?: string | null } | null)?.sport ?? "").toLowerCase() === "basketball";
  if (!isBasketball) return NextResponse.json({ ok: true, isBasketball: false, sessions: [], summary: null });

  // The team's game dates (current season) → opponent, to flag game-day sessions.
  const { data: gamesRaw } = await sb.from("basketball_fiba_games")
    .select("match_date, opp_name, season").eq("owner_team_id", teamId);
  const { games } = scopeToCurrentSeason(((gamesRaw ?? []) as Array<Pick<FibaGame, "match_date" | "opp_name" | "season">>));
  const gameByDate = new Map<string, string>();
  for (const g of games) { const d = foldDate(g.match_date); if (d) gameByDate.set(d, g.opp_name ?? "—"); }

  // The player's Titan sessions — select the movement_profile sub-object only (not the whole raw blob).
  const { data: rows } = await sb.from("player_external_load_daily")
    .select("date, total_player_load, player_load_per_minute, session_duration_minutes, jumps, impacts, movement_profile:raw_payload_json->movement_profile")
    .eq("player_id", playerId).eq("source", "titan")
    .order("date", { ascending: false });

  type Session = {
    date: string; playerLoad: number | null; loadPerMin: number | null; durationMin: number | null; jumps: number | null; impacts: number | null;
    highMin: number | null; isGameDay: boolean; opponent: string | null;
  };
  const sessions: Session[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => {
    const d = foldDate(r.date as string);
    const mp = (r.movement_profile ?? null) as MovementProfile;
    return {
      date: d, playerLoad: nn(r.total_player_load), loadPerMin: nn(r.player_load_per_minute), durationMin: nn(r.session_duration_minutes),
      jumps: nn(r.jumps), impacts: nn(r.impacts), highMin: nn(mp?.high),
      isGameDay: gameByDate.has(d), opponent: gameByDate.get(d) ?? null,
    };
  });

  const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
  const pl = sessions.map((s) => s.playerLoad).filter((v): v is number => v != null);
  const gameSessions = sessions.filter((s) => s.isGameDay);
  const trainSessions = sessions.filter((s) => !s.isGameDay);
  const summary = sessions.length ? {
    sessions: sessions.length, games: gameSessions.length, trainings: trainSessions.length,
    avgPlayerLoad: avg(pl),
    avgLoadPerMin: avg(sessions.map((s) => s.loadPerMin).filter((v): v is number => v != null)),
    avgJumps: avg(sessions.map((s) => s.jumps).filter((v): v is number => v != null)),
    gameAvgPL: avg(gameSessions.map((s) => s.playerLoad).filter((v): v is number => v != null)),
    trainAvgPL: avg(trainSessions.map((s) => s.playerLoad).filter((v): v is number => v != null)),
    peakPlayerLoad: pl.length ? Math.max(...pl) : null,
  } : null;

  return NextResponse.json({ ok: true, isBasketball: true, sessions, summary });
}
