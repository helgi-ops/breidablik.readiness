import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { classifyDrillLoadType, drillFitForMdDay, type DrillLoadSignal } from "../drillMdFit";

const sig = (over: Partial<DrillLoadSignal> = {}): DrillLoadSignal => ({
  category: "ssg", player_load_per_min: 8, distance_m: 1200, duration_min: 20,
  vel_b5: 20, vel_b6: 0, hir_total: 20, max_velocity: 22, accel_b23: 2, decel_b23: 2, area_per_player_m2: 150, ...over,
});

describe("classifyDrillLoadType", () => {
  it("high accel/decel + small area + low HSR → mechanical (high confidence)", () => {
    const r = classifyDrillLoadType(sig({ accel_b23: 14, decel_b23: 12, vel_b5: 10, vel_b6: 0, area_per_player_m2: 70 }));
    expect(r.type).toBe("mechanical");
    expect(r.confidence).toBe("high");
    expect(r.why.en).toMatch(/mechanical/i);
  });

  it("high vel_b5/b6 + distance + large area → locomotive", () => {
    const r = classifyDrillLoadType(sig({ vel_b5: 260, vel_b6: 120, distance_m: 3000, accel_b23: 1, decel_b23: 1, area_per_player_m2: 300 }));
    expect(r.type).toBe("locomotive");
  });

  it("GPS absent, small area only → mechanical, low confidence", () => {
    const r = classifyDrillLoadType({
      category: "ssg", player_load_per_min: null, distance_m: null, duration_min: null,
      vel_b5: null, vel_b6: null, hir_total: null, max_velocity: null, accel_b23: null, decel_b23: null, area_per_player_m2: 60,
    });
    expect(r.type).toBe("mechanical");
    expect(r.confidence).toBe("low");
  });

  it("short max-velocity exposure → speed", () => {
    const r = classifyDrillLoadType(sig({ max_velocity: 31, duration_min: 10, accel_b23: 1, decel_b23: 1, vel_b5: 15, vel_b6: 5, distance_m: 400 }));
    expect(r.type).toBe("speed");
  });

  it("warm-up / technical with no GPS → low", () => {
    const r = classifyDrillLoadType({
      category: "warmup", player_load_per_min: null, distance_m: null, duration_min: null,
      vel_b5: null, vel_b6: null, hir_total: null, max_velocity: null, accel_b23: null, decel_b23: null,
    });
    expect(r.type).toBe("low");
  });
});

describe("drillFitForMdDay — reuses the plannedSessionLoad SessionLoadType", () => {
  it("locomotive drill on a mechanical day → off with a clear reason", () => {
    const f = drillFitForMdDay("locomotive", "mechanical");
    expect(f.fit).toBe("off");
    expect(f.reason.en).toMatch(/mechanical day/i);
    expect(f.score).toBeLessThan(50);
  });
  it("mechanical drill on a mechanical day → ideal", () => {
    const f = drillFitForMdDay("mechanical", "mechanical");
    expect(f.fit).toBe("ideal");
    expect(f.score).toBeGreaterThan(80);
  });
  it("locomotive drill on a locomotive day → ideal; mechanical on locomotive → off", () => {
    expect(drillFitForMdDay("locomotive", "locomotive").fit).toBe("ideal");
    expect(drillFitForMdDay("mechanical", "locomotive").fit).toBe("off");
  });
  it("mdContext refines: speed on MD-2 → ideal; heavy on MD-1 → off; MD+2 recovery only low; MD+1 top-up loads both", () => {
    expect(drillFitForMdDay("speed", "mixed", "MD-2").fit).toBe("ideal");
    expect(drillFitForMdDay("mechanical", "mixed", "MD-1").fit).toBe("off");
    expect(drillFitForMdDay("low", "mixed", "MD-1").fit).toBe("ideal");
    // MD+2 = recovery: only low-load flow is ideal, the rest off.
    expect(drillFitForMdDay("locomotive", "mixed", "MD+2").fit).toBe("off");
    expect(drillFitForMdDay("low", "mixed", "MD+2").fit).toBe("ideal");
    // MD+1 = top-up: BOTH locomotive (HSR) and mechanical (accel/decel) are ideal.
    expect(drillFitForMdDay("locomotive", "mixed", "MD+1").fit).toBe("ideal");
    expect(drillFitForMdDay("mechanical", "mixed", "MD+1").fit).toBe("ideal");
  });
  it("mixed day accommodates most; balanced is the clean fit", () => {
    expect(drillFitForMdDay("balanced", "mixed").fit).toBe("ideal");
    expect(drillFitForMdDay("mechanical", "mixed").fit).toBe("ok");
  });
});

describe("boundary — drill fit never reaches readiness/decision, reuses plannedSessionLoad", () => {
  it("imports SessionLoadType from plannedSessionLoad and nothing from readiness/decision", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../drillMdFit.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports.some((p) => p.includes("plannedSessionLoad"))).toBe(true); // reuses MD→type, no re-derivation
    for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "decision", "loadTarget"]) {
      expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });
});
