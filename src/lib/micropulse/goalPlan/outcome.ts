/**
 * Goal plan outcome (lota 4): did the 8 weeks change the test? Pure and client-safe; rules only, no AI.
 *
 *   - Test results: the week-1 starting point ("baseline") and the week-8 retest, per measure. The coach enters them;
 *     jump height also comes from VALD (mean of the test's trials, Claudino 2017) without typing.
 *   - The change is read against a fixed "clear change" mark per measure. Below it = no clear change. The marks are
 *     the ones the plan already printed in its tests section (1% top speed, 2% for 10 m and jump height), and a
 *     MicroPulse rule for the cut test (3%), where the trial only says the cut cost varied 12–21% within one session.
 *   - GPS is CONTEXT, never the verdict: fastest days for top speed; for braking and acceleration the count of hard
 *     efforts in the units' top band (Catapult IMA Dec / Acc band 3) when the player has it, otherwise the peak in
 *     m/s² (Marvin 2024 points out that GPS deceleration in game-like drills was the only direct braking measure in
 *     the studies). Teams carry one or the other, never mixed in one line. Matches and drills move those numbers, so
 *     they never decide the outcome.
 *   - Adherence: sessions the rules placed on a day that has passed, and how many the player ticked as done.
 *
 * Wording: changes are "faster / higher / no clear change"; nothing here says the plan caused or prevented anything.
 */

import { QUALITY_LABEL } from "./common";
import type { Bi, GoalQuality, GoalSessionSlot } from "./types";

export type GoalMeasure = "flying_20m_s" | "top_speed_kmh" | "sprint_10m_s" | "cut_test_s" | "cmj_cm";
export const GOAL_MEASURES: GoalMeasure[] = ["flying_20m_s", "top_speed_kmh", "sprint_10m_s", "cut_test_s", "cmj_cm"];

export type MeasureDef = {
  label: Bi;
  unit: string;
  better: "lower" | "higher";
  /** Change below this % reads as "no clear change". */
  clearPct: number;
  clearBasis: Bi;
  decimals: number;
  /** Plausible range (entry check). */
  min: number;
  max: number;
};

const RULE_1PCT: Bi = { en: "MicroPulse rule (timing gates and GPS vary a little day to day)", is: "Regla MicroPulse (tímahlið og GPS sveiflast aðeins milli daga)" };
const RULE_2PCT_10M: Bi = { en: "MicroPulse rule (no paper gives the smallest real change for 10 m)", is: "Regla MicroPulse (engin grein gefur minnstu raunbreytingu fyrir 10 m)" };

export const MEASURE_DEF: Record<GoalMeasure, MeasureDef> = {
  flying_20m_s: {
    label: { en: "Flying 20 m", is: "Fljúgandi 20 m" }, unit: "s", better: "lower", clearPct: 1, clearBasis: RULE_1PCT, decimals: 2, min: 1.5, max: 4.5,
  },
  top_speed_kmh: {
    label: { en: "Top speed (test)", is: "Hámarkshraði (próf)" }, unit: "km/h", better: "higher", clearPct: 1, clearBasis: RULE_1PCT, decimals: 1, min: 15, max: 45,
  },
  sprint_10m_s: {
    label: { en: "10 m from standing", is: "10 m frá kyrrstöðu" }, unit: "s", better: "lower", clearPct: 2, clearBasis: RULE_2PCT_10M, decimals: 2, min: 1.3, max: 3.5,
  },
  cut_test_s: {
    label: { en: "Cut test (5 m in, 70°, 5 m out)", is: "Stefnubreytingarpróf (5 m inn, 70°, 5 m út)" }, unit: "s", better: "lower", clearPct: 3,
    clearBasis: { en: "MicroPulse rule (the cut's extra time varied 12–21% within one session in the trial)", is: "Regla MicroPulse (aukatími stefnubreytingar sveiflaðist um 12–21% innan einnar æfingar í rannsókninni)" },
    decimals: 2, min: 1.5, max: 5,
  },
  cmj_cm: {
    label: { en: "Jump height (CMJ)", is: "Stökkhæð (CMJ)" }, unit: "cm", better: "higher", clearPct: 2,
    clearBasis: { en: "MicroPulse rule (the trials used about 0.6–1.2 cm)", is: "Regla MicroPulse (rannsóknirnar notuðu um 0,6–1,2 cm)" },
    decimals: 1, min: 5, max: 90,
  },
};

