import { describe, it, expect } from "vitest";
import { classifyValdMetric, resolveBenchmarkPop, hasPopBands } from "../benchmarks";

describe("classifyValdMetric", () => {
  it("grades CMJ jump height into higher-is-better bands", () => {
    expect(classifyValdMetric("cmjJumpHeightCm", 46)!.band).toBe("elite");
    expect(classifyValdMetric("cmjJumpHeightCm", 41)!.band).toBe("good");
    expect(classifyValdMetric("cmjJumpHeightCm", 36)!.band).toBe("average");
    expect(classifyValdMetric("cmjJumpHeightCm", 30)!.band).toBe("below");
  });

  it("grades RSI-modified on the NCAA reference scale", () => {
    expect(classifyValdMetric("cmjRsiMod", 0.65)!.band).toBe("elite");
    expect(classifyValdMetric("cmjRsiMod", 0.5)!.band).toBe("good");
    expect(classifyValdMetric("cmjRsiMod", 0.35)!.band).toBe("average");
    expect(classifyValdMetric("cmjRsiMod", 0.25)!.band).toBe("below");
  });

  it("grades IMTP relative peak force (N/kg)", () => {
    expect(classifyValdMetric("imtpRelForceNkg", 42)!.band).toBe("elite");
    expect(classifyValdMetric("imtpRelForceNkg", 36)!.band).toBe("good");
    expect(classifyValdMetric("imtpRelForceNkg", 30)!.band).toBe("average");
    expect(classifyValdMetric("imtpRelForceNkg", 24)!.band).toBe("below");
    expect(classifyValdMetric("imtpRelForceNkg", 24)!.improve!.en).toMatch(/strength/i);
  });

  it("grades asymmetry lower-is-better (Bishop 2020)", () => {
    expect(classifyValdMetric("asymmetry", 6)!.band).toBe("good");
    expect(classifyValdMetric("asymmetry", 12)!.band).toBe("average");
    expect(classifyValdMetric("asymmetry", 18)!.band).toBe("below");
  });

  it("surfaces a how-to-improve tip only when below 'good'", () => {
    expect(classifyValdMetric("cmjJumpHeightCm", 46)!.improve).toBeNull(); // elite
    expect(classifyValdMetric("cmjJumpHeightCm", 41)!.improve).toBeNull(); // good
    expect(classifyValdMetric("cmjJumpHeightCm", 36)!.improve).not.toBeNull(); // average
    expect(classifyValdMetric("cmjJumpHeightCm", 30)!.improve).not.toBeNull(); // below
    expect(classifyValdMetric("cmjJumpHeightCm", 36)!.improve!.en).toMatch(/strength/i);
  });

  it("marks context-only metrics and never grades them", () => {
    const r = classifyValdMetric("cmjConcentricRfdNS", 1559);
    expect(r!.band).toBe("context");
    expect(r!.improve).toBeNull();
  });

  it("flags indicative metrics", () => {
    expect(classifyValdMetric("cmjRelPeakPowerWkg", 40)!.indicative).toBe(true);
  });

  it("null-safe: missing value or unknown metric returns null", () => {
    expect(classifyValdMetric("cmjJumpHeightCm", null)).toBeNull();
    expect(classifyValdMetric("cmjJumpHeightCm", undefined)).toBeNull();
    expect(classifyValdMetric("nope", 42)).toBeNull();
  });
});

describe("population-aware benchmarks", () => {
  it("resolves population from team gender + sport", () => {
    expect(resolveBenchmarkPop("M", "football")).toBe("male_football");
    expect(resolveBenchmarkPop("F", "football")).toBe("female_football");
    expect(resolveBenchmarkPop("F", "basketball")).toBe("female_basketball");
    expect(resolveBenchmarkPop("mixed", "general")).toBe("other");
  });

  it("grades a value differently by population — 34 cm is average for men but above-average for women", () => {
    expect(classifyValdMetric("cmjJumpHeightCm", 34, "male_football")!.band).toBe("average");
    expect(classifyValdMetric("cmjJumpHeightCm", 34, "female_football")!.band).toBe("good");
  });

  it("basketball has no magnitude bands yet — jump height ungraded, but asymmetry still grades", () => {
    expect(hasPopBands("male_basketball")).toBe(false);
    expect(classifyValdMetric("cmjJumpHeightCm", 45, "male_basketball")).toBeNull();
    expect(classifyValdMetric("asymmetry", 6, "male_basketball")!.band).toBe("good"); // universal
  });

  it("female football uses the female IMTP scale", () => {
    expect(classifyValdMetric("imtpRelForceNkg", 25, "female_football")!.band).toBe("good"); // >=24
    expect(classifyValdMetric("imtpRelForceNkg", 25, "male_football")!.band).toBe("below"); // <28
  });
});
