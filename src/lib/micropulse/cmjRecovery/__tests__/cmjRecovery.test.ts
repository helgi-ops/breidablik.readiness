import { describe, it, expect } from "vitest";
import {
  expectedCmjBand,
  classifyRecovery,
  recoveryTimeShape,
  recoverySlopeFromLabel,
  recoveryContextLine,
} from "../index";
import { hoursPostMatch } from "../loader";

describe("expectedCmjBand — HSR-scaled, time-decaying", () => {
  it("a high-HSR match models a deeper 24 h dip than a low-HSR match", () => {
    const high = expectedCmjBand({ matchHsr: 1200, hoursPostMatch: 24 })!; // 6% dip
    const low = expectedCmjBand({ matchHsr: 200, hoursPostMatch: 24 })!; // 1% dip
    expect(high.expectedPct).toBeLessThan(low.expectedPct);
    expect(high.expectedPct).toBeCloseTo(94, 1);
    expect(low.expectedPct).toBeCloseTo(99, 1);
  });

  it("the dip recovers over time (72 h shallower than 24 h, gone by 96 h)", () => {
    const at24 = expectedCmjBand({ matchHsr: 1200, hoursPostMatch: 24 })!;
    const at72 = expectedCmjBand({ matchHsr: 1200, hoursPostMatch: 72 })!;
    const at96 = expectedCmjBand({ matchHsr: 1200, hoursPostMatch: 96 })!;
    expect(at72.expectedPct).toBeGreaterThan(at24.expectedPct); // recovering
    expect(at72.expectedPct).toBeLessThan(100); // still impaired at 72 h (Silva 2018)
    expect(at96.expectedPct).toBeCloseTo(100, 5); // recovered by ~96 h
  });

  it("time shape: 1 through 48 h, 0.5 at 72 h, 0 by 96 h", () => {
    expect(recoveryTimeShape(24)).toBe(1);
    expect(recoveryTimeShape(48)).toBe(1);
    expect(recoveryTimeShape(72)).toBeCloseTo(0.5, 5);
    expect(recoveryTimeShape(96)).toBe(0);
  });

  it("personalisation override replaces the literature seed", () => {
    const seeded = expectedCmjBand({ matchHsr: 1200, hoursPostMatch: 24 })!;
    const personal = expectedCmjBand({ matchHsr: 1200, hoursPostMatch: 24, dip24PctOverride: 12 })!;
    expect(personal.expectedPct).toBeCloseTo(88, 5);
    expect(personal.expectedPct).toBeLessThan(seeded.expectedPct);
  });

  it("missing HSR or hour offset → no band (no fabrication)", () => {
    expect(expectedCmjBand({ matchHsr: null, hoursPostMatch: 24 })).toBeNull();
    expect(expectedCmjBand({ matchHsr: 1200, hoursPostMatch: null })).toBeNull();
  });
});

describe("classifyRecovery", () => {
  const band = expectedCmjBand({ matchHsr: 1200, hoursPostMatch: 48 })!; // expected ~94%, band ~86–102

  it("below the band → slow → maps to a TISSUE (slow) slope", () => {
    expect(classifyRecovery(80, band)).toBe("slow");
    expect(recoverySlopeFromLabel("slow")).toBe("slow");
  });

  it("inside the band → on_track; above → ahead → fast slope", () => {
    expect(classifyRecovery(94, band)).toBe("on_track");
    expect(classifyRecovery(105, band)).toBe("ahead");
    expect(recoverySlopeFromLabel("ahead")).toBe("fast");
    expect(recoverySlopeFromLabel("on_track")).toBe("unknown");
  });

  it("no band or no observed value → null verdict", () => {
    expect(classifyRecovery(90, null)).toBeNull();
    expect(classifyRecovery(null, band)).toBeNull();
  });
});

describe("recoveryContextLine", () => {
  it("carries the numbers, HSR provenance and a citation, bilingually", () => {
    const band = expectedCmjBand({ matchHsr: 1200, hoursPostMatch: 48 })!;
    const line = recoveryContextLine(80, band, classifyRecovery(80, band))!;
    expect(line.en).toMatch(/48 h post-match/);
    expect(line.en).toMatch(/80% of baseline/);
    expect(line.en).toMatch(/Hader 2019/);
    expect(line.en).toMatch(/slower than expected/);
    expect(line.is).toMatch(/hægar en vænst/);
    expect(recoveryContextLine(90, null, null)).toBeNull();
  });
});

describe("hoursPostMatch (match/HSR join helper)", () => {
  it("maps day offsets to hour buckets (MD+1→24, MD+2→48, MD+3→72)", () => {
    expect(hoursPostMatch("2026-08-01", "2026-08-02")).toBe(24);
    expect(hoursPostMatch("2026-08-01", "2026-08-03")).toBe(48);
    expect(hoursPostMatch("2026-08-01", "2026-08-04")).toBe(72);
  });

  it("null match date, or a future match, → null (no verdict)", () => {
    expect(hoursPostMatch(null, "2026-08-02")).toBeNull();
    expect(hoursPostMatch("2026-08-05", "2026-08-02")).toBeNull();
  });
});
