import { describe, it, expect } from "vitest";
import { extractMiiPeakPeriod } from "../miiPeakPeriod";

// Verbatim MII fields from a real Breiðablik stats row (activity 2026-08-15). The
// interval start/end times resolve to 60 / 180 / 300 s → 1 / 3 / 5-minute windows.
const REAL_ROW: Record<string, unknown> = {
  athlete_id: "abc",
  max_intensity_interval_player_load_interval_1: 24.89520264,
  max_intensity_interval_player_load_interval_2: 46.39480209,
  max_intensity_interval_player_load_interval_3: 71.03298569,
  max_intensity_interval_pl_interval_1_start_time: 1786794475.62,
  max_intensity_interval_pl_interval_1_end_time: 1786794535.62,
  max_intensity_interval_pl_interval_2_start_time: 1786792936.52,
  max_intensity_interval_pl_interval_2_end_time: 1786793116.52,
  max_intensity_interval_pl_interval_3_start_time: 1786792815.32,
  max_intensity_interval_pl_interval_3_end_time: 1786793115.32,
  max_intensity_interval_distance_interval_1: 226.57897949,
  max_intensity_interval_distance_interval_2: 524.49407959,
  max_intensity_interval_distance_interval_3: 742.07000732,
  max_intensity_interval_dist_interval_1_start_time: 1786793295.12,
  max_intensity_interval_dist_interval_1_end_time: 1786793355.12,
  max_intensity_interval_dist_interval_2_start_time: 1786793222.22,
  max_intensity_interval_dist_interval_2_end_time: 1786793402.22,
  max_intensity_interval_dist_interval_3_start_time: 1786793217.42,
  max_intensity_interval_dist_interval_3_end_time: 1786793517.42,
  // Echoed display-name keys come back as 0 — must be ignored, not read.
  "Peak Player Load": 0,
  "MII Player Load Interval 1": 0,
};

describe("extractMiiPeakPeriod", () => {
  it("derives the 1/3/5-min power curve for player_load and distance", () => {
    const out = extractMiiPeakPeriod(REAL_ROW);
    const pl = out.filter((d) => d.metric === "player_load");
    const dist = out.filter((d) => d.metric === "distance");

    expect(pl.map((d) => d.windowMin)).toEqual([1, 3, 5]);
    expect(pl.map((d) => d.value)).toEqual([24.89520264, 46.39480209, 71.03298569]);
    expect(pl.every((d) => d.unit === "AU")).toBe(true);

    expect(dist.map((d) => d.windowMin)).toEqual([1, 3, 5]);
    expect(dist.map((d) => Math.round(d.value))).toEqual([227, 524, 742]);
    expect(dist.every((d) => d.unit === "m")).toBe(true);
  });

  it("ignores the echoed display-name keys (they are 0)", () => {
    const out = extractMiiPeakPeriod(REAL_ROW);
    // No datum should carry a 0 value from the display-name echo.
    expect(out.every((d) => d.value > 0)).toBe(true);
  });

  it("skips an interval with a value but no start/end time (window not derivable)", () => {
    const out = extractMiiPeakPeriod({
      max_intensity_interval_player_load_interval_1: 30,
      // no _pl_interval_1_start_time / _end_time
    });
    expect(out).toEqual([]);
  });

  it("returns [] for a row with no MII fields (org hasn't enabled it)", () => {
    expect(extractMiiPeakPeriod({ athlete_id: "x", total_player_load: 300 })).toEqual([]);
    expect(extractMiiPeakPeriod(null)).toEqual([]);
    expect(extractMiiPeakPeriod({})).toEqual([]);
  });

  it("keeps the larger value when two intervals resolve to the same window", () => {
    const out = extractMiiPeakPeriod({
      max_intensity_interval_player_load_interval_1: 20,
      max_intensity_interval_pl_interval_1_start_time: 100,
      max_intensity_interval_pl_interval_1_end_time: 160, // 60s → 1 min
      max_intensity_interval_player_load_interval_2: 35,
      max_intensity_interval_pl_interval_2_start_time: 200,
      max_intensity_interval_pl_interval_2_end_time: 260, // also 60s → 1 min
    });
    expect(out).toEqual([{ windowMin: 1, metric: "player_load", value: 35, unit: "AU" }]);
  });
});
