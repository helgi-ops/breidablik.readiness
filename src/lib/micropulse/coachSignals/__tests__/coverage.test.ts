import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  deriveFitnessTrendSignal, deriveBodyCompSignal, deriveSpeedZonesSignal,
  type FitnessTrendLite, type BodyCompLite, type SpeedZonesLite,
} from "../index";

const fit = (over: Partial<FitnessTrendLite> = {}): FitnessTrendLite =>
  ({ playerId: "p1", name: "Jón", dir: "stable", metricEn: "VAMEVAL (MAS)", metricIs: "VAMEVAL (MAS)", seasonDeltaPct: 0, swcPct: 3, ...over });

describe("deriveFitnessTrendSignal", () => {
  it("no down trend → steady (no chip)", () => {
    expect(deriveFitnessTrendSignal([fit({ dir: "stable" }), fit({ dir: "up" })]).level).toBe("steady");
  });
  it("a down trend → watch/elevated with label, href, counterfactual", () => {
    const one = deriveFitnessTrendSignal([fit({ dir: "down", seasonDeltaPct: -3.7 })]);
    expect(one.level).toBe("watch");
    expect(one.engine).toBe("fitness_trend");
    expect(one.href).toBe("/coach/conditioning");
    expect(one.counterfactual?.en).toMatch(/retest/i);
    expect(one.why.en[0]).toMatch(/drop beyond test error/i);
    const two = deriveFitnessTrendSignal([fit({ dir: "down" }), fit({ dir: "down", playerId: "p2", name: "Ari" })]);
    expect(two.level).toBe("elevated");
  });
});

const bc = (over: Partial<BodyCompLite> = {}): BodyCompLite => ({ playerId: "p1", name: "Jón", deltaPct: 0, bandPct: 4, ...over });

describe("deriveBodyCompSignal", () => {
  it("within the error band → steady", () => {
    expect(deriveBodyCompSignal([bc({ deltaPct: 2 }), bc({ deltaPct: -3 })]).level).toBe("steady");
  });
  it("beyond the band → watch, and the wording is NEUTRAL (no target/eval)", () => {
    const s = deriveBodyCompSignal([bc({ deltaPct: -6 })]);
    expect(s.level).toBe("watch");
    expect(s.engine).toBe("body_comp");
    const text = `${s.label.en} ${s.why.en.join(" ")} ${s.counterfactual?.en ?? ""}`.toLowerCase();
    for (const banned of ["target", "ideal", "too high", "too fat", "overweight", "goal", "rank"]) {
      expect(text.includes(banned)).toBe(false);
    }
    expect(text).toMatch(/no ideal|no target|trend/);
  });
});

const sz = (over: Partial<SpeedZonesLite> = {}): SpeedZonesLite => ({ playerId: "p1", name: "Jón", hasMas: true, hasZones: true, ...over });

describe("deriveSpeedZonesSignal", () => {
  it("no team member uses zones → steady (don't nudge a team not using them)", () => {
    expect(deriveSpeedZonesSignal([sz({ hasMas: true, hasZones: false })]).level).toBe("steady");
  });
  it("team uses zones + a member has MAS but no zones → watch setup nudge", () => {
    const s = deriveSpeedZonesSignal([sz({ hasZones: true }), sz({ playerId: "p2", name: "Ari", hasMas: true, hasZones: false })]);
    expect(s.level).toBe("watch");
    expect(s.engine).toBe("speed_zones");
    expect(s.href).toBe("/coach/conditioning");
    expect(s.counterfactual?.en).toMatch(/max-sprint|GPS top speed|MSS/i);
  });
});

describe("all new signals — never the readiness colour, always a drill-down href", () => {
  it("carry engine + href, and stay beside the colour", () => {
    const all = [
      deriveFitnessTrendSignal([fit({ dir: "down" })]),
      deriveBodyCompSignal([bc({ deltaPct: -6 })]),
      deriveSpeedZonesSignal([sz({ hasZones: true }), sz({ playerId: "p2", hasMas: true, hasZones: false })]),
    ];
    for (const s of all) {
      expect(s.href.startsWith("/coach/")).toBe(true);
      expect(s.counterfactual?.en.toLowerCase()).toMatch(/never the readiness colour|descriptive/);
    }
  });
});

describe("boundary — derive functions never import readiness/decision modules", () => {
  it("index.ts + newEngineLoads.ts import no readiness/decision engine", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of ["../index.ts", "../newEngineLoads.ts"]) {
      const src = readFileSync(resolve(here, file), "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "athleteState"]) {
        expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
      }
    }
  });
});
