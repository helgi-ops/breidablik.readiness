import { describe, it, expect } from "vitest";
import { strengthForBlockGoal, strengthConfigForPhase, preseasonBlockForWeeksOut } from "../seasonPhaseStrength";

describe("strengthForBlockGoal — the meso strength lane on the shared blocks", () => {
  it("pre-season Accumulation = hypertrophy (higher volume, moderate load)", () => {
    const s = strengthForBlockGoal("accum", "preseason");
    expect(s.goalKey).toBe("accum");
    expect(s.quality.en).toMatch(/hypertrophy/i);
    expect(s.pct1rm.en).toMatch(/65–80/);
    expect(s.scheme.en).toMatch(/8–12/);
  });

  it("in-season Accumulation = a heavier max-strength re-accumulation base", () => {
    const s = strengthForBlockGoal("accum", "competitive");
    expect(s.quality.en).toMatch(/max-strength/i);
    expect(s.pct1rm.en).toMatch(/80–90/);
    expect(s.scheme.en).toMatch(/re-accumulate/i);
  });

  it("Transmutation = strength–power (70–85%, explosive)", () => {
    const s = strengthForBlockGoal("transmute", "competitive");
    expect(s.quality.en).toMatch(/strength–power/i);
    expect(s.pct1rm.en).toMatch(/70–85/);
    expect(s.scheme.en).toMatch(/velocity-loss/i);
  });

  it("Realization = power / speed-strength, low volume + taper", () => {
    const s = strengthForBlockGoal("realize", "competitive");
    expect(s.quality.en).toMatch(/power/i);
    expect(s.pct1rm.en).toMatch(/30–60/);
    expect(s.scheme.en).toMatch(/taper/i);
  });

  it("Deload holds intensity but cuts volume — unload, not detrain", () => {
    const s = strengthForBlockGoal("deload", "preseason");
    expect(s.quality.en).toBe("Deload");
    expect(s.scheme.en).toMatch(/don't detrain/i);
    // deload ignores phase — same unload either way
    expect(strengthForBlockGoal("deload", "competitive").scheme.en).toBe(s.scheme.en);
  });

  it("in-season Transmutation reads as microdosed / low volume, pre-season as a full build", () => {
    expect(strengthForBlockGoal("transmute", "preseason").scheme.en).toMatch(/3–5 × 3–5/);
    const inSeason = strengthForBlockGoal("transmute", "competitive").scheme.en;
    expect(inSeason).toMatch(/microdosed/i);
    expect(inSeason).toMatch(/low volume/i);
    // intensity zone is unchanged — the macro caps VOLUME, not intensity
    expect(strengthForBlockGoal("transmute", "competitive").pct1rm.en).toMatch(/70–85/);
  });

  it("Realization stays low-volume/taper in both phases (peaking is inherently low volume)", () => {
    expect(strengthForBlockGoal("realize", "preseason").scheme.en).toMatch(/taper/i);
    expect(strengthForBlockGoal("realize", "competitive").scheme.en).toMatch(/taper/i);
  });

  it("every block carries a citation (provenance)", () => {
    for (const g of ["accum", "transmute", "realize", "deload"] as const) {
      expect(strengthForBlockGoal(g, "preseason").cite.length).toBeGreaterThan(0);
    }
  });

  // Boundary: this pure meso layer must not IMPORT readiness / decision / load-target engines
  // (comment prose may mention "readiness colour" — we only guard the import graph).
  it("stays a pure config layer (no forbidden imports)", async () => {
    const fs = await import("node:fs");
    const url = new URL("../seasonPhaseStrength.ts", import.meta.url);
    const importLines = fs.readFileSync(url, "utf8").split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
    for (const bad of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "loadTarget"]) {
      expect(importLines.includes(bad)).toBe(false);
    }
  });
});

describe("existing phase config still holds", () => {
  it("preseason builds the sequence, competitive retains", () => {
    expect(strengthConfigForPhase("preseason").goal).toBe("build_sequence");
    expect(strengthConfigForPhase("competitive").goal).toBe("retain");
  });
  it("preseasonBlockForWeeksOut sequences by weeks to opener", () => {
    expect(preseasonBlockForWeeksOut(10)).toBe("hypertrophy");
    expect(preseasonBlockForWeeksOut(5)).toBe("max_strength");
    expect(preseasonBlockForWeeksOut(2)).toBe("power");
    expect(preseasonBlockForWeeksOut(null)).toBeNull();
  });
});
