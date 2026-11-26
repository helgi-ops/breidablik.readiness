/**
 * The periodization PLAN's weekly KPI target for a given day — the bridge that lets the live Weekly Load
 * tracker (external-load page) measure the running week against the coach's own season plan, instead of a
 * generic historical baseline or match-demand template.
 *
 * Resolves TODAY → the phase + week the plan is in, and returns the per-KPI weekly target for that week:
 *   - Pre-season  → the controlled re-entry ramp (`preseasonStartRamp`), per-KPI tapered. Week 1 is when
 *                   off-season ends; the ramp climbs from there. Uses the UPCOMING pre-season once the
 *                   season is under way (the historical one is in the past).
 *   - In-season   → `inSeasonKpiVolumes` for the week's fixture count: match × each KPI's weekly multiple, which
 *                   for football is what the rule-compliant calendar week adds up to (MD-4 Mechanical, MD-3
 *                   Locomotive, MD-1 Activation, MD+1 Top-up; coach's call 2026-11-26), basketball its MD week.
 *   - Off-season  → a light aerobic MAINTENANCE dose (~1.2× a match, per-KPI tapered; Rønnestad 2011 —
 *                   hold the level, don't build; no fixtures to peak for).
 *
 * Pure, deterministic, null-safe. Descriptive — it never sets the readiness colour or the daily decision.
 * Anchored on the team's own near-full match unit (median), the single match-unit the whole hub uses.
 */

import { preseasonForDate, preseasonAnchor, preseasonRamp, type PreseasonSavedRow } from "./preseasonWindow";
import { kpiTaperShare, mesoWeeklyMultiples } from "./plannedVolume";
import { inSeasonKpiVolumes } from "./inSeasonStandardWeek";
import { blockKpiRatios, type BlockKpiMap } from "./inSeasonKpiAdjust";
import { teamKpiAvg } from "./preseasonKpiMap";
import { holdsStandardWeek } from "./imaStandard";
import type { MatchUnit, SeasonPhase, MesoBlock } from "./index";
import type { WeeklyLoadMetricKey } from "../externalLoad/weeklyLoadTypes";

/** Off-season running maintenance as a multiple of one match — a light aerobic base that holds the level
 *  without building (Rønnestad 2011; Mujika & Padilla 2000 — detraining onset). High-intensity KPIs taper
 *  hard on top of this (kpiTaperShare), so sprint/HSR stay low in the off-season. */
export const OFFSEASON_MAINTENANCE_MULT = 1.2;

export type PlanWeeklyTarget = {
  phase: "preseason" | "inseason" | "offseason";
  byKpi: Partial<Record<WeeklyLoadMetricKey, number>>;
  label: { en: string; is: string };
  weekIndex?: number;
  totalWeeks?: number;
  multipleOfMatch?: number | null;
};

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const weeksBetween = (a: string, b: string) => Math.floor((ms(b) - ms(a)) / (7 * DAY));

/** Resolve the plan's weekly per-KPI target for `today`. Returns null when there's no match unit to anchor
 *  to (so the caller falls back to the baseline). `matchesThisWeek` is the fixture count for the running
 *  week (in-season only); pre-season/off-season ignore it. */
