import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { syncGymAware } from "@/lib/integrations/gymaware/sync";

export const runtime = "nodejs";

/**
 * POST /api/player/vbt/sync
 *
 * Allows an authenticated player to trigger a GymAware sync for their team.
 * The sync fetches data for the entire team (GymAware API is team-scoped),
 * but the player only sees their own data afterwards.
 */
export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    // Find the player's team
    const { data: player } = await sb
      .from("players")
      .select("team_id")
      .eq("id", playerId)
      .single();

    if (!player?.team_id) {
      return NextResponse.json({ error: "Player has no team" }, { status: 400 });
    }

    const teamId = player.team_id;

    // Check that GymAware is configured for this team
    const { data: settings } = await sb
      .from("gymaware_settings")
      .select("account_id, last_sync_at")
      .eq("team_id", teamId)
      .maybeSingle();

    if (!settings) {
      return NextResponse.json(
        { error: "GymAware is not configured for your team" },
        { status: 404 },
      );
    }

    // Sync today by default, or use the date range from the request body
    const today = new Date().toISOString().slice(0, 10);
    const result = await syncGymAware(teamId, today);

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Player VBT sync error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
