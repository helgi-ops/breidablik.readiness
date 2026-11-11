import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => { throw new Error("not in tests"); } }));

import { EMPTY_SUB, SUB_BAND_GROUPS } from "../types";
import { imaFingerprintOf } from "../index";

const base = {
  player_id: "p1", date: "2026-09-01", source: "catapult",
  ima_total: 100, ima_accel: 40, ima_decel: 50,
  ima_cod_left_high: 2, ima_cod_left_medium: 3, ima_cod_left_low: 5,
  ima_cod_right_high: 1, ima_cod_right_medium: 4, ima_cod_right_low: 6,
  ima_fr_ge18_stride_count: 520, ima_fr_ge18_event_count: 15, ima_fr_ge18_mp_event_count: 13,
  ima_band1_decel_count: 30, ima_band2_decel_count: 15, ima_band3_decel_count: 5,
  total_player_load: null, accel_decel_efforts: null, high_speed_distance: null,
  velocity_band6_total_distance: null, sprint_distance: null, max_velocity: null,
  session_duration_minutes: 90, player_load_per_minute: null, raw_payload_json: null,
};

describe("match movement S&C sub-bands", () => {
  it("long runs are never flagged high-intensity", () => {
    const g = SUB_BAND_GROUPS.find((x) => x.group === "longRuns")!;
    expect(g.bands.map((b) => b.key)).toEqual(["longRuns", "longRunsMp", "longRunStrides"]);
    expect(g.bands.some((b) => b.high)).toBe(false);
  });

  it("EMPTY_SUB covers every key the breakdown draws", () => {
    const keys = SUB_BAND_GROUPS.flatMap((g) => g.bands.map((b) => b.key)).sort();
    expect(Object.keys(EMPTY_SUB).sort()).toEqual(keys);
  });

  it("fills count, match pace and strides from the ≥18 s columns", () => {
    const { sub, fp } = imaFingerprintOf(base, 90);
    expect(sub.longRuns).toBe(15);
    expect(sub.longRunsMp).toBe(13);
    expect(sub.longRunStrides).toBe(520);
    // the signature dimension reads the same strides, per minute
    expect(fp.hiCadencePerMin).toBeCloseTo(520 / 90, 6);
  });

  it("keeps no reading as null (pre-June rows, indoors), not 0", () => {
    const { sub } = imaFingerprintOf({ ...base, ima_fr_ge18_event_count: null, ima_fr_ge18_mp_event_count: null }, 90);
    expect(sub.longRuns).toBeNull();
    expect(sub.longRunsMp).toBeNull();
    expect(sub.longRunStrides).toBe(520);
  });
});
