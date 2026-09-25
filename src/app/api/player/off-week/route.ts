/**
 * GET  /api/player/off-week
 *   → the authed player's most recent coach-sent OFF-WEEK maintenance plan (or null), plus the
 *     day indices the player has already marked done (`completed`).
 * POST /api/player/off-week   body: { dayIndex: number, completed: boolean }
 *   → toggles that day's completion for the plan's week (self-scoped).
 *
 * Read/write is self-scoped (service-role admin + verified player id), mirroring
 * /api/player/training-programme. The coach generates + sends the plan from Week setup. Descriptive;
 * never the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

/** The player's most recent coach-sent plan row (week + team scope for completions). */
async function latestPlanRow(sb: ReturnType<typeof getSupabaseAdmin>, playerId: string) {
  const { data } = await sb
    .from("player_off_week_plans")
    .select("week_start, team_id, days, gym_access, plan, sent_at")
    .eq("player_id", playerId)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as {
    week_start: string; team_id: string; days: number; gym_access: string; plan: unknown; sent_at: string;
  } | null) ?? null;
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const row = await latestPlanRow(sb, playerId);
  if (!row) return NextResponse.json({ ok: true, plan: null });

  const { data: done } = await sb
    .from("player_off_week_completions")
    .select("day_index")
    .eq("player_id", playerId)
    .eq("week_start", row.week_start);
  const completed = (done ?? []).map((d) => (d as { day_index: number }).day_index);

  return NextResponse.json({
    ok: true,
    weekStart: row.week_start,
    days: row.days,
    gymAccess: row.gym_access,
    plan: row.plan,
    sentAt: row.sent_at,
    completed,
  });
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { dayIndex?: unknown; completed?: unknown };
  const dayIndex = Number(body.dayIndex);
  const completed = body.completed === true;
  if (!Number.isInteger(dayIndex) || dayIndex < 0) {
    return NextResponse.json({ error: "dayIndex must be a non-negative integer" }, { status: 400 });
  }

  // Resolve the current plan server-side so completions can't drift onto another week.
  const row = await latestPlanRow(sb, playerId);
  if (!row) return NextResponse.json({ error: "No off-week plan to mark" }, { status: 404 });

  if (completed) {
    const { error } = await sb
      .from("player_off_week_completions")
      .upsert(
        { player_id: playerId, team_id: row.team_id, week_start: row.week_start, day_index: dayIndex, completed_at: new Date().toISOString() },
        { onConflict: "player_id,week_start,day_index" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await sb
      .from("player_off_week_completions")
      .delete()
      .eq("player_id", playerId)
      .eq("week_start", row.week_start)
      .eq("day_index", dayIndex);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, dayIndex, completed });
}
