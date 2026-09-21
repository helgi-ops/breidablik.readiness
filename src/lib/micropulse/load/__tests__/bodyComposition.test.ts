import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { jacksonPollock3, jacksonPollock7, navyCircumference, withLeanMass, sumSkinfolds } from "../bodyComposition";

describe("jacksonPollock3", () => {
  it("men chest/abdomen/thigh 10/15/12, age 25 → BD → Siri %BF, + lean mass at 80 kg", () => {
    const r = jacksonPollock3({ sex: "M", ageYears: 25, sites: { chest: 10, abdomen: 15, thigh: 12 } })!;
    expect(r).not.toBeNull();
    // S=37 → BD = 1.10938 − 0.0008267·37 + 0.0000016·37² − 0.0002574·25 = 1.0745475
    expect(r.bodyDensity).toBeCloseTo(1.07455, 4);
    expect(r.sumSkinfoldsMm).toBe(37);
    // Siri 495/BD − 450 ≈ 10.66 → 10.7
    expect(r.bodyFatPct).toBeCloseTo(10.7, 1);
    expect(r.method).toBe("jp3");
    const withMass = withLeanMass(r, 80);
    expect(withMass.fatKg).toBeCloseTo(8.6, 1);
    expect(withMass.leanKg).toBeCloseTo(71.4, 1);
  });

  it("women use the female sites + constants (triceps/suprailiac/thigh)", () => {
    const r = jacksonPollock3({ sex: "F", ageYears: 25, sites: { triceps: 15, suprailiac: 12, thigh: 20 } })!;
    expect(r).not.toBeNull();
    // S=47 → BD = 1.0994921 − 0.0009929·47 + 0.0000023·47² − 0.0001392·25 ≈ 1.05443
    expect(r.bodyDensity).toBeCloseTo(1.05443, 4);
    expect(r.bodyFatPct).toBeGreaterThan(18);
    expect(r.bodyFatPct).toBeLessThan(21);
  });

  it("Brožek conversion differs from Siri for the same density", () => {
    const siri = jacksonPollock3({ sex: "M", ageYears: 25, sites: { chest: 10, abdomen: 15, thigh: 12 } })!;
    const broz = jacksonPollock3({ sex: "M", ageYears: 25, sites: { chest: 10, abdomen: 15, thigh: 12 }, conversion: "brozek" })!;
    expect(broz.conversion).toBe("brozek");
    expect(broz.bodyFatPct).not.toBe(siri.bodyFatPct);
  });
});

describe("jacksonPollock7", () => {
  it("men, all 7 sites = 12 (S=84), age 30 → 7-site constants", () => {
    const r = jacksonPollock7({ sex: "M", ageYears: 30, sites: { chest: 12, midaxillary: 12, triceps: 12, subscapular: 12, abdomen: 12, suprailiac: 12, thigh: 12 } })!;
    expect(r).not.toBeNull();
    expect(r.sumSkinfoldsMm).toBe(84);
    // BD = 1.112 − 0.00043499·84 + 0.00000055·84² − 0.00028826·30 ≈ 1.07069
    expect(r.bodyDensity).toBeCloseTo(1.07069, 4);
    expect(r.bodyFatPct).toBeCloseTo(12.3, 1);
    expect(r.method).toBe("jp7");
  });

  it("missing even one of the 7 sites → null", () => {
    expect(jacksonPollock7({ sex: "M", ageYears: 30, sites: { chest: 12, midaxillary: 12, triceps: 12, subscapular: 12, abdomen: 12, suprailiac: 12 } })).toBeNull();
  });
});

describe("navyCircumference", () => {
  it("men height 180, neck 38, waist 85 → plausible %BF, no density/skinfold step", () => {
    const r = navyCircumference({ sex: "M", heightCm: 180, neckCm: 38, waistCm: 85 })!;
    expect(r).not.toBeNull();
    expect(r.bodyFatPct).toBeCloseTo(16.1, 1);
    expect(r.method).toBe("navy");
    expect(r.bodyDensity).toBeNull();
    expect(r.sumSkinfoldsMm).toBeNull();
  });

  it("women need hip → null without it", () => {
    expect(navyCircumference({ sex: "F", heightCm: 168, neckCm: 32, waistCm: 72 })).toBeNull();
    expect(navyCircumference({ sex: "F", heightCm: 168, neckCm: 32, waistCm: 72, hipCm: 96 })).not.toBeNull();
  });

  it("waist ≤ neck (invalid log10 domain) → null", () => {
    expect(navyCircumference({ sex: "M", heightCm: 180, neckCm: 40, waistCm: 38 })).toBeNull();
  });
});

describe("guards — never fabricate", () => {
  it("missing a required site → null", () => {
    expect(jacksonPollock3({ sex: "M", ageYears: 25, sites: { chest: 10, abdomen: 15 } })).toBeNull(); // no thigh
  });
  it("out-of-range skinfold (0 or 90 mm) → null", () => {
    expect(jacksonPollock3({ sex: "M", ageYears: 25, sites: { chest: 0, abdomen: 15, thigh: 12 } })).toBeNull();
    expect(jacksonPollock3({ sex: "M", ageYears: 25, sites: { chest: 90, abdomen: 15, thigh: 12 } })).toBeNull();
  });
  it("absent / implausible age → null", () => {
    expect(jacksonPollock3({ sex: "M", ageYears: NaN, sites: { chest: 10, abdomen: 15, thigh: 12 } })).toBeNull();
    expect(jacksonPollock3({ sex: "M", ageYears: 200, sites: { chest: 10, abdomen: 15, thigh: 12 } })).toBeNull();
  });
  it("withLeanMass leaves lean/fat null when mass unknown", () => {
    const r = jacksonPollock3({ sex: "M", ageYears: 25, sites: { chest: 10, abdomen: 15, thigh: 12 } })!;
    const noMass = withLeanMass(r, null);
    expect(noMass.leanKg).toBeNull();
    expect(noMass.fatKg).toBeNull();
  });
  it("sumSkinfolds tolerates partial input", () => {
    expect(sumSkinfolds({ chest: 10, abdomen: 15 })).toBe(25);
    expect(sumSkinfolds({})).toBeNull();
  });
});

describe("boundary — descriptive/monitoring only, no readiness/decision/prescription coupling", () => {
  it("bodyComposition.ts imports nothing from a readiness/decision/prescription module", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../bodyComposition.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["./peakPeriod"]);
    for (const forbidden of ["readiness", "decision", "stage4", "recommend", "prescription", "resolveFinalState"]) {
      expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });
});
