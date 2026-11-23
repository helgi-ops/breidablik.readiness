/**
 * Strength tests add one set of prevention work (strength-day-rules brief §4b, coach's calls 2026-11-23). Pure.
 *
 *  - NORDBORD_ADDON: a NordBord test within the freshness window (14 days) where either leg is 10% or more below the
 *    player's previous test → +1 Nordic set on the Nordic day (MD-4). Timmins 2016's 337 N is shown as a reference
 *    only; it does not trigger anything (the coach's call).
 *  - FORCEFRAME_ADDON: a ForceFrame hip adduction test (the inner pads) within 21 days with a left/right gap of 10% or
 *    more, or either side 10% or more below the previous test → +1 Copenhagen set where the Copenhagen is (MD-3, the
 *    coach's call: Copenhagen stays on MD-3).
 *  - ADDON_CAP: at most +1 Nordic set and +1 Copenhagen set a week from any source. The week's single extra set is
 *    taken when the player's goal already added one (the strength goal's +1, or a goal plan's Nordic), or when the
 *    exercise already sits above the prevention dose.
 *
 * The 10% and the windows are MicroPulse's rule, not a study's (the asymmetry 10% is the VALD panel's watch line).
 * Not on a reduced day (yellow / red check-in). Never the readiness colour.
 */

import { VALD_ASYMMETRY_WATCH_PCT, VALD_FLAG_WINDOW_DAYS } from "@/lib/micropulse/vald/flagFreshness";
import { COPENHAGEN_ID, NORDIC_ID, PREVENTION_DOSE } from "./preventionRule";
import type { AppliedAdaptation, PlayerStrengthSnapshot, PrescribedExercise, SessionBlock } from "./types";

export const NORDBORD_ADDON = "NORDBORD_ADDON";
export const FORCEFRAME_ADDON = "FORCEFRAME_ADDON";
export const ADDON_CAP = "ADDON_CAP";

/** A drop of this % or more vs the player's previous test triggers (the coach's call 2026-11-23). */
export const TEST_DROP_PCT = 10;
/** Timmins 2016: below 337 N of eccentric knee-flexor force at pre-season went with a higher hamstring injury risk in
 *  elite football. Shown as a reference only. */
export const NORDBORD_REFERENCE_N = 337;

/** One bilateral strength test with the player's previous one (for the drop read). */
export type BilateralTest = {
  date: string;
  leftN: number;
  rightN: number;
  prev?: { date: string; leftN: number; rightN: number } | null;
};

export type StrengthTests = {
  /** Latest valid NordBord (Nordic) test with the one before it. */
  nordbord?: BilateralTest | null;
  /** Latest valid ForceFrame hip adduction (inner pads) test with the one before it. */
  adduction?: BilateralTest | null;
};

