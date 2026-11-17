/**
 * "One session, one whole" (2026-11-17) — engine step. Pure, mutates the session blocks in place.
 *
 * A player on an 8-week goal plan (acceleration, braking, jump, top speed) has a gym session B in the plan. In
 * pre-season and off-season, on the day the plan places session B, its gym lifts go INTO the strength session the
 * coach sends ("Æfing dagsins"), so the player gets one strength session, not a second card. The pitch part of the
 * plan (sprints, sled, bounds, braking drills) stays on the goal card.
 *
 * The coach's rules:
 *   - The goal's lift TAKES THE PLACE of the matching team exercise (same slot), never on top: the session stays a
 *     microdose. Only when the session has nothing in that slot is the lift added.
 *   - Power before strength: a jump squat / pull goes in the power slot, or first in the session.
 *   - All or nothing: when one of the plan's lifts can't go in (a safety rule rules it out, or a safety swap holds
 *     its slot), nothing is merged and session B stays whole on the goal card.
 *   - Recovery day (red) → nothing merged (the goal card says skip). Yellow → half the sets (the plan's own yellow rule).
 *   - In season → nothing here; the plan stays its own card.
 *   - Never more than +1 set: the strength goal's extra set and the Accumulation +1 skip a goal-plan exercise.
 *
 * Runs after the team list and before the player's strength goal and the coach's manual swaps (coach's last word).
 */

import type { AppliedAdaptation, ExerciseCategory, PlayerStrengthSnapshot, PrescribedExercise, SessionBlock } from "./types";
import { EXERCISES_BY_ID } from "./exerciseLibrary";
import { goalSeasonOf } from "./playerGoal";

/** The lift profiles a goal plan's gym block is read as (`goalPlan/liftRx.ts`). */
export type GoalGymProfile = "heavy" | "technique" | "rdl" | "jump_squat" | "pull" | "nordic" | "eccentric" | "squat_fast" | "youth";

export type GoalPlanGymLift = {
  profile: GoalGymProfile;
  /** Library exercise the plan names (a swapped pull keeps its own lift). */
  preferId?: string;
  nameEN: string;
  nameIS: string;
  /** As in the plan: "3–4", "3–5". The session takes the lower end of a sets range (microdose). */
  sets: string;
  reps: string;
  /** "75–85% 1RM" / "2–3 reps in reserve" / "fast" — read from the plan's dose line. */
  intensity: string | null;
  /** "2–3 min" when the plan says so. */
  rest: string | null;
  cue: string | null;
};

export type GoalPlanGym = {
  planId: string;
  quality: "top_speed" | "acceleration" | "braking" | "jump";
  week: number;
  weeksTotal: number;
  labelEN: string;
  labelIS: string;
  lifts: GoalPlanGymLift[];
};

const QUALITY_NAME: Record<GoalPlanGym["quality"], { en: string; is: string }> = {
  top_speed: { en: "top speed", is: "hámarkshraði" },
  acceleration: { en: "acceleration", is: "hröðun" },
  braking: { en: "braking", is: "bremsun" },
  jump: { en: "jump", is: "stökkkraftur" },
};

export const GOAL_PLAN_GYM_EVIDENCE =
  "The player's 8-week goal plan, session B (gym), placed in the team strength session in pre-season / off-season. Taking the place of the team's matching exercise (not added on top) and power before strength are the coach's rules, not from a study; each lift's numbers and sources are on the goal plan.";

const POWER_CATS: ExerciseCategory[] = ["EXPLOSIVE_OLYMPIC", "PLYOMETRIC", "BALLISTIC", "MED_BALL"];
const SQUAT_FAMILY = new Set(["ex_back_squat", "ex_front_squat", "ex_trap_bar_dl", "ex_ssb_squat", "ex_belt_squat"]);
const SPLIT_FAMILY = new Set(["ex_bulgarian_ss", "ex_ffe_split_squat"]);
const HINGE_FAMILY = new Set(["ex_rdl", "ex_b_stance_rdl", "ex_single_leg_rdl"]);

type Target = {
  /** Which team exercise this lift takes the place of. */
  matches: (ex: PrescribedExercise) => boolean;
  /** Keep the team's exercise when it already is one of these; otherwise this library lift. */
  keep: (id: string) => boolean;
  fallbackId: string;
  power: boolean;
};

