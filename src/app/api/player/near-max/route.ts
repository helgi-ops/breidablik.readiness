/**
 * GET /api/player/near-max
 *
 * Player-facing, self-scoped: the player's OWN "Top speed due" reminder — days since a run at 90% of their own
 * top speed (more than 10 days = due, more than 21 = long gap). Same read as the coach's Today pill
 * (`nearMaxExposure/signalLoad`), in the player's voice. `card: null` = nothing to show.
 *
 * A FREE club gets no card: its coach doesn't see the signal either (`/api/coach/signals` is closed to FREE).
 * Self-hides (`card: null`) on any read error, so it can never break Today. A reminder beside the readiness
 * colour, never it.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { isFreeLocked } from "@/lib/micropulse/product/freeLock";
import { loadPlayerNearMax } from "@/lib/micropulse/nearMaxExposure/signalLoad";
import { formatNearMaxForPlayer } from "@/lib/micropulse/nearMaxExposure/playerCopy";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try { ({ playerId } = await requireAuthedPlayerId(sb, req)); }
  catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ error: m }, { status: 401 }); }

  try {
    const { data: player } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
    const teamId = (player as { team_id?: string | null } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ ok: true, card: null });
    const { data: team } = await sb.from("teams").select("plan_tier, team_type").eq("id", teamId).maybeSingle();
    const t = team as { plan_tier?: string | null; team_type?: string | null } | null;
    const plan = String(t?.plan_tier ?? "").toUpperCase();
    if (!t || isFreeLocked(plan === "ELITE" ? "ELITE" : plan === "PRO" ? "PRO" : "FREE", t.team_type ?? null)) {
      return NextResponse.json({ ok: true, card: null });
    }

    const today = new Date().toISOString().slice(0, 10);
    const read = await loadPlayerNearMax(sb, playerId, today);
    return NextResponse.json({ ok: true, card: read ? formatNearMaxForPlayer(read) : null });
  } catch {
    return NextResponse.json({ ok: true, card: null });
  }
}
