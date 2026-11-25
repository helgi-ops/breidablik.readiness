/**
 * ONE source for the pre-season the coach is planning: which window it is, the coach's saved choices for
 * it, which week a date falls in, and the week-by-week load ramp. The Periodization Hub (Pre-season and
 * Macro tabs, PDF), the Week Setup pre-season card and the Weekly Load "plan" target all read through here,
 * so the same week shows the same number everywhere.
 *
 * Pure and deterministic. No new rules: the window is `detectSeasonPhases` + the next opener, the ramp is
 * `preseasonStartRamp`, the meso split is the hub's backwards layout. Descriptive — never the readiness colour.
 */

import { preseasonStartRamp, NORMATIVE_MATCH_KPI, NORMATIVE_MATCH_LOAD, type LoadAnchor, type PreseasonWeekTarget } from "./preseasonStart";
import { teamKpiAvg } from "./preseasonKpiMap";
import type { MatchUnit } from "./index";
import type { WeeklyLoadMetricKey } from "../externalLoad/weeklyLoadTypes";

type PhaseLike = { key: string; start: string; end: string; weeks: number };
export type PreseasonWindow = { start: string; weeks: number; end?: string };

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** The pre-season to PLAN FOR, relative to today. `detectSeasonPhases` only ever emits ONE pre-season
 *  (the build-up before THIS season's first fixture — in the past once the season is under way). Once
 *  we're in or past the off-season, the pre-season that matters is the NEXT one, which starts when the
 *  off-season ends (= the coach's next-pre-season date, or the shown off-season horizon). Its length is
 *  computed to the NEXT season's first competitive game (`nextFirstFixture`) when the coach has entered it,
 *  else it reuses the detected pre-season's week count. Returns null when there's no pre-season to plan. */
export function upcomingPreseason(phases: PhaseLike[], todayIso: string, nextFirstFixture?: string | null): PreseasonWindow | null {
  const pre = phases.find((p) => p.key === "preseason");
  const off = phases.find((p) => p.key === "offseason");
  if (off && todayIso >= off.start) {
    // Compute to the real opener when known, else fall back to the detected pre-season length.
    if (nextFirstFixture && nextFirstFixture > off.end) {
      const weeks = Math.max(1, Math.round((ms(nextFirstFixture) - ms(off.end)) / (7 * DAY)));
      return { start: off.end, weeks, end: nextFirstFixture };
    }
    return { start: off.end, weeks: Math.max(1, pre?.weeks ?? 10) };
  }
  if (pre) return { start: pre.start, weeks: Math.max(1, pre.weeks), end: pre.end };
  return null;
}

/** 1-based pre-season week a date falls in, or null when it's outside the window. */
export function preseasonWeekOf(dateIso: string, win: PreseasonWindow): number | null {
  if (dateIso < win.start) return null;
  const w = Math.floor((ms(dateIso) - ms(win.start)) / (7 * DAY)) + 1;
  return w >= 1 && w <= win.weeks ? w : null;
}

// Backwards periodization: given the pre-season window length and the coach's game-anchored TAIL blocks
// (lengths of the meso cycles nearest the opener — e.g. a short power/peaking block that ends ON the first
// game), lay out every block so the LAST ends at the opener and the FIRST (base) block absorbs the leftover
// weeks. Tail blocks that would leave < 2 base weeks are dropped from the earliest tail inward. Returns the
// split so the editor can render the flexible base separately from the coach's exact tail.
export const PRE_MIN_BLOCK = 2, PRE_MAX_BLOCK = 8;
export function preseasonMeso(windowWeeks: number, tail: number[], cadence: number): { lens: number[]; base: number[]; tail: number[] } {
  const W = Math.max(1, Math.round(windowWeeks));
  let t = tail.map((n) => Math.max(PRE_MIN_BLOCK, Math.min(PRE_MAX_BLOCK, Math.round(n))));
  let sumTail = t.reduce((s, n) => s + n, 0);
  while (t.length && W - sumTail < PRE_MIN_BLOCK) { sumTail -= t[0]; t = t.slice(1); }
  const baseWeeks = Math.max(0, W - sumTail);
  const base: number[] = [];
  if (baseWeeks > 0) {
    const n = Math.max(1, Math.ceil(baseWeeks / Math.max(2, cadence)));
    for (let k = 0; k < n; k++) base.push(Math.max(2, cadence));
    base[0] = baseWeeks - Math.max(2, cadence) * (n - 1); // earliest block absorbs the remainder
    if (base[0] < PRE_MIN_BLOCK && base.length > 1) { base[1] += base[0]; base.shift(); }
    if (base.length === 1) base[0] = baseWeeks;           // single base block = all the base weeks
  }
  return { lens: [...base, ...t], base, tail: t };
}

// ─── The coach's saved pre-season choices ────────────────────────────────────

export const PRESEASON_DEFAULT_SESSIONS = 4;
export const PRESEASON_DEFAULT_WEEK1 = 1.3;
const SESSION_CHOICES = [3, 4, 5, 6];

/** The overrides keys the pre-season reads (season_plans.overrides, or the API's savedWindow / savedWindowNext). */
export type PreseasonSavedRow = {
  preseasonSessions?: number | null;
  preseasonWeek1Mult?: number | null;
  preWeek1Kpi?: Record<string, number> | null;
  preMesoTail?: number[] | null;
} | null | undefined;

export type PreseasonSettings = {
  sessionsPerWeek: number;
  week1MatchMultiple: number;
  week1Kpi: Record<string, number>;
  mesoTail: number[] | null;
  /** Which of the above the coach actually saved (the rest are defaults) — "his choice stands". */
  saved: { sessionsPerWeek: boolean; week1MatchMultiple: boolean; week1Kpi: boolean; mesoTail: boolean };
};

/** Normalise one saved row to the settings the ramp uses (same clamps the hub applies on load). */
export function preseasonSettingsFrom(row: PreseasonSavedRow): PreseasonSettings {
  const r = row ?? {};
  const sessOk = typeof r.preseasonSessions === "number" && SESSION_CHOICES.includes(r.preseasonSessions);
  const w1Ok = typeof r.preseasonWeek1Mult === "number" && Number.isFinite(r.preseasonWeek1Mult);
  const kpi: Record<string, number> = {};
  if (r.preWeek1Kpi && typeof r.preWeek1Kpi === "object") {
    for (const [k, v] of Object.entries(r.preWeek1Kpi)) if (typeof v === "number" && Number.isFinite(v) && v > 0) kpi[k] = v;
  }
  const tail = Array.isArray(r.preMesoTail) ? r.preMesoTail.filter((n) => typeof n === "number" && Number.isFinite(n)) : [];
  return {
    sessionsPerWeek: sessOk ? (r.preseasonSessions as number) : PRESEASON_DEFAULT_SESSIONS,
    week1MatchMultiple: w1Ok ? Math.max(0.5, Math.min(3, r.preseasonWeek1Mult as number)) : PRESEASON_DEFAULT_WEEK1,
    week1Kpi: kpi,
    mesoTail: tail.length ? tail : null,
    saved: { sessionsPerWeek: sessOk, week1MatchMultiple: w1Ok, week1Kpi: Object.keys(kpi).length > 0, mesoTail: tail.length > 0 },
  };
}

/** True when the pre-season being planned belongs to the NEXT season row (the hub's `upcomingYear`). */
export function plansNextSeason(plan: { seasonYear: number; nextSeasonYear?: number | null }): boolean {
  return plan.nextSeasonYear != null && plan.nextSeasonYear !== plan.seasonYear;
}

/** The season row whose overrides hold the planned pre-season's choices. */
export function preseasonSeasonYear(plan: { seasonYear: number; nextSeasonYear?: number | null }): number {
  return plansNextSeason(plan) ? plan.nextSeasonYear! : plan.seasonYear;
}

/** The planned pre-season's settings from the periodization API echo (savedWindow = loaded season,
 *  savedWindowNext = the season the upcoming pre-season opens). Mirrors the hub's psSess / psW1 pick. */
export function preseasonSettingsForPlan(
  plan: { seasonYear: number; nextSeasonYear?: number | null },
  savedWindow: PreseasonSavedRow,
  savedWindowNext: PreseasonSavedRow,
): PreseasonSettings {
  return preseasonSettingsFrom(plansNextSeason(plan) ? savedWindowNext : savedWindow);
}

export type PreseasonForDate = {
  window: PreseasonWindow;
  settings: PreseasonSettings;
  /** 1-based week `date` falls in, or null when it's outside the window. */
  weekIndex: number | null;
  /** "upcoming" = the pre-season the hub plans; "current" = this season's own (past) pre-season. */
  which: "upcoming" | "current";
};

/** Which pre-season a date belongs to, with the coach's settings for it. The planned (upcoming) pre-season
 *  is the default — exactly what the hub's Pre-season tab shows. A date inside THIS season's own, already
 *  past pre-season reads that window with this season's saved row instead. */
export function preseasonForDate(input: {
  phases: PhaseLike[];
  seasonYear: number;
  nextSeasonYear?: number | null;
  nextFirstFixture?: string | null;
  today: string;
  date: string;
  savedWindow: PreseasonSavedRow;
  savedWindowNext: PreseasonSavedRow;
}): PreseasonForDate | null {
  const up = upcomingPreseason(input.phases, input.today, input.nextFirstFixture);
  if (!up) return null;
  const pre = input.phases.find((p) => p.key === "preseason");
  if (pre && pre.start !== up.start) {
    const cur: PreseasonWindow = { start: pre.start, weeks: Math.max(1, pre.weeks), end: pre.end };
    const w = preseasonWeekOf(input.date, cur);
    if (w != null) return { window: cur, settings: preseasonSettingsFrom(input.savedWindow), weekIndex: w, which: "current" };
  }
  return {
    window: up,
    settings: preseasonSettingsForPlan({ seasonYear: input.seasonYear, nextSeasonYear: input.nextSeasonYear }, input.savedWindow, input.savedWindowNext),
    weekIndex: preseasonWeekOf(input.date, up),
    which: "upcoming",
  };
}

// ─── The load anchor + ramp ──────────────────────────────────────────────────

export type PreseasonAnchor = {
  kpi: Partial<Record<WeeklyLoadMetricKey, number>>;
  matchLoad: number | null;
  anchor: LoadAnchor;
  /** The team has its own match KPIs (else the normative reference is used, low confidence). */
  hasOwnKpi: boolean;
};

/** What the ramp is anchored on: the team's own near-full match unit (with IMA KPIs), else the normative
 *  reference (adult football; a starting point the coach adjusts), labelled sRPE-only when that's all there is. */
export function preseasonAnchor(input: { matchUnits: MatchUnit[]; matchLoad: number | null; matchSrpe: number | null; loadSource: string }): PreseasonAnchor {
  const raw = teamKpiAvg(input.matchUnits, { ima: true });
  const hasOwnKpi = raw.totalPlayerLoad != null && Number.isFinite(raw.totalPlayerLoad);
  if (hasOwnKpi) return { kpi: raw, matchLoad: raw.totalPlayerLoad ?? input.matchLoad, anchor: "match_this_season", hasOwnKpi };
  return {
    kpi: NORMATIVE_MATCH_KPI as Partial<Record<WeeklyLoadMetricKey, number>>,
    matchLoad: NORMATIVE_MATCH_LOAD,
    anchor: input.loadSource === "srpe" && input.matchSrpe != null ? "srpe_only" : "normative",
    hasOwnKpi,
  };
}

/** The week-by-week pre-season load ramp for a window + the coach's settings. */
export function preseasonRamp(a: PreseasonAnchor, matchSrpe: number | null, weeks: number, s: Pick<PreseasonSettings, "sessionsPerWeek" | "week1MatchMultiple" | "week1Kpi">): PreseasonWeekTarget[] {
  return preseasonStartRamp({
    matchTypicalLoad: a.matchLoad, matchKpiAvg: a.kpi, matchSrpeAu: matchSrpe,
    sessionsPerWeek: s.sessionsPerWeek, preseasonWeeks: weeks, week1MatchMultiple: s.week1MatchMultiple,
    anchor: a.anchor, week1KpiOverride: s.week1Kpi,
  });
}
