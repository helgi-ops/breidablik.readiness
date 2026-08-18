import { describe, it, expect } from "vitest";
import { computeCriticalSpeed, computeCriticalSpeedFromTests, computeCriticalSpeedCombined, computeAnaerobicTank, computeFieldTestZones, computeAnaerobicSpeedReserve, computeCriticalSpeedFrom3MT, computeSprintCost } from "../criticalSpeed";
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

  it("combined: drops a too-fast LONG MII window (physically impossible) and fits anchor + valid short window", () => {
    // anchor 4-min max = 1000 m (250 m/min). MII: 1-min 300 m/min (fast burst, valid short) ;
    // 5-min 260 m/min (> the 4-min max pace → impossible over a longer window → must be dropped).
    const r = computeCriticalSpeedCombined(curve({ 1: 300, 5: 260 }), [{ durationMin: 4, distanceM: 1000 }]);
    expect(r.usedTestAnchor).toBe(true);
    expect(r.droppedMiiPoints).toBeGreaterThanOrEqual(1); // the 5-min window
    expect(r.fitPoints.map((p) => p.t)).toEqual([1, 4]);   // 5-min gone
    // CS = (1000-300)/(4-1) = 233.3 m/min ; D′ = 300 - 233.3 = 66.7
    expect(r.csMetresPerMin).toBeCloseTo(233.3, 0);
    expect(r.dPrimeM).toBe(67);
    expect(r.csMetresPerMin! > 0).toBe(true);
  });

  it("combined: a rich fit (fast short + slower long) → 3 points, sane CS, high confidence", () => {
    // Valgeir-like: anchor 4-min 1134 m (283.5). MII 1-min 285.1 (valid short), 3-min 252.9
    // (sub-maximal short → dropped), 5-min 243 (valid long: slower + more distance).
    const r = computeCriticalSpeedCombined(curve({ 1: 285.1, 3: 252.9, 5: 243 }), [{ durationMin: 4, distanceM: 1134 }]);
    expect(r.fitPoints.map((p) => p.t)).toEqual([1, 4, 5]); // 3-min dropped
    expect(r.csKmh).toBeCloseTo(14.6, 0);
    expect(r.rSquared!).toBeGreaterThan(0.9);
    expect(r.confidence).toBe("high");
  });

  it("combined: only the anchor survives (all peaks sub-maximal) → asks for a second effort, no number", () => {
    // David-like: 4-min max 1180 (295 m/min) beats every MII window → nothing valid remains.
    const r = computeCriticalSpeedCombined(curve({ 1: 232, 3: 182, 5: 174 }), [{ durationMin: 4, distanceM: 1180 }]);
    expect(r.usedTestAnchor).toBe(true);
    expect(r.csMetresPerMin).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.verdict.en).toMatch(/shorter all-out effort|second/i);
  });

  it("combined: two near-adjacent windows (span < 2 min) is rejected as degenerate", () => {
    // anchor 4-min 1000 (250) + valid 5-min 210 (1050 m) → span 1 min → no reliable slope.
    const r = computeCriticalSpeedCombined(curve({ 5: 210 }), [{ durationMin: 4, distanceM: 1000 }]);
    expect(r.csMetresPerMin).toBeNull();
    expect(r.usedTestAnchor).toBe(true);
  });

  it("combined: no test anchor → falls back to the MII estimate, flagged usedTestAnchor:false", () => {
    const r = computeCriticalSpeedCombined(curve({ 1: 190, 3: 170, 5: 160 }), []);
    expect(r.usedTestAnchor).toBe(false);
    expect(r.csMetresPerMin).toBeCloseTo(152.5, 0);
    expect(r.fitPoints.length).toBe(3);
  });

  it("anaerobic tank: Kristófer-like → ~9 tankfuls, repeated-sprint lean", () => {
    // D′ 72 m, match HSR 662 m → 662/72 = 9.2 tankfuls.
    const t = computeAnaerobicTank({ dPrimeM: 72, aboveCsDistanceM: 662, matchDate: "2026-08-16", minutes: 77 });
    expect(t).not.toBeNull();
    expect(t!.tankfuls).toBeCloseTo(9.2, 1);
    expect(t!.profile.en).toMatch(/repeated-sprint/);
    expect(t!.verdict.en).toMatch(/~9×/);
    expect(t!.matchDate).toBe("2026-08-16");
  });

  it("anaerobic tank: few large bursts → single big-effort lean", () => {
    const t = computeAnaerobicTank({ dPrimeM: 150, aboveCsDistanceM: 450 }); // 3 tankfuls
    expect(t!.tankfuls).toBeCloseTo(3, 1);
    expect(t!.profile.en).toMatch(/single big-effort/);
  });

  it("anaerobic tank: no valid D′ or no above-CS distance → null (no guess)", () => {
    expect(computeAnaerobicTank({ dPrimeM: null, aboveCsDistanceM: 662 })).toBeNull();
    expect(computeAnaerobicTank({ dPrimeM: 72, aboveCsDistanceM: 0 })).toBeNull();
    expect(computeAnaerobicTank({ dPrimeM: 0, aboveCsDistanceM: 662 })).toBeNull();
  });

  it("field-test zones: Ágúst-like 4-min 1015 m → MAS 15.2 km/h + prescribable zones + provisional CS band", () => {
    const z = computeFieldTestZones({ durationMin: 4, distanceM: 1015 });
    expect(z).not.toBeNull();
    expect(z!.masKmh).toBeCloseTo(15.2, 1);          // 1015/4=253.75 m/min → 15.2 km/h
    expect(z!.masMPerMin).toBe(254);
    expect(z!.estCsKmhLow).toBeCloseTo(12.9, 1);     // 85% of 15.2
    expect(z!.estCsKmhHigh).toBeCloseTo(13.7, 1);    // 90%
    const mas = z!.zones.find((x) => x.key === "mas")!;
    const speed = z!.zones.find((x) => x.key === "speed")!;
    expect(mas.kmh).toBeCloseTo(15.2, 1);
    expect(speed.kmh).toBeCloseTo(18.3, 1);          // 120% MAS
    expect(z!.zones).toHaveLength(6);
    // Rep distances: MAS 253.75 m/min → 30 s = 127 m; VO₂ 110% → 15 s ≈ 70 m.
    expect(mas.reps.map((r) => r.sec)).toEqual([15, 30, 45]);
    expect(mas.reps.find((r) => r.sec === 30)!.m).toBe(127);
    const vo2 = z!.zones.find((x) => x.key === "vo2")!;
    expect(vo2.reps.find((r) => r.sec === 15)!.m).toBe(70);
  });

  it("field-test zones: null with no valid effort", () => {
    expect(computeFieldTestZones(null)).toBeNull();
    expect(computeFieldTestZones({ durationMin: 0, distanceM: 1000 })).toBeNull();
  });

  it("ASR: Ágúst-like MAS 15.2 + MSS 34.4 → ASR ~19.2 km/h with %ASR anchors", () => {
    const a = computeAnaerobicSpeedReserve({ masKmh: 15.2, mssKmh: 34.4 });
    expect(a).not.toBeNull();
    expect(a!.asrKmh).toBeCloseTo(19.2, 1);
    expect(a!.anchors.map((x) => x.pctAsr)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(a!.anchors[0].kmh).toBeCloseTo(15.2, 1);   // 0% ASR = MAS
    expect(a!.anchors[4].kmh).toBeCloseTo(34.4, 1);   // 100% ASR = MSS
    expect(a!.anchors[2].kmh).toBeCloseTo(24.8, 1);   // 50% ASR = MAS + 9.6
  });

  it("ASR: null unless MSS > MAS > 0; exposes squad percentile", () => {
    expect(computeAnaerobicSpeedReserve({ masKmh: 15, mssKmh: 14 })).toBeNull(); // mss ≤ mas
    expect(computeAnaerobicSpeedReserve({ masKmh: null, mssKmh: 30 })).toBeNull();
    const a = computeAnaerobicSpeedReserve({ masKmh: 15, mssKmh: 34, squadAsr: [12, 14, 16, 19, 22] });
    expect(a!.percentile).not.toBeNull();
  });

  it("3MT: end speed 14 km/h + 1050 m over 3 min → CS 14 km/h, D′ = 1050 − 233.3·3 ≈ 350 m", () => {
    const r = computeCriticalSpeedFrom3MT({ endSpeedKmh: 14, totalDistanceM: 1050, durationS: 180 });
    expect(r.csKmh).toBeCloseTo(14, 1);
    // CS 14 km/h = 233.3 m/min; D′ = 1050 − 233.3×3 = 350
    expect(r.dPrimeM).toBe(350);
    expect(r.confidence).toBe("high");
    expect(r.nPoints).toBe(1);
  });

  it("3MT: a finish faster than the whole-test average (negative D′) is rejected as not all-out", () => {
    // 700 m in 3 min = 233 m/min avg (14 km/h); an end speed of 16 km/h > avg → impossible → invalid
    const r = computeCriticalSpeedFrom3MT({ endSpeedKmh: 16, totalDistanceM: 700, durationS: 180 });
    expect(r.csMetresPerMin).toBeNull();
    expect(r.confidence).toBe("low");
  });

  it("exposes squad percentiles when supplied", () => {
    const r = computeCriticalSpeed(curve({ 1: 190, 3: 170, 5: 160 }), {
      sessions: 21, squadCs: [120, 130, 140, 152.5, 160], squadDPrime: [10, 20, 30, 42.5, 60],
    });
    expect(r.csPercentile).not.toBeNull();
    expect(r.dPrimePercentile).not.toBeNull();
  });
});

