import { describe, it, expect } from "vitest";
import { computeCriticalSpeed, computeCriticalSpeedFromTests } from "../criticalSpeed";
import type { PowerCurve } from "../peakPeriod";

/** Build a distance PowerCurve from per-minute (m/min) values keyed by window minutes. */
function curve(perMin: Record<number, number>): PowerCurve {
  return {
    metric: "distance", unit: "m/min",
    points: Object.entries(perMin).map(([w, v]) => ({ windowMin: Number(w), value: v, index: null })),
  };
}

describe("computeCriticalSpeed", () => {
  it("fits the worked example: per-min {190,170,160} → CS≈152.5 m/min (≈9.1 km/h), D′≈42.5 m, R²≈0.99", () => {
    // distances {190, 510, 800} m at {1,3,5} min
    const r = computeCriticalSpeed(curve({ 1: 190, 3: 170, 5: 160 }), { sessions: 21 });
    expect(r.csMetresPerMin).toBeCloseTo(152.5, 0);
    expect(r.csKmh).toBeCloseTo(9.15, 1);
    expect(r.csMs).toBeCloseTo(2.54, 1);
    expect(r.dPrimeM).toBe(43); // 42.5 rounded
    expect(r.rSquared!).toBeGreaterThan(0.99);
    expect(r.nPoints).toBe(3);
  });

  it("gives high confidence with a mature, tight, 3-point fit", () => {
    const r = computeCriticalSpeed(curve({ 1: 190, 3: 170, 5: 160 }), { sessions: 8 });
    expect(r.confidence).toBe("high");
  });

  it("is low confidence when sessions are immature even with a good fit", () => {
    const r = computeCriticalSpeed(curve({ 1: 190, 3: 170, 5: 160 }), { sessions: 2 });
    expect(r.confidence).toBe("low");
  });

  it("fits a 2-point curve (exact line, but low confidence: <3 points)", () => {
    const r = computeCriticalSpeed(curve({ 1: 200, 5: 160 }), { sessions: 21 });
    // D {200, 800} at {1,5} → CS = (800-200)/(5-1) = 150; D′ = 200 - 150 = 50
    expect(r.csMetresPerMin).toBeCloseTo(150, 0);
    expect(r.dPrimeM).toBe(50);
    expect(r.nPoints).toBe(2);
    expect(r.confidence).toBe("low");
  });

  it("a flat per-minute curve fits CS = the pace, D′ ≈ 0 (line through origin)", () => {
    const r = computeCriticalSpeed(curve({ 1: 150, 3: 150, 5: 150 }), { sessions: 21 });
    // D {150,450,750} at {1,3,5} → perfectly linear through origin
    expect(r.csMetresPerMin).toBeCloseTo(150, 0);
    expect(r.dPrimeM).toBe(0);
    expect(r.rSquared!).toBeGreaterThan(0.999);
  });

  it("returns an insufficient read with <2 valid points", () => {
    const r = computeCriticalSpeed(curve({ 3: 170 }), { sessions: 21 });
    expect(r.csMetresPerMin).toBeNull();
    expect(r.dPrimeM).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.verdict.en).toMatch(/not enough/i);
    expect(computeCriticalSpeed(null).csMetresPerMin).toBeNull();
  });

  it("treats a pathological curve (per-min rising → negative D′) as invalid, not data", () => {
    // per-min INCREASING with window is physiologically wrong → intercept goes negative
    const r = computeCriticalSpeed(curve({ 1: 100, 3: 150, 5: 180 }), { sessions: 21 });
    expect(r.csMetresPerMin).toBeNull();
    expect(r.dPrimeM).toBeNull();
    expect(r.confidence).toBe("low");
  });

  it("test path: one 4-min effort → max-speed benchmark, no CS fit yet", () => {
    const r = computeCriticalSpeedFromTests([{ durationMin: 4, distanceM: 1000 }]);
    expect(r.efforts).toBe(1);
    expect(r.cs).toBeNull();
    expect(r.maxEffort?.kmh).toBeCloseTo(15, 0); // 1000 m / 4 min = 250 m/min = 15 km/h
    expect(r.verdict.en).toMatch(/second all-out effort/i);
  });

  it("test path: two efforts → a true test-based CS/D′ fit (not gated on session maturity)", () => {
    // {1min: 340 m, 4min: 1100 m} → CS = (1100-340)/(4-1) = 253.3 m/min; D′ = 340-253.3 = 86.7
    const r = computeCriticalSpeedFromTests([{ durationMin: 1, distanceM: 340 }, { durationMin: 4, distanceM: 1100 }]);
    expect(r.efforts).toBe(2);
    expect(r.cs).not.toBeNull();
    expect(r.cs!.csMetresPerMin).toBeCloseTo(253.3, 0);
    expect(r.cs!.dPrimeM).toBe(87);
    expect(r.cs!.confidence).toBe("medium"); // real test, 2 points → medium (not low)
  });

  it("exposes squad percentiles when supplied", () => {
    const r = computeCriticalSpeed(curve({ 1: 190, 3: 170, 5: 160 }), {
      sessions: 21, squadCs: [120, 130, 140, 152.5, 160], squadDPrime: [10, 20, 30, 42.5, 60],
    });
    expect(r.csPercentile).not.toBeNull();
    expect(r.dPrimePercentile).not.toBeNull();
  });
});
