/**
 * The in-season STANDARD WEEK = what the rule-compliant calendar week adds up to (coach's call, 2026-11-26).
 *
 * Before this the hub had two week models that disagreed: the "standard week" summed MicroPulse's MD-day
 * shares over MD-4, MD-3, MD-2, MD-1 (four training days in a row — against the in-season week rule), while
 * the calendar (`buildCalendarBlock`) types each day (Mechanical / Locomotive / Activation / Top-up, MD+2 and
 * MD-2 off) and plans each variable by its day-type share (`CAL_SHARE`, `CAL_SHARE_HI`, `CAL_SHARE_IMA`).
 * Now the calendar decides: the standard week is the calendar's own week for that fixture count, and each
 * variable's ×match is the sum of its day-type shares over that week (the match itself excluded).
 *
 * Football only. Basketball keeps its own shorter MD week (`standardTrainingDays(…, "basketball")`) because the
 * calendar's day layout is football-shaped. A week with no game, and a variable the calendar does not plan
 * (FMP, the old stride tiles), keep the MD-share model (`plannedVolume.ts`). Pure.
 */

import { buildCalendarBlock, CAL_SHARE, CAL_SHARE_HI, CAL_SHARE_IMA, type CalType } from "./index";
import { kpiVolumes, mesoTotalMultiple, mesoWeeklyMultiples, standardTrainingDays, weeklyKpiMultiple, weeklyTrainingMultiple, type KpiVolume, type MesoWeek } from "./plannedVolume";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

const isBasketball = (sport?: string | null) => String(sport ?? "").toLowerCase() === "basketball";

/** Does this week use the calendar's standard week? Football (or no sport) with at least one game. */
export function usesCalendarWeek(matches: number, sport?: string | null): boolean {
  return !isBasketball(sport) && Math.round(matches) >= 1;
}

// Where the games sit in a representative week (Mon = 0): one on Saturday; two Wednesday + Saturday;
// three or more Tuesday, Thursday, Saturday.
const GAME_DAYS: Record<number, number[]> = { 1: [5], 2: [2, 5], 3: [1, 3, 5] };
const MON = "2030-01-07"; // any Monday; the layout only depends on the weekday pattern
const iso = (offsetDays: number) => new Date(Date.parse(`${MON}T00:00:00Z`) + offsetDays * 86_400_000).toISOString().slice(0, 10);

const weekCache = new Map<number, Array<{ type: CalType; md: string }>>();

/** The calendar's training days for a week with `matches` games (football, in-season, standard/held week):
 *  every non-match, non-off day of that week, read from `buildCalendarBlock` itself so the two can never drift.
 *  1 game → Mechanical (MD-4), Locomotive (MD-3), Activation (MD-1), Top-up (MD+1); MD+2 and MD-2 off. */
function calendarStandardWeek(matches: number): Array<{ type: CalType; md: string }> {
  const m = Math.min(3, Math.max(1, Math.round(matches)));
  const hit = weekCache.get(m);
  if (hit) return hit;
  // Three block weeks with the same game pattern every week, plus the weeks either side, so the middle
  // week reads like any week of the season (last week's game gives its MD+1/MD+2, next week's its build-up).
  const fixtures: string[] = [];
  for (let w = -1; w <= 3; w++) for (const d of GAME_DAYS[m]) fixtures.push(iso(w * 7 + d));
  const unit = { dist: 1000, hsr: 1000, load: 1000, accdec: 1000, accHiEff: 1000, decHiEff: 1000, stride: 1000, dirFwd: null, dirBack: null, dirLat: null, rhie: null, symmetry: null, metPower: null };
  const blk = buildCalendarBlock({
    unit, startDate: MON, numWeeks: 3, scopeName: "standard week", matchDates: fixtures.filter((f) => f >= iso(0) && f < iso(21)), noAutoMatch: true,
    allFixtures: fixtures, inSeason: { start: iso(-7), end: iso(28) }, hold: true, deload: { weekStart: null, light: false },
  });
  const days = blk.weeks[1].days.filter((d) => d.type !== "match" && d.type !== "rest").map((d) => ({ type: d.type, md: d.md }));
  weekCache.set(m, days);
  return days;
}

