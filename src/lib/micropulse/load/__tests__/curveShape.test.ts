import { describe, it, expect } from "vitest";
import { classifyCurveShape, EXPLOSIVE_RETENTION, ENGINE_RETENTION } from "../curveShape";
import type { PowerCurve } from "../peakPeriod";

// Build a player_load curve from (windowMin, value) pairs.
const curve = (pairs: Array<[number, number]>): PowerCurve => ({
  metric: "player_load",
  unit: "AU/min",
  points: pairs.map(([w, v]) => ({ windowMin: w, value: v, index: null })),
});

describe("classifyCurveShape", () => {
  it("calls a steep curve (short peak fades fast) EXPLOSIVE", () => {
    // 30s=24 → 5min=8 → retention 33% (≤ 40).
    const read = classifyCurveShape(curve([[0.5, 24], [1, 18], [5, 8]]));
    expect(read.shape).toBe("explosive");
    expect(read.retentionPct).toBeLessThanOrEqual(EXPLOSIVE_RETENTION);
    expect(read.shortWindowMin).toBe(0.5);
    expect(read.longWindowMin).toBe(5);
  });

  it("calls a flat curve (holds intensity) ENGINE", () => {
    // 30s=16 → 5min=11 → retention ~69% (≥ 55).
    const read = classifyCurveShape(curve([[0.5, 16], [1, 14], [5, 11]]));
    expect(read.shape).toBe("engine");
    expect(read.retentionPct).toBeGreaterThanOrEqual(ENGINE_RETENTION);
  });

  it("calls a mid-retention curve BALANCED", () => {
    // 30s=20 → 5min=9.4 → retention 47% (between 40 and 55).
    const read = classifyCurveShape(curve([[0.5, 20], [5, 9.4]]));
    expect(read.shape).toBe("balanced");
  });

  it("calls a low-ceiling-everywhere player UNDER-CONDITIONED when a squad benchmark is given", () => {
    // His short 10 & long 4 are the LOWEST vs the squad pools → both 0th pctile.
    const read = classifyCurveShape(curve([[0.5, 10], [5, 4]]), {
      squadShort: [10, 20, 24, 28],
      squadLong: [4, 8, 10, 12],
    });
    expect(read.shape).toBe("under_conditioned");
    expect(read.shortPercentile).toBe(0);
  });

  it("does NOT call under-conditioned for a top-ceiling explosive player", () => {
    // Steep retention (explosive) but his peaks are the HIGHEST vs squad → not under-conditioned.
    const read = classifyCurveShape(curve([[0.5, 30], [5, 9]]), {
      squadShort: [10, 20, 24, 30],
      squadLong: [4, 8, 9, 9],
    });
    expect(read.shape).toBe("explosive");
  });

  it("returns insufficient without ≥2 windows or a real curve", () => {
    expect(classifyCurveShape(null).shape).toBe("insufficient");
    expect(classifyCurveShape(curve([[1, 20]])).shape).toBe("insufficient");
    expect(classifyCurveShape(curve([])).shape).toBe("insufficient");
  });
});