/** The measures each quality's tests use, the main one first. */
export const QUALITY_MEASURES: Record<GoalQuality, GoalMeasure[]> = {
  top_speed: ["flying_20m_s", "top_speed_kmh"],
  acceleration: ["sprint_10m_s"],
  braking: ["cut_test_s", "sprint_10m_s"],
  jump: ["cmj_cm"],
};

export type ResultPhase = "baseline" | "retest";
export const PHASE_LABEL: Record<ResultPhase, Bi> = {
  baseline: { en: "Start (week 1)", is: "Upphaf (vika 1)" },
  retest: { en: "Retest (week 8)", is: "Endurpróf (vika 8)" },
};

export type GoalResult = {
  id: string;
  measure: GoalMeasure;
  phase: ResultPhase;
  value: number;
  test_date: string;
  note: string | null;
  /** "coach" = entered on the goal page; "vald" = read from the force plates (jump height, mean of the trials). */
  source: "coach" | "vald";
};

// ─── Dates (local; the module stays dependency-free) ───────────────────────

const DAY_MS = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const addDays = (iso: string, n: number) => new Date(toMs(iso) + n * DAY_MS).toISOString().slice(0, 10);

/** Results may be dated from 4 weeks before the start to 3 weeks after the end (jump: a retest a week after). */
export const RESULT_BEFORE_START_DAYS = 28;
export const RESULT_AFTER_END_DAYS = 21;
/** The player's finished card shows for this long after the last week. */
export const FINISHED_CARD_DAYS = 14;

// ─── Entry check ───────────────────────────────────────────────────────────

export type ResultInput = { measure: GoalMeasure; phase: ResultPhase; value: number; testDate: string; note: string | null };

export function parseResultInput(
  body: unknown,
  args: { quality: GoalQuality; startDate: string; endDate: string; todayIso: string },
): { ok: true; value: ResultInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const measure = b.measure as GoalMeasure;
  if (!QUALITY_MEASURES[args.quality].includes(measure)) return { ok: false, error: "That test is not part of this plan." };
  const phase = b.phase === "baseline" || b.phase === "retest" ? b.phase : null;
  if (!phase) return { ok: false, error: "Pick start (week 1) or retest (week 8)." };
  const value = typeof b.value === "number" ? b.value : typeof b.value === "string" ? Number(b.value.replace(",", ".")) : NaN;
  const def = MEASURE_DEF[measure];
  if (!Number.isFinite(value) || value < def.min || value > def.max) {
    return { ok: false, error: `${def.label.en} must be between ${def.min} and ${def.max} ${def.unit}.` };
  }
  const testDate = typeof b.testDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.testDate) ? b.testDate : "";
  if (!testDate || Number.isNaN(toMs(testDate))) return { ok: false, error: "Give the test date." };
  if (testDate > args.todayIso) return { ok: false, error: "The test date is in the future." };
  const from = addDays(args.startDate, -RESULT_BEFORE_START_DAYS);
  const to = addDays(args.endDate, RESULT_AFTER_END_DAYS);
  if (testDate < from || testDate > to) {
    return { ok: false, error: `The test date must be between ${from} and ${to} (4 weeks before the start to 3 weeks after the end).` };
  }
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().replace(/\s+/g, " ").slice(0, 280) : null;
  return { ok: true, value: { measure, phase, value: Math.round(value * 1000) / 1000, testDate, note } };
}

// ─── Outcome ───────────────────────────────────────────────────────────────

export type ChangeRead = "clearer" | "same" | "worse";

export type MeasureOutcome = {
  measure: GoalMeasure;
  baseline: GoalResult | null;
  retest: GoalResult | null;
  /** Signed % improvement (positive = better, whichever way "better" points). null without both. */
  improvementPct: number | null;
  read: ChangeRead | null;
  line: Bi;
};

export type OutcomeState = "improved" | "no_clear_change" | "worse" | "waiting";

export type GoalOutcome = {
  state: OutcomeState;
  /** The measure the verdict rests on (null = nothing to compare yet). */
  main: GoalMeasure | null;
  verdict: Bi;
  measures: MeasureOutcome[];
};

const fmt = (v: number, d: number) => v.toFixed(d);
const fmtIs = (v: number, d: number) => v.toFixed(d).replace(".", ",");

