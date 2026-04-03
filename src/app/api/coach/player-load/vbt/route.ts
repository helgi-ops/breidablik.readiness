import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeExercisePBs, computeTodayVsPB, computeLoadBreakdowns, type VbtSetRow, type VbtPlayerSummary } from "@/lib/micropulse/vbtReadiness/personalBest";

export const runtime = "nodejs";

/**
 * GET /api/coach/player-load/vbt?teamId=...&date=YYYY-MM-DD
 *
 * Returns VBT strength data for all players on a team:
 * - PB records per exercise per player
 * - Today's performance vs PB
 */
export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId");
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    if (!teamId) {
      return NextResponse.json({ error: "teamId required" }, { status: 400 });
    }

    // Get all players for the team
    const { data: players } = await sb
      .from("players")
      .select("id, full_name")
      .eq("team_id", teamId)
      .order("full_name");

    if (!players?.length) {
      return NextResponse.json({ players: [] });
    }

    const playerIds = players.map((p) => p.id);

    // Fetch all VBT sessions for these players
    const { data: allSets } = await sb
      .from("gymaware_vbt_sessions")
      .select("player_id, session_date, exercise_name, load_kg, reps, mean_velocity, peak_velocity, mean_power, peak_power")
      .in("player_id", playerIds)
      .order("session_date", { ascending: false });

    if (!allSets?.length) {
      return NextResponse.json({
        players: players.map((p) => ({
          playerId: p.id,
          playerName: p.full_name,
          exercises: [],
          todayComparisons: [],
        })),
      });
    }

    // Group sets by player
    const setsByPlayer = new Map<string, VbtSetRow[]>();
    for (const row of allSets as Array<Record<string, unknown>>) {
      const pid = String(row.player_id ?? "");
      if (!pid) continue;
      const arr = setsByPlayer.get(pid) ?? [];
      arr.push({
        session_date: String(row.session_date ?? ""),
        exercise_name: String(row.exercise_name ?? ""),
        load_kg: typeof row.load_kg === "number" ? row.load_kg : null,
        reps: typeof row.reps === "number" ? row.reps : null,
        mean_velocity: typeof row.mean_velocity === "number" ? row.mean_velocity : null,
        peak_velocity: typeof row.peak_velocity === "number" ? row.peak_velocity : null,
        mean_power: typeof row.mean_power === "number" ? row.mean_power : null,
        peak_power: typeof row.peak_power === "number" ? row.peak_power : null,
      });
      setsByPlayer.set(pid, arr);
    }

    // Build summaries
    const summaries: VbtPlayerSummary[] = players.map((p) => {
      const sets = setsByPlayer.get(p.id) ?? [];
      const todaySets = sets.filter((s) => s.session_date === date);
      const historySets = sets.filter((s) => s.session_date !== date);

      return {
        playerId: p.id,
        playerName: p.full_name ?? "",
        exercises: computeExercisePBs(sets),
        todayComparisons: computeTodayVsPB(todaySets, historySets),
        loadBreakdowns: computeLoadBreakdowns(sets),
      };
    });

    // Sort: players with today data first, then by name
    summaries.sort((a, b) => {
      const aHasToday = a.todayComparisons.length > 0 ? 1 : 0;
      const bHasToday = b.todayComparisons.length > 0 ? 1 : 0;
      if (aHasToday !== bHasToday) return bHasToday - aHasToday;
      return a.playerName.localeCompare(b.playerName);
    });

    return NextResponse.json({ date, players: summaries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
