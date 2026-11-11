import { describe, it, expect } from "vitest";
import { normalizeCatapultPeriodStats } from "../normalize";

/** One athlete × one period, shaped like a `/api/v6/stats` row grouped by athlete + period, with the
 *  raw IMA band counts the period call requests (CATAPULT_PERIOD_IMA_RAW_PARAMETERS). */
function periodRow(o: Record<string, unknown>) {
  return {
    athlete_id: "ath-1",
    period_name: "Rondo",
    start_time: 1000,
    end_time: 1000 + 15 * 60,
    total_player_load: 80,
    total_distance: 0,
    ima_band1_accel_count: 6, ima_band2_accel_count: 3, ima_band3_accel_count: 1,
    ima_band1_decel_count: 9, ima_band2_decel_count: 4, ima_band3_decel_count: 2,
    ima_band1_left_count: 20, ima_band2_left_count: 8, ima_band3_left_count: 2,
    ima_band1_right_count: 15, ima_band2_right_count: 6, ima_band3_right_count: 3,
    ima_band1_jump_count: 2, ima_band2_jump_count: 1,
    ...o,
  };
}

describe("normalizeCatapultPeriodStats — IMA detail per drill", () => {
  const [row] = normalizeCatapultPeriodStats({ payload: [periodRow({})] });
  const m = row.metrics;

  it("keeps accelerations and braking by intensity, and they add up to the totals", () => {
    expect([m.ima_accel_low, m.ima_accel_med, m.ima_accel_high]).toEqual([6, 3, 1]);
    expect([m.ima_decel_low, m.ima_decel_med, m.ima_decel_high]).toEqual([9, 4, 2]);
    expect((m.ima_accel_low ?? 0) + (m.ima_accel_med ?? 0) + (m.ima_accel_high ?? 0)).toBe(m.ima_accel);
    expect((m.ima_decel_low ?? 0) + (m.ima_decel_med ?? 0) + (m.ima_decel_high ?? 0)).toBe(m.ima_decel);
  });

  it("keeps changes of direction left vs right and by intensity", () => {
    expect(m.ima_cod_left).toBe(30);
    expect(m.ima_cod_right).toBe(24);
    expect((m.ima_cod_left ?? 0) + (m.ima_cod_right ?? 0)).toBe(m.ima_cod_total);
    expect(m.high_ima).toBe(5);     // hard: 2 left + 3 right
    expect(m.ima_cod_med).toBe(14); // 8 + 6
    expect(m.ima_cod_low).toBe(35); // 20 + 15
    expect((m.ima_cod_low ?? 0) + (m.ima_cod_med ?? 0) + (m.high_ima ?? 0)).toBe(m.ima_cod_total);
  });

  it("works with no GPS (indoors): distance 0, IMA real", () => {
    expect(m.distance_m).toBe(0);
    expect(m.player_load).toBe(80);
    expect(m.jumps).toBe(3);
  });

  it("an org without IMA (Core) leaves the detail null, not 0", () => {
    const [core] = normalizeCatapultPeriodStats({
      payload: [{ athlete_id: "a", period_name: "Rondo", total_player_load: 80, total_distance: 900 }],
    });
    for (const k of ["ima_accel_low", "ima_accel_high", "ima_decel_med", "ima_cod_left", "ima_cod_right", "ima_cod_low"] as const) {
      expect(core.metrics[k]).toBeNull();
    }
  });
});
