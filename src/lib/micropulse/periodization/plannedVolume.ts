/**
 * Planned KPI volume — how much load a MICRO cycle (week) and a MESO cycle (block) should carry, anchored
 * to MATCH demand. Pure, cited, IO-free.
 *
 * Evidence base:
 *  - The match is the reference unit; weekly load is expressed as a MULTIPLE of a match, per KPI
 *    (Martín-García et al. 2018, "Quantification of a professional football team's external load using a
 *    microcycle structure" — weekly totals ≈ 3–5× a single match, with HSR/sprint at lower multiples).
 *  - The within-week shape (MD-day %s) is Buchheit 2024's microcycle periodization, reused from
 *    `planSessionLoad` (MD-3 peak 85%, MD-4 68%, MD-2 50%, MD-1 32%).
 *  - The block (meso) progresses with a ramp + a deload week (3:1 / progressive overload, Gabbett 2016);
 *    ACWR 0.8–1.3 is a guardrail, not a predictor (contested — Impellizzeri 2020), handled elsewhere.
 *  - Pre-season has no matches → anchor to the TARGET match unit and ramp toward it (preseasonStart.ts).
 *
 * Per-KPI tapering is approximated by a single weekly multiple applied to every KPI (the same simplification
 * the pre-season ramp uses); different KPIs taper slightly differently in Martín-García — a noted refinement.
 */

import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

/** The canonical TRAINING-day MD labels for a week with `matches` matches (MD-7 structure). The match
 *  day(s) are excluded — they ARE the unit. Fewer training days as the fixture congestion rises. */
export function standardTrainingDays(matches: number): string[] {
  if (matches <= 0) return ["MD-5", "MD-4", "MD-3", "MD-2", "MD-1"]; // a full no-match training week
  if (matches === 1) return ["MD-4", "MD-3", "MD-2", "MD-1"];
  if (matches === 2) return ["MD-3", "MD-2", "MD-1"];                // ~3 training days across two games
  return ["MD-2", "MD-1"];                                           // 3 games → minimal training
}

/** Weekly TRAINING load as a multiple of one match: Σ of each training day's matchPct (Buchheit 2024
 *  via planSessionLoad) ÷ 100. Excludes the match itself; add `matches` to get total weekly exposure. */
export function weeklyTrainingMultiple(mdDays: string[]): number {
  let sum = 0;
  for (const d of mdDays) {
    const p = planSessionLoad({ mdDay: d, dayType: null, focus: null });
    if (p.applicable) sum += p.matchPct;
  }
  return Math.round((sum / 100) * 100) / 100;
}

export type KpiVolume = { key: WeeklyLoadMetricKey; label: { en: string; is: string }; unit: string; matchValue: number; weeklyValue: number };

/** Per-KPI planned weekly volume = each KPI's match value × the weekly multiple (Martín-García 2018). */
export function kpiVolumes(matchKpiAvg: Partial<Record<WeeklyLoadMetricKey, number>>, multiple: number): KpiVolume[] {
  const out: KpiVolume[] = [];
  for (const key of Object.keys(matchKpiAvg) as WeeklyLoadMetricKey[]) {
    const mv = matchKpiAvg[key];
    if (mv == null || !Number.isFinite(mv)) continue;
    const lab = WEEKLY_LOAD_LABELS[key];
    out.push({ key, label: { en: lab.en, is: lab.is }, unit: lab.unit, matchValue: mv, weeklyValue: Math.round(mv * multiple) });
  }
  return out;
}

export type MesoWeek = { weekIndex: number; multiple: number; isDeload: boolean };

/** Per-week training multiple across a meso block. Loading weeks ramp from `baseMultiple` by `stepPct`
 *  each; the deload week (default = the last week) drops to ~60% of base (3:1 block, Gabbett 2016). */
export function mesoWeeklyMultiples(opts: { numWeeks: number; baseMultiple: number; stepPct: number; deloadWeek?: number }): MesoWeek[] {
  const n = Math.max(1, Math.round(opts.numWeeks));
  const deload = Math.min(n, Math.max(1, opts.deloadWeek ?? n));
  const rows: MesoWeek[] = [];
  let loadIdx = 0;
  for (let w = 1; w <= n; w++) {
    if (w === deload && n > 1) { rows.push({ weekIndex: w, multiple: Math.round(opts.baseMultiple * 0.6 * 100) / 100, isDeload: true }); continue; }
    const mult = opts.baseMultiple * (1 + (Math.max(0, opts.stepPct) / 100) * loadIdx);
    rows.push({ weekIndex: w, multiple: Math.round(mult * 100) / 100, isDeload: false });
    loadIdx++;
  }
  return rows;
}

/** Block total multiple (sum of all weeks) — the meso's total planned training volume as ×match. */
export const mesoTotalMultiple = (weeks: MesoWeek[]): number => Math.round(weeks.reduce((s, w) => s + w.multiple, 0) * 100) / 100;
