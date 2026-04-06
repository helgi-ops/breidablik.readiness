/**
 * Tests for extractMetabolicMetrics() in normalize.ts
 *
 * Run with: npx vitest src/lib/integrations/catapult/__tests__/extractMetabolicMetrics.test.ts
 * (after adding vitest to devDependencies: npm i -D vitest)
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { extractMetabolicMetrics } from "../normalize";

describe("extractMetabolicMetrics", () => {
  // ─── Field mapping variants ──────────────────────────────────────────────

  it("extracts avg power from 'metabolic_power'", () => {
    const result = extractMetabolicMetrics({ metabolic_power: 14.5 });
    expect(result.metabolicPower).toBeCloseTo(14.5);
  });

  it("extracts avg power from 'average_metabolic_power'", () => {
    const result = extractMetabolicMetrics({ average_metabolic_power: 12.3 });
    expect(result.metabolicPower).toBeCloseTo(12.3);
  });

  it("extracts peak power from 'peak_metabolic_power'", () => {
    const result = extractMetabolicMetrics({ peak_metabolic_power: 38.2 });
    expect(result.metabolicPowerPeak).toBeCloseTo(38.2);
  });

  it("extracts peak power from 'max_metabolic_power'", () => {
    const result = extractMetabolicMetrics({ max_metabolic_power: 40.1 });
    expect(result.metabolicPowerPeak).toBeCloseTo(40.1);
  });

  it("extracts HMLD from 'hmld'", () => {
    const result = extractMetabolicMetrics({ hmld: 1840 });
    expect(result.highMetabolicLoadDistanceM).toBeCloseTo(1840);
  });

  it("extracts HMLD from 'high_metabolic_load_distance'", () => {
    const result = extractMetabolicMetrics({ high_metabolic_load_distance: 1500 });
    expect(result.highMetabolicLoadDistanceM).toBeCloseTo(1500);
  });

  it("extracts energy from 'energy_kj'", () => {
    const result = extractMetabolicMetrics({ energy_kj: 1200 });
    expect(result.metabolicEnergyKj).toBeCloseTo(1200);
  });

  it("extracts time above threshold from 'hml_time'", () => {
    const result = extractMetabolicMetrics({ hml_time: 360 });
    expect(result.timeAboveHmlThresholdS).toBeCloseTo(360);
  });

  // ─── Null-safety ──────────────────────────────────────────────────────────

  it("returns all nulls for empty record", () => {
    const result = extractMetabolicMetrics({});
    expect(result.metabolicPower).toBeNull();
    expect(result.metabolicPowerPeak).toBeNull();
    expect(result.highMetabolicLoadDistanceM).toBeNull();
    expect(result.metabolicEnergyKj).toBeNull();
    expect(result.timeAboveHmlThresholdS).toBeNull();
    expect(result.metabolicDataValid).toBe(false);
  });

  // ─── Corrupt value sanitisation ─────────────────────────────────────────

  it("nullifies negative HMLD", () => {
    const result = extractMetabolicMetrics({ hmld: -100 });
    expect(result.highMetabolicLoadDistanceM).toBeNull();
  });

  it("nullifies negative metabolic power", () => {
    const result = extractMetabolicMetrics({ metabolic_power: -5 });
    expect(result.metabolicPower).toBeNull();
  });

  it("nullifies absurdly high peak power (> 60 W/kg)", () => {
    const result = extractMetabolicMetrics({ peak_metabolic_power: 9999 });
    expect(result.metabolicPowerPeak).toBeNull();
  });

  // ─── metabolicDataValid flag ────────────────────────────────────────────

  it("sets metabolicDataValid = true when avg power > 0", () => {
    const result = extractMetabolicMetrics({ metabolic_power: 14 });
    expect(result.metabolicDataValid).toBe(true);
  });

  it("sets metabolicDataValid = true when only HMLD > 0", () => {
    const result = extractMetabolicMetrics({ hmld: 1000 });
    expect(result.metabolicDataValid).toBe(true);
  });

  it("sets metabolicDataValid = false when all values are 0", () => {
    const result = extractMetabolicMetrics({ metabolic_power: 0, hmld: 0, energy_kj: 0 });
    expect(result.metabolicDataValid).toBe(false);
  });

  // ─── Generation detection ────────────────────────────────────────────────

  it("detects gen2 from key names", () => {
    const result = extractMetabolicMetrics({
      gen2_metabolic_power: 14,
    });
    expect(result.metabolicPowerGen).toBe("gen2");
  });

  it("falls back to gen1 when avg power present but no gen indicator", () => {
    const result = extractMetabolicMetrics({ metabolic_power: 14 });
    expect(result.metabolicPowerGen).toBe("gen1");
  });

  it("returns null gen when no metabolic data present", () => {
    const result = extractMetabolicMetrics({});
    expect(result.metabolicPowerGen).toBeNull();
  });
});
