import { describe, it, expect } from "vitest";
import { buildGoalkeeperAnalysis, type GkMatch } from "../index";

const M = (o: Partial<GkMatch>): GkMatch => ({
  minutes: 95, shotsFaced: null, saves: null, psxgFaced: null, gsaa: null, savePct: null,
  passes: null, successfulPasses: null, passesToFinalThird: null, passLength: null, longGoalKicks: null, shortGoalKicks: null, ...o,
});

describe("buildGoalkeeperAnalysis", () => {
  const matches = [
    // Two of Anton's real matches (shot-stopping above expected both times).
    M({ minutes: 100, shotsFaced: 13, saves: 2, psxgFaced: 1.466, gsaa: 0.466, passes: 46, successfulPasses: 39, passesToFinalThird: 3, passLength: 25.2, longGoalKicks: 0, shortGoalKicks: 1 }),
    M({ minutes: 97, shotsFaced: 11, saves: 4, psxgFaced: 1.385, gsaa: 1.385, passes: 42, successfulPasses: 32, passesToFinalThird: 3, passLength: 33.9, longGoalKicks: 1, shortGoalKicks: 0 }),
  ];

  it("aggregates shot-stopping across matches", () => {
    const r = buildGoalkeeperAnalysis(matches);
    expect(r.matches).toBe(2);
    expect(r.minutes).toBe(197);
    expect(r.shotStopping.shotsFaced).toBe(24);
    expect(r.shotStopping.saves).toBe(6);
    expect(r.shotStopping.savePct).toBe(25);                 // 6 / 24
    expect(r.shotStopping.psxgFaced).toBeCloseTo(2.85, 2);
    expect(r.shotStopping.gsaa).toBeCloseTo(1.85, 2);        // saved ~1.85 goals above average → strong
    expect(r.shotStopping.goalsConceded).toBe(1);            // psxg 2.85 − gsaa 1.85 = 1
  });

  it("aggregates distribution and the short/long goal-kick split", () => {
    const r = buildGoalkeeperAnalysis(matches);
    expect(r.distribution.passes).toBe(88);
    expect(r.distribution.passCompletionPct).toBe(81);       // 71 / 88
    expect(r.distribution.passesToFinalThird).toBe(6);
    expect(r.distribution.longGoalKicks).toBe(1);
    expect(r.distribution.shortGoalKicks).toBe(1);
    expect(r.distribution.longBallPct).toBe(50);             // 1 of 2 played long
    expect(r.distribution.avgPassLength).toBeGreaterThan(25);
  });

  it("handles empty input", () => {
    const r = buildGoalkeeperAnalysis([]);
    expect(r.matches).toBe(0);
    expect(r.shotStopping.savePct).toBeNull();
  });
});
