/**
 * A jump test (CMJ) on the team's test days changes the gym dose (strength-day-rules brief §3, 2026-11-22).
 *
 * The team tests on MD+3 and MD-2 (MD-1 before training when MD-2 is a day off). A test that day below the player's
 * normal variation changes the strength session:
 *  - CMJ_DROP_MD3: the next heavy day (MD-4; the same day in a 7-day week) is a yellow dose: same bar-speed zone,
 *    one round fewer, Nordic 1 set.
 *  - CMJ_DROP_MD2: MD-2 and MD-1 are maintenance + primer only, and the coach sees a Today line before the match.
 *  - CMJ_DROP_MD1_FALLBACK: no MD-2 test, the MD-1 test is down: MD-1 is the primer only, plus the coach line.
 *
 * "Below normal variation" is not a new %: the jump is compared the way the VALD panel compares it (trial mean of the
 * test vs the median of the baseline tests picked by `selectCmjBaseline`), against the band of `cmjRecovery`: the
 * expected % of baseline after the last match's high-speed running (Hader 2019) ± the jump's measurement noise
 * (Gathercole 2015 CV × the phase-gate multiplier). Below the band's low edge = a drop.
 *
 * The yellow dose is a state of the strength session only. Nothing here reads or writes the readiness colour; the
 * check-in colour stays what it is. When today's check-in already reduced the session (yellow / red), the CMJ dose is
 * not stacked on top. Pure, no IO.
 */

import { expectedCmjBand, type ExpectedCmjBand } from "@/lib/micropulse/cmjRecovery";
import { aggregateTrialsByTest, metricSeries, type TrialMetricRow } from "@/lib/micropulse/vald/trialAggregate";
import { selectCmjBaseline } from "@/lib/micropulse/vald/flagFreshness";
import { dayCategoryOf } from "./dayRules";
import type { AppliedAdaptation, MdContext, PrescribedExercise, SessionBlock, StrengthSession } from "./types";

export const CMJ_DROP_MD3 = "CMJ_DROP_MD3";
export const CMJ_DROP_MD2 = "CMJ_DROP_MD2";
export const CMJ_DROP_MD1_FALLBACK = "CMJ_DROP_MD1_FALLBACK";
/** The test was down, but today's check-in already reduced the session: the CMJ dose is not stacked on it. */
export const CMJ_DROP_NOT_STACKED = "CMJ_DROP_NOT_STACKED";
export const CMJ_DOSE_RULE_IDS = [CMJ_DROP_MD3, CMJ_DROP_MD2, CMJ_DROP_MD1_FALLBACK] as const;
export type CmjDoseRuleId = (typeof CMJ_DOSE_RULE_IDS)[number];

const CITE = "Claudino 2017 (CMJ as a read of neuromuscular state) · Hader 2019 (expected post-match dip by high-speed running) · Gathercole 2015 (jump-height noise) · the coach's test days MD+3 / MD-2";

/** The team's test days. MD-1 only stands in when MD-2 is a day off. */
export type CmjTestDay = "MD+3" | "MD-2" | "MD-1";

/** One jump test on a test day, read against the player's own baseline. Stored on the snapshot (provenance). */
export type CmjDoseTest = {
  /** The test day (ISO date). */
  date: string;
  testDay: CmjTestDay;
  /** Trial mean of that day's test (cm). */
  jumpCm: number;
  /** Median of the baseline tests (cm). */
  baselineCm: number;
  baselineTests: number;
  /** jumpCm as a % of baselineCm (one decimal). */
  pctOfBaseline: number;
  /** cmjRecovery's band for this test: expected % ± noise, with the match HSR and hours it used. */
  band: ExpectedCmjBand;
  /** True when the match HSR was unknown and the band assumed no expected dip (noise band around 100%). */
  hsrUnknown: boolean;
  /** Below the band's low edge. */
  drop: boolean;
};

/** One stored trial (a row of vald_forcedecks_results). */
export type CmjTrial = { rawTestId: string | null; testTimestamp: string; jumpCm: number | null };

const round1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Read the test on `testDate` against the baseline (`selectCmjBaseline`, as the VALD panel does). null when there is
 * no test that day or no ready baseline (too few tests, or back from a gap: then a jump is not read as fatigue).
 */
