export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { resolvePlayerIdForUser } from "@/lib/notifications/auth";
import { getPlayerTeamId, requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { verifiedUserIdFromToken } from "@/lib/auth/verifyAccessToken";


async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu" };

  const uid = await verifiedUserIdFromToken(supabase, token);
  if (!uid) return { error: "Ógilt token" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, team_id, player_id")
    .eq("id", uid)
    .maybeSingle();

  if (!profile) return { error: "Profile not found" };

  return { uid, profile, supabase };
}

/**
 * GET /api/messages/unread-count?playerId=...&role=...
 * Fetch unread message count for a player's chat.
 */
export async function GET(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { supabase, uid } = result;

  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const role = url.searchParams.get("role");

  if (!playerId || !role) {
    return NextResponse.json({ error: "Missing playerId or role" }, { status: 400 });
  }

  if (role !== "player" && role !== "coach") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // A player reads only their own chat; a coach only a player on a team they coach.
  try {
    if (role === "player") {
      const ownPlayerId = await resolvePlayerIdForUser(supabase, uid);
      if (ownPlayerId !== playerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      const teamId = await getPlayerTeamId(supabase, playerId);
      if (!teamId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      await requireCoachAccessForTeam(supabase, req, teamId);
    }
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return auth;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }

  let query = supabase
    .from("player_coach_messages")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .is("read_at", null);

  // Filter by sender_role based on viewerRole. Normalize to lowercase
  // because production profiles store role mixed-case (ADMIN, COACH).
  // STAFF is treated like coach for unread-count purposes.
  const normalizedRole = String(role ?? "").toLowerCase();
  if (normalizedRole === "player") {
    // Player: unread messages FROM coach (sender_role != 'player')
    query = query.neq("sender_role", "player");
  } else if (["coach", "admin", "staff"].includes(normalizedRole)) {
    // Coach/admin/staff: unread messages FROM player (sender_role = 'player')
    query = query.eq("sender_role", "player");
  }

  const { count, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: count ?? 0 });
}
