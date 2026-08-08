export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never statically cache — always read live DB

/**
 * /api/coach/player-stats/matches
 *
 * Same-match football-vs-physical: player_match_stats ⋈ player_external_load_daily
 * (+ match_player_minutes) on (player_id, match_date). player_match_stats is
 * populated ONLY by Adapter B (Wyscout Data API), so this is empty until that is
 * connected — the UI then shows the labelled empty state. Coach-scoped; never
 * touches the readiness colour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { isWyscoutApiConfigured } from "@/lib/integrations/wyscout/config";
import {
  joinMatchFootballPhysical,
  type MatchFootball, type MatchPhysical, type MatchMinutes,
} from "@/lib/micropulse/statsIngestion/matchJoin";

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

export async function GET(req: NextRequest) {
  const ctx = await authTeam(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const { data: cfg } = await supabase
    .from("stat_ingestion_config").select("source").eq("team_id", teamId).maybeSingle();
  const apiConnected = (cfg as { source?: string } | null)?.source === "wyscout_api" && isWyscoutApiConfigured();

  const { data: statRows } = await supabase
    .from("player_match_stats")
    .select("player_id, match_date, opponent, home_away, minutes, goals, assists, xg, shots, shots_on_target, pass_accuracy_pct, players:player_id(full_name, position)")
    .eq("team_id", teamId)
    .not("player_id", "is", null);

  // One player can have MORE THAN ONE stat row for the same match (e.g. the whole-squad
  // match-report import carries goals/xG, while his per-player CSV carries minutes). Merge
  // them into a single row per (player, match) — field-by-field, first non-null wins — so the
  // table shows one row and React keys stay unique.
  type FootballRow = MatchFootball & { name: string; position: string | null };
  const byKey = new Map<string, FootballRow>();
  const coalesce = (a: number | null, b: number | null) => (a != null ? a : b);
  for (const r of (statRows ?? []) as Array<Record<string, unknown>>) {
    const pj = Array.isArray(r.players) ? r.players[0] : r.players;
    const key = `${String(r.player_id)}|${String(r.match_date)}`;
    const incoming: FootballRow = {
      playerId: String(r.player_id), matchDate: String(r.match_date),
      opponent: (r.opponent as string) ?? null,
      homeAway: (r.home_away === "home" || r.home_away === "away") ? r.home_away : null,
      minutes: num(r.minutes), goals: num(r.goals), assists: num(r.assists), xg: num(r.xg),
      shots: num(r.shots), shotsOnTarget: num(r.shots_on_target), passAccuracyPct: num(r.pass_accuracy_pct),
      name: (pj as { full_name?: string } | null)?.full_name ?? "—",
      position: (pj as { position?: string } | null)?.position ?? null,
    };
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, incoming); continue; }
    byKey.set(key, {
      ...prev,
      opponent: prev.opponent ?? incoming.opponent,
      homeAway: prev.homeAway ?? incoming.homeAway,
      minutes: coalesce(prev.minutes, incoming.minutes),
      goals: coalesce(prev.goals, incoming.goals), assists: coalesce(prev.assists, incoming.assists),
      xg: coalesce(prev.xg, incoming.xg), shots: coalesce(prev.shots, incoming.shots),
      shotsOnTarget: coalesce(prev.shotsOnTarget, incoming.shotsOnTarget),
      passAccuracyPct: coalesce(prev.passAccuracyPct, incoming.passAccuracyPct),
      name: prev.name !== "—" ? prev.name : incoming.name,
      position: prev.position ?? incoming.position,
    });
  }
  const football: FootballRow[] = Array.from(byKey.values());

  if (football.length === 0) {
    return NextResponse.json({ rows: [], apiConnected });
  }

  // Physical + minutes for exactly the match dates present.
  const dates = Array.from(new Set(football.map((f) => f.matchDate)));
  const { data: loadRows } = await supabase
    .from("player_external_load_daily")
    .select("player_id, date, total_distance, max_velocity, total_player_load")
    .eq("team_id", teamId).eq("source", "catapult").in("date", dates);
  const physical: MatchPhysical[] = (loadRows ?? []).map((r) => {
    const mv = num((r as Record<string, unknown>).max_velocity);
    return {
      playerId: String((r as { player_id: string }).player_id),
      matchDate: String((r as { date: string }).date),
      distanceKm: num((r as Record<string, unknown>).total_distance) != null ? Math.round((num((r as Record<string, unknown>).total_distance)! / 100)) / 10 : null,
      topSpeed: mv != null && mv <= 45 ? mv : null,
      playerLoad: num((r as Record<string, unknown>).total_player_load) != null ? Math.round(num((r as Record<string, unknown>).total_player_load)!) : null,
    };
  });
  const { data: minRows } = await supabase
    .from("match_player_minutes").select("player_id, match_date, minutes_played").eq("team_id", teamId).in("match_date", dates);
  const minutes: MatchMinutes[] = (minRows ?? []).map((r) => ({
    playerId: String((r as { player_id: string }).player_id),
    matchDate: String((r as { match_date: string }).match_date),
    minutes: num((r as Record<string, unknown>).minutes_played),
  }));

  const joined = joinMatchFootballPhysical(football, physical, minutes);
  // Re-attach the player display fields (join anchors carry them).
  const nameByPlayer = new Map(football.map((f) => [f.playerId, { name: f.name, position: f.position }]));
  const rows = joined.map((j) => ({ ...j, ...(nameByPlayer.get(j.playerId) ?? { name: "—", position: null }) }));

  return NextResponse.json({ rows, apiConnected });
}
