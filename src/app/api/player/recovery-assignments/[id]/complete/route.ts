/**
 * POST /api/player/recovery-assignments/[id]/complete
 *
 * Marks the assignment as completed by the current player. Player can only
 * complete their own assignments (RLS-enforced + double-checked here).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: assignmentId } = await params;
  if (!assignmentId) {
    return NextResponse.json({ error: "Missing assignment id" }, { status: 400 });
  }

  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (!player?.id) return NextResponse.json({ error: "Player not found" }, { status: 403 });

  const { data: assignment } = await supabase
    .from("recovery_protocol_assignments")
    .select("id, player_id, completed_at")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!assignment || assignment.player_id !== player.id) {
    return NextResponse.json({ error: "Not your assignment" }, { status: 403 });
  }

  if (assignment.completed_at) {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  const { error } = await supabase
    .from("recovery_protocol_assignments")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", assignmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
