import { describe, it, expect } from "vitest";
import { computePlayerVolatilitySummary } from "../compute";
import type { VolatilityDailyPoint } from "../types";

function pt(day: number, over: Partial<VolatilityDailyPoint>): VolatilityDailyPoint {
  return {
    date: `2026-07-${String(day).padStart(2, "0")}`,
    checkInScore: 20,
    zScore: 1.0,
    deltaZ: 0,
    soreness: 4,
    sleepQuality: 4,
    mood: 4,
    energy: 4,
    stress: 4,
    ...over,
  };
}

describe("computePlayerVolatilitySummary — counterfactual", () => {
  it("returns a counterfactual whose score never exceeds the overall (removing the top driver cannot raise the mean)", () => {
    // Sleep swings hard; a couple of other signals wobble a bit.
    const pts = [
      pt(1, { sleepQuality: 1, soreness: 5, checkInScore: 22 }),
      pt(2, { sleepQuality: 5, soreness: 2, checkInScore: 14 }),
      pt(3, { sleepQuality: 1, soreness: 5, checkInScore: 21 }),
      pt(4, { sleepQuality: 5, soreness: 3, checkInScore: 15 }),
      pt(5, { sleepQuality: 1, soreness: 5, checkInScore: 20 }),
      pt(6, { sleepQuality: 5, soreness: 2, checkInScore: 16 }),
      pt(7, { sleepQuality: 1, soreness: 5, checkInScore: 22 }),
    ];
    const s = computePlayerVolatilitySummary(pts);
    expect(s.hasEnoughData).toBe(true);
    expect(s.counterfactual).not.toBeNull();
    // Removing the biggest driver can only lower (or equal) the overall score.
    expect(s.counterfactual!.newScore).toBeLessThanOrEqual(s.overallScore ?? 0);
    // The counterfactual names the single most-volatile driver.
    const topDriver = s.drivers[0];
    expect(s.counterfactual!.driverKey).toBe(topDriver.key);
  });

  it("identifies sleep as the driver when only sleep swings, and stabilising it lowers the level", () => {
    const pts = [
      pt(1, { sleepQuality: 1 }),
      pt(2, { sleepQuality: 5 }),
      pt(3, { sleepQuality: 1 }),
      pt(4, { sleepQuality: 5 }),
      pt(5, { sleepQuality: 1 }),
      pt(6, { sleepQuality: 5 }),
      pt(7, { sleepQuality: 1 }),
    ];
    const s = computePlayerVolatilitySummary(pts);
    expect(s.counterfactual?.driverKey).toBe("sleep_quality");
    const order = ["LOW", "MODERATE", "HIGH"] as const;
    // Never worse after stabilising the top driver.
    expect(order.indexOf(s.counterfactual!.newLevel as (typeof order)[number]))
      .toBeLessThanOrEqual(order.indexOf(s.level as (typeof order)[number]));
  });

  it("gives no counterfactual when there is too little data", () => {
    const s = computePlayerVolatilitySummary([pt(1, {}), pt(2, {})]);
    expect(s.hasEnoughData).toBe(false);
    expect(s.level).toBe("INSUFFICIENT");
    expect(s.counterfactual ?? null).toBeNull();
  });

  it("a flat profile is LOW volatility", () => {
    const pts = Array.from({ length: 7 }, (_, i) => pt(i + 1, {}));
    const s = computePlayerVolatilitySummary(pts);
    expect(s.level).toBe("LOW");
  });
});
