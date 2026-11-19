/**
 * The week rule and the player's 8-week goal (2026-11-19).
 *   1. A heavy goal lift in the day's heavy spot gets the sets the day's heavy reps hold at the plan's reps a set,
 *      never more: a goal does not lift a day above the week's reps.
 *   2. A goal lift that could not get all its sets on its goal day is done again on ONE other heavy day of the week,
 *      in place of the matching team exercise and with its sets. Forward only, by rule; no session grows.
 */
import { describe, expect, it } from "vitest";
import { buildStrengthSession } from "../index";
import { strengthSessionToTodayStructure } from "../toTodayStructure";
import { GOAL_GIVE_BACK_EVIDENCE, type GoalPlanGym, type GoalPlanGymLift } from "../goalPlanGym";
import { isHeavyLift } from "../weekRule";
import { sanitizeNoMatchWeek } from "../structures";
import type { MdContext, PlayerStrengthSnapshot } from "../types";
import { addDays } from "@/lib/micropulse/goalPlan/today";

const MON = "2026-11-16";
const day = (i: number) => addDays(MON, i);
const METHODS = { "MD-5": "contrast", "MD-4": "french_contrast", "MD-3": "contrast" } as const;
const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: day(1), mdContext: "MD-4" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  seasonPhase: "preseason", goalSeason: { phase: "preseason", blockGoal: "transmute" }, mdStructures: METHODS, ...over,
});
type S = ReturnType<typeof buildStrengthSession>;
const all = (s: S) => (s?.blocks ?? []).flatMap((b) => b.exercises);
const goalLifts = (s: S) => all(s).filter((e) => e.goalPlan);
const rule = (s: S, id: string) => (s?.appliedAdaptations ?? []).find((a) => a.ruleId === id);
const reps = (s: S) => all(s).filter(isHeavyLift).reduce((n, e) => n + e.dose.sets * Number(/^\d+/.exec(e.dose.reps)![0]), 0);

const heavy = (sets: string, r: string): GoalPlanGymLift => ({ profile: "heavy", nameEN: "Squat or trap-bar deadlift", nameIS: "Hnébeygja eða trap bar", sets, reps: r, intensity: "80–85% 1RM", rest: "3 min", cue: null });
const jumpSquat = (sets: string): GoalPlanGymLift => ({ profile: "jump_squat", nameEN: "Light jump squats", nameIS: "Hnébeygjuhopp", sets, reps: "5", intensity: "30–45% 1RM", rest: "3 min", cue: "as fast as possible" });
const gym = (lifts: GoalPlanGymLift[], over: Partial<GoalPlanGym> = {}): GoalPlanGym => ({ planId: "x", quality: "explosive", slot: "A", week: 2, weeksTotal: 8, labelEN: "", labelIS: "", lifts, ...over });

/** A week with a match on Saturday: Mon MD-5, Tue MD-4, Wed MD-3, Thu MD-2. */
const WEEK = [{ date: day(0), md: "MD-5" }, { date: day(1), md: "MD-4" }, { date: day(2), md: "MD-3" }, { date: day(3), md: "MD-2" }];
/** The goal day is Monday (MD-5): its contrast pair holds 2 rounds, 6 heavy reps. */
const mondayGoal = (lifts: GoalPlanGymLift[]) => gym([], { slot: undefined, giveBack: { sessions: [{ slot: "A", date: day(0), md: "MD-5", lifts }], weekDays: WEEK } });

