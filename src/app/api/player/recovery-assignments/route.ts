/**
 * GET /api/player/recovery-assignments
 *
 * Returns the current player's pending + recently-completed recovery
 * assignments (today and tomorrow window by default).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadAssignmentsForPlayer } from "@/lib/recovery/loader";

export const runtime = "nodejs";


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
