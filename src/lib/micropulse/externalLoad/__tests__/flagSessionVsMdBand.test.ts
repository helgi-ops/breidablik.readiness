import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { flagSessionVsMdBand } from "../loadTargets";

describe("flagSessionVsMdBand — reuses the match_demand_template band", () => {
  // MD-1 totalDistance template pct = 0.50; match demand avg = 10000 m → expected 5000 m.
  it("an MD-1 session well above its expected distance → above (high for a taper day)", () => {
    const r = flagSessionVsMdBand(9500, 10000, 0.5, 1);
    expect(r.expected).toBe(5000);
    expect(r.band).toBe("above");
    expect(r.pctOfExpected).toBe(190);
  });
  it("in-band (within ±15%) → as_expected", () => {
    expect(flagSessionVsMdBand(5200, 10000, 0.5, 1).band).toBe("as_expected");
  });
  it("well below → below", () => {
    expect(flagSessionVsMdBand(3000, 10000, 0.5, 1).band).toBe("below");
  });
  it("mesocycle multiplier scales the expectation", () => {
    // taper meso 0.8 → expected 4000; a 5000 m session is now above
    expect(flagSessionVsMdBand(5000, 10000, 0.5, 0.8).band).toBe("above");
  });
  it("missing / non-positive inputs → unknown, never fabricated", () => {
    expect(flagSessionVsMdBand(null, 10000, 0.5, 1).band).toBe("unknown");
    expect(flagSessionVsMdBand(5000, 0, 0.5, 1).band).toBe("unknown");
    expect(flagSessionVsMdBand(5000, 10000, 0, 1).band).toBe("unknown");
  });
});

describe("boundary — the MD-band flag never reaches readiness / decision modules", () => {
  it("loadTargets.ts imports no readiness/decision engine", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../loadTargets.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "athleteState"]) {
      expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });
});
