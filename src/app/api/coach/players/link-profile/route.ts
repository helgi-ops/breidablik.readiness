export const runtime = "nodejs";

/**
 * POST /api/coach/players/link-profile { playerId }
 *
 * After a coach approves a player: makes sure that player's account points at the player row.
 * The coach must have access to the player's team, only a PLAYER account is touched, and only
 * when it has no player link yet.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const body = (await req.json().catch(() => ({}))) as { playerId?: unknown };
    const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
    if (!playerId) return NextResponse.json({ error: "playerId is required" }, { status: 400 });

    const { data, error: playerErr } = await sb
      .from("players").select("team_id, user_id").eq("id", playerId).maybeSingle();
    if (playerErr) throw new Error(playerErr.message);
    const player = data as { team_id: string | null; user_id: string | null } | null;
    if (!player?.team_id) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    await requireCoachAccessForTeam(sb, req, player.team_id);
    if (!player.user_id) return NextResponse.json({ ok: true, linked: false });

    const { error } = await sb
      .from("profiles")
      .update({ player_id: playerId, team_id: player.team_id })
      .eq("id", player.user_id)
      .ilike("role", "player")
      .is("player_id", null);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, linked: true });
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return auth;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
