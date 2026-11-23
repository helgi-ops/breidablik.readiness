/**
 * Brief §4a (2026-11-23): the gym-only goals keep their research doses and get the coach's additions — Maximal
 * strength's heavy day an isometric mid-thigh pull and a one-leg lift, Explosive power a fast isometric pull and low
 * drop jumps (20–30 cm) — and the coach's bar-speed zones per day (MD-4 / MD-3). Strength + power has no zones.
 */
import { describe, expect, it } from "vitest";
import { buildGoalPlan } from "../index";
import { gymLiftsOf } from "../gymForSession";
import { rxForBlock } from "../liftRx";
import { isAllGymSession } from "../today";
import { JUMP_BLOCKS } from "../jump";
import type { GoalPlanInput, GoalQuality, GoalSessionSlot } from "../types";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import { GOAL_SPEED_ZONE_EVIDENCE, goalZoneDay, withGoalPlanGym, type GoalPlanGym } from "@/lib/micropulse/strengthProgramming/goalPlanGym";
import type { PaletteSlots } from "@/lib/micropulse/strengthProgramming/palette";
import type { MdContext, PlayerStrengthSnapshot, PrescribedExercise, StrengthSession } from "@/lib/micropulse/strengthProgramming/types";

const input = (q: GoalQuality, over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: q, todayIso: "2026-11-13", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: false, topSpeed: null, sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null, ...over,
});

/** Week 2 (no test blocks): the plan session's gym lifts as the engine gets them. */
const gymOf = (q: GoalQuality, slot: GoalSessionSlot, over: Partial<GoalPlanInput> = {}): GoalPlanGym => {
  const r = gymLiftsOf(buildGoalPlan(input(q, over)), 2, slot)!;
  return { planId: "x", quality: q, slot, week: 2, weeksTotal: 8, labelEN: r.session.focus.en, labelIS: r.session.focus.is, lifts: r.lifts };
};

const PALETTE: PaletteSlots = {
  isometric: ["ex_imtp_iso"],
  upper_body: ["ex_db_bench_press"],
  power_explosive: ["ex_box_jump", "ex_depth_jump"],
  bilateral_strength: ["ex_hip_thrust", "ex_back_squat"],
  unilateral_strength: ["ex_reverse_lunge"],
};
const snap = (md: MdContext, over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: "2027-01-05", mdContext: md, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  teamPalette: PALETTE, seasonPhase: null, goalSeason: { phase: "preseason", blockGoal: "transmute" }, ...over,
});
const goalEx = (s: StrengthSession | null): PrescribedExercise[] => (s?.blocks ?? []).flatMap((b) => b.exercises).filter((e) => e.goalPlan);
const byId = (s: StrengthSession | null, id: string) => goalEx(s).find((e) => e.exerciseId === id);
const rule = (s: StrengthSession | null, id: string) => s?.appliedAdaptations.find((a) => a.ruleId === id);

