import { describe, it, expect } from "vitest";
import { guardSeasonWindow } from "../seasonWindowGuard";

describe("guardSeasonWindow — another season's window stays out of a season row", () => {
  it("drops last season's end, off-season start, start-keyed blocks and a stale next pre-season (Breiðablik 2027)", () => {
    const { patch, dropped } = guardSeasonWindow(2027, {
      seasonEnd: "2026-10-24", offseasonStart: "2026-10-25", preseasonStart: "2026-12-01", nextPreseasonStart: "2026-11-30",
      deloadCadence: 6, blockGoals: { "2026-02-02": "accum", "2026-12-28": "accum", "0": "accum" }, blockWeeks: { "2026-03-16": 4, "2026-11-30": 4 },
    });
    expect(patch.seasonEnd).toBeUndefined();
    expect(patch.offseasonStart).toBeUndefined();
    expect(patch.nextPreseasonStart).toBeUndefined();
    expect(patch.preseasonStart).toBe("2026-12-01"); // a Nov/Dec pre-season for 2027 is fine
    expect(patch.deloadCadence).toBe(6);
    expect(patch.blockGoals).toEqual({ "2026-12-28": "accum", "0": "accum" });
    expect(patch.blockWeeks).toEqual({ "2026-11-30": 4 });
    expect(dropped).toEqual(expect.arrayContaining(["seasonEnd", "offseasonStart", "nextPreseasonStart", "blockGoals.2026-02-02", "blockWeeks.2026-03-16"]));
  });

  it("keeps a season's own window, including one that runs across New Year", () => {
    const own = { preseasonStart: "2027-01-04", seasonEnd: "2027-11-27", offseasonStart: "2027-11-28", nextPreseasonStart: "2028-01-03" };
    expect(guardSeasonWindow(2027, own)).toEqual({ patch: own, dropped: [] });
    const basketball = { preseasonStart: "2025-08-04", seasonEnd: "2026-04-30", nextPreseasonStart: "2026-08-03" };
    expect(guardSeasonWindow(2026, basketball).dropped).toEqual([]);
  });

  it("a pre-season start from another year is dropped", () => {
    expect(guardSeasonWindow(2027, { preseasonStart: "2026-02-02" }).dropped).toEqual(["preseasonStart"]);
    expect(guardSeasonWindow(2027, { preseasonStart: "2028-01-05" }).dropped).toEqual(["preseasonStart"]);
  });
});
