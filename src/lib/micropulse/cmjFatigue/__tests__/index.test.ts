import { describe, it, expect } from "vitest";
import {
  computeCmjSlope,
  classifyFatigueType,
  computeCmjRecoveryDeficit,
  computeCmjFatigue,
  type CmjPoint,
} from "../index";

/** Build a jump series: one point per day back from a base date. */
function series(values: number[], startDate = "2026-08-01"): CmjPoint[] {
  return values.map((v, i) => {
    const d = new Date(`${startDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { ts: d.toISOString(), value: v };
  });
}

describe("computeCmjSlope", () => {
  it("returns null with fewer than 4 tests", () => {
    const r = computeCmjSlope(series([40, 39, 38]));
    expect(r.slopeZ).toBeNull();
    expect(r.nTests).toBe(3);
  });

  it("reads a declining multi-day trend as a negative personal-SD slope", () => {
    const r = computeCmjSlope(series([42, 41, 40, 39, 38, 37]));
    expect(r.slopeZ).not.toBeNull();
    expect(r.slopeZ!).toBeLessThan(-1); // a clear multi-day drop > 1 personal SD
    expect(r.nTests).toBe(6);
  });

  it("reads a flat series as ~0 slope", () => {
    const r = computeCmjSlope(series([40, 40.1, 39.9, 40, 40.05, 39.95]));
    expect(Math.abs(r.slopeZ ?? 99)).toBeLessThan(1);
  });

  it("returns null when all tests share one timestamp (no time spread)", () => {
    const pts = [40, 39, 41, 40].map((v) => ({ ts: "2026-08-01T12:00:00Z", value: v }));
    expect(computeCmjSlope(pts).slopeZ).toBeNull();
  });
});

describe("classifyFatigueType", () => {
  it("returns null when the CMJ is not fatigued (nothing to locate)", () => {
    expect(classifyFatigueType({ cmjFatigued: false, sorenessZ: -2, sleepZ: -2 })).toBeNull();
  });
  it("CMJ down + sore -> peripheral", () => {
    expect(classifyFatigueType({ cmjFatigued: true, sorenessZ: -1.5, sleepZ: 0 })).toBe("peripheral");
  });
  it("CMJ down + poor sleep, normal soreness -> central", () => {
    expect(classifyFatigueType({ cmjFatigued: true, sorenessZ: 0, sleepZ: -1.5 })).toBe("central");
  });
  it("CMJ down + both -> mixed", () => {
    expect(classifyFatigueType({ cmjFatigued: true, sorenessZ: -1.5, sleepZ: -1.5 })).toBe("mixed");
  });
  it("CMJ down + neither companion -> peripheral (the jump drop is itself peripheral-metabolic)", () => {
    expect(classifyFatigueType({ cmjFatigued: true, sorenessZ: 0, sleepZ: 0 })).toBe("peripheral");
  });
});

describe("computeCmjRecoveryDeficit", () => {
  it("null band (missing match HSR) -> null deficit", () => {
    expect(computeCmjRecoveryDeficit({ matchHsr: null, hoursPostMatch: 24, observedPctOfBaseline: 90 }).deficit).toBeNull();
  });
  it("on-track (within the noise band) -> 0", () => {
    // 900 m HSR at 24 h models a small dip; an observed 98% sits inside the band.
    const r = computeCmjRecoveryDeficit({ matchHsr: 900, hoursPostMatch: 24, observedPctOfBaseline: 98 });
    expect(r.deficit).toBe(0);
  });
  it("well below the band -> positive deficit, labelled slow", () => {
    const r = computeCmjRecoveryDeficit({ matchHsr: 900, hoursPostMatch: 24, observedPctOfBaseline: 80 });
    expect(r.label).toBe("slow");
    expect(r.deficit!).toBeGreaterThan(0);
  });
});

describe("computeCmjFatigue", () => {
  it("honest empty state with no data", () => {
    const r = computeCmjFatigue({ jumps: [] });
    expect(r.hasData).toBe(false);
    expect(r.cmjFatigued).toBe(false);
    expect(r.fatigueType).toBeNull();
    expect(r.verdict.en).toMatch(/No CMJ trend/);
  });

  it("declining slope + sore -> fatigued, peripheral, cited facts", () => {
    const r = computeCmjFatigue({
      jumps: series([42, 41, 40, 39, 38, 37]),
      latestJump: 37,
      baselineMean: 41,
      baselineSd: 1.5,
      sorenessZ: -1.5,
      sleepZ: 0,
    });
    expect(r.cmjFatigued).toBe(true);
    expect(r.fatigueType).toBe("peripheral");
    expect(r.cmjSlopeZ!).toBeLessThan(-1);
    expect(r.citation).toMatch(/Neyroud 2016/);
    expect(r.facts.length).toBeGreaterThan(0);
    expect(r.confidence).toBe("high"); // 6 tests
  });

  it("steady jump reads not-fatigued", () => {
    const r = computeCmjFatigue({
      jumps: series([40, 40, 40, 40]),
      latestJump: 40,
      baselineMean: 40,
      baselineSd: 1,
      sorenessZ: 0,
      sleepZ: 0,
    });
    expect(r.cmjFatigued).toBe(false);
    expect(r.fatigueType).toBeNull();
  });
});
