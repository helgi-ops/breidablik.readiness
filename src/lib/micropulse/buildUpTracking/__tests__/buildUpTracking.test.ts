import { describe, it, expect } from "vitest";
import type { Bi, CalDay, CalWeek, CalendarBlock, CalType, MatchUnitAbs } from "@/lib/micropulse/periodization";
import { computeBuildUpAdherence, type WeekActual } from "../index";

const bi = (s: string): Bi => ({ en: s, is: s });

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A training day carrying only the GPS spine (accHiEff/decHiEff/stride null → a
 *  Lite/GPS-only feed; those KPIs must not be scored). */
function trainDay(dist: number, hsr: number, load: number): CalDay {
  return {
    dow: bi("Mon"), md: "MD-4", type: "mechanical" as CalType, label: bi("Strength"), focus: bi("x"),
    dist, hsr, load, accHiEff: null, decHiEff: null, stride: null, dir: null,
  };
}
function restDay(type: CalType = "rest"): CalDay {
  return { dow: bi("Sun"), md: "", type, label: bi("Rest"), focus: bi("x"), dist: null, hsr: null, load: null, accHiEff: null, decHiEff: null, stride: null, dir: null };
}

// 3 training days/week → planned weekly totals dist 3000 / hsr 600 / load 300.
function week(index: number, weekStart: string): CalWeek {
  const days: CalDay[] = [
    trainDay(1000, 200, 100), trainDay(1000, 200, 100), trainDay(1000, 200, 100),
    restDay(), restDay(), restDay(), restDay(),
  ];
  return { index, weekStart, intent: bi("Build"), matchDow: bi(""), mult: 1, isDeload: false, days, pctRunning: null, pctHsr: null, pctMech: null, pctAccDec23: null, pctStride: null, restDays: 4, capNote: null };
}

const UNIT: MatchUnitAbs = {
  dist: 10000, hsr: 900, load: 700, accdec: 60, accHiEff: null, decHiEff: null, stride: null,
  dirFwd: null, dirBack: null, dirLat: null, rhie: null, symmetry: null, metPower: null,
};

function makeBlock(start: string, n: number): CalendarBlock {
  const weeks: CalWeek[] = [];
  for (let i = 0; i < n; i++) weeks.push(week(i, addDays(start, i * 7)));
  return { unit: UNIT, scopeName: "Test", scopePos: null, phase: bi("Pre-season"), numWeeks: n, startDate: start, weeks, legend: [], notes: [] };
}

const START = "2026-01-05"; // Monday
const block = makeBlock(START, 3);

const actual: WeekActual[] = [
  { weekStart: addDays(START, 0), trainingDays: 3, byKpi: { dist: 2900, hsr: 590, load: 290 } }, // ~97% → on
  { weekStart: addDays(START, 7), trainingDays: 2, byKpi: { dist: 1900, hsr: 400, load: 200 } }, // ~63% → behind
  { weekStart: addDays(START, 14), trainingDays: 4, byKpi: { dist: 3800, hsr: 720, load: 360 } }, // 127% → ahead + spike vs 1900
];

describe("computeBuildUpAdherence", () => {
  it("phase-gates on chronic-baseline maturity", () => {
    const cold = computeBuildUpAdherence({ block, actualWeeks: actual, asOf: "2026-01-26", daysObserved: 5, planConfidence: "high" });
    expect(cold.phase).toBe("plan_relative");
    expect(cold.acwr).toBeNull(); // ACWR hidden at cold start

    const mid = computeBuildUpAdherence({ block, actualWeeks: actual, asOf: "2026-01-26", daysObserved: 12, planConfidence: "high", acwr: { ratio: 1.2, band: "SAFE", daysObserved: 12 } });
    expect(mid.phase).toBe("blended");
    expect(mid.acwr?.ratio).toBe(1.2);

    const mature = computeBuildUpAdherence({ block, actualWeeks: actual, asOf: "2026-01-26", daysObserved: 25, planConfidence: "high" });
    expect(mature.phase).toBe("rolling");
  });

  it("classifies each week on / behind / ahead and flags the unsafe climb", () => {
    const adh = computeBuildUpAdherence({ block, actualWeeks: actual, asOf: "2026-01-26", daysObserved: 25, planConfidence: "high" });
    expect(adh.weeks[0].status).toBe("on");
    expect(adh.weeks[1].status).toBe("behind");
    expect(adh.weeks[2].status).toBe("ahead");
    expect(adh.weeks[2].spike).toBe(true); // 3800 > 1900 × 1.10
    expect(adh.latestWeekIndex).toBe(2);
    expect(adh.verdict.en).toMatch(/Ahead/);
  });

  it("only scores KPIs the plan actually prescribes (presence-gated feed)", () => {
    const adh = computeBuildUpAdherence({ block, actualWeeks: actual, asOf: "2026-01-26", daysObserved: 25, planConfidence: "high" });
    const kpis = adh.weeks[0].kpis.map((k) => k.kpi).sort();
    expect(kpis).toEqual(["dist", "hsr", "load"]); // stride/accHiEff/decHiEff never in the plan → not scored
  });

  it("plan confidence caps the overall confidence", () => {
    const adh = computeBuildUpAdherence({ block, actualWeeks: actual, asOf: "2026-01-26", daysObserved: 25, planConfidence: "low" });
    expect(adh.confidence).toBe("low"); // mature coverage but squad-baseline plan → low
  });

  it("future weeks are not yet elapsed and carry no adherence", () => {
    const adh = computeBuildUpAdherence({ block, actualWeeks: actual, asOf: "2026-01-15", daysObserved: 12, planConfidence: "high" });
    expect(adh.weeks[2].elapsed).toBe(false);
    expect(adh.weeks[2].pctOverall).toBeNull();
    expect(adh.weeks[0].elapsed).toBe(true);
  });

  it("no logged actuals → not-started verdict", () => {
    const adh = computeBuildUpAdherence({ block, actualWeeks: [], asOf: "2026-01-26", daysObserved: 0, planConfidence: "low" });
    expect(adh.latestWeekIndex).toBeNull();
    expect(adh.verdict.en).toMatch(/not logged yet/i);
  });
});
