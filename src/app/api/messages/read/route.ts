export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { resolvePlayerIdForUser } from "@/lib/notifications/auth";
import { getPlayerTeamId, requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { verifiedUserIdFromToken } from "@/lib/auth/verifyAccessToken";

/** The player themself, or a coach of the player's team. */
async function mayMarkThread(sb: SupabaseClient, req: Request, ownPlayerId: string | null, playerId: string): Promise<boolean> {
  if (ownPlayerId && ownPlayerId === playerId) return true;
  const teamId = await getPlayerTeamId(sb, playerId);
  if (!teamId) return false;
  try {
    await requireCoachAccessForTeam(sb, req, teamId);
    return true;
  } catch {
    return false;
  }
}


/**
 * POST /api/messages/read
 * Mark messages as read. Body: { messageIds: string[] } or { playerId, date }
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Vantar auðkenningu" }, { status: 401 });

  const uid = await verifiedUserIdFromToken(supabase, token);
  if (!uid) return NextResponse.json({ error: "Ógilt token" }, { status: 401 });

  const body = await req.json();
  const { messageIds, playerId, date } = body;

  const now = new Date().toISOString();
  const ownPlayerId = await resolvePlayerIdForUser(supabase, uid);

  if (messageIds?.length) {
    const { data: rows, error: readErr } = await supabase
      .from("player_coach_messages")
      .select("id, player_id")
      .in("id", messageIds);
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const list = (rows ?? []) as Array<{ id: string; player_id: string }>;
    const allowedPlayers = new Set<string>();
    for (const playerRowId of new Set(list.map((r) => r.player_id))) {
      if (await mayMarkThread(supabase, req, ownPlayerId, playerRowId)) allowedPlayers.add(playerRowId);
    }
    const allowedIds = list.filter((r) => allowedPlayers.has(r.player_id)).map((r) => r.id);
    if (!allowedIds.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await supabase
      .from("player_coach_messages")
      .update({ read_at: now })
      .in("id", allowedIds)
      .is("read_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (playerId && date) {
    if (!(await mayMarkThread(supabase, req, ownPlayerId, String(playerId)))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { error } = await supabase
      .from("player_coach_messages")
      .update({ read_at: now })
      .eq("player_id", playerId)
      .eq("entry_date", date)
      .is("read_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "Missing messageIds or playerId+date" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
