import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { recommendPreseasonEmphasis, type PreseasonInputs } from "../preseasonEmphasis";
import { strengthConfigForPhase, preseasonBlockForWeeksOut } from "../seasonPhaseStrength";
import { distributeStrengthVolume } from "../inSeasonStrengthMode";

const base: PreseasonInputs = { maxStrengthPctl: 50, powerPctl: 50, bodyFatPct: 12, leanMassKg: 62, massKg: 75, deficitEmphases: [], position: "CM" };

describe("recommendPreseasonEmphasis", () => {
  it("low strength + high body-fat → hypertrophy (build tissue first)", () => {
    const r = recommendPreseasonEmphasis({ ...base, maxStrengthPctl: 20, bodyFatPct: 18 });
    expect(r.emphasis).toBe("hypertrophy");
    expect(r.confidence).toBe("high");
    expect(r.needsBodyComp).toBe(false);
  });
  it("adequate composition + low strength → max_strength (has tissue, lacks ceiling)", () => {
    const r = recommendPreseasonEmphasis({ ...base, maxStrengthPctl: 22, bodyFatPct: 10 });
    expect(r.emphasis).toBe("max_strength");
  });
  it("strong but low power → power (convert to fast force)", () => {
    const r = recommendPreseasonEmphasis({ ...base, maxStrengthPctl: 80, powerPctl: 25 });
    expect(r.emphasis).toBe("power");
  });
  it("hamstring/eccentric deficit → injury-prevention overlay as secondary", () => {
    const r = recommendPreseasonEmphasis({ ...base, deficitEmphases: ["hamstring", "eccentric"] });
    expect(r.secondary).toBe("injury_prevention_priority");
    expect(r.why.en.toLowerCase()).toContain("injury");
  });
  it("missing body comp → needsBodyComp, low confidence, safe reconditioning default (never guesses mass vs force)", () => {
    const r = recommendPreseasonEmphasis({ maxStrengthPctl: 20, powerPctl: 40, bodyFatPct: null, leanMassKg: null, massKg: null });
    expect(r.needsBodyComp).toBe(true);
    expect(r.confidence).toBe("low");
    expect(r.emphasis).toBe("strength_endurance");
  });
  it("no test data at all → reconditioning, low confidence", () => {
    const r = recommendPreseasonEmphasis({ maxStrengthPctl: null, powerPctl: null, bodyFatPct: 12 });
    expect(r.emphasis).toBe("strength_endurance");
    expect(r.confidence).toBe("low");
  });
});

describe("strengthConfigForPhase", () => {
  it("off-season = recondition/maintain, pre = build sequence, in = retain", () => {
    expect(strengthConfigForPhase("offseason").goal).toBe("recondition_maintain");
    expect(strengthConfigForPhase("preseason").goal).toBe("build_sequence");
    expect(strengthConfigForPhase("competitive").goal).toBe("retain");
  });
  it("in-season flags: break → mini-block, congested → protection", () => {
    const c = strengthConfigForPhase("competitive", { onBreak: true, congestedWeek: true });
    expect(c.flags.length).toBe(2);
  });
  it("pre-season block by weeks to opener: far → hypertrophy, mid → max, near → power", () => {
    expect(preseasonBlockForWeeksOut(12)).toBe("hypertrophy");
    expect(preseasonBlockForWeeksOut(6)).toBe("max_strength");
    expect(preseasonBlockForWeeksOut(2)).toBe("power");
    expect(preseasonBlockForWeeksOut(null)).toBeNull();
  });
});

describe("distributeStrengthVolume — modes are equal on weekly total", () => {
  const week = { "MD-4": 4, "MD-3": 3, "MD-2": 2, "MD-1": 1 }; // total 10
  it("microdose keeps the distribution", () => {
    expect(distributeStrengthVolume(week, "microdose")).toEqual(week);
  });
  it("traditional concentrates onto MD-4 + MD-2 but preserves the weekly total", () => {
    const out = distributeStrengthVolume(week, "traditional");
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    expect(total).toBe(10); // weekly volume equated (Cuthbert 2021)
    expect(out["MD-4"]).toBeGreaterThan(0);
    expect(out["MD-2"]).toBeGreaterThan(0);
    expect(out["MD-3"]).toBe(0);
    expect(out["MD-1"]).toBe(0);
    expect(out["MD-4"]).toBeGreaterThan(out["MD-2"]); // 60/40 split
  });
});

describe("boundary — strength periodization never reaches readiness/decision/loadTarget", () => {
  it("the new libs import nothing from readiness / decision / stage4 / loadTarget", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const f of ["../preseasonEmphasis.ts", "../seasonPhaseStrength.ts", "../inSeasonStrengthMode.ts"]) {
      const src = readFileSync(resolve(here, f), "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "decision", "loadTarget"]) {
        expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
      }
    }
  });
});