export function readCmjTestDay(args: {
  trials: CmjTrial[];
  testDate: string;
  testDay: CmjTestDay;
  /** The last match's high-speed running (m) for this player; null = unknown. */
  matchHsr: number | null;
  /** Hours from the last match to the test day; null = no match before it. */
  hoursPostMatch: number | null;
}): CmjDoseTest | null {
  const rows: TrialMetricRow[] = args.trials.map((t) => ({ rawTestId: t.rawTestId, testTimestamp: t.testTimestamp, metrics: { jumpHeight: t.jumpCm } }));
  const aggs = aggregateTrialsByTest(rows, ["jumpHeight"]).filter((a) => a.metrics.jumpHeight != null);
  const idx = aggs.findIndex((a) => a.testTimestamp.slice(0, 10) === args.testDate);
  if (idx < 0) return null; // newest first, so this is the day's latest test
  const test = aggs[idx];
  const sel = selectCmjBaseline(test.testTimestamp, aggs.slice(idx + 1));
  if (sel.status !== "ready") return null;
  const baselineCm = median(metricSeries(sel.tests, "jumpHeight"));
  const jumpCm = test.metrics.jumpHeight as number;
  if (baselineCm == null || baselineCm <= 0) return null;
  const hsrUnknown = args.matchHsr == null;
  // No match before the test → nothing to recover from: the noise band around 100%.
  const band = expectedCmjBand({ matchHsr: args.matchHsr ?? 0, hoursPostMatch: args.hoursPostMatch ?? 96 });
  if (!band) return null;
  const pctOfBaseline = round1((jumpCm / baselineCm) * 100);
  return {
    date: args.testDate,
    testDay: args.testDay,
    jumpCm: round1(jumpCm),
    baselineCm: round1(baselineCm),
    baselineTests: sel.tests.length,
    pctOfBaseline,
    band: { ...band, expectedPct: round1(band.expectedPct), lo: round1(band.lo), hi: round1(band.hi) },
    hsrUnknown,
    drop: pctOfBaseline < band.lo,
  };
}

/** Which test day feeds today's session, by today's MD day. null = no CMJ rule for this day. */
export function testDayFor(md: MdContext): CmjTestDay[] | null {
  if (md === "MD-4" || md === "MD-5") return ["MD+3"];
  if (md === "MD-2") return ["MD-2"];
  if (md === "MD-1") return ["MD-2", "MD-1"]; // the MD-1 test only when there was no MD-2 test
  return null;
}

/** The rule a down test fires for a session on `md`. null = none. */
export function cmjRuleFor(md: MdContext, test: CmjDoseTest | null | undefined): CmjDoseRuleId | null {
  if (!test?.drop) return null;
  if (test.testDay === "MD+3" && (md === "MD-4" || md === "MD-5")) return CMJ_DROP_MD3;
  if (test.testDay === "MD-2" && (md === "MD-2" || md === "MD-1")) return CMJ_DROP_MD2;
  if (test.testDay === "MD-1" && md === "MD-1") return CMJ_DROP_MD1_FALLBACK;
  return null;
}

/** The plain facts of the test, for the trigger text and the coach line. */
export function cmjTestFacts(test: CmjDoseTest): { en: string; is: string } {
  const band = `${Math.round(test.band.lo)}–${Math.round(test.band.hi)}%`;
  return {
    en: `Jump test ${test.testDay} (${test.date}): ${test.jumpCm} cm = ${test.pctOfBaseline}% of his usual ${test.baselineCm} cm (last ${test.baselineTests} tests); normal range today ${band}`,
    is: `Hoppróf ${test.testDay} (${test.date}): ${test.jumpCm} cm = ${test.pctOfBaseline}% af venjulegu ${test.baselineCm} cm (síðustu ${test.baselineTests} próf); eðlilegt bil í dag ${band}`,
  };
}

const ACTION: Record<CmjDoseRuleId, { en: string; is: string }> = {
  [CMJ_DROP_MD3]: {
    en: "Yellow dose on the heavy day: same bar-speed zone, one round fewer, Nordic 1 set.",
    is: "Gulur skammtur á þunga deginum: sama hraðasvæði, einni umferð færra, Nordic 1 sett.",
  },
  [CMJ_DROP_MD2]: {
    en: "MD-2 and MD-1: maintenance and primer only (one leg lift, upper body, holds, one primer); the rest is out.",
    is: "MD-2 og MD-1: aðeins viðhald og örvun (ein fótalyfta, efri líkami, hald, ein örvunaræfing); annað út.",
  },
  [CMJ_DROP_MD1_FALLBACK]: {
    en: "MD-1: the primer only (MD-2 had no test, so the MD-1 test counts).",
    is: "MD-1: aðeins örvunaræfingin (ekkert próf á MD-2, svo MD-1 prófið gildir).",
  },
};

const PRE = new Set<SessionBlock["type"]>(["PREP", "MOBILITY"]);
const NORDIC = "ex_nordic_curl";
const isPrimer = (ex: PrescribedExercise) => {
  if (ex.dose.nearMatch || ex.goalPlan?.nearMatch) return true;
  const c = dayCategoryOf(ex);
  return c === "ballistic" || c === "med_ball" || c === "plyo";
};
const isLegLift = (ex: PrescribedExercise) => {
  const c = dayCategoryOf(ex);
  return (c === "heavy" || c === "fast") && (ex.category === "COMPOUND_STRENGTH" || ex.category === "UNILATERAL_STRENGTH");
};
const isMaintenanceExtra = (ex: PrescribedExercise) => {
  const c = dayCategoryOf(ex);
  return c === "iso" || c === "upper";
};

