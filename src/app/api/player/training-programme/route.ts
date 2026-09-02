/**
 * GET /api/player/training-programme
 *   → the authed player's most recent SAVED MD-periodised week (coach-generated).
 *
 * Read-only, self-scoped. The coach generates + saves the week
 * (/api/coach/training-programme/[playerId] POST); the player reads it here.
 * Returns { ok, programme } where programme is the saved MicrocycleProgramme-shaped
 * row (or null if the coach hasn't generated one). Descriptive; never the colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const { data: row } = await sb
    .from("player_training_programmes")
    .select("week_start, days, generated_at, updated_at")
    .eq("player_id", playerId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return NextResponse.json({ ok: true, programme: null });
  const r = row as { week_start: string; days: unknown; generated_at: string; updated_at: string };
  return NextResponse.json({
    ok: true,
    programme: { weekStart: r.week_start, days: r.days, generatedAt: r.generated_at, updatedAt: r.updated_at },
  });
}
