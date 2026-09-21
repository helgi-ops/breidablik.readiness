/**
 * GET /api/player/mas — the AUTHENTICATED player's OWN maximal aerobic speed (MAS), for the
 * athlete-facing interval-session builder.
 *
 * Read-only and self-scoped: resolves the caller's own playerId + team from their token, then reads
 * MAS via the shared resolver and returns only his value + a confidence from the test provenance
 * (direct incremental test > VIFT-shrunk / CS-back-calc). Descriptive conditioning context — never
 * touches readiness. The interval maths runs client-side in the pure intervalSession lib.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { requireAuthedPlayerId, getPlayerTeamId } from "@/lib/session-rpe/server";
import { resolveMas } from "@/lib/micropulse/load/speedZonesData";

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

  const teamId = await getPlayerTeamId(sb, playerId);
  if (!teamId) return NextResponse.json({ ok: true, mas: null });

  const resolved = (await resolveMas(teamId)).get(playerId) ?? null;
  if (!resolved) return NextResponse.json({ ok: true, mas: null });

  // Direct incremental/field MAS test → moderate; a shrunk/back-calc proxy → low. (No "high" without
  // MSS validation, which this MAS-only read doesn't do.)
  const direct = resolved.source === "vameval" || resolved.source === "msft" || resolved.source === "run_4min";
  const confidence = direct ? "moderate" : "low";
  return NextResponse.json({ ok: true, mas: { kmh: Math.round(resolved.masKmh * 10) / 10, confidence } });
}
