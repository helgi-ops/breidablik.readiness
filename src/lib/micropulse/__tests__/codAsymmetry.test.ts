import { describe, it, expect } from "vitest";
import { asymPct, codFlag, favoredSide, codFootednessNote } from "../codAsymmetry";

describe("codAsymmetry helpers (Bishop 2020 · Havanecz 2026)", () => {
  it("asymPct is the gap as a % of the larger side; null with no volume", () => {
    expect(asymPct(100, 100)).toBe(0);
    expect(asymPct(100, 85)).toBeCloseTo(15, 5);
    expect(asymPct(0, 0)).toBeNull();
  });

  it("codFlag follows Bishop thresholds (9/15/18)", () => {
    expect(codFlag(null)).toBe("no_data");
    expect(codFlag(5)).toBe("ok");
    expect(codFlag(9)).toBe("watch");
    expect(codFlag(15)).toBe("concern");
    expect(codFlag(18)).toBe("high");
  });

  it("favoredSide is 'balanced' below the watch threshold, else the heavier side", () => {
    expect(favoredSide(100, 100)).toBe("balanced");
    expect(favoredSide(100, 104)).toBe("balanced"); // < 9%
    expect(favoredSide(100, 130)).toBe("right");
    expect(favoredSide(130, 100)).toBe("left");
  });

  it("footedness note names the dominant foot, cites Havanecz, and flags on magnitude not direction", () => {
    const flagged = codFootednessNote("right", 200, 100); // right-footed, 50% lean — flagged
    expect(flagged.en).toContain("right-footed");
    expect(flagged.en).toMatch(/Havanecz/);
    expect(flagged.en).toMatch(/Bishop/); // magnitude is the flag
    const balanced = codFootednessNote("left", 100, 100);
    expect(balanced.en).toMatch(/balanced/i);
    const noFoot = codFootednessNote(null, 200, 100);
    expect(noFoot.en).toMatch(/not set/i);
  });
});