/** Latest result of a phase (a later entry corrects an earlier one); on the same day the coach's entry wins. */
function pick(rows: GoalResult[], measure: GoalMeasure, phase: ResultPhase): GoalResult | null {
  const xs = rows.filter((r) => r.measure === measure && r.phase === phase);
  xs.sort((a, b) => a.test_date.localeCompare(b.test_date) || (a.source === b.source ? 0 : a.source === "coach" ? 1 : -1));
  return xs[xs.length - 1] ?? null;
}

export function measureOutcome(measure: GoalMeasure, rows: GoalResult[]): MeasureOutcome {
  const def = MEASURE_DEF[measure];
  const baseline = pick(rows, measure, "baseline");
  const retest = pick(rows, measure, "retest");
  const u = def.unit;
  if (!baseline || !retest) {
    const have = baseline ?? retest;
    const line: Bi = have
      ? baseline
        ? { en: `${def.label.en}: ${fmt(baseline.value, def.decimals)} ${u} at the start; no retest yet.`, is: `${def.label.is}: ${fmtIs(baseline.value, def.decimals)} ${u} í upphafi; ekkert endurpróf enn.` }
        : { en: `${def.label.en}: ${fmt(retest!.value, def.decimals)} ${u} at the retest; no starting point to compare with.`, is: `${def.label.is}: ${fmtIs(retest!.value, def.decimals)} ${u} í endurprófi; ekkert upphafsgildi til samanburðar.` }
      : { en: `${def.label.en}: not tested yet.`, is: `${def.label.is}: ekki prófað enn.` };
    return { measure, baseline, retest, improvementPct: null, read: null, line };
  }
  const raw = ((retest.value - baseline.value) / baseline.value) * 100;
  const imp = def.better === "lower" ? -raw : raw;
  const improvementPct = Math.round(imp * 10) / 10;
  const read: ChangeRead = imp >= def.clearPct ? "clearer" : imp <= -def.clearPct ? "worse" : "same";
  const dirEn = def.better === "lower" ? (imp >= 0 ? "faster" : "slower") : imp >= 0 ? "higher" : "lower";
  const dirIs = def.better === "lower" ? (imp >= 0 ? "hraðara" : "hægara") : imp >= 0 ? "hærra" : "lægra";
  const pct = Math.abs(improvementPct);
  const tail: Bi = read === "clearer"
    ? { en: "a clear change", is: "skýr breyting" }
    : read === "worse"
      ? { en: "a clear change the wrong way", is: "skýr breyting í ranga átt" }
      : { en: `no clear change (under ${def.clearPct}%)`, is: `engin skýr breyting (undir ${def.clearPct}%)` };
  return {
    measure, baseline, retest, improvementPct, read,
    line: {
      en: `${def.label.en}: ${fmt(baseline.value, def.decimals)} → ${fmt(retest.value, def.decimals)} ${u}, ${fmt(pct, 1)}% ${dirEn} — ${tail.en}.`,
      is: `${def.label.is}: ${fmtIs(baseline.value, def.decimals)} → ${fmtIs(retest.value, def.decimals)} ${u}, ${fmtIs(pct, 1)}% ${dirIs} — ${tail.is}.`,
    },
  };
}

/** The outcome of a plan from its test results. The verdict rests on the first of the quality's measures that has
 *  both a start and a retest (top speed: flying 20 m, else the top-speed test). */
export function goalOutcome(quality: GoalQuality, rows: GoalResult[]): GoalOutcome {
  const measures = QUALITY_MEASURES[quality].map((m) => measureOutcome(m, rows));
  const main = measures.find((m) => m.read != null) ?? null;
  const q = QUALITY_LABEL[quality];
  if (!main) {
    return {
      state: "waiting", main: null, measures,
      verdict: { en: `${q.en}: no start and retest to compare yet.`, is: `${q.is}: ekkert upphaf og endurpróf til að bera saman enn.` },
    };
  }
  const state: OutcomeState = main.read === "clearer" ? "improved" : main.read === "worse" ? "worse" : "no_clear_change";
  return { state, main: main.measure, measures, verdict: main.line };
}

// ─── GPS context (never the verdict) ───────────────────────────────────────

