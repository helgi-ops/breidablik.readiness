/**
 * The week rule, prevention (2026-11-19): Nordic and Copenhagen once a week, each on its own heavy day with the week's
 * reps (Nordic 4 × 5 on MD-4, Copenhagen 4 × 6 a side on MD-3). Never the same prevention exercise two days in a row.
 * Individualised modes, football only.
 */
import { describe, expect, it } from "vitest";
import { buildStrengthSession } from "../index";
import { applyBlockToSession } from "../blockEmphasis";
import { COPENHAGEN_ID, NORDIC_ID, PREVENTION_DOSE, PREVENTION_EVIDENCE, matchWeekPrevention, noMatchWeekPrevention } from "../preventionRule";
import { sanitizeNoMatchWeek, type StructureKey } from "../structures";
import type { MdContext, PlayerStrengthSnapshot } from "../types";
import { addDays } from "@/lib/micropulse/goalPlan/today";

const MON = "2026-11-16";
const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: MON, mdContext: "MD-4" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  seasonPhase: "preseason", ...over,
});
type S = ReturnType<typeof buildStrengthSession>;
const find = (s: S, id: string) => (s?.blocks ?? []).flatMap((b) => b.exercises).find((e) => e.exerciseId === id) ?? null;
const dose = (s: S, id: string) => { const e = find(s, id); return e ? `${e.dose.sets} × ${e.dose.reps}` : null; };
const rule = (s: S) => (s?.appliedAdaptations ?? []).find((a) => a.ruleId === "WEEK_RULE_PREVENTION");
const on = (md: MdContext, method?: StructureKey, over: Partial<PlayerStrengthSnapshot> = {}) =>
  buildStrengthSession(snap({ mdContext: md, ...(method ? { mdStructures: { [md]: method } } : {}), ...over }));

