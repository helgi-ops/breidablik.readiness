import { describe, it, expect } from "vitest";
import { csSignalsForPlayer, buildCriticalSpeedSignals, type PlayerCsInput } from "../criticalSpeedSignals";

// Two maximal running efforts on a straight D = D′ + CS·t line: 4 min @ ~14.6 km/h and
// 12 min @ ~13.3 km/h. CS ≈ the long-run speed; D′ = the intercept (a real positive tank).
// 4 min: 973 m (243.3 m/min = 14.6 km/h) · 12 min: 2666 m (222.2 m/min = 13.33 km/h)
const twoEfforts: PlayerCsInput = {
  playerId: "p1",
  miiPoints: [],
  efforts: [
    { durationMin: 4, distanceM: 973 },
    { durationMin: 12, distanceM: 2666 },
  ],
  date: "2026-06-01",
};

describe("csSignalsForPlayer", () => {
  it("emits aerobic_endurance (CS km/h) and anaerobic_reserve (D′ m) from a valid fit", () => {
    const set = csSignalsForPlayer(twoEfforts);
    expect(set.aerobic_endurance).toBeTruthy();
    expect(set.anaerobic_reserve).toBeTruthy();
    expect(set.aerobic_endurance!.unit).toBe("km/h");
    expect(set.anaerobic_reserve!.unit).toBe("m");
    // CS lands between the two run speeds; D′ is a positive reserve.
    expect(set.aerobic_endurance!.value!).toBeGreaterThan(12);
    expect(set.aerobic_endurance!.value!).toBeLessThan(15);
    expect(set.anaerobic_reserve!.value!).toBeGreaterThan(0);
    expect(set.aerobic_endurance!.source).toContain("Critical Speed");
    expect(set.aerobic_endurance!.date).toBe("2026-06-01");
  });

  it("emits nothing when there is only one anchor and no curve (can't fit a line)", () => {
    const set = csSignalsForPlayer({ playerId: "p2", miiPoints: [], efforts: [{ durationMin: 4, distanceM: 1000 }] });
    expect(set.aerobic_endurance).toBeUndefined();
    expect(set.anaerobic_reserve).toBeUndefined();
  });

  it("emits nothing with no anchors and no curve", () => {
    const set = csSignalsForPlayer({ playerId: "p3", miiPoints: [], efforts: [] });
    expect(Object.keys(set)).toHaveLength(0);
  });
});

describe("buildCriticalSpeedSignals", () => {
  it("keeps only players with a valid fit (honest gating, no fabricated dots)", () => {
    const map = buildCriticalSpeedSignals([
      twoEfforts,
      { playerId: "p2", miiPoints: [], efforts: [{ durationMin: 4, distanceM: 1000 }] }, // insufficient
      { playerId: "p3", miiPoints: [], efforts: [] }, // none
    ]);
    expect(map.has("p1")).toBe(true);
    expect(map.has("p2")).toBe(false);
    expect(map.has("p3")).toBe(false);
  });
});
