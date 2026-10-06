import { describe, it, expect } from "vitest";
import {
  parseTitanSyncedData,
  parseTitanNumber,
  parseTitanDate,
  resolveTitanHeaderMap,
  titanRowHasSignal,
} from "../parseSyncedData";

const HEADERS = [
  "Date", "Player Name", "IMU Player Load", "IMU Duration", "Load / Minute",
  "Low Active Duration", "High Active Duration", "IMU Jumps", "Impacts",
];

describe("parseTitanNumber", () => {
  it("parses plain + comma numbers", () => {
    expect(parseTitanNumber("412")).toBe(412);
    expect(parseTitanNumber("1,234.5")).toBe(1234.5);
    expect(parseTitanNumber(88)).toBe(88);
  });
  it("treats blanks and spreadsheet error strings as null, never 0", () => {
    for (const bad of ["", "   ", "#DIV/0!", "#REF!", "#N/A", "-", "na", "abc"]) {
      expect(parseTitanNumber(bad)).toBeNull();
    }
  });
  it("does not coerce a missing value to 0", () => {
    expect(parseTitanNumber("#DIV/0!")).not.toBe(0);
  });
});

describe("parseTitanDate", () => {
  it("passes through ISO and strips a time part", () => {
    expect(parseTitanDate("2026-01-15")).toBe("2026-01-15");
    expect(parseTitanDate("2026-01-15T19:30:00")).toBe("2026-01-15");
  });
  it("reads day-first European forms", () => {
    expect(parseTitanDate("15/01/2026")).toBe("2026-01-15");
    expect(parseTitanDate("15.01.2026")).toBe("2026-01-15");
    expect(parseTitanDate("05-02-2026")).toBe("2026-02-05");
  });
  it("returns null for blanks / errors / garbage", () => {
    expect(parseTitanDate("")).toBeNull();
    expect(parseTitanDate("#REF!")).toBeNull();
    expect(parseTitanDate("not a date")).toBeNull();
    expect(parseTitanDate("15/13/2026")).toBeNull(); // month 13
  });
});

describe("resolveTitanHeaderMap", () => {
  it("maps the confirmed 9 headers to the right indices", () => {
    const m = resolveTitanHeaderMap(HEADERS);
    expect(m.date).toBe(0);
    expect(m.playerName).toBe(1);
    expect(m.imuPlayerLoad).toBe(2);
    expect(m.imuDurationMin).toBe(3);
    expect(m.loadPerMinute).toBe(4);
    expect(m.lowActiveMin).toBe(5);
    expect(m.highActiveMin).toBe(6);
    expect(m.imuJumps).toBe(7);
    expect(m.impacts).toBe(8);
  });
  it("is case / spacing / punctuation tolerant", () => {
    const m = resolveTitanHeaderMap(["  DATE ", "player  name", "IMU PlayerLoad", "imu_duration", "load/minute", "Low Active", "High Active", "Jumps", "impact"]);
    expect(m.date).toBe(0);
    expect(m.playerName).toBe(1);
    expect(m.imuPlayerLoad).toBe(2);
    expect(m.imuDurationMin).toBe(3);
    expect(m.imuJumps).toBe(7);
    expect(m.impacts).toBe(8);
  });
});

describe("parseTitanSyncedData", () => {
  it("maps a full session row to typed values", () => {
    const rows = [["2026-01-15", "Anna Jónsdóttir", "412", "64", "6.4", "40", "18", "22", "130"]];
    const [r] = parseTitanSyncedData(HEADERS, rows);
    expect(r.date).toBe("2026-01-15");
    expect(r.playerName).toBe("Anna Jónsdóttir");
    expect(r.imuPlayerLoad).toBe(412);
    expect(r.imuDurationMin).toBe(64);
    expect(r.lowActiveMin).toBe(40);
    expect(r.highActiveMin).toBe(18);
    expect(r.imuJumps).toBe(22);
    expect(r.impacts).toBe(130);
  });
  it("turns error/blank cells into null (not 0) and keeps the named row", () => {
    const rows = [["#REF!", "Björk Einars", "#DIV/0!", "", "#DIV/0!", "", "", "", ""]];
    const [r] = parseTitanSyncedData(HEADERS, rows);
    expect(r.date).toBeNull();
    expect(r.imuPlayerLoad).toBeNull();
    expect(r.imuDurationMin).toBeNull();
    expect(r.imuJumps).toBeNull();
    expect(r.impacts).toBeNull();
    expect(titanRowHasSignal(r)).toBe(false);
  });
  it("skips rows without a player name (blank / totals)", () => {
    const rows = [
      ["2026-01-15", "", "999", "", "", "", "", "", ""],
      ["2026-01-15", "Carla", "300", "55", "5.4", "", "", "10", "90"],
    ];
    const out = parseTitanSyncedData(HEADERS, rows);
    expect(out.length).toBe(1);
    expect(out[0].playerName).toBe("Carla");
  });
  it("never produces GPS fields (Titan is IMU-only) — TitanRow carries no distance/speed", () => {
    const [r] = parseTitanSyncedData(HEADERS, [["2026-01-15", "D", "300", "55", "5.4", "", "", "10", "90"]]);
    expect(Object.keys(r)).not.toContain("distance");
    expect(Object.keys(r)).not.toContain("totalDistance");
  });
});
