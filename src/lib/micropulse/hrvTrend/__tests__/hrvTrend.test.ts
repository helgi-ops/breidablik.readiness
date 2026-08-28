import { describe, it, expect } from "vitest";
import { computeHrvRecoveryTrend, HRV_ELEVATED_DAYS, type HrvDaily } from "../index";

// Build a daily RMSSD series starting at `start`, one entry per day.
function series(start: string, rmssd: number[]): HrvDaily[] {
  const out: HrvDaily[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (const v of rmssd) { out.push({ date: d.toISOString().slice(0, 10), rmssd: v, restingHr: null }); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

describe("computeHrvRecoveryTrend", () => {
  it("insufficient below 10 days", () => {
    const r = computeHrvRecoveryTrend(series("2026-01-01", [60, 62, 58, 61, 59]));
    expect(r.level).toBe("steady");
    expect(r.verdict.en).toMatch(/Not enough/i);
  });

  it("steady when the 7-day mean stays within the personal band", () => {
    // 28 stable days around 60 ms.
    const vals = Array.from({ length: 28 }, (_, i) => 60 + (i % 2 === 0 ? 2 : -2));
    const r = computeHrvRecoveryTrend(series("2026-01-01", vals));
    expect(r.level).toBe("steady");
    expect(r.baseline?.mean).toBeGreaterThan(55);
  });

  it("elevated when the rolling mean sits below-band for ≥3 consecutive days", () => {
    // 21 baseline days ~60 ms, then a sustained drop to ~45 ms for the last 7.
    const vals = [...Array.from({ length: 21 }, () => 60), ...Array.from({ length: 7 }, () => 45)];
    const r = computeHrvRecoveryTrend(series("2026-01-01", vals));
    expect(r.level).toBe("elevated");
    expect(r.belowBandDays).toBeGreaterThanOrEqual(HRV_ELEVATED_DAYS);
    expect(r.verdict.en).toMatch(/Recovery trend down/i);
    expect(r.citation).toMatch(/García-Ortega/);
  });

  it("watch on a short 1-2 day dip (not yet a trend)", () => {
    const vals = [...Array.from({ length: 24 }, () => 60), 44, 45];
    const r = computeHrvRecoveryTrend(series("2026-01-01", vals));
    expect(r.level).toBe("watch");
    expect(r.belowBandDays).toBeLessThan(HRV_ELEVATED_DAYS);
  });

  it("baseline excludes the last 7 days (a current dip doesn't move the norm)", () => {
    const vals = [...Array.from({ length: 21 }, () => 60), ...Array.from({ length: 7 }, () => 40)];
    const r = computeHrvRecoveryTrend(series("2026-01-01", vals));
    expect(r.baseline?.mean).toBe(60); // dip excluded from the reference
  });

  it("caveat + citation always present", () => {
    const r = computeHrvRecoveryTrend(series("2026-01-01", Array.from({ length: 20 }, () => 55)));
    expect(r.caveat.en).toMatch(/companion signal/i);
    expect(r.caveat.is.length).toBeGreaterThan(0);
  });
});
