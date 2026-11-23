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
 *   - Recovery day (red) → nothing merged (the goal card says skip). Yellow → one set off (the one yellow rule for lifts, 2026-11-23).
 *   - In season → nothing here; the plan stays its own card.
 *   - Never more than +1 set: the strength goal's extra set and the Accumulation +1 skip a goal-plan exercise.
 *   - The day's structure ("Structure per MD day") is the frame, the goal keeps its own dose (2026-11-17): a goal lift
 *     takes the plan's sets / reps / % / rest and nothing else from the slot (no cluster rest, no velocity cap) — but
 *     never more sets than the exercise it takes the place of (2026-11-18), so the session never grows. A day
 *     whose structure has no heavy lift (isometric, primer, taper) takes nothing: session B stays on the goal card.
 *
 *   - Inside the week rule (2026-11-19, weekRule.ts): a heavy goal lift that takes the place of the day's heavy lift
 *     gets no more sets than the day's heavy reps hold at the plan's reps a set (9 heavy reps and a plan of 3 × 6 → 2 × 6),
 *     so a goal never lifts a day above the week's reps. And the sets a goal lift could not get on its goal day (the
 *     spot is smaller than the plan) come back on the week's other heavy day, again in place of the matching team
 *     exercise: `applyGoalGiveBack`. The plan's weekly work is kept inside the week's heavy days; no session grows.
 *
 * Runs after the team list and before the player's strength goal and the coach's manual swaps (coach's last word).
 */

import type { AppliedAdaptation, ExerciseCategory, PlayerStrengthSnapshot, PrescribedExercise, SessionBlock } from "./types";
import { isGymQuality, type GoalQuality, type GoalSessionSlot } from "@/lib/micropulse/goalPlan/types";
import { EXERCISES_BY_ID } from "./exerciseLibrary";
import { goalSeasonOf } from "./playerGoal";
import { BAR_PULL_IDS, HEAVY_REPS_MAX, LOADED_SQUAT_JUMP_IDS, NEAR_MATCH_ZONE, nearMatchDoseFor, speedZoneText, type NearMatchDay, type SpeedZone } from "./weekRule";

/** The lift profiles a goal plan's gym block is read as (`goalPlan/liftRx.ts`). `iso_pull`, `single_leg`, `drop_jump`:
 *  the gym-only goals' additions (brief §4a, 2026-11-23). */
export type GoalGymProfile = "heavy" | "technique" | "rdl" | "jump_squat" | "pull" | "nordic" | "eccentric" | "squat_fast" | "youth" | "iso_pull" | "single_leg" | "drop_jump";

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
  /** The coach's additions (brief §4a): a safety rule (or a safety swap holding the spot) leaves this lift out, and the
   *  rest of the goal's lifts still go in. Without it, all or nothing. */
  optional?: true;
};

/** One of the week's goal gym sessions on another day than today. */
export type GoalGiveBackSession = { slot: GoalSessionSlot; date: string; md: string | null; lifts: GoalPlanGymLift[] };
/** Today holds no goal gym session: the week's goal gym sessions on other days, and the days the team trains this week
 *  (with their match-day label; null = no match near). The engine works out, by the week rule alone, which sets those
 *  days cannot hold and whether today is the day they come back. */
export type GoalGiveBack = { sessions: GoalGiveBackSession[]; weekDays: { date: string; md: string | null }[] };

export type GoalPlanGym = {
  planId: string;
  quality: GoalQuality;
  /** The plan session merged today: B for the pitch goals; A or B for the gym-only goals (2026-11-18). Absent = B. */
  slot?: GoalSessionSlot;
  week: number;
  weeksTotal: number;
  labelEN: string;
  labelIS: string;
  /** Today's goal gym lifts. Empty on a day that only gives back (`giveBack`). */
  lifts: GoalPlanGymLift[];
  giveBack?: GoalGiveBack;
  /** The goal's gym lifts this plan week (all its sessions), on a day without a goal gym session: close to the match
   *  the engine puts the goal's lift, light and fast, in the day's fast spot (`applyGoalNearMatch`, 2026-11-20). */
  weekLifts?: GoalPlanGymLift[];
};

/** What a lift got on a day: the plan's sets (after a yellow day's halving) and the sets it was given. */
export type GoalLiftResult = { lift: GoalPlanGymLift; planSets: number; sets: number };
/** A lift that could not get all its sets on its goal day (`owedSets` were missing), for the week's give-back day. */
export type GoalOwedLift = { lift: GoalPlanGymLift; owedSets: number; fromSlot: GoalSessionSlot };

const QUALITY_NAME: Record<GoalPlanGym["quality"], { en: string; is: string }> = {
  top_speed: { en: "top speed", is: "hámarkshraði" },
  acceleration: { en: "acceleration", is: "hröðun" },
  braking: { en: "braking", is: "bremsun" },
  jump: { en: "jump", is: "stökkkraftur" },
  max_strength: { en: "maximal strength", is: "hámarksstyrkur" },
  explosive: { en: "explosive power", is: "sprengikraftur" },
  strength_power: { en: "strength + power", is: "styrkur + sprengikraftur" },
};

export const GOAL_GIVE_BACK_EVIDENCE =
  "Week rule, the player's 8-week goal. A goal lift never gets more sets than the team exercise it takes the place of, and a heavy goal lift never more than the day's heavy reps. A lift that could not get all its sets on the goal day is done again on the week's other heavy day, in place of the matching team exercise and with that exercise's sets, so the plan's weekly work stays inside the heavy days and no session grows. With the weekly volume the same, how it was divided over the days made no difference to strength (Cuthbert 2021; Grgic 2018). Which day gives the sets back is MicroPulse's rule, not from a study.";