describe("the plans", () => {
  it("Maximal strength's heavy day: the heavy lift, then the isometric pull and the one-leg lift — all gym lifts, so it still goes in whole", () => {
    const plan = buildGoalPlan(input("max_strength"));
    const g = gymOf("max_strength", "A");
    expect(g.lifts.map((l) => l.profile)).toEqual(["heavy", "iso_pull", "single_leg"]);
    const iso = g.lifts[1];
    expect(iso).toMatchObject({ reps: "3s", intensity: "Max effort", rest: "2 min", optional: true });
    expect(g.lifts[2]).toMatchObject({ reps: "6 each leg", intensity: "RIR 2–3", optional: true });
    expect(g.lifts[0].optional).toBeUndefined();
    expect(isAllGymSession(plan, plan.weeks[1].sessions[0])).toBe(true);
    // 5 s holds from week 3.
    expect(gymLiftsOf(plan, 3, "A")!.lifts.find((l) => l.profile === "iso_pull")!.reps).toBe("5s");
    // Session B (the lighter day) is unchanged.
    expect(gymOf("max_strength", "B").lifts.map((l) => l.profile)).toEqual(["heavy"]);
  });

  it("Explosive power: a fast isometric pull on day 1, low drop jumps on day 2 (box 20 → 30 cm, never higher)", () => {
    const plan = buildGoalPlan(input("explosive"));
    expect(gymOf("explosive", "A").lifts.map((l) => l.profile)).toEqual(["jump_squat", "heavy", "iso_pull"]);
    expect(gymOf("explosive", "A").lifts[2].cue).toMatch(/as fast as possible/);
    const b = gymOf("explosive", "B");
    expect(b.lifts.map((l) => l.profile)).toEqual(["jump_squat", "drop_jump"]);
    expect(b.lifts[1]).toMatchObject({ sets: "3", reps: "3", intensity: "Bodyweight", optional: true });
    expect(b.lifts[1].cue).toContain("box 20 cm");
    expect(isAllGymSession(plan, plan.weeks[1].sessions[1])).toBe(true);
    const boxes = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks)).filter((x) => x.method === "drop_jumps").map((x) => Number(/(\d+) cm/.exec(x.dose.en)![1]));
    expect(boxes.length).toBeGreaterThan(0);
    expect(Math.max(...boxes)).toBe(30);
  });

  it("under 18: no additions; Strength + power: unchanged", () => {
    for (const q of ["max_strength", "explosive"] as const) {
      const plan = buildGoalPlan(input(q, { ageYears: 16 }));
      const methods = plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks.map((x) => x.method)));
      expect(methods).not.toContain("iso_pull");
      expect(methods).not.toContain("single_leg_strength");
      expect(methods).not.toContain("drop_jumps");
    }
    const sp = buildGoalPlan(input("strength_power"));
    const m = sp.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks.map((x) => x.method)));
    expect(m.filter((x) => ["iso_pull", "single_leg_strength", "drop_jumps"].includes(x))).toEqual([]);
  });

  it("every new line says where it comes from; the jump plan's own drop jumps stay pitch work (no lift)", () => {
    const plan = buildGoalPlan(input("explosive"));
    const drop = plan.weeks[1].sessions[1].blocks.find((x) => x.method === "drop_jumps")!;
    const [rx] = rxForBlock(drop, { quality: "explosive", level: "intermediate", youth: false });
    expect(rx.rows.load?.refs).toEqual(["saezdevillarreal2009"]);
    expect(rx.rows.tempo?.refs).toEqual(["sanchezsixto2021"]);
    expect(rx.rows.effort?.source).toBe("micropulse");
    expect(rxForBlock(JUMP_BLOCKS.drop(3, 6, 20), { quality: "jump", level: "intermediate", youth: false })).toEqual([]);
    const iso = buildGoalPlan(input("max_strength")).weeks[1].sessions[0].blocks.find((x) => x.method === "iso_pull")!;
    const isoRx = rxForBlock(iso, { quality: "max_strength", level: "intermediate", youth: false })[0];
    expect(Object.values(isoRx.rows).every((l) => l?.source === "micropulse")).toBe(true);
    expect(isoRx.barSpeed[0].key).toBe("none");
  });
});

