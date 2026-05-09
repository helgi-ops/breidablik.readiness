/**
 * GET /api/player/recovery-assignments
 *
 * Returns the current player's pending + recently-completed recovery
 * assignments (today and tomorrow window by default).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadAssignmentsForPlayer } from "@/lib/recovery/loader";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  // Resolve player id from user
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (!player?.id) {
    return NextResponse.json({ ok: true, assignments: [] });
  }

  const assignments = await loadAssignmentsForPlayer(supabase, { playerId: player.id });
  return NextResponse.json({ ok: true, assignments });
}
