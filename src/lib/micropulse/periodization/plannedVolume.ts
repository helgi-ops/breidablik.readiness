/**
 * Planned KPI volume — how much load a MICRO cycle (week) and a MESO cycle (block) should carry, anchored
 * to MATCH demand, PER KPI. Pure, cited, IO-free.
 *
 * Evidence base:
 *  - The match is the reference unit; weekly load is expressed as a MULTIPLE of a match, per KPI
 *    (Martín-García et al. 2018 — weekly totals ≈ 3–5× a single match).
 *  - The within-week shape (MD-day %s) is Buchheit 2024's microcycle periodization, reused from
 *    `planSessionLoad` (MD-3 peak 85%, MD-4 68%, MD-2 50%, MD-1 32%).
 *  - CRITICAL per-KPI nuance: high-intensity metrics (HSR, sprint distance, high stride bands) are
 *    CONCENTRATED on the high days (MD-4/MD-3) and taper to near-zero on MD-2/MD-1 — so their WEEKLY
 *    accumulation is a SMALLER multiple of a match than total distance / PlayerLoad (volume) is
 *    (Martín-García 2018; Oliva-Lozano 2020/2021 — session intensity distribution). Modelled with a
 *    per-KPI taper exponent `e`: each day contributes `f^e` of its match value (f = the day's load
 *    fraction); e=1 for volume, e>1 for high-intensity (steeper taper on low-load days).
 *  - The block (meso) progresses with a ramp + a deload week (3:1 / progressive overload, Gabbett 2016).
 *  - Pre-season has no matches → anchor to the TARGET match unit and ramp toward it (preseasonStart.ts).
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

/** Per-KPI taper exponent — how steeply a KPI falls on low-load days. Volume metrics (distance,
 *  PlayerLoad) scale ~linearly with the day's load (e=1); high-intensity metrics taper HARDER (e>1), so
 *  their weekly accumulation is a SMALLER ×match than distance (Martín-García 2018; Oliva-Lozano 2020).
 *  e=1 for an unknown KPI. */
export const KPI_TAPER_EXPONENT: Partial<Record<WeeklyLoadMetricKey, number>> = {
  totalDistance: 1.0, totalPlayerLoad: 1.0,
  velocityBand5: 1.5, velocityBand6: 2.0,     // HSR, sprint distance — taper hardest
  accelB23: 1.2, decelB23: 1.2,               // mechanical — intermediate
  fmpDynamicHigh: 1.5, fmpDynamicMedium: 1.1, fmpRunningHigh: 1.5,
  imaTotal: 1.1, imaAccel: 1.2, imaDecel: 1.2, imaCod: 1.3,
  imaStrideBand6: 1.5, imaStrideBand7: 1.7, imaStrideBand8: 2.0,
};

/** The per-day match-fractions (matchPct/100) for a set of MD-days (Buchheit 2024 via planSessionLoad). */
export function dayFractions(mdDays: string[]): number[] {
  const out: number[] = [];
  for (const d of mdDays) { const p = planSessionLoad({ mdDay: d, dayType: null, focus: null }); if (p.applicable) out.push(p.matchPct / 100); }
  return out;
}

/** Weekly multiple for a taper exponent: Σ f^e over the training days. e=1 → the volume multiple. */
export function weeklyMultiple(fractions: number[], exponent = 1): number {
  return Math.round(fractions.reduce((s, f) => s + Math.pow(f, Math.max(0.1, exponent)), 0) * 100) / 100;
}

/** Weekly TRAINING volume multiple (e=1) — the headline "×match". */
export function weeklyTrainingMultiple(mdDays: string[]): number { return weeklyMultiple(dayFractions(mdDays), 1); }

/** One KPI's tapered weekly multiple. */
export function weeklyKpiMultiple(mdDays: string[], key: WeeklyLoadMetricKey): number {
  return weeklyMultiple(dayFractions(mdDays), KPI_TAPER_EXPONENT[key] ?? 1);
}

