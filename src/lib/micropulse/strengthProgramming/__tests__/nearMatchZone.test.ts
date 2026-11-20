/**
 * The week rule close to the match (2026-11-20, the coach's call): the bar-speed zone of the day, and the player's
 * 8-week goal lift, light and fast, on MD-2 and MD-1.
 *   - MD-2 (and a light day in a week without a match): speed-strength, 1.0–1.3 m/s, start at 40–55%.
 *   - MD-1: speed, 1.3 m/s or faster, start at 30–40%.
 *   - The zone only on a lift with a bar; a pull keeps its own load and takes the zone's lower end as a floor.
 *   - A goal player (pre-/off-season) gets the goal's lift in the day's fast spot; nothing is added.
 */
import { describe, expect, it } from "vitest";
import { buildStrengthSession } from "../index";
import { strengthSessionToTodayStructure } from "../toTodayStructure";
import { rxForPrescribed } from "../todayLiftRx";
import { GOAL_NEAR_MATCH_EVIDENCE, nearMatchGoalLift, type GoalPlanGym, type GoalPlanGymLift } from "../goalPlanGym";
import { NEAR_MATCH_EVIDENCE, NEAR_MATCH_ZONE } from "../weekRule";
import { sanitizeNoMatchWeek } from "../structures";
import type { MdContext, PlayerStrengthSnapshot, StrengthSession } from "../types";
import { buildGoalPlan } from "@/lib/micropulse/goalPlan";
import { goalWeekLifts } from "@/lib/micropulse/goalPlan/gymForSession";
import type { GoalPlanInput, GoalQuality } from "@/lib/micropulse/goalPlan/types";

const MON = "2026-11-16";
const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: MON, mdContext: "MD-2" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  seasonPhase: "preseason", ...over,
});
type S = StrengthSession | null;
const fast = (s: S) => (s?.blocks ?? []).flatMap((b) => b.exercises).find((e) => e.dose.nearMatch) ?? null;
const rule = (s: S, id: string) => (s?.appliedAdaptations ?? []).find((a) => a.ruleId === id);
const on = (md: MdContext, method: string, over: Partial<PlayerStrengthSnapshot> = {}) =>
  buildStrengthSession(snap({ mdContext: md, mdStructures: { [md]: method } as PlayerStrengthSnapshot["mdStructures"], ...over }));

const lift = (profile: GoalPlanGymLift["profile"], over: Partial<GoalPlanGymLift> = {}): GoalPlanGymLift => ({
  profile, nameEN: profile, nameIS: profile, sets: "3", reps: "3", intensity: "30–40% 1RM", rest: "2 min", cue: null, ...over,
});
const goal = (weekLifts: GoalPlanGymLift[], over: Partial<GoalPlanGym> = {}): GoalPlanGym => ({
  planId: "x", quality: "top_speed", week: 3, weeksTotal: 8, labelEN: "", labelIS: "", lifts: [], weekLifts, ...over,
});

