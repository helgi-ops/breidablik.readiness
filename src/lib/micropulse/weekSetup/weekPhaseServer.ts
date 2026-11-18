import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { detectSeasonPhases, fixtureIsFriendly } from "@/lib/micropulse/periodization";
import { loadSeasonDataStart, loadSeasonFixtures } from "@/lib/micropulse/periodization/loader";
import { seasonPlanCandidates } from "@/lib/micropulse/strengthProgramming/resolveCurrentBlock";
import { macroPhaseForWeek, mondayOfWeek, weekPhaseOf, type MacroPhaseSpan, type WeekSeasonPhase } from "./weekPhase";

/**
 * Server read of a week's season phase (2026-11-18): the coach's saved phase, else the season plan's
 * (rule: weekPhase.ts). Used by the strength engine (playerContext fetchTeamContext), the Custom Programme
 * stand-aside check, and /api/week-phase (the player's Today + Week setup).
 *
 * Lean on purpose — this runs for every player's session build: only `coach_week_setup`, `season_plans`, the
 * season's fixtures and (when the coach set no pre-season start) the first date of load data, never the full
 * plan (`loadPeriodization`). The plan's phases are cached per team + season + its season dates for 10 minutes
 * on each server instance, so the 09:00 send reads them once per team.
 *
 * Fail-safe: any error → the saved phase if there is one, else null (the callers' old behaviour).
 */

type SeasonDates = { preseasonStart?: string; seasonEnd?: string; nextPreseasonStart?: string; offseasonWeeks?: number };
type SeasonPlanRow = { season_year: number; overrides: SeasonDates | null };

const TTL_MS = 10 * 60 * 1000;
const phaseCache = new Map<string, { at: number; phases: MacroPhaseSpan[] }>();

/** For tests. */
export function resetWeekPhaseCache() {
  phaseCache.clear();
}

/** One season plan's Macro phases, from its fixtures + the coach's season dates (as `loadPeriodization` finds them). */
async function seasonPhases(sb: SupabaseClient, teamId: string, seasonYear: number, ov: SeasonDates): Promise<MacroPhaseSpan[]> {
  const key = [teamId, seasonYear, ov.preseasonStart ?? "", ov.seasonEnd ?? "", ov.nextPreseasonStart ?? "", ov.offseasonWeeks ?? ""].join("|");
  const hit = phaseCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.phases;

  const { yStart, yEnd, fixtures } = await loadSeasonFixtures(sb, { teamId, seasonYear, preseasonStart: ov.preseasonStart ?? null });
  if (!fixtures.length) {
    phaseCache.set(key, { at: Date.now(), phases: [] });
    return [];
  }
  // The load-data start only matters when the coach's pre-season start doesn't apply (detectSeasonPhases: a coach
  // start counts only before the first competitive fixture).
  const first = fixtures.filter((f) => f.date && !fixtureIsFriendly(f)).map((f) => f.date).sort()[0]
    ?? fixtures.map((f) => f.date).sort()[0];
  const coachPre = !!(ov.preseasonStart && ov.preseasonStart < first);
  const dataStart = coachPre ? null : await loadSeasonDataStart(sb, { teamId, yStart, yEnd });
  const phases = detectSeasonPhases(fixtures, dataStart, {
    preseasonStart: ov.preseasonStart ?? null,
    seasonEnd: ov.seasonEnd ?? null,
    nextPreseasonStart: ov.nextPreseasonStart ?? null,
    offseasonWeeks: ov.offseasonWeeks ?? null,
  }).map((p) => ({ key: p.key, start: p.start, end: p.end }));
  phaseCache.set(key, { at: Date.now(), phases });
  return phases;
}

/**
 * The season-plan phases around `dateIso`: this year's plan, then next year's when the coach saved one (a
 * pre-season that opens in Nov/Dec belongs to the season it leads into — same candidates as resolveCurrentBlock).
 */
export async function planPhasesAround(sb: SupabaseClient, teamId: string, dateIso: string): Promise<MacroPhaseSpan[]> {
  const y = Number(String(dateIso).slice(0, 4));
  if (!Number.isFinite(y)) return [];
  const { data } = await sb.from("season_plans").select("season_year, overrides").eq("team_id", teamId).in("season_year", [y, y + 1]);
  const out: MacroPhaseSpan[] = [];
  for (const { seasonYear, ov } of seasonPlanCandidates(dateIso, (data ?? []) as SeasonPlanRow[])) {
    out.push(...(await seasonPhases(sb, teamId, seasonYear, ov as SeasonDates)));
  }
  return out;
}

export type WeekPhaseRead = {
  weekStart: string;
  /** What the engine and Today use: the saved phase, else the plan's. */
  phase: WeekSeasonPhase | null;
  /** The coach's saved phase on the week (null = not saved). */
  saved: WeekSeasonPhase | null;
  /** The season plan's phase for the week (null = no plan covers it, or not read because the week is saved). */
  planPhase: WeekSeasonPhase | null;
  /** The plan's phases used (empty when not read). */
  phases: MacroPhaseSpan[];
};

/**
 * The phase of the week holding `dateIso`. The season plan is read only when the week has no saved phase, unless
 * `withPlan` (Week setup shows the plan's phase next to the coach's pick).
 */
export async function resolveWeekPhase(
  sb: SupabaseClient,
  teamId: string,
  dateIso: string,
  opts: { withPlan?: boolean } = {},
): Promise<WeekPhaseRead> {
  const weekStart = mondayOfWeek(dateIso);
  let saved: WeekSeasonPhase | null = null;
  try {
    const { data } = await sb.from("coach_week_setup").select("season_phase").eq("team_id", teamId).eq("week_start_date", weekStart).maybeSingle();
    saved = weekPhaseOf((data as { season_phase?: unknown } | null)?.season_phase, null);
  } catch { /* no saved phase */ }
  if (saved && !opts.withPlan) return { weekStart, phase: saved, saved, planPhase: null, phases: [] };
  try {
    const phases = await planPhasesAround(sb, teamId, weekStart);
    const planPhase = macroPhaseForWeek(weekStart, phases);
    return { weekStart, phase: weekPhaseOf(saved, planPhase), saved, planPhase, phases };
  } catch {
    return { weekStart, phase: saved, saved, planPhase: null, phases: [] };
  }
}
