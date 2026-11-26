/**
 * The In-season Meso tab of the Periodization Hub, as pure reads. Lifted from the tab (page.tsx) so the
 * mirrored layout and its tests share one source. Presentation only: every number comes from the existing
 * functions (plannedVolume, buildCalendarBlock, weekRules); nothing here adds a rule or a threshold.
 */

import type { WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";
import { checkThreeInARow, type WeekRuleDay } from "@/lib/micropulse/weekSetup/weekRules";
import {
  kpiTmRefRange, kpiVolumes, mesoTotalMultiple, mesoWeeklyMultiples, standardTrainingDays, weeklyKpiMultiple, weeklyTrainingMultiple,
  type KpiVolume, type MesoWeek,
} from "./plannedVolume";
import { tmRefBand, type TmBand } from "./matchReference";

type Bi = { en: string; is: string };

const addDays = (iso: string, n: number) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ── Rule marks ─────────────────────────────────────────────────────────────────────────────────────────────

export const RULE_MD2: Bi = { en: "Against the rule (your choice): MD+2 is a day off in season", is: "Gegn reglu (þitt val): MD+2 er frídagur á keppnistímabili" };
export const RULE_THREE: Bi = { en: "Against the rule (your choice): three training days in a row", is: "Gegn reglu (þitt val): þrjár æfingar í röð" };

type RuleWeek = { weekStart: string; days: Array<{ type: string }> };

/** The in-season rules on the shown block: a training day the coach set against them keeps (their call) but is
 *  marked. MD+2 = a session two days after a match (not the day after another); three in a row =
 *  INSEASON_THREE_IN_A_ROW. Days outside the in-season range are not checked. MD+2 wins when both apply. */
export function inSeasonRuleBreaks(weeks: RuleWeek[], fixtures: string[], inSeason: { start: string; end: string } | null): Map<string, Bi> {
  const out = new Map<string, Bi>();
  if (!inSeason) return out;
  const rDays: WeekRuleDay[] = [];
  weeks.forEach((w) => w.days.forEach((d, i) => {
    const iso = addDays(w.weekStart, i);
    if (iso < inSeason.start || iso >= inSeason.end) return;
    rDays.push({ date: iso, kind: d.type === "match" ? "match" : d.type === "rest" ? "off" : "session", editable: false });
    if (d.type !== "rest" && d.type !== "match" && fixtures.includes(addDays(iso, -2)) && !fixtures.includes(addDays(iso, -1))) out.set(iso, RULE_MD2);
  }));
  for (const run of checkThreeInARow({ days: rDays, matchDates: fixtures, phase: "competitive" }).runs)
    for (const d of run.days) if (!out.has(d.date)) out.set(d.date, RULE_THREE);
  return out;
}

// ── The block's weekly volume (the standard week, per variable) ───────────────────────────────────────────

export type VariableRow = {
  key: WeeklyLoadMetricKey;
  label: Bi;
  unit: string;
  /** One match in this variable. */
  matchValue: number;
  /** The standard week (week 1) in × a match and raw. */
  week: number;
  weekRaw: number;
  /** The heaviest non-light week, only when the weeks differ. */
  peak: number | null;
  /** The light / deload week, when the block has one. */
  light: number | null;
  ref: [number, number] | null;
  band: TmBand | null;
};

export type BlockVolumeView = {
  /** The standard week's training in × a match (volume, all variables together). */
  weekMultiple: number;
  /** The standard week plus the match itself. */
  totalWithMatch: number;
  weeks: MesoWeek[];
  blockTotal: number;
  weeksDiffer: boolean;
  /** Index into `weeks` of the heaviest non-light week, and of the light/deload week (−1 when none). */
  peakIdx: number;
  lightIdx: number;
  rows: VariableRow[];
  /** A variable's × a match in week `i` (its own tapered multiple, scaled by that week's ramp). */
  weekKpi: (key: WeeklyLoadMetricKey, i: number) => number;
  /** A variable's raw value in week `i` (null when the variable has no match value). */
  weekKpiRaw: (key: WeeklyLoadMetricKey, i: number) => number | null;
  /** The volumes as plannedVolume returns them (raw labels), for the detail table. */
  vols: KpiVolume[];
};

/** The block's weekly volume — exactly the numbers the In-season tab showed (a standard one-match week, the
 *  meso ramp by `stepPct`, the light/deload week), gathered in one read. */
export function blockVolumeView(opts: {
  matchKpis: Partial<Record<WeeklyLoadMetricKey, number>>;
  numWeeks: number;
  stepPct: number;
  deloadWeek: number | null;
  light?: boolean;
}): BlockVolumeView {
  const days1 = standardTrainingDays(1);
  const wkMult = weeklyTrainingMultiple(days1);
  const vols = kpiVolumes(opts.matchKpis, days1);
  const weeks = mesoWeeklyMultiples({ numWeeks: opts.numWeeks, baseMultiple: wkMult, stepPct: opts.stepPct, deloadWeek: opts.deloadWeek, light: opts.light });
  const weeksDiffer = weeks.some((w) => w.multiple !== weeks[0]?.multiple);
  const lightIdx = weeks.findIndex((w) => w.isDeload);
  const peakIdx = weeks.reduce((best, w, i) => (!w.isDeload && (best < 0 || w.multiple > weeks[best].multiple) ? i : best), -1);
  const rampFactor = (w: MesoWeek | undefined) => (w && wkMult > 0 ? w.multiple / wkMult : 0);
  const weekKpi = (k: WeeklyLoadMetricKey, i: number) => Math.round(weeklyKpiMultiple(days1, k) * rampFactor(weeks[i]) * 100) / 100;
  const weekKpiRaw = (k: WeeklyLoadMetricKey, i: number) => { const mv = opts.matchKpis[k]; return mv == null ? null : mv * weeklyKpiMultiple(days1, k) * rampFactor(weeks[i]); };
  const rows: VariableRow[] = vols.map((v) => {
    const ref = kpiTmRefRange(v.key);
    return {
      key: v.key, label: v.label, unit: v.unit, matchValue: v.matchValue,
      week: v.multiple, weekRaw: v.weeklyValue,
      peak: weeksDiffer && peakIdx >= 0 ? weekKpi(v.key, peakIdx) : null,
      light: lightIdx >= 0 ? weekKpi(v.key, lightIdx) : null,
      ref, band: tmRefBand(v.multiple, ref),
    };
  });
  return {
    weekMultiple: wkMult,
    totalWithMatch: Math.round((wkMult + 1) * 10) / 10,
    weeks, blockTotal: mesoTotalMultiple(weeks), weeksDiffer, peakIdx, lightIdx, rows, weekKpi, weekKpiRaw, vols,
  };
}

// ── The calendar week, summed (what the week card shows) ───────────────────────────────────────────────────

type SumWeek = { pctMech: number | null; days: Array<{ type: string }> };

/** The week's training in × a match: what its days add up to (Player Load, the match itself excluded). */
export function calWeekMultiple(w: SumWeek | null | undefined): number | null {
  return w?.pctMech == null ? null : Math.round(w.pctMech) / 100;
}

/** Training sessions in a calendar week: every day that is neither a match nor off. */
export function sessionsInWeek(w: { days: Array<{ type: string }> }): number {
  return w.days.filter((d) => d.type !== "rest" && d.type !== "match").length;
}

/** Lowest and highest of a list (null when empty). */
export function minMax(xs: Array<number | null | undefined>): [number, number] | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
}

/** Fixtures in [start, endExcl). */
export function gamesInRange(fixtures: string[], start: string, endExcl: string): string[] {
  return fixtures.filter((d) => d >= start && d < endExcl).sort();
}

/** Fixtures in the week starting `weekStart` (a Monday). */
export function gamesInWeek(fixtures: string[], weekStart: string): string[] {
  return gamesInRange(fixtures, weekStart, addDays(weekStart, 7));
}
