/**
 * The week rule, prevention part (2026-11-19): Nordic and Copenhagen once a week, each on its own heavy day. Pure.
 * Kept apart from `weekRule.ts` because it reads the exercise library, which the coach's settings page does not need.
 */

import { EXERCISES_BY_ID } from "./exerciseLibrary";
import { noMatchDayFor, type NoMatchWeek } from "./structures";
import type { AppliedAdaptation, MdContext, PrescribedExercise, SessionBlock } from "./types";
import { noMatchWeekRule, type WeekRuleSeason } from "./weekRule";

/**
 * The two prevention exercises, each on ONE day of the week, with the week's reps on that day:
 *   Nordic      20 reps a week, 4 × 5, on the strength day (MD-4)
 *   Copenhagen  24 reps a side a week, 4 × 6, on the power day (MD-3)
 * Before, both sat on MD-4 and MD-3: the same eccentric work two days in a row.
 *
 * What comes from research (`research/`, read 2026-11-19):
 *   - Nordic, how much in one session: the injury trials used 27–30 reps a session once the build-up was done
 *     (3 sets of 12, 10, 8: Arnason 2008; 3 sets of 10, 9, 8: van der Horst 2015), three times a week in pre-season and
 *     one to two times a week in the season (Arnason 2008). 20 reps in one session is under that.
 *   - Days between: where a trial states it, sessions were at least 48 h apart (Bourne 2017, twice a week). No study
 *     compares 24 h with 48 h.
 *   - How fast the dose may rise: the trials went from 12 to 18 reps a session in one week (van der Horst weeks 2–3;
 *     Bourne weeks 1–2) with little soreness; one team on a much faster protocol got sore and left the trial
 *     (Arnason 2008). Soreness came mostly in the build-up weeks (van der Horst 2015).
 *   - More weekly reps went with a lower injury risk across three hamstring programmes (Lauersen 2018), but the
 *     evidence that the Nordic prevents injuries is rated inconclusive (Impellizzeri 2021).
 *   - Nordics after field training, not before: done before, they left the hamstrings weaker during the session
 *     (Lovell 2018).
 *   - Copenhagen: the strength trials ran twice a week, from 2 × 6 a side up to 3 × 10–15 or 4 × 9 a side a session
 *     (Ishøi 2016, Polglass 2019, Kohavi 2018, in Schaber 2021). 4 × 6 a side is inside that.
 *
 * What is MicroPulse's rule, not from a study: one day each, which day, and that the week's reps stay what they were
 * (20 and 24 a side). The block's extra set does not go on top: the week's reps are fixed, as for the heavy lift.
 */
export const NORDIC_ID = "ex_nordic_curl";
export const COPENHAGEN_ID = "ex_copenhagen";
export const PREVENTION_DOSE = {
  nordic: { sets: 4, reps: "5", weekReps: 20 },
  copenhagen: { sets: 4, reps: "6 each side", weekReps: 24 },
} as const;

export const PREVENTION_EVIDENCE =
  "Week rule, prevention. Nordic: the injury trials used 27–30 reps a session, one to two sessions a week in the season (Arnason 2008; van der Horst 2015), at least 48 h apart where it is stated (Bourne 2017), after field training rather than before (Lovell 2018). More weekly reps went with lower risk (Lauersen 2018); the injury evidence itself is rated inconclusive (Impellizzeri 2021). Copenhagen: strength trials used 2 × 6 a side up to 3 × 10–15 a session, twice a week (Schaber 2021, review). One day for each, and the week's reps kept at 20 Nordic and 24 a side Copenhagen, is MicroPulse's rule: no study compares one day with two days in a row.";

/** Which prevention exercise today carries. */
export type PreventionToday = { nordic: boolean; copenhagen: boolean };

/**
 * A week with a match: Nordic on MD-4, Copenhagen on MD-3. Null on every other day: the day is left as it is.
 * When the coach has marked one of the two days off (the traditional week lifts on fewer days), both are on the other.
 */
