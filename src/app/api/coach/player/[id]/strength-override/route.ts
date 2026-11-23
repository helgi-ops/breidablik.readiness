/**
 * /api/coach/player/[id]/strength-override
 *
 * Persists a coach manual swap of one exercise slot in today's strength
 * session. Applied AFTER the adaptation engine inside buildStrengthSession.
 *
 * POST   — upsert: { blockId, position, exerciseId, originalExerciseId, reasonCode, reasonNote? }
 * DELETE — clear:  { blockId, position, reasonCode, reasonNote? }
 *
 * Every swap and every take-back needs the coach's one-tap reason (coachReasons.ts, contradiction 18, 2026-11-23) and
 * is appended to strength_session_override_log (who, when, from → to, why). The reason in force is also the row's
 * `notes`, which the session line shows ("Coach override: …").
 *
 * Auth: coach of the player's team (requireCoachAccessForTeam). Server-only table (service role; RLS on, no
 * browser policies — 20261117180000). Re-swapping a slot keeps the engine's exercise as the original.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { parseCoachReason } from "@/lib/micropulse/strengthProgramming/coachReasons";

export const runtime = "nodejs";


/**
 * The coach must coach the PLAYER's team (own team or coach_teams; admin any) — checked with the shared
 * `requireCoachAccessForTeam`, against the player's team read on the server. (Before 2026-11-17 a coach whose
 * profile had no team passed the check for any player.)
 */
async function authForPlayer(req: NextRequest, supabase: ReturnType<typeof getSupabase>, playerId: string) {
  const { data: playerRow } = await supabase.from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  const teamId = (playerRow as { team_id: string | null } | null)?.team_id ?? null;
  if (!playerRow || !teamId) return { res: NextResponse.json({ error: "Player not in your team" }, { status: 403 }) } as const;
  try {
    const { coachUserId } = await requireCoachAccessForTeam(supabase, req, teamId);
    return { userId: coachUserId, teamId } as const;
  } catch (e) {
    return { res: authErrorToResponse(e) ?? NextResponse.json({ error: "Player not in your team" }, { status: 403 }) } as const;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  const supabase = getSupabase();
  const auth = await authForPlayer(req, supabase, playerId);
  if ("res" in auth) return auth.res;

  let body: {
    blockId?: string;
    position?: number;
    exerciseId?: string;
    originalExerciseId?: string;
    reasonCode?: string;
    reasonNote?: string;
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
  const reason = parseCoachReason("swap", body.reasonCode, body.reasonNote);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });
  const dateIso = body.date ?? new Date().toISOString().slice(0, 10);
  const log = (from: string | null) => supabase.from("strength_session_override_log").insert({
    player_id: playerId, team_id: auth.teamId, override_date: dateIso, block_id: body.blockId, position: body.position,
    action: "set", from_exercise_id: from, to_exercise_id: body.exerciseId, reason: reason.stored, coach_id: auth.userId,
  });

  // Upsert on (player_id, override_date, block_id, position)
  const { data: existing } = await supabase
    .from("strength_session_overrides")
    .select("id, original_exercise_id, override_exercise_id")
    .eq("player_id", playerId)
    .eq("override_date", dateIso)
    .eq("block_id", body.blockId)
    .eq("position", body.position)
    .maybeSingle();

  if (existing) {
    // Swapping the coach's own swap again: the card shows the earlier swap in that slot, so the body's "original"
    // is that swap. Keep the engine's exercise as the original — sends apply a swap only while that exercise is
    // still in the slot (fix 2026-11-17).
    const ex = existing as { id: string; original_exercise_id: string | null; override_exercise_id: string | null };
    const original = ex.original_exercise_id && body.originalExerciseId === ex.override_exercise_id
      ? ex.original_exercise_id
      : body.originalExerciseId;
    const { error } = await supabase
      .from("strength_session_overrides")
      .update({
        override_exercise_id: body.exerciseId,
        original_exercise_id: original,
        notes: reason.stored,
        coach_id: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as { id: string }).id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await log(ex.override_exercise_id);
    return NextResponse.json({ ok: true, action: "updated" });
  }

  const { error } = await supabase
    .from("strength_session_overrides")
    .insert({
      player_id: playerId,
      team_id: auth.teamId,
      override_date: dateIso,
      block_id: body.blockId,
      position: body.position,
      original_exercise_id: body.originalExerciseId,
      override_exercise_id: body.exerciseId,
      coach_id: auth.userId,
      notes: reason.stored,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await log(body.originalExerciseId);
  return NextResponse.json({ ok: true, action: "inserted" });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  const supabase = getSupabase();
  const auth = await authForPlayer(req, supabase, playerId);
  if ("res" in auth) return auth.res;

  let body: { blockId?: string; position?: number; date?: string; reasonCode?: string; reasonNote?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body — no reason, refused below
  }
  // No blockId/position = clear ALL of today's swaps for the player (still with a reason, each one logged).
  const reason = parseCoachReason("swap_clear", body.reasonCode, body.reasonNote);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });
  const dateIso = body.date ?? new Date().toISOString().slice(0, 10);
  const one = !!body.blockId && typeof body.position === "number";

  let sel = supabase
    .from("strength_session_overrides")
    .select("id, block_id, position, original_exercise_id, override_exercise_id")
    .eq("player_id", playerId)
    .eq("override_date", dateIso);
  if (one) sel = sel.eq("block_id", body.blockId!).eq("position", body.position!);
  const { data: rows, error: selErr } = await sel;
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  const list = (rows ?? []) as { id: string; block_id: string; position: number; original_exercise_id: string | null; override_exercise_id: string | null }[];
  if (!list.length) return NextResponse.json({ ok: true, action: "none" });

  const { error } = await supabase.from("strength_session_overrides").delete().in("id", list.map((r) => r.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from("strength_session_override_log").insert(list.map((r) => ({
    player_id: playerId, team_id: auth.teamId, override_date: dateIso, block_id: r.block_id, position: r.position,
    action: "clear", from_exercise_id: r.override_exercise_id, to_exercise_id: r.original_exercise_id,
    reason: reason.stored, coach_id: auth.userId,
  })));
  return NextResponse.json({ ok: true, action: "deleted" });
}
