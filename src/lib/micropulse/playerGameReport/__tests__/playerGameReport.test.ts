import { describe, expect, it } from "vitest";
import { DRIVER_AXES, P90_KEYS, loadRowToMetrics } from "../index";

const row = (o: Record<string, unknown> = {}) => ({
  total_distance: 10500, ima_accel: 70, ima_decel: 95, jumps: 15,
  ima_cod_left_low: 190, ima_cod_right_low: 185, ima_cod_left_medium: 30, ima_cod_right_medium: 28,
  ima_cod_left_high: 9, ima_cod_right_high: 10,
  ima_band3_accel_count: 9, ima_band3_decel_count: 7,
  ima_fr_band58_total_distance: 1180, ...o,
});

describe("player game report: IMA radar (Nov 2026)", () => {
  it("fills the three high-intensity axes from the top IMA bands", () => {
    const m = loadRowToMetrics(row());
    expect(m.ima_acc_hi).toBe(9);
    expect(m.ima_dec_hi).toBe(7);
    expect(m.cod_hi).toBe(19);
    expect(m.cod).toBe(452);
  });
  it("a missing band column is no reading (null), not 0", () => {
    const m = loadRowToMetrics(row({ ima_band3_accel_count: null, ima_band3_decel_count: undefined, ima_cod_left_high: null, ima_cod_right_high: null }));
    expect(m.ima_acc_hi).toBeNull();
    expect(m.ima_dec_hi).toBeNull();
    expect(m.cod_hi).toBeNull();
  });
  it("0 in the band is a real 0", () => {
    expect(loadRowToMetrics(row({ ima_band3_accel_count: 0 })).ima_acc_hi).toBe(0);
  });
  it("one long-run axis: metres in runs of 18 s or more", () => {
    expect(loadRowToMetrics(row()).ima_hsr).toBe(1180);
  });
  it("the radar has 8 axes, every one a benchmarked per-90 key, one long-run axis", () => {
    expect(DRIVER_AXES).toHaveLength(8);
    for (const a of DRIVER_AXES) expect(P90_KEYS as readonly string[]).toContain(a.key);
    expect(DRIVER_AXES.filter((a) => a.unit === "m").map((a) => a.key)).toEqual(["ima_hsr"]);
  });
});
