/**
 * Gym-only goals, step 2 (2026-11-18): delivery. Both goal days sit on team strength days (the coach's weekday plan
 * when no match is near, MD-4 / MD-2 in a match week, 2 days apart); whichever falls today goes into the strength
 * session; in season the card only says what holds. The pitch goals keep session B only.
 */
import { describe, expect, it } from "vitest";
import { buildGoalPlan } from "../index";
import { addDays, buildGoalTodayCard, placeWeek, placementFor, type TeamCalendar, type TeamDayType } from "../today";
import { goalPlanGymFor } from "../gymForSession";
import { GYM_ONLY_QUALITIES, OPEN_GOAL_QUALITIES, isOpenGoalQuality, type GoalPlanInput, type GoalQuality, type GymQuality } from "../types";
import { buildStrengthSession } from "@/lib/micropulse/strengthProgramming";
import { strengthSessionToTodayStructure } from "@/lib/micropulse/strengthProgramming/toTodayStructure";
import { withGoalPlanGym } from "@/lib/micropulse/strengthProgramming/goalPlanGym";
import type { PaletteSlots } from "@/lib/micropulse/strengthProgramming/palette";
import type { MdContext, PlayerStrengthSnapshot } from "@/lib/micropulse/strengthProgramming/types";

const MON = "2026-11-16";
const day = (i: number) => addDays(MON, i);

/** No match near, week not set; Breiðablik's weekday plan (2026-11-17). */
const noMatch: TeamCalendar = {
  days: {},
  games: [],
  noMatchWeek: { mon: "strength", wed: "power", thu: "light", sat: "strength", sun: "rest" },
};
/** Train Mon–Fri, match on Saturday (and the Saturday before). */
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
  unavailable: false, inSeason: false, topSpeed: null, sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null, ...over,
});
const placed = (q: GoalQuality, cal: TeamCalendar) => {
  const p = placeWeek({ quality: q, slots: ["A", "B"], monday: MON, cal });
  return Object.fromEntries(p.placed.map((x) => [x.slot, x.date]));
};

describe("gym-only goals are open", () => {
  it("all seven goals can be asked for", () => {
    for (const q of GYM_ONLY_QUALITIES) expect(isOpenGoalQuality(q)).toBe(true);
    expect(OPEN_GOAL_QUALITIES).toHaveLength(7);
  });
});

describe("placement", () => {
  it("no match near: day 1 on a strength day; day 2 on the power day (explosive, strength + power) or the second strength day (max strength)", () => {
    expect(placed("explosive", noMatch)).toEqual({ A: day(0), B: day(2) });
    expect(placed("strength_power", noMatch)).toEqual({ A: day(0), B: day(2) });
    expect(placed("max_strength", noMatch)).toEqual({ A: day(0), B: day(5) });
  });
  it("never on a light or rest day while a strength or power day is free", () => {
    for (const q of GYM_ONLY_QUALITIES) {
      const p = placed(q, noMatch);
      for (const d of Object.values(p)) expect([day(3), day(6)]).not.toContain(d);
    }
  });
  it("match week: the heavy day on MD-4, the second on MD-2, 2 days apart, never MD-1", () => {
    for (const q of GYM_ONLY_QUALITIES) expect(placed(q, saturdayWeek())).toEqual({ A: day(1), B: day(3) });
  });
  it("a weekday plan changed this week only counts from next week (both days)", () => {
    const changed = { ...noMatch, noMatchWeekSince: day(2) };
    const now = placed("explosive", changed);
    expect(now).not.toEqual({ A: day(0), B: day(2) });
    const next = placeWeek({ quality: "explosive", slots: ["A", "B"], monday: addDays(MON, 7), cal: changed });
    expect(next.placed.map((p) => p.date)).toEqual([day(7), day(9)]);
  });
  it("the pitch goals' session A ignores the weekday plan (it is the running session)", () => {
    const withPlan = placeWeek({ quality: "acceleration", slots: ["A"], monday: MON, cal: noMatch });
    const without = placeWeek({ quality: "acceleration", slots: ["A"], monday: MON, cal: { days: {}, games: [] } });
    expect(withPlan.placed).toEqual(without.placed);
  });
});

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

