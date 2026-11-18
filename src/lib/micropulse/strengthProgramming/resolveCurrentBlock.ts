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
 *  the Periodization Hub, and the in-season sub-phase for today's week is resolved alongside.
 *
 *  A block's `end` is the next block's `start` (blocks are built half-open), so on that date the NEXT block
 *  holds today (2026-11-18 — before, a block's first Monday was read as the previous block). Only the plan's
 *  last block keeps its end date (`strict` = false), so the last day of a season still has a block; with
 *  `strict` it doesn't, which lets the caller try next season's plan first (its pre-season starts that day). */
export function blockFromPlan(
  plan: Pick<PeriodizationPlan, "phases" | "loadCurve" | "matchLoad" | "matchLoadTeam" | "fixtures">,
  cadence: 4 | 5 | 6,
  todayIso: string,
  breaks: BreakRange[] = [],
  offseasonBuildStart: string | null = null,
  strict = false,
): CurrentBlock | null {
  const { phases } = plan;
  if (!phases.length) return null;
  const compStart = phases.find((p) => p.key === "competitive")?.start ?? null;
  const compEnd = phases.find((p) => p.key === "competitive")?.end ?? null;
  const offStart = phases.find((p) => p.key === "offseason")?.start ?? null;
  const blocks = buildMesoBlocks(phases[0].start, phases[phases.length - 1].end, plan.loadCurve, cadence, plan.matchLoadTeam ?? plan.matchLoad, plan.fixtures, compStart, breaks, offStart, offseasonBuildStart);
  const last = blocks[blocks.length - 1];
  const cur = blocks.find((b) => b.start <= todayIso && todayIso < b.end)
    ?? (!strict && last && last.start <= todayIso && todayIso <= last.end ? last : null);
  if (!cur) return null;
  const phase: SeasonPhaseKey =
    offStart && cur.start >= offStart ? "offseason"
    : compStart && cur.start < compStart ? "preseason" : "competitive";
  // In-season only: a fixture-density sub-phase needs fixtures (none in pre-season / off-season).
  const subPhase = phase === "competitive" && compEnd
    ? classifyInSeasonSubPhase({ weekStart: todayIso, fixtures: plan.fixtures, breaks, competitiveEnd: compEnd }).key
    : null;
  return { goalKey: cur.goalKey, phase, label: cur.phase, subPhase };
}

type SeasonOverrides = {
  preseasonStart?: string; seasonEnd?: string; deloadCadence?: number;
  nextPreseasonStart?: string; offseasonWeeks?: number; offseasonStart?: string;
};
type SeasonPlanRow = { season_year: number; overrides: SeasonOverrides | null };

/** Pure: the season plans to try for `todayIso`, in order. The date's own year first (with empty overrides
 *  when the team has no row — the old behaviour). Then NEXT year's row, only when the coach saved one: a
 *  pre-season that opens in Nov/Dec belongs to the season it leads into (the loader persists it there), so
 *  in December this year's plan has already ended and next year's plan holds today's block. */
export function seasonPlanCandidates(
  todayIso: string,
  rows: SeasonPlanRow[],
): Array<{ seasonYear: number; ov: SeasonOverrides }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(todayIso))) return [];
  const y = Number(String(todayIso).slice(0, 4));
  const own = rows.find((r) => Number(r.season_year) === y);
  const next = rows.find((r) => Number(r.season_year) === y + 1);
  const out = [{ seasonYear: y, ov: own?.overrides ?? {} }];
  if (next) out.push({ seasonYear: y + 1, ov: next.overrides ?? {} });
  return out;
}

/** Async: read the team's season overrides + periodization, then find today's block. Resilient —
 *  ANY failure (no plan, transient DB error) resolves to null so the caller's delivery is unchanged.
 *  Tries this year's season plan, then next year's (a pre-season that starts in Nov/Dec — 2026-11-17). */
export async function resolveCurrentBlock(sb: Sb, teamId: string, todayIso: string): Promise<CurrentBlock | null> {
  try {
    const y = Number(String(todayIso).slice(0, 4));
    const [{ data: sp }, { data: brk }] = await Promise.all([
      sb.from("season_plans").select("season_year, overrides").eq("team_id", teamId).in("season_year", [y, y + 1]),
      // team_breaks feed the fixture-aware block boundaries + the in-season sub-phase (same source the hub uses).
      sb.from("team_breaks").select("start_date, end_date").eq("team_id", teamId),
    ]);
    const breaks = ((brk ?? []) as BreakRange[]).map((b) => ({ start_date: b.start_date, end_date: b.end_date }));
    // Each candidate plan is loaded once. First pass: a block that holds today before its end date. Second pass:
    // a plan's last day (only when no plan starts a block that day) — so the off-season's end date, which is the
    // next pre-season's first day, reads as pre-season (2026-11-18).
    const loaded: Array<{ plan: Awaited<ReturnType<typeof loadPeriodization>>; cadence: 4 | 5 | 6; ov: SeasonOverrides }> = [];
    for (const { seasonYear, ov } of seasonPlanCandidates(todayIso, (sp ?? []) as SeasonPlanRow[])) {
      const cadence = ([4, 5, 6].includes(Number(ov.deloadCadence)) ? Number(ov.deloadCadence) : 4) as 4 | 5 | 6;
      const plan = await loadPeriodization(sb, { teamId, seasonYear, preseasonStart: ov.preseasonStart ?? null, seasonEnd: ov.seasonEnd ?? null, nextPreseasonStart: ov.nextPreseasonStart ?? null, offseasonWeeks: ov.offseasonWeeks ?? null });
      const block = blockFromPlan(plan, cadence, todayIso, breaks, ov.offseasonStart ?? null, true);
      if (block) return block;
      loaded.push({ plan, cadence, ov });
    }
    for (const { plan, cadence, ov } of loaded) {
      const block = blockFromPlan(plan, cadence, todayIso, breaks, ov.offseasonStart ?? null);
      if (block) return block;
    }
    return null;
  } catch {
    return null;
  }
}