export function matchWeekPrevention(md: MdContext, isOff: (md: MdContext) => boolean = () => false): PreventionToday | null {
  if (md !== "MD-4" && md !== "MD-3") return null;
  const nordicDay: MdContext = isOff("MD-4") ? "MD-3" : "MD-4";
  const copenhagenDay: MdContext = isOff("MD-3") ? "MD-4" : "MD-3";
  return { nordic: md === nordicDay, copenhagen: md === copenhagenDay };
}

/**
 * A week without a match: Nordic on the first heavy strength day, Copenhagen on the first heavy power day. With no
 * power day among the heavy days, Copenhagen goes on the last other heavy day; with one heavy day only, both are on it.
 * The week's reps are the same as in a match week. Null when the coach's weekday plan says nothing for the week.
 */
export function noMatchWeekPrevention(todayIso: string, plan: NoMatchWeek | null | undefined, season: WeekRuleSeason): PreventionToday | null {
  const rule = noMatchWeekRule(todayIso, plan, season);
  if (!rule) return null;
  const heavy = rule.heavyDates;
  if (!heavy.length) return { nordic: false, copenhagen: false };
  const kindOf = (d: string) => noMatchDayFor(d, plan);
  const nordicDay = heavy.find((d) => kindOf(d) === "strength") ?? heavy[0];
  const others = heavy.filter((d) => d !== nordicDay);
  const copenhagenDay = others.find((d) => kindOf(d) === "power") ?? others[others.length - 1] ?? nordicDay;
  return { nordic: todayIso === nordicDay, copenhagen: todayIso === copenhagenDay };
}

export type PreventionApplied = {
  /** Sets × reps today after the rule; null = not in today's session. */
  nordic: string | null;
  copenhagen: string | null;
  /** The rule changed today's session (took one out, put one in, or changed the sets). */
  changed: boolean;
};

function preventionExercise(id: string, dose: { sets: number; reps: string }): PrescribedExercise | null {
  const lib = EXERCISES_BY_ID.get(id);
  const base = lib ? lib.defaultDosing["MD-4"] ?? Object.values(lib.defaultDosing)[0] : null;
  if (!lib || !base) return null;
  return { exerciseId: lib.id, nameEN: lib.nameEN, nameIS: lib.nameIS, category: lib.category, dose: { ...base, sets: dose.sets, reps: dose.reps, weekRule: true }, rationale: lib.evidence };
}

/**
 * Puts today's prevention exercise in the session with the week's reps and takes the other one out. Mutates the
 * blocks. A day's method that brings neither (the built-in MD-3 session) gets today's exercise added at the end.
 */
export function applyPreventionRule(blocks: SessionBlock[], today: PreventionToday): PreventionApplied {
  const out: PreventionApplied = { nordic: null, copenhagen: null, changed: false };
  const each = [
    { key: "nordic" as const, id: NORDIC_ID, on: today.nordic, type: "POSTERIOR" as const, titleEN: "Nordic hamstring (prevention)", titleIS: "Nordic hamstring (forvörn)" },
    { key: "copenhagen" as const, id: COPENHAGEN_ID, on: today.copenhagen, type: "ADDUCTOR" as const, titleEN: "Copenhagen adduction (prevention)", titleIS: "Copenhagen (forvörn)" },
  ];
  for (const p of each) {
    const dose = PREVENTION_DOSE[p.key];
    const b = blocks.findIndex((blk) => blk.exercises.some((e) => e.exerciseId === p.id));
    if (!p.on) {
      if (b < 0) continue;
      blocks[b].exercises = blocks[b].exercises.filter((e) => e.exerciseId !== p.id);
      if (!blocks[b].exercises.length) blocks.splice(b, 1);
      out.changed = true;
      continue;
    }
    const noteEN = `The week's dose in one session: ${dose.sets} × ${dose.reps}. After the field session, not before.`;
    const noteIS = `Skammtur vikunnar á einni æfingu: ${dose.sets} × ${dose.reps.replace("each side", "á hlið")}. Eftir vallaræfinguna, ekki fyrir.`;
    if (b >= 0) {
      const i = blocks[b].exercises.findIndex((e) => e.exerciseId === p.id);
      const ex = blocks[b].exercises[i];
      if (ex.dose.sets !== dose.sets || ex.dose.reps !== dose.reps) out.changed = true;
      blocks[b].exercises[i] = { ...ex, dose: { ...ex.dose, sets: dose.sets, reps: dose.reps, weekRule: true } };
      blocks[b] = { ...blocks[b], noteEN, noteIS };
    } else {
      const ex = preventionExercise(p.id, dose);
      if (!ex) continue;
      const block: SessionBlock = { id: `week-rule-${p.key}`, titleEN: p.titleEN, titleIS: p.titleIS, type: p.type, exercises: [ex], noteEN, noteIS };
      const last = blocks.length - 1;
      if (last >= 0 && blocks[last].type === "MOBILITY") blocks.splice(last, 0, block);
      else blocks.push(block);
      out.changed = true;
    }
    out[p.key] = `${dose.sets} × ${dose.reps}`;
  }
  return out;
}

