/**
 * /api/player/game-report?season=2026
 *
 * GET — the PLAYER's OWN per-match physical performance report (so he can follow
 * his profile). Self-scoped: the player_id comes from his auth, never a param —
 * he can only ever see himself. Same computation as the coach report (shared lib),
 * minus the squad roster. Capability-aware (works on Lite + Pro).
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { computePlayerGameReport } from "@/lib/micropulse/playerGameReport";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season")) || new Date().getUTCFullYear();

  const { data: p } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  const teamId = (p?.team_id as string | null) ?? null;
  if (!teamId) return NextResponse.json({ error: "Player not linked to a team" }, { status: 400 });

  const res = await computePlayerGameReport(sb, teamId, playerId, season);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  // Player sees ONLY his own report — no squad roster / teammate list.
  return NextResponse.json(res.report);
}