export type GpsDay = { date: string; value: number };
export type GpsKind = "top_speed" | "acceleration" | "braking";
/** "peak" = the day's highest value (km/h, or m/s² for braking / acceleration); "band3" = count of top-band efforts. */
export type GpsMetric = "peak" | "band3";
export type GpsContext = {
  kind: GpsKind;
  metric: GpsMetric;
  /** Mean of the 3 highest days in each window; null with fewer than 3 days. */
  before: number | null;
  during: number | null;
  beforeDays: number;
  duringDays: number;
  line: Bi;
};

const GPS_TOP_N = 3;
const meanTop = (xs: number[]) => {
  if (xs.length < GPS_TOP_N) return null;
  const top = [...xs].sort((a, b) => b - a).slice(0, GPS_TOP_N);
  return Math.round((top.reduce((s, v) => s + v, 0) / GPS_TOP_N) * 10) / 10;
};

/**
 * A day with more top-band efforts than this is dropped as a recording fault (MicroPulse rule). Across all GPS
 * rows the 99th percentile is 15 decelerations / 18 accelerations a day and the next real-looking day is 32; days
 * of 45–200 sit beside implausible totals (e.g. 200 hard decelerations in 4.2 km).
 */
export const BAND3_MAX_PER_DAY = 40;
/** Peak deceleration / acceleration above this (m/s²) is dropped as a spike. */
export const PEAK_MS2_MAX = 12;

export type GpsEffortRow = { date: string; band3: number | null; peak: number | null };

/**
 * One value per day for braking or acceleration. Band 3 counts when the player has any band-3 day in the rows
 * (0 is a real day), otherwise the peak in m/s² (stored positive or negative). Never both in one series. The
 * highest value wins when a day has two rows (a manual upload beside the Catapult row).
 */
export function effortDays(rows: GpsEffortRow[]): { metric: GpsMetric; days: GpsDay[] } {
  const metric: GpsMetric = rows.some((r) => r.band3 != null && Number.isFinite(r.band3)) ? "band3" : "peak";
  const byDate = new Map<string, number>();
  for (const r of rows) {
    let v: number;
    if (metric === "band3") {
      if (r.band3 == null) continue;
      v = Number(r.band3);
      if (!Number.isFinite(v) || v < 0 || v > BAND3_MAX_PER_DAY) continue;
    } else {
      if (r.peak == null) continue;
      v = Math.abs(Number(r.peak));
      if (!Number.isFinite(v) || v <= 0 || v > PEAK_MS2_MAX) continue;
    }
    const d = r.date.slice(0, 10);
    byDate.set(d, Math.max(byDate.get(d) ?? -1, v));
  }
  return { metric, days: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })) };
}

const GPS_WHAT: Record<GpsKind, Record<GpsMetric, Bi>> = {
  top_speed: {
    peak: { en: "Fastest GPS days", is: "Hröðustu GPS-dagar" },
    band3: { en: "Fastest GPS days", is: "Hröðustu GPS-dagar" },
  },
  braking: {
    peak: { en: "Hardest GPS braking", is: "Harðasta bremsun í GPS" },
    band3: { en: "Hard braking from the GPS units (Catapult's top band, Dec band 3)", is: "Harðar bremsanir úr GPS-tækjunum (efsta þrep Catapult, Dec band 3)" },
  },
  acceleration: {
    peak: { en: "Hardest GPS acceleration", is: "Mesta hröðun í GPS" },
    band3: { en: "Hard accelerations from the GPS units (Catapult's top band, Acc band 3)", is: "Harðar hraðaaukningar úr GPS-tækjunum (efsta þrep Catapult, Acc band 3)" },
  },
};

/**
 * Same-length windows so neither side gets more chances: the 4 weeks before the start vs plan weeks 5–8 (up to
 * today). Mean of the 3 highest days in each.
 */
