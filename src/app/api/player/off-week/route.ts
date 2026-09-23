/**
 * GET /api/player/off-week
 *   → the authed player's most recent coach-sent OFF-WEEK maintenance plan (or null).
 *
 * Read-only, self-scoped (service-role admin + verified player id), mirroring
 * /api/player/training-programme. The coach generates + sends it from Week setup. Descriptive;
 * never the readiness colour.
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
    .from("player_off_week_plans")
    .select("week_start, days, gym_access, plan, sent_at")
    .eq("player_id", playerId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return NextResponse.json({ ok: true, plan: null });
  const r = row as { week_start: string; days: number; gym_access: string; plan: unknown; sent_at: string };
  return NextResponse.json({ ok: true, weekStart: r.week_start, days: r.days, gymAccess: r.gym_access, plan: r.plan, sentAt: r.sent_at });
}