describe("the day's bar-speed zone", () => {
  it("MD-2: speed-strength 1.0–1.3 m/s from 40–55%; MD-1: 1.3 m/s or faster from 30–40% (loaded jump squat)", () => {
    const md2 = fast(on("MD-2", "potentiation_cluster"))!;
    expect(md2.exerciseId).toBe("ex_trap_bar_jump_squat");
    expect(md2.dose.speedZone).toEqual({ min: 1.0, max: 1.3 });
    expect(md2.dose.intensity).toBe("40–55% 1RM · 1.0–1.3 m/s");
    expect(md2.dose.velocityLossCap).toBe(10);
    const md1 = fast(on("MD-1", "potentiation_cluster"))!;
    expect(md1.dose.speedZone).toEqual({ min: 1.3, max: null });
    expect(md1.dose.intensity).toBe("30–40% 1RM · ≥ 1.3 m/s");
    expect(NEAR_MATCH_ZONE["MD-2"].zone).toEqual({ min: 1.0, max: 1.3 });
  });

  it("a light day in a week without a match takes the MD-2 zone", () => {
    const s = buildStrengthSession(snap({
      todayIso: "2026-11-19", mdContext: "MD-2", noMatchNearby: true,
      noMatchWeek: sanitizeNoMatchWeek({ mon: "strength", wed: "power", thu: "light" }),
      mdStructures: { "MD-2": "potentiation_cluster" },
    }));
    expect(fast(s)?.dose.speedZone).toEqual({ min: 1.0, max: 1.3 });
  });

  it("a pull keeps its own load and takes the zone's lower end as a floor", () => {
    for (const md of ["MD-2", "MD-1"] as MdContext[]) {
      const ex = fast(on(md, "power_contrast"))!;
      expect(ex.exerciseId).toBe("ex_jump_shrug");
      expect(ex.dose.speedZone).toEqual({ min: md === "MD-2" ? 1.0 : 1.3, max: null });
      expect(ex.dose.intensity).toMatch(/^30–40% 1RM · ≥ /);
    }
  });

  it("no bar, no speed: the team list's dumbbell lift keeps its own load and gets no zone", () => {
    const s = on("MD-1", "potentiation_cluster", { teamPalette: { power_explosive: ["ex_db_snatch"] } });
    const ex = fast(s)!;
    expect(ex.exerciseId).toBe("ex_db_snatch");
    expect(ex.dose.speedZone).toBeUndefined();
    expect(ex.dose.intensity).not.toMatch(/m\/s/);
    expect(ex.dose.velocityLossCap).toBe(10);
    // The "why" names what holds for that lift, not the jump squat's zone.
    expect(rule(s, "WEEK_RULE_NEAR_MATCH")?.actionEN).not.toMatch(/m\/s/);
  });

  it("the team list's own bar lift in the spot gets the zone again (the mark survives the swap)", () => {
    const s = on("MD-2", "power_contrast", { teamPalette: { power_explosive: ["ex_trap_bar_jump_squat", "ex_box_jump"] } });
    const ex = fast(s)!;
    expect(ex.exerciseId).toBe("ex_trap_bar_jump_squat");
    expect(ex.dose.speedZone).toEqual({ min: 1.0, max: 1.3 });
    expect(ex.dose.reps).toBe("3"); // paired with the box jump: 3 rounds of 3 + 3
  });

  it("the why line names the zone, the start load, and what is a study and what is MicroPulse's rule", () => {
    const s = on("MD-2", "potentiation_cluster");
    expect(rule(s, "WEEK_RULE_NEAR_MATCH")?.actionIS).toMatch(/Speed-strength svæði: 1,0–1,3 m\/s, byrjað um 40–55% af hámarki; stangarhraðinn ræður þyngdinni/);
    expect(rule(on("MD-1", "power_contrast"), "WEEK_RULE_NEAR_MATCH")?.actionEN).toMatch(/Bar speed ≥ 1\.3 m\/s \(a pull moves faster/);
    for (const src of ["Mann", "Otero-Esquina 2017", "Pareja-Blanco 2017", "Harrison 2019", "Balsalobre-Fernández 2021", "MicroPulse's rule"]) {
      expect(NEAR_MATCH_EVIDENCE).toContain(src);
    }
  });

  it("the player's card: the zone rides on the item, replaces the 'no target speed' line, and the coach's block card stays off that block", () => {
    const s = on("MD-2", "potentiation_cluster")!;
    const withVbt = { ...s, blockEmphasis: { quality: { en: "Q", is: "Q" }, intent: { en: "I", is: "I" }, vbt: { method: "fixed_set_vl", velocityLossPct: 20 } } } as unknown as StrengthSession;
    const out = strengthSessionToTodayStructure(withVbt, "EN");
    const blk = out.find((b) => b.items.some((i) => i.exerciseId === "ex_trap_bar_jump_squat"))!;
    expect(blk.items.find((i) => i.exerciseId === "ex_trap_bar_jump_squat")?.speedZone).toEqual({ min: 1.0, max: 1.3 });
    expect(blk.vbt).toBeUndefined();
    // A heavy day's block still takes the coach's card.
    const heavy = { ...on("MD-4", "contrast")!, blockEmphasis: withVbt.blockEmphasis } as StrengthSession;
    expect(strengthSessionToTodayStructure(heavy, "EN").some((b) => b.vbt)).toBe(true);
    const rx = rxForPrescribed(fast(s)!, null, "EN")!;
    const target = rx.barSpeed.find((x) => x.key === "target")!;
    expect(target.line.text.en).toMatch(/1\.0–1\.3 m\/s on each rep\. Faster: add weight\. Slower: take weight off\./);
    expect(rx.barSpeed.some((x) => /No target speed/.test(x.line.text.en))).toBe(false);
    const rxIS = rxForPrescribed(fast(on("MD-1", "potentiation_cluster"))!, null, "IS")!;
    expect(rxIS.barSpeed.find((x) => x.key === "target")!.line.text.is).toMatch(/1,3 m\/s eða hraðar/);
  });

  it("heavy days, standard mode and basketball get no zone", () => {
    expect(fast(on("MD-4", "contrast"))).toBeNull();
    expect(fast(buildStrengthSession(snap({ mdStructures: { "MD-2": "potentiation_cluster" } }), [], { mode: "standard" }))).toBeNull();
    expect(fast(on("MD-2", "potentiation_cluster", { sport: "basketball" }))).toBeNull();
  });
});

describe("the goal's lift on MD-2 and MD-1", () => {
  it("a loaded pull in the goal: that lift, in the team's fast spot, with the day's reps and floor", () => {
    for (const md of ["MD-2", "MD-1"] as MdContext[]) {
      const s = on(md, "potentiation_cluster", { goalPlanGym: goal([lift("heavy"), lift("pull", { preferId: "ex_hang_high_pull" })]) });
      const ex = fast(s)!;
      expect(ex.exerciseId, md).toBe("ex_hang_high_pull");
      expect([ex.dose.sets, ex.dose.reps]).toEqual([4, "4"]);
      expect(ex.dose.speedZone).toEqual({ min: md === "MD-2" ? 1.0 : 1.3, max: null });
      expect(ex.goalPlan).toMatchObject({ quality: "top_speed", week: 3, nearMatch: true });
      const a = rule(s, "GOAL_PLAN_NEAR_MATCH")!;
      expect(a.actionEN).toMatch(/Hang high pull 4 × 4 in place of Trap-bar jump squat/i);
      expect(a.evidence).toBe(GOAL_NEAR_MATCH_EVIDENCE);
      // Nothing added: one fast lift, as for a teammate.
      const all = (x: S) => (x?.blocks ?? []).flatMap((b) => b.exercises).length;
      expect(all(s)).toBe(all(on(md, "potentiation_cluster")));
    }
  });

  it("heavy only: the loaded jump squat, light and fast, in the day's zone", () => {
    const ex = fast(on("MD-2", "power_contrast", { goalPlanGym: goal([lift("heavy")]) }))!;
    expect(ex.exerciseId).toBe("ex_trap_bar_jump_squat");
    expect(ex.dose.intensity).toBe("40–55% 1RM · 1.0–1.3 m/s");
    expect(ex.dose.reps).toBe("3"); // paired with the box jump
  });

  it("a body-weight jump squat: no load, no bar speed", () => {
    const ex = fast(on("MD-1", "power_contrast", { goalPlanGym: goal([lift("jump_squat", { intensity: "Bodyweight" })]) }))!;
    expect(ex.exerciseId).toBe("ex_trap_bar_jump_squat");
    expect(ex.dose.intensity).toBe("Bodyweight");
    expect(ex.dose.speedZone).toBeUndefined();
    expect(ex.dose.velocityLossCap).toBeUndefined();
  });

  it("the card never reads it as the plan's session (no goal tick), but tells the player it is their goal", () => {
    const s = on("MD-2", "potentiation_cluster", { goalPlanGym: goal([lift("pull", { preferId: "ex_jump_shrug" })]) })!;
    const items = strengthSessionToTodayStructure(s, "EN").flatMap((b) => b.items);
    const it = items.find((i) => i.exerciseId === "ex_jump_shrug")!;
    expect(it.goalPlan).toBeUndefined();
    expect(it.note).toMatch(/Your 8-week goal: top speed, week 3/);
  });

  it("no change: a beginner's technique lift, the youth version, braking's split squat or the Nordic only", () => {
    expect(nearMatchGoalLift([lift("technique"), lift("jump_squat")])).toBeNull();
    expect(nearMatchGoalLift([lift("youth")])).toBeNull();
    expect(nearMatchGoalLift([lift("eccentric")])).toBeNull();
    expect(nearMatchGoalLift([lift("nordic"), lift("rdl")])).toBeNull();
    const s = on("MD-2", "potentiation_cluster", { goalPlanGym: goal([lift("technique")]) });
    expect(fast(s)?.exerciseId).toBe("ex_trap_bar_jump_squat");
    expect(rule(s, "GOAL_PLAN_NEAR_MATCH")).toBeUndefined();
  });

  it("no change in season, on a red day, on a day with a goal gym session, or with the built-in primer", () => {
    const g = goal([lift("pull", { preferId: "ex_hang_high_pull" })]);
    const none = (s: S) => expect(rule(s, "GOAL_PLAN_NEAR_MATCH")).toBeUndefined();
    none(on("MD-2", "potentiation_cluster", { goalPlanGym: g, seasonPhase: "inseason" }));
    none(on("MD-2", "potentiation_cluster", { goalPlanGym: g, goalSeason: { phase: "competitive", blockGoal: null } }));
    none(on("MD-2", "potentiation_cluster", { goalPlanGym: g, verdict: "RECOVERY" }));
    none(on("MD-2", "potentiation_cluster", { goalPlanGym: { ...g, lifts: [lift("heavy")], slot: "B" } }));
    none(buildStrengthSession(snap({ goalPlanGym: g })));
  });

  it("never the same lift twice: the goal's lift already elsewhere in the session leaves the spot as it is", () => {
    // Power contrast pairs the jump shrug with a jump; a goal pull of the same jump shrug is already there.
    const s = on("MD-2", "power_contrast", { goalPlanGym: goal([lift("pull", { preferId: "ex_jump_shrug" })]) });
    expect((s?.blocks ?? []).flatMap((b) => b.exercises).filter((e) => e.exerciseId === "ex_jump_shrug")).toHaveLength(1);
  });
});

describe("the goal's lifts of the week (loader)", () => {
  const input = (q: GoalQuality): GoalPlanInput => ({
    quality: q, todayIso: "2026-11-13", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
    unavailable: false, inSeason: false, topSpeed: null, sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null,
  });
  it("every goal's week has the lifts the fast lift is chosen from", () => {
    const want: Record<GoalQuality, boolean> = {
      top_speed: true, acceleration: true, jump: true, braking: false, max_strength: true, explosive: true, strength_power: true,
    };
    for (const q of Object.keys(want) as GoalQuality[]) {
      const lifts = goalWeekLifts(buildGoalPlan(input(q)), 3);
      expect(lifts.length, q).toBeGreaterThan(0);
      expect(nearMatchGoalLift(lifts) != null, q).toBe(want[q]);
    }
  });
});
