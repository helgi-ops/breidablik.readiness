import { describe, it, expect } from "vitest";
import {
  drillMovementLines,
  movementValueText,
  measuredSourceText,
  codLeftPct,
  hideGpsTile,
  movementSummaryText,
} from "../movementRead";

const indoorRondo = {
  ima_accel: 19, ima_decel: 24, ima_cod_total: 98, high_ima: 6, jump_count: 4,
  ima_accel_low: 12, ima_accel_med: 4, ima_accel_high: 3,
  ima_decel_low: 15, ima_decel_med: 5, ima_decel_high: 4,
  ima_cod_left: 53, ima_cod_right: 45, ima_cod_med: 22, ima_cod_low: 70,
  duration_min: 15, distance_m: 0,
  measured_on: "2026-11-05", measured_players: 11, measured_no_gps: true,
};

describe("drillMovementLines", () => {
  it("lists accelerations, braking, changes of direction and jumps in that order, per minute", () => {
    const lines = drillMovementLines(indoorRondo);
    expect(lines.map((l) => l.key)).toEqual(["accel", "decel", "cod", "jumps"]);
    expect(lines[0].perMin).toBe(1.3);
    expect(lines[2].bands).toEqual({ low: 70, med: 22, hard: 6 });
  });
  it("is empty when nothing was measured (Core unit or never synced)", () => {
    expect(drillMovementLines({})).toEqual([]);
    expect(drillMovementLines({ ima_cod_total: 0, jump_count: 0 })).toEqual([]);
  });
  it("adds up the bands when only the split is known", () => {
    const [l] = drillMovementLines({ ima_accel_low: 5, ima_accel_med: 2, ima_accel_high: 1 });
    expect(l.value).toBe(8);
  });
});

describe("plain text", () => {
  it("names the hard part and the left share, in both languages", () => {
    const lines = drillMovementLines(indoorRondo);
    expect(movementValueText(lines[0], indoorRondo, "EN")).toBe("19 · 3 hard");
    expect(movementValueText(lines[0], indoorRondo, "IS")).toBe("19 · 3 harðar");
    expect(movementValueText(lines[2], indoorRondo, "EN")).toBe("98 · 54% to the left");
    expect(movementValueText(lines[2], indoorRondo, "IS")).toBe("98 · 54% til vinstri");
    expect(codLeftPct({ ima_cod_left: null, ima_cod_right: 4 })).toBeNull();
  });
  it("says where the numbers came from", () => {
    expect(measuredSourceText(indoorRondo, "EN")).toBe("Measured 5 Nov · 11 players · indoors, no GPS");
    expect(measuredSourceText(indoorRondo, "IS")).toBe("Mælt 5. nóv · 11 leikmenn · inni, engin GPS");
    expect(measuredSourceText({ ...indoorRondo, distance_m: 641 }, "EN")).toBe(
      "Measured 5 Nov · 11 players · indoors, no GPS · GPS numbers from an earlier outdoor session",
    );
    expect(measuredSourceText({ measured_on: null }, "EN")).toBeNull();
  });
  it("one compact line for a delivered drill", () => {
    expect(movementSummaryText({ ima_accel: 12, ima_decel: 19 }, "EN")).toBe("Accelerations 12 · Braking 19");
    expect(movementSummaryText({}, "EN")).toBeNull();
  });
});

describe("hideGpsTile", () => {
  it("hides empty or 0 GPS tiles only on a drill measured indoors", () => {
    expect(hideGpsTile(indoorRondo, 0)).toBe(true);
    expect(hideGpsTile(indoorRondo, null)).toBe(true);
    expect(hideGpsTile(indoorRondo, 641)).toBe(false);
    expect(hideGpsTile({ measured_no_gps: false }, 0)).toBe(false);
  });
});

describe("long runs on a drill", () => {
  it("shows the count with its strides and carries the jogs caveat", () => {
    const d = { long_runs: 0.9, long_run_strides: 34.3 };
    const [l] = drillMovementLines(d);
    expect(l.key).toBe("longRuns");
    expect(movementValueText(l, d, "EN")).toBe("0.9 · 34 strides");
    expect(movementValueText(l, d, "IS")).toBe("0.9 · 34 skref");
    expect(l.note?.en).toMatch(/Jogs included/);
    expect(l.perMin).toBeNull();
  });
  it("is hidden when there were none or no reading", () => {
    expect(drillMovementLines({ long_runs: 0, long_run_strides: 0 })).toEqual([]);
    expect(drillMovementLines({ long_runs: null })).toEqual([]);
  });
});
