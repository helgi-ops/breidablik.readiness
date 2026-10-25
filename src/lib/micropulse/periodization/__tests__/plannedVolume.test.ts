import { describe, it, expect } from "vitest";
import { standardTrainingDays, weeklyTrainingMultiple, weeklyKpiMultiple, kpiVolumes, mesoWeeklyMultiples, mesoTotalMultiple } from "../plannedVolume";

describe("standardTrainingDays", () => {
  it("fewer training days as fixture congestion rises", () => {
    expect(standardTrainingDays(1)).toEqual(["MD-4", "MD-3", "MD-2", "MD-1"]);
    expect(standardTrainingDays(2).length).toBe(3);
    expect(standardTrainingDays(3).length).toBe(2);
    expect(standardTrainingDays(0).length).toBe(5);
    expect(standardTrainingDays(1)).not.toContain("MD"); // match excluded
  });
});

describe("weeklyTrainingMultiple (volume, e=1)", () => {
  it("sums the MD-day match-%s for a 1-match week (68+85+50+32 = 235% = 2.35×)", () => {
    expect(weeklyTrainingMultiple(standardTrainingDays(1))).toBeCloseTo(2.35, 2);
  });
  it("total weekly exposure (training + match) lands in Martín-García's 3–5× range for 1 match", () => {
    const total = weeklyTrainingMultiple(standardTrainingDays(1)) + 1;
    expect(total).toBeGreaterThanOrEqual(3);
    expect(total).toBeLessThanOrEqual(5);
  });
});

describe("per-KPI taper", () => {
  const days = standardTrainingDays(1);
  it("high-intensity KPIs accumulate a SMALLER ×match than volume (HSR < distance, sprint < HSR)", () => {
    const td = weeklyKpiMultiple(days, "totalDistance");   // e=1 → 2.35
    const hsr = weeklyKpiMultiple(days, "velocityBand5");   // e=1.5
    const sprint = weeklyKpiMultiple(days, "velocityBand6"); // e=2.0
    expect(td).toBeCloseTo(2.35, 2);
    expect(hsr).toBeLessThan(td);
    expect(sprint).toBeLessThan(hsr);
    expect(sprint).toBeGreaterThan(1); // still accumulates more than one match
  });
  it("an unknown KPI defaults to the volume multiple (e=1)", () => {
    expect(weeklyKpiMultiple(days, "fmpDynamicMedium")).toBeLessThan(weeklyKpiMultiple(days, "totalDistance") + 0.001);
  });
});

describe("kpiVolumes", () => {
  const days = standardTrainingDays(1);
  it("scales each KPI by its OWN tapered multiple", () => {
    const vols = kpiVolumes({ totalDistance: 10000, velocityBand6: 300 }, days);
    const td = vols.find((v) => v.key === "totalDistance")!;
    const sprint = vols.find((v) => v.key === "velocityBand6")!;
    expect(td.multiple).toBeCloseTo(2.35, 2);
    expect(td.weeklyValue).toBe(23500);
    expect(sprint.multiple).toBeLessThan(td.multiple); // sprint tapers harder
    expect(sprint.weeklyValue).toBe(Math.round(300 * sprint.multiple));
  });
  it("skips missing/non-finite KPIs", () => {
    expect(kpiVolumes({ totalDistance: undefined, velocityBand5: 600 }, days).map((v) => v.key)).toEqual(["velocityBand5"]);
  });
});

describe("mesoWeeklyMultiples", () => {
  it("ramps loading weeks and deloads the last by default", () => {
    const weeks = mesoWeeklyMultiples({ numWeeks: 4, baseMultiple: 2.4, stepPct: 10 });
    expect(weeks).toHaveLength(4);
    expect(weeks[0].multiple).toBeCloseTo(2.4, 2);
    expect(weeks[1].multiple).toBeGreaterThan(weeks[0].multiple);
    expect(weeks[2].multiple).toBeGreaterThan(weeks[1].multiple);
    expect(weeks[3].isDeload).toBe(true);
    expect(weeks[3].multiple).toBeCloseTo(2.4 * 0.6, 2);
  });
  it("respects an explicit deload week", () => {
    const weeks = mesoWeeklyMultiples({ numWeeks: 4, baseMultiple: 2, stepPct: 10, deloadWeek: 2 });
    expect(weeks[1].isDeload).toBe(true);
    expect(weeks.filter((w) => w.isDeload)).toHaveLength(1);
  });
  it("mesoTotalMultiple sums the block", () => {
    const weeks = mesoWeeklyMultiples({ numWeeks: 3, baseMultiple: 2, stepPct: 0 });
    expect(mesoTotalMultiple(weeks)).toBeCloseTo(2 + 2 + 2 * 0.6, 2);
  });
});
