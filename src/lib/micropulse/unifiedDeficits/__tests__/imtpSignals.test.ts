import { describe, it, expect } from "vitest";
import { imtpDeficitsFromMetrics, IMTP_THRESHOLDS, type ImtpMetrics } from "../imtpSignals";
import { reconcile } from "../reconcile";

const base = (p: Partial<ImtpMetrics>): ImtpMetrics => ({ relForcePeak: null, peakForce: null, rfd100: null, cmjConcentricPeakForce: null, date: "2026-09-09", ...p });

describe("IMTP writer — VALD max-strength driver", () => {
  it("high DSI (> 0.8) → force_deficit (max-strength), confirmed, source vald", () => {
    // CMJ concentric peak 2600 N ÷ IMTP peak 3000 N = 0.867 > 0.8
    const [d] = imtpDeficitsFromMetrics(base({ peakForce: 3000, cmjConcentricPeakForce: 2600 }));
    expect(d.quality).toBe("force_deficit");
    expect(d.source).toBe("vald");
    expect(d.status).toBe("confirmed");
  });

  it("low DSI (< 0.6) → velocity_deficit (ballistic / speed-strength)", () => {
    const [d] = imtpDeficitsFromMetrics(base({ peakForce: 3000, cmjConcentricPeakForce: 1500 })); // 0.5
    expect(d.quality).toBe("velocity_deficit");
  });

  it("balanced DSI (0.6–0.8) → no F-V deficit from DSI", () => {
    const rows = imtpDeficitsFromMetrics(base({ peakForce: 3000, cmjConcentricPeakForce: 2100 })); // 0.7
    expect(rows.some((r) => r.quality === "force_deficit" || r.quality === "velocity_deficit")).toBe(false);
  });

  it("low relative peak force → force_deficit when DSI is unavailable", () => {
    const [d] = imtpDeficitsFromMetrics(base({ relForcePeak: 24 })); // < 28
    expect(d.quality).toBe("force_deficit");
    expect(d.provenance.en).toMatch(/rough threshold/);
  });

  it("no IMTP metrics → no rows (honest; VBT still covers force/velocity)", () => {
    expect(imtpDeficitsFromMetrics(base({}))).toEqual([]);
  });

  it("thresholds are configurable", () => {
    expect(IMTP_THRESHOLDS.dsiHigh).toBe(0.8);
    // A stricter relative-force floor fires where the default would not.
    const [d] = imtpDeficitsFromMetrics(base({ relForcePeak: 30 }), { ...IMTP_THRESHOLDS, relForcePeakLow: 32 });
    expect(d.quality).toBe("force_deficit");
  });

  it("IMTP + VBT agreeing on force_deficit reconcile to ONE higher-confidence deficit", () => {
    const imtp = imtpDeficitsFromMetrics(base({ peakForce: 3000, cmjConcentricPeakForce: 2600 })); // force_deficit
    const out = reconcile([
      ...imtp,
      { quality: "force_deficit", source: "vbt", status: "confirmed", confidence: 0.8, provenance: { en: "VBT", is: "VBT" } },
    ]);
    const d = out.find((x) => x.quality === "force_deficit")!;
    expect(d.sources.map((s) => s.source).sort()).toEqual(["vald", "vbt"]);
    expect(d.confidence).toBeGreaterThan(0.85); // agreement bonus
  });
});
