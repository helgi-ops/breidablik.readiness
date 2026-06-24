/**
 * Tests for intensityVerdict — capability-driven "work rate vs his own usual day".
 * Run: npx vitest src/lib/micropulse/__tests__/intensityVerdict.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { computeIntensityVerdict } from "../intensityVerdict";

// PL/min baseline: mean 10, sd ~0.78 (12×10 + one 8 + one 12) → 14 mature days.
const PL_HIST = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 8, 12];

const v = (today, hist = { pl_per_min: PL_HIST }) =>
  computeIntensityVerdict({ playerId: "p1", firstName: "Jón", today, history: hist });

describe("intensityVerdict — gating + confidence", () => {
  it("unavailable when the primary baseline is immature (<8 days)", () => {
    const r = computeIntensityVerdict({ playerId: "p1", today: { pl_per_min: 12 }, history: { pl_per_min: [10, 10, 10, 10, 10] } });
    expect(r.available).toBe(false);
    expect(r.band).toBeNull();
  });
  it("unavailable when today's PL/min is missing", () => {
    expect(v({ pl_per_min: null }).available).toBe(false);
  });
  it("confident only when PL/min baseline is active (≥14 days)", () => {
    const calibrating = computeIntensityVerdict({ playerId: "p1", today: { pl_per_min: 10 }, history: { pl_per_min: PL_HIST.slice(0, 10) } });
    expect(calibrating.available).toBe(true);
    expect(calibrating.confident).toBe(false);
    expect(v({ pl_per_min: 10 }).confident).toBe(true);
  });
});

describe("intensityVerdict — bands vs own usual", () => {
  it("today at the usual mean → typical", () => {
    expect(v({ pl_per_min: 10 }).band).toBe("typical");
  });
  it("clearly above → spiking", () => {
    const r = v({ pl_per_min: 12.5 });
    expect(r.band).toBe("spiking");
    expect(r.z).toBeGreaterThan(2);
  });
  it("clearly below → easier", () => {
    expect(v({ pl_per_min: 8 }).band).toBe("easier");
  });
});

describe("intensityVerdict — coverage DEGRADES with fewer signals (Core vs Pro)", () => {
  it("only PL/min present → coverage 1/3", () => {
    expect(v({ pl_per_min: 12.5 }).coverage).toBeCloseTo(0.33, 2);
  });
  it("all three present → coverage 1.0, corroborating drivers named", () => {
    // varied baselines (non-zero sd) so an elevated today reads as a driver
    const HML_HIST = [900, 1000, 1100, 950, 1050, 1000, 900, 1100, 1000, 950, 1050, 1000, 900, 1100];
    const HSR_HIST = [450, 500, 550, 480, 520, 500, 450, 550, 500, 480, 520, 500, 450, 550];
    const r = computeIntensityVerdict({
      playerId: "p1", firstName: "Jón",
      today: { pl_per_min: 12.5, hml: 1700, hsr: 950 },
      history: { pl_per_min: PL_HIST, hml: HML_HIST, hsr: HSR_HIST },
    });
    expect(r.coverage).toBe(1);
    // PL/min + HML + HSR all elevated → all three are named drivers
    const keys = r.drivers.map((d) => d.key);
    expect(keys).toContain("pl_per_min");
    expect(keys).toContain("hml");
    expect(keys).toContain("hsr");
  });
  it("a Core club (PL/min only) reads LOWER coverage than a Pro club (all three) on the same logic", () => {
    const core = v({ pl_per_min: 12.5 }).coverage;
    const pro = computeIntensityVerdict({
      playerId: "p1", today: { pl_per_min: 12.5, hml: 1600, hsr: 900 },
      history: { pl_per_min: PL_HIST, hml: Array(14).fill(1000), hsr: Array(14).fill(500) },
    }).coverage;
    expect(core).toBeLessThan(pro);
  });
});

describe("intensityVerdict — explainability", () => {
  it("elevated days carry a headline + counterfactual; typical days do not", () => {
    const hot = v({ pl_per_min: 12.5 });
    expect(hot.headline?.EN).toMatch(/work rate/i);
    expect(hot.counterfactual).not.toBeNull();
    expect(v({ pl_per_min: 10 }).counterfactual).toBeNull();
  });
});
