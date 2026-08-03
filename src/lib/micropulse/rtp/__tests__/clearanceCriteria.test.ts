import { describe, it, expect } from "vitest";
import { asymmetryStatus, buildRtpCriteria, buildRtpDomains, buildRtpRecommendations, rtpDecision } from "@/lib/micropulse/rtp/clearanceCriteria";

describe("asymmetryStatus (Bishop 2020 boundaries)", () => {
  it("PASS < 10, CAUTION 10–15, FLAG > 15", () => {
    expect(asymmetryStatus(9.9)).toBe("PASS");
    expect(asymmetryStatus(10)).toBe("CAUTION");
    expect(asymmetryStatus(15)).toBe("CAUTION");
    expect(asymmetryStatus(15.1)).toBe("FLAG");
    expect(asymmetryStatus(null)).toBe("NO_DATA");
  });
});

describe("buildRtpCriteria + domains — sample-report numbers", () => {
  const criteria = buildRtpCriteria({
    cmjJumpHeightCm: 46.1, cmjAsymmetryPct: 2, codHighAsymPct: null,
    imtpRelNkg: 25.6, imtpAsymPct: 4,
    djRsi: 2.42,
    sldjRsiAsymPct: 20, sldjStiffnessAsymPct: 31, sldjJumpHeightAsymPct: 11,
    unilateralIsoAsymPct: 17,
  });
  const byKey = Object.fromEntries(criteria.map((c) => [c.key, c]));

  it("evaluates each criterion to the cited threshold", () => {
    expect(byKey.imtp_strength.status).toBe("PASS");       // 25.6 > 20
    expect(byKey.cmj_height.status).toBe("PASS");          // 46.1 > 40
    expect(byKey.dj_rsi.status).toBe("PASS");              // 2.42 > 2.0
    expect(byKey.sldj_rsi_asymmetry.status).toBe("FLAG");  // 20 > 15
    expect(byKey.sldj_jumpheight_asymmetry.status).toBe("CAUTION"); // 11 in [10,15]
    expect(byKey.sldj_stiffness_asymmetry.status).toBe("FLAG");     // 31 > 20
    expect(byKey.unilateral_iso_asymmetry.status).toBe("FLAG");     // 17 > 15
  });

  it("rolls domains up to the worst criterion", () => {
    const domains = Object.fromEntries(buildRtpDomains(criteria).map((d) => [d.domain, d.status]));
    expect(domains["Bilateral Strength"]).toBe("PASS");
    expect(domains["Bilateral Jump"]).toBe("PASS");
    expect(domains["Bilateral Reactive"]).toBe("PASS");
    expect(domains["Unilateral Strength"]).toBe("FLAG");
    expect(domains["Unilateral Reactive"]).toBe("FLAG"); // rsi FLAG dominates
  });

  it("decision reflects flags", () => {
    expect(rtpDecision(criteria, false)).toMatch(/NOT YET CLEARED/);
  });
});

describe("dynamic valgus (coach-assessed) → Movement Control", () => {
  it("none PASS, mild CAUTION, moderate/severe FLAG", () => {
    const st = (sev: "none" | "mild" | "moderate" | "severe") =>
      buildRtpCriteria({ cmjJumpHeightCm: null, cmjAsymmetryPct: null, codHighAsymPct: null, valgusSeverity: sev })
        .find((c) => c.key === "dynamic_valgus")!.status;
    expect(st("none")).toBe("PASS");
    expect(st("mild")).toBe("CAUTION");
    expect(st("moderate")).toBe("FLAG");
    expect(st("severe")).toBe("FLAG");
  });
});

describe("buildRtpRecommendations", () => {
  it("emits high-priority recs for flags, moderate for cautions", () => {
    const criteria = buildRtpCriteria({ cmjJumpHeightCm: null, cmjAsymmetryPct: null, codHighAsymPct: null, sldjRsiAsymPct: 20, valgusSeverity: "mild" });
    const recs = buildRtpRecommendations(criteria, false);
    expect(recs.some((r) => r.startsWith("High priority") && /single-leg plyometrics/.test(r))).toBe(true);
    expect(recs.some((r) => r.startsWith("Moderate priority") && /valgus|abductor/i.test(r))).toBe(true);
  });
  it("all-pass yields a maintenance rec", () => {
    const recs = buildRtpRecommendations(buildRtpCriteria({ cmjJumpHeightCm: 50, cmjAsymmetryPct: 2, codHighAsymPct: 2 }), false);
    expect(recs[0]).toMatch(/All evaluated criteria pass/);
  });
});

describe("rtpDecision edge cases", () => {
  it("insufficient data when nothing evaluable", () => {
    expect(rtpDecision([], false)).toMatch(/INSUFFICIENT DATA/);
  });
  it("currently injured never clears", () => {
    const ok = buildRtpCriteria({ cmjJumpHeightCm: 50, cmjAsymmetryPct: 2, codHighAsymPct: 2 });
    expect(rtpDecision(ok, true)).toMatch(/NOT YET CLEARED/);
    expect(rtpDecision(ok, false)).toMatch(/MEETS MEASURED CRITERIA/);
  });
});
