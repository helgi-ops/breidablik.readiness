/**
 * GET /api/coach/vbt-fatigue?teamId=...&date=2026-04-04
 *
 * Returns per-player VBT velocity loss flags for a given session date.
 * Detects within-session fatigue: ≥10% velocity drop from first 2 sets baseline.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import {
  detectVelocityLoss,
  type VbtSessionSet,
} from "@/lib/micropulse/vbtReadiness/velocityLoss";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const tz = getOperationalTimezone();
    const dateParam = url.searchParams.get("date")?.trim();
    const dateKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : getDateKeyInTimezone(new Date(), tz);

    // Also check yesterday if today has no data
    const yesterday = (() => {
      const d = new Date(`${dateKey}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    })();

    // Get players for team
    let rosterQuery = sb
      .from("players")
      .select("id, full_name")
      .eq("is_active", true);
    if (teamId) rosterQuery = rosterQuery.eq("team_id", teamId);
    const { data: roster } = await rosterQuery;
    const playerNames = new Map(
      ((roster ?? []) as Array<{ id: string; full_name: string | null }>)
        .map((p) => [p.id, p.full_name ?? "—"])
    );

    // Try today first, then yesterday
    for (const targetDate of [dateKey, yesterday]) {
      let query = sb
        .from("gymaware_vbt_sessions")
        .select("player_id, session_date, exercise_name, load_kg, mean_velocity, gymaware_set_id")
        .eq("session_date", targetDate);
      // Filter to team players
      if (roster?.length) {
        const playerIds = (roster as Array<{ id: string }>).map((p) => p.id);
        query = query.in("player_id", playerIds);
      }

      const { data: sets, error } = await query;
      if (error) continue;
      if (!sets?.length) continue;

      const sessionSets = (sets as unknown as VbtSessionSet[]);
      const results = detectVelocityLoss(sessionSets);

      // Enrich with player names
      const enriched = results.map((r) => ({
        ...r,
        playerName: playerNames.get(r.playerId) ?? "—",
      }));

      return NextResponse.json({
        ok: true,
        date: targetDate,
        players: enriched,
        flaggedCount: enriched.filter((r) => r.hasFatigue).length,
        totalPlayers: enriched.length,
      });
    }

    // No VBT data found
    return NextResponse.json({
      ok: true,
      date: dateKey,
      players: [],
      flaggedCount: 0,
      totalPlayers: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
