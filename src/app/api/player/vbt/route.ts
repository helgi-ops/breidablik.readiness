import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { fetchVbtSets, computeVbtDashboard } from "@/lib/micropulse/vbtReadiness/fetchVbtSets";

export const runtime = "nodejs";

/**
 * GET /api/player/vbt?date=YYYY-MM-DD
 *
 * VBT strength dashboard for the authenticated player — PBs, today-vs-PB, load
 * breakdowns, history, velocity trend and within-session velocity-loss. Sourced
 * from BOTH GymAware sync and hand-entered velocity (see fetchVbtSets).
 */
export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);
    const date = new URL(req.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const merged = await fetchVbtSets(sb, playerId);
    return NextResponse.json(computeVbtDashboard(merged, date, playerId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
