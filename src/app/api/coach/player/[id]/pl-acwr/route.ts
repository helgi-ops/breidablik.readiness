/**
 * /api/coach/player/[id]/pl-acwr
 *
 * Returns the Player Load ACWR payload for a single player today, plus a
 * 28-day daily series for sparkline display. Pulls from
 * `player_external_load_daily.total_player_load` (source='catapult').
 *
 * Response shape:
 *   {
 *     ok: true,
 *     playerId, date,
 *     payload: AcwrPayload,
 *     trend: Array<{ date: string; load: number | null }>,
 *   }
 *
 * Auth: coach access required (any team-coach token bound to the player's team).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadPlayerLoadAcwr } from "@/lib/micropulse/playerLoadAcwr/loader";

export const runtime = "nodejs";


async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 } as const;
  }
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { userId, teamId } as const;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  }

  const auth = await getCoachTeam(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabase();

  // Verify player belongs to coach's team.
  const { data: playerCheck } = await supabase
    .from("players")
    .select("id, team_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const startIso = (() => {
    const d = new Date(`${todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 27);
    return d.toISOString().slice(0, 10);
  })();

  const payload = await loadPlayerLoadAcwr(supabase, { playerId, todayIso });

  // Trend series for sparkline — daily total_player_load over last 28 days.
  const { data: trendRows } = await supabase
    .from("player_external_load_daily")
    .select("date, total_player_load")
    .eq("player_id", playerId)
    .eq("source", "catapult")
    .gte("date", startIso)
    .lte("date", todayIso)
    .order("date", { ascending: true });

  const trend = ((trendRows ?? []) as Array<{ date: string; total_player_load: number | null }>)
    .map((r) => ({ date: r.date, load: r.total_player_load }));

  return NextResponse.json({
    ok: true,
    playerId,
    date: todayIso,
    payload,
    trend,
  });
}
