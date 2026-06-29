// @ts-nocheck
/* eslint-disable */
import { describe, it, expect } from "vitest";
import {
  sprintDistanceM,
  sessionDurationMin,
  isMetricLive,
  rowHasGenuineIma,
  MIN_APPEARANCE_MINUTES,
} from "../catapultCapability";

describe("catapultCapability — Lite vs Pro data shape", () => {
  describe("sprintDistanceM (sprint = V6 band, fall back to sprint_distance)", () => {
    it("uses V6 on Lite where sprint_distance is 0", () => {
      expect(sprintDistanceM({ velocity_band6_total_distance: 124, sprint_distance: 0 })).toBe(124);
    });
    it("falls back to sprint_distance when V6 is absent/0", () => {
      expect(sprintDistanceM({ velocity_band6_total_distance: 0, sprint_distance: 81 })).toBe(81);
      expect(sprintDistanceM({ sprint_distance: 81 })).toBe(81);
    });
    it("is identical on Pro (both populated, V6 wins but equal)", () => {
      expect(sprintDistanceM({ velocity_band6_total_distance: 72, sprint_distance: 72 })).toBe(72);
    });
    it("returns 0 when nothing present / non-numeric", () => {
      expect(sprintDistanceM({})).toBe(0);
      expect(sprintDistanceM({ velocity_band6_total_distance: null, sprint_distance: "x" })).toBe(0);
    });
  });

  describe("isMetricLive (>= half the squad, default)", () => {
    it("drops a metric that only one stray player has (the Keflavík Pro-pod row)", () => {
      expect(isMetricLive([0, 0, 0, 0, 0, 0, 0, 5])).toBe(false); // 1/8
    });
    it("keeps a metric present for most of the squad", () => {
      expect(isMetricLive([5, 5, 5, 5, 0, 0])).toBe(true); // 4/6
    });
    it("treats exactly half as live", () => {
      expect(isMetricLive([5, 5, 0, 0])).toBe(true); // 2/4 = 0.5
    });
    it("empty squad is not live", () => {
      expect(isMetricLive([])).toBe(false);
    });
    it("respects a custom share", () => {
      expect(isMetricLive([5, 0, 0, 0], 0.25)).toBe(true);  // 1/4
      expect(isMetricLive([5, 0, 0, 0], 0.5)).toBe(false);
    });
  });

  describe("rowHasGenuineIma (Pro only)", () => {
    it("is true for a Pro row with IMA", () => {
      expect(rowHasGenuineIma({ ima_accel: 44 })).toBe(true);
      expect(rowHasGenuineIma({ fmp_total_duration_s: 5400 })).toBe(true);
      expect(rowHasGenuineIma({ ima_cod_left_high: 3 })).toBe(true);
    });
    it("is false for a Lite row (efforts/B2-3 are NOT IMA)", () => {
      expect(rowHasGenuineIma({ accel_decel_efforts: 119, accel_b2_3_tot_effs_gen2: 30 })).toBe(false);
      expect(rowHasGenuineIma({ total_distance: 6000, high_speed_distance: 250 })).toBe(false);
      expect(rowHasGenuineIma({})).toBe(false);
    });
  });

  describe("sessionDurationMin", () => {
    it("reads the session length", () => {
      expect(sessionDurationMin({ session_duration_minutes: 78 })).toBe(78);
    });
    it("is 0 when absent (Pro)", () => {
      expect(sessionDurationMin({})).toBe(0);
    });
    it("MIN_APPEARANCE_MINUTES is the warmup filter", () => {
      expect(MIN_APPEARANCE_MINUTES).toBe(20);
    });
  });
});
