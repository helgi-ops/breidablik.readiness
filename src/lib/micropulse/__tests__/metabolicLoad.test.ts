/**
 * Tests for metabolicLoad.ts
 *
 * Run with:  npx vitest src/lib/micropulse/__tests__/metabolicLoad.test.ts
 * (after adding vitest to devDependencies: npm i -D vitest)
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  computeZScore,
  clamp,
  computeMetabolicBaseline,
  computeMetabolicLoadScore,
  classifyMetabolicLoadBand,
  classifyFatigueType,
  getMetabolicRecommendationCode,
  computeMetabolicLoad,
  METABOLIC_CONFIG,
  type MetabolicLoadSourceRow,
} from "../metabolicLoad";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeRow(
  date: string,
  overrides: Partial<Omit<MetabolicLoadSourceRow, "date">> = {},
): MetabolicLoadSourceRow {
  return {
    date,
    metabolic_power: 14,
    metabolic_power_peak: 35,
    high_metabolic_load_distance_m: 1200,
    time_above_hml_threshold_s: 420,
    metabolic_data_valid: true,
    ...overrides,
  };
}

/** 30 valid rows before a target date, steady baseline. */
function makeHistoricalRows(targetDate: string, count = 30): MetabolicLoadSourceRow[] {
  const rows: MetabolicLoadSourceRow[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(`${targetDate}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    rows.push(makeRow(date));
  }
  return rows;
}

// ─── computeZScore ───────────────────────────────────────────────────────────

describe("computeZScore", () => {
  it("returns the correct z-score", () => {
    expect(computeZScore(16, 14, 2)).toBeCloseTo(1.0, 3);
  });

  it("returns null when std is 0", () => {
    expect(computeZScore(14, 14, 0)).toBeNull();
  });

  it("returns null when any input is null", () => {
    expect(computeZScore(null, 14, 2)).toBeNull();
    expect(computeZScore(14, null, 2)).toBeNull();
    expect(computeZScore(14, 14, null)).toBeNull();
  });

  it("handles negative z-scores", () => {
    expect(computeZScore(10, 14, 2)).toBeCloseTo(-2.0, 3);
  });
});

// ─── clamp ───────────────────────────────────────────────────────────────────

describe("clamp", () => {
  it("clamps below min", () => expect(clamp(-10, 0, 100)).toBe(0));
  it("clamps above max", () => expect(clamp(150, 0, 100)).toBe(100));
  it("passes through in-range values", () => expect(clamp(50, 0, 100)).toBe(50));
});

// ─── computeMetabolicBaseline ─────────────────────────────────────────────────

describe("computeMetabolicBaseline", () => {
  it("returns correct sample count", () => {
    const rows = makeHistoricalRows("2026-03-27", 20);
    const baseline = computeMetabolicBaseline(rows, "2026-03-27");
    expect(baseline.sampleCount).toBe(20);
  });

  it("returns null stats when no valid rows exist", () => {
    const rows = makeHistoricalRows("2026-03-27", 10).map((r) => ({
      ...r,
      metabolic_data_valid: false,
    }));
    const baseline = computeMetabolicBaseline(rows, "2026-03-27");
    expect(baseline.sampleCount).toBe(0);
    expect(baseline.avgPowerMean).toBeNull();
  });

  it("excludes the target date from baseline", () => {
    const rows = [
      ...makeHistoricalRows("2026-03-27", 10),
      makeRow("2026-03-27", { metabolic_power: 999 }),
    ];
    const baseline = computeMetabolicBaseline(rows, "2026-03-27");
    // 999 should NOT influence baseline
    expect(baseline.avgPowerMean).not.toBeNull();
    expect((baseline.avgPowerMean ?? 0)).toBeLessThan(20);
  });

  it("respects the 28-day window", () => {
    // 40 rows before target date; only last 28 should be used
    const rows = makeHistoricalRows("2026-03-27", 40);
    const baseline = computeMetabolicBaseline(rows, "2026-03-27");
    expect(baseline.sampleCount).toBe(28);
  });
});

// ─── computeMetabolicLoadScore ─────────────────────────────────────────────────

describe("computeMetabolicLoadScore", () => {
  it("returns null score when metabolic_data_valid is false", () => {
    const rows = makeHistoricalRows("2026-03-27", 10);
    const baseline = computeMetabolicBaseline(rows, "2026-03-27");
    const result = computeMetabolicLoadScore({
      metabolicPowerAvg: 14,
      metabolicPowerPeak: 35,
      hmlDistance: 1200,
      timeAboveThreshold: 420,
      metabolicDataValid: false,
      baseline,
    });
    expect(result.metabolicLoadScore).toBeNull();
    expect(result.metabolicLoadBand).toBeNull();
  });

  it("returns null score when fewer than 2 z-scores available", () => {
    // baseline with null mean/std (no data)
    const result = computeMetabolicLoadScore({
      metabolicPowerAvg: null,
      metabolicPowerPeak: null,
      hmlDistance: 1200,
      timeAboveThreshold: null,
      metabolicDataValid: true,
      baseline: {
        avgPowerMean: null,
        avgPowerStd: null,
        peakPowerMean: null,
        peakPowerStd: null,
        hmlDistanceMean: null,
        hmlDistanceStd: null,
        timeAboveThresholdMean: null,
        timeAboveThresholdStd: null,
        sampleCount: 0,
      },
    });
    expect(result.metabolicLoadScore).toBeNull();
  });

  it("produces a score near 50 for average-intensity session", () => {
    const rows = makeHistoricalRows("2026-03-27", 20);
    const baseline = computeMetabolicBaseline(rows, "2026-03-27");
    // Session with same values as baseline mean → z-scores ≈ 0 → score ≈ 50
    const result = computeMetabolicLoadScore({
      metabolicPowerAvg: baseline.avgPowerMean ?? 14,
      metabolicPowerPeak: baseline.peakPowerMean ?? 35,
      hmlDistance: baseline.hmlDistanceMean ?? 1200,
      timeAboveThreshold: baseline.timeAboveThresholdMean ?? 420,
      metabolicDataValid: true,
      baseline,
    });
    expect(result.metabolicLoadScore).not.toBeNull();
    expect(result.metabolicLoadScore!).toBeGreaterThanOrEqual(40);
    expect(result.metabolicLoadScore!).toBeLessThanOrEqual(60);
  });

  it("clamps score to 0–100", () => {
    const rows = makeHistoricalRows("2026-03-27", 20);
    const baseline = computeMetabolicBaseline(rows, "2026-03-27");
    // Extremely high session → should clamp to 100
    const result = computeMetabolicLoadScore({
      metabolicPowerAvg: 9999,
      metabolicPowerPeak: 9999,
      hmlDistance: 99999,
      timeAboveThreshold: 9999,
      metabolicDataValid: true,
      baseline,
    });
    expect(result.metabolicLoadScore).toBeLessThanOrEqual(100);
    expect(result.metabolicLoadScore).toBeGreaterThanOrEqual(0);
  });
});

// ─── classifyMetabolicLoadBand ─────────────────────────────────────────────────

describe("classifyMetabolicLoadBand", () => {
  it("returns null for null score", () => {
    expect(classifyMetabolicLoadBand(null)).toBeNull();
  });

  const { bands } = METABOLIC_CONFIG;

  it("returns 'low' for score below moderate threshold", () => {
    expect(classifyMetabolicLoadBand(bands.moderate - 1)).toBe("low");
  });

  it("returns 'moderate' at moderate threshold", () => {
    expect(classifyMetabolicLoadBand(bands.moderate)).toBe("moderate");
  });

  it("returns 'high' at high threshold", () => {
    expect(classifyMetabolicLoadBand(bands.high)).toBe("high");
  });

  it("returns 'very_high' at very_high threshold", () => {
    expect(classifyMetabolicLoadBand(bands.very_high)).toBe("very_high");
  });
});

// ─── classifyFatigueType ────────────────────────────────────────────────────────

describe("classifyFatigueType", () => {
  it("returns 'normal' when both scores are low", () => {
    expect(classifyFatigueType({ mechanicalLoadScore: 40, metabolicLoadScore: 40 })).toBe("normal");
  });

  it("returns 'mechanical_fatigue' when only mechanical is high", () => {
    expect(classifyFatigueType({ mechanicalLoadScore: 70, metabolicLoadScore: 40 })).toBe("mechanical_fatigue");
  });

  it("returns 'metabolic_fatigue' when only metabolic is high", () => {
    expect(classifyFatigueType({ mechanicalLoadScore: 40, metabolicLoadScore: 70 })).toBe("metabolic_fatigue");
  });

  it("returns 'global_fatigue' when both are high", () => {
    expect(classifyFatigueType({ mechanicalLoadScore: 70, metabolicLoadScore: 70 })).toBe("global_fatigue");
  });

  it("returns 'recovery_mismatch' when flag is set and neither score is high", () => {
    expect(classifyFatigueType({ mechanicalLoadScore: 40, metabolicLoadScore: 40, recoveryMismatch: true })).toBe("recovery_mismatch");
  });

  it("returns 'global_fatigue' over 'recovery_mismatch' when both loads are high", () => {
    expect(classifyFatigueType({ mechanicalLoadScore: 70, metabolicLoadScore: 70, recoveryMismatch: true })).toBe("global_fatigue");
  });

  it("handles null scores gracefully", () => {
    expect(classifyFatigueType({ mechanicalLoadScore: null, metabolicLoadScore: null })).toBe("normal");
  });
});

// ─── getMetabolicRecommendationCode ──────────────────────────────────────────────

describe("getMetabolicRecommendationCode", () => {
  it("maps fatigue types to correct codes", () => {
    expect(getMetabolicRecommendationCode("metabolic_fatigue")).toBe("REDUCE_CONDITIONING");
    expect(getMetabolicRecommendationCode("global_fatigue")).toBe("REDUCE_TOTAL_LOAD");
    expect(getMetabolicRecommendationCode("recovery_mismatch")).toBe("RECOVERY_EMPHASIS");
    expect(getMetabolicRecommendationCode("mechanical_fatigue")).toBe("MONITOR_RESPONSE");
    expect(getMetabolicRecommendationCode("normal")).toBe("NO_METABOLIC_FLAG");
  });
});

// ─── computeMetabolicLoad (full pipeline) ─────────────────────────────────────

describe("computeMetabolicLoad", () => {
  it("returns null when target date has no row", () => {
    const rows = makeHistoricalRows("2026-03-27", 10);
    expect(computeMetabolicLoad(rows, "2026-03-28")).toBeNull();
  });

  it("returns a result with all expected fields", () => {
    const rows = [
      ...makeHistoricalRows("2026-03-27", 20),
      makeRow("2026-03-27"),
    ];
    const result = computeMetabolicLoad(rows, "2026-03-27");
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("metabolicLoadScore");
    expect(result).toHaveProperty("metabolicLoadBand");
    expect(result).toHaveProperty("fatigueType");
    expect(result).toHaveProperty("recommendationCode");
    expect(result).toHaveProperty("dataConfidenceMetabolic");
  });

  it("integrates mechanical load score for fatigue classification", () => {
    const rows = [
      ...makeHistoricalRows("2026-03-27", 20),
      makeRow("2026-03-27", { metabolic_power: 9999, metabolic_power_peak: 9999, high_metabolic_load_distance_m: 99999 }),
    ];
    const result = computeMetabolicLoad(rows, "2026-03-27", 80);
    expect(result?.fatigueType).toBe("global_fatigue");
  });

  it("handles indoor session (metabolic_data_valid = false)", () => {
    const rows = [
      ...makeHistoricalRows("2026-03-27", 20),
      makeRow("2026-03-27", { metabolic_data_valid: false }),
    ];
    const result = computeMetabolicLoad(rows, "2026-03-27");
    expect(result).not.toBeNull();
    expect(result!.metabolicLoadScore).toBeNull();
    expect(result!.metabolicLoadBand).toBeNull();
  });

  it("handles zero-std baseline gracefully (no division by zero)", () => {
    // All historical rows identical → std = 0 → z-scores should be null
    const rows: MetabolicLoadSourceRow[] = Array.from({ length: 20 }, (_, i) => {
      const d = new Date("2026-03-27T00:00:00.000Z");
      d.setUTCDate(d.getUTCDate() - (i + 1));
      return makeRow(d.toISOString().slice(0, 10), { metabolic_power: 14 });
    });
    rows.push(makeRow("2026-03-27", { metabolic_power: 14 }));
    expect(() => computeMetabolicLoad(rows, "2026-03-27")).not.toThrow();
  });
});
