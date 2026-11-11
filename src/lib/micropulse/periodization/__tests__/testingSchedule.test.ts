import { describe, it, expect } from "vitest";
import { recommendTestingSchedule, testsForBlock, AEROBIC_TESTS, AEROBIC_TEST_KEYS, isAerobicMode, testShortName } from "../testingSchedule";
import { FITNESS_TESTS } from "@/lib/micropulse/load/fitnessTests";

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
    expect(recommendTestingSchedule({ preseasonWeeks: 4, aerobicMode: "yo_yo_ir1" }).find((p) => p.protocol.key === "aerobic")!.protocol.name.en).toContain("Yo-Yo");
    expect(recommendTestingSchedule({ preseasonWeeks: 4, aerobicMode: "mas_vameval" }).find((p) => p.protocol.key === "aerobic")!.protocol.name.en).toContain("VAMEVAL");
    expect(recommendTestingSchedule({ preseasonWeeks: 4, aerobicMode: null }).find((p) => p.protocol.key === "aerobic")!.protocol.name.en).toContain("30-15");
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

describe("aerobic test choice — the six Conditioning tests", () => {
  it("offers exactly the six aerobic tests of the shared registry, named as the registry names them", () => {
    expect(AEROBIC_TESTS.map((o) => o.key)).toEqual([...AEROBIC_TEST_KEYS]);
    for (const o of AEROBIC_TESTS) {
      expect(o.label).toEqual(FITNESS_TESTS[o.key].label);
      expect(o.cite).toBe(FITNESS_TESTS[o.key].citation);
    }
    expect(isAerobicMode("yo_yo_ir2")).toBe(true);
    expect(isAerobicMode("sprint_max")).toBe(false); // not an aerobic test
    expect(isAerobicMode("yoyo_ir1")).toBe(false);   // the old key is gone
  });

  it("every choice gives a protocol with cues + a citation, for the pre-season and for each block", () => {
    for (const k of AEROBIC_TEST_KEYS) {
      const aer = recommendTestingSchedule({ preseasonWeeks: 6, aerobicMode: k }).find((p) => p.protocol.key === "aerobic")!;
      expect(FITNESS_TESTS[k].label.en.startsWith(aer.protocol.name.en.split(" ")[0])).toBe(true); // same test
      expect(aer.protocol.how.length).toBeGreaterThan(0);
      expect(aer.protocol.cite.length).toBeGreaterThan(0);
      expect(testsForBlock("accum", { aerobicMode: k }).protocols[0].name.en).toBe(aer.protocol.name.en);
    }
  });

  it("a Yo-Yo never promises a running speed; a speed test does", () => {
    for (const k of ["yo_yo_ir1", "yo_yo_ir2"] as const) {
      const o = AEROBIC_TESTS.find((x) => x.key === k)!;
      expect(o.output).toBe("capacity");
      const p = recommendTestingSchedule({ preseasonWeeks: 4, aerobicMode: k }).find((x) => x.protocol.key === "aerobic")!.protocol;
      expect(p.prescribes.en).toMatch(/no running speed/);
    }
    for (const k of ["msft_beep", "mas_vameval", "mas_run_4min"] as const) {
      expect(AEROBIC_TESTS.find((x) => x.key === k)!.output).toBe("mas");
      expect(recommendTestingSchedule({ preseasonWeeks: 4, aerobicMode: k }).find((x) => x.protocol.key === "aerobic")!.protocol.prescribes.en).toMatch(/MAS/);
    }
    expect(AEROBIC_TESTS.find((x) => x.key === "ift_30_15")!.note.en).toMatch(/estimate/);
  });

  it("the Aerobic chip names the chosen test; other chips keep their short name", () => {
    expect(testShortName("aerobic", "yo_yo_ir1").en).toBe("Yo-Yo IR1");
    expect(testShortName("aerobic", null).en).toBe("Aerobic");
    expect(testShortName("cmj", "yo_yo_ir1").en).toBe("CMJ");
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
