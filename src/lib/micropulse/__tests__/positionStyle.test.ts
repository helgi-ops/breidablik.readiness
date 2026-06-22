/**
 * Tests for capability-driven playing-style classification (positionStyle).
 *
 * The "agility / repeat-effort" axis must work on BOTH tiers from whatever signals
 * a club has: Pro S7 from IMA accel/decel/CoD; Core/Lite from the Gen2 combined
 * `efforts` count (no IMA). A dead metric on a tier (population sd 0) must neither
 * pollute nor DILUTE the axis — the score divides by the live members only.
 *
 * Run with:  npx vitest src/lib/micropulse/__tests__/positionStyle.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { classifyStyle, buildPopulationStats } from "../positionStyle";

const prof = (o) => ({ distance: 0, hsr: 0, sprint: 0, top_speed: 0, accel: 0, decel: 0, cod: 0, efforts: 0, jumps: 0, ...o });

describe("positionStyle — Core (no IMA): agility via Gen2 efforts", () => {
  // Core club: accel/decel/cod/jumps all 0 (no IMA) → those metrics are dead.
  // Only `efforts` and the speed metrics carry information.
  const corePop = [
    prof({ efforts: 40, sprint: 300 }),
    prof({ efforts: 80, sprint: 320 }),
    prof({ efforts: 120, sprint: 280 }),
  ];
  const stats = buildPopulationStats(corePop);
  const busy = classifyStyle(prof({ efforts: 120, sprint: 300 }), stats);

  it("a high-efforts Core profile reads as 'agility' even with no IMA", () => {
    expect(busy.primary.key).toBe("agility");
  });

  it("the agility axis is driven by efforts, undiluted (live-member count)", () => {
    // accel/decel/cod are dead (sd 0) → excluded; agility = z.efforts (÷1), not ÷4.
    expect(busy.axisScores.agility).toBeGreaterThan(1.0);
    expect(busy.z.efforts).toBeGreaterThan(1.0);
  });

  it("dead axes never go NaN and never win (aerial = jumps, all 0)", () => {
    expect(Number.isFinite(busy.axisScores.agility)).toBe(true);
    expect(busy.axisScores.aerial).toBe(0);
  });
});

describe("positionStyle — Pro (IMA present) is unchanged by the new efforts metric", () => {
  // Pro club: accel/decel/cod vary; `efforts` is 0 everywhere (they don't export it).
  const proPop = [
    prof({ accel: 10, decel: 8, cod: 5, sprint: 300 }),
    prof({ accel: 20, decel: 16, cod: 10, sprint: 320 }),
    prof({ accel: 30, decel: 24, cod: 15, sprint: 280 }),
  ];
  const stats = buildPopulationStats(proPop);
  const busy = classifyStyle(prof({ accel: 30, decel: 24, cod: 15, sprint: 300 }), stats);

  it("a busy Pro profile still reads 'agility' from IMA accel/decel/CoD", () => {
    expect(busy.primary.key).toBe("agility");
  });

  it("the dead `efforts` metric does NOT dilute the axis (÷3 live, not ÷4)", () => {
    // Each of accel/decel/cod is the population max → z ≈ 1.22. Mean of three ≈ 1.22.
    // If the dead `efforts` were counted in the denominator it would drop to ≈ 0.92.
    expect(busy.axisScores.agility).toBeGreaterThan(1.0);
  });
});
