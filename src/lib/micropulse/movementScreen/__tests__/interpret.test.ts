import { describe, it, expect } from "vitest";
import { SEED_MOVEMENT_TESTS } from "../registry";
import { interpretScreen, type ScreenFinding } from "../interpret";

const SLDJ = SEED_MOVEMENT_TESTS.find((t) => t.slug === "single_leg_drop_jump")!;

describe("interpretScreen", () => {
  it("pain / red flag suppresses interpretation and routes to a clinician", () => {
    const r = interpretScreen(SLDJ, [{ variableKey: "knee_valgus_contact", leg: "L", severity: "marked" }], { painReported: true });
    expect(r.redFlag).toBe(true);
    expect(r.readings).toHaveLength(0);
    expect(r.redFlagNote?.en).toMatch(/clinician/i);
  });

  it("fires a rule only when the finding meets the rule's minimum severity", () => {
    expect(interpretScreen(SLDJ, [{ variableKey: "knee_valgus_contact", leg: "L", severity: "mild" }]).readings).toHaveLength(0);
    const r = interpretScreen(SLDJ, [{ variableKey: "knee_valgus_contact", leg: "L", severity: "moderate" }]);
    expect(r.readings).toHaveLength(1);
    expect(r.readings[0].ruleId).toBe("sldj_valgus");
    expect(r.readings[0].strengthEmphasis).toBe("hip_abductor_er");
    expect(r.readings[0].leg).toBe("L");
  });

  it("caps confidence by the variable's phone-video reliability (RSI is low-precision)", () => {
    // RSI is low_precision → even a good 2-view repeated capture caps at low.
    const r = interpretScreen(SLDJ, [{ variableKey: "rsi", leg: "R", severity: "moderate" }], { viewCount: 2, poseQuality: "good", repeated: true });
    expect(r.readings[0].confidence).toBe("low");
    // A robust variable (valgus) keeps the high context confidence.
    const r2 = interpretScreen(SLDJ, [{ variableKey: "knee_valgus_contact", leg: "L", severity: "moderate" }], { viewCount: 2, poseQuality: "good", repeated: true });
    expect(r2.readings[0].confidence).toBe("high");
  });

  it("raises the RTP / asymmetry flag on a limb-symmetry deficit", () => {
    const r = interpretScreen(SLDJ, [{ variableKey: "lsi", severity: "marked", value: 18 }]);
    expect(r.rtpFlag).toBe(true);
    expect(r.asymmetryFlag).toBe(true);
    expect(r.readings[0].flag).toBe("rtp");
  });

  it("returns overall confidence = the weakest reading (never blended up)", () => {
    const findings: ScreenFinding[] = [
      { variableKey: "knee_valgus_contact", leg: "L", severity: "moderate" }, // robust
      { variableKey: "rsi", leg: "R", severity: "moderate" }, // low precision
    ];
    const r = interpretScreen(SLDJ, findings, { viewCount: 2, poseQuality: "good", repeated: true });
    expect(r.readings).toHaveLength(2);
    expect(r.confidence).toBe("low");
  });
});
