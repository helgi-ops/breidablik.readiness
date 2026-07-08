/**
 * GET /api/player/today-load
 *
 * Player-facing, self-scoped MORNING outlook of TODAY's planned training load —
 * so a player can anticipate how hard the session will be. Shares computePlayerToday
 * with the evening recap so the two can never disagree. The OUTLOOK (effort band,
 * duration, focus, % of a match, plain reason) comes from the same microcycle
 * engine the coach Pre-session report uses. The PERSONAL number is the player's
 * own average on past days of this MD-day ("your usual MD-4"), with their own
 * load-trend flag and a note when their check-in is yellow/red. Self-hides on
 * off-days / no MD context / any error (never breaks Today).
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { computePlayerToday } from "@/lib/micropulse/loadPlan/playerToday";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: pl } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
    const teamId = (pl as { team_id?: string | null } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ show: false });

    const today = new Date().toISOString().slice(0, 10);
    const built = await computePlayerToday(sb, playerId, teamId, today);
    const planned = built.planned;
    const matchDay = planned.reason === "match";
    // Hide on off-days / no MD context; show on training days + (special) match days.
    if (!planned.applicable && !matchDay) return NextResponse.json({ show: false });

    return NextResponse.json({
      show: true,
      matchDay,
      mdLabel: planned.mdLabel,
      band: planned.band,
      loadType: planned.loadType,
      durationMin: planned.durationMin,
      matchPct: planned.matchPct,
      rationaleEN: planned.rationaleEN,
      rationaleIS: planned.rationaleIS,
      personalTarget: built.personalTarget,
      personalN: built.personalN,
      flag: built.flag,
      eased: built.eased,
    });
  } catch {
    return NextResponse.json({ show: false });
  }
}
