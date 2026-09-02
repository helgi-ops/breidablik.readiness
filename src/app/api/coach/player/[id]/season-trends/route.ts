/**
 * GET /api/coach/player/[id]/season-trends
 *   → the player's season HSR trend + IMA (accel/decel density + directional balance).
 *
 * Surfacing of already-synced data (player_external_load_daily). Team-scoped. Session/
 * match-level totals — NOT a peak-window HSR curve (not available). Descriptive; never
 * the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { loadSeasonTrends } from "@/lib/micropulse/seasonTrends/loader";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: playerId } = await params;
    const sb = getSupabaseAdmin();
    const { data: pl } = await sb.from("players").select("id, team_id, full_name").eq("id", playerId).maybeSingle();
    const player = pl as { id: string; team_id: string | null; full_name: string | null } | null;
    if (!player?.team_id) throw new Error("Player not found");
    const { teamId } = await requireCoachAccessForTeam(sb, req, player.team_id);
    if (teamId !== player.team_id) throw new Error("Forbidden");

    const trends = await loadSeasonTrends(sb, { playerId, teamId: player.team_id });
    return NextResponse.json({ ok: true, playerName: player.full_name, trends });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = /forbidden/i.test(msg) ? 403 : /not found/i.test(msg) ? 404 : /unauth|token/i.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
