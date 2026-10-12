import { describe, it, expect } from "vitest";
import { deriveDsiForPlayer } from "../deriveDsi";

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
});
