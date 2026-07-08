/**
 * GET /api/player/today-load
 *
 * Player-facing, self-scoped view of TODAY's planned training load — so a player
 * can anticipate how hard the session will be. Reuses the exact coach load-plan
 * engine (buildLoadPlanForTeam) so the player's outlook can never disagree with
 * the coach's plan. Returns only a plain slice: the microcycle outlook (effort
 * band, duration, focus, % of a match, plain reason) + the player's own target,
 * eased when their own check-in is yellow/red. Self-hides ({show:false}) on
 * off-days, when there's no MD context, or on any error (never breaks Today).
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { buildLoadPlanForTeam } from "@/lib/micropulse/loadPlan/forTeam";

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
    const built = await buildLoadPlanForTeam(sb, teamId, today);
    if (!built) return NextResponse.json({ show: false });

    const planned = built.plan.planned;
    const matchDay = planned.reason === "match";
    // Hide on off-days / no-MD-context; show on training days and (as a special
    // celebratory state) on match days.
    if (!planned.applicable && !matchDay) return NextResponse.json({ show: false });

    // The player's own target for today.
    const me = built.plan.perPlayer.find((p) => p.player_id === playerId) ?? null;
    let personalTarget = me?.playerLoad != null && me.playerLoad > 0 ? Math.round(me.playerLoad) : null;

    // Personalize by the player's OWN readiness (canonical v8 color). A yellow/red
    // check-in eases the personal target and flags why.
    const myColor = String(built.readinessRows.find((r) => r.player_id === playerId)?.final_color ?? "").toLowerCase();
    const eased: "yellow" | "red" | null = myColor === "red" ? "red" : myColor === "yellow" ? "yellow" : null;
    if (personalTarget != null && eased) personalTarget = Math.round(personalTarget * (eased === "red" ? 0.8 : 0.9));

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
      personalTarget,
      flag: me?.flag ?? null,
      flagReason: me?.flagReason ?? null,
      eased,
    });
  } catch {
    // Never break Today over this optional card.
    return NextResponse.json({ show: false });
  }
}
