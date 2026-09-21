import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rpeAutoregulate } from "../rpeAutoregulate";

describe("rpeAutoregulate", () => {
  it("below target → add_load, above → reduce_load, on target → hold", () => {
    expect(rpeAutoregulate({ prescribedRpe: 8, loggedRpe: [6.5, 6.5] }).suggestion).toBe("add_load");
    expect(rpeAutoregulate({ prescribedRpe: 8, loggedRpe: [9.5, 9] }).suggestion).toBe("reduce_load");
    expect(rpeAutoregulate({ prescribedRpe: 8, loggedRpe: [8, 7.5] }).suggestion).toBe("hold");
  });

  it("carries the mean, delta and a coach-approves note", () => {
    const r = rpeAutoregulate({ prescribedRpe: 8, loggedRpe: [6.5, 6.5] });
    expect(r.loggedRpeMean).toBe(6.5);
    expect(r.delta).toBe(-1.5);
    expect(r.note.en).toMatch(/coach approves/i);
    expect(r.confidence).toBe("moderate"); // exactly 2 sets
    expect(rpeAutoregulate({ prescribedRpe: 8, loggedRpe: [6, 6.5, 6] }).confidence).toBe("high"); // ≥3
  });

  it("insufficient data (no prescribed RPE, or <2 sets) → hold, low confidence, honest note", () => {
    expect(rpeAutoregulate({ prescribedRpe: null, loggedRpe: [7, 7] }).suggestion).toBe("hold");
    const r = rpeAutoregulate({ prescribedRpe: 8, loggedRpe: [7] });
    expect(r.suggestion).toBe("hold");
    expect(r.confidence).toBe("low");
    expect(r.note.en).toMatch(/not enough/i);
  });

  describe("boundary — descriptive suggestion only", () => {
    it("rpeAutoregulate.ts imports nothing from a readiness/decision module", () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(resolve(here, "../rpeAutoregulate.ts"), "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      expect(imports.sort()).toEqual(["@/lib/micropulse/load/peakPeriod"]);
      for (const forbidden of ["readiness", "decision", "stage4", "resolveFinalState", "recommend"]) {
        expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
      }
    });
  });
});
