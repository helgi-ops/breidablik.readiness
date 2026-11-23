/**
 * New exercises (brief §6, 2026-11-22): a new exercise is shown first as a light intro in the MD-4 warm-up, or in a
 * light (deload) week, before it can be a working lift.
 *
 * "New" = the player has no logged set of it (player_strength_set_log, last 120 days, warm-up sets included), read in
 * the same query as the logged 1RMs, so no extra read. With nothing logged at all the rule stays off: there is no
 * history to compare against, and every exercise would look new.
 *
 *   - MD-4 (and the days that build like it) or a light week: the exercise leaves the working blocks and goes into the
 *     warm-up as 2 easy sets ("learn it"). Once the player logs it, it is known and comes back as a working lift.
 *   - Other days (MD-3, MD-2, MD-1, MD+1 …): it is left out, with a line saying when it comes in.
 *   - The week rule's lifts (the heavy lift, B1, and the fast lift close to the match) are learnt and done the same day
 *     (the coach's call, 2026-11-23): they stay as the working lift and 2 light intro sets go into the warm-up first, so
 *     the week's heavy reps and the near-match dose are never lost to this rule.
 *
 * Never touched: the warm-up itself, a coach's own swap (the coach decides last), and the injury-prevention work
 * (Nordic, Copenhagen), which always applies (the priority rule). Pure; runs after the day rules.
 */

import type { AppliedAdaptation, MdContext, PlayerStrengthSnapshot, PrescribedExercise, SessionBlock, StrengthSession } from "./types";
import { DAY_RULES, PREVENTION_IDS, coachOwn, estimateSessionMinutes } from "./dayRules";

export const NEW_EXERCISE_INTRO = "NEW_EXERCISE_INTRO";
export const NEW_EXERCISE_HELD = "NEW_EXERCISE_HELD";
/** How far back a logged set counts: after this long the movement is introduced again. */
export const NEW_EXERCISE_LOOKBACK_DAYS = 120;

export const NEW_EXERCISE_EVIDENCE =
  "MicroPulse rule (the coach's brief, 2026-11-22): a new movement is learnt light before it is loaded. Unaccustomed " +
  "work, the lowering part above all, brings more soreness and strength loss the first time; one light bout protects " +
  "the next (the repeated-bout effect, McHugh 2003). Read from the player's own logged sets (last 120 days); with no " +
  "logged sets at all the rule stays off.";

const INTRO_BLOCK_ID = "new-exercise-intro";

/** MD-4 and the days that build like it. */
const introDay = (md: MdContext) => md === "MD-4" || DAY_RULES[md]?.sameAs === "MD-4";

const introDose = (ex: PrescribedExercise): PrescribedExercise["dose"] => {
  const reps = String(ex.dose.reps ?? "");
  const timed = /^\s*\d+\s*s\b/i.test(reps);
  return {
    sets: 2,
    reps: timed ? "20s" : /each/i.test(reps) ? "5 each side" : "5",
    intensity: "RPE 4–5 (light)",
    rest: "1 min",
  };
};

/** True for the exercises the rule may hold back: working lifts only. */
function counts(b: SessionBlock, ex: PrescribedExercise): boolean {
  if (b.type === "PREP" || b.type === "MOBILITY" || ex.category === "MOVEMENT_PREP" || ex.category === "MOBILITY") return false;
  if (ex.newIntro || coachOwn(ex) || PREVENTION_IDS.has(ex.exerciseId)) return false;
  return true;
}

