import { describe, it, expect } from "vitest";
import {
  computePeakPeriod,
  powerCurveForSession,
  benchmarkPeak,
  MIN_MATURE_PEAKPERIOD_SESSIONS,
  type PeakPeriodRow,
} from "../peakPeriod";

// A synthetic peak-period export: PlayerLoad decays as the window widens (1min densest).
const session = (date: string, scale = 1): PeakPeriodRow[] => [
  { date, windowMin: 1, metric: "player_load", value: 24 * scale, unit: "AU/min" },
  { date, windowMin: 3, metric: "player_load", value: 20 * scale, unit: "AU/min" },
  { date, windowMin: 5, metric: "player_load", value: 18 * scale, unit: "AU/min" },
  { date, windowMin: 1, metric: "hsr", value: 180 * scale, unit: "m/min" },
  { date, windowMin: 3, metric: "hsr", value: 140 * scale, unit: "m/min" },
];

describe("powerCurveForSession", () => {
  it("builds an ascending-window curve indexed to the session's own peak", () => {
    const curve = powerCurveForSession(session("2026-07-01"), "player_load");
    expect(curve.points.map((p) => p.windowMin)).toEqual([1, 3, 5]);
    expect(curve.points[0].index).toBe(100); // 1-min window is the densest
    expect(curve.points[2].index).toBe(Math.round((18 / 24) * 100)); // 75
    expect(curve.unit).toBe("AU/min");
  });

  it("keeps the max when an export repeats a window", () => {
    const rows: PeakPeriodRow[] = [
      { date: "d", windowMin: 1, metric: "player_load", value: 20 },
      { date: "d", windowMin: 1, metric: "player_load", value: 26 },
    ];
    expect(powerCurveForSession(rows, "player_load").points[0].value).toBe(26);
  });
});

describe("computePeakPeriod", () => {
  it("returns the latest session's curves and the season-best per metric", () => {
    const rows = [
      ...session("2026-07-01", 1.0),
      ...session("2026-07-03", 1.2), // the peak session
      ...session("2026-07-05", 0.9), // latest, but not the best
    ];
    const read = computePeakPeriod(rows);
    expect(read.latest?.date).toBe("2026-07-05");
    expect(read.dataCoverage.metrics).toBe(2);
    expect(read.dataCoverage.windows).toEqual([1, 3, 5]);

    // Season-best 1-min PlayerLoad comes from the 1.2-scaled session = 28.8.
    const pl = read.seasonBest.find((c) => c.metric === "player_load")!;
    const oneMin = pl.points.find((p) => p.windowMin === 1)!;
    expect(oneMin.value).toBeCloseTo(24 * 1.2, 5);
  });

  it("confidence rises with sessions + metrics", () => {
    const many = Array.from({ length: MIN_MATURE_PEAKPERIOD_SESSIONS * 2 }, (_, i) =>
      session(`2026-07-${String(i + 1).padStart(2, "0")}`),
    ).flat();
    expect(computePeakPeriod(many).confidence).toBe("high");
    const few = [...session("2026-07-01"), ...session("2026-07-02")];
    expect(computePeakPeriod(few).confidence).toBe("low");
  });

  it("empty input yields an empty, honest read", () => {
    const read = computePeakPeriod([]);
    expect(read.latest).toBeNull();
    expect(read.seasonBest).toEqual([]);
    expect(read.dataCoverage.sessions).toBe(0);
    expect(read.confidence).toBe("low");
  });
});

describe("benchmarkPeak", () => {
  it("ranks a player's peak among the squad (self excluded from ties)", () => {
    // squad peaks 10,20,30,40 (incl. the player's own 40) → top → 100th pctile.
    expect(benchmarkPeak(40, [10, 20, 30, 40])).toBe(100);
    expect(benchmarkPeak(10, [10, 20, 30, 40])).toBe(0);
  });

  it("returns null for a thin pool or a null value", () => {
    expect(benchmarkPeak(40, [40])).toBeNull();
    expect(benchmarkPeak(null, [10, 20, 30])).toBeNull();
  });
});
