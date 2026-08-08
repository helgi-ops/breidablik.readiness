import { describe, it, expect } from "vitest";
import { reduceGps, reduceForceDecks, reduceImtp, reduceVbt, mergeSignals, type GpsRow } from "../athleteSignals";

const gps = (o: Partial<GpsRow> & { player_id: string; date: string }): GpsRow => ({
  max_velocity: null, ima_accel: null, accelerations: null, ima_decel: null, decelerations: null,
  ima_cod: null, cod_events: null, high_speed_distance: null, hir_dist: null,
  total_distance: null, session_duration_minutes: null, ...o,
});

describe("reduceGps", () => {
  it("takes best plausible top speed and drops bad fixes", () => {
    const m = reduceGps([
      gps({ player_id: "a", date: "2026-06-01", max_velocity: 31.2, total_distance: 5000, session_duration_minutes: 90 }),
      gps({ player_id: "a", date: "2026-06-08", max_velocity: 99, total_distance: 5000, session_duration_minutes: 90 }), // implausible → ignored
    ]);
    expect(m.get("a")!.speed!.value).toBe(31.2);
    expect(m.get("a")!.speed!.unit).toBe("km/h");
  });

  it("computes per-90 rates only from valid-GPS sessions and needs a minimum count", () => {
    const rows = [1, 2, 3].map((i) => gps({
      player_id: "a", date: `2026-06-0${i}`, ima_accel: 45, high_speed_distance: 600,
      total_distance: 6000, session_duration_minutes: 90,
    }));
    const m = reduceGps(rows);
    expect(m.get("a")!.acceleration!.value).toBeCloseTo(45, 0); // 45 per 90 min
    expect(m.get("a")!.work_capacity!.value).toBeCloseTo(600, 0);
    expect(m.get("a")!.acceleration!.sampleSize).toBe(3);
  });

  it("skips per-90 when a session has no GPS lock (~0 distance) and count falls short", () => {
    const m = reduceGps([
      gps({ player_id: "a", date: "2026-06-01", ima_accel: 40, total_distance: 5, session_duration_minutes: 90 }), // ~0 dist
    ]);
    expect(m.get("a")!.acceleration).toBeUndefined();
  });
});

describe("reduceForceDecks", () => {
  it("uses the latest test day's trial MEAN for reactive power and abs asymmetry for robustness", () => {
    const m = reduceForceDecks([
      { microplayer_id: "a", test_timestamp: "2026-05-01T10:00:00Z", test_type: "CMJ", rsi_mod: 0.30, relative_peak_power_w_kg: 50, asymmetry_percent: 8, is_valid: true },
      { microplayer_id: "a", test_timestamp: "2026-07-01T10:00:00Z", test_type: "CMJ", rsi_mod: 0.40, relative_peak_power_w_kg: 55, asymmetry_percent: -4, is_valid: true },
      { microplayer_id: "a", test_timestamp: "2026-07-01T10:05:00Z", test_type: "CMJ", rsi_mod: 0.50, relative_peak_power_w_kg: 57, asymmetry_percent: 2, is_valid: true },
    ]);
    expect(m.get("a")!.reactive_power!.value).toBeCloseTo(0.45, 2); // mean of the two 07-01 trials
    expect(m.get("a")!.robustness!.value).toBeCloseTo(3, 1);         // mean(|−4|, |2|) = 3
  });
});

describe("reduceImtp", () => {
  it("prefers PEAK_VERTICAL_FORCE over NET across the squad", () => {
    const m = reduceImtp([
      { microplayer_id: "a", test_timestamp: "2026-07-01T00:00:00Z", metric_code: "PEAK_VERTICAL_FORCE", value: 2200 },
      { microplayer_id: "a", test_timestamp: "2026-07-01T00:00:00Z", metric_code: "NET_PEAK_VERTICAL_FORCE", value: 500 },
    ]);
    expect(m.get("a")!.max_strength!.value).toBe(2200);
  });
});

describe("reduceVbt", () => {
  it("ranks on the squad's most-common lift and takes the player's best power", () => {
    const m = reduceVbt([
      { player_id: "a", session_date: "2026-06-01", exercise_name: "Deadlift (Trap Bar)", peak_power: 2000 },
      { player_id: "a", session_date: "2026-06-08", exercise_name: "Deadlift (Trap Bar)", peak_power: 2300 },
      { player_id: "a", session_date: "2026-06-08", exercise_name: "Bench Press", peak_power: 900 }, // not the dominant lift
    ]);
    expect(m.get("a")!.vbt_power!.value).toBe(2300);
    expect(m.get("a")!.vbt_power!.unit).toContain("Deadlift (Trap Bar)");
  });
});

describe("mergeSignals", () => {
  it("merges per-source maps into one set per player", () => {
    const merged = mergeSignals([
      reduceGps([gps({ player_id: "a", date: "2026-06-01", max_velocity: 32, total_distance: 5000, session_duration_minutes: 90 })]),
      reduceImtp([{ microplayer_id: "a", test_timestamp: "2026-07-01T00:00:00Z", metric_code: "PEAK_VERTICAL_FORCE", value: 2100 }]),
    ]);
    expect(merged.get("a")!.speed!.value).toBe(32);
    expect(merged.get("a")!.max_strength!.value).toBe(2100);
  });
});