const DAY = 86_400_000;
const ageDays = (date: string, today: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date.slice(0, 10)}T00:00:00Z`)) / DAY);
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Per-leg % drop vs the previous test (positive = lower now). null without a previous test. */
export function legDrops(t: BilateralTest): { left: number; right: number } | null {
  if (!t.prev || t.prev.leftN <= 0 || t.prev.rightN <= 0) return null;
  return { left: r1(((t.prev.leftN - t.leftN) / t.prev.leftN) * 100), right: r1(((t.prev.rightN - t.rightN) / t.prev.rightN) * 100) };
}
export const gapPct = (t: BilateralTest) => {
  const hi = Math.max(t.leftN, t.rightN);
  return hi > 0 ? r1((Math.abs(t.leftN - t.rightN) / hi) * 100) : 0;
};

export type AddonRead = { fires: boolean; trigger: { en: string; is: string } };

/** NORDBORD_ADDON read: fresh (≤ 14 days) and a leg 10% or more below the previous test. */
export function readNordbord(t: BilateralTest | null | undefined, todayIso: string): AddonRead | null {
  if (!t || ageDays(t.date, todayIso) > VALD_FLAG_WINDOW_DAYS.nordbordDays || ageDays(t.date, todayIso) < 0) return null;
  const d = legDrops(t);
  const worst = d ? Math.max(d.left, d.right) : null;
  const side = d ? (d.left >= d.right ? { en: "left", is: "vinstri" } : { en: "right", is: "hægri" }) : null;
  const ref = `reference ${NORDBORD_REFERENCE_N} N (Timmins 2016)`;
  const refIs = `viðmið ${NORDBORD_REFERENCE_N} N (Timmins 2016)`;
  const now = `${r0(t.leftN)} / ${r0(t.rightN)} N`;
  if (worst == null || !side || !t.prev) return { fires: false, trigger: { en: `NordBord ${t.date}: ${now}; no earlier test to compare (${ref})`, is: `NordBord ${t.date}: ${now}; ekkert fyrra próf til samanburðar (${refIs})` } };
  return {
    fires: worst >= TEST_DROP_PCT,
    trigger: {
      en: `NordBord ${t.date}: ${now} (left / right), ${side.en} ${worst}% below the test on ${t.prev.date}; ${ref}`,
      is: `NordBord ${t.date}: ${now} (vinstri / hægri), ${side.is} ${worst}% undir prófinu ${t.prev.date}; ${refIs}`,
    },
  };
}

/** FORCEFRAME_ADDON read: fresh (≤ 21 days) and a 10% left/right gap, or a side 10% or more below the previous test. */
export function readAdduction(t: BilateralTest | null | undefined, todayIso: string): AddonRead | null {
  if (!t || ageDays(t.date, todayIso) > VALD_FLAG_WINDOW_DAYS.forceframeDays || ageDays(t.date, todayIso) < 0) return null;
  const gap = gapPct(t);
  const d = legDrops(t);
  const worst = d ? Math.max(d.left, d.right) : null;
  const gapFires = gap >= VALD_ASYMMETRY_WATCH_PCT;
  const dropFires = worst != null && worst >= TEST_DROP_PCT;
  const now = `${r0(t.leftN)} / ${r0(t.rightN)} N`;
  const parts = { en: [`left/right gap ${gap}%`], is: [`munur vinstri/hægri ${gap}%`] };
  if (worst != null && t.prev) { parts.en.push(`${worst}% below the test on ${t.prev.date}`); parts.is.push(`${worst}% undir prófinu ${t.prev.date}`); }
  return {
    fires: gapFires || dropFires,
    trigger: {
      en: `ForceFrame hip adduction ${t.date}: ${now} (left / right), ${parts.en.join(", ")}`,
      is: `ForceFrame aðfærsla mjaðmar ${t.date}: ${now} (vinstri / hægri), ${parts.is.join(", ")}`,
    },
  };
}

const PRE = new Set<SessionBlock["type"]>(["PREP", "MOBILITY"]);
const reducedDay = (v: PlayerStrengthSnapshot["verdict"]) => v === "MODIFIED" || v === "REDUCED" || v === "RECOVERY" || v === "HOLD";
const fromGoal = (ex: PrescribedExercise) => !!ex.playerGoal || !!ex.goalPlan;

const EVIDENCE = {
  nordic: "NordBord: Timmins 2016 (under 337 N at pre-season went with higher hamstring injury risk; shown as a reference only). The 10% drop vs his own previous test and the +1 set are the coach's rule (2026-11-23), not from a study.",
  copenhagen: "ForceFrame hip adduction (inner pads). A left/right gap of 10% is the VALD panel's watch line; the 10% drop vs his own previous test and the +1 set on MD-3 are the coach's rule (2026-11-23). Copenhagen strength trials: Schaber 2021 (review).",
};

/**
 * Add the one extra prevention set the tests call for, within the week's cap. Mutates `blocks` (the engine's working
 * copy) and returns the audit. Nothing when the test does not fire or the exercise is not in today's session.
 */
export function applyTestAddons(blocks: SessionBlock[], snap: PlayerStrengthSnapshot): AppliedAdaptation[] {
  const tests = snap.strengthTests;
  if (!tests) return [];
  const out: AppliedAdaptation[] = [];
  const kinds = [
    { id: NORDIC_ID, ruleId: NORDBORD_ADDON, read: readNordbord(tests.nordbord, snap.todayIso), base: PREVENTION_DOSE.nordic.sets, name: { en: "Nordic", is: "Nordic" }, evidence: EVIDENCE.nordic },
    { id: COPENHAGEN_ID, ruleId: FORCEFRAME_ADDON, read: readAdduction(tests.adduction, snap.todayIso), base: PREVENTION_DOSE.copenhagen.sets, name: { en: "Copenhagen", is: "Copenhagen" }, evidence: EVIDENCE.copenhagen },
  ];
  for (const k of kinds) {
    if (!k.read?.fires) continue;
    const spots = blocks.filter((b) => !PRE.has(b.type)).flatMap((b) => b.exercises.filter((e) => e.exerciseId === k.id));
    if (!spots.length) continue; // not this exercise's day (or a safety rule took it out)
    if (reducedDay(snap.verdict)) {
      out.push({ ruleId: k.ruleId, triggerEN: k.read.trigger.en, triggerIS: k.read.trigger.is,
        actionEN: `No extra ${k.name.en} set today: today's check-in reduced the session.`,
        actionIS: `Ekkert auka ${k.name.is} sett í dag: innskráning dagsins minnkaði æfinguna.`, evidence: k.evidence });
      continue;
    }
    const ex = spots[0];
    if (spots.some(fromGoal) || ex.dose.sets > k.base) {
      out.push({ ruleId: ADDON_CAP, triggerEN: k.read.trigger.en, triggerIS: k.read.trigger.is,
        actionEN: `No extra ${k.name.en} set from the test: the week's one extra set is already in (${spots.some(fromGoal) ? "the player's goal" : `${ex.dose.sets} sets, above the ${k.base} of the week rule`}). At most +1 ${k.name.en} set a week from any source.`,
        actionIS: `Ekkert auka ${k.name.is} sett vegna prófsins: eina aukasett vikunnar er þegar inni (${spots.some(fromGoal) ? "markmið leikmannsins" : `${ex.dose.sets} sett, yfir ${k.base} vikureglunnar`}). Mest +1 ${k.name.is} sett á viku, úr hvaða átt sem er.`,
        evidence: k.evidence });
      continue;
    }
    ex.dose = { ...ex.dose, sets: ex.dose.sets + 1 };
    ex.modificationReason = ex.modificationReason ?? `+1 set: ${k.ruleId === NORDBORD_ADDON ? "NordBord" : "ForceFrame"} test`;
    out.push({ ruleId: k.ruleId, triggerEN: k.read.trigger.en, triggerIS: k.read.trigger.is,
      actionEN: `+1 ${k.name.en} set today (${ex.dose.sets} × ${ex.dose.reps}). The week's cap: at most +1 set from any source.`,
      actionIS: `+1 ${k.name.is} sett í dag (${ex.dose.sets} × ${ex.dose.reps}). Hámark vikunnar: mest +1 sett úr hvaða átt sem er.`,
      evidence: k.evidence });
  }
  return out;
}
