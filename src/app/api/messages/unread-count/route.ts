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
 * GET /api/messages/unread-count?playerId=...&role=...
 * Fetch unread message count for a player's chat.
 */
export async function GET(req: NextRequest) {
  const result = await authenticate(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 401 });
  const { supabase } = result;

  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const role = url.searchParams.get("role");

  if (!playerId || !role) {
    return NextResponse.json({ error: "Missing playerId or role" }, { status: 400 });
  }

  if (role !== "player" && role !== "coach") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
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
