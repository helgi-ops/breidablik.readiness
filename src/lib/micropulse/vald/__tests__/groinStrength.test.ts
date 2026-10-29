import { describe, it, expect } from "vitest";
import { buildGroinStrength, findGroinAdductorTest, GROIN_STRENGTH_DROP_PCT } from "../groinStrength";
import type { RtpLimbStrengthTest, RtpLimbStrengthEntry } from "@/lib/micropulse/rtp/types";

const entry = (over: Partial<RtpLimbStrengthEntry>): RtpLimbStrengthEntry => ({
  testDate: "2026-10-01", movement: "Hip Adduction", leftN: 300, rightN: 300, asymmetryPct: 0, asymmetrySide: null, status: "PASS", ...over,
});

const groinTest = (over: Partial<RtpLimbStrengthTest>): RtpLimbStrengthTest => ({
  device: "forceframe", testType: "Hip AD/AB", label: "Hip AD/AB (groin) · Squeeze", bodyRegion: "Hip", direction: "Squeeze",
  testDate: "2026-10-01", leftN: 300, rightN: 300, avgLeftN: null, avgRightN: null, maxRfdLeftNS: null, maxRfdRightNS: null,
  asymmetryPct: 0, asymmetrySide: null, lsiPct: null, status: "PASS", history: [entry({})], ...over,
});

describe("findGroinAdductorTest", () => {
  it("picks the forceframe test labelled '(groin)', not the ankle one", () => {
    const list: RtpLimbStrengthTest[] = [
      groinTest({ label: "Ankle (plantar) · Pull", bodyRegion: "Ankle" }),
      groinTest({ label: "Hip AD/AB (groin) · Squeeze" }),
    ];
    expect(findGroinAdductorTest(list)?.label).toBe("Hip AD/AB (groin) · Squeeze");
    expect(findGroinAdductorTest([])).toBeNull();
    expect(findGroinAdductorTest(null)).toBeNull();
  });
});

describe("buildGroinStrength", () => {
  it("returns the empty state when there is no groin data (never a fabricated 0)", () => {
    const r = buildGroinStrength(null);
    expect(r.present).toBe(false);
    expect(r.leftN).toBeNull();
    expect(r.facts).toHaveLength(0);
  });

  it("leads with absolute per-limb strength + the summed/mean", () => {
    const r = buildGroinStrength(groinTest({ leftN: 280, rightN: 320, history: [entry({ leftN: 280, rightN: 320 })] }));
    expect(r.present).toBe(true);
    expect(r.leftN).toBe(280);
    expect(r.rightN).toBe(320);
    expect(r.sumN).toBe(600);
    expect(r.meanN).toBe(300);
    expect(r.facts[0].en).toContain("280 N left");
  });

  it("flags a 'both sides low but symmetric' case as a strength concern via the own-baseline trend", () => {
    // Symmetric (0% asymmetry) but both limbs dropped ~17% vs the player's own prior baseline.
    const history: RtpLimbStrengthEntry[] = [
      entry({ testDate: "2026-10-20", leftN: 250, rightN: 250, asymmetryPct: 0 }), // latest
      entry({ testDate: "2026-09-01", leftN: 300, rightN: 300, asymmetryPct: 0 }),
      entry({ testDate: "2026-08-01", leftN: 300, rightN: 300, asymmetryPct: 0 }),
    ];
    const r = buildGroinStrength(groinTest({ leftN: 250, rightN: 250, asymmetryPct: 0, history }));
    expect(r.asymmetryPct).toBe(0); // symmetric — an asymmetry-only view would read "balanced / OK"
    expect(r.trend?.baselineMeanN).toBe(300);
    expect(r.trend?.deltaPct).toBeLessThanOrEqual(-GROIN_STRENGTH_DROP_PCT);
    expect(r.trend?.dropped).toBe(true);
    expect(r.verdict.en).toMatch(/down/i);
  });

  it("reads as holding when the latest matches the player's own baseline", () => {
    const history: RtpLimbStrengthEntry[] = [
      entry({ testDate: "2026-10-20", leftN: 300, rightN: 300 }),
      entry({ testDate: "2026-09-01", leftN: 300, rightN: 300 }),
    ];
    const r = buildGroinStrength(groinTest({ history }));
    expect(r.trend?.dropped).toBe(false);
    expect(r.verdict.en).toMatch(/holding/i);
  });

  it("says 'no prior test' on a first baseline instead of inventing a trend", () => {
    const r = buildGroinStrength(groinTest({ history: [entry({})] }));
    expect(r.trend).toBeNull();
    expect(r.verdict.en).toMatch(/no prior test/i);
  });
});