describe("in the strength session", () => {
  it("Maximal strength on MD-4: the heavy lift at 0.55–0.65 m/s with the plan's % as the start; the pull and the one-leg lift go in", () => {
    const s = buildStrengthSession(withGoalPlanGym(snap("MD-4"), gymOf("max_strength", "A")), [], { mode: "individualised" });
    const heavy = goalEx(s).find((e) => e.category === "COMPOUND_STRENGTH")!;
    expect(heavy.dose.speedZone).toEqual({ min: 0.55, max: 0.65 });
    expect(heavy.dose.intensity).toBe("80–85% 1RM · 0.55–0.65 m/s");
    expect(heavy.dose.cue).toContain("Bar speed");
    expect(byId(s, "ex_imtp_iso")?.dose.reps).toBe("3s");
    // The one-leg lift goes in; MD-4's 25-min budget (brief §6) may then take it out as a C exercise, logged.
    const oneLeg = ["ex_bulgarian_ss", "ex_reverse_lunge"];
    expect(byId(s, "ex_bulgarian_ss") ?? byId(s, "ex_reverse_lunge") ?? s?.timeTrimmed?.find((t) => oneLeg.includes(t.exerciseId))).toBeDefined();
    const z = rule(s, "GOAL_PLAN_SPEED_ZONE")!;
    expect(z.triggerEN).toContain("MD-4");
    expect(z.actionEN).toContain("is where to start");
    expect(z.actionIS).toContain("Stangarhraði");
    expect(z.evidence).toBe(GOAL_SPEED_ZONE_EVIDENCE);
    expect(z.evidence).toContain("Pareja-Blanco 2017");
  });

  it("Maximal strength day 2 on MD-3: 0.80–0.90 m/s (fast strength)", () => {
    const s = buildStrengthSession(withGoalPlanGym(snap("MD-3"), gymOf("max_strength", "B")), [], { mode: "individualised" });
    const heavy = goalEx(s).find((e) => e.category === "COMPOUND_STRENGTH")!;
    expect(heavy.dose.speedZone).toEqual({ min: 0.8, max: 0.9 });
  });

  it("Explosive power on MD-4: the loaded jump squat 1.1–1.3 m/s, the heavy lift 0.80–0.90; the isometric pull no zone", () => {
    const s = buildStrengthSession(withGoalPlanGym(snap("MD-4"), gymOf("explosive", "A")), [], { mode: "individualised" });
    expect(byId(s, "ex_trap_bar_jump_squat")?.dose.speedZone).toEqual({ min: 1.1, max: 1.3 });
    expect(goalEx(s).find((e) => e.category === "COMPOUND_STRENGTH")?.dose.speedZone).toEqual({ min: 0.8, max: 0.9 });
    expect(byId(s, "ex_imtp_iso")?.dose.speedZone).toBeUndefined();
  });

  it("Explosive day 2 on MD-3: drop jumps take the box jump's place; body-weight jump squats get no zone", () => {
    const s = buildStrengthSession(withGoalPlanGym(snap("MD-3"), gymOf("explosive", "B")), [], { mode: "individualised" });
    expect(byId(s, "ex_depth_jump")?.dose.cue).toContain("box 20 cm");
    expect(goalEx(s).every((e) => e.exerciseId === "ex_depth_jump" || !e.dose.speedZone)).toBe(true);
    expect(rule(s, "GOAL_PLAN_SPEED_ZONE")).toBeUndefined();
  });

  it("a safety rule that rules the drop jumps out leaves only them out: the rest still go in", () => {
    const s = buildStrengthSession(withGoalPlanGym(snap("MD-3", { decelBurdenHighStreakDays: 3 }), gymOf("explosive", "B")), [], { mode: "individualised" });
    expect(byId(s, "ex_depth_jump")).toBeUndefined();
    const merged = rule(s, "GOAL_PLAN_GYM_MERGED")!;
    expect(merged.actionEN).toMatch(/left out: a safety rule rules it out today/);
    expect(merged.actionIS).toMatch(/sleppt/);
    expect(rule(s, "GOAL_PLAN_GYM_KEPT_APART")).toBeUndefined();
  });

  it("Strength + power: no zone (the brief gives none)", () => {
    const s = buildStrengthSession(withGoalPlanGym(snap("MD-4"), gymOf("strength_power", "A")), [], { mode: "individualised" });
    expect(goalEx(s).some((e) => e.dose.speedZone)).toBe(false);
    expect(rule(s, "GOAL_PLAN_SPEED_ZONE")).toBeUndefined();
  });

  it("no match near: the zone follows the goal day (day 1 = MD-4's, day 2 = MD-3's)", () => {
    expect(goalZoneDay(null, "A")).toBe("MD-4");
    expect(goalZoneDay(null, "B")).toBe("MD-3");
    expect(goalZoneDay("MD-3", "A")).toBe("MD-3");
    const s = buildStrengthSession(withGoalPlanGym(snap(null as unknown as MdContext), gymOf("max_strength", "A")), [], { mode: "individualised" });
    const z = rule(s, "GOAL_PLAN_SPEED_ZONE");
    if (z) expect(z.triggerEN).toContain("no match near");
  });
});
