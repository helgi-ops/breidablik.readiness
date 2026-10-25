/**
 * The periodization PLAN's weekly KPI target for a given day — the bridge that lets the live Weekly Load
 * tracker (external-load page) measure the running week against the coach's own season plan, instead of a
 * generic historical baseline or match-demand template.
 *
 * Resolves TODAY → the phase + week the plan is in, and returns the per-KPI weekly target for that week:
 *   - Pre-season  → the controlled re-entry ramp (`preseasonStartRamp`), per-KPI tapered. Week 1 is when
 *                   off-season ends; the ramp climbs from there. Uses the UPCOMING pre-season once the
 *                   season is under way (the historical one is in the past).
 *   - In-season   → `kpiVolumes` for the week's fixture count (match × each KPI's tapered weekly multiple;
 *                   Martín-García 2018 — HSR/sprint accumulate a smaller weekly ×match than distance).
 *   - Off-season  → a light aerobic MAINTENANCE dose (~1.2× a match, per-KPI tapered; Rønnestad 2011 —
 *                   hold the level, don't build; no fixtures to peak for).
 *
 * Pure, deterministic, null-safe. Descriptive — it never sets the readiness colour or the daily decision.
 * Anchored on the team's own near-full match unit (median), the single match-unit the whole hub uses.
 */

import { preseasonStartRamp } from "./preseasonStart";
import { kpiVolumes, kpiTaperShare, standardTrainingDays } from "./plannedVolume";
import { teamKpiAvg } from "./preseasonKpiMap";
import type { MatchUnit, SeasonPhase } from "./index";
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
const addDaysIso = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);

/** Which 1-based week of a [start, start+weeks) pre-season window `today` falls in, or null if outside. */
function preseasonWeekOf(today: string, start: string, weeks: number): number | null {
  if (today < start) return null;
  const end = addDaysIso(start, weeks * 7);
  if (today >= end) return null;
  return Math.min(weeks, Math.floor((ms(today) - ms(start)) / (7 * DAY)) + 1);
}

/** Resolve the plan's weekly per-KPI target for `today`. Returns null when there's no match unit to anchor
 *  to (so the caller falls back to the baseline). `matchesThisWeek` is the fixture count for the running
 *  week (in-season only); pre-season/off-season ignore it. */
export function planWeeklyTarget(opts: {
  phases: SeasonPhase[];
  matchUnits: MatchUnit[];
  today: string;
  matchesThisWeek?: number;
  week1MatchMultiple?: number;
  sessionsPerWeek?: number;
}): PlanWeeklyTarget | null {
  const kpi = teamKpiAvg(opts.matchUnits);
  if (Object.keys(kpi).length === 0) return null;

  const pre = opts.phases.find((p) => p.key === "preseason");
  const comp = opts.phases.find((p) => p.key === "competitive");
  const off = opts.phases.find((p) => p.key === "offseason");
  const today = opts.today;

  const preRampWeek = (start: string, weeks: number, w: number): PlanWeeklyTarget => {
    const row = preseasonStartRamp({
      matchTypicalLoad: kpi.totalPlayerLoad ?? null, matchKpiAvg: kpi,
      sessionsPerWeek: opts.sessionsPerWeek ?? 4, preseasonWeeks: weeks,
      week1MatchMultiple: opts.week1MatchMultiple ?? 1.3, anchor: "match_this_season",
    })[w - 1];
    const byKpi: Partial<Record<WeeklyLoadMetricKey, number>> = {};
    for (const k of Object.keys(row.byKpi) as WeeklyLoadMetricKey[]) byKpi[k] = row.byKpi[k]!;
    return {
      phase: "preseason", byKpi, weekIndex: w, totalWeeks: weeks, multipleOfMatch: row.multipleOfMatch,
      label: { en: `Pre-season — week ${w} of ${weeks}`, is: `Undirbúningur — vika ${w} af ${weeks}` },
    };
  };

  // 1. In-season — this week's fixture-count-aware KPI volume (each KPI tapered by its own exponent).
  if (comp && today >= comp.start && today < comp.end) {
    const matches = Math.max(0, Math.round(opts.matchesThisWeek ?? 1));
    const vols = kpiVolumes(kpi, standardTrainingDays(matches));
    if (vols.length === 0) return null;
    const byKpi: Partial<Record<WeeklyLoadMetricKey, number>> = {};
    for (const v of vols) byKpi[v.key] = v.weeklyValue;
    return {
      phase: "inseason", byKpi,
      label: { en: `In-season — ${matches}-match week`, is: `Keppni — ${matches} leikja vika` },
    };
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

  // 3. Pre-season — the historical window (before this season's first fixture)…
  if (pre) { const w = preseasonWeekOf(today, pre.start, pre.weeks); if (w) return preRampWeek(pre.start, pre.weeks, w); }
  // …or the UPCOMING one, which starts when the off-season ends (next-pre-season date), reusing its length.
  if (off) { const upWeeks = Math.max(1, pre?.weeks ?? 10); const w = preseasonWeekOf(today, off.end, upWeeks); if (w) return preRampWeek(off.end, upWeeks, w); }

  return null;
}
