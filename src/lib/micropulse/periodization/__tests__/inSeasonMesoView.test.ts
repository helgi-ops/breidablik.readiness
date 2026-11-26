import { describe, expect, it } from "vitest";
import {
  blockVolumeView, calWeekMultiple, gamesInRange, gamesInWeek, inSeasonRuleBreaks, minMax, sessionsInWeek, RULE_MD2, RULE_THREE,
} from "../inSeasonMesoView";
import {
  kpiTmRefRange, kpiVolumes, mesoTotalMultiple, mesoWeeklyMultiples, standardTrainingDays, weeklyKpiMultiple, weeklyTrainingMultiple,
} from "../plannedVolume";
import type { WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

const MATCH: Partial<Record<WeeklyLoadMetricKey, number>> = { totalPlayerLoad: 900, totalDistance: 10500, velocityBand5: 800, velocityBand6: 220, accelB23: 60, decelB23: 70 };

// The In-season tab's own maths before the mirror (page.tsx), so the view can never drift from it.
function oldTab(numWeeks: number, stepPct: number, deloadWeek: number | null, light?: boolean) {
  const days1 = standardTrainingDays(1);
  const wkMult = weeklyTrainingMultiple(days1);
  const vols = kpiVolumes(MATCH, days1);
  const meso = mesoWeeklyMultiples({ numWeeks, baseMultiple: wkMult, stepPct, deloadWeek, light });
  const rampFactor = (w: { multiple: number }) => (wkMult > 0 ? w.multiple / wkMult : 0);
  const kpiWkMult = (k: WeeklyLoadMetricKey, w: { multiple: number }) => Math.round(weeklyKpiMultiple(days1, k) * rampFactor(w) * 100) / 100;
  return { wkMult, vols, meso, blockTotal: mesoTotalMultiple(meso), kpiWkMult, total: Math.round((wkMult + 1) * 10) / 10 };
}

describe("blockVolumeView", () => {
  it("gives exactly the numbers the In-season tab showed (hold block)", () => {
    const o = oldTab(4, 0, null);
    const v = blockVolumeView({ matchKpis: MATCH, numWeeks: 4, stepPct: 0, deloadWeek: null });
    expect(v.weekMultiple).toBe(o.wkMult);
    expect(v.totalWithMatch).toBe(o.total);
    expect(v.weeks).toEqual(o.meso);
    expect(v.blockTotal).toBe(o.blockTotal);
    expect(v.rows.map((r) => [r.key, r.week, r.weekRaw, r.matchValue])).toEqual(o.vols.map((x) => [x.key, x.multiple, x.weeklyValue, x.matchValue]));
    expect(v.rows.map((r) => r.ref)).toEqual(o.vols.map((x) => kpiTmRefRange(x.key)));
  });

  it("a hold block: weeks the same, no peak, no light week", () => {
    const v = blockVolumeView({ matchKpis: MATCH, numWeeks: 4, stepPct: 0, deloadWeek: null });
    expect(v.weeksDiffer).toBe(false);
    expect(v.lightIdx).toBe(-1);
    expect(v.rows.every((r) => r.peak == null && r.light == null)).toBe(true);
  });

  it("a ramp with a deload: the per-week values match the old week-by-week table", () => {
    const o = oldTab(4, 5, 4);
    const v = blockVolumeView({ matchKpis: MATCH, numWeeks: 4, stepPct: 5, deloadWeek: 4 });
    expect(v.weeksDiffer).toBe(true);
    expect(v.lightIdx).toBe(3);
    expect(v.peakIdx).toBe(2);
    expect(v.weeks[3].multiple).toBe(Math.round(o.wkMult * 0.6 * 100) / 100);
    for (const k of ["totalDistance", "velocityBand5"] as WeeklyLoadMetricKey[])
      o.meso.forEach((w, i) => expect(v.weekKpi(k, i)).toBe(o.kpiWkMult(k, w)));
    const hsr = v.rows.find((r) => r.key === "velocityBand5")!;
    expect(hsr.peak).toBe(o.kpiWkMult("velocityBand5", o.meso[2]));
    expect(hsr.light).toBe(o.kpiWkMult("velocityBand5", o.meso[3]));
  });

  it("an in-season light week stays on its ramp (not the 0.6 deload)", () => {
    const o = oldTab(4, 0, 2, true);
    const v = blockVolumeView({ matchKpis: MATCH, numWeeks: 4, stepPct: 0, deloadWeek: 2, light: true });
    expect(v.weeks).toEqual(o.meso);
    expect(v.weeks[1].isLight).toBe(true);
    expect(v.lightIdx).toBe(1);
  });

  it("no match values → no rows", () => {
    expect(blockVolumeView({ matchKpis: {}, numWeeks: 4, stepPct: 0, deloadWeek: null }).rows).toEqual([]);
  });

  it("marks each variable against its research range", () => {
    const v = blockVolumeView({ matchKpis: MATCH, numWeeks: 4, stepPct: 0, deloadWeek: null });
    for (const r of v.rows) {
      if (!r.ref) { expect(r.band).toBeNull(); continue; }
      expect(r.band).toBe(r.week < r.ref[0] ? "below" : r.week > r.ref[1] ? "above" : "in");
    }
  });
});

describe("inSeasonRuleBreaks", () => {
  // Week of Mon 2026-06-01; a match on Sat 6 June.
  const wk = (types: string[]) => [{ weekStart: "2026-06-08", days: types.map((type) => ({ type })) }];
  const season = { start: "2026-04-01", end: "2026-10-31" };

  it("marks a session on MD+2", () => {
    const r = inSeasonRuleBreaks(wk(["session", "rest", "rest", "rest", "rest", "rest", "rest"].map((t) => (t === "session" ? "mixed" : t))), ["2026-06-06"], season);
    expect(r.get("2026-06-08")).toEqual(RULE_MD2);
  });

  it("does not mark MD+2 when there was a match the day before too", () => {
    const r = inSeasonRuleBreaks(wk(["mixed", "rest", "rest", "rest", "rest", "rest", "rest"]), ["2026-06-06", "2026-06-07"], season);
    expect(r.has("2026-06-08")).toBe(false);
  });

  it("ignores days outside the in-season range, and returns nothing without one", () => {
    expect(inSeasonRuleBreaks(wk(["mixed", "rest", "rest", "rest", "rest", "rest", "rest"]), ["2026-06-06"], { start: "2026-07-01", end: "2026-10-31" }).size).toBe(0);
    expect(inSeasonRuleBreaks(wk(["mixed", "rest", "rest", "rest", "rest", "rest", "rest"]), ["2026-06-06"], null).size).toBe(0);
  });

  it("an empty block has no marks", () => {
    expect(inSeasonRuleBreaks([], [], season).size).toBe(0);
  });

  it("marks three training days in a row (every day of the run)", () => {
    // Mon–Wed sessions, Thu off, Fri activation, Sat match (13 June), Sun off.
    const r = inSeasonRuleBreaks(wk(["mixed", "locomotive", "mechanical", "rest", "activation", "match", "rest"]), ["2026-06-13"], season);
    expect(r.get("2026-06-08")).toEqual(RULE_THREE);
    expect(r.get("2026-06-09")).toEqual(RULE_THREE);
    expect(r.get("2026-06-10")).toEqual(RULE_THREE);
    expect(r.has("2026-06-12")).toBe(false);
  });

  it("two in a row is fine, and a match breaks a run", () => {
    expect(inSeasonRuleBreaks(wk(["mixed", "locomotive", "rest", "mechanical", "activation", "match", "rest"]), ["2026-06-13"], season).size).toBe(0);
    expect(inSeasonRuleBreaks(wk(["rest", "rest", "mechanical", "activation", "match", "mixed", "rest"]), ["2026-06-12"], season).size).toBe(0);
  });

  it("a run across two weeks is marked", () => {
    const two = [
      { weekStart: "2026-06-08", days: ["rest", "rest", "rest", "rest", "rest", "mixed", "mechanical"].map((type) => ({ type })) },
      { weekStart: "2026-06-15", days: ["locomotive", "rest", "rest", "rest", "rest", "rest", "rest"].map((type) => ({ type })) },
    ];
    const r = inSeasonRuleBreaks(two, [], season);
    expect([...r.keys()].sort()).toEqual(["2026-06-13", "2026-06-14", "2026-06-15"]);
  });

  it("MD+2 wins when a day breaks both rules", () => {
    // Match Sat 6 June → Mon 8 is MD+2; Mon–Wed is also three in a row.
    const r = inSeasonRuleBreaks(wk(["mixed", "locomotive", "mechanical", "rest", "rest", "rest", "rest"]), ["2026-06-06"], season);
    expect(r.get("2026-06-08")).toEqual(RULE_MD2);
    expect(r.get("2026-06-09")).toEqual(RULE_THREE);
  });
});

describe("calendar week reads", () => {
  it("the week in × a match is what its days add up to", () => {
    expect(calWeekMultiple({ pctMech: 235, days: [] })).toBe(2.35);
    expect(calWeekMultiple({ pctMech: null, days: [] })).toBeNull();
    expect(calWeekMultiple(null)).toBeNull();
  });

  it("counts sessions: not off, not the match", () => {
    expect(sessionsInWeek({ days: ["topup", "rest", "mechanical", "locomotive", "activation", "match", "rest"].map((type) => ({ type })) })).toBe(4);
  });

  it("min–max over the weeks, skipping gaps", () => {
    expect(minMax([2.1, null, 2.4, 1.8])).toEqual([1.8, 2.4]);
    expect(minMax([null])).toBeNull();
  });

  it("games: start inclusive, end exclusive, sorted", () => {
    const fx = ["2026-06-13", "2026-06-06", "2026-06-20"];
    expect(gamesInRange(fx, "2026-06-06", "2026-06-20")).toEqual(["2026-06-06", "2026-06-13"]);
    expect(gamesInWeek(fx, "2026-06-08")).toEqual(["2026-06-13"]);
  });
});
