export const runtime = "nodejs";

/**
 * GET  /api/player/strength-completion[?date=YYYY-MM-DD]
 *   → { ok, completed: boolean, completedAt: string | null } for the authed
 *     player on that date (default: today, UTC — the same basis the rest of the
 *     Today pipeline uses).
 * POST /api/player/strength-completion   body: { completed: boolean, date?: string }
 *   → marks (upsert) or clears (delete) that day's strength-session completion.
 *
 * Self-scoped: service-role admin + verified player id (mirrors
 * /api/player/off-week). Descriptive only — never the readiness colour, the
 * decision, or the player_today_strength_override delivery row.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId, getPlayerTeamId } from "@/lib/session-rpe/server";

function resolveDate(raw: string | null): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const date = resolveDate(new URL(req.url).searchParams.get("date"));
  const { data } = await sb
    .from("player_strength_completions")
    .select("completed_at")
    .eq("player_id", playerId)
    .eq("entry_date", date)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    completed: Boolean(data),
    completedAt: (data as { completed_at?: string } | null)?.completed_at ?? null,
  });
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { completed?: unknown; date?: unknown };
  const completed = body.completed === true;
  const date = resolveDate(typeof body.date === "string" ? body.date : null);

  if (completed) {
    const teamId = await getPlayerTeamId(sb, playerId).catch(() => null);
    if (!teamId) return NextResponse.json({ ok: false, error: "No team context" }, { status: 400 });
    const { error } = await sb
      .from("player_strength_completions")
      .upsert(
        { player_id: playerId, team_id: teamId, entry_date: date, completed_at: new Date().toISOString() },
        { onConflict: "player_id,entry_date" },
      );
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    const { error } = await sb
      .from("player_strength_completions")
      .delete()
      .eq("player_id", playerId)
      .eq("entry_date", date);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, completed });
}