export function planWeeklyTarget(opts: {
  phases: SeasonPhase[];
  matchUnits: MatchUnit[];
  today: string;
  matchesThisWeek?: number;
  /** Meso blocks (the season's 4/5/6-week cycles) — used to apply the in-season ramp/light-week factor for
   *  the block week today sits in. Omit → no ramp (flat base-week volume). */
  blocks?: MesoBlock[];
  /** The coach's per-block goal picks (season_plans.overrides.blockGoals), keyed by block start. */
  blockGoals?: Record<string, string> | null;
  /** In-season weekly overload step (% per loading week); defaults to the hub default (5%). */
  stepPct?: number;
  /** Legacy single-row settings — used only when `savedWindow` is not given. */
  week1MatchMultiple?: number;
  sessionsPerWeek?: number;
  /** The pre-season the hub plans: same window + coach settings as the hub's Pre-season tab
   *  (periodization/preseasonWindow). savedWindow = the loaded season's overrides; savedWindowNext = the
   *  season the upcoming pre-season opens (used when nextSeasonYear ≠ seasonYear). */
  seasonYear?: number;
  nextSeasonYear?: number | null;
  nextFirstFixture?: string | null;
  savedWindow?: PreseasonSavedRow;
  savedWindowNext?: PreseasonSavedRow;
  /** Team sport — basketball uses a shorter MD micro-cycle (MD-3 → MD-1). Defaults to football. */
  sport?: string | null;
  /** The coach's per-variable settings per in-season block (season_plans.overrides.blockKpi): a set variable's
   *  target moves by the same share as the coach moved its standard week (inSeasonKpiAdjust). */
  blockKpi?: BlockKpiMap | null;
}): PlanWeeklyTarget | null {
  const kpi = teamKpiAvg(opts.matchUnits);
  if (Object.keys(kpi).length === 0) return null;

  const comp = opts.phases.find((p) => p.key === "competitive");
  const off = opts.phases.find((p) => p.key === "offseason");
  const today = opts.today;

  // 1. In-season — this week's fixture-count-aware KPI volume (the calendar week for that many games),
  //    scaled by the meso ramp/deload factor for the block week today sits in (loading weeks ramp from
  //    the base week by stepPct). A competitive block has no deload unless the coach picked a light week,
  //    ~20% under its ramp (Fessi 2016). A block with no in-season flag keeps its ~60% deload (Gabbett 2016).
  if (comp && today >= comp.start && today < comp.end) {
    const matches = Math.max(0, Math.round(opts.matchesThisWeek ?? 1));
    const vols = inSeasonKpiVolumes(kpi, matches, opts.sport);
    if (vols.length === 0) return null;

    let factor = 1, weekIdx: number | undefined, blockWeeks: number | undefined, isDeloadWk = false, isLightWk = false, hold = false;
    const block = (opts.blocks ?? []).find((b) => today >= b.start && today < b.end);
    if (block) {
      blockWeeks = Math.max(1, block.weeks);
      weekIdx = Math.min(blockWeeks, Math.max(1, weeksBetween(block.start, today) + 1));
      const deloadWeek = block.deloadWeekStart ? Math.min(blockWeeks, Math.max(1, weeksBetween(block.start, block.deloadWeekStart) + 1)) : block.inSeason ? null : blockWeeks;
      // A competitive Realization block holds the standard week, so no step between weeks.
      hold = holdsStandardWeek(block.inSeason, opts.blockGoals?.[block.start] ?? block.goalKey);
      // baseMultiple 1 → the multiple IS the factor relative to the base (week-1) volume.
      const mw = mesoWeeklyMultiples({ numWeeks: blockWeeks, baseMultiple: 1, stepPct: hold ? 0 : opts.stepPct ?? 5, deloadWeek, light: !!block.inSeason })[weekIdx - 1];
      if (mw) { factor = mw.multiple; isDeloadWk = mw.isDeload; isLightWk = !!mw.isLight; }
    }

    const byKpi: Partial<Record<WeeklyLoadMetricKey, number>> = {};
    const coach = block ? blockKpiRatios(opts.blockKpi?.[block.start], opts.sport) : {};
    for (const v of vols) byKpi[v.key] = Math.round(v.weeklyValue * factor * (coach[v.key] ?? 1));
    const pct = Math.round(factor * 100);
    const label = isLightWk
      ? { en: `In-season — ${matches}-match week · light week (${pct}%)`, is: `Keppni — ${matches} leikja vika · létt vika (${pct}%)` }
      : isDeloadWk
      ? { en: `In-season — ${matches}-match week · deload (${pct}%)`, is: `Keppni — ${matches} leikja vika · niðurtröppun (${pct}%)` }
      : block && weekIdx
        ? { en: `In-season — ${matches}-match week · block wk ${weekIdx}/${blockWeeks}${hold ? "" : ` (${pct}%)`}`, is: `Keppni — ${matches} leikja vika · lotuvika ${weekIdx}/${blockWeeks}${hold ? "" : ` (${pct}%)`}` }
        : { en: `In-season — ${matches}-match week`, is: `Keppni — ${matches} leikja vika` };
    return { phase: "inseason", byKpi, label, weekIndex: weekIdx, totalWeeks: blockWeeks };
  }

  // 2. Off-season — light aerobic maintenance (hold, don't build).
  if (off && today >= off.start && today < off.end) {
    const byKpi: Partial<Record<WeeklyLoadMetricKey, number>> = {};
    for (const k of Object.keys(kpi) as WeeklyLoadMetricKey[]) {
      const mv = kpi[k]; if (mv == null) continue;
      byKpi[k] = Math.round(mv * OFFSEASON_MAINTENANCE_MULT * kpiTaperShare(k));
    }
    return { phase: "offseason", byKpi, label: { en: "Off-season — maintenance", is: "Undirbúningshlé — viðhald" } };
  }

  // 3. Pre-season — the same window, coach settings and anchor as the hub (this season's own window while
  //    it runs; the UPCOMING one — off-season end → next opener — once the off-season has started).
  const legacy: PreseasonSavedRow = { preseasonSessions: opts.sessionsPerWeek ?? null, preseasonWeek1Mult: opts.week1MatchMultiple ?? null };
  const cur = opts.savedWindow ?? legacy;
  const ps = preseasonForDate({
    phases: opts.phases, seasonYear: opts.seasonYear ?? Number(today.slice(0, 4)), nextSeasonYear: opts.nextSeasonYear ?? null,
    nextFirstFixture: opts.nextFirstFixture ?? null, today, date: today, savedWindow: cur, savedWindowNext: opts.savedWindowNext ?? cur,
  });
  if (ps?.weekIndex) {
    const a = preseasonAnchor({ matchUnits: opts.matchUnits, matchLoad: null, matchSrpe: null, loadSource: "gps" });
    const weeks = ps.window.weeks, w = ps.weekIndex;
    const row = preseasonRamp(a, null, weeks, ps.settings)[w - 1];
    const byKpi: Partial<Record<WeeklyLoadMetricKey, number>> = {};
    for (const k of Object.keys(row.byKpi) as WeeklyLoadMetricKey[]) byKpi[k] = row.byKpi[k]!;
    const ref = a.hasOwnKpi ? "" : " · reference values";
    const refIs = a.hasOwnKpi ? "" : " · viðmiðunargildi";
    return {
      phase: "preseason", byKpi, weekIndex: w, totalWeeks: weeks, multipleOfMatch: row.multipleOfMatch,
      label: { en: `Pre-season — week ${w} of ${weeks}${ref}`, is: `Undirbúningur — vika ${w} af ${weeks}${refIs}` },
    };
  }

  return null;
}