export const GOAL_PLAN_GYM_EVIDENCE =
  "The player's 8-week goal plan, session B (gym), placed in the team strength session in pre-season / off-season. Taking the place of the team's matching exercise (not added on top) and power before strength are the coach's rules, not from a study; each lift's numbers and sources are on the goal plan.";

const POWER_CATS: ExerciseCategory[] = ["EXPLOSIVE_OLYMPIC", "PLYOMETRIC", "BALLISTIC", "MED_BALL"];
const SQUAT_FAMILY = new Set(["ex_back_squat", "ex_front_squat", "ex_trap_bar_dl", "ex_ssb_squat", "ex_belt_squat"]);
const SPLIT_FAMILY = new Set(["ex_bulgarian_ss", "ex_ffe_split_squat"]);
const HINGE_FAMILY = new Set(["ex_rdl", "ex_b_stance_rdl", "ex_single_leg_rdl"]);

type Match = (ex: PrescribedExercise) => boolean;
type Target = {
  /** Which team exercise this lift takes the place of, best first. Every lift tries its first choice before any lift
   *  takes a second choice, so a later lift's own slot is never taken by an earlier lift's fallback. The first choice
   *  is the same kind (a jump squat takes the loaded-jump spot, not the box jump's), so a lift never ends up twice. */
  tiers: Match[];
  /** Keep the team's exercise when it already is one of these; otherwise this library lift. */
  keep: (id: string) => boolean;
  fallbackId: string;
  power: boolean;
};

const isPower: Match = (e) => POWER_CATS.includes(e.category);

/** @param spareUpper  the session's second upper-body exercise, when it has two or more (null otherwise) */
function targetFor(l: GoalPlanGymLift, spareUpper: PrescribedExercise | null): Target {
  switch (l.profile) {
    case "jump_squat":
      return { tiers: [(e) => isPower(e) && (e.exerciseId === "ex_trap_bar_jump_squat" || e.category === "BALLISTIC"), isPower], keep: (id) => id === "ex_trap_bar_jump_squat", fallbackId: "ex_trap_bar_jump_squat", power: true };
    case "pull": {
      const id = l.preferId && EXERCISES_BY_ID.has(l.preferId) ? l.preferId : "ex_hang_high_pull";
      return { tiers: [(e) => isPower(e) && (e.exerciseId === id || e.category === "EXPLOSIVE_OLYMPIC"), isPower], keep: (x) => x === id, fallbackId: id, power: true };
    }
    case "eccentric":
      // The braking goal's slow-lowering split squat (2026-11-18, the coach's choice): a single-leg lift's spot first;
      // with none, the second of two upper-body exercises (the contrast and the heavy lift stay as they are); with
      // neither, the main lift. Before, it was added on top (+3 sets) at the end of the contrast block.
      return {
        tiers: [
          (e) => e.category === "UNILATERAL_STRENGTH" && !HINGE_FAMILY.has(e.exerciseId),
          (e) => spareUpper != null && e === spareUpper,
          (e) => e.category === "COMPOUND_STRENGTH",
        ],
        keep: (id) => SPLIT_FAMILY.has(id),
        fallbackId: "ex_bulgarian_ss",
        power: false,
      };
    case "rdl":
      return { tiers: [(e) => HINGE_FAMILY.has(e.exerciseId)], keep: (id) => id === "ex_rdl", fallbackId: "ex_rdl", power: false };
    case "nordic":
      return { tiers: [(e) => e.exerciseId === "ex_nordic_curl"], keep: (id) => id === "ex_nordic_curl", fallbackId: "ex_nordic_curl", power: false };
    case "iso_pull":
      // The team's isometric spot (a mid-thigh pull or a squat hold) when it has one; else after the main lift.
      return { tiers: [(e) => e.category === "ISOMETRIC_MAX"], keep: (id) => id === "ex_imtp_iso", fallbackId: "ex_imtp_iso", power: false };
    case "single_leg":
      // A one-leg lift's spot (not a one-leg hinge); else the second of two upper-body exercises; else after the main lift.
      return {
        tiers: [(e) => e.category === "UNILATERAL_STRENGTH" && !HINGE_FAMILY.has(e.exerciseId), (e) => spareUpper != null && e === spareUpper],
        keep: (id) => SPLIT_FAMILY.has(id),
        fallbackId: "ex_bulgarian_ss",
        power: false,
      };
    case "drop_jump":
      // The day's jump spot (a box jump or a drop jump); else first in the session (power first).
      return { tiers: [(e) => e.category === "PLYOMETRIC"], keep: (id) => id === "ex_depth_jump", fallbackId: "ex_depth_jump", power: true };
    default: // heavy, technique, squat_fast, youth → the main two-leg lift
      return { tiers: [(e) => e.category === "COMPOUND_STRENGTH"], keep: (id) => SQUAT_FAMILY.has(id), fallbackId: "ex_trap_bar_dl", power: false };
  }
}

/** The upper-body exercise a lower-body goal lift may take the place of: only when the session has two or more, and
 *  then the accessory one (not a barbell lift), so the main press stays. */
function spareUpperOf(blocks: SessionBlock[]): PrescribedExercise | null {
  const upper = blocks.flatMap((b) => b.exercises).filter((e) => e.category === "UPPER_BODY");
  if (upper.length < 2) return null;
  return upper.find((e) => !e.exerciseId.startsWith("ex_bb_")) ?? upper[upper.length - 1];
}

/** First number of "3–4" (the lower end: microdose), never under 1. */
function setsOf(s: string): number {
  const n = Number(String(s).split(/[–-]/)[0]);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
}

