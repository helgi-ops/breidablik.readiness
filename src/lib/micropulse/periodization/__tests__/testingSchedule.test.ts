import { describe, it, expect } from "vitest";
import { recommendTestingSchedule } from "../testingSchedule";

describe("recommendTestingSchedule", () => {
  it("schedules aerobic re-tests at block boundaries (baseline + mid + end)", () => {
    const plans = recommendTestingSchedule({ preseasonWeeks: 6, hasVald: true });
    const aer = plans.find((p) => p.protocol.key === "aerobic")!;
    expect(aer.weeks[0]).toBe(1);                 // baseline
    expect(aer.weeks[aer.weeks.length - 1]).toBe(6); // end
    expect(aer.weeks.length).toBe(3);             // baseline + mid + end
    expect(aer.priority).toBe("core");
  });

  it("max strength profiles at the start and end only", () => {
    const plans = recommendTestingSchedule({ preseasonWeeks: 6, hasVald: true });
    const st = plans.find((p) => p.protocol.key === "maxStrength")!;
    expect(st.weeks).toEqual([1, 6]);
  });

  it("CMJ is weekly monitoring when VALD is available", () => {
    const plans = recommendTestingSchedule({ preseasonWeeks: 5, hasVald: true });
    const cmj = plans.find((p) => p.protocol.key === "cmj")!;
    expect(cmj.weeks).toEqual([1, 2, 3, 4, 5]);
  });

  it("omits CMJ + NordBord when VALD is absent", () => {
    const plans = recommendTestingSchedule({ preseasonWeeks: 5, hasVald: false });
    expect(plans.some((p) => p.protocol.key === "cmj")).toBe(false);
    expect(plans.some((p) => p.protocol.key === "nordbord")).toBe(false);
    expect(plans.some((p) => p.protocol.key === "aerobic")).toBe(true); // aerobic always present
  });

  it("respects the preferred aerobic mode", () => {
    expect(recommendTestingSchedule({ preseasonWeeks: 4, aerobicMode: "yoyo_ir1" }).find((p) => p.protocol.key === "aerobic")!.protocol.name.en).toContain("Yo-Yo");
    expect(recommendTestingSchedule({ preseasonWeeks: 4, aerobicMode: "vameval" }).find((p) => p.protocol.key === "aerobic")!.protocol.name.en).toContain("VAMEVAL");
    expect(recommendTestingSchedule({ preseasonWeeks: 4 }).find((p) => p.protocol.key === "aerobic")!.protocol.name.en).toContain("30-15");
  });

  it("every protocol carries HOW cues + a citation", () => {
    for (const p of recommendTestingSchedule({ preseasonWeeks: 6, hasVald: true, hasGps: true })) {
      expect(p.protocol.how.length).toBeGreaterThan(0);
      expect(p.protocol.cite.length).toBeGreaterThan(0);
      expect(p.weeks.every((w) => w >= 1 && w <= 6)).toBe(true);
    }
  });

  it("degrades to a 1-2 week pre-season without duplicate weeks", () => {
    const plans = recommendTestingSchedule({ preseasonWeeks: 1, hasVald: true });
    const aer = plans.find((p) => p.protocol.key === "aerobic")!;
    expect(aer.weeks).toEqual([1]);
    const two = recommendTestingSchedule({ preseasonWeeks: 2 }).find((p) => p.protocol.key === "aerobic")!;
    expect(two.weeks).toEqual([1, 2]);
  });
});

describe("purity boundary", () => {
  it("does not import readiness / decision / load-target engines", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../testingSchedule.ts", import.meta.url), "utf8");
    const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
    for (const bad of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "loadTarget"]) {
      expect(imports.includes(bad)).toBe(false);
    }
  });
});
