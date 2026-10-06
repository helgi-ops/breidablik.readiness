import { describe, it, expect } from "vitest";
import { titanRowToExternalLoad } from "../toExternalLoad";
import type { TitanRow } from "../parseSyncedData";

const base: TitanRow = {
  date: "2026-01-15", playerName: "Anna Jóns",
  imuPlayerLoad: 412, imuDurationMin: 64, lowActiveMin: 40, highActiveMin: 18,
  imuJumps: 22, impacts: 130, loadPerMinute: null,
};

describe("titanRowToExternalLoad", () => {
  it("maps the IMU KPIs to the shared columns, source=titan, GPS null", () => {
    const row = titanRowToExternalLoad(base, "p1", "t1")!;
    expect(row.source).toBe("titan");
    expect(row.player_id).toBe("p1");
    expect(row.team_id).toBe("t1");
    expect(row.date).toBe("2026-01-15");
    expect(row.player_load).toBe(412);
    expect(row.total_player_load).toBe(412); // anchor mirrored
    expect(row.session_duration_minutes).toBe(64);
    expect(row.jumps).toBe(22);
    expect(row.impacts).toBe(130);
    expect(row.total_distance).toBeNull(); // indoor, IMU-only
    expect(row.activity_count).toBe(1);
  });

  it("recomputes player_load_per_minute from load/duration when the sheet value is absent", () => {
    const row = titanRowToExternalLoad(base, "p1", "t1")!;
    expect(row.player_load_per_minute).toBeCloseTo(412 / 64, 3);
  });

  it("prefers the sheet's Load/Minute when present", () => {
    const row = titanRowToExternalLoad({ ...base, loadPerMinute: 6.4 }, "p1", "t1")!;
    expect(row.player_load_per_minute).toBe(6.4);
  });

  it("leaves per-minute null when duration is missing (never divides by 0)", () => {
    const row = titanRowToExternalLoad({ ...base, imuDurationMin: null, loadPerMinute: null }, "p1", "t1")!;
    expect(row.player_load_per_minute).toBeNull();
  });

  it("keeps null KPIs null (never coerces a missing value to 0)", () => {
    const row = titanRowToExternalLoad({ ...base, imuPlayerLoad: null, imuJumps: null, impacts: null }, "p1", "t1")!;
    expect(row.player_load).toBeNull();
    expect(row.total_player_load).toBeNull();
    expect(row.jumps).toBeNull();
    expect(row.impacts).toBeNull();
  });

  it("preserves low/high active durations + provider tag in raw_payload_json", () => {
    const row = titanRowToExternalLoad(base, "p1", "t1")!;
    const raw = row.raw_payload_json as Record<string, unknown>;
    expect(raw.provider).toBe("titan");
    expect(raw.lowActiveMin).toBe(40);
    expect(raw.highActiveMin).toBe(18);
  });

  it("returns null when the row has no date (cannot key the upsert)", () => {
    expect(titanRowToExternalLoad({ ...base, date: null }, "p1", "t1")).toBeNull();
  });

  it("is write-shaped for the load table only — carries no readiness colour field", () => {
    const row = titanRowToExternalLoad(base, "p1", "t1")!;
    const keys = Object.keys(row);
    expect(keys).not.toContain("color");
    expect(keys).not.toContain("final_color");
    expect(keys).not.toContain("readiness");
  });
});