function targetFor(l: GoalPlanGymLift): Target {
  switch (l.profile) {
    case "jump_squat":
      return { matches: (e) => POWER_CATS.includes(e.category), keep: (id) => id === "ex_trap_bar_jump_squat", fallbackId: "ex_trap_bar_jump_squat", power: true };
    case "pull": {
      const id = l.preferId && EXERCISES_BY_ID.has(l.preferId) ? l.preferId : "ex_hang_high_pull";
      return { matches: (e) => POWER_CATS.includes(e.category), keep: (x) => x === id, fallbackId: id, power: true };
    }
    case "eccentric":
      return { matches: (e) => e.category === "UNILATERAL_STRENGTH" && !HINGE_FAMILY.has(e.exerciseId), keep: (id) => SPLIT_FAMILY.has(id), fallbackId: "ex_bulgarian_ss", power: false };
    case "rdl":
      return { matches: (e) => HINGE_FAMILY.has(e.exerciseId), keep: (id) => id === "ex_rdl", fallbackId: "ex_rdl", power: false };
    case "nordic":
      return { matches: (e) => e.exerciseId === "ex_nordic_curl", keep: (id) => id === "ex_nordic_curl", fallbackId: "ex_nordic_curl", power: false };
    default: // heavy, technique, squat_fast, youth → the main two-leg lift
      return { matches: (e) => e.category === "COMPOUND_STRENGTH", keep: (id) => SQUAT_FAMILY.has(id), fallbackId: "ex_trap_bar_dl", power: false };
  }
}

/** First number of "3–4" (the lower end: microdose), never under 1. */
function setsOf(s: string): number {
  const n = Number(String(s).split(/[–-]/)[0]);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
}

/**
 * @param isRuledOut  today's safety rules rule this exercise out (banned / not suitable today)
 * @param isPinned    a safety rule put this exercise here (a safety swap) — never replaced
 */