/** The reps a set holds: [lower end, middle] of "3-5" → [3, 4]; null for a hold or a line with no number first. */
function repsRange(reps: string): { low: number; mid: number } | null {
  if (/\d\s*s\b|sec|hold/i.test(reps)) return null;
  const m = /^\s*(\d+)(?:\s*[-–]\s*(\d+))?/.exec(reps);
  if (!m) return null;
  const low = Number(m[1]);
  return { low, mid: m[2] ? (low + Number(m[2])) / 2 : low };
}

/**
 * A heavy goal lift in the place of the day's heavy lift (its sets were set by the week rule): the day's heavy reps, and
 * the sets that hold them at the plan's reps a set (to the nearest set). Null when either is not a heavy lift.
 */
function heavyFit(base: PrescribedExercise | null, category: ExerciseCategory, planReps: string, ruleReps: number | null): { dayReps: number; sets: number } | null {
  if (!base || !base.dose.weekRule || base.category !== "COMPOUND_STRENGTH" || category !== "COMPOUND_STRENGTH") return null;
  const plan = repsRange(planReps);
  const own = repsRange(base.dose.reps);
  if (!plan || !own || plan.low > HEAVY_REPS_MAX) return null;
  // The day's reps by the rule when known (a round cap may have left the team's lift under them), else what the spot holds.
  const dayReps = ruleReps ?? Math.round(base.dose.sets) * own.low;
  return { dayReps, sets: Math.max(1, Math.round(dayReps / plan.mid)) };
}

type MergeArgs = {
  blocks: SessionBlock[];
  later: SessionBlock[];
  lifts: GoalPlanGymLift[];
  quality: GoalQuality;
  week: number;
  /** The plan session a lift belongs to (the give-back day carries lifts of other days' sessions). */
  slotOf: (lift: GoalPlanGymLift) => GoalSessionSlot;
  yellow: boolean;
  isRuledOut: (id: string) => boolean;
  isPinned: (id: string) => boolean;
  /** Today's heavy reps by the week rule, when today is a heavy day. */
  dayHeavyReps?: number | null;
  /** Give-back day: a lift that cannot go in today is left out (the others still go in), and nothing is ever added:
   *  a lift only takes the place of a team exercise. */
  giveBack?: boolean;
  /** Today's match day (the speed zones of the gym-only goals). */
  md?: string | null;
};
type ZoneLine = { day: GoalZoneDay; en: string; is: string };
type Merged = { kept: [string, string] } | { lines: string[]; linesIS: string[]; results: GoalLiftResult[]; zones: ZoneLine[]; leftOut: { en: string; is: string }[] };

// ─── Bar-speed zones on the gym-only goals' lifts (brief §4a, 2026-11-23) ─────────────────────────────────────

/** The day a goal lift's zone is read for: MD-4 is the heavy day, MD-3 the fast day. */
export type GoalZoneDay = "MD-4" | "MD-3";
/** The coach's zones, kept as written (UEFA B weekly plan, brief §4a). `heavy` = the bar lift (squat / trap bar),
 *  `ballistic` = the loaded jump squat (a bar pull takes its lower end as a floor). Strength + power has none in the
 *  brief, so none here. */
export const GOAL_SPEED_ZONES: Partial<Record<GoalQuality, Record<GoalZoneDay, { heavy?: SpeedZone; ballistic?: SpeedZone }>>> = {
  max_strength: { "MD-4": { heavy: { min: 0.55, max: 0.65 } }, "MD-3": { heavy: { min: 0.8, max: 0.9 } } },
  explosive: { "MD-4": { heavy: { min: 0.8, max: 0.9 }, ballistic: { min: 1.1, max: 1.3 } }, "MD-3": { heavy: { min: 0.8, max: 0.9 }, ballistic: { min: 1.2, max: 1.4 } } },
};

export const GOAL_SPEED_ZONE_EVIDENCE =
  "The bar-speed zones are the coach's (UEFA B weekly plan, 2026-11-22), kept as written: Maximal strength 0.55–0.65 m/s on MD-4 and 0.80–0.90 on MD-3; Explosive power 0.80–0.90 m/s and loaded jumps 1.1–1.3 on MD-4, loaded jumps 1.2–1.4 on MD-3. Which zone goes on which day is MicroPulse's rule, not from a study. The plan's % of max stays as the starting weight; with a device the speed decides the weight (Weakley 2021), and players differ by more than 10% at heavy weights (Thompson 2021). In professional footballers' squats 0.80 m/s was about 70% of max and 0.90 about 65% (Pareja-Blanco 2017, Smith machine), so a zone faster than the plan's % takes weight off. No study tested a target speed for loaded jumps or pulls; a pull takes the zone's lower end as a floor only.";

/** The zone day: today's match day when it is MD-4 or MD-3; otherwise (no match near, or another day) the plan
 *  session's own day — goal day 1 is the heavy day, goal day 2 the fast day. */
export function goalZoneDay(md: string | null | undefined, slot: GoalSessionSlot): GoalZoneDay {
  return md === "MD-4" || md === "MD-3" ? md : slot === "A" ? "MD-4" : "MD-3";
}

/** The zone one written goal lift takes, or null (no bar measured: body weight, one leg, an isometric, a technique
 *  or youth lift, a goal without zones). */
export function goalLiftZone(quality: GoalQuality, day: GoalZoneDay, lift: GoalPlanGymLift, exerciseId: string): SpeedZone | null {
  const z = GOAL_SPEED_ZONES[quality]?.[day];
  if (!z) return null;
  if (lift.profile === "heavy" && SQUAT_FAMILY.has(exerciseId)) return z.heavy ?? null;
  if (lift.profile === "jump_squat" && !/^bodyweight/i.test(lift.intensity ?? "") && LOADED_SQUAT_JUMP_IDS.has(exerciseId)) return z.ballistic ?? null;
  if ((lift.profile === "pull" || lift.profile === "jump_squat") && BAR_PULL_IDS.has(exerciseId) && z.ballistic) return { min: z.ballistic.min, max: null };
  return null;
}

