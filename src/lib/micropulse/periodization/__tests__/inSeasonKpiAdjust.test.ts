import { describe, expect, it } from "vitest";
import { buildCalendarBlock, type CalendarBlock } from "../index";
import {
  applyBlockKpiToCalendar, blockKpiLogView, blockKpiRatios, calendarScaleFromRatios, cleanBlockKpi, hasCalendarDay, nextBlockKpiLog, scaleCalWeek,
} from "../inSeasonKpiAdjust";
import { buildPlannedVolume, inSeasonKpiMultiple } from "../inSeasonStandardWeek";
import { blockVolumeView } from "../inSeasonMesoView";
import { planWeeklyTarget } from "../planWeeklyTarget";
import { guardSeasonWindow } from "../seasonWindowGuard";
import type { MatchUnit, MesoBlock, SeasonPhase } from "../index";

const SATS = ["2026-06-06", "2026-06-13", "2026-06-20", "2026-06-27", "2026-07-04"];
const UNIT = { dist: 10000, hsr: 600, load: 1000, accdec: 100, accHiEff: 40, decHiEff: 45, stride: 2000, dirFwd: null, dirBack: null, dirLat: null, rhie: null, symmetry: null, metPower: null };
const block = (): CalendarBlock => buildCalendarBlock({ unit: UNIT, startDate: "2026-06-08", numWeeks: 3, scopeName: "t", matchDates: SATS.slice(1, 4), allFixtures: SATS, noAutoMatch: true, inSeason: { start: "2026-04-01", end: "2026-10-31" }, hold: true, deload: { weekStart: null, light: false } });

describe("cleanBlockKpi", () => {
  it("keeps ISO block starts, known variables and usable values (clamped, 0.01×)", () => {
    expect(cleanBlockKpi({ "2026-06-08": { totalDistance: 1.857, velocityBand5: 99, bogus: 1, totalPlayerLoad: -1 }, nope: { totalDistance: 2 }, "2026-07-06": {} }))
      .toEqual({ "2026-06-08": { totalDistance: 1.86, velocityBand5: 6 } });
    expect(cleanBlockKpi(null)).toEqual({});
    expect(cleanBlockKpi([1])).toEqual({});
  });
});

describe("ratios and the calendar", () => {
  it("a setting is a share of the system's standard week", () => {
    const r = blockKpiRatios({ totalDistance: 1.87 }, null);
    expect(r.totalDistance).toBeCloseTo(1.87 / inSeasonKpiMultiple("totalDistance", 1), 6);
    expect(r.velocityBand5).toBeUndefined();
  });

  it("sprint moves only the target; the other variables have a day axis", () => {
    expect(hasCalendarDay("velocityBand6")).toBe(false);
    expect(hasCalendarDay("totalDistance")).toBe(true);
    expect(calendarScaleFromRatios({ velocityBand6: 1.2, totalDistance: 1.1 })).toEqual({ dist: 1.1 });
  });

  it("moves the calendar's days and week sums by the coach's share; the match and off days stay", () => {
    const base = block(), adj = block();
    applyBlockKpiToCalendar(adj, { totalDistance: 1.87 }, null); // 1.70 → 1.87 = +10%
    const w0 = base.weeks[1], w1 = adj.weeks[1];
    expect(Math.round(w1.pctRunning!) / 100).toBeCloseTo(1.87, 1);
    expect(w1.pctHsr).toBe(w0.pctHsr);
    w1.days.forEach((d, i) => {
      if (d.type === "match" || d.type === "rest") expect(d).toEqual(w0.days[i]);
      else expect(d.dist).toBe(Math.round((w0.days[i].dist! * 1.1) / 10) * 10);
    });
  });

  it("no setting leaves the calendar untouched", () => {
    const base = block(), adj = block();
    applyBlockKpiToCalendar(adj, undefined, null);
    expect(adj).toEqual(base);
  });

  it("hard speed-ups and braking move separately; their one week total follows the days", () => {
    const w = block().weeks[1];
    const sum = () => w.days.reduce((s, d) => s + (d.type === "match" ? 0 : (d.accHiEff ?? 0) + (d.decHiEff ?? 0)), 0);
    const before = sum(), pct = w.pctAccDec23!;
    scaleCalWeek(w, { accHi: 1.5 });
    expect(w.pctAccDec23).toBe(Math.round((pct * sum()) / before));
  });
});

