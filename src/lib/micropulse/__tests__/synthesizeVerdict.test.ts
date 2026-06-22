/**
 * Tests for layers 1+3 of capability-driven interpretation
 * (docs/interpretation-architecture.md, step 3) and the step-5 sanity:
 *
 *   Anton (Pro)  → SPIKING, braking via IMA decel.
 *   Core player  → SPIKING, braking via Gen2 efforts.
 *   SAME sentence (names the dimension, not the column), DIFFERENT underlying
 *   metric, LOWER confidence for the Core club.
 *
 * Run with:  npx vitest src/lib/micropulse/__tests__/synthesizeVerdict.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { synthesizeVerdict } from "../interpretation/synthesizeVerdict";
import { interpretMetric } from "../interpretation/interpretMetric";

const baseline = (mean, sd, n) => ({
  player_id: "p", metric_key: "x", n_observations: n, mean, sd, cv: null, median: null,
  window_days: 28, status: n >= 14 ? "active" : n >= 7 ? "calibrating" : "insufficient_data", computed_at: "",
});

describe("interpretMetric — wraps flagAgainstBaseline into low/normal/high/spike", () => {
  it("flags a spike (>=2 SD) on a mature baseline", () => {
    const r = interpretMetric("ima_decel", 140, baseline(80, 20, 20)); // z = 3.0
    expect(r.band).toBe("spike");
    expect(r.z).toBe(3);
    expect(r.confidence.mature).toBe(true);
    expect(r.plain.EN.toLowerCase()).toContain("above his usual");
  });

  it("downgrades a 2-SD reading to 'high' when the baseline is too thin to trust", () => {
    const r = interpretMetric("accel_decel_efforts", 140, baseline(80, 20, 6)); // z 3.0 but n=6
    expect(r.confidence.mature).toBe(false);
    expect(r.band).not.toBe("spike");
  });

  it("null value or no baseline → normal, never invented", () => {
    expect(interpretMetric("ima_decel", null, baseline(80, 20, 20)).band).toBe("normal");
    expect(interpretMetric("ima_decel", 200, null).band).toBe("normal");
  });
});

describe("synthesizeVerdict — Pro vs Core braking spike (step-5 sanity)", () => {
  // Anton, Pro: braking spike via IMA decel; full dimension set; mature baseline.
  const pro = synthesizeVerdict({
    dimensions: [
      { dimension: "volume", metricKey: "total_player_load", z: 0.4, band: "normal" },
      { dimension: "intensity", metricKey: "player_load_per_minute", z: 0.6, band: "normal" },
      { dimension: "braking", metricKey: "ima_decel", z: 3.1, band: "spike" },
      { dimension: "sprint", metricKey: "velocity_band6_total_efforts_gen2", z: 1.2, band: "high" },
    ],
    acwr: { ratio: 1.15 },          // SAFE — the spike, not ACWR, drives the band
    baselineDays: 20,
    dimensionsCovered: 4,
  });

  // Core club: braking spike via Gen2 efforts (NO IMA available); newer club so a
  // shorter baseline → honestly lower confidence.
  const core = synthesizeVerdict({
    dimensions: [
      { dimension: "volume", metricKey: "total_player_load", z: 0.3, band: "normal" },
      { dimension: "intensity", metricKey: "player_load_per_minute", z: 0.5, band: "normal" },
      { dimension: "braking", metricKey: "accel_decel_efforts", z: 2.3, band: "spike" },
      { dimension: "sprint", metricKey: "velocity_band6_total_efforts_gen2", z: 0.9, band: "normal" },
    ],
    acwr: { ratio: 1.1 },
    baselineDays: 12,
    dimensionsCovered: 4,
  });

  it("both read SPIKING", () => {
    expect(pro.band).toBe("SPIKING");
    expect(core.band).toBe("SPIKING");
  });

  it("braking is the top driver for both, but a DIFFERENT underlying column", () => {
    expect(pro.drivers[0].dimension).toBe("braking");
    expect(core.drivers[0].dimension).toBe("braking");
    expect(pro.drivers[0].metricKey).toBe("ima_decel");
    expect(core.drivers[0].metricKey).toBe("accel_decel_efforts");
    expect(pro.drivers[0].metricKey).not.toBe(core.drivers[0].metricKey);
  });

  it("IDENTICAL coach sentence (names the dimension, not the column)", () => {
    expect(core.sentence.EN).toBe(pro.sentence.EN);
    expect(core.sentence.IS).toBe(pro.sentence.IS);
    expect(pro.sentence.EN.toLowerCase()).toContain("braking load");
  });

  it("the driver tooltip still reveals the underlying signal (drill-down)", () => {
    expect(pro.drivers[0].tooltip.EN.toLowerCase()).toContain("ima");
    expect(core.drivers[0].tooltip.EN.toLowerCase()).toContain("efforts");
  });

  it("Core reads LOWER confidence (shorter baseline) — honest, not faked away", () => {
    expect(pro.confidence.level).toBe("high");
    expect(core.confidence.level).toBe("moderate");
  });
});

describe("synthesizeVerdict — band rules + contested guardrail", () => {
  it("ACWR > 1.5 alone drives SPIKING even with no dimension spike", () => {
    const v = synthesizeVerdict({ dimensions: [{ dimension: "volume", metricKey: "total_player_load", z: 0.2, band: "normal" }], acwr: { ratio: 1.7 }, baselineDays: 20, dimensionsCovered: 1 });
    expect(v.band).toBe("SPIKING");
  });

  it("a high (not spike) dimension → BUILDING", () => {
    const v = synthesizeVerdict({ dimensions: [{ dimension: "braking", metricKey: "ima_decel", z: 1.3, band: "high" }], acwr: { ratio: 1.0 }, baselineDays: 20, dimensionsCovered: 1 });
    expect(v.band).toBe("BUILDING");
  });

  it("a contested metabolic spike alone NEVER flips the band", () => {
    const v = synthesizeVerdict({
      dimensions: [
        { dimension: "intensity", metricKey: "metabolic_power", z: 3.0, band: "spike", contested: true },
        { dimension: "volume", metricKey: "total_player_load", z: 0.1, band: "normal" },
      ],
      acwr: { ratio: 1.0 }, baselineDays: 20, dimensionsCovered: 2,
    });
    expect(v.band).toBe("SUSTAINABLE");
  });

  it("everything normal + safe ACWR → SUSTAINABLE", () => {
    const v = synthesizeVerdict({ dimensions: [{ dimension: "volume", metricKey: "total_player_load", z: 0.1, band: "normal" }], acwr: { ratio: 1.0 }, baselineDays: 20, dimensionsCovered: 4 });
    expect(v.band).toBe("SUSTAINABLE");
  });
});
