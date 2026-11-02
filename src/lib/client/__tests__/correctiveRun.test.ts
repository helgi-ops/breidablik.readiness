import { describe, expect, it } from "vitest";
import { buildSteps, parseDose, plannedWeekdays, weekStartIso } from "../correctiveRun";

describe("correctiveRun", () => {
  it("reads timed doses", () => {
    const d = parseDose("2 × 20 s each side");
    expect(d.sets).toBe(2);
    expect(d.holdSeconds).toBe(20);
    expect(d.perSide).toBe(true);
    expect(parseDose("45 sek hvor hlið").holdSeconds).toBe(45);
    expect(parseDose("1 min").holdSeconds).toBe(60);
  });

  it("rep doses have no timer", () => {
    const d = parseDose("3 x 10");
    expect(d.sets).toBe(3);
    expect(d.holdSeconds).toBeNull();
  });

  it("unreadable doses still give one step", () => {
    expect(buildSteps([{ name: "Hip 90/90", dose: "easy, to feel" }]).length).toBe(1);
    expect(buildSteps([{ name: "Hip 90/90" }]).length).toBe(1);
  });

  it("timed doses expand by set and side", () => {
    const steps = buildSteps([{ name: "Copenhagen", dose: "2 × 20 s each side" }]);
    expect(steps.length).toBe(4);
    expect(steps[1].side).toBe("right");
    expect(steps[2].set).toBe(2);
  });

  it("rep exercises stay one step whatever the sets", () => {
    expect(buildSteps([{ name: "Bridge", dose: "3 × 10 each side" }]).length).toBe(1);
  });

  it("item days win over prescription weekdays", () => {
    expect(plannedWeekdays([{ days: [2] }, {}], [1, 3]).join()).toBe("1,2,3");
  });

  it("finds Monday", () => {
    expect(weekStartIso("2026-11-02")).toBe("2026-11-02");
    expect(weekStartIso("2026-11-08")).toBe("2026-11-02");
  });
});
