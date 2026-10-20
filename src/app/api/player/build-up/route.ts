/**
 * GET /api/player/build-up
 *
 * The player's own read-only "my build-up" view: actual accrued weekly training
 * load vs the planned periodization ramp for the active Meso block, phase-gated
 * on chronic-baseline maturity. Self-scoped (the player only ever sees himself).
 * Reuses the same engine the coach hub uses (playerBlock + buildUpTracking), so
 * what the coach plans and what the player sees can never drift.
 *
 * Descriptive — reads load only, never the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { loadPeriodization } from "@/lib/micropulse/periodization/loader";
import { buildPlayerBlock, pickActiveBlock } from "@/lib/micropulse/periodization/playerBlock";
import { loadBuildUpActuals } from "@/lib/micropulse/buildUpTracking/loader";
import { computeBuildUpAdherence } from "@/lib/micropulse/buildUpTracking";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: pl } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  const teamId = (pl as { team_id?: string | null } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: true, show: false });

  try {
    const plan = await loadPeriodization(sb, { teamId });
    const player = plan.players.find((p) => p.playerId === playerId) ?? null;
    const asOf = new Date().toISOString().slice(0, 10);
    const win = pickActiveBlock(plan, asOf);
    if (!player || !win) return NextResponse.json({ ok: true, show: false });

    // Match the coach's chosen block goal so the player's planned ramp (volume/taper/strength) is the one
    // the coach set. Read the same per-block override the hub writes (season_plans.overrides.blockGoals);
    // fall back to the engine's goalKey for this block (deload → accum, since the player ramp isn't a goal).
    const { data: spRow } = await sb.from("season_plans").select("overrides").eq("team_id", teamId).eq("season_year", plan.seasonYear).maybeSingle();
    const blockGoals = ((spRow as { overrides?: { blockGoals?: Record<string, "accum" | "transmute" | "realize"> } } | null)?.overrides?.blockGoals) ?? {};
    const activeMb = (plan.blocks ?? []).find((b) => b.start === win.blkStart);
    const engineGoal: "accum" | "transmute" | "realize" = activeMb && activeMb.goalKey !== "deload" ? activeMb.goalKey : "accum";
    const goal = blockGoals[win.blkStart] ?? engineGoal;

    const built = buildPlayerBlock(plan, player, {
      blkStart: win.blkStart,
      blkWeeks: win.blkWeeks,
      phaseLabel: win.phaseLabel,
      matchDates: win.matchDates,
      goal,
    });

    const actuals = await loadBuildUpActuals(sb, {
      playerId,
      teamId,
      from: built.block.startDate,
      to: asOf,
      matchDates: win.matchDates,
    });

    const adherence = computeBuildUpAdherence({
      block: built.block,
      actualWeeks: actuals.weeks,
      asOf,
      daysObserved: actuals.daysObserved,
      planConfidence: built.confidence,
      acwr: actuals.acwr,
    });

    // Only surface once there's an elapsed week with logged load — no empty card.
    const show = adherence.latestWeekIndex != null;
    return NextResponse.json({ ok: true, show, adherence, weekStart: built.block.startDate, phase: built.block.phase });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: m }, { status: 500 });
  }
}
