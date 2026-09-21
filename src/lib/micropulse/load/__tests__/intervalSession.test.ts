import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildIntervalSession, HIIT_FORMATS } from "../intervalSession";

describe("buildIntervalSession", () => {
  it("MAS 16.0, 'long' (Type 4, 105%) → 16.8 km/h, 4×4 min, ~1120 m/rep, totals", () => {
    const s = buildIntervalSession({ masKmh: 16.0, format: "long" })!;
    expect(s).not.toBeNull();
    expect(s.pctMas).toBe(105);
    expect(s.speedKmh).toBe(16.8);          // 16.0 × 1.05
    expect(s.speedMs).toBe(4.7); // stored 1-dp; exact 4.667 m/s is used internally for distance
    expect(s.workSec).toBe(240);
    expect(s.reps).toBe(4);
    expect(s.sets).toBe(1);
    expect(s.repDistanceM).toBe(1120);      // 4.6667 m/s × 240 s
    expect(s.totalWorkMin).toBe(16);        // 240 × 4 / 60
    expect(s.sessionDistanceM).toBe(4480);  // 1120 × 4
    expect(s.totalSessionMin).toBe(26);     // (240+150) × 4 / 60
  });

  it("'short' 15-15 → per-rep distance from 15 s work, defaults applied", () => {
    const s = buildIntervalSession({ masKmh: 16.0, format: "short" })!;
    expect(s.workSec).toBe(15);
    expect(s.restSec).toBe(15);
    expect(s.reps).toBe(HIIT_FORMATS.short.reps);
    expect(s.sets).toBe(HIIT_FORMATS.short.sets);
    expect(s.repDistanceM).toBe(Math.round((s.speedKmh / 3.6) * 15));
  });

  it("overrides (reps/rest) reflected in totals", () => {
    const base = buildIntervalSession({ masKmh: 16.0, format: "long" })!;
    const over = buildIntervalSession({ masKmh: 16.0, format: "long", overrides: { reps: 6, restSec: 120 } })!;
    expect(over.reps).toBe(6);
    expect(over.restSec).toBe(120);
    expect(over.totalWorkMin).toBe(24);                 // 240 × 6 / 60
    expect(over.sessionDistanceM).toBe(base.repDistanceM! * 6);
    expect(over.totalSessionMin).toBe(36);              // (240+120) × 6 / 60
  });

  it("masKmh null → null (never a fabricated speed)", () => {
    expect(buildIntervalSession({ masKmh: null, format: "long" })).toBeNull();
    expect(buildIntervalSession({ masKmh: 0, format: "long" })).toBeNull();
  });

  it("RSA carries the near-max + COD notes and uses the anaerobic zone", () => {
    const s = buildIntervalSession({ masKmh: 16.0, format: "rsa" })!;
    expect(s.pctMas).toBe(120);            // Type 5
    expect(s.note.en).toMatch(/near-maximal/i);
    expect(s.note.en).toMatch(/change-of-direction/i);
    expect(s.workSec).toBe(6);
  });

  it("recovery is continuous (no rest, single block)", () => {
    const s = buildIntervalSession({ masKmh: 16.0, format: "recovery" })!;
    expect(s.pctMas).toBe(70);
    expect(s.restSec).toBe(0);
    expect(s.reps).toBe(1);
    expect(s.totalSessionMin).toBe(30);    // 1800 s
  });

  it("confidence inherits the MAS provenance", () => {
    expect(buildIntervalSession({ masKmh: 16, format: "long", masConfidence: "high" })!.confidence).toBe("high");
    expect(buildIntervalSession({ masKmh: 16, format: "long" })!.confidence).toBe("moderate");
  });

  describe("boundary — descriptive planning aid, no readiness/decision coupling", () => {
    it("intervalSession.ts imports nothing from a readiness/decision/prescription-engine module", () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(resolve(here, "../intervalSession.ts"), "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      expect(imports.sort()).toEqual(["./peakPeriod", "@/lib/micropulse/periodization"]);
      for (const forbidden of ["readiness", "decision", "stage4", "resolveFinalState", "recommend"]) {
        expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
      }
    });
  });
});
