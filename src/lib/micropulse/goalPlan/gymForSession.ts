/**
 * "One session, one whole" (2026-11-17). Pure and client-safe.
 *
 * Reads the gym lifts of today's goal session from a player's 8-week goal plan, for the strength engine to place in the
 * team strength session (`strengthProgramming/goalPlanGym.ts`). Only on the day the plan's rules place it
 * (`placementFor`: never MD, MD-1 or MD+1, at least 2 days apart). The pitch goals merge session B only (session A is
 * the running session); the gym-only goals (2026-11-18) merge whichever of their two sessions falls today. Each lift's numbers come from the plan's
 * own lines (`withRx`): sets × reps from the dose, % of max / rest / tempo from the lift's prescription.
 *
 * The non-lift blocks of session B (bounds, braking drills) are not here: they stay on the goal card.
 */

import { PLAN_WEEKS } from "./common";
import { rxContextOf, withRx, type LiftRx } from "./liftRx";
import { placementFor, planWeekOn, type TeamCalendar } from "./today";
import { swapMark } from "./swaps";
import { isGymQuality, type GoalBlock, type GoalPlan, type GoalQuality } from "./types";
import type { GoalGymProfile, GoalPlanGym, GoalPlanGymLift } from "@/lib/micropulse/strengthProgramming/goalPlanGym";

/** A pull swap names its lift (Programme Library, lota 6). */
const PULL_ID: Record<string, string> = { jump_shrug: "ex_jump_shrug", hang_high_pull: "ex_hang_high_pull" };

const GYM_PROFILES = new Set<GoalGymProfile>(["heavy", "technique", "rdl", "jump_squat", "pull", "nordic", "eccentric", "squat_fast", "youth"]);

function liftOf(b: GoalBlock, rx: LiftRx): GoalPlanGymLift | null {
  if (!GYM_PROFILES.has(rx.profile as GoalGymProfile)) return null;
  const profile = rx.profile as GoalGymProfile;
  const doseEn = b.dose.en;
  const loadEn = rx.rows.load?.text.en ?? "";
  const pct = /(\d+(?:–\d+)?)% of (?:the squat |your )?max/.exec(doseEn)?.[1] ?? /(\d+(?:–\d+)?)% of (?:the squat |your )?max/.exec(loadEn)?.[1] ?? null;
  const rir = /(\d+(?:–\d+)?) reps? in reserve/.exec(doseEn)?.[1] ?? null;
  const ms = /about (\d\.\d) m\/s/.exec(doseEn)?.[1] ?? null;
  // "Bodyweight" is the engine's own word (exerciseLibrary); without it the body-weight jump squats showed no load.
  const intensity = pct ? `${pct}% 1RM` : rir ? `RIR ${rir}` : ms ? `${ms} m/s` : /body weight/.test(doseEn) ? "Bodyweight" : null;
  const restMin = /(\d+(?:–\d+)?) min/.exec(rx.rows.rest?.text.en ?? "")?.[1] ?? null;
  const eachLeg = /each leg/.test(doseEn);
  const down = /(\d+) s down/.exec(doseEn)?.[1] ?? null;
  const weaker = /a 4th set on the (left|right) leg/.exec(doseEn)?.[1] ?? null;
  const cue = [
    profile === "jump_squat" || profile === "pull" || profile === "squat_fast" ? "as fast as possible" : null,
    down ? `${down} s down` : null,
    weaker ? `4th set on the ${weaker} leg` : null,
  ].filter(Boolean).join(" · ") || null;
  const swap = swapMark(b)?.option;
  return {
    profile,
    ...(profile === "pull" && swap && PULL_ID[swap] ? { preferId: PULL_ID[swap] } : {}),
    nameEN: rx.exercise.en,
    nameIS: rx.exercise.is,
    sets: rx.sets,
    reps: eachLeg ? `${rx.reps} each leg` : rx.reps,
    intensity,
    rest: restMin ? `${restMin} min` : null,
    cue,
  };
}

/** Today's goal-session gym lifts, or null (no plan running, no gym session today, or it holds no gym lift). */
export function goalPlanGymFor(args: {
  planId: string;
  quality: GoalQuality;
  plan: GoalPlan;
  startDate: string;
  todayIso: string;
  cal: TeamCalendar;
}): GoalPlanGym | null {
  const { plan, quality, startDate, todayIso } = args;
  if (plan.status !== "ok") return null;
  const week = planWeekOn(startDate, todayIso);
  if (week < 1 || week > PLAN_WEEKS) return null;
  const gymOnly = isGymQuality(quality);
  const placed = placementFor(plan, quality, startDate, todayIso, args.cal)?.placed.find((p) => p.date === todayIso && (gymOnly || p.slot === "B")) ?? null;
  if (!placed) return null;
  const sessions = withRx({ weeks: [{ sessions: plan.weeks.find((w) => w.week === week)?.sessions ?? [] }] }, rxContextOf(plan)).weeks[0].sessions;
  const b = sessions.find((s) => s.slot === placed.slot);
  if (!b) return null;
  const lifts = b.blocks.flatMap((blk) => (blk.rx ?? []).map((rx) => liftOf(blk, rx))).filter((l): l is GoalPlanGymLift => !!l);
  if (!lifts.length) return null;
  return {
    planId: args.planId,
    quality,
    slot: placed.slot,
    week,
    weeksTotal: PLAN_WEEKS,
    labelEN: b.focus.en,
    labelIS: b.focus.is,
    lifts,
  };
}
