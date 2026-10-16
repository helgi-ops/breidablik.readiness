import { describe, it, expect } from "vitest";
import { VC_LEVELS, VC_BY_KEY, isVcLevel, vcTargetForPhase, summarizeVcExposure, type VcLevel } from "../visualCognitive";

const s = (cognitiveLevel: VcLevel | null) => ({ cognitiveLevel });

describe("VC levels", () => {
  it("are ordered 0–3 pre-planned → open play", () => {
    expect(VC_LEVELS.map((v) => v.key)).toEqual(["preplanned", "cued", "reactive", "openplay"]);
    expect(VC_LEVELS.map((v) => v.order)).toEqual([0, 1, 2, 3]);
  });
  it("isVcLevel guards the enum", () => {
    expect(isVcLevel("reactive")).toBe(true);
    expect(isVcLevel("high_chaos")).toBe(false);
    expect(VC_BY_KEY.reactive.order).toBe(2);
  });
});

describe("vcTargetForPhase", () => {
  it("maps the phase's control↔chaos order to the minimum expected decision load", () => {
    expect(vcTargetForPhase("high_control")).toBe("preplanned");
    expect(vcTargetForPhase("moderate_control")).toBe("preplanned");
    expect(vcTargetForPhase("moderate_chaos")).toBe("cued");
    expect(vcTargetForPhase("high_chaos")).toBe("reactive");
    expect(vcTargetForPhase("team_training")).toBe("openplay");
  });
});

describe("summarizeVcExposure", () => {
  it("not met: physically chaotic phase but only pre-planned sessions", () => {
    const r = summarizeVcExposure([s("preplanned"), s("cued")], "high_chaos"); // target reactive
    expect(r.target).toBe("reactive");
    expect(r.exposureMet).toBe(false);
    expect(r.evaluated).toBe(2);
    expect(r.summary.en).toMatch(/all pre-planned|no reactive/i);
  });
  it("met: ≥1 session reaches the phase's cognitive target", () => {
    const r = summarizeVcExposure([s("preplanned"), s("reactive")], "high_chaos");
    expect(r.exposureMet).toBe(true);
    expect(r.counts.reactive).toBe(1);
    expect(r.summary.en).toMatch(/exposure met/i);
  });
  it("early phase needs only pre-planned → met with any classified session", () => {
    const r = summarizeVcExposure([s("preplanned")], "high_control");
    expect(r.target).toBe("preplanned");
    expect(r.exposureMet).toBe(true);
    expect(r.summary.en).toMatch(/only needs pre-planned/i);
  });
  it("no classified sessions → prompt to classify (unmet)", () => {
    const r = summarizeVcExposure([s(null), s(null)], "moderate_chaos");
    expect(r.evaluated).toBe(0);
    expect(r.exposureMet).toBe(false);
    expect(r.summary.en).toMatch(/No decision-load tags yet/i);
  });
});
