/**
 * GET /api/coach/stride-length?teamId=…&date=YYYY-MM-DD[&playerId=…]
 *
 * Stride length — "is he still pushing, or just turning his legs over?" Under
 * neuromuscular fatigue an athlete keeps his stride FREQUENCY but loses stride
 * LENGTH; neither GPS distance nor cadence alone can see it, the ratio can
 * (Girard, Micallef & Millet 2011; Morin et al. 2011).
 *
 * With ?playerId → one player's verdict. Without → the match-day TEAM view:
 * every active player's verdict for the date, shortened-first.
 *
 * The verdict is the engine's, verbatim (assessStrideLength via the shared
 * loader) — the route never re-derives stride length or the 2.5 SD flag. The
 * engine compares like-with-like (match vs his own matches), classifies the
 * session by minutes from match_player_minutes, and returns honest
 * `unmeasurable` states rather than guessing on a light session.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { loadStrideVerdict, loadTeamStrideVerdicts } from "@/lib/micropulse/strideLength/loader";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // Empty/absent → undefined so requireCoachAccessForTeam falls back to the
    // coach's own team (an empty string would NOT trigger the ?? fallback).
    const teamIdParam = url.searchParams.get("teamId") || undefined;
    const date = url.searchParams.get("date") ?? "";
    const playerId = url.searchParams.get("playerId") ?? "";
    if (!ISO_DATE.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { teamId } = await requireCoachAccessForTeam(sb, req, teamIdParam);
    if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });

    if (playerId) {
      const verdict = await loadStrideVerdict(sb, { playerId, date });
      return NextResponse.json({ teamId, playerId, ...verdict });
    }

    const players = await loadTeamStrideVerdicts(sb, { teamId, date });
    return NextResponse.json({ teamId, date, players });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const code = /forbidden|access/i.test(msg) ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
