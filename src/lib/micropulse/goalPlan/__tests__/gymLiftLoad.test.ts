/**
 * 2026-11-18 (demo of "Individualised + goals"): two goal lifts reached the strength session with no load — the light
 * week's heavy lift ("2 × 3", no %) and the braking split squat (no load, and the default 2 min rest instead of the
 * plan's 90 s). Every gym lift of every plan, week, start and level must now carry a load, and the plan's own rest.
 */
import { describe, expect, it } from "vitest";
import { allowedLevels, allowedStarts, buildGoalPlan } from "../index";
import { gymLiftsOf } from "../gymForSession";
import { GOAL_QUALITIES, type GoalPlanInput, type GoalQuality } from "../types";

const input = (quality: GoalQuality, over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality, todayIso: "2026-11-18", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: false, topSpeed: { level: "ok", daysSince: 4, refKmh: 32, targetKmh: 28.8, confidence: "high" },
  sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null, ...over,
});

function everyLift() {
  const out: { where: string; lift: NonNullable<ReturnType<typeof gymLiftsOf>>["lifts"][number] }[] = [];
  for (const q of GOAL_QUALITIES) {
    for (const ageYears of [24, 16]) {
      for (const inSeason of [false, true]) {
        const base = input(q, { ageYears, inSeason });
        for (const start of allowedStarts(base)) {
          const withStart = { ...base, startOverride: start.key };
          const levels = allowedLevels(withStart, start.key);
          for (const level of levels.length ? levels : [null]) {
            const plan = buildGoalPlan({ ...withStart, level });
            if (plan.status !== "ok") continue;
            for (const w of plan.weeks) {
              for (const s of w.sessions) {
                for (const lift of gymLiftsOf(plan, w.week, s.slot)?.lifts ?? []) {
                  out.push({ where: `${q} · age ${ageYears} · ${start.key} · ${level ?? "-"} · week ${w.week} ${s.slot} · ${lift.nameEN}`, lift });
                }
              }
            }
          }
        }
      }
    }
  }
  return out;
}

describe("every goal lift that can go into the strength session carries a load", () => {
  const lifts = everyLift();
  it("reads many lifts", () => {
    expect(lifts.length).toBeGreaterThan(200);
  });

  it("no lift without a load", () => {
    expect(lifts.filter((l) => !l.lift.intensity).map((l) => l.where)).toEqual([]);
  });

  it("no lift without the plan's rest, except the Nordic (the rest is the partner's set)", () => {
    expect(lifts.filter((l) => !l.lift.rest && l.lift.profile !== "nordic").map((l) => l.where)).toEqual([]);
  });

  it("the light week names the weight: the same as last week, with the % range", () => {
    const light = lifts.filter((l) => l.lift.profile === "heavy" && l.lift.sets === "2" && l.lift.reps === "3");
    expect(light.length).toBeGreaterThan(0);
    for (const l of light) {
      expect(l.lift.intensity, l.where).toMatch(/^\d+–\d+% 1RM$/);
      expect(l.lift.cue, l.where).toMatch(/same weight as last week/);
    }
  });

  it("braking: the slow-lowering split squat — body weight or light dumbbells, about 90 s rest", () => {
    const ecc = lifts.filter((l) => l.lift.profile === "eccentric");
    expect(ecc.length).toBeGreaterThan(0);
    for (const l of ecc) {
      expect(l.lift.intensity, l.where).toBe("Bodyweight or light DBs");
      expect(l.lift.rest, l.where).toBe("90s");
    }
  });
});