export function applyGoalPlanGym(
  blocks: SessionBlock[],
  snap: PlayerStrengthSnapshot,
  isRuledOut: (id: string) => boolean,
  isPinned: (id: string) => boolean,
): AppliedAdaptation[] {
  const g = snap.goalPlanGym;
  if (!g || !g.lifts.length) return [];
  const q = QUALITY_NAME[g.quality];
  const trigEN = `8-week goal: ${q.en}, week ${g.week} of ${g.weeksTotal}, session B (gym)`;
  const trigIS = `8 vikna markmið: ${q.is}, vika ${g.week} af ${g.weeksTotal}, æfing B (salur)`;
  const kept = (en: string, is: string): AppliedAdaptation[] => [{
    ruleId: "GOAL_PLAN_GYM_KEPT_APART",
    triggerEN: trigEN,
    triggerIS: trigIS,
    actionEN: `Session B stays on the goal card: ${en}.`,
    actionIS: `Æfing B er áfram á markmiðsspjaldinu: ${is}.`,
    evidence: GOAL_PLAN_GYM_EVIDENCE,
  }];

  const season = goalSeasonOf(snap);
  if (season !== "build") return []; // in season (or unknown): the plan is its own card, as before — nothing to say
  if (snap.verdict === "HOLD" || snap.verdict === "RECOVERY") return kept("today is a recovery day", "í dag er endurheimtardagur");
  const yellow = snap.verdict === "MODIFIED" || snap.verdict === "REDUCED";

  // Plan every lift first (all or nothing), then write.
  type Step = { lift: GoalPlanGymLift; at: { b: number; i: number } | null; id: string; power: boolean };
  const used = new Set<string>(); // "b:i" already taken by an earlier lift
  const steps: Step[] = [];
  for (const lift of g.lifts) {
    const t = targetFor(lift);
    let at: Step["at"] = null;
    for (let b = 0; b < blocks.length && !at; b++) {
      for (let i = 0; i < blocks[b].exercises.length; i++) {
        const ex = blocks[b].exercises[i];
        if (used.has(`${b}:${i}`) || !t.matches(ex)) continue;
        at = { b, i };
        break;
      }
    }
    if (at) {
      const ex = blocks[at.b].exercises[at.i];
      // A safety swap holds this slot: never replaced.
      if (ex.isAdaptiveAddition || isPinned(ex.exerciseId)) {
        return kept("a safety rule changed that exercise today", "öryggisregla breytti þeirri æfingu í dag");
      }
      used.add(`${at.b}:${at.i}`);
    }
    const id = at && t.keep(blocks[at.b].exercises[at.i].exerciseId) ? blocks[at.b].exercises[at.i].exerciseId : t.fallbackId;
    if (isRuledOut(id) || !EXERCISES_BY_ID.has(id)) {
      return kept("a safety rule rules one of its lifts out today", "öryggisregla útilokar eina lyftu hennar í dag");
    }
    steps.push({ lift, at, id, power: t.power });
  }

  const tag = { en: `8-week goal (${q.en}), week ${g.week}`, is: `8 vikna markmið (${q.is}), vika ${g.week}` };
  const lines: string[] = [];
  const linesIS: string[] = [];
  const added: { step: Step; ex: PrescribedExercise }[] = [];
  for (const step of steps) {
    const lib = EXERCISES_BY_ID.get(step.id)!;
    const base = step.at ? blocks[step.at.b].exercises[step.at.i] : null;
    const planSets = setsOf(step.lift.sets);
    const sets = yellow ? Math.max(1, Math.ceil(planSets / 2)) : planSets;
    const ex: PrescribedExercise = {
      exerciseId: lib.id,
      nameEN: lib.nameEN,
      nameIS: lib.nameIS,
      category: lib.category,
      dose: {
        ...(base?.dose ?? { intensity: "", rest: "2 min" }),
        sets,
        reps: step.lift.reps.replace(/–/g, "-"),
        intensity: step.lift.intensity ?? base?.dose.intensity ?? "",
        rest: step.lift.rest ?? base?.dose.rest ?? "2 min",
        cue: step.lift.cue ?? undefined,
      },
      goalPlan: { quality: g.quality, week: g.week },
      modificationReason: `${tag.en}${base && base.exerciseId !== lib.id ? ` — in place of ${base.nameEN}` : base ? "" : " — added"}${yellow ? " · yellow day: half the sets" : ""}`,
    };
    if (step.at) blocks[step.at.b].exercises[step.at.i] = ex;
    else added.push({ step, ex });
    const what = `${lib.nameEN} ${sets} × ${ex.dose.reps}`;
    const whatIS = `${lib.nameIS || lib.nameEN} ${sets} × ${ex.dose.reps}`;
    lines.push(base && base.exerciseId !== lib.id ? `${what} in place of ${base.nameEN}` : base ? `${what} (the plan's dose)` : `${what} (added: nothing in that slot)`);
    linesIS.push(base && base.exerciseId !== lib.id ? `${whatIS} í stað ${base.nameIS || base.nameEN}` : base ? `${whatIS} (skammtur áætlunarinnar)` : `${whatIS} (bætt við: ekkert í því sæti)`);
  }

  // Lifts with no team exercise to take the place of: power first in the session, the rest after the main lift.
  if (added.length) {
    const firstWork = Math.max(0, blocks.findIndex((b) => b.type !== "PREP" && b.type !== "MOBILITY"));
    const mainAt = blocks.findIndex((b) => b.exercises.some((e) => e.category === "COMPOUND_STRENGTH"));
    for (const { step, ex } of added) {
      if (!blocks.length) break;
      if (step.power) blocks[firstWork].exercises.unshift(ex);
      else blocks[mainAt >= 0 ? mainAt : firstWork].exercises.push(ex);
    }
  }

  // The team's own order stands (a contrast block pairs heavy → jump on purpose); a replaced lift keeps its place.

  return [{
    ruleId: "GOAL_PLAN_GYM_MERGED",
    triggerEN: trigEN,
    triggerIS: trigIS,
    actionEN: `The goal's gym session is part of today's session: ${lines.join("; ")}.${yellow ? " Yellow day: half the sets." : ""}`,
    actionIS: `Salur-æfing markmiðsins er hluti af æfingu dagsins: ${linesIS.join("; ")}.${yellow ? " Gulur dagur: hálf sett." : ""}`,
    evidence: GOAL_PLAN_GYM_EVIDENCE,
  }];
}

/** The snapshot with today's goal-plan gym session on it (individualised sends only). Unchanged when there is none. */
export function withGoalPlanGym<T extends PlayerStrengthSnapshot>(snap: T, gym: GoalPlanGym | null | undefined): T {
  return gym ? { ...snap, goalPlanGym: gym } : snap;
}