describe("a heavy goal lift inside the day's heavy reps", () => {
  it("3 × 6 into a day of 9 heavy reps is 2 × 6, and the pair's jump follows the rounds", () => {
    const s = buildStrengthSession(snap({ todayIso: day(2), mdContext: "MD-3", goalPlanGym: gym([heavy("3", "6")], { slot: "B" }) }));
    const lift = goalLifts(s)[0];
    expect(`${lift.dose.sets} × ${lift.dose.reps}`).toBe("2 × 6");
    expect(all(s).find((e) => e.category === "PLYOMETRIC")!.dose.sets).toBe(2);
    expect(rule(s, "GOAL_PLAN_GYM_MERGED")!.actionEN).toMatch(/2 sets: today holds 9 heavy reps by the week rule; the plan says 3/);
    expect(rule(s, "GOAL_PLAN_GYM_MERGED")!.actionIS).toMatch(/9 þungar endurtekningar eftir vikureglunni/);
  });

  it("the day's reps by the rule count, not a round cap: 3 × 4 on MD-4 (12 reps, French contrast 3 rounds)", () => {
    const s = buildStrengthSession(snap({ goalPlanGym: gym([heavy("3", "4")]) }));
    expect(`${goalLifts(s)[0].dose.sets} × ${goalLifts(s)[0].dose.reps}`).toBe("3 × 4");
    expect(reps(s)).toBe(12);
  });

  it("a plan with fewer sets than the day holds keeps the plan's sets, and the team's jumps keep their rounds", () => {
    const s = buildStrengthSession(snap({ goalPlanGym: gym([heavy("2", "3")]) }));
    expect(`${goalLifts(s)[0].dose.sets} × ${goalLifts(s)[0].dose.reps}`).toBe("2 × 3");
    expect(all(s).find((e) => e.category === "PLYOMETRIC")!.dose.sets).toBe(3);
  });

  it("a range is read at its middle: 3 × 3–5 into 6 heavy reps is 2 sets", () => {
    const s = buildStrengthSession(snap({ todayIso: day(0), mdContext: "MD-5", goalPlanGym: gym([heavy("3–4", "3–5")]) }));
    expect(`${goalLifts(s)[0].dose.sets} × ${goalLifts(s)[0].dose.reps}`).toBe("2 × 3-5");
  });

  it("never more rounds than a French contrast holds", () => {
    const s = buildStrengthSession(snap({ goalPlanGym: gym([heavy("5", "2")]) }));
    expect(goalLifts(s)[0].dose.sets).toBe(3);
  });
});