describe("the setting reaches every reader", () => {
  const MATCH = { totalPlayerLoad: 1000, totalDistance: 10000, velocityBand5: 450, velocityBand6: 150, accelB23: 40, decelB23: 45 };

  it("the hub table: the coach's value, marked; peak and light move by the same share", () => {
    const sys = blockVolumeView({ matchKpis: MATCH, numWeeks: 4, stepPct: 5, deloadWeek: 4 });
    const mine = blockVolumeView({ matchKpis: MATCH, numWeeks: 4, stepPct: 5, deloadWeek: 4, kpiSet: { velocityBand5: 1.32 } });
    const a = sys.rows.find((r) => r.key === "velocityBand5")!, b = mine.rows.find((r) => r.key === "velocityBand5")!;
    expect(a.mine).toBe(false);
    expect(b).toMatchObject({ mine: true, week: 1.32, proposal: a.week, weekRaw: Math.round(450 * 1.32) });
    expect(b.peak!).toBeCloseTo(a.peak! * (1.32 / a.week), 1);
    expect(mine.weekMultiple).toBe(sys.weekMultiple); // PlayerLoad not set → the weeks stay
    const pl = blockVolumeView({ matchKpis: MATCH, numWeeks: 4, stepPct: 0, deloadWeek: null, kpiSet: { totalPlayerLoad: 2.6 } });
    expect(pl.weekMultiple).toBe(2.6);
  });

  it("the server's weekly target for the block today sits in", () => {
    const m = (typical: number) => ({ typical, peak: typical });
    const unit = { nNearFull: 10, load: m(1000), distance: m(10000), hsr: m(600), sprint: m(150), accel: m(40), decel: m(45), accHiEff: m(0), decHiEff: m(0), stride: m(0), rhie: m(0), symmetry: m(0), metPower: m(0) } as unknown as MatchUnit;
    const phases = [{ key: "competitive", label: { en: "", is: "" }, start: "2026-04-10", end: "2026-10-25", weeks: 28, matches: 0, rationale: { en: "", is: "" } }] as SeasonPhase[];
    const blocks = [{ index: 0, start: "2026-05-25", end: "2026-06-22", weeks: 4, deloadWeekStart: null, inSeason: true, goalKey: "realize" } as unknown as MesoBlock];
    const base = planWeeklyTarget({ phases, blocks, matchUnits: [unit], today: "2026-06-01", matchesThisWeek: 1 })!;
    const set = planWeeklyTarget({ phases, blocks, matchUnits: [unit], today: "2026-06-01", matchesThisWeek: 1, blockKpi: { "2026-05-25": { totalDistance: 1.87 } } })!;
    const other = planWeeklyTarget({ phases, blocks, matchUnits: [unit], today: "2026-06-01", matchesThisWeek: 1, blockKpi: { "2026-06-22": { totalDistance: 1.87 } } })!;
    expect(set.byKpi.totalDistance).toBe(Math.round(base.byKpi.totalDistance! * 1.1));
    expect(set.byKpi.velocityBand5).toBe(base.byKpi.velocityBand5);
    expect(other.byKpi).toEqual(base.byKpi);
  });

  it("the block PDF's planned volume", () => {
    const a = buildPlannedVolume({ matchKpiAvg: MATCH, numWeeks: 4, stepPct: 0 })!;
    const b = buildPlannedVolume({ matchKpiAvg: MATCH, numWeeks: 4, stepPct: 0, kpiRatio: { totalDistance: 1.1 } })!;
    expect(b.weekKpis.find((v) => v.key === "totalDistance")!.multiple).toBe(Math.round(a.weekKpis.find((v) => v.key === "totalDistance")!.multiple * 1.1 * 100) / 100);
    expect(b.weekVolumeMultiple).toBe(a.weekVolumeMultiple);
  });
});

describe("audit log and season guard", () => {
  it("logs one entry per changed variable (set, moved, cleared), server-stamped", () => {
    const log = nextBlockKpiLog(null, { "2026-06-08": { totalDistance: 1.8, velocityBand5: 1.2 } }, { "2026-06-08": { totalDistance: 1.9 }, "2026-07-06": { velocityBand6: 1 } }, "u1", "t1");
    expect(log).toEqual([
      { block: "2026-06-08", kpi: "totalDistance", from: 1.8, to: 1.9, by: "u1", at: "t1" },
      { block: "2026-06-08", kpi: "velocityBand5", from: 1.2, to: null, by: "u1", at: "t1" },
      { block: "2026-07-06", kpi: "velocityBand6", from: null, to: 1, by: "u1", at: "t1" },
    ]);
    expect(nextBlockKpiLog(log, { a: {} }, { a: {} }, "u", "t")).toHaveLength(3);
  });

  it("the hub's log view keeps good rows, names people (never ids), newest first", () => {
    const raw = [
      { block: "2026-06-08", kpi: "totalDistance", from: 1.8, to: 1.9, by: "u1", at: "2026-06-01T10:00:00Z" },
      { block: "2026-06-08", kpi: "velocityBand5", from: null, to: 1.2, by: "u2", at: "2026-06-02T10:00:00Z" },
      { block: "not-a-date", kpi: "totalDistance", from: 1, to: 2, by: "u1", at: "2026-06-03T10:00:00Z" },
      { block: "2026-06-08", kpi: "madeUpKpi", from: 1, to: 2, by: "u1", at: "2026-06-03T10:00:00Z" },
      null,
    ];
    const v = blockKpiLogView(raw, { u1: "Coach A" });
    expect(v).toEqual([
      { block: "2026-06-08", kpi: "velocityBand5", from: null, to: 1.2, at: "2026-06-02T10:00:00Z", byName: null },
      { block: "2026-06-08", kpi: "totalDistance", from: 1.8, to: 1.9, at: "2026-06-01T10:00:00Z", byName: "Coach A" },
    ]);
    expect(blockKpiLogView(raw, {}, 1)).toHaveLength(1);
    expect(blockKpiLogView("nope", {})).toEqual([]);
  });

  it("another season's block settings never enter this season's row", () => {
    const g = guardSeasonWindow(2026, { blockKpi: { "2024-06-03": { totalDistance: 2 }, "2026-06-08": { totalDistance: 2 } } });
    expect(g.patch.blockKpi).toEqual({ "2026-06-08": { totalDistance: 2 } });
  });
});
