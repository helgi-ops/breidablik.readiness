import { describe, expect, it } from "vitest";
import { buildCalendarBlock, CAL_SHARE } from "../index";
import {
  calendarDayShare, inSeasonKpiMultiple, inSeasonKpiVolumes, inSeasonTrainingDayLabels, inSeasonWeekDayTypes, inSeasonWeekMultiple, usesCalendarWeek,
} from "../inSeasonStandardWeek";
import { standardTrainingDays, weeklyKpiMultiple, weeklyTrainingMultiple } from "../plannedVolume";

describe("in-season standard week = the calendar week", () => {
  it("one game: MD-4 Mechanical, MD-3 Locomotive, MD-1 Activation, MD+1 Top-up (MD+2, MD-2 off)", () => {
    expect(inSeasonWeekDayTypes(1)).toEqual(["mechanical", "locomotive", "activation", "topup"]);
    expect(inSeasonTrainingDayLabels(1)).toEqual(["MD-4", "MD-3", "MD-1", "MD+1"]);
  });

  it("each variable is the sum of its day-type shares", () => {
    expect(inSeasonKpiMultiple("totalPlayerLoad", 1)).toBe(2.45);
    expect(inSeasonKpiMultiple("totalDistance", 1)).toBe(1.7);
    expect(inSeasonKpiMultiple("velocityBand5", 1)).toBe(1.1);
    expect(inSeasonWeekMultiple(1)).toBe(2.45);
    const sum = (k: Parameters<typeof calendarDayShare>[0]) => Math.round(inSeasonWeekDayTypes(1).reduce((s, t) => s + (calendarDayShare(k, t) ?? 0), 0) * 100) / 100;
    for (const k of ["velocityBand6", "accelB23", "decelB23", "imaCod", "imaFrDistance", "imaStrideHi"] as const) expect(inSeasonKpiMultiple(k, 1)).toBe(sum(k));
  });

  it("matches what a held in-season calendar week adds up to (team unit, every Saturday a game)", () => {
    const sats = ["2026-06-06", "2026-06-13", "2026-06-20", "2026-06-27", "2026-07-04"];
    const unit = { dist: 10000, hsr: 600, load: 1000, accdec: 100, accHiEff: 40, decHiEff: 45, stride: 2000, dirFwd: null, dirBack: null, dirLat: null, rhie: null, symmetry: null, metPower: null };
    const blk = buildCalendarBlock({ unit, startDate: "2026-06-08", numWeeks: 3, scopeName: "t", matchDates: sats.slice(1, 4), allFixtures: sats, noAutoMatch: true, inSeason: { start: "2026-04-01", end: "2026-10-31" }, hold: true, deload: { weekStart: null, light: false } });
    const w = blk.weeks[1];
    expect(Math.round(w.pctMech!) / 100).toBe(inSeasonKpiMultiple("totalPlayerLoad", 1));
    expect(Math.round(w.pctRunning!) / 100).toBe(inSeasonKpiMultiple("totalDistance", 1));
    expect(Math.round(w.pctHsr!) / 100).toBe(inSeasonKpiMultiple("velocityBand5", 1));
  });

  it("two and three games: the calendar's congested weeks (top-ups after each game)", () => {
    expect(inSeasonWeekDayTypes(2)).toEqual(["topup", "topup"]);
    expect(inSeasonWeekMultiple(2)).toBe(Math.round(2 * CAL_SHARE.topup.load * 100) / 100);
    expect(inSeasonWeekDayTypes(3)).toEqual(["topup", "topup", "topup"]);
  });

  it("basketball, a week with no game and a variable the calendar does not plan keep the MD-share week", () => {
    expect(usesCalendarWeek(1, "Basketball")).toBe(false);
    expect(inSeasonWeekMultiple(1, "basketball")).toBe(weeklyTrainingMultiple(standardTrainingDays(1, "basketball")));
    expect(inSeasonWeekMultiple(0)).toBe(weeklyTrainingMultiple(standardTrainingDays(0)));
    expect(inSeasonKpiMultiple("fmpDynamicHigh", 1)).toBe(weeklyKpiMultiple(standardTrainingDays(1), "fmpDynamicHigh"));
    expect(inSeasonTrainingDayLabels(1, "basketball")).toEqual(standardTrainingDays(1, "basketball"));
  });

  it("volumes: match value × the variable's own multiple", () => {
    const v = inSeasonKpiVolumes({ totalDistance: 10000, velocityBand5: 450 }, 1);
    expect(v.map((x) => [x.key, x.multiple, x.weeklyValue])).toEqual([["totalDistance", 1.7, 17000], ["velocityBand5", 1.1, 495]]);
  });
});
