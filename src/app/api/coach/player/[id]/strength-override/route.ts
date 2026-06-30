/**
 * /api/coach/player/[id]/strength-override
 *
 * Persists a coach manual swap of one exercise slot in today's strength
 * session. Applied AFTER the adaptation engine inside buildStrengthSession.
 *
 * POST   — upsert: { blockId, position, exerciseId, notes? }
 * DELETE — clear:  { blockId, position }
 *
 * Auth: coach token, player must belong to coach's team.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";


async function getCoachAuth(req: NextRequest, supabase: ReturnType<typeof getSupabase>) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 } as const;
  }
  return { userId, teamId: (prof?.team_id as string | null) ?? null } as const;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: playerRow } = await supabase
    .from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  if (!playerRow || (auth.teamId && (playerRow as { team_id: string }).team_id !== auth.teamId)) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  let body: {
    blockId?: string;
    position?: number;
    exerciseId?: string;
    originalExerciseId?: string;
    notes?: string;
    date?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.blockId || typeof body.position !== "number" || !body.exerciseId || !body.originalExerciseId) {
    return NextResponse.json(
      { error: "blockId, position, exerciseId, originalExerciseId required" },
      { status: 400 },
    );
  }
  const dateIso = body.date ?? new Date().toISOString().slice(0, 10);

  // Upsert on (player_id, override_date, block_id, position)
  const { data: existing } = await supabase
    .from("strength_session_overrides")
    .select("id")
    .eq("player_id", playerId)
    .eq("override_date", dateIso)
    .eq("block_id", body.blockId)
    .eq("position", body.position)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("strength_session_overrides")
      .update({
        override_exercise_id: body.exerciseId,
        original_exercise_id: body.originalExerciseId,
        notes: body.notes?.trim() || null,
        coach_id: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as { id: string }).id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: "updated" });
  }

  const { error } = await supabase
    .from("strength_session_overrides")
    .insert({
      player_id: playerId,
      team_id: (playerRow as { team_id: string }).team_id,
      override_date: dateIso,
      block_id: body.blockId,
      position: body.position,
      original_exercise_id: body.originalExerciseId,
      override_exercise_id: body.exerciseId,
      coach_id: auth.userId,
      notes: body.notes?.trim() || null,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, action: "inserted" });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: playerRow } = await supabase
    .from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  if (!playerRow || (auth.teamId && (playerRow as { team_id: string }).team_id !== auth.teamId)) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  let body: { blockId?: string; position?: number; date?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body — interpret as "clear ALL overrides for today"
  }
  const dateIso = body.date ?? new Date().toISOString().slice(0, 10);

  let qb = supabase
    .from("strength_session_overrides")
    .delete()
    .eq("player_id", playerId)
    .eq("override_date", dateIso);
  if (body.blockId && typeof body.position === "number") {
    qb = qb.eq("block_id", body.blockId).eq("position", body.position);
  }
  const { error } = await qb;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, action: "deleted" });
}
