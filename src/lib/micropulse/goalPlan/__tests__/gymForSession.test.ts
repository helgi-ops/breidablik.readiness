/**
 * "One session, one whole" (2026-11-17): in pre-/off-season the 8-week goal plan's gym session B goes INTO the team
 * strength session on the day the plan places it — in place of the matching team exercise, never on top; nothing in
 * season, on a recovery day, or when a safety rule holds a slot (then B stays whole on the goal card); half the sets on
 * a yellow day; never a second extra set on a goal-plan lift. The card then says B is in today's session.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGoalPlan } from "../index";
import { addDays, buildGoalTodayCard, placementFor, type TeamCalendar, type TeamDayType } from "../today";
import { goalPlanGymFor } from "../gymForSession";
import type { GoalPlanInput, GoalQuality } from "../types";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import { applyBlockToSession } from "@/lib/micropulse/strengthProgramming/blockEmphasis";
import { strengthSessionToTodayStructure } from "@/lib/micropulse/strengthProgramming/toTodayStructure";
import { withGoalPlanGym } from "@/lib/micropulse/strengthProgramming/goalPlanGym";
import type { PaletteSlots } from "@/lib/micropulse/strengthProgramming/palette";
import type { MdContext, PlayerStrengthSnapshot } from "@/lib/micropulse/strengthProgramming/types";

const MON = "2026-11-16";
const day = (i: number) => addDays(MON, i);
function saturdayWeek(): TeamCalendar {
  const days: Record<string, TeamDayType> = {};
  for (const w of [-7, 0]) {
    for (let i = 0; i < 5; i++) days[addDays(MON, w + i)] = "train";
    days[addDays(MON, w + 5)] = "game";
    days[addDays(MON, w + 6)] = "off";
  }
  return { days, games: [day(-2), day(5)] };
}
const input = (q: GoalQuality, over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: q, todayIso: "2026-11-13", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: false, topSpeed: { level: "ok", daysSince: 4, refKmh: 32, targetKmh: 28.8, confidence: "high" },
  sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null, ...over,
});

const cal = saturdayWeek();
function gymFor(q: GoalQuality, over: Partial<GoalPlanInput> = {}) {
  const plan = buildGoalPlan(input(q, over));
  const bDay = placementFor(plan, q, MON, MON, cal)!.placed.find((p) => p.slot === "B")!.date;
  return { plan, bDay, gym: goalPlanGymFor({ planId: "plan1", quality: q, plan, startDate: MON, todayIso: bDay, cal }) };
}

const PALETTE: PaletteSlots = {
  isometric: ["ex_imtp_iso"],
  upper_body: ["ex_db_bench_press"],
  power_explosive: ["ex_box_jump", "ex_depth_jump"],
  bilateral_strength: ["ex_hip_thrust", "ex_back_squat"],
  unilateral_strength: ["ex_reverse_lunge"],
};
const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: MON, mdContext: "MD-4" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  teamPalette: PALETTE, seasonPhase: null, goalSeason: { phase: "preseason", blockGoal: "transmute" }, ...over,
});
type S = ReturnType<typeof buildStrengthSession>;
const all = (s: S) => (s?.blocks ?? []).flatMap((b) => b.exercises);
const rule = (s: S, id: string) => (s?.appliedAdaptations ?? []).find((a) => a.ruleId === id);

describe("reading session B's gym lifts", () => {
  it("acceleration: jump squats then heavy legs, only on B's day", () => {
    const { gym, plan, bDay } = gymFor("acceleration");
    expect(gym).not.toBeNull();
    expect(gym!.lifts.map((l) => l.profile)).toEqual(["jump_squat", "heavy"]);
    expect(gym!.week).toBe(1);
    expect(gym!.lifts[1].intensity).toMatch(/% 1RM$/);
    const other = [0, 1, 2, 3, 4].map(day).find((d) => d !== bDay)!;
    expect(goalPlanGymFor({ planId: "p", quality: "acceleration", plan, startDate: MON, todayIso: other, cal })).toBeNull();
  });

  it("braking: only the slow-lowering split squat (the drills stay on the card)", () => {
    const { gym } = gymFor("braking");
    expect(gym?.lifts.map((l) => l.profile)).toEqual(["eccentric"]);
    expect(gym!.lifts[0].reps).toMatch(/each leg/);
    expect(gym!.lifts[0].cue).toMatch(/3 s down/);
  });

  it("before the plan starts or after week 8 → nothing", () => {
    const { plan } = gymFor("jump");
    expect(goalPlanGymFor({ planId: "p", quality: "jump", plan, startDate: addDays(MON, 7), todayIso: MON, cal })).toBeNull();
    expect(goalPlanGymFor({ planId: "p", quality: "jump", plan, startDate: addDays(MON, -70), todayIso: MON, cal })).toBeNull();
  });
});

describe("into the strength session", () => {
  const { gym } = gymFor("acceleration");

  it("pre-season: the goal's lifts take the place of the team's power and main lift — nothing added on top", () => {
    const POWER = ["EXPLOSIVE_OLYMPIC", "PLYOMETRIC", "BALLISTIC", "MED_BALL"];
    for (const md of ["MD-4", "MD-3"] as MdContext[]) {
      const base = buildStrengthSession(snap({ mdContext: md }));
      const merged = buildStrengthSession(withGoalPlanGym(snap({ mdContext: md }), gym!));
      // Added only when the session has no power exercise to take the place of (MD-4's template has none).
      const hadPower = all(base).some((e) => POWER.includes(e.category));
      expect(all(merged).length).toBe(all(base).length + (hadPower ? 0 : 1));
      expect(all(merged).filter((e) => e.category === "COMPOUND_STRENGTH").length).toBe(all(base).filter((e) => e.category === "COMPOUND_STRENGTH").length);
    }
    const s = buildStrengthSession(withGoalPlanGym(snap(), gym!));
    const goal = all(s).filter((e) => e.goalPlan);
    expect(goal.map((e) => e.exerciseId)).toContain("ex_trap_bar_jump_squat");
    expect(goal.some((e) => e.category === "COMPOUND_STRENGTH")).toBe(true);
    expect(goal.every((e) => e.goalPlan?.quality === "acceleration" && e.goalPlan.week === 1)).toBe(true);
    expect(rule(s, "GOAL_PLAN_GYM_MERGED")?.actionEN).toMatch(/in place of/);
    // Power before strength: the jump squat comes before the main lift.
    const order = all(s).map((e) => e.exerciseId);
    const main = all(s).find((e) => e.goalPlan && e.category === "COMPOUND_STRENGTH")!.exerciseId;
    expect(order.indexOf("ex_trap_bar_jump_squat")).toBeLessThan(order.indexOf(main));
  });

  it("in season (or unknown) → the session exactly as without a plan", () => {
    for (const goalSeason of [{ phase: "competitive" as const, blockGoal: "accum" as const }, null]) {
      const a = buildStrengthSession(snap({ goalSeason }));
      const b = buildStrengthSession(withGoalPlanGym(snap({ goalSeason }), gym!));
      expect(b).toEqual(a);
    }
  });

  it("yellow day → half the sets; red day → nothing merged, with a reason", () => {
    // MD-3: yellow steps French contrast to contrast, which keeps a heavy lift → merged at half the sets.
    const y = buildStrengthSession(withGoalPlanGym(snap({ mdContext: "MD-3", verdict: "MODIFIED" }), gym!));
    expect(rule(y, "GOAL_PLAN_GYM_MERGED")?.actionEN).toMatch(/half the sets/);
    // MD-4: yellow steps the cluster to an overcoming isometric (no heavy lift) → B stays on the card, with why.
    const y4 = buildStrengthSession(withGoalPlanGym(snap({ verdict: "MODIFIED" }), gym!));
    expect(all(y4).some((e) => e.goalPlan)).toBe(false);
    expect(rule(y4, "GOAL_PLAN_GYM_KEPT_APART")?.actionEN).toMatch(/yellow day: today's structure was stepped down/);
    const red = buildStrengthSession(withGoalPlanGym(snap({ verdict: "RECOVERY" }), gym!));
    expect(all(red).some((e) => e.goalPlan)).toBe(false);
  });

  it("a safety rule that rules a lift out → all or nothing: B stays whole on the card", () => {
    // Sore quads rule the loaded jump squat / squat family out today.
    const s = buildStrengthSession(withGoalPlanGym(snap({ wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: ["quads"] } }), gym!));
    if (!rule(s, "GOAL_PLAN_GYM_MERGED")) {
      expect(all(s).some((e) => e.goalPlan)).toBe(false);
      expect(rule(s, "GOAL_PLAN_GYM_KEPT_APART")).toBeTruthy();
    }
  });

  it("never more than the plan's dose: no Accumulation +1 and no strength-goal +1 on a goal-plan lift", () => {
    const s = buildStrengthSession(withGoalPlanGym(snap({ goalSeason: { phase: "preseason", blockGoal: "accum" }, playerStrengthGoal: "stronger", noMatchNearby: true }), gym!));
    const before = all(s).filter((e) => e.goalPlan).map((e) => e.dose.sets);
    expect(all(s).filter((e) => e.goalPlan).some((e) => e.playerGoal)).toBe(false);
    const tilted = applyBlockToSession(s, "accum", "preseason");
    expect(all(tilted).filter((e) => e.goalPlan).map((e) => e.dose.sets)).toEqual(before);
  });

  it("the day's structure is the frame: the goal's lift keeps its own dose, nothing from the slot (no cluster rest, no velocity cap)", () => {
    for (const key of ["cluster_max_strength", "cluster_hypertrophy", "contrast", "straight_sets"] as const) {
      const s = buildStrengthSession(withGoalPlanGym(snap({ mdStructures: { "MD-4": key } }), gym!));
      const goal = all(s).filter((e) => e.goalPlan);
      expect(goal.length).toBeGreaterThan(0);
      for (const e of goal) {
        expect(e.dose.intraRepRestSec ?? null).toBeNull();
        expect(e.dose.velocityLossCap ?? null).toBeNull();
        expect(e.modificationReason).toMatch(/the goal's own dose/);
      }
      const heavy = goal.find((e) => e.category === "COMPOUND_STRENGTH")!;
      expect(heavy.dose.intensity).toBe(gym!.lifts[1].intensity);
    }
  });

  it("the goal's jump squat takes the loaded-jump spot of French contrast (never twice in the session)", () => {
    const pal = { ...PALETTE, power_explosive: ["ex_box_jump", "ex_trap_bar_jump_squat", "ex_mb_rotational_throw"] };
    const s = buildStrengthSession(withGoalPlanGym(snap({ mdStructures: { "MD-4": "french_contrast" }, teamPalette: pal }), gym!));
    const ids = all(s).map((e) => e.exerciseId);
    expect(ids.filter((id) => id === "ex_trap_bar_jump_squat").length).toBe(1);
    expect(ids).toContain("ex_box_jump");
    expect(all(s).find((e) => e.exerciseId === "ex_trap_bar_jump_squat")?.goalPlan).toBeTruthy();
  });

  it("a structure with no heavy lift (isometric / primer) takes nothing: B stays on the goal card, with the reason", () => {
    for (const [md, key] of [["MD-4", "overcoming_isometric"], ["MD-4", "yielding_isometric"], ["MD-3", "iso_pap_primer"], ["MD-3", "potentiation_cluster"], ["MD-3", "power_contrast"]] as const) {
      const base = buildStrengthSession(snap({ mdContext: md, mdStructures: { [md]: key } }));
      const s = buildStrengthSession(withGoalPlanGym(snap({ mdContext: md, mdStructures: { [md]: key } }), gym!));
      expect(all(s).some((e) => e.goalPlan)).toBe(false);
      expect(all(s).length).toBe(all(base).length);
      expect(rule(s, "GOAL_PLAN_GYM_KEPT_APART")?.actionEN).toMatch(/no heavy lift/);
      expect(rule(s, "GOAL_PLAN_GYM_KEPT_APART")?.actionIS).toMatch(/án þungrar lyftu/);
    }
  });

  it("the player's card item carries the goal tag and the marker the goal card reads", () => {
    const s = buildStrengthSession(withGoalPlanGym(snap(), gym!))!;
    const items = strengthSessionToTodayStructure(s, "IS").flatMap((b) => b.items);
    const tagged = items.filter((i) => i.goalPlan);
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged[0].goalPlan).toEqual({ quality: "acceleration", week: 1, slot: "B" });
    expect(tagged[0].note).toMatch(/8 vikna markmiðið þitt: hröðun, vika 1/);
  });
});

describe("the goal card", () => {
  it("B in today's session: says so; braking keeps its drills on the card", () => {
    for (const q of ["acceleration", "braking"] as GoalQuality[]) {
      const { plan, bDay } = gymFor(q);
      const card = buildGoalTodayCard({ quality: q, status: "approved", plan, startDate: MON, todayIso: bDay, cal, colour: "green", coachNote: null, gymInSession: true })!;
      expect(card.today?.inSession).toBe(true);
      expect(card.facts.some((f) => /One session, not two/.test(f.en))).toBe(true);
      expect(card.today!.blocks.every((b) => !b.rx?.length)).toBe(true);
      if (q === "acceleration") expect(card.today!.blocks).toEqual([]);
      else expect(card.today!.blocks.length).toBeGreaterThan(0);
      const apart = buildGoalTodayCard({ quality: q, status: "approved", plan, startDate: MON, todayIso: bDay, cal, colour: "green", coachNote: null })!;
      expect(apart.today?.inSession).toBeUndefined();
    }
  });
});

describe("wiring", () => {
  const root = join(__dirname, "..", "..", "..", "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("the three send routes and the coach preview put today's session B on the snapshot; the same writer, no new origin", () => {
    for (const p of [
      "src/app/api/coach/player/[id]/send-strength-session/route.ts",
      "src/app/api/coach/team/send-strength-sessions/route.ts",
      "src/app/api/strength/auto-send/route.ts",
      "src/app/api/coach/player/[id]/strength-session/route.ts",
    ]) {
      const src = read(p);
      expect(src).toMatch(/loadGoalPlanGym\(/);
      expect(src).toMatch(/withGoalPlanGym\(/);
    }
  });
  it("finishing the strength session ticks B", () => {
    expect(read("src/app/api/player/strength-completion/route.ts")).toMatch(/tickGoalFromStrengthSession/);
  });
});
