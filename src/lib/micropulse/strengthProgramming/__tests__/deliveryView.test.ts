import { describe, it, expect } from "vitest";
import { goalSeasonOfPhase, goalsLine, programmeCovers, programmeTitle, sendModeChip, type DeliveryWeek } from "../deliveryView";
import { slotsFromRows, tableForWeek } from "../programmeWeeks";

const wk = (slots: Record<string, string>, programme = true): DeliveryWeek =>
  ({ weekStart: "2026-12-07", phase: "preseason", programme: programme ? { setName: "Breiðablik", tableName: "t" } : null, slots });

describe("deliveryView — what Meso / Micro show about the strength session", () => {
  it("programme title: the MD day's row, else GENERIC, else nothing", () => {
    const w = wk({ "MD-4": "Lower A", GENERIC: "Full body" });
    expect(programmeTitle(w, "MD-4")).toBe("Lower A");
    expect(programmeTitle(w, "MD-3")).toBe("Full body");
    expect(programmeTitle(w, null)).toBe("Full body");
    expect(programmeTitle(wk({ "MD-4": "Lower A" }), "MD-2")).toBeNull();
    expect(programmeTitle(wk({ "MD-4": "Lower A" }, false), "MD-4")).toBeNull();
    expect(programmeTitle(null, "MD-4")).toBeNull();
  });

  it("covers = a programme with sessions for the week's phase", () => {
    expect(programmeCovers(wk({ GENERIC: "x" }))).toBe(true);
    expect(programmeCovers(wk({}))).toBe(false);
    expect(programmeCovers(wk({ GENERIC: "x" }, false))).toBe(false);
  });

  it("goals line follows the part of the season (pre-/off-season build, in season keep)", () => {
    expect(goalSeasonOfPhase("preseason")).toBe("build");
    expect(goalSeasonOfPhase("offseason")).toBe("build");
    expect(goalSeasonOfPhase("inseason")).toBe("maintain");
    expect(goalSeasonOfPhase(null)).toBe("unknown");
    expect(goalsLine("build", true)).toContain("+1 sett af Nordic");
    expect(goalsLine("maintain", false)).toContain("maintenance");
    expect(goalsLine("unknown", false)).toBe(goalsLine("maintain", false));
    expect(sendModeChip("standard", true)).toBe("Styrkur: Staðlað (æfingakerfi liðsins)");
  });
});

describe("programmeWeeks — the table a week reads, as the player resolves it", () => {
  const rec = { set_name: "Recurring", table_name: "team_rec", start_date: null, end_date: null, is_active: true, created_at: "2026-01-01" };
  const old = { set_name: "Old", table_name: "team_old", start_date: null, end_date: null, is_active: false, created_at: "2026-06-01" };
  const blk = { set_name: "Block", table_name: "team_blk", start_date: "2026-12-07", end_date: "2026-12-20", is_active: false, created_at: "2026-11-01" };
  const late = { set_name: "Late", table_name: "team_late", start_date: "2026-12-16", end_date: "2026-12-31", is_active: false, created_at: "2026-11-02" };

  it("a block covering Monday wins, then one overlapping the week, then the recurring set (active first)", () => {
    expect(tableForWeek([rec, old, blk, late], "2026-12-07")?.table_name).toBe("team_blk");
    expect(tableForWeek([rec, old, blk, late], "2026-12-14")?.table_name).toBe("team_blk");
    expect(tableForWeek([rec, old, blk, late], "2026-12-21")?.table_name).toBe("team_late");
    expect(tableForWeek([rec, old, blk], "2027-01-04")?.table_name).toBe("team_rec");
    expect(tableForWeek([{ ...rec, table_name: "microdose_templates" }], "2027-01-04")).toBeNull();
    expect(tableForWeek([], "2027-01-04")).toBeNull();
  });

  it("slots = the GREEN row's title per md_day", () => {
    expect(slotsFromRows([
      { md_day: "MD-4", readiness_level: "GREEN", title: "Lower A" },
      { md_day: "MD-4", readiness_level: "RED", title: "Recovery" },
      { md_day: "MD-3", readiness_level: "GREEN", title: "  " },
      { md_day: "GENERIC", readiness_level: "GREEN", title: "Full body" },
    ])).toEqual({ "MD-4": "Lower A", GENERIC: "Full body" });
  });
});