export function gpsContext(kind: GpsKind, days: GpsDay[], startDate: string, endDate: string, todayIso: string, metric: GpsMetric = "peak"): GpsContext | null {
  const m: GpsMetric = kind === "top_speed" ? "peak" : metric;
  const bFrom = addDays(startDate, -28), bTo = addDays(startDate, -1);
  const dFrom = addDays(startDate, 28), dTo = endDate < todayIso ? endDate : todayIso;
  const before = days.filter((d) => d.date >= bFrom && d.date <= bTo).map((d) => d.value);
  const during = dTo >= dFrom ? days.filter((d) => d.date >= dFrom && d.date <= dTo).map((d) => d.value) : [];
  if (!before.length && !during.length) return null;
  const b = meanTop(before), d = meanTop(during);
  const unit: Bi = m === "band3" ? { en: "a day", is: "á dag" } : kind === "top_speed" ? { en: "km/h", is: "km/h" } : { en: "m/s²", is: "m/s²" };
  const what = GPS_WHAT[kind][m];
  const v = (x: number | null, is: boolean) => (x == null ? (is ? "of fáir dagar" : "too few days") : `${is ? fmtIs(x, 1) : fmt(x, 1)} ${is ? unit.is : unit.en}`);
  const line: Bi = m === "band3"
    ? {
        en: `${what.en}, mean of the 3 highest days: ${v(b, false)} in the 4 weeks before the start, ${v(d, false)} in weeks 5–8. A count of how often, not how hard. Context only: minutes played and the type of session move this number, so it doesn't decide the outcome.`,
        is: `${what.is}, meðaltal 3 hæstu daga: ${v(b, true)} á 4 vikunum fyrir upphaf, ${v(d, true)} í vikum 5–8. Talning á hve oft, ekki hve fast. Aðeins samhengi: spilaðar mínútur og tegund æfingar hreyfa þessa tölu, svo hún ræður ekki niðurstöðunni.`,
      }
    : {
        en: `${what.en} (mean of the top 3): ${v(b, false)} in the 4 weeks before the start, ${v(d, false)} in weeks 5–8. Context only: matches and drills move these, so they don't decide the outcome.`,
        is: `${what.is} (meðaltal 3 hæstu): ${v(b, true)} á 4 vikunum fyrir upphaf, ${v(d, true)} í vikum 5–8. Aðeins samhengi: leikir og æfingar hreyfa þessar tölur, svo þær ráða ekki niðurstöðunni.`,
      };
  return { kind, metric: m, before: b, during: d, beforeDays: before.length, duringDays: during.length, line };
}

// ─── Adherence ─────────────────────────────────────────────────────────────

export type SessionMark = { week: number; slot: GoalSessionSlot; status: "done" | "skipped"; session_date: string };
export type DueSession = { week: number; slot: GoalSessionSlot; date: string };

export type Adherence = { due: number; done: number; skipped: number; unmarked: number; line: Bi };

/**
 * Sessions due = placed on a day before today, plus today's when it is already ticked. A tick counts once per
 * (week, slot); a tick for a session the current placement no longer shows (the coach changed the week) still counts.
 */
export function adherence(due: DueSession[], marks: SessionMark[], todayIso: string): Adherence {
  const key = (w: number, s: string) => `${w}:${s}`;
  const byKey = new Map(marks.map((m) => [key(m.week, m.slot), m]));
  const dueKeys = new Set(due.filter((d) => d.date < todayIso || (d.date === todayIso && byKey.has(key(d.week, d.slot)))).map((d) => key(d.week, d.slot)));
  for (const m of marks) dueKeys.add(key(m.week, m.slot));
  let done = 0, skipped = 0, unmarked = 0;
  for (const k of dueKeys) {
    const m = byKey.get(k);
    if (!m) unmarked += 1;
    else if (m.status === "done") done += 1;
    else skipped += 1;
  }
  const n = dueKeys.size;
  const line: Bi = n === 0
    ? { en: "No session has been due yet.", is: "Engin æfing hefur verið á dagskrá enn." }
    : {
        en: `${done} of ${n} sessions ticked as done${skipped ? `, ${skipped} not done` : ""}${unmarked ? `, ${unmarked} not ticked` : ""}.`,
        is: `Merkt sem búið: ${done} af ${n} æfingum${skipped ? ` · ekki gert: ${skipped}` : ""}${unmarked ? ` · ómerkt: ${unmarked}` : ""}.`,
      };
  return { due: n, done, skipped, unmarked, line };
}

/** Everything the coach's goal page and the PDF show about progress (built server-side by `progressLoader`). */
export type GoalProgress = {
  results: GoalResult[];
  outcome: GoalOutcome;
  adherence: Adherence;
  marks: SessionMark[];
  gps: GpsContext | null;
  /** The last day counted (today, the day it paused or stopped, or the end). */
  until: string;
};
