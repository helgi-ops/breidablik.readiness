import { describe, it, expect } from "vitest";
import { wearableRecoveryContributor } from "../wearableRecovery";

const none = { recent: null, baselineMean: null, baselineSd: null };

describe("wearableRecoveryContributor", () => {
  it("returns null when the player has no wearable reading at all", () => {
    expect(wearableRecoveryContributor({ hrv: none, restingHr: none, recoveryScore: none, coverageDays: 0 })).toBeNull();
  });

  it("flags an HRV drop ≥1σ below the player's own baseline (counterfactual + citation)", () => {
    const c = wearableRecoveryContributor({
      hrv: { recent: 40, baselineMean: 60, baselineSd: 10 }, // z = −2 → bad +2
      restingHr: none,
      recoveryScore: none,
      coverageDays: 30,
    })!;
    expect(c.key).toBe("wearable_recovery");
    expect(c.flagged).toBe(true);
    expect(c.severity).toBeCloseTo(1, 5); // +2σ → 1
    expect(c.confidence).toBe("high");
    expect(c.why.en).toMatch(/heart-rate variability is below/i);
    expect(c.counterfactual?.en).toMatch(/~60 ms/);
    expect(c.citation).toMatch(/Plews 2013/);
  });

  it("flags a resting-HR rise (lower-is-better flips the sign)", () => {
    const c = wearableRecoveryContributor({
      hrv: { recent: 60, baselineMean: 60, baselineSd: 10 }, // on norm
      restingHr: { recent: 66, baselineMean: 60, baselineSd: 4 }, // z = +1.5 → bad +1.5
      recoveryScore: none,
      coverageDays: 15,
    })!;
    expect(c.flagged).toBe(true);
    expect(c.why.en).toMatch(/resting heart rate is above/i);
    expect(c.counterfactual?.en).toMatch(/~60 bpm/);
  });

  it("does not flag when every marker sits around the player's norm", () => {
    const c = wearableRecoveryContributor({
      hrv: { recent: 58, baselineMean: 60, baselineSd: 10 },
      restingHr: { recent: 60, baselineMean: 60, baselineSd: 4 },
      recoveryScore: { recent: 70, baselineMean: 72, baselineSd: 8 },
      coverageDays: 30,
    })!;
    expect(c.flagged).toBe(false);
    expect(c.why.en).toMatch(/around his usual/i);
    expect(c.counterfactual).toBeNull();
  });

  it("shows recent values as context but never flags on an immature/flat baseline", () => {
    const c = wearableRecoveryContributor({
      hrv: { recent: 40, baselineMean: null, baselineSd: null }, // first reading — no baseline
      restingHr: none,
      recoveryScore: none,
      coverageDays: 1,
    })!;
    expect(c.flagged).toBe(false);
    expect(c.confidence).toBe("low");
    expect(c.detail.en).toMatch(/HRV 40 ms/);
  });

  it("uses the player voice for the why/counterfactual when asked", () => {
    const c = wearableRecoveryContributor({
      hrv: { recent: 40, baselineMean: 60, baselineSd: 10 },
      restingHr: none,
      recoveryScore: none,
      coverageDays: 30,
      voice: "player",
    })!;
    expect(c.why.en).toMatch(/your heart-rate variability/i);
    expect(c.counterfactual?.en).toMatch(/your usual/i);
  });
});