describe("the give-back day", () => {
  it("lifts cut on the goal day are done again on MD-4, in place of the team's exercises, with their sets", () => {
    const s = buildStrengthSession(snap({ goalPlanGym: mondayGoal([jumpSquat("3"), heavy("3", "4")]) }));
    const got = goalLifts(s);
    expect(got.map((e) => `${e.category} ${e.dose.sets} × ${e.dose.reps}`).sort()).toEqual(["BALLISTIC 3 × 5", "COMPOUND_STRENGTH 3 × 4"]);
    expect(got.every((e) => e.goalPlan!.giveBack === true && e.goalPlan!.slot === "A")).toBe(true);
    // Nothing added: the same number of exercises as without the goal, and the heavy reps are the day's.
    const plain = buildStrengthSession(snap());
    expect(all(s).length).toBe(all(plain).length);
    expect(reps(s)).toBe(12);
    const a = rule(s, "GOAL_PLAN_GYM_GIVE_BACK")!;
    expect(a.actionEN).toMatch(/in place of the matching team exercise/);
    expect(a.actionIS).toMatch(/Æfingin lengist ekki/);
    expect(a.evidence).toBe(GOAL_GIVE_BACK_EVIDENCE);
    expect(GOAL_GIVE_BACK_EVIDENCE).toMatch(/MicroPulse's rule/);
  });

  it("a contrast block keeps one number of rounds: 6 reps a set makes 2 rounds, and the goal's jump takes them too", () => {
    // Session B on MD-3 (9 heavy reps): 3 × 6 becomes 2 × 6 there, so a set is owed; the jump squat is cut to 2 rounds.
    const g = gym([], { slot: undefined, giveBack: { sessions: [{ slot: "B", date: day(2), md: "MD-3", lifts: [jumpSquat("4"), heavy("3", "6")] }], weekDays: WEEK } });
    const s = buildStrengthSession(snap({ goalPlanGym: g }));
    const block = s!.blocks.find((b) => b.type === "FRENCH_CONTRAST")!;
    expect(block.exercises.map((e) => e.dose.sets)).toEqual([2, 2, 2, 2]);
    expect(goalLifts(s).map((e) => `${e.dose.sets} × ${e.dose.reps}`).sort()).toEqual(["2 × 5", "2 × 6"]);
    expect(reps(s)).toBe(12);
    // What is said keeps the plan's order: the jump squat first.
    expect(rule(s, "GOAL_PLAN_GYM_GIVE_BACK")!.actionEN).toMatch(/Trap-bar jump squat 2 × 5.*Trap-bar deadlift 2 × 6/);
  });

  it("only one day gives back: the heavy day with the most reps (MD-4), not MD-3", () => {
    const g = mondayGoal([jumpSquat("3"), heavy("3", "4")]);
    const md3 = buildStrengthSession(snap({ todayIso: day(2), mdContext: "MD-3", goalPlanGym: g }));
    expect(goalLifts(md3)).toEqual([]);
    expect(rule(md3, "GOAL_PLAN_GYM_GIVE_BACK")).toBeUndefined();
  });

  it("nothing owed, nothing given back", () => {
    // The goal day (MD-5: 2 rounds, 6 heavy reps) holds a plan of 2 sets each.
    const s = buildStrengthSession(snap({ goalPlanGym: mondayGoal([jumpSquat("2"), heavy("2", "3")]) }));
    expect(goalLifts(s)).toEqual([]);
  });

  it("only the lift that was cut comes back", () => {
    const s = buildStrengthSession(snap({ goalPlanGym: mondayGoal([jumpSquat("4"), heavy("2", "3")]) }));
    expect(goalLifts(s).map((e) => e.category)).toEqual(["BALLISTIC"]);
  });

  it("a goal session on a light day is done from the card in full: nothing is owed", () => {
    const g = gym([], { slot: undefined, giveBack: { sessions: [{ slot: "B", date: day(3), md: "MD-2", lifts: [heavy("3", "4")] }], weekDays: WEEK } });
    expect(goalLifts(buildStrengthSession(snap({ goalPlanGym: g })))).toEqual([]);
  });

  it("not on a light day, a yellow or red day, or in season", () => {
    const g = mondayGoal([jumpSquat("3"), heavy("3", "4")]);
    expect(goalLifts(buildStrengthSession(snap({ todayIso: day(3), mdContext: "MD-2", goalPlanGym: g })))).toEqual([]);
    expect(goalLifts(buildStrengthSession(snap({ verdict: "MODIFIED", goalPlanGym: g })))).toEqual([]);
    expect(goalLifts(buildStrengthSession(snap({ verdict: "RECOVERY", goalPlanGym: g })))).toEqual([]);
    expect(goalLifts(buildStrengthSession(snap({ seasonPhase: "inseason", goalSeason: { phase: "competitive", blockGoal: "realize" }, goalPlanGym: g })))).toEqual([]);
  });

  it("standard mode takes nothing from the goal", () => {
    const s = buildStrengthSession(snap({ goalPlanGym: mondayGoal([jumpSquat("3"), heavy("3", "4")]) }), [], { mode: "standard" });
    expect(goalLifts(s)).toEqual([]);
  });

  it("the goal card does not read the give-back day as the plan's session", () => {
    const s = buildStrengthSession(snap({ goalPlanGym: mondayGoal([jumpSquat("3"), heavy("3", "4")]) }))!;
    const items = strengthSessionToTodayStructure(s, "EN").flatMap((b) => b.items);
    expect(items.some((i) => i.goalPlan)).toBe(false);
    expect(items.filter((i) => /Your 8-week goal/.test(i.note ?? "")).length).toBe(2);
  });

  it("a week without a match: the heavy day with no goal session gives back", () => {
    // Mon strength (goal day), Wed power, Fri strength. Pre-season 21 reps over three heavy days: 9 / 6 / 6.
    const noMatchWeek = sanitizeNoMatchWeek({ mon: "strength", wed: "power", fri: "strength" });
    const weekDays = [0, 2, 4].map((i) => ({ date: day(i), md: null }));
    const g = gym([], { slot: undefined, giveBack: { sessions: [{ slot: "A", date: day(0), md: null, lifts: [heavy("4", "4")] }], weekDays } });
    const at = (i: number) => buildStrengthSession(snap({ todayIso: day(i), mdContext: "MD-3", noMatchNearby: true, noMatchWeek, mdStructures: { "MD-4": "straight_sets", "MD-3": "contrast" }, goalPlanGym: g }));
    // Monday holds 9 heavy reps: 2 × 4 of the plan's 4 × 4. Friday (the other strength day, 6 reps) and Wednesday
    // (power, 6 reps) hold the same: the earlier one gives back.
    expect(goalLifts(at(2)).map((e) => `${e.dose.sets} × ${e.dose.reps}`)).toEqual(["2 × 4"]);
    expect(goalLifts(at(4))).toEqual([]);
  });
});
