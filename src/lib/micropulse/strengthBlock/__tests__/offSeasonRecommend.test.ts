import { describe, it, expect } from "vitest";
import { recommendOffSeasonMethod } from "../offSeasonRecommend";

describe("recommendOffSeasonMethod", () => {
  it("rehab / RTP → straight-sets strength (no high-intent contrast)", () => {
    const r = recommendOffSeasonMethod({ rtpTrack: "rtp_training", strengthLean: "power" });
    expect(r.method).toBe("upper_lower");
    expect(r.confidence).toBe("high");
  });

  it("fatigue → straight-sets (lower CNS cost than power complex)", () => {
    expect(recommendOffSeasonMethod({ fatigueFlag: true, strengthLean: "power" }).method).toBe("upper_lower");
  });

  it("max-strength / hypertrophy lean → build the base with straight sets", () => {
    expect(recommendOffSeasonMethod({ strengthLean: "max_strength" }).method).toBe("upper_lower");
    expect(recommendOffSeasonMethod({ strengthLean: "hypertrophy" }).method).toBe("upper_lower");
  });

  it("power lean + clean profile → French Contrast", () => {
    const r = recommendOffSeasonMethod({ strengthLean: "power" });
    expect(r.method).toBe("french_contrast");
  });

  it("power lean BUT with deficits → Contrast (less fatiguing than French)", () => {
    const r = recommendOffSeasonMethod({ strengthLean: "power", deficitEmphases: ["eccentric_hamstring"] });
    expect(r.method).toBe("contrast");
    expect(r.whyEN.toLowerCase()).toContain("eccentric_hamstring");
  });

  it("balanced / empty → Contrast (default off-season on a base)", () => {
    expect(recommendOffSeasonMethod({ strengthLean: "balanced" }).method).toBe("contrast");
    expect(recommendOffSeasonMethod({}).method).toBe("contrast");
    expect(recommendOffSeasonMethod({}).confidence).toBe("low");
  });
});
