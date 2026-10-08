import { describe, it, expect } from "vitest";
import { wearableRecoveryContributor, buildWearableRecoveryInput, type WearableDailyRow } from "../wearableRecovery";

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

  it("appends Garmin stress + body battery as context (never flags on them)", () => {
    const c = wearableRecoveryContributor({
      hrv: { recent: 60, baselineMean: 60, baselineSd: 10 }, // on norm → not flagged
      restingHr: { recent: 60, baselineMean: 60, baselineSd: 4 },
      recoveryScore: none,
      coverageDays: 20,
      context: { stressAvg: 44, bodyBattery: 71 },
    })!;
    expect(c.flagged).toBe(false); // context never drives the flag
    expect(c.detail.en).toMatch(/stress 44\/100/);
    expect(c.detail.en).toMatch(/body battery 71\/100/);
    expect(c.detail.is).toMatch(/streita 44\/100/);
    expect(c.detail.is).toMatch(/orkuforði 71\/100/);
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

describe("buildWearableRecoveryInput", () => {
  const rows: WearableDailyRow[] = [
    { d: "2026-10-01", hrv: 60, rhr: 50, rec: 70, stress: null, body: null },
    { d: "2026-10-02", hrv: 62, rhr: 49, rec: 72, stress: null, body: null },
    { d: "2026-10-03", hrv: 40, rhr: 58, rec: 55, stress: 44, body: 71 }, // latest
  ];

  it("returns null for no rows", () => {
    expect(buildWearableRecoveryInput([])).toBeNull();
  });

  it("builds markers (recent = rolling mean last 3), baselines, coverage + latest context", () => {
    const inp = buildWearableRecoveryInput(rows)!;
    // recent HRV = mean(60,62,40) = 54; baseline mean = 54 too (only 3 points)
    expect(inp.hrv.recent).toBeCloseTo(54, 5);
    expect(inp.hrv.baselineMean).toBeCloseTo(54, 5);
    expect(inp.restingHr.recent).toBeCloseTo((50 + 49 + 58) / 3, 5);
    expect(inp.coverageDays).toBe(3);
    // context = latest non-null stress / body battery
    expect(inp.context?.stressAvg).toBe(44);
    expect(inp.context?.bodyBattery).toBe(71);
  });

  it("feeds the contributor so the SAME engine drives card + Signal Pack", () => {
    const inp = buildWearableRecoveryInput(rows, "player")!;
    const c = wearableRecoveryContributor(inp)!;
    expect(c.key).toBe("wearable_recovery");
    // detail carries the Garmin context appended by the contributor
    expect(c.detail.en).toMatch(/stress 44\/100/);
    expect(c.detail.en).toMatch(/body battery 71\/100/);
  });
});
