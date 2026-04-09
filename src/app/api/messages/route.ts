export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu" };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Ógilt token" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, team_id, player_id")
    .eq("id", userRes.user.id)
    .maybeSingle();

  if (!profile) return { error: "Profile not found" };

  return { uid: userRes.user.id, profile, supabase };
}

/**
 * GET /api/messages?playerId=...&date=...
 * Fetch chat thread for a player on a given date.
 */
export async function GET(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { supabase } = result;

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

/**
 * POST /api/messages
 * Send a new message. Body: { playerId, entryDate, body }
 */
export async function POST(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { uid, profile, supabase } = result;

  const body = await req.json();
  const { playerId, entryDate, body: messageBody } = body;

  if (!playerId || !messageBody?.trim()) {
    return NextResponse.json({ error: "Missing playerId or body" }, { status: 400 });
  }

  const senderRole = profile.role === "admin" ? "admin" : profile.role === "coach" ? "coach" : "player";

  // Verify access: players must be themselves
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
