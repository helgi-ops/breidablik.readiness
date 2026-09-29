/**
 * GET /api/coach/player/[id]/off-season-recommendation
 *   → recommends which 4-week block method (upper_lower / contrast / french_contrast) fits the player's
 *     off-season, from his needs profile (deficits, aerobic fit, strength lean, RTP, fatigue).
 *
 * Authorised via requireCoachAccessForTeam (admin cross-team). Read-only, advisory — never the colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { loadOffWeekPlans } from "@/lib/micropulse/offWeek/loader";
import { recommendOffSeasonMethod } from "@/lib/micropulse/strengthBlock/offSeasonRecommend";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const sb = getSupabaseAdmin();

  const { data: pl } = await sb.from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  const player = pl as { id: string; team_id: string | null } | null;
  if (!player?.team_id) return NextResponse.json({ ok: false, error: "Player not found" }, { status: 404 });

  try {
    const { teamId } = await requireCoachAccessForTeam(sb, req, player.team_id);
    if (teamId !== player.team_id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const st = /forbidden/i.test(msg) ? 403 : /unauth|token|auth/i.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status: st });
  }

  // Reuse the off-week needs derivation for this one player.
  const { players } = await loadOffWeekPlans(sb, { teamId: player.team_id, playerIds: [playerId], days: 7, gymAccess: "gym" });
  const needs = players[0]?.needs ?? {};
  const recommendation = recommendOffSeasonMethod(needs);

  return NextResponse.json({ ok: true, recommendation });
}