export type KpiVolume = { key: WeeklyLoadMetricKey; label: { en: string; is: string }; unit: string; matchValue: number; weeklyValue: number; multiple: number };

/** Per-KPI planned weekly volume = each KPI's match value × its OWN tapered weekly multiple (so HSR/sprint
 *  come out as a lower ×match than total distance). */
export function kpiVolumes(matchKpiAvg: Partial<Record<WeeklyLoadMetricKey, number>>, mdDays: string[]): KpiVolume[] {
  const fr = dayFractions(mdDays);
  const out: KpiVolume[] = [];
  for (const key of Object.keys(matchKpiAvg) as WeeklyLoadMetricKey[]) {
    const mv = matchKpiAvg[key];
    if (mv == null || !Number.isFinite(mv)) continue;
    const mult = weeklyMultiple(fr, KPI_TAPER_EXPONENT[key] ?? 1);
    const lab = WEEKLY_LOAD_LABELS[key];
    out.push({ key, label: { en: lab.en, is: lab.is }, unit: lab.unit, matchValue: mv, weeklyValue: Math.round(mv * mult), multiple: mult });
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

export type PlannedVolumeKpiCell = { key: WeeklyLoadMetricKey; multiple: number; value: number };
export type PlannedVolume = {
  weekVolumeMultiple: number;                 // the headline ×match (volume, e=1)
  weekKpis: KpiVolume[];                       // per-KPI weekly target (each tapered)
  headKpis: WeeklyLoadMetricKey[];             // the KPIs shown as meso columns
  meso: Array<{ weekIndex: number; isDeload: boolean; volMultiple: number; kpi: PlannedVolumeKpiCell[] }>;
  mesoTotal: { volMultiple: number; kpi: PlannedVolumeKpiCell[] };
};

/** One call that assembles the whole planned-KPI-volume read (week + meso), per-KPI tapered + ramped —
 *  shared by the Hub card and the PDF so they never diverge. Returns null when there's no match unit. */
export function buildPlannedVolume(opts: {
  matchKpiAvg: Partial<Record<WeeklyLoadMetricKey, number>>;
  numWeeks: number; stepPct: number; deloadWeek?: number; matches?: number; headKpiCount?: number;
}): PlannedVolume | null {
  const days = standardTrainingDays(opts.matches ?? 1);
  const weekKpis = kpiVolumes(opts.matchKpiAvg, days);
  if (weekKpis.length === 0) return null;
  const wkMult = weeklyTrainingMultiple(days);
  const meso = mesoWeeklyMultiples({ numWeeks: opts.numWeeks, baseMultiple: wkMult, stepPct: opts.stepPct, deloadWeek: opts.deloadWeek });
  const headKpis = (Object.keys(opts.matchKpiAvg) as WeeklyLoadMetricKey[]).filter((k) => opts.matchKpiAvg[k] != null).slice(0, opts.headKpiCount ?? 2);
  const factor = (w: MesoWeek) => (wkMult > 0 ? w.multiple / wkMult : 0);
  const cell = (k: WeeklyLoadMetricKey, w: MesoWeek): PlannedVolumeKpiCell => {
    const mv = opts.matchKpiAvg[k] ?? 0, m = weeklyKpiMultiple(days, k);
    return { key: k, multiple: Math.round(m * factor(w) * 100) / 100, value: Math.round(mv * m * factor(w)) };
  };
  return {
    weekVolumeMultiple: wkMult, weekKpis, headKpis,
    meso: meso.map((w) => ({ weekIndex: w.weekIndex, isDeload: w.isDeload, volMultiple: w.multiple, kpi: headKpis.map((k) => cell(k, w)) })),
    mesoTotal: {
      volMultiple: mesoTotalMultiple(meso),
      kpi: headKpis.map((k) => ({ key: k, multiple: Math.round(meso.reduce((s, w) => s + cell(k, w).multiple, 0) * 100) / 100, value: meso.reduce((s, w) => s + cell(k, w).value, 0) })),
    },
  };
}
