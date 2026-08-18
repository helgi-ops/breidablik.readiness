import { describe, it, expect } from "vitest";
import { csSignalsForPlayer, buildCriticalSpeedSignals, type PlayerCsInput } from "../criticalSpeedSignals";

// A GPS mean-maximal DISTANCE power curve (m/min) over 1/3/5-min windows — the densest
// windows fall as duration grows, so a Critical Speed line fits with a positive D′ intercept.
const gpsCurve: PlayerCsInput = {
  playerId: "p1",
  miiPoints: [
    { windowMin: 1, value: 222.9 },
    { windowMin: 3, value: 188.3 },
    { windowMin: 5, value: 165.8 },
  ],
  date: "2026-06-01",
};

describe("csSignalsForPlayer", () => {
  it("emits aerobic_endurance (CS km/h) and anaerobic_reserve (D′ m) from the GPS power curve", () => {
    const set = csSignalsForPlayer(gpsCurve);
    expect(set.aerobic_endurance).toBeTruthy();
    expect(set.anaerobic_reserve).toBeTruthy();
    expect(set.aerobic_endurance!.unit).toBe("km/h");
    expect(set.anaerobic_reserve!.unit).toBe("m");
    expect(set.aerobic_endurance!.value!).toBeGreaterThan(0);
    expect(set.anaerobic_reserve!.value!).toBeGreaterThan(0);
    expect(set.aerobic_endurance!.source).toContain("Critical Speed");
    expect(set.aerobic_endurance!.date).toBe("2026-06-01");
  });

  it("emits nothing with fewer than two windows (can't fit a line)", () => {
    const set = csSignalsForPlayer({ playerId: "p2", miiPoints: [{ windowMin: 3, value: 180 }] });
    expect(set.aerobic_endurance).toBeUndefined();
    expect(set.anaerobic_reserve).toBeUndefined();
  });

  it("emits nothing with no curve", () => {
    const set = csSignalsForPlayer({ playerId: "p3", miiPoints: [] });
    expect(Object.keys(set)).toHaveLength(0);
  });
});

describe("buildCriticalSpeedSignals", () => {
  it("keeps only players with a valid fit (honest gating, no fabricated dots)", () => {
    const map = buildCriticalSpeedSignals([
      gpsCurve,
      { playerId: "p2", miiPoints: [{ windowMin: 3, value: 180 }] }, // one window → insufficient
      { playerId: "p3", miiPoints: [] }, // none
    ]);
    expect(map.has("p1")).toBe(true);
    expect(map.has("p2")).toBe(false);
    expect(map.has("p3")).toBe(false);
  });
});
