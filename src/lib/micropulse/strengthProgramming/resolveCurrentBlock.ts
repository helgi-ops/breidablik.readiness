import "server-only";

/**
 * Resolve which MESO block a team is in TODAY — the shared spine behind both the Periodization Hub's
 * strength lane and the daily delivery routes, so the block the coach plans is the block the player gets.
 *
 * Extracted verbatim from the inline logic in api/coach/strength-periodization/route.ts so there is ONE
 * implementation (that route now calls `blockFromPlan` too). Pure block-finding + a thin async loader.
 * Descriptive — no readiness colour, no writes.
 */

import { buildMesoBlocks } from "@/lib/micropulse/periodization";
import { loadPeriodization, type PeriodizationPlan } from "@/lib/micropulse/periodization/loader";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import type { BlockGoalKey, SeasonPhaseKey } from "./seasonPhaseStrength";

type Sb = Parameters<typeof loadPeriodization>[0];

export interface CurrentBlock {
  goalKey: BlockGoalKey;
  phase: SeasonPhaseKey; // the SEASON phase the block sits in (preseason vs competitive) — refines the scheme
  label: Bi;             // the block's own {en,is} label (e.g. Accumulation) — for display
}

/** Pure: the meso block containing `todayIso`, or null (no phases / today outside every span). Preserves
 *  the coach's deload `cadence` (4/5/6), which differs from `plan.blocks` (hardcoded cadence 4). */
export function blockFromPlan(
  plan: Pick<PeriodizationPlan, "phases" | "loadCurve" | "matchLoad" | "matchLoadTeam" | "fixtures">,
  cadence: 4 | 5 | 6,
  todayIso: string,
): CurrentBlock | null {
  const { phases } = plan;
  if (!phases.length) return null;
  const blocks = buildMesoBlocks(phases[0].start, phases[phases.length - 1].end, plan.loadCurve, cadence, plan.matchLoadTeam ?? plan.matchLoad, plan.fixtures);
  const compStart = phases.find((p) => p.key === "competitive")?.start ?? null;
  const cur = blocks.find((b) => b.start <= todayIso && todayIso <= b.end) ?? null;
  if (!cur) return null;
  const phase: SeasonPhaseKey = compStart && cur.start < compStart ? "preseason" : "competitive";
  return { goalKey: cur.goalKey, phase, label: cur.phase };
}

/** Async: read the team's season overrides + periodization, then find today's block. Resilient —
 *  ANY failure (no plan, transient DB error) resolves to null so the caller's delivery is unchanged. */
export async function resolveCurrentBlock(sb: Sb, teamId: string, todayIso: string): Promise<CurrentBlock | null> {
  try {
    const { data: sp } = await sb
      .from("season_plans").select("overrides")
      .eq("team_id", teamId).eq("season_year", new Date().getUTCFullYear()).maybeSingle();
    const ov = (sp as { overrides?: { preseasonStart?: string; seasonEnd?: string; deloadCadence?: number } } | null)?.overrides ?? {};
    const cadence = ([4, 5, 6].includes(Number(ov.deloadCadence)) ? Number(ov.deloadCadence) : 4) as 4 | 5 | 6;
    const plan = await loadPeriodization(sb, { teamId, preseasonStart: ov.preseasonStart ?? null, seasonEnd: ov.seasonEnd ?? null });
    return blockFromPlan(plan, cadence, todayIso);
  } catch {
    return null;
  }
}
