import { describe, it, expect } from "vitest";
import { deriveFitnessTest, isFitnessTestType, FITNESS_TEST_TYPES, FITNESS_TESTS } from "../fitnessTests";

describe("fitnessTests derivations", () => {
  it("4-min run → MAS = distance/4 in km/h", () => {
    // 1015 m / 4 = 253.75 m/min → ×0.06 = 15.2 km/h
    expect(deriveFitnessTest("mas_run_4min", 1015).masKmh).toBeCloseTo(15.2, 1);
    expect(deriveFitnessTest("mas_run_4min", 1015).vo2maxEst).toBeNull();
  });

  it("Yo-Yo IR1 distance → VO₂max (Bangsbo), no MAS", () => {
    // 0.0084×2000 + 36.4 = 53.2
    const d = deriveFitnessTest("yo_yo_ir1", 2000);
    expect(d.vo2maxEst).toBeCloseTo(53.2, 1);
    expect(d.masKmh).toBeNull();
  });

  it("Yo-Yo IR2 uses its own regression", () => {
    // 0.0136×1000 + 45.3 = 58.9
    expect(deriveFitnessTest("yo_yo_ir2", 1000).vo2maxEst).toBeCloseTo(58.9, 1);
  });

  it("beep level → MAS from final running speed 8 + 0.5·(L−1)", () => {
    // level 12.5 → floor 12 → 8 + 0.5×11 = 13.5 km/h
    expect(deriveFitnessTest("msft_beep", 12.5).masKmh).toBeCloseTo(13.5, 1);
    expect(deriveFitnessTest("msft_beep", 12.5).vo2maxEst).toBeNull(); // needs age
  });

  it("VAMEVAL result IS MAS", () => {
    expect(deriveFitnessTest("mas_vameval", 16.5).masKmh).toBe(16.5);
  });

  it("30-15 IFT, line drill, 17s, sprint → no fabricated MAS/VO₂max", () => {
    for (const t of ["ift_30_15", "line_drill", "suicide_17s", "sprint_max"] as const) {
      expect(deriveFitnessTest(t, 20)).toEqual({ masKmh: null, vo2maxEst: null });
    }
  });

  it("unknown type or bad result → nulls, and the type guard works", () => {
    expect(isFitnessTestType("mas_run_4min")).toBe(true);
    expect(isFitnessTestType("nope")).toBe(false);
    expect(deriveFitnessTest("nope", 1000)).toEqual({ masKmh: null, vo2maxEst: null });
    expect(deriveFitnessTest("mas_run_4min", NaN)).toEqual({ masKmh: null, vo2maxEst: null });
  });

  it("every registered type has a unit and bilingual labels", () => {
    expect(FITNESS_TEST_TYPES.length).toBe(9);
    for (const t of FITNESS_TEST_TYPES) {
      const def = FITNESS_TESTS[t];
      expect(def.unit).toBeTruthy();
      expect(def.label.en && def.label.is).toBeTruthy();
      expect(def.resultLabel.en && def.resultLabel.is).toBeTruthy();
    }
  });
});
