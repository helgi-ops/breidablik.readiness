import { describe, it, expect } from "vitest";
import { summarizeDeliveryConflicts } from "../conflicts";

const DATES = ["2026-10-05", "2026-10-07", "2026-10-09"]; // a week of the block

describe("summarizeDeliveryConflicts", () => {
  it("flags existing override rows that fall on target dates (and ignores others)", () => {
    const r = summarizeDeliveryConflicts(DATES, [
      { entry_date: "2026-10-05", title: "Coach session", origin: "session" },
      { entry_date: "2026-10-09", title: "Block · Full body — Combo", origin: "block" },
      { entry_date: "2026-10-31", title: "Elsewhere", origin: "session" }, // outside targets
    ], []);
    expect(r.overrideCount).toBe(2);
    expect(r.overrideDates.map((o) => o.date)).toEqual(["2026-10-05", "2026-10-09"]);
    expect(r.overrideDates[0].origin).toBe("session");
    expect(r.supersedesCustom).toBe(false);
  });

  it("flags a Custom Programme window overlapping the target dates and counts covered days", () => {
    const r = summarizeDeliveryConflicts(DATES, [], [
      { set_name: "Damir off-season", note: "power block", start_date: "2026-10-01", end_date: "2026-10-08" },
    ]);
    expect(r.supersedesCustom).toBe(true);
    expect(r.customWindows).toHaveLength(1);
    expect(r.customWindows[0].daysCovered).toBe(2); // 10-05 and 10-07, not 10-09
    expect(r.customWindows[0].note).toBe("power block");
  });

  it("drops a Custom Programme window that does not overlap any target date", () => {
    const r = summarizeDeliveryConflicts(DATES, [], [
      { set_name: "old", note: null, start_date: "2026-09-01", end_date: "2026-09-30" },
    ]);
    expect(r.supersedesCustom).toBe(false);
    expect(r.customWindows).toHaveLength(0);
  });

  it("ranks windows by how many target days each covers", () => {
    const r = summarizeDeliveryConflicts(DATES, [], [
      { set_name: "narrow", note: null, start_date: "2026-10-09", end_date: "2026-10-09" }, // 1 day
      { set_name: "wide", note: null, start_date: "2026-10-01", end_date: "2026-10-31" }, // all 3
    ]);
    expect(r.customWindows.map((w) => w.setName)).toEqual(["wide", "narrow"]);
    expect(r.customWindows[0].daysCovered).toBe(3);
  });

  it("is null-safe and empty-safe", () => {
    const r = summarizeDeliveryConflicts([], null, undefined);
    expect(r.overrideCount).toBe(0);
    expect(r.supersedesCustom).toBe(false);
    expect(r.overrideDates).toEqual([]);
    expect(r.customWindows).toEqual([]);
  });
});
