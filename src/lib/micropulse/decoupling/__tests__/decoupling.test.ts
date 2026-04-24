/**
 * Tests for decoupling/index.ts
 *
 * Run with:  npx vitest src/lib/micropulse/decoupling/__tests__/decoupling.test.ts
 * (after adding vitest to devDependencies: npm i -D vitest)
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { computeSessionDecoupling, flagDecoupling } from "../index";
import type { AthleteMetricBaseline } from "../../baselines";

const activeBaseline = (mean: number, sd: number, key: string): AthleteMetricBaseline => ({
  player_id: "p1",
  metric_key: key,
  n_observations: 20,
  mean,
  sd,
  cv: sd / Math.abs(mean),
  median: mean,
  window_days: 28,
  status: "active",
  computed_at: new Date().toISOString(),
});

const insufficientBaseline = (key: string): AthleteMetricBaseline => ({
  player_id: "p1",
  metric_key: key,
  n_observations: 3,
  mean: 0,
  sd: 0,
  cv: null,
  median: null,
  window_days: 28,
  status: "insufficient_data",
  computed_at: new Date().toISOString(),
});

describe("computeSessionDecoupling", () => {
  it("returns rpe_per_km from RPE × duration / km", () => {
    const r = computeSessionDecoupling({
      rpe: 6, durationMinutes: 60, totalDistanceMetres: 5000,
      avgHeartRate: null, playerLoad: null,
    });
    // 6 × 60 / 5 km = 72
    expect(r.rpePerKm).toBe(72);
    expect(r.hrPerPlayerLoad).toBeNull();
  });

  it("falls back to default duration 60 when missing", () => {
    const r = computeSessionDecoupling({
      rpe: 5, durationMinutes: null, totalDistanceMetres: 4000,
      avgHeartRate: null, playerLoad: null,
    });
    // 5 × 60 / 4 km = 75
    expect(r.rpePerKm).toBe(75);
  });

  it("returns null when distance is zero or missing", () => {
    expect(computeSessionDecoupling({
      rpe: 6, durationMinutes: 60, totalDistanceMetres: 0,
      avgHeartRate: null, playerLoad: null,
    }).rpePerKm).toBeNull();

    expect(computeSessionDecoupling({
      rpe: 6, durationMinutes: 60, totalDistanceMetres: null,
      avgHeartRate: null, playerLoad: null,
    }).rpePerKm).toBeNull();
  });

  it("computes hr_per_player_load when both present", () => {
    const r = computeSessionDecoupling({
      rpe: null, durationMinutes: null, totalDistanceMetres: null,
      avgHeartRate: 160, playerLoad: 400,
    });
    expect(r.hrPerPlayerLoad).toBe(0.4);
  });
});

describe("flagDecoupling", () => {
  it("returns green when within ±1 SD", () => {
    // Baseline: 92 ± 71. Today's value 100 → z = 0.11 → green.
    const result = flagDecoupling(
      { rpe: 6, durationMinutes: 60, totalDistanceMetres: 3600,
        avgHeartRate: null, playerLoad: null },
      {
        rpePerKm: activeBaseline(92, 71, "decoupling.rpe_per_km"),
        hrPerPlayerLoad: null,
      },
    );
    // 6 × 60 / 3.6 km = 100
    expect(result.rpePerKm).toBe(100);
    expect(result.rpeFlag).toBe("green");
    expect(result.worstFlag).toBe("green");
  });

  it("flags yellow when between +1 SD and +2 SD above", () => {
    // Baseline 92 ± 71, value = 180 → z ≈ 1.24 → yellow
    const result = flagDecoupling(
      { rpe: 9, durationMinutes: 60, totalDistanceMetres: 3000,
        avgHeartRate: null, playerLoad: null },
      {
        rpePerKm: activeBaseline(92, 71, "decoupling.rpe_per_km"),
        hrPerPlayerLoad: null,
      },
    );
    // 9 × 60 / 3 km = 180
    expect(result.rpePerKm).toBe(180);
    expect(result.rpeFlag).toBe("yellow");
  });

  it("flags red when > +2 SD above", () => {
    // Baseline 92 ± 71, value = 250 → z ≈ 2.23 → red
    const result = flagDecoupling(
      { rpe: 10, durationMinutes: 75, totalDistanceMetres: 3000,
        avgHeartRate: null, playerLoad: null },
      {
        rpePerKm: activeBaseline(92, 71, "decoupling.rpe_per_km"),
        hrPerPlayerLoad: null,
      },
    );
    // 10 × 75 / 3 km = 250
    expect(result.rpePerKm).toBe(250);
    expect(result.rpeFlag).toBe("red");
    expect(result.worstFlag).toBe("red");
  });

  it("never flags when baseline is insufficient_data", () => {
    const result = flagDecoupling(
      { rpe: 10, durationMinutes: 75, totalDistanceMetres: 3000,
        avgHeartRate: null, playerLoad: null },
      {
        rpePerKm: insufficientBaseline("decoupling.rpe_per_km"),
        hrPerPlayerLoad: null,
      },
    );
    expect(result.rpeFlag).toBe("green");
    expect(result.reason).toContain("Same internal cost");
  });

  it("worst flag is red when either ratio is red", () => {
    const result = flagDecoupling(
      { rpe: 10, durationMinutes: 75, totalDistanceMetres: 3000,
        avgHeartRate: 175, playerLoad: 200 },
      {
        rpePerKm: activeBaseline(92, 71, "decoupling.rpe_per_km"),
        hrPerPlayerLoad: activeBaseline(0.4, 0.05, "decoupling.hr_per_player_load"),
      },
    );
    // rpe ratio = 250 → z ≈ 2.23 → red
    // hr ratio = 175/200 = 0.875 → z = (0.875 - 0.4) / 0.05 = 9.5 → red
    expect(result.worstFlag).toBe("red");
  });
});
