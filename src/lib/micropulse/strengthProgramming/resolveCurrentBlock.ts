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
import { classifyInSeasonSubPhase, type InSeasonSubPhaseKey } from "@/lib/micropulse/periodization/inSeasonSubPhase";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import type { BlockGoalKey, SeasonPhaseKey } from "./seasonPhaseStrength";

type Sb = Parameters<typeof loadPeriodization>[0];
type BreakRange = { start_date: string; end_date: string };

export interface CurrentBlock {
  goalKey: BlockGoalKey;
  phase: SeasonPhaseKey; // the SEASON phase the block sits in (preseason vs competitive) — refines the scheme
  label: Bi;             // the block's own {en,is} label (e.g. Accumulation) — for display
  /** In-season fixture-density sub-phase for today's week (null in pre-season) — drives the weekly dose. */
  subPhase: InSeasonSubPhaseKey | null;
}

/** Pure: the meso block containing `todayIso`, or null (no phases / today outside every span). Preserves
 *  the coach's deload `cadence` (4/5/6), which differs from `plan.blocks` (hardcoded cadence 4). The block
 *  boundaries are fixture-aware (gaps/breaks become their own re-load block) so the delivered block matches
 *  the Periodization Hub, and the in-season sub-phase for today's week is resolved alongside. */
export function blockFromPlan(
  plan: Pick<PeriodizationPlan, "phases" | "loadCurve" | "matchLoad" | "matchLoadTeam" | "fixtures">,
  cadence: 4 | 5 | 6,
  todayIso: string,
  breaks: BreakRange[] = [],
): CurrentBlock | null {
  const { phases } = plan;
  if (!phases.length) return null;
  const compStart = phases.find((p) => p.key === "competitive")?.start ?? null;
  const compEnd = phases.find((p) => p.key === "competitive")?.end ?? null;
  const blocks = buildMesoBlocks(phases[0].start, phases[phases.length - 1].end, plan.loadCurve, cadence, plan.matchLoadTeam ?? plan.matchLoad, plan.fixtures, compStart, breaks);
  const cur = blocks.find((b) => b.start <= todayIso && todayIso <= b.end) ?? null;
  if (!cur) return null;
  const phase: SeasonPhaseKey = compStart && cur.start < compStart ? "preseason" : "competitive";
  const subPhase = phase === "competitive" && compEnd
    ? classifyInSeasonSubPhase({ weekStart: todayIso, fixtures: plan.fixtures, breaks, competitiveEnd: compEnd }).key
    : null;
  return { goalKey: cur.goalKey, phase, label: cur.phase, subPhase };
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
    // team_breaks feed the fixture-aware block boundaries + the in-season sub-phase (same source the hub uses).
    const { data: brk } = await sb.from("team_breaks").select("start_date, end_date").eq("team_id", teamId);
    const breaks = ((brk ?? []) as BreakRange[]).map((b) => ({ start_date: b.start_date, end_date: b.end_date }));
    return blockFromPlan(plan, cadence, todayIso, breaks);
  } catch {
    return null;
  }
}
