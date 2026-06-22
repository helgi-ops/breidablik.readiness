/**
 * Tests for the capability-driven interpretation resolver
 * (docs/interpretation-architecture.md, steps 1+2).
 *
 * Headline check: the SAME "braking" dimension resolves to a DIFFERENT underlying
 * column per club, from data alone — Þór (Core: no IMA, braking = Gen2 decel
 * efforts) vs Breiðablik (Pro: braking = IMA decel). One engine, no tier branch.
 *
 * Coverage fixtures are the real 2026 numbers read from the DB (22 Jun 2026):
 *   Breiðablik  ima_decel 96% · decel_b2_3 88% · accel_decel 0%  · vb6 51% · HML 99% · HR 0%
 *   Þór         ima_decel 0%  · decel_b2_3 0%  · accel_decel 87% · vb6 53% · HML 84% · HR 0%
 *
 * Run with:  npx vitest src/lib/micropulse/__tests__/interpretation.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { resolveFromCoverage, computeCoverage, AVAILABILITY_THRESHOLD } from "../interpretation/resolveCapabilities";
import { metricsForDimension, getMetric, DIMENSIONS } from "../interpretation/registry";

// Real coverage (fraction of rows non-null & non-zero over the season window).
const BREIDABLIK = {
  total_player_load: 1.0, total_distance: 0.94,
  player_load_per_minute: 1.0, metabolic_power: 0.1,
  ima_decel: 0.96, decel_b2_3_tot_effs_gen2: 0.88, accel_decel_efforts: 0.0,
  velocity_band6_total_efforts_gen2: 0.51, velocity_band5_total_efforts_gen2: 0.81,
  high_speed_distance: 0.82, sprint_distance: 0.60,
  high_metabolic_load_distance_m: 0.99,
  avg_heart_rate: 0.0,
};
const THOR = {
  total_player_load: 1.0, total_distance: 0.94,
  player_load_per_minute: 1.0, metabolic_power: 0.1,
  ima_decel: 0.0, decel_b2_3_tot_effs_gen2: 0.0, accel_decel_efforts: 0.87,
  velocity_band6_total_efforts_gen2: 0.53, velocity_band5_total_efforts_gen2: 0.81,
  high_speed_distance: 0.82, sprint_distance: 0.60,
  high_metabolic_load_distance_m: 0.84,
  avg_heart_rate: 0.0,
};

describe("resolveCapabilities — Þór (Core) vs Breiðablik (Pro)", () => {
  const pro = resolveFromCoverage(BREIDABLIK);
  const core = resolveFromCoverage(THOR);

  it("Pro braking resolves to IMA decel", () => {
    expect(pro.dimensions.braking).toBe("ima_decel");
  });

  it("Core braking resolves to the non-IMA Gen2 efforts signal", () => {
    expect(core.dimensions.braking).toBe("accel_decel_efforts");
  });

  it("same coach-facing dimension, different underlying column per club (graceful degradation)", () => {
    expect(pro.dimensions.braking).not.toBe(core.dimensions.braking);
    // ...yet BOTH cover the braking dimension — the coach reads the same thing.
    expect(pro.dimensions.braking).not.toBeNull();
    expect(core.dimensions.braking).not.toBeNull();
  });

  it("Core resolves NO IMA metric in any dimension (no IMA tier)", () => {
    const coreMetrics = Object.values(core.dimensions).filter(Boolean) as string[];
    expect(coreMetrics.some((k) => k.startsWith("ima_"))).toBe(false);
    // Pro, by contrast, does lean on IMA.
    const proMetrics = Object.values(pro.dimensions).filter(Boolean) as string[];
    expect(proMetrics.some((k) => k.startsWith("ima_"))).toBe(true);
  });

  it("volume / intensity / sprint / metabolic resolve identically; both omit internal (no HR belts)", () => {
    for (const d of ["volume", "intensity", "sprint", "metabolic"]) {
      expect(core.dimensions[d]).toBe(pro.dimensions[d]);
    }
    expect(pro.dimensions.volume).toBe("total_player_load");
    expect(pro.dimensions.intensity).toBe("player_load_per_minute");
    expect(pro.dimensions.sprint).toBe("velocity_band6_total_efforts_gen2");
    // Metabolic load (HML) is a first-class dimension both tiers cover from GPS —
    // no IMA required, so Core gets it too.
    expect(pro.dimensions.metabolic).toBe("high_metabolic_load_distance_m");
    expect(core.dimensions.metabolic).toBe("high_metabolic_load_distance_m");
    expect(pro.dimensions.internal).toBeNull();
    expect(core.dimensions.internal).toBeNull();
  });

  it("both cover 5 of 6 dimensions today (internal missing until HR belts)", () => {
    expect(pro.dimensionsCovered).toBe(5);
    expect(core.dimensionsCovered).toBe(5);
  });
});

describe("resolveCapabilities — preference, threshold, self-upgrade", () => {
  it("prefers the lower-rank metric when several are available (Pro has both IMA + Gen2 decel)", () => {
    const r = resolveFromCoverage(BREIDABLIK);
    expect(BREIDABLIK.ima_decel).toBeGreaterThanOrEqual(AVAILABILITY_THRESHOLD);
    expect(BREIDABLIK.decel_b2_3_tot_effs_gen2).toBeGreaterThanOrEqual(AVAILABILITY_THRESHOLD);
    expect(r.dimensions.braking).toBe("ima_decel"); // rank 1 beats rank 2
  });

  it("omits a dimension below the 50% threshold, includes it at/above", () => {
    expect(resolveFromCoverage({ total_player_load: 0.49 }).dimensions.volume).toBeNull();
    expect(resolveFromCoverage({ total_player_load: 0.5 }).dimensions.volume).toBe("total_player_load");
  });

  it("self-upgrades: Core club adds HR belts → internal dimension lights up, no config", () => {
    const upgraded = resolveFromCoverage({ ...THOR, avg_heart_rate: 0.8 });
    expect(upgraded.dimensions.internal).toBe("avg_heart_rate");
    expect(upgraded.dimensionsCovered).toBe(6); // volume+intensity+braking+sprint+metabolic+internal
  });

  it("a contested metric never wins over a clean one in its dimension", () => {
    // metabolic_power (contested, rank 9) sits in 'metabolic' behind HML (rank 1).
    expect(getMetric("metabolic_power")?.contested).toBe(true);
    expect(resolveFromCoverage({ metabolic_power: 1.0, high_metabolic_load_distance_m: 1.0 }).dimensions.metabolic)
      .toBe("high_metabolic_load_distance_m");
    // ...but if HML is absent, the contested signal is better than nothing.
    expect(resolveFromCoverage({ metabolic_power: 1.0 }).dimensions.metabolic).toBe("metabolic_power");
  });
});

describe("computeCoverage — non-null & non-zero", () => {
  it("counts only present, non-zero, finite values", () => {
    const rows = [{ x: 5 }, { x: 0 }, { x: null }, { x: 3 }, { x: "bad" }];
    expect(computeCoverage(rows, ["x"]).x).toBe(2 / 5); // 5 and 3 count; 0, null, "bad" don't
  });

  it("empty window → 0 coverage, all dimensions omitted", () => {
    expect(computeCoverage([], ["total_player_load"]).total_player_load).toBe(0);
    expect(resolveFromCoverage(computeCoverage([])).dimensionsCovered).toBe(0);
  });
});

describe("registry sanity", () => {
  it("every dimension has at least one metric, ordered by preference", () => {
    for (const d of DIMENSIONS) {
      const ms = metricsForDimension(d);
      expect(ms.length).toBeGreaterThan(0);
      const ranks = ms.map((m) => m.preferenceRank);
      expect([...ranks]).toEqual([...ranks].sort((a, b) => a - b));
    }
  });
});
