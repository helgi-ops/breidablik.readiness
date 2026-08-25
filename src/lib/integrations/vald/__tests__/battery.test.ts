import { describe, it, expect } from "vitest";
import { classifyBatteryTestType, extractTestMetrics, batteryMetricMean, BATTERY_CODES } from "@/lib/integrations/vald/battery";

describe("classifyBatteryTestType", () => {
  it("routes CMJ family to null (dedicated table)", () => {
    expect(classifyBatteryTestType("CMJ")).toBeNull();
    expect(classifyBatteryTestType("Countermovement Jump")).toBeNull();
    expect(classifyBatteryTestType("ABCMJ")).toBeNull();
  });
  it("classifies the battery types", () => {
    expect(classifyBatteryTestType("IMTP")).toBe("IMTP");
    expect(classifyBatteryTestType("SLDJ")).toBe("SLDJ");
    expect(classifyBatteryTestType("DJ")).toBe("DJ");
    expect(classifyBatteryTestType("ISOSQT")).toBe("ISOSQT");
    expect(classifyBatteryTestType("SJ")).toBe("SJ");
  });
  it("routes a Countermovement REBOUND Jump to the battery, not the CMJ table", () => {
    // "Countermovement" alone would misfile it as CMJ; the rebound is reactive.
    expect(classifyBatteryTestType("Countermovement Rebound Jump")).toBe("CMRJ");
    expect(classifyBatteryTestType("Single Leg Countermovement Rebound Jump")).toBe("CMRJ");
    expect(classifyBatteryTestType("CMRJ")).toBe("CMRJ");
  });
  it("returns null for empty and OTHER for unknown", () => {
    expect(classifyBatteryTestType("")).toBeNull();
    expect(classifyBatteryTestType("WEIRD")).toBe("OTHER");
  });
});

describe("extractTestMetrics", () => {
  const payload = {
    trials: [
      { results: [
        { limb: "Trial", value: 2200, definition: { result: "PEAK_VERTICAL_FORCE", unit: "Newton" } },
        { limb: "Left", value: 1100, definition: { result: "PEAK_VERTICAL_FORCE", unit: "Newton" } },
        { limb: "Right", value: 1000, definition: { result: "PEAK_VERTICAL_FORCE", unit: "Newton" } },
      ] },
      { results: [
        { limb: "Trial", value: 2400, definition: { result: "PEAK_VERTICAL_FORCE", unit: "Newton" } },
      ] },
    ],
  };
  it("flattens per-trial, per-limb results with codes + units", () => {
    const rows = extractTestMetrics(payload);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ trialNumber: 0, code: "PEAK_VERTICAL_FORCE", limb: "Trial", value: 2200, unit: "Newton" });
    expect(rows[3].trialNumber).toBe(1);
  });
  it("handles a bare trials array and empty payloads", () => {
    expect(extractTestMetrics(payload.trials)).toHaveLength(4);
    expect(extractTestMetrics(null)).toEqual([]);
    expect(extractTestMetrics({ trials: [] })).toEqual([]);
  });
  it("means a metric across trials for a limb (Claudino)", () => {
    const rows = extractTestMetrics(payload).map((r) => ({ metric_code: r.code, limb: r.limb, value: r.value }));
    expect(batteryMetricMean(rows, BATTERY_CODES.imtpPeakForce, "Trial")).toBe(2300); // (2200+2400)/2
    expect(batteryMetricMean(rows, BATTERY_CODES.imtpPeakForce, "Left")).toBe(1100);
    expect(batteryMetricMean(rows, ["MISSING_CODE"], "Trial")).toBeNull();
  });
});
