import { describe, it, expect } from "vitest";
import { flightTimeMsFromJumpHeightCm, ftCtRatio, normalizedRfd } from "../cmjDerived";
import { classifyPhaseChange } from "../phaseChange";
import { aggregateTrialsByTest } from "../trialAggregate";

describe("cmjDerived — FT:CT and normalised RFD", () => {
  it("derives flight time from jump height via the projectile relation", () => {
    // h = g·t²/8 → for 30 cm, t = √(8·0.30/9.81) ≈ 0.4946 s ≈ 495 ms
    const ft = flightTimeMsFromJumpHeightCm(30)!;
    expect(ft).toBeGreaterThan(490);
    expect(ft).toBeLessThan(500);
    expect(flightTimeMsFromJumpHeightCm(0)).toBeNull();
    expect(flightTimeMsFromJumpHeightCm(null)).toBeNull();
  });

  it("FT:CT prefers a measured flight time, else derives it; null without CT", () => {
    const derived = ftCtRatio({ jumpHeightCm: 30, contractionTimeMs: 700 })!;
    expect(derived).toBeCloseTo(495 / 700, 1);
    // Measured flight time wins over the derived one.
    const measured = ftCtRatio({ flightTimeMs: 520, jumpHeightCm: 30, contractionTimeMs: 700 })!;
    expect(measured).toBeCloseTo(520 / 700, 5);
    expect(ftCtRatio({ jumpHeightCm: 30, contractionTimeMs: 0 })).toBeNull();
    expect(ftCtRatio({ contractionTimeMs: 700 })).toBeNull();
  });

  it("normalised RFD = rfd / peak force, null when either missing", () => {
    expect(normalizedRfd(5000, 2000)).toBeCloseTo(2.5, 5);
    expect(normalizedRfd(5000, 0)).toBeNull();
    expect(normalizedRfd(null, 2000)).toBeNull();
  });
});

describe("CV gate applies to the new metrics", () => {
  it("FT:CT: a drop beyond its noise floor flags; a within-CV wobble does not", () => {
    const real = classifyPhaseChange({ metric: "ftCtRatio", latest: 0.75, baselineValues: [0.9, 0.9, 0.9] });
    expect(real.status).toBe("real");
    expect(real.worse).toBe(true);
    const noise = classifyPhaseChange({ metric: "ftCtRatio", latest: 0.88, baselineValues: [0.9, 0.9, 0.9] });
    expect(noise.status).toBe("noise");
  });

  it("early RFD: a >21% drop clears the gate; a small dip stays noise", () => {
    const real = classifyPhaseChange({ metric: "rfdEarly", latest: 22, baselineValues: [30, 30, 30] });
    expect(real.status).toBe("real");
    const noise = classifyPhaseChange({ metric: "rfdEarly", latest: 29, baselineValues: [30, 30, 30] });
    expect(noise.status).toBe("noise");
  });

  it("no baseline → insufficient (honest empty state, e.g. rfd_n_s not synced yet)", () => {
    const r = classifyPhaseChange({ metric: "rfdEarly", latest: null, baselineValues: [] });
    expect(r.status).toBe("insufficient");
  });
});

describe("mean-of-repeats (Edwards 2018; Claudino 2017)", () => {
  it("aggregates the MEAN of a test's trials, not the best jump", () => {
    const rows = [40, 44, 48].map((v, i) => ({
      rawTestId: "t1",
      testTimestamp: `2026-08-0${i + 1}T10:00:00Z`,
      metrics: { jumpHeight: v },
    }));
    const [agg] = aggregateTrialsByTest(rows, ["jumpHeight"]);
    expect(agg.trialCount).toBe(3);
    expect(agg.metrics.jumpHeight).toBe(44); // mean, not the best (48)
  });
});