/** The calendar's training day types for an in-season football week with `matches` games. */
export function inSeasonWeekDayTypes(matches: number): CalType[] {
  return calendarStandardWeek(matches).map((d) => d.type);
}

/** A variable's share of a match on one day type, as the calendar plans it. Null = the calendar does not plan it. */
export function calendarDayShare(key: WeeklyLoadMetricKey, t: CalType): number | null {
  switch (key) {
    case "totalPlayerLoad": return CAL_SHARE[t].load;
    case "totalDistance": return CAL_SHARE[t].dist;
    case "velocityBand5": return CAL_SHARE[t].hsr;
    case "velocityBand6": return CAL_SHARE[t].sprint;
    case "accelB23": return CAL_SHARE_HI[t].accHi;
    case "decelB23": return CAL_SHARE_HI[t].decHi;
    case "imaCod": return CAL_SHARE_IMA[t].cod;
    case "imaAccel": return CAL_SHARE_IMA[t].accel;
    case "imaDecel": return CAL_SHARE_IMA[t].decel;
    case "imaFrDistance": return CAL_SHARE[t].fr;
    case "imaStrideHi": return CAL_SHARE[t].stride;
    default: return null;
  }
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** One variable's in-season weekly ×match. Football with games: the calendar week's sum. Otherwise (basketball,
 *  a week without a game, a variable the calendar does not plan): the MD-share model, as before. */
export function inSeasonKpiMultiple(key: WeeklyLoadMetricKey, matches: number, sport?: string | null): number {
  if (usesCalendarWeek(matches, sport)) {
    const shares = inSeasonWeekDayTypes(matches).map((t) => calendarDayShare(key, t));
    if (shares.every((s) => s != null)) return r2(shares.reduce<number>((s, x) => s + (x ?? 0), 0));
  }
  return weeklyKpiMultiple(standardTrainingDays(matches, sport), key);
}

/** The week's headline ×match. Football with games: PlayerLoad (the mechanical axis) — the same sum the week
 *  cards' headers show (`CalWeek.pctMech`). Otherwise the MD-share volume multiple, as before. */
export function inSeasonWeekMultiple(matches: number, sport?: string | null): number {
  if (usesCalendarWeek(matches, sport)) return inSeasonKpiMultiple("totalPlayerLoad", matches, sport);
  return weeklyTrainingMultiple(standardTrainingDays(matches, sport));
}

/** Per-variable weekly volume for an in-season week: each variable's match value × its own in-season multiple. */
export function inSeasonKpiVolumes(matchKpiAvg: Partial<Record<WeeklyLoadMetricKey, number>>, matches: number, sport?: string | null): KpiVolume[] {
  if (!usesCalendarWeek(matches, sport)) return kpiVolumes(matchKpiAvg, standardTrainingDays(matches, sport));
  const out: KpiVolume[] = [];
  for (const key of Object.keys(matchKpiAvg) as WeeklyLoadMetricKey[]) {
    const mv = matchKpiAvg[key];
    if (mv == null || !Number.isFinite(mv)) continue;
    const mult = inSeasonKpiMultiple(key, matches, sport);
    const lab = WEEKLY_LOAD_LABELS[key];
    out.push({ key, label: { en: lab.en, is: lab.is }, unit: lab.unit, matchValue: mv, weeklyValue: Math.round(mv * mult), multiple: mult });
  }
  return out;
}

/** The MD labels of the in-season training days, in week order (for wording: "MD+1, MD-4, MD-3, MD-1"). */
export function inSeasonTrainingDayLabels(matches: number, sport?: string | null): string[] {
  if (!usesCalendarWeek(matches, sport)) return standardTrainingDays(matches, sport);
  return calendarStandardWeek(matches).map((d) => d.md);
}

export type PlannedVolumeKpiCell = { key: WeeklyLoadMetricKey; multiple: number; value: number };
export type PlannedVolume = {
  weekVolumeMultiple: number;                 // TRAINING-only ×match (volume, e=1) — falls as matches rise
  matches: number;                             // matches in the week (each = 1× a match by definition)
  weekTotalMultiple: number;                   // training + matches = the TOTAL week load as ×match. RISES
                                               // with congestion even as training falls (Anderson 2016).
  weekKpis: KpiVolume[];                       // per-KPI weekly target (each tapered)
  headKpis: WeeklyLoadMetricKey[];             // the KPIs shown as meso columns
  meso: Array<{ weekIndex: number; isDeload: boolean; isLight?: boolean; volMultiple: number; trainingMultiple: number; matches?: number; totalMultiple?: number; kpi: PlannedVolumeKpiCell[] }>;
  mesoTotal: { volMultiple: number; kpi: PlannedVolumeKpiCell[] };
};

/** One call that assembles the whole in-season planned-KPI-volume read (week + meso), per KPI + ramped —
 *  shared by the Hub card and the PDF so they never diverge. Returns null when there's no match unit. */
export function buildPlannedVolume(opts: {
  matchKpiAvg: Partial<Record<WeeklyLoadMetricKey, number>>;
  numWeeks: number; stepPct: number; deloadWeek?: number | null; light?: boolean; matches?: number; headKpiCount?: number;
  /** Matches per meso week (length numWeeks), e.g. from `matchesPerWeek(blockStart, numWeeks, fixtures)`.
   *  When given, each week's training multiple is recomputed for THAT week's game count and the total adds
   *  the games — a congested week reads HIGHER. When absent, every week uses the single `matches`. */
  matchesByWeek?: number[];
  /** Team sport — basketball keeps its shorter MD week (standardTrainingDays). Defaults to football. */
  sport?: string | null;
}): PlannedVolume | null {
  const matches = Math.max(0, Math.round(opts.matches ?? 1));
  const weekKpis = inSeasonKpiVolumes(opts.matchKpiAvg, matches, opts.sport);
  if (weekKpis.length === 0) return null;
  const wkMult = inSeasonWeekMultiple(matches, opts.sport);
  const meso = mesoWeeklyMultiples({ numWeeks: opts.numWeeks, baseMultiple: wkMult, stepPct: opts.stepPct, deloadWeek: opts.deloadWeek, light: opts.light });
  const headKpis = (Object.keys(opts.matchKpiAvg) as WeeklyLoadMetricKey[]).filter((k) => opts.matchKpiAvg[k] != null).slice(0, opts.headKpiCount ?? 2);
  const factor = (w: MesoWeek) => (wkMult > 0 ? w.multiple / wkMult : 0);
  const cell = (k: WeeklyLoadMetricKey, w: MesoWeek): PlannedVolumeKpiCell => {
    const mv = opts.matchKpiAvg[k] ?? 0, m = inSeasonKpiMultiple(k, matches, opts.sport);
    return { key: k, multiple: Math.round(m * factor(w) * 100) / 100, value: Math.round(mv * m * factor(w)) };
  };
  // Per-week congestion: when matchesByWeek is given, re-cost each week's TRAINING for that week's game
  // count (the calendar week for that many games) and add the games for the TOTAL. KPI cells stay on the
  // typical-week shape (per-KPI congestion is a secondary effect — the headline is the total).
  const mesoRows = meso.map((w) => {
    const mi = opts.matchesByWeek?.[w.weekIndex - 1];
    const factor = wkMult > 0 ? w.multiple / wkMult : 0; // this week's progression (ramp/deload) factor
    const trainingMultiple = mi != null
      ? Math.round(inSeasonWeekMultiple(mi, opts.sport) * factor * 100) / 100
      : w.multiple;
    const totalMultiple = mi != null ? Math.round((trainingMultiple + mi) * 100) / 100 : undefined;
    return { weekIndex: w.weekIndex, isDeload: w.isDeload, isLight: w.isLight, volMultiple: w.multiple, trainingMultiple, matches: mi, totalMultiple, kpi: headKpis.map((k) => cell(k, w)) };
  });
  return {
    weekVolumeMultiple: wkMult, matches, weekTotalMultiple: Math.round((wkMult + matches) * 100) / 100, weekKpis, headKpis,
    meso: mesoRows,
    mesoTotal: {
      volMultiple: mesoTotalMultiple(meso),
      kpi: headKpis.map((k) => ({ key: k, multiple: Math.round(meso.reduce((s, w) => s + cell(k, w).multiple, 0) * 100) / 100, value: meso.reduce((s, w) => s + cell(k, w).value, 0) })),
    },
  };
}
