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
import { placementFor, planWeekOn, teamDaysOfWeek, type TeamCalendar } from "./today";
import { swapMark } from "./swaps";
import { isGymQuality, type GoalBlock, type GoalPlan, type GoalQuality, type GoalSession, type GoalSessionSlot } from "./types";
import type { GoalGymProfile, GoalPlanGym, GoalPlanGymLift } from "@/lib/micropulse/strengthProgramming/goalPlanGym";

/** A pull swap names its lift (Programme Library, lota 6). */
const PULL_ID: Record<string, string> = { jump_shrug: "ex_jump_shrug", hang_high_pull: "ex_hang_high_pull" };

const GYM_PROFILES = new Set<GoalGymProfile>(["heavy", "technique", "rdl", "jump_squat", "pull", "nordic", "eccentric", "squat_fast", "youth"]);

/** The rest line in the engine's own form ("3 min", "90s", "90s–2 min"); null when it gives no time (Nordic: the
 *  partner's set). Seconds were missed before 2026-11-18, so the braking split squat got the default 2 min, not 90 s. */
function restOf(en: string): string | null {
  const both = /(\d+) s–(\d+(?:–\d+)?) min/.exec(en);
  if (both) return `${both[1]}s–${both[2]} min`;
  const min = /(\d+(?:–\d+)?) min/.exec(en)?.[1];
  if (min) return `${min} min`;
  const sec = /(\d+) s\b/.exec(en)?.[1];
  return sec ? `${sec}s` : null;
}

function liftOf(b: GoalBlock, rx: LiftRx): GoalPlanGymLift | null {
  if (!GYM_PROFILES.has(rx.profile as GoalGymProfile)) return null;
  const profile = rx.profile as GoalGymProfile;
  const doseEn = b.dose.en;
  const loadEn = rx.rows.load?.text.en ?? "";
  const pct = /(\d+(?:–\d+)?)% of (?:the squat |your )?max/.exec(doseEn)?.[1] ?? /(\d+(?:–\d+)?)% of (?:the squat |your )?max/.exec(loadEn)?.[1] ?? null;
  const rir = /(\d+(?:–\d+)?) reps? in reserve/.exec(doseEn)?.[1] ?? /could lift (\d+(?:–\d+)?) more times/.exec(loadEn)?.[1] ?? null;
  const ms = /about (\d\.\d) m\/s/.exec(doseEn)?.[1] ?? null;
  // "Bodyweight" is the engine's own word (exerciseLibrary); without it the body-weight jump squats showed no load. The
  // load line is read too (2026-11-18): the braking split squat ("Body weight or light dumbbells") showed no load.
  const sameAs = /the same weight as (last week|last time or less)/i.exec(loadEn)?.[1] ?? null;
  const intensity = pct ? `${pct}% 1RM`
    : rir ? `RIR ${rir}`
    : ms ? `${ms} m/s`
    : /^Body weight or light dumbbells/.test(loadEn) ? "Bodyweight or light DBs"
    : /body weight/i.test(doseEn) || /^Body weight\b/.test(loadEn) ? "Bodyweight"
    // A light week with no number in the plan (the fast squat's week 7): the load is last week's.
    : sameAs ? `Same weight as ${sameAs}`
    : null;
  const eachLeg = /each leg/.test(doseEn);
  const down = /(\d+) s down/.exec(doseEn)?.[1] ?? null;
  const weaker = /a 4th set on the (left|right) leg/.exec(doseEn)?.[1] ?? null;
  const same = sameAs && intensity !== `Same weight as ${sameAs}` ? sameAs : null;
  const cue = [
    profile === "jump_squat" || profile === "pull" || profile === "squat_fast" ? "as fast as possible" : null,
    down ? `${down} s down` : null,
    weaker ? `4th set on the ${weaker} leg` : null,
    same ? `same weight as ${same}` : null,
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
    rest: restOf(rx.rows.rest?.text.en ?? ""),
    cue,
  };
}

/** The gym lifts of one plan session (week · slot), or null when it holds none. */
export function gymLiftsOf(plan: GoalPlan, week: number, slot: GoalSessionSlot): { session: GoalSession; lifts: GoalPlanGymLift[] } | null {
  const sessions = withRx({ weeks: [{ sessions: plan.weeks.find((w) => w.week === week)?.sessions ?? [] }] }, rxContextOf(plan)).weeks[0].sessions;
  const session = sessions.find((s) => s.slot === slot);
  if (!session) return null;
  const lifts = session.blocks.flatMap((blk) => (blk.rx ?? []).map((rx) => liftOf(blk, rx))).filter((l): l is GoalPlanGymLift => !!l);
  return lifts.length ? { session, lifts } : null;
}

/** The goal's gym lifts in one plan week, all its sessions (A, B, C) in order, each kind once. */
export function goalWeekLifts(plan: GoalPlan, week: number): GoalPlanGymLift[] {
  const slots = (plan.weeks.find((w) => w.week === week)?.sessions ?? []).map((s) => s.slot);
  const out: GoalPlanGymLift[] = [];
  for (const slot of slots) {
    for (const l of gymLiftsOf(plan, week, slot)?.lifts ?? []) if (!out.some((o) => o.profile === l.profile)) out.push(l);
  }
  return out;
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
  // Placed as in pre-/off-season ("build"): the only season the lifts go into the strength session (the engine checks
  // the season itself), so the days match the card's (2026-11-20, the heavy-day rule).
  const gymSessions = (placementFor(plan, quality, startDate, todayIso, args.cal, "build")?.placed ?? []).filter((p) => gymOnly || p.slot === "B");
  const placed = gymSessions.find((p) => p.date === todayIso) ?? null;
  if (!placed) {
    // No goal gym session today. When the week holds one on another day, the engine may give back today the sets that
    // day cannot hold (week rule, 2026-11-19): it gets those sessions and the week's team days, and decides by rule.
    // The goal's lifts this week go too (2026-11-20): close to the match (MD-2, MD-1, which the placement never uses)
    // the engine puts the goal's lift, light and fast, in the day's fast spot. Whether today is such a day, and whether
    // the team lifts, is the engine's call (it knows the day's method); here only the plan is read.
    const weekDays = teamDaysOfWeek(todayIso, args.cal);
    const sessions = weekDays.some((d) => d.date === todayIso)
      ? gymSessions.flatMap((p) => {
          const lifts = gymLiftsOf(plan, week, p.slot)?.lifts ?? [];
          return lifts.length ? [{ slot: p.slot, date: p.date, md: p.md, lifts }] : [];
        })
      : [];
    const weekLifts = goalWeekLifts(plan, week);
    if (!sessions.length && !weekLifts.length) return null;
    return {
      planId: args.planId, quality, week, weeksTotal: PLAN_WEEKS, labelEN: "", labelIS: "", lifts: [],
      ...(sessions.length ? { giveBack: { sessions, weekDays } } : {}),
      ...(weekLifts.length ? { weekLifts } : {}),
    };
  }
  const read = gymLiftsOf(plan, week, placed.slot);
  if (!read) return null;
  const { session: b, lifts } = read;
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
