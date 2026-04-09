import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/messages?playerId=...&date=...
 * Fetch chat thread for a player on a given date.
 *
 * POST /api/messages
 * Send a new message. Body: { playerId, entryDate, body }
 */

export async function GET(req: NextRequest) {
  const { getSupabaseServer } = await import("@/lib/supabaseServer");
  const supabase = getSupabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const date = url.searchParams.get("date");

  if (!playerId) return NextResponse.json({ error: "Missing playerId" }, { status: 400 });

  let query = supabase
    .from("player_coach_messages")
    .select("*")
    .eq("player_id", playerId)
    .order("created_at", { ascending: true });

  if (date) {
    query = query.eq("entry_date", date);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { getSupabaseServer } = await import("@/lib/supabaseServer");
  const supabase = getSupabaseServer();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uid = auth.user.id;

  const body = await req.json();
  const { playerId, entryDate, body: messageBody } = body;

  if (!playerId || !messageBody?.trim()) {
    return NextResponse.json({ error: "Missing playerId or body" }, { status: 400 });
  }

  // Determine sender role and team
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, team_id, player_id")
    .eq("id", uid)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const senderRole = profile.role === "admin" ? "admin" : profile.role === "coach" ? "coach" : "player";

  // Verify access: coaches must be on same team, players must be themselves
  if (senderRole === "player" && profile.player_id !== playerId) {
    return NextResponse.json({ error: "Cannot send messages for other players" }, { status: 403 });
  }

  // Get team_id from the player
  const { data: player } = await supabase
    .from("players")
    .select("team_id")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  if (senderRole !== "player" && senderRole !== "admin" && profile.team_id !== player.team_id) {
    return NextResponse.json({ error: "Player not on your team" }, { status: 403 });
  }

  const date =
    entryDate ||
    new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });

  const { data: msg, error } = await supabase
    .from("player_coach_messages")
    .insert({
      player_id: playerId,
      team_id: player.team_id,
      entry_date: date,
      sender_id: uid,
      sender_role: senderRole,
      body: messageBody.trim().slice(0, 2000),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: msg });
}
