import { describe, it, expect } from "vitest";
import { deriveDsiForPlayer, squadDsiThresholds, classifyDsiTierVsSquad } from "../deriveDsi";

describe("deriveDsiForPlayer — coverage-aware auto-DSI", () => {
  it("both peak forces present + ≥3 trials each → full coverage, high confidence, computed ratio/tier", () => {
    const r = deriveDsiForPlayer({ cmjPeakForceN: 3000, imtpPeakForceN: 4000, cmjTrialCount: 3, imtpTrialCount: 3 });
    expect(r.coverage).toBe("full");
    expect(r.confidence).toBe("high");
    expect(r.dsi?.ratio).toBeCloseTo(0.75, 5);
    expect(r.dsi?.tier).toBe("concurrent");
  });
  it("ratio maps to tiers: <0.6 ballistic, >0.8 max_strength", () => {
    expect(deriveDsiForPlayer({ cmjPeakForceN: 2000, imtpPeakForceN: 4000, cmjTrialCount: 3, imtpTrialCount: 3 }).dsi?.tier).toBe("ballistic");
    expect(deriveDsiForPlayer({ cmjPeakForceN: 4200, imtpPeakForceN: 4000, cmjTrialCount: 3, imtpTrialCount: 3 }).dsi?.tier).toBe("max_strength");
  });
  it("full coverage but a short trial count → moderate confidence", () => {
    const r = deriveDsiForPlayer({ cmjPeakForceN: 3000, imtpPeakForceN: 4000, cmjTrialCount: 1, imtpTrialCount: 3 });
    expect(r.coverage).toBe("full");
    expect(r.confidence).toBe("moderate");
    expect(r.dsi).not.toBeNull();
  });
  it("only CMJ → cmj_only, null DSI, low confidence, reason names the missing IMTP", () => {
    const r = deriveDsiForPlayer({ cmjPeakForceN: 3000, imtpPeakForceN: null });
    expect(r.coverage).toBe("cmj_only");
    expect(r.dsi).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.reason.en).toMatch(/IMTP/);
  });
  it("only IMTP → imtp_only, null DSI", () => {
    const r = deriveDsiForPlayer({ cmjPeakForceN: null, imtpPeakForceN: 4000 });
    expect(r.coverage).toBe("imtp_only");
    expect(r.dsi).toBeNull();
    expect(r.reason.en).toMatch(/CMJ/);
  });
  it("neither / zero / non-finite → none, null DSI (no divide-by-zero)", () => {
    expect(deriveDsiForPlayer({ cmjPeakForceN: null, imtpPeakForceN: null }).coverage).toBe("none");
    expect(deriveDsiForPlayer({ cmjPeakForceN: 3000, imtpPeakForceN: 0 }).coverage).toBe("cmj_only");
    expect(deriveDsiForPlayer({ cmjPeakForceN: NaN, imtpPeakForceN: 4000 }).coverage).toBe("imtp_only");
  });
  it("without squad thresholds the tier is the absolute textbook one (basis 'absolute')", () => {
    const r = deriveDsiForPlayer({ cmjPeakForceN: 3000, imtpPeakForceN: 4000, cmjTrialCount: 3, imtpTrialCount: 3 });
    expect(r.basis).toBe("absolute");
  });
});

describe("squad-relative calibration (recalibrate thresholds to the team)", () => {
  it("squadDsiThresholds: null when <4 ratios, tertiles otherwise", () => {
    expect(squadDsiThresholds([1, 2, 3])).toBeNull();
    const t = squadDsiThresholds([0.8, 0.9, 1.0, 1.1, 1.2]);
    expect(t).not.toBeNull();
    expect(t!.lower).toBeLessThan(t!.upper);
    expect(t!.n).toBe(5);
  });
  it("classifyDsiTierVsSquad: below lower → ballistic, above upper → max_strength, else concurrent", () => {
    const t = { lower: 0.9, upper: 1.1, n: 9 };
    expect(classifyDsiTierVsSquad(0.85, t).tier).toBe("ballistic");
    expect(classifyDsiTierVsSquad(1.2, t).tier).toBe("max_strength");
    expect(classifyDsiTierVsSquad(1.0, t).tier).toBe("concurrent");
  });
  it("re-bases the tier to the squad: 0.85 is max-strength ABSOLUTE but ballistic vs a high-DSI squad", () => {
    const thr = { lower: 0.9, upper: 1.1, n: 9 };
    const r = deriveDsiForPlayer({ cmjPeakForceN: 850, imtpPeakForceN: 1000, cmjTrialCount: 3, imtpTrialCount: 3 }, thr); // ratio 0.85
    expect(r.basis).toBe("squad");
    expect(r.dsi?.tier).toBe("ballistic"); // below the squad's lower tertile
    expect(r.dsi?.ratio).toBeCloseTo(0.85, 5); // raw ratio preserved
    // absolute (no squad) → max_strength since 0.85 > 0.8
    expect(deriveDsiForPlayer({ cmjPeakForceN: 850, imtpPeakForceN: 1000, cmjTrialCount: 3, imtpTrialCount: 3 }).dsi?.tier).toBe("max_strength");
  });
});