describe("into the strength session", () => {
  const cal = saturdayWeek();
  // Week 2: no test blocks, so every block is a lift.
  const START = addDays(MON, -7);

  it("whichever goal day falls today is read, with its slot; other days hold no goal lifts", () => {
    for (const q of GYM_ONLY_QUALITIES) {
      const plan = buildGoalPlan(input(q));
      const p = placementFor(plan, q, START, MON, cal)!;
      for (const s of p.placed) {
        const g = goalPlanGymFor({ planId: "x", quality: q, plan, startDate: START, todayIso: s.date, cal });
        expect(g?.slot, `${q} ${s.slot}`).toBe(s.slot);
        expect(g!.lifts.length).toBeGreaterThan(0);
        expect(g!.week).toBe(2);
      }
      const free = [0, 2, 4].map(day).filter((d) => !p.placed.some((s) => s.date === d));
      for (const d of free) {
        // No lifts of its own; the week's goal days ride along for the week rule's give-back.
        const g = goalPlanGymFor({ planId: "x", quality: q, plan, startDate: START, todayIso: d, cal });
        expect(g?.lifts ?? []).toEqual([]);
        if (g?.giveBack) expect(g.giveBack.sessions.map((x) => x.date).sort()).toEqual(p.placed.map((x) => x.date).sort());
        // The goal's lifts this week ride along every day, for the fast lift close to the match (2026-11-20).
        expect(g?.weekLifts?.length ?? 0, `${q} ${d}`).toBeGreaterThan(0);
      }
    }
  });

  it("the pitch goals still merge session B only", () => {
    const plan = buildGoalPlan(input("acceleration"));
    const p = placementFor(plan, "acceleration", START, MON, cal)!;
    const a = p.placed.find((s) => s.slot === "A")!;
    const onA = goalPlanGymFor({ planId: "x", quality: "acceleration", plan, startDate: START, todayIso: a.date, cal });
    expect(onA?.lifts ?? []).toEqual([]);
    expect((onA?.giveBack?.sessions ?? []).every((x) => x.slot === "B")).toBe(true);
  });

  it("goal day 1 goes in, takes the place of the team's lifts, and the item carries slot A", () => {
    const q: GymQuality = "strength_power";
    const plan = buildGoalPlan(input(q));
    const aDay = placementFor(plan, q, START, MON, cal)!.placed.find((s) => s.slot === "A")!.date;
    const g = goalPlanGymFor({ planId: "x", quality: q, plan, startDate: START, todayIso: aDay, cal })!;
    const s = buildStrengthSession(withGoalPlanGym(snap(), g))!;
    const merged = s.appliedAdaptations.find((x) => x.ruleId === "GOAL_PLAN_GYM_MERGED");
    expect(merged?.triggerEN).toMatch(/goal day 1/);
    const items = strengthSessionToTodayStructure(s, "EN").flatMap((b) => b.items).filter((i) => i.goalPlan);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].goalPlan).toEqual({ quality: q, week: 2, slot: "A" });
    expect(items[0].note).toMatch(/Your 8-week goal: strength \+ power, week 2/);
  });

  it("every goal lift carries a load: body-weight jump squats say so (dry run 2026-11-18)", () => {
    for (const q of GYM_ONLY_QUALITIES) {
      const plan = buildGoalPlan(input(q));
      for (const s of placementFor(plan, q, START, MON, cal)!.placed) {
        const g = goalPlanGymFor({ planId: "x", quality: q, plan, startDate: START, todayIso: s.date, cal })!;
        for (const l of g.lifts) expect(l.intensity, `${q} ${s.slot} ${l.nameEN}`).toBeTruthy();
      }
    }
    const ex = buildGoalPlan(input("explosive"));
    const b = placementFor(ex, "explosive", START, MON, cal)!.placed.find((s) => s.slot === "B")!;
    const g = goalPlanGymFor({ planId: "x", quality: "explosive", plan: ex, startDate: START, todayIso: b.date, cal })!;
    expect(g.lifts.find((l) => l.profile === "jump_squat")?.intensity).toBe("Bodyweight");
  });

  it("in season → the session exactly as without a goal", () => {
    const plan = buildGoalPlan(input("max_strength"));
    const aDay = placementFor(plan, "max_strength", START, MON, cal)!.placed[0].date;
    const g = goalPlanGymFor({ planId: "x", quality: "max_strength", plan, startDate: START, todayIso: aDay, cal })!;
    const goalSeason = { phase: "competitive" as const, blockGoal: "accum" as const };
    expect(buildStrengthSession(withGoalPlanGym(snap({ goalSeason }), g))).toEqual(buildStrengthSession(snap({ goalSeason })));
  });
});

describe("the goal card", () => {
  const cal = saturdayWeek();
  const START = addDays(MON, -7);
  const plan = buildGoalPlan(input("explosive"));
  const days = placementFor(plan, "explosive", START, MON, cal)!.placed;
  const card = (todayIso: string, over: Partial<Parameters<typeof buildGoalTodayCard>[0]> = {}) =>
    buildGoalTodayCard({ quality: "explosive", status: "approved", plan, startDate: START, todayIso, cal, colour: "green", coachNote: null, ...over })!;

  it("goal day in today's session: named as a goal day, nothing left on the card", () => {
    for (const s of days) {
      const c = card(s.date, { gymInSession: s.slot });
      expect(c.today?.inSession).toBe(true);
      expect(c.today?.name?.en).toBe(`Goal day ${s.slot === "A" ? 1 : 2}`);
      expect(c.today?.blocks).toEqual([]);
      expect(c.verdict.en).toMatch(/goal day \d .* is part of your strength session/);
    }
  });

  it("the merged slot must be today's: day 2's lifts in the session do not mark day 1", () => {
    const a = days.find((s) => s.slot === "A")!;
    expect(card(a.date, { gymInSession: "B" }).today?.inSession).toBeUndefined();
  });

  it("this week's pills and the tick question name goal days", () => {
    const c = card(days[0].date);
    expect(c.thisWeek.map((s) => s.tag?.en)).toEqual(["Day 1", "Day 2"]);
    expect(c.thisWeek[0].ask?.is).toBe("markmiðsdag 1");
    expect(c.facts[0].en).toMatch(/\(day 1\), .*\(day 2\)/);
  });

  it("in season (or not known): the hold card, no session, nothing to tick", () => {
    const c = card(days[0].date, { season: "maintain", gymInSession: "A" });
    expect(c.today).toBeNull();
    expect(c.thisWeek).toEqual([]);
    expect(c.verdict.en).toMatch(/holds what you built/);
    expect(c.facts.some((f) => /no extra sets/.test(f.en))).toBe(true);
  });

  it("the pitch goals ignore the season field", () => {
    const acc = buildGoalPlan(input("acceleration"));
    const b = placementFor(acc, "acceleration", START, MON, cal)!.placed.find((s) => s.slot === "B")!;
    const c = buildGoalTodayCard({ quality: "acceleration", status: "approved", plan: acc, startDate: START, todayIso: b.date, cal, colour: "green", coachNote: null, season: "maintain" })!;
    expect(c.today).not.toBeNull();
    for (const s of c.thisWeek) expect(s.tag?.en).toBe(s.slot);
  });
});
