/**
 * GET /api/player/fitness-test — the AUTHENTICATED player's OWN fitness-test history (all types,
 * newest-first), for the athlete-facing retest-trend card.
 *
 * Read-only and self-scoped: resolves the caller's own playerId from their token
 * (requireAuthedPlayerId); a player only ever sees their own rows. Descriptive conditioning
 * monitoring — never touches readiness. The trend maths runs client-side in the pure fitnessTrend
 * lib; this route just hands back the rows.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sb = getSupabase();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const { data } = await sb.from("player_fitness_test")
    .select("test_date, test_type, result_value, result_unit, mas_kmh, vo2max_est")
    .eq("player_id", playerId).order("test_date", { ascending: false }).limit(500);

  return NextResponse.json({ ok: true, tests: data ?? [] });
}
