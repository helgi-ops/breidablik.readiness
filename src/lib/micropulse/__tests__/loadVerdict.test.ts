/**
 * Tests for loadVerdict (the Load Intelligence explainability synthesis).
 *
 * Run with:  npx vitest src/lib/micropulse/__tests__/loadVerdict.test.ts
 *
 * The headline sanity check is on Anton Logi around 16 June 2026 — his real
 * signals (pulled from player_external_load_daily): ACWR is only 1.15 (SAFE),
 * so the verdict must read SPIKING via the BRAKING spike (16 Jun decel z = 3.1,
 * ≥ 2.0 SD), with braking + high-speed running (z = 1.8) named as drivers.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { computeLoadVerdict, type LoadVerdictInput } from "../loadVerdict";

describe("loadVerdict — Anton sanity (~16 Jun 2026, real signals)", () => {
  const anton: LoadVerdictInput = {
    subject: { name: "Anton" },
    acwr: { ratio: 1.15, band: "SAFE", daysObserved: 14 }, // SAFE — NOT the trigger
    movementSpike: { peakZ: 1.2, spike: false },           // not the trigger either
    braking: { value: 140, z: 3.1 },                       // the spike: decel z 3.1 ≥ 2.0
    hsr: { value: 545, z: 1.8 },                           // elevated driver
    hid: { value: 18, z: 0.9 },
    mli: { value: 62, z: 1.1 },
    monotony: { monotony: 1.4, strain: 2100, rising: false },
    metabolic: { value: 11.2, z: 0.6 },
  };
  const v = computeLoadVerdict(anton);

  it("reads SPIKING even though ACWR is in the SAFE band", () => {
    expect(v.band).toBe("SPIKING");
  });

  it("names braking and HSR as drivers, braking first (highest z)", () => {
    const signals = v.drivers.map((d) => d.signal);
    expect(signals).toContain("braking");
    expect(signals).toContain("hsr");
    expect(v.drivers[0].signal).toBe("braking");
    expect(v.drivers[0].z).toBe(3.1);
  });

  it("does not let the contested metabolic signal in as a driver (z below bar)", () => {
    expect(v.drivers.map((d) => d.signal)).not.toContain("metabolic");
  });

  it("sentence is plain-language and mentions the drivers", () => {
    expect(v.sentence.EN.toLowerCase()).toContain("spiking");
    expect(v.sentence.EN.toLowerCase()).toContain("braking");
    expect(v.sentence.IS).toContain("Anton");
  });

  it("confidence is reported with coverage + baseline (never hidden)", () => {
    expect(["high", "moderate", "low"]).toContain(v.confidence.level);
    expect(v.confidence.baselineDays).toBe(14);
    expect(v.confidence.coverage).toBeGreaterThan(0);
  });

  it("surfaces a spike component tile flagged HIGH", () => {
    const spike = v.components.find((c) => c.key === "spike");
    expect(spike?.band).toBe("HIGH");
  });
});

describe("loadVerdict — band logic", () => {
  const base = { subject: { name: "X" }, braking: { value: 1, z: 0 }, hsr: { value: 1, z: 0 } };

  it("SUSTAINABLE when ACWR is in the sweet spot and nothing spikes", () => {
    const v = computeLoadVerdict({ ...base, acwr: { ratio: 1.0, band: "SAFE", daysObserved: 20 } });
    expect(v.band).toBe("SUSTAINABLE");
  });

  it("BUILDING on a WATCH-band ACWR (1.3–1.5)", () => {
    const v = computeLoadVerdict({ ...base, acwr: { ratio: 1.4, band: "WATCH", daysObserved: 20 } });
    expect(v.band).toBe("BUILDING");
  });

  it("SPIKING on a RISK-band ACWR (> 1.5)", () => {
    const v = computeLoadVerdict({ ...base, acwr: { ratio: 1.7, band: "RISK", daysObserved: 20 } });
    expect(v.band).toBe("SPIKING");
    expect(v.drivers[0].signal).toBe("acwr_spike");
  });

  it("UNDER on a low ACWR (< 0.8)", () => {
    const v = computeLoadVerdict({ ...base, acwr: { ratio: 0.6, band: "UNDERTRAIN", daysObserved: 20 } });
    expect(v.band).toBe("UNDER");
  });

  it("metabolic power alone never flips a band (guardrail)", () => {
    const v = computeLoadVerdict({ subject: { name: "X" }, acwr: { ratio: 1.0, band: "SAFE", daysObserved: 20 }, metabolic: { value: 14, z: 3.0 } });
    expect(v.band).toBe("SUSTAINABLE");
  });
});

describe("loadVerdict — confidence degrades, never the band", () => {
  it("low coverage / short baseline → low confidence (band still computed)", () => {
    const v = computeLoadVerdict({ subject: { name: "X" }, acwr: { ratio: 1.7, band: "RISK", daysObserved: 5 }, braking: { value: 1, z: 2.5 } });
    expect(v.band).toBe("SPIKING");          // band honest
    expect(v.confidence.level).toBe("low");  // confidence honest about thin data
  });
});