export function applyNewExerciseIntro(session: StrengthSession | null, snap: Pick<PlayerStrengthSnapshot, "loggedExerciseIds" | "goalSeason">): StrengthSession | null {
  if (!session || !snap.loggedExerciseIds?.length) return session;
  const known = new Set(snap.loggedExerciseIds);
  const lightWeek = snap.goalSeason?.blockGoal === "deload";
  const intro = introDay(session.mdContext) || lightWeek;
  const where = lightWeek && !introDay(session.mdContext)
    ? { en: "this light week's warm-up", is: "upphitun þessarar léttu viku" }
    : { en: "the warm-up", is: "upphituninni" };

  const out: AppliedAdaptation[] = [];
  const intros: PrescribedExercise[] = [];
  // An intro already in the session (a second pass) is not added again.
  const seen = new Set<string>(session.blocks.flatMap((b) => b.exercises).filter((e) => e.newIntro).map((e) => e.exerciseId));
  const blocks = session.blocks.map((b) => ({
    ...b,
    exercises: b.exercises.filter((ex) => {
      if (!counts(b, ex) || known.has(ex.exerciseId)) return true;
      const trigger = {
        triggerEN: `New exercise: ${ex.nameEN} is not in this player's logged sets (last ${NEW_EXERCISE_LOOKBACK_DAYS} days)`,
        triggerIS: `Ný æfing: ${ex.nameIS || ex.nameEN} er ekki í skráðum settum leikmannsins (síðustu ${NEW_EXERCISE_LOOKBACK_DAYS} daga)`,
      };
      // The week rule's lift: learn it in the warm-up, then do today's working sets (any day).
      if (ex.dose.weekRule || ex.dose.nearMatch) {
        if (!seen.has(ex.exerciseId)) {
          seen.add(ex.exerciseId);
          intros.push({ ...ex, dose: introDose(ex), newIntro: true, modificationReason: "New exercise: light intro", isAdaptiveAddition: true });
          out.push({
            ruleId: NEW_EXERCISE_INTRO, ...trigger,
            actionEN: `${ex.nameEN} is new: 2 easy sets in the warm-up to learn it first, then today's working sets (the week rule's dose holds).`,
            actionIS: `${ex.nameIS || ex.nameEN} er ný: 2 auðveld sett í upphitun til að læra hana fyrst, svo vinnusett dagsins (skammtur vikureglunnar heldur).`,
            evidence: NEW_EXERCISE_EVIDENCE,
          });
        }
        return true;
      }
      if (intro) {
        if (!seen.has(ex.exerciseId)) {
          seen.add(ex.exerciseId);
          intros.push({ ...ex, dose: introDose(ex), newIntro: true, modificationReason: "New exercise: light intro", isAdaptiveAddition: true });
          out.push({
            ruleId: NEW_EXERCISE_INTRO, ...trigger,
            actionEN: `${ex.nameEN} is shown first as a light intro in ${where.en}: 2 easy sets to learn it. Once it is logged it can be a working lift.`,
            actionIS: `${ex.nameIS || ex.nameEN} er kynnt fyrst létt í ${where.is}: 2 auðveld sett til að læra hana. Þegar hún hefur verið skráð getur hún orðið vinnulyfta.`,
            evidence: NEW_EXERCISE_EVIDENCE,
          });
        }
      } else {
        out.push({
          ruleId: NEW_EXERCISE_HELD, ...trigger,
          actionEN: `${ex.nameEN} left out today: a new exercise comes in first as a light intro on MD-4 or in a light week.`,
          actionIS: `${ex.nameIS || ex.nameEN} sleppt í dag: ný æfing kemur fyrst inn sem létt kynning á MD-4 eða í léttri viku.`,
          evidence: NEW_EXERCISE_EVIDENCE,
        });
      }
      return false;
    }),
  })).filter((b) => b.exercises.length > 0);
  if (!out.length) return session;

  if (intros.length) {
    // Into the warm-up: the existing warm-up block (after its own drills), else a short warm-up block first.
    const prep = blocks.findIndex((b) => b.type === "PREP");
    if (prep >= 0) blocks[prep] = { ...blocks[prep], exercises: [...blocks[prep].exercises, ...intros] };
    else blocks.unshift({ id: INTRO_BLOCK_ID, titleEN: "Warm-up: learn it", titleIS: "Upphitun: lærðu hana", type: "PREP", exercises: intros });
  }
  return { ...session, blocks, durationMin: estimateSessionMinutes(blocks), appliedAdaptations: [...session.appliedAdaptations, ...out] };
}
