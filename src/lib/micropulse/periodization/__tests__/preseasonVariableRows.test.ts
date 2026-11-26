import { describe, expect, it } from "vitest";
import { preseasonVariableRows } from "../preseasonVariableRows";
import { kpiTmRefRange } from "../plannedVolume";
import { PRESEASON_DEFAULT_WEEK1 } from "../preseasonWindow";
import type { PreseasonWeekTarget } from "../preseasonStart";

const wk = (i: number, mult: number, byKpi: Record<string, number>, taper = false): PreseasonWeekTarget => ({
  weekIndex: i, multipleOfMatch: mult, weeklyLoadTarget: null, perSessionLoad: null, sessionCount: 4, byKpi, sRpeAuTarget: null,
  taper, note: { en: "", is: "" }, anchor: "match_this_season", confidence: "high",
});

// Match: 10 000 m distance, 600 m HSR. Week 1 → peak (week 3) → light week (week 4).
const ramp = [
  wk(1, 1.2, { totalDistance: 15000, velocityBand5: 600 }),
  wk(2, 2.0, { totalDistance: 22000, velocityBand5: 1200 }),
  wk(3, 3.0, { totalDistance: 30000, velocityBand5: 1800 }),
  wk(4, 1.8, { totalDistance: 18000, velocityBand5: 1080 }, true),
];
const proposal = wk(1, PRESEASON_DEFAULT_WEEK1, { totalDistance: 12000, velocityBand5: 600 });
const matchKpi = { totalDistance: 10000, velocityBand5: 600 };

describe("preseasonVariableRows", () => {
  it("week 1 → peak → light week as × a match, the overall row last", () => {
    const r = preseasonVariableRows({ ramp, kpiKeys: ["totalDistance", "velocityBand5"], proposal, matchKpi, week1Kpi: { totalDistance: 15000 }, week1Mult: PRESEASON_DEFAULT_WEEK1 });
    expect(r.peakNo).toBe(3);
    expect(r.lightNo).toBe(4);
    expect(r.rows.map((x) => x.k)).toEqual(["totalDistance", "velocityBand5", "totalPlayerLoad"]);
    const dist = r.rows[0];
    expect([dist.w1, dist.pk, dist.lt, dist.prop]).toEqual([1.5, 3, 1.8, 1.2]);
    expect(dist.w1Raw).toBe(15000);
    expect(dist.mine).toBe(true); // the coach set week-1 distance
    expect(dist.ref).toEqual(kpiTmRefRange("totalDistance"));
    expect(r.rows[1].mine).toBe(false);
    const all = r.rows[2];
    expect([all.w1, all.pk, all.lt, all.prop, all.mine]).toEqual([1.2, 3, 1.8, PRESEASON_DEFAULT_WEEK1, false]);
  });

  it("no light week → peak is the heaviest week; a variable without a match value is left out", () => {
    const noTaper = ramp.slice(0, 3);
    const r = preseasonVariableRows({ ramp: noTaper, kpiKeys: ["totalDistance", "velocityBand6"], proposal, matchKpi, week1Kpi: {}, week1Mult: 1.4 });
    expect(r.lightNo).toBeNull();
    expect(r.peakNo).toBe(3);
    expect(r.rows.map((x) => x.k)).toEqual(["totalDistance", "totalPlayerLoad"]);
    expect(r.rows[0].lt).toBeNull();
    expect(r.rows[1].mine).toBe(true); // 1.4 ≠ the default week 1 → the coach set it
  });
});