/** The "why" line for the day's prevention exercise. Null on a day that carries neither and had neither. */
export function preventionAudit(md: MdContext, applied: PreventionApplied, noMatch: boolean): AppliedAdaptation | null {
  if (!applied.nordic && !applied.copenhagen && !applied.changed) return null;
  const isSide = (s: string) => s.replace("each side", "á hlið");
  const todayEN = [applied.nordic ? `Nordic ${applied.nordic} (${PREVENTION_DOSE.nordic.weekReps} reps, the week's dose)` : null, applied.copenhagen ? `Copenhagen ${applied.copenhagen} (${PREVENTION_DOSE.copenhagen.weekReps} a side, the week's dose)` : null].filter(Boolean).join(" and ");
  const todayIS = [applied.nordic ? `Nordic ${applied.nordic} (${PREVENTION_DOSE.nordic.weekReps} endurtekningar, skammtur vikunnar)` : null, applied.copenhagen ? `Copenhagen ${isSide(applied.copenhagen)} (${PREVENTION_DOSE.copenhagen.weekReps} á hlið, skammtur vikunnar)` : null].filter(Boolean).join(" og ");
  const otherEN = applied.nordic && applied.copenhagen ? "" : applied.nordic ? (noMatch ? " Copenhagen is on the week's power day." : " Copenhagen is on MD-3.") : applied.copenhagen ? (noMatch ? " Nordic is on the week's strength day." : " Nordic is on MD-4.") : "";
  const otherIS = applied.nordic && applied.copenhagen ? "" : applied.nordic ? (noMatch ? " Copenhagen er á kraftdegi vikunnar." : " Copenhagen er á MD-3.") : applied.copenhagen ? (noMatch ? " Nordic er á styrktardegi vikunnar." : " Nordic er á MD-4.") : "";
  return {
    ruleId: "WEEK_RULE_PREVENTION",
    triggerEN: noMatch ? "Week rule, no match this week: Nordic and Copenhagen once a week, each on its own heavy day" : `Week rule: Nordic and Copenhagen once a week, each on its own day (${md})`,
    triggerIS: noMatch ? "Vikuregla, enginn leikur í vikunni: Nordic og Copenhagen einu sinni í viku, hvor á sínum þunga degi" : `Vikuregla: Nordic og Copenhagen einu sinni í viku, hvor á sínum degi (${md})`,
    actionEN: todayEN ? `Today: ${todayEN}.${otherEN} Never the same prevention exercise two days in a row.` : "Neither prevention exercise today: each is on its own heavy day this week.",
    actionIS: todayIS ? `Í dag: ${todayIS}.${otherIS} Aldrei sama forvarnaræfingin tvo daga í röð.` : "Hvorug forvarnaræfingin í dag: hvor er á sínum þunga degi í vikunni.",
    evidence: PREVENTION_EVIDENCE,
  };
}
