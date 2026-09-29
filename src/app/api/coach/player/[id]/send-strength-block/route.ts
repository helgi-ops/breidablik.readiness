/**
 * POST /api/coach/player/[id]/send-strength-block   body { startDate?, lang? }
 *   → sends the 4-week Upper/Lower block to a player: writes one
 *     player_today_strength_override row per training date (Mon/Tue/Thu/Fri × 4 weeks) as a
 *     coach-sent, swappable Today session. The player sees each day on its date and can swap exercises.
 *
 * Authorised via requireCoachAccessForTeam (admin may target ANY team; a coach only their own), so an
 * admin can send to a player in another club. Descriptive — never the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { buildBlockSchedule, mondayOf, type BlockMethod } from "@/lib/micropulse/strengthBlock/upperLowerBlock";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const sb = getSupabaseAdmin();

  const { data: pl } = await sb.from("players").select("id, team_id, full_name").eq("id", playerId).maybeSingle();
  const player = pl as { id: string; team_id: string | null; full_name: string | null } | null;
  if (!player?.team_id) return NextResponse.json({ ok: false, error: "Player not found" }, { status: 404 });

  let coachId: string | null = null;
  try {
    const { teamId, coachUserId } = await requireCoachAccessForTeam(sb, req, player.team_id);
    if (teamId !== player.team_id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    coachId = coachUserId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const st = /forbidden/i.test(msg) ? 403 : /unauth|token|auth/i.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status: st });
  }

  const body = (await req.json().catch(() => ({}))) as { startDate?: unknown; lang?: unknown; method?: unknown };
  const lang: "EN" | "IS" = body.lang === "IS" ? "IS" : "EN";
  const method: BlockMethod = body.method === "contrast" || body.method === "french_contrast" ? body.method : "upper_lower";
  const start = typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
    ? body.startDate
    : new Date().toISOString().slice(0, 10);
  const startMonday = mondayOf(start);

  const schedule = buildBlockSchedule(startMonday, lang, method);
  const rows = schedule.map((s) => ({
    player_id: player.id,
    team_id: player.team_id,
    entry_date: s.dateIso,
    md_context: null as string | null,
    readiness_level: null as string | null,
    title: s.title,
    description: s.summary,
    structure: s.blocks,
    summary: s.summary,
    duration_min: s.durationMin,
    source: "coach_sent",
    coach_id: coachId,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await sb.from("player_today_strength_override").upsert(rows, { onConflict: "player_id,entry_date" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, sent: rows.length, weeks: 4, startDate: startMonday, from: rows[0]?.entry_date, to: rows[rows.length - 1]?.entry_date });
}