describe("a week with a match", () => {
  it("MD-4 carries the Nordic, the week's 20 reps as 4 × 5, and no Copenhagen", () => {
    for (const method of [undefined, "contrast", "french_contrast", "straight_sets"] as (StructureKey | undefined)[]) {
      const s = on("MD-4", method);
      expect(dose(s, NORDIC_ID), String(method)).toBe("4 × 5");
      expect(find(s, COPENHAGEN_ID), String(method)).toBeNull();
    }
  });

  it("MD-3 carries the Copenhagen, the week's 24 a side as 4 × 6, and no Nordic", () => {
    // The built-in MD-3 session brings neither: the rule puts the Copenhagen in.
    for (const method of [undefined, "contrast", "straight_sets"] as (StructureKey | undefined)[]) {
      const s = on("MD-3", method);
      expect(dose(s, COPENHAGEN_ID), String(method)).toBe("4 × 6 each side");
      expect(find(s, NORDIC_ID), String(method)).toBeNull();
    }
  });

  it("the week's reps are what the dose says", () => {
    expect(PREVENTION_DOSE.nordic.sets * 5).toBe(PREVENTION_DOSE.nordic.weekReps);
    expect(PREVENTION_DOSE.copenhagen.sets * 6).toBe(PREVENTION_DOSE.copenhagen.weekReps);
  });

  it("the other days carry neither", () => {
    for (const md of ["MD-5", "MD-2", "MD-1"] as MdContext[]) {
      const s = on(md, md === "MD-5" ? "contrast" : undefined);
      expect(find(s, NORDIC_ID), md).toBeNull();
      expect(find(s, COPENHAGEN_ID), md).toBeNull();
    }
  });

  it("the same in season and in pre-season", () => {
    expect(dose(on("MD-4", "contrast", { seasonPhase: "inseason" }), NORDIC_ID)).toBe("4 × 5");
    expect(dose(on("MD-3", "contrast", { seasonPhase: "inseason" }), COPENHAGEN_ID)).toBe("4 × 6 each side");
  });

  it("a day the coach marked off: both go on the other heavy day", () => {
    expect(matchWeekPrevention("MD-4", (d) => d === "MD-3")).toEqual({ nordic: true, copenhagen: true });
    expect(matchWeekPrevention("MD-3", (d) => d === "MD-4")).toEqual({ nordic: true, copenhagen: true });
    const s = buildStrengthSession(snap({ mdContext: "MD-4", mdStructures: { "MD-4": "contrast", "MD-3": "rest" } }));
    expect(dose(s, NORDIC_ID)).toBe("4 × 5");
    expect(dose(s, COPENHAGEN_ID)).toBe("4 × 6 each side");
  });

  it("says why, with what is a study and what is MicroPulse's rule", () => {
    const a = rule(on("MD-4", "contrast"))!;
    expect(a.actionEN).toMatch(/Nordic 4 × 5 \(20 reps, the week's dose\)/);
    expect(a.actionEN).toMatch(/Copenhagen is on MD-3/);
    expect(a.actionIS).toMatch(/Nordic 4 × 5 \(20 endurtekningar, skammtur vikunnar\)/);
    expect(rule(on("MD-3", "contrast"))!.actionIS).toMatch(/Copenhagen 4 × 6 á hlið/);
    expect(PREVENTION_EVIDENCE).toMatch(/Arnason 2008/);
    expect(PREVENTION_EVIDENCE).toMatch(/MicroPulse's rule/);
    expect(rule(on("MD-2"))).toBeUndefined();
  });

  it("the block's extra set does not go on top: the week's reps are fixed", () => {
    const s = applyBlockToSession(on("MD-4", "contrast"), "accum", "preseason");
    expect(dose(s, NORDIC_ID)).toBe("4 × 5");
  });

  it("a safety rule still has the last word", () => {
    const s = on("MD-3", "contrast", { wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: ["groin"] } });
    expect(find(s, COPENHAGEN_ID)).toBeNull();
  });

  it("standard mode and basketball are left as they were", () => {
    const std = buildStrengthSession(snap(), [], { mode: "standard" });
    expect(dose(std, NORDIC_ID)).toBe("2 × 5");
    expect(dose(std, COPENHAGEN_ID)).toBe("2 × 6 each side");
    const bb = buildStrengthSession(snap({ sport: "basketball" }));
    expect(dose(bb, NORDIC_ID)).toBe("2 × 5");
    expect(dose(bb, COPENHAGEN_ID)).toBe("2 × 6 each side");
  });
});

describe("a week without a match", () => {
  const day = (i: number) => addDays(MON, i);
  const noMatch = (plan: Record<string, string>, i: number) =>
    buildStrengthSession(snap({ todayIso: day(i), noMatchNearby: true, noMatchWeek: sanitizeNoMatchWeek(plan), mdStructures: { "MD-4": "straight_sets", "MD-3": "contrast" } }));

  it("Nordic on the first strength day, Copenhagen on the first power day, once each", () => {
    const plan = { mon: "strength", wed: "power", fri: "strength" };
    expect(dose(noMatch(plan, 0), NORDIC_ID)).toBe("4 × 5");
    expect(find(noMatch(plan, 0), COPENHAGEN_ID)).toBeNull();
    expect(dose(noMatch(plan, 2), COPENHAGEN_ID)).toBe("4 × 6 each side");
    expect(find(noMatch(plan, 2), NORDIC_ID)).toBeNull();
    // The third heavy day carries neither: the week's reps are done.
    expect(find(noMatch(plan, 4), NORDIC_ID)).toBeNull();
    expect(find(noMatch(plan, 4), COPENHAGEN_ID)).toBeNull();
  });

  it("no power day among the heavy days: Copenhagen on the other heavy day", () => {
    const plan = sanitizeNoMatchWeek({ tue: "strength", thu: "strength" });
    expect(noMatchWeekPrevention(day(1), plan, "hold")).toEqual({ nordic: true, copenhagen: false });
    expect(noMatchWeekPrevention(day(3), plan, "hold")).toEqual({ nordic: false, copenhagen: true });
  });

  it("one heavy day only: both on it; a light day carries neither", () => {
    const plan = sanitizeNoMatchWeek({ tue: "strength", thu: "light" });
    expect(noMatchWeekPrevention(day(1), plan, "hold")).toEqual({ nordic: true, copenhagen: true });
    expect(noMatchWeekPrevention(day(3), plan, "hold")).toEqual({ nordic: false, copenhagen: false });
  });

  it("no weekday plan: the rule says nothing", () => {
    expect(noMatchWeekPrevention(MON, undefined, "hold")).toBeNull();
  });
});
