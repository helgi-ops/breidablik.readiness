import { describe, it, expect } from "vitest";
import { predictDrill, predictSession, predictSquadSession, type PlannedDrill } from "../sessionPlan";
import type { CapacityReference } from "../peakCapacity";

// A reference whose 5-15 band peak is 12/min, 15-30 is 10/min, overall 11.
const ref: CapacityReference = {
  byBand: { "0-5": null, "5-15": 12, "15-30": 10, "30-60": null, "60+": null },
  overall: 11,
  drills: 50,
};

describe("predictDrill", () => {
  it("maps duration + target% onto his ceiling → per-min + total load", () => {
    // 6-min drill @ 90% of the 5-15 ceiling (12) → 10.8/min → 64.8 → 65 AU.
    const p = predictDrill({ id: "a", label: "Possession", durationMin: 6, targetPct: 90 }, ref);
    expect(p.ceiling).toBe(12);
    expect(p.predictedPerMin).toBe(10.8);
    expect(p.predictedLoad).toBe(65);
    expect(p.level).toBe("high"); // 90% → high (< 95 peak)
  });

  it("uses the overall fallback ceiling for a thin band", () => {
    const p = predictDrill({ id: "b", label: "Rondo", durationMin: 3, targetPct: 100 }, ref);
    expect(p.ceiling).toBe(11); // 0-5 band null → overall
    expect(p.level).toBe("peak"); // 100% → peak
  });

  it("classifies a peak-target drill as peak", () => {
    expect(predictDrill({ id: "c", label: "SSG", durationMin: 8, targetPct: 96 }, ref).level).toBe("peak");
  });
});

describe("predictSession", () => {
  it("sums predicted load + duration and load-weights the mean intensity", () => {
    const drills: PlannedDrill[] = [
      { id: "1", label: "Warm-up", durationMin: 10, targetPct: 50 }, // 12×0.5=6/min ×10 = 60
      { id: "2", label: "SSG", durationMin: 8, targetPct: 95 },      // 12×0.95=11.4 ×8 = 91
    ];
    const s = predictSession(drills, ref);
    expect(s.totalDurationMin).toBe(18);
    expect(s.totalLoad).toBe(60 + 91);
    expect(s.peakDrills).toBe(1);
    expect(s.coverage).toBe(1);
    // Load-weighted mean is pulled toward the heavier SSG, above the flat average (72.5).
    expect(s.meanIntensityPct).toBeGreaterThan(72);
  });

  it("handles an empty plan", () => {
    const s = predictSession([], ref);
    expect(s.totalLoad).toBeNull();
    expect(s.totalDurationMin).toBe(0);
    expect(s.drills).toHaveLength(0);
  });
});

describe("predictSquadSession", () => {
  it("predicts the plan for every player with a reference", () => {
    const drills: PlannedDrill[] = [{ id: "1", label: "SSG", durationMin: 8, targetPct: 90 }];
    const weaker: CapacityReference = { byBand: { ...ref.byBand, "5-15": 8 }, overall: 8, drills: 40 };
    const out = predictSquadSession(drills, [
      { playerId: "p1", name: "Strong", reference: ref },
      { playerId: "p2", name: "Weaker", reference: weaker },
    ]);
    expect(out).toHaveLength(2);
    // Same planned drill → the higher-capacity player accumulates more absolute load.
    expect((out[0].prediction.totalLoad ?? 0)).toBeGreaterThan(out[1].prediction.totalLoad ?? 0);
  });
});
