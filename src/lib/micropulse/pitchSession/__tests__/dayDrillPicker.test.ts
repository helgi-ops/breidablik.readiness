import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { areaFitForDay, pickDrillsForDay, type DrillPickInput } from "../dayDrillPicker";

const drill = (over: Partial<DrillPickInput> = {}): DrillPickInput => ({
  id: Math.random().toString(36).slice(2), name: "Drill", category: "ssg", stimulus: null,
  areaPerPlayerM2: 100, totalPlayers: 8, ...over,
});

describe("areaFitForDay — pitch size drives the space-driven categories", () => {
  it("a large SSG is ideal on a locomotive day, off on a mechanical day", () => {
    expect(areaFitForDay("locomotive", "ssg", 200).fit).toBe("ideal");
    expect(areaFitForDay("mechanical", "ssg", 200).fit).toBe("off");
  });
  it("a tight SSG is ideal on a mechanical day, off (too tight) on a locomotive day", () => {
    expect(areaFitForDay("mechanical", "possession", 60).fit).toBe("ideal");
    expect(areaFitForDay("locomotive", "possession", 60).fit).toBe("off");
  });
  it("mixed day wants a match-like size", () => {
    expect(areaFitForDay("mixed", "ssg", 130).fit).toBe("ideal");
  });
  it("near the band edge is 'ok', not ideal or off", () => {
    expect(areaFitForDay("locomotive", "ssg", 120).fit).toBe("ok"); // 0.75×150=112.5 ≤ 120 < 150
  });
  it("non-space categories (running, finishing) and missing area → unknown (area isn't the lever)", () => {
    expect(areaFitForDay("locomotive", "running", 300).fit).toBe("unknown");
    expect(areaFitForDay("mechanical", "ssg", null).fit).toBe("unknown");
  });
});

describe("pickDrillsForDay — area-aware ranking + variety", () => {
  it("locomotive day ranks the large-area SSG above the tight one", () => {
    const big = drill({ name: "Big SSG", category: "ssg", stimulus: "locomotive", areaPerPlayerM2: 220 });
    const tight = drill({ name: "Tight SSG", category: "ssg", stimulus: "mechanical", areaPerPlayerM2: 50 });
    const picks = pickDrillsForDay([tight, big], "locomotive");
    expect(picks[0].id).toBe(big.id);
    expect(picks[0].areaFit).toBe("ideal");
  });

  it("mechanical day prefers the tight-space drill", () => {
    const big = drill({ name: "Big", category: "possession", stimulus: "locomotive", areaPerPlayerM2: 220 });
    const tight = drill({ name: "Tight", category: "possession", stimulus: "mechanical", areaPerPlayerM2: 55 });
    const picks = pickDrillsForDay([big, tight], "mechanical");
    expect(picks[0].id).toBe(tight.id);
  });

  it("suggests more than a couple — up to the limit — and stays varied across categories", () => {
    const pool: DrillPickInput[] = [
      drill({ name: "SSG A", category: "ssg", stimulus: "locomotive", areaPerPlayerM2: 200 }),
      drill({ name: "SSG B", category: "ssg", stimulus: "locomotive", areaPerPlayerM2: 180 }),
      drill({ name: "SSG C", category: "ssg", stimulus: "locomotive", areaPerPlayerM2: 170 }),
      drill({ name: "SSG D", category: "ssg", stimulus: "locomotive", areaPerPlayerM2: 160 }),
      drill({ name: "Run A", category: "running", stimulus: "locomotive", areaPerPlayerM2: null }),
      drill({ name: "Poss A", category: "possession", stimulus: "locomotive", areaPerPlayerM2: 190 }),
    ];
    const picks = pickDrillsForDay(pool, "locomotive", { limit: 6 });
    expect(picks.length).toBeGreaterThanOrEqual(5); // suggests more than a couple
    // the variety cap surfaces the minority categories BEFORE the list fills with SSGs
    expect(picks.some((p) => p.category === "running")).toBe(true);
    expect(picks.some((p) => p.category === "possession")).toBe(true);
  });

  it("empty when no session type or no drills", () => {
    expect(pickDrillsForDay([drill()], null)).toEqual([]);
    expect(pickDrillsForDay([], "locomotive")).toEqual([]);
  });
});

describe("boundary — the picker never reaches readiness/decision/loadTarget", () => {
  it("imports nothing from readiness / decision / stage4 / loadTarget", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../dayDrillPicker.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "decision", "loadTarget"]) {
      expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });
});