describe("computeSprintCost", () => {
  it("costs a sprint as (speed − CS) × duration and divides D′ by it", () => {
    // CS 15 km/h, D′ 120 m, no MSS → fixed offsets +6/+10/+14, 3 s sprints.
    const r = computeSprintCost({ csKmh: 15, dPrimeM: 120 })!;
    expect(r).not.toBeNull();
    expect(r.usesMss).toBe(false);
    expect(r.refDurationSec).toBe(3);
    // max sprint = CS+14 = 29 km/h → 14 km/h above CS = 3.889 m/s × 3 s = 11.67 m
    const max = r.rows[r.rows.length - 1];
    expect(max.aboveCsKmh).toBe(14);
    expect(max.costM).toBeCloseTo(11.7, 1);
    // 120 ÷ 11.67 ≈ 10.3 sprints to empty
    expect(max.sprintsToEmpty).toBeCloseTo(10.3, 1);
    // faster sprint costs more, so fewer sprints before empty
    expect(r.rows[0].sprintsToEmpty).toBeGreaterThan(max.sprintsToEmpty);
  });

  it("anchors intensities on the player's own MSS when given", () => {
    const r = computeSprintCost({ csKmh: 15, dPrimeM: 120, mssKmh: 32 })!;
    expect(r.usesMss).toBe(true);
    // top row is the max sprint at MSS exactly
    expect(r.rows[r.rows.length - 1].speedKmh).toBe(32);
  });

  it("returns null without a valid CS + D′", () => {
    expect(computeSprintCost({ csKmh: null, dPrimeM: 120 })).toBeNull();
    expect(computeSprintCost({ csKmh: 15, dPrimeM: 0 })).toBeNull();
    expect(computeSprintCost({ csKmh: 0, dPrimeM: 120 })).toBeNull();
  });
});
