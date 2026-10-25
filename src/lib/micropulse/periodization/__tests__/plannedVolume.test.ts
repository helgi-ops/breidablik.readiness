import { describe, it, expect } from "vitest";
import { standardTrainingDays, weeklyTrainingMultiple, kpiVolumes, mesoWeeklyMultiples, mesoTotalMultiple } from "../plannedVolume";

describe("standardTrainingDays", () => {
  it("fewer training days as fixture congestion rises", () => {
    expect(standardTrainingDays(1)).toEqual(["MD-4", "MD-3", "MD-2", "MD-1"]);
    expect(standardTrainingDays(2).length).toBe(3);
    expect(standardTrainingDays(3).length).toBe(2);
    expect(standardTrainingDays(0).length).toBe(5);
    expect(standardTrainingDays(1)).not.toContain("MD"); // match excluded
  });
});

describe("weeklyTrainingMultiple", () => {
  it("sums the MD-day match-%s for a 1-match week (MD-4 68 + MD-3 85 + MD-2 50 + MD-1 32 = 235% = 2.35×)", () => {
    expect(weeklyTrainingMultiple(standardTrainingDays(1))).toBeCloseTo(2.35, 2);
  });
  it("a congested week is lower", () => {
    expect(weeklyTrainingMultiple(standardTrainingDays(3))).toBeLessThan(weeklyTrainingMultiple(standardTrainingDays(1)));
  });
  it("total weekly exposure (training + match) lands in Martín-García's 3–5× range for 1 match", () => {
    const total = weeklyTrainingMultiple(standardTrainingDays(1)) + 1; // + the match
    expect(total).toBeGreaterThanOrEqual(3);
    expect(total).toBeLessThanOrEqual(5);
  });
});

describe("kpiVolumes", () => {
  it("scales each KPI's match value by the weekly multiple", () => {
    const vols = kpiVolumes({ totalDistance: 10000, velocityBand5: 600 }, 2.35);
    const td = vols.find((v) => v.key === "totalDistance")!;
    expect(td.matchValue).toBe(10000);
    expect(td.weeklyValue).toBe(23500);
    expect(td.unit).toBeTruthy();
  });
  it("skips missing/non-finite KPIs", () => {
    expect(kpiVolumes({ totalDistance: undefined, velocityBand5: 600 }, 2).map((v) => v.key)).toEqual(["velocityBand5"]);
  });
});

describe("mesoWeeklyMultiples", () => {
  it("ramps loading weeks and deloads the last by default", () => {
    const weeks = mesoWeeklyMultiples({ numWeeks: 4, baseMultiple: 2.4, stepPct: 10 });
    expect(weeks).toHaveLength(4);
    expect(weeks[0].multiple).toBeCloseTo(2.4, 2);       // base
    expect(weeks[1].multiple).toBeGreaterThan(weeks[0].multiple); // ramps
    expect(weeks[2].multiple).toBeGreaterThan(weeks[1].multiple);
    expect(weeks[3].isDeload).toBe(true);                // last week deloads
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
