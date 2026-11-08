export const runtime = "nodejs";

/**
 * POST /api/player/link-player { playerId? }
 *
 * Repairs the link between the signed-in account and its player row. The browser can no longer write
 * profiles.player_id / team_id directly.
 *  - No playerId: uses the player row that belongs to this account (players.user_id, then the existing
 *    profiles.player_id) and only fills what is empty. It never moves an account to another team.
 *  - playerId: staff previewing the player view may link a player on a team they coach. A player account
 *    cannot pick a player, because that would hand over another player's data.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getUserIdFromBearer } from "@/lib/notifications/auth";
import { getPlayerTeamId, requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const userId = await getUserIdFromBearer(sb, req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { playerId?: unknown };
    const requested = typeof body.playerId === "string" ? body.playerId.trim() : "";

    const { data: prof, error: profErr } = await sb
      .from("profiles").select("role, team_id, player_id").eq("id", userId).maybeSingle();
    if (profErr) throw new Error(profErr.message);
    const profile = (prof ?? {}) as { role?: string | null; team_id?: string | null; player_id?: string | null };

    if (requested) {
      const teamId = await getPlayerTeamId(sb, requested);
      if (!teamId) return NextResponse.json({ error: "Player not found" }, { status: 404 });
      await requireCoachAccessForTeam(sb, req, teamId); // players get Forbidden here
      const { error } = await sb.from("profiles").update({ player_id: requested }).eq("id", userId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, playerId: requested });
    }

    const { data: own, error: ownErr } = await sb
      .from("players").select("id, team_id").eq("user_id", userId).maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    let player = own as { id: string; team_id: string | null } | null;
    if (!player && profile.player_id) {
      const { data: linked, error: linkedErr } = await sb
        .from("players").select("id, team_id, user_id").eq("id", profile.player_id).maybeSingle();
      if (linkedErr) throw new Error(linkedErr.message);
      const row = linked as { id: string; team_id: string | null; user_id: string | null } | null;
      if (row && (row.user_id == null || row.user_id === userId)) player = row;
    }
    if (!player) return NextResponse.json({ ok: true, linked: false });

    const patch: { player_id?: string; team_id?: string } = {};
    if (!profile.player_id) patch.player_id = player.id;
    if (!profile.team_id && player.team_id) patch.team_id = player.team_id;
    if (Object.keys(patch).length > 0) {
      const { error } = await sb.from("profiles").update(patch).eq("id", userId);
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, linked: true, playerId: player.id, teamId: patch.team_id ?? profile.team_id ?? null });
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return auth;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