/** The yellow dose: one round fewer on everything but the warm-up, the Nordic to 1 set. Zones and loads unchanged. */
function yellowDose(blocks: SessionBlock[]): { blocks: SessionBlock[]; changed: number } {
  let changed = 0;
  const out = blocks.map((b) => {
    if (PRE.has(b.type)) return b;
    const exercises = b.exercises.map((ex) => {
      const sets = ex.exerciseId === NORDIC ? 1 : Math.max(1, ex.dose.sets - 1);
      if (sets === ex.dose.sets) return ex;
      changed++;
      return { ...ex, dose: { ...ex.dose, sets } };
    });
    return { ...b, exercises };
  });
  return { blocks: out, changed };
}

/** Keep the warm-up and `keep(ex)`; the first primer only, the first leg lift only. */
function keepOnly(blocks: SessionBlock[], withMaintenance: boolean): { blocks: SessionBlock[]; changed: number } {
  let changed = 0, primer = false, legLift = false;
  const out = blocks.map((b) => {
    if (PRE.has(b.type)) return b;
    const exercises = b.exercises.filter((ex) => {
      if (!primer && isPrimer(ex)) { primer = true; return true; }
      if (withMaintenance && !legLift && isLegLift(ex)) { legLift = true; return true; }
      if (withMaintenance && isMaintenanceExtra(ex)) return true;
      changed++;
      return false;
    });
    return { ...b, exercises };
  });
  return { blocks: out.filter((b) => PRE.has(b.type) || b.exercises.length > 0), changed };
}

const reducedToday = (s: StrengthSession) =>
  s.appliedAdaptations.some((a) => a.ruleId === "VERDICT_REDUCED_VOLUME" || a.ruleId === "VERDICT_BLOCK" || a.ruleId === "STRUCTURE_READINESS_DOWNGRADE");

/**
 * Apply the CMJ rule to a built session. Same object back when nothing fires (or it already ran). Only takes away.
 * Football only (the caller skips basketball).
 */
export function applyCmjDose(session: StrengthSession | null, test: CmjDoseTest | null | undefined): StrengthSession | null {
  if (!session || !test) return session;
  const rule = cmjRuleFor(session.mdContext, test);
  if (!rule) return session;
  if (session.appliedAdaptations.some((a) => (CMJ_DOSE_RULE_IDS as readonly string[]).includes(a.ruleId) || a.ruleId === CMJ_DROP_NOT_STACKED)) return session;
  const facts = cmjTestFacts(test);
  const evidence = `${CITE}. Band: ${test.band.expectedPct}% expected after ${Math.round(test.band.matchHsr)} m high-speed running${test.hsrUnknown ? " (match running unknown: no dip assumed)" : ""}, ${test.band.hoursPostMatch} h after the match.`;
  if (reducedToday(session)) {
    return {
      ...session,
      appliedAdaptations: [...session.appliedAdaptations, {
        ruleId: CMJ_DROP_NOT_STACKED,
        triggerEN: facts.en, triggerIS: facts.is,
        actionEN: `Today's check-in already reduced the session, so ${rule} is not added on top.`,
        actionIS: `Innskráning dagsins minnkaði þegar æfinguna, svo ${rule} bætist ekki ofan á.`,
        evidence,
      }],
    };
  }
  const res = rule === CMJ_DROP_MD3 ? yellowDose(session.blocks)
    : keepOnly(session.blocks, rule === CMJ_DROP_MD2);
  const adaptation: AppliedAdaptation = {
    ruleId: rule,
    triggerEN: facts.en, triggerIS: facts.is,
    actionEN: res.changed > 0 ? ACTION[rule].en : `${ACTION[rule].en} (Already within it: nothing to take out.)`,
    actionIS: res.changed > 0 ? ACTION[rule].is : `${ACTION[rule].is} (Þegar innan þess: engu að sleppa.)`,
    evidence,
  };
  return { ...session, blocks: res.blocks, appliedAdaptations: [...session.appliedAdaptations, adaptation] };
}

/** True when the session carries a CMJ cut (the meso layer must not add sets back). */
export function hasCmjCut(s: StrengthSession | null | undefined): boolean {
  return !!s?.appliedAdaptations.some((a) => (CMJ_DOSE_RULE_IDS as readonly string[]).includes(a.ruleId));
}

/**
 * After a later layer (the meso block) ran on a CMJ-cut session: no exercise gets more sets than it had after the cut,
 * and no exercise the cut took out comes back. Same object when nothing had to be held.
 */
export function holdCmjCut(before: StrengthSession, after: StrengthSession | null): StrengthSession | null {
  if (!after || after === before || !hasCmjCut(before)) return after;
  const setsBefore = new Map<string, number>();
  for (const b of before.blocks) for (const ex of b.exercises) setsBefore.set(`${b.id}|${ex.exerciseId}`, ex.dose.sets);
  let held = false;
  const blocks = after.blocks.map((b) => {
    if (PRE.has(b.type)) return b;
    const exercises = b.exercises.flatMap((ex) => {
      const cap = setsBefore.get(`${b.id}|${ex.exerciseId}`);
      if (cap == null) { held = true; return []; }
      if (ex.dose.sets <= cap) return [ex];
      held = true;
      return [{ ...ex, dose: { ...ex.dose, sets: cap } }];
    });
    return { ...b, exercises };
  });
  return held ? { ...after, blocks } : after;
}
