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

describe("coach-authored rule overrides (merge over defaults)", () => {
  it("no override → byte-identical to the default", () => {
    const def = strengthForBlockGoal("transmute", "preseason");
    const same = strengthForBlockGoal("transmute", "preseason", undefined);
    expect(same).toEqual(def);
    const same2 = strengthForBlockGoal("transmute", "preseason", null);
    expect(same2).toEqual(def);
  });

  it("a partial override merges field-by-field and inherits the rest", () => {
    const def = strengthForBlockGoal("accum", "preseason");
    const out = strengthForBlockGoal("accum", "preseason", { pct1rm: { en: "70–85% 1RM" } });
    expect(out.pct1rm.en).toBe("70–85% 1RM");     // overridden
    expect(out.pct1rm.is).toBe(def.pct1rm.is);     // the un-set language inherits the default
    expect(out.scheme).toEqual(def.scheme);        // untouched field inherits
    expect(out.quality).toEqual(def.quality);
    expect(out.cite).toBe(def.cite);
  });

  it("cite + both languages can be overridden; absent keys fall through", () => {
    const def = strengthForBlockGoal("deload", "competitive");
    const out = strengthForBlockGoal("deload", "competitive", { scheme: { en: "1 heavy single", is: "1 þungt stak" }, cite: "Coach" });
    expect(out.scheme).toEqual({ en: "1 heavy single", is: "1 þungt stak" });
    expect(out.cite).toBe("Coach");
    expect(out.pct1rm).toEqual(def.pct1rm);
  });

  it("every block carries at least one default exercise setup", () => {
    for (const g of ["accum", "transmute", "realize", "deload"] as const) {
      for (const ph of ["preseason", "competitive"] as const) {
        expect(strengthForBlockGoal(g, ph).methods.length).toBeGreaterThan(0);
      }
    }
  });

  it("Realization pre-season defaults to French contrast; Accumulation to straight sets", () => {
    expect(strengthForBlockGoal("realize", "preseason").methods).toContain("french_contrast");
    expect(strengthForBlockGoal("accum", "preseason").methods).toContain("straight");
  });

  it("a methods override replaces the default set; empty/garbage falls back to the default", () => {
    const def = strengthForBlockGoal("transmute", "competitive");
    const out = strengthForBlockGoal("transmute", "competitive", { methods: ["french_contrast", "cluster_extensive"] });
    expect(out.methods).toEqual(["french_contrast", "cluster_extensive"]);
    // other fields still inherit
    expect(out.pct1rm).toEqual(def.pct1rm);
    // empty or unknown keys → keep the default
    expect(strengthForBlockGoal("transmute", "competitive", { methods: [] }).methods).toEqual(def.methods);
    expect(strengthForBlockGoal("transmute", "competitive", { methods: ["nope"] as never }).methods).toEqual(def.methods);
  });

  it("legacy 'cluster' override resolves to the intra-set cluster configuration", () => {
    const out = strengthForBlockGoal("accum", "competitive", { methods: ["cluster"] as never });
    expect(out.methods).toEqual(["cluster_intra"]);
  });

  it("phase config override merges intensity/verdict only", () => {
    const def = strengthConfigForPhase("competitive");
    const out = strengthConfigForPhase("competitive", undefined, { verdict: { en: "Hold strength, our way" } });
    expect(out.verdict.en).toBe("Hold strength, our way");
    expect(out.verdict.is).toBe(def.verdict.is);
    expect(out.intensity).toEqual(def.intensity);
    expect(out.goal).toBe(def.goal); // non-editable fields untouched
  });
});
