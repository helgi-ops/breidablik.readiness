import { describe, it, expect } from "vitest";
import { buildValdTrainingPlan, type ValdGradable } from "../valdSummary";
import type { RtpCmj, RtpImtp } from "@/lib/micropulse/rtp/types";

// Minimal gradable slice: a male footballer whose IMTP rel. peak force is low and
// CMJ jump height is average, but RSI-modified is elite.
const base: ValdGradable = {
  benchmarkPop: "male_football",
  cmj: { jumpHeightCm: 36, rsiMod: 0.65, relPeakPowerWkg: null, asymmetryPct: 6 } as unknown as RtpCmj,
  imtp: { relPeakForceNkg: 24, relForce200Nkg: null } as unknown as RtpImtp,
  battery: [],
  limbStrength: [],
};

describe("buildValdTrainingPlan", () => {
  it("prioritises the below-reference quality first and pairs it with a cited lever", () => {
    const plan = buildValdTrainingPlan(base, false);
    expect(plan.hasData).toBe(true);
    // IMTP rel peak force 24 N/kg is 'below' for male football (a<28) -> first.
    expect(plan.priorities[0].quality).toMatch(/IMTP rel. peak force/);
    expect(plan.priorities[0].band).toBe("below");
    expect(plan.priorities[0].lever).toMatch(/strength/i);
    expect(plan.priorities[0].cite).toBeTruthy();
    expect(plan.verdict).toMatch(/priority/i);
  });

  it("lists elite/good qualities as strengths, not priorities", () => {
    const plan = buildValdTrainingPlan(base, false);
    // RSI-modified 0.65 is elite -> a strength, never a priority.
    expect(plan.strengths.join(" ")).toMatch(/RSI-modified/);
    expect(plan.priorities.some((p) => /RSI-modified/.test(p.quality))).toBe(false);
  });

  it("ranks below before average", () => {
    const plan = buildValdTrainingPlan(base, false);
    const bands = plan.priorities.map((p) => p.band);
    const firstAvg = bands.indexOf("average");
    const lastBelow = bands.lastIndexOf("below");
    if (firstAvg >= 0 && lastBelow >= 0) expect(lastBelow).toBeLessThan(firstAvg);
  });

  it("is on-track when nothing is below/average", () => {
    const strong: ValdGradable = { ...base, cmj: { jumpHeightCm: 46, rsiMod: 0.7, relPeakPowerWkg: 60, asymmetryPct: 4 } as unknown as RtpCmj, imtp: { relPeakForceNkg: 42 } as unknown as RtpImtp };
    const plan = buildValdTrainingPlan(strong, false);
    expect(plan.priorities.length).toBe(0);
    expect(plan.verdict).toMatch(/on track/i);
  });
});