/** Places the lifts in the session (each in the place of the matching team exercise) and writes them. */
function mergeLifts(a: MergeArgs): Merged {
  const { blocks, later, lifts, yellow, isRuledOut, isPinned } = a;
  const giveBack = !!a.giveBack;
  const q = QUALITY_NAME[a.quality];

  // Plan every lift first (all or nothing), then write.
  type Step = { lift: GoalPlanGymLift; at: { b: number; i: number } | null; id: string; power: boolean };
  const used = new Set<string>(); // "b:i" already taken by another lift
  const steps: Step[] = [];
  const leftOut: { en: string; is: string }[] = [];
  const skip = (lift: GoalPlanGymLift, en: string, is: string) => leftOut.push({ en: `${lift.nameEN} left out: ${en}`, is: `${lift.nameIS || lift.nameEN} sleppt: ${is}` });
  // Spots are looked for in today's blocks and in the blocks still to come (indexes past `blocks` are `later`).
  const pool = [...blocks, ...later];
  const spareUpper = spareUpperOf(pool);
  const targets = lifts.map((lift) => targetFor(lift, spareUpper));
  const spots: Step["at"][] = lifts.map(() => null);
  // Round by round: every lift's first choice, then every lift's second choice, …
  for (let tier = 0; tier < Math.max(0, ...targets.map((t) => t.tiers.length)); tier++) {
    for (let k = 0; k < targets.length; k++) {
      const match = targets[k].tiers[tier];
      if (spots[k] || !match) continue;
      for (let b = 0; b < pool.length && !spots[k]; b++) {
        for (let i = 0; i < pool[b].exercises.length; i++) {
          // A spot another goal lift already holds (the goal day's own lift) is never taken twice.
          if (used.has(`${b}:${i}`) || pool[b].exercises[i].goalPlan || !match(pool[b].exercises[i])) continue;
          spots[k] = { b, i };
          used.add(`${b}:${i}`);
          break;
        }
      }
    }
  }
  for (let k = 0; k < lifts.length; k++) {
    const lift = lifts[k];
    const t = targets[k];
    const at = spots[k];
    if (giveBack && !at) continue; // nothing to take the place of today
    if (at) {
      const ex = pool[at.b].exercises[at.i];
      // A safety swap holds this slot: never replaced.
      if (ex.isAdaptiveAddition || isPinned(ex.exerciseId)) {
        if (giveBack) continue;
        if (lift.optional) { skip(lift, "a safety rule changed that exercise today", "öryggisregla breytti þeirri æfingu í dag"); continue; }
        return { kept: ["a safety rule changed that exercise today", "öryggisregla breytti þeirri æfingu í dag"] };
      }
    }
    const id = at && t.keep(pool[at.b].exercises[at.i].exerciseId) ? pool[at.b].exercises[at.i].exerciseId : t.fallbackId;
    if (isRuledOut(id) || !EXERCISES_BY_ID.has(id)) {
      if (giveBack) continue;
      if (lift.optional) { skip(lift, "a safety rule rules it out today", "öryggisregla útilokar hana í dag"); continue; }
      return { kept: ["a safety rule rules one of its lifts out today", "öryggisregla útilokar eina lyftu hennar í dag"] };
    }
    steps.push({ lift, at, id, power: t.power });
  }

  // The day's heavy reps belong to the day's one heavy lift; with two heavy lifts each spot speaks for itself.
  const heavySpots = pool.flatMap((b) => b.exercises).filter((e) => e.dose.weekRule && e.category === "COMPOUND_STRENGTH").length;
  const ruleReps = a.dayHeavyReps != null && heavySpots === 1 ? a.dayHeavyReps : null;

  const tag = { en: `8-week goal (${q.en}), week ${a.week}`, is: `8 vikna markmið (${q.is}), vika ${a.week}` };
  const said = new Map<Step, { en: string; is: string; result: GoalLiftResult }>();
  const added: { step: Step; ex: PrescribedExercise }[] = [];
  const zones: ZoneLine[] = [];
  // The heavy lift is written first: when the day's heavy reps cut a contrast block's rounds, the goal's own jump in
  // that block then takes the new rounds too. What is said keeps the plan's order.
  const heavyFirst = [...steps].sort((x, y) => Number(EXERCISES_BY_ID.get(y.id)?.category === "COMPOUND_STRENGTH") - Number(EXERCISES_BY_ID.get(x.id)?.category === "COMPOUND_STRENGTH"));
  for (const step of heavyFirst) {
    const lib = EXERCISES_BY_ID.get(step.id)!;
    const base = step.at ? pool[step.at.b].exercises[step.at.i] : null;
    const planSets = setsOf(step.lift.sets);
    // Yellow: one set off, the same rule as every other lift (2026-11-23; was half the sets).
    const target = yellow ? Math.max(1, planSets - 1) : planSets;
    // Inside the week rule (2026-11-19): a heavy lift in the day's heavy spot gets the sets the day's heavy reps hold
    // at the plan's reps a set, never more (the old cap counted sets only, so 3 × 6 went into a 3 × 3 spot as 18 reps).
    const heavy = heavyFit(base, lib.category, step.lift.reps, ruleReps);
    // Never more sets than the team exercise it takes the place of (2026-11-18): the day's structure sets the volume,
    // so the session never grows (a 4-set jump squat in a 2-set contrast spot gets 2). Reps, load and rest stay the plan's.
    const slotSets = base && Number.isFinite(base.dose.sets) && base.dose.sets >= 1 ? Math.round(base.dose.sets) : null;
    // In a contrast block the rounds are capped (3 in a French contrast), so the lift never does more rounds than the block.
    const inContrast = step.at != null && pool[step.at.b].type === "FRENCH_CONTRAST";
    const room = heavy ? (inContrast && slotSets != null ? Math.min(heavy.sets, slotSets) : heavy.sets) : slotSets;
    // The same on a give-back day: the lift does the spot's sets (never more than the plan's), so the spot is not left
    // half done and a contrast pair keeps its rounds. That can be a few reps more than were missing.
    const sets = room != null ? Math.min(target, room) : target;
    const capped = sets < target && !giveBack;
    const slot = a.slotOf(step.lift);
    // The gym-only goals' bar-speed zone for the day (brief §4a): shown with the plan's %, which stays the starting weight.
    const zDay = isGymQuality(a.quality) ? goalZoneDay(a.md, slot) : null;
    const zone = zDay ? goalLiftZone(a.quality, zDay, step.lift, lib.id) : null;
    const zText = zone ? speedZoneText(zone) : null;
    const why = giveBack
      ? " · sets the goal day could not hold"
      : `${capped ? (heavy ? `, ${sets} sets: the day's ${heavy.dayReps} heavy reps` : `, the team's ${sets} sets`) : ""}`;
    const ex: PrescribedExercise = {
      exerciseId: lib.id,
      nameEN: lib.nameEN,
      nameIS: lib.nameIS,
      category: lib.category,
      // The goal's own dose, nothing inherited from the slot (a cluster's intra-set rest or a velocity cap would mix
      // two prescriptions on one lift).
      dose: {
        sets,
        reps: step.lift.reps.replace(/–/g, "-"),
        intensity: [step.lift.intensity, zText].filter(Boolean).join(" · "),
        // A plan line with no time (the Nordic: the partner's set is the rest) keeps the slot's rest.
        rest: step.lift.rest ?? base?.dose.rest ?? "2 min",
        intraRepRestSec: null,
        cue: (zone
          ? [step.lift.cue, zone.max == null ? `Bar speed ${zText}: take weight off if it is slower` : `Bar speed ${zText}: add weight if it is faster, take weight off if slower`].filter(Boolean).join(" · ")
          : step.lift.cue) ?? undefined,
        ...(zone ? { speedZone: zone } : {}),
      },
      goalPlan: { quality: a.quality, week: a.week, slot, ...(giveBack ? { giveBack: true as const } : {}) },
      modificationReason: `${tag.en}${base && base.exerciseId !== lib.id ? ` — in place of ${base.nameEN}` : base ? "" : " — added"} · the goal's own dose${why}${yellow ? " · yellow day: one set off" : ""}`,
    };
    if (step.at) pool[step.at.b].exercises[step.at.i] = ex;
    else added.push({ step, ex });
    // A contrast pair goes round by round: when the week rule's reps cut the heavy lift under the block's rounds, the
    // team's own exercises in the block follow (a goal lift in the block keeps its own sets).
    if (step.at && heavy && inContrast && slotSets != null && sets < slotSets && heavy.sets < slotSets) {
      const blk = pool[step.at.b];
      blk.exercises = blk.exercises.map((e) => (e.goalPlan || e.dose.sets !== slotSets ? e : { ...e, dose: { ...e.dose, sets } }));
    }
    const what = `${lib.nameEN} ${sets} × ${ex.dose.reps}${zText ? ` at ${zText}` : ""}`;
    const whatIS = `${lib.nameIS || lib.nameEN} ${sets} × ${ex.dose.reps}${zText ? ` á ${zText.replace(/(\d)\.(\d)/g, "$1,$2")}` : ""}`;
    if (zone && zDay) {
      const zIS = zText!.replace(/(\d)\.(\d)/g, "$1,$2");
      const floor = zone.max == null;
      zones.push({
        day: zDay,
        en: `${lib.nameEN} ${floor ? `at least ${zText!.replace("≥ ", "")}` : zText}${step.lift.intensity ? ` (the plan's ${step.lift.intensity} is where to start)` : ""}`,
        is: `${lib.nameIS || lib.nameEN} ${floor ? `minnst ${zIS.replace("≥ ", "")}` : zIS}${step.lift.intensity ? ` (${step.lift.intensity.replace("1RM", "af hámarki")} áætlunarinnar er byrjunarþyngdin)` : ""}`,
      });
    }
    const capEN = !capped ? "" : heavy ? ` (${sets} sets: today holds ${heavy.dayReps} heavy reps by the week rule; the plan says ${step.lift.sets})` : ` (${sets} sets as the team's exercise; the plan says ${step.lift.sets})`;
    const capIS = !capped ? "" : heavy ? ` (${sets} sett: dagurinn hefur ${heavy.dayReps} þungar endurtekningar eftir vikureglunni; áætlunin segir ${step.lift.sets})` : ` (${sets} sett eins og æfing liðsins; áætlunin segir ${step.lift.sets})`;
    said.set(step, {
      en: base && base.exerciseId !== lib.id ? `${what} in place of ${base.nameEN}${capEN}` : base ? `${what}${capEN || (giveBack ? "" : " (the plan's dose)")}` : `${what} (added: nothing in that slot)`,
      is: base && base.exerciseId !== lib.id ? `${whatIS} í stað ${base.nameIS || base.nameEN}${capIS}` : base ? `${whatIS}${capIS || (giveBack ? "" : " (skammtur áætlunarinnar)")}` : `${whatIS} (bætt við: ekkert í því sæti)`,
      result: { lift: step.lift, planSets: target, sets },
    });
  }
  const told = steps.map((st) => said.get(st)!);
  const lines = told.map((t) => t.en);
  const linesIS = told.map((t) => t.is);
  const results = told.map((t) => t.result);

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
  return { lines, linesIS, results, zones, leftOut };
}

/**
 * @param isRuledOut  today's safety rules rule this exercise out (banned / not suitable today)
 * @param isPinned    a safety rule put this exercise here (a safety swap) — never replaced
 * @param later       blocks the engine puts in the session after this step (the upper-body block): a lift may take a
 *                    spot in them (mutated in place), never anything else
 * @param opts        `dayHeavyReps`: today's heavy reps by the week rule (a heavy day); `results`: filled with what each
 *                    lift got (for the week rule's give-back, which reads another day's frame)
 */
export function applyGoalPlanGym(
  blocks: SessionBlock[],
  snap: PlayerStrengthSnapshot,
  isRuledOut: (id: string) => boolean,
  isPinned: (id: string) => boolean,
  later: SessionBlock[] = [],
  opts: { dayHeavyReps?: number | null; results?: GoalLiftResult[] } = {},
): AppliedAdaptation[] {
  const g = snap.goalPlanGym;
  if (!g || !g.lifts.length) return [];
  const q = QUALITY_NAME[g.quality];
  const slot = g.slot ?? "B";
  // Gym-only goals have no pitch session: their two goal days are "goal day 1 / 2" (A / B).
  const gymOnly = isGymQuality(g.quality);
  const part = gymOnly
    ? { en: `goal day ${slot === "A" ? 1 : 2}`, is: `markmiðsdagur ${slot === "A" ? 1 : 2}` }
    : { en: `session ${slot} (gym)`, is: `æfing ${slot} (salur)` };
  const trigEN = `8-week goal: ${q.en}, week ${g.week} of ${g.weeksTotal}, ${part.en}`;
  const trigIS = `8 vikna markmið: ${q.is}, vika ${g.week} af ${g.weeksTotal}, ${part.is}`;
  const kept = (en: string, is: string): AppliedAdaptation[] => [{
    ruleId: "GOAL_PLAN_GYM_KEPT_APART",
    triggerEN: trigEN,
    triggerIS: trigIS,
    actionEN: `${gymOnly ? "The goal's lifts stay" : `Session ${slot} stays`} on the goal card: ${en}.`,
    actionIS: `${gymOnly ? "Lyftur markmiðsins eru áfram" : `Æfing ${slot} er áfram`} á markmiðsspjaldinu: ${is}.`,
    evidence: GOAL_PLAN_GYM_EVIDENCE,
  }];

  const season = goalSeasonOf(snap);
  if (season !== "build") return []; // in season (or unknown): the plan is its own card, as before — nothing to say
  if (snap.verdict === "HOLD" || snap.verdict === "RECOVERY") return kept("today is a recovery day", "í dag er endurheimtardagur");
  const yellow = snap.verdict === "MODIFIED" || snap.verdict === "REDUCED";
  // The structure is the frame: no heavy lift today (isometric / primer / taper day) → nothing on top of it.
  if (!blocks.some((b) => b.exercises.some((e) => e.category === "COMPOUND_STRENGTH"))) {
    return yellow
      ? kept("yellow day: today's structure was stepped down and has no heavy lift", "gulur dagur: uppsetning dagsins var létt og er án þungrar lyftu")
      : kept("today's structure has no heavy lift", "uppsetning dagsins er án þungrar lyftu");
  }

  const merged = mergeLifts({ blocks, later, lifts: g.lifts, quality: g.quality, week: g.week, slotOf: () => slot, yellow, isRuledOut, isPinned, dayHeavyReps: opts.dayHeavyReps, md: snap.mdContext });
  if ("kept" in merged) return kept(...merged.kept);
  opts.results?.push(...merged.results);
  const outEN = merged.leftOut.length ? ` ${merged.leftOut.map((x) => x.en).join("; ")}.` : "";
  const outIS = merged.leftOut.length ? ` ${merged.leftOut.map((x) => x.is).join("; ")}.` : "";

  return [{
    ruleId: "GOAL_PLAN_GYM_MERGED",
    triggerEN: trigEN,
    triggerIS: trigIS,
    actionEN: `The goal's gym session is part of today's session: ${merged.lines.join("; ")}.${yellow ? " Yellow day: one set off each lift." : ""}${outEN}`,
    actionIS: `Salur-æfing markmiðsins er hluti af æfingu dagsins: ${merged.linesIS.join("; ")}.${yellow ? " Gulur dagur: eitt sett af hverri lyftu." : ""}${outIS}`,
    evidence: GOAL_PLAN_GYM_EVIDENCE,
  }, ...zoneAudit(g, merged.zones, snap.mdContext)];
}

/** One line for the day's bar-speed zones on the goal's lifts (brief §4a). */
function zoneAudit(g: GoalPlanGym, zones: ZoneLine[], md: string | null | undefined): AppliedAdaptation[] {
  if (!zones.length) return [];
  const q = QUALITY_NAME[g.quality];
  const day = zones[0].day;
  const byDay = md === "MD-4" || md === "MD-3"
    ? { en: day, is: day }
    : {
        en: `${day === "MD-4" ? "goal day 1, the heavy day" : "goal day 2, the fast day"} (${day}'s zone; ${md ? `today is ${md}` : "no match near"})`,
        is: `${day === "MD-4" ? "markmiðsdagur 1, þungi dagurinn" : "markmiðsdagur 2, hraði dagurinn"} (svæði ${day}; ${md ? `í dag er ${md}` : "enginn leikur nálægt"})`,
      };
  return [{
    ruleId: "GOAL_PLAN_SPEED_ZONE",
    triggerEN: `8-week goal: ${q.en}, week ${g.week} of ${g.weeksTotal}, ${byDay.en}`,
    triggerIS: `8 vikna markmið: ${q.is}, vika ${g.week} af ${g.weeksTotal}, ${byDay.is}`,
    actionEN: `Bar speed on the goal's lifts: ${zones.map((z) => z.en).join("; ")}. With a device the speed decides the weight.`,
    actionIS: `Stangarhraði á lyftum markmiðsins: ${zones.map((z) => z.is).join("; ")}. Með mæli ræður hraðinn þyngdinni.`,
    evidence: GOAL_SPEED_ZONE_EVIDENCE,
  }];
}

/**
 * The week's give-back day (2026-11-19): a goal lift that could not get all its sets on its goal day is done again
 * today, in the place of the matching team exercise and with that spot's sets (never more than the plan's own sets for
 * one session). Nothing is added and no session grows; a lift that cannot go in today (no matching exercise, or a
 * safety rule holds or rules out the spot) is left out. Green days only: a yellow or red day
 * takes nothing extra from the goal. Pre-/off-season only, like the goal day itself.
 */
export function applyGoalGiveBack(
  blocks: SessionBlock[],
  snap: PlayerStrengthSnapshot,
  owed: GoalOwedLift[],
  isRuledOut: (id: string) => boolean,
  isPinned: (id: string) => boolean,
  later: SessionBlock[] = [],
  dayHeavyReps: number | null = null,
): AppliedAdaptation[] {
  const g = snap.goalPlanGym;
  if (!g || !owed.length) return [];
  if (goalSeasonOf(snap) !== "build") return [];
  if (snap.verdict === "HOLD" || snap.verdict === "RECOVERY" || snap.verdict === "MODIFIED" || snap.verdict === "REDUCED") return [];
  if (!blocks.some((b) => b.exercises.some((e) => e.category === "COMPOUND_STRENGTH"))) return [];
  const byLift = new Map(owed.map((o) => [o.lift, o]));
  const merged = mergeLifts({
    blocks, later, lifts: owed.map((o) => o.lift), quality: g.quality, week: g.week,
    slotOf: (lift) => byLift.get(lift)?.fromSlot ?? "B",
    yellow: false, isRuledOut, isPinned, dayHeavyReps, giveBack: true, md: snap.mdContext,
  });
  if ("kept" in merged || !merged.lines.length) return [];
  const q = QUALITY_NAME[g.quality];
  return [...zoneAudit(g, merged.zones, snap.mdContext), {
    ruleId: "GOAL_PLAN_GYM_GIVE_BACK",
    triggerEN: `Week rule, 8-week goal (${q.en}, week ${g.week} of ${g.weeksTotal}): the goal day holds fewer sets than the plan says`,
    triggerIS: `Vikuregla, 8 vikna markmið (${q.is}, vika ${g.week} af ${g.weeksTotal}): markmiðsdagurinn rúmar færri sett en áætlunin segir`,
    actionEN: `Also today, the week's other heavy day, in place of the matching team exercise and with its sets: ${merged.lines.join("; ")}. The session does not grow.`,
    actionIS: `Líka í dag, á hinum þunga degi vikunnar, í stað samsvarandi æfingar liðsins og með settum hennar: ${merged.linesIS.join("; ")}. Æfingin lengist ekki.`,
    evidence: GOAL_GIVE_BACK_EVIDENCE,
  }];
}

export const GOAL_NEAR_MATCH_EVIDENCE =
  "Week rule, the player's 8-week goal close to the match. The goal's heavy work stays on the heavy days (MD-4, MD-3); on MD-2 and MD-1 the goal's own lift comes light and fast, with the day's reps, load and bar speed, in place of the team's loaded fast lift, so nothing is added. A small fast dose 6–33 h before competition raised later performance: 15–20 ballistic reps at 30–40% of max (Harrison 2019, 11 small studies, none in footballers). The bar-speed zones are from squat studies (Mann 2015; Otero-Esquina 2017; Pareja-Blanco 2017); none tested a target speed for loaded jumps or pulls. Putting the goal's lift on these days is MicroPulse's rule (the coach's call, 2026-11-20), not from a study.";

/** The goal's lift close to the match: which library lift, and whether it carries a load (a body-weight jump squat
 *  does not, and gets no bar speed). Null = no change (a beginner's technique lift, the youth version, or a goal with
 *  no squat, jump or pull, such as braking's split squat or the Nordic). */
export function nearMatchGoalLift(weekLifts: GoalPlanGymLift[]): { id: string; loaded: boolean; from: GoalPlanGymLift } | null {
  if (weekLifts.some((l) => l.profile === "technique" || l.profile === "youth")) return null;
  const bodyweight = (l: GoalPlanGymLift) => /^bodyweight/i.test(l.intensity ?? "");
  const fast = weekLifts.find((l) => (l.profile === "jump_squat" && !bodyweight(l)) || l.profile === "pull");
  if (fast) {
    const id = fast.profile === "pull" ? (fast.preferId && EXERCISES_BY_ID.has(fast.preferId) ? fast.preferId : "ex_hang_high_pull") : "ex_trap_bar_jump_squat";
    return { id, loaded: true, from: fast };
  }
  const bw = weekLifts.find((l) => l.profile === "jump_squat");
  if (bw) return { id: "ex_trap_bar_jump_squat", loaded: false, from: bw };
  // Heavy only: the same movement, light and fast.
  const heavy = weekLifts.find((l) => l.profile === "heavy" || l.profile === "squat_fast");
  return heavy ? { id: "ex_trap_bar_jump_squat", loaded: true, from: heavy } : null;
}

/**
 * Close to the match (MD-2, MD-1, and a light day in a week without a match; 2026-11-20, the coach's call): a player on
 * a running 8-week goal gets the goal's lift, light and fast, in the place of the team's loaded fast lift (the spot the
 * week rule marked `dose.nearMatch`), with that spot's sets and reps and the day's load and bar-speed zone. Nothing is
 * added. Pre-/off-season only; never on a red day, on a day that holds a goal gym session, in place of a lift a safety
 * rule put there or rules out, or when the lift is already elsewhere in the session. Runs after `finishNearMatch`.
 */
export function applyGoalNearMatch(
  blocks: SessionBlock[],
  snap: PlayerStrengthSnapshot,
  isRuledOut: (id: string) => boolean,
  isPinned: (id: string) => boolean,
  day: NearMatchDay,
): AppliedAdaptation[] {
  const g = snap.goalPlanGym;
  if (!g || g.lifts.length || !g.weekLifts?.length) return [];
  if (goalSeasonOf(snap) !== "build") return [];
  if (snap.verdict === "HOLD" || snap.verdict === "RECOVERY") return [];
  const pick = nearMatchGoalLift(g.weekLifts);
  if (!pick) return [];
  const lib = EXERCISES_BY_ID.get(pick.id);
  if (!lib || isRuledOut(lib.id)) return [];
  let at: { b: number; i: number } | null = null;
  blocks.forEach((blk, b) => blk.exercises.forEach((e, i) => { if (!at && e.dose.nearMatch) at = { b, i }; }));
  if (!at) return []; // the day's method has no loaded fast lift (an isometric or built-in primer): left as it is
  const { b, i } = at as { b: number; i: number };
  const base = blocks[b].exercises[i];
  if (base.isAdaptiveAddition || isPinned(base.exerciseId) || base.goalPlan) return [];
  // Never the same lift twice in one session.
  if (blocks.some((blk, k) => blk.exercises.some((e, j) => (k !== b || j !== i) && e.exerciseId === lib.id))) return [];

  const shaped: PrescribedExercise = { exerciseId: lib.id, nameEN: lib.nameEN, nameIS: lib.nameIS, category: lib.category, dose: base.dose };
  const dose: PrescribedExercise["dose"] = pick.loaded
    ? nearMatchDoseFor(shaped, day, base.dose.sets, Number(base.dose.reps) || 4)
    : (() => {
        const { speedZone: _z, velocityLossCap: _v, ...rest } = base.dose;
        void _z; void _v;
        return { ...rest, intensity: "Bodyweight", cue: "As fast as possible on every rep" };
      })();
  const q = QUALITY_NAME[g.quality];
  blocks[b].exercises[i] = {
    ...shaped,
    dose,
    goalPlan: { quality: g.quality, week: g.week, nearMatch: true },
    modificationReason: `8-week goal (${q.en}), week ${g.week} — the goal's lift, light and fast${base.exerciseId !== lib.id ? `, in place of ${base.nameEN}` : ""}`,
  };
  const z = NEAR_MATCH_ZONE[day];
  const what = `${lib.nameEN} ${dose.sets} × ${dose.reps}`;
  const whatIS = `${lib.nameIS || lib.nameEN} ${dose.sets} × ${dose.reps}`;
  const zEN = dose.speedZone ? speedZoneText(dose.speedZone) : null;
  const zIS = zEN?.replace(/(\d)\.(\d)/g, "$1,$2") ?? null;
  const how = !pick.loaded ? { en: "body weight, as fast as possible", is: "eigin þyngd, eins hratt og hægt er" }
    : zEN && dose.speedZone?.max == null && day === "MD-2" ? { en: `at least ${zEN.replace("≥ ", "")} bar speed`, is: `minnst ${zIS!.replace("≥ ", "")} stangarhraði` }
    : zEN ? { en: `${zEN} (${day === "MD-1" ? "speed" : "speed-strength"} zone)`, is: `${zIS} (${day === "MD-1" ? "speed" : "speed-strength"} svæði)` }
    : { en: `${z.load}, as fast as possible`, is: `${z.load.replace("1RM", "af hámarki")}, eins hratt og hægt er` };
  const inPlace = base.exerciseId !== lib.id ? { en: ` in place of ${base.nameEN}`, is: ` í stað ${base.nameIS || base.nameEN}` } : { en: "", is: "" };
  return [{
    ruleId: "GOAL_PLAN_NEAR_MATCH",
    triggerEN: `8-week goal: ${q.en}, week ${g.week} of ${g.weeksTotal}, close to the match`,
    triggerIS: `8 vikna markmið: ${q.is}, vika ${g.week} af ${g.weeksTotal}, nálægt leik`,
    actionEN: `The goal's lift, light and fast: ${what}${inPlace.en}, ${how.en}. The day's reps, so the session does not grow; the goal's heavy work is on the heavy days.`,
    actionIS: `Lyfta markmiðsins, létt og hröð: ${whatIS}${inPlace.is}, ${how.is}. Endurtekningar dagsins, svo æfingin lengist ekki; þunga vinna markmiðsins er á þungu dögunum.`,
    evidence: GOAL_NEAR_MATCH_EVIDENCE,
  }];
}

/** The snapshot with today's goal-plan gym session on it (individualised sends only). Unchanged when there is none. */
export function withGoalPlanGym<T extends PlayerStrengthSnapshot>(snap: T, gym: GoalPlanGym | null | undefined): T {
  return gym ? { ...snap, goalPlanGym: gym } : snap;
}
