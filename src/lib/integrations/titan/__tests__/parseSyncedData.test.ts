import { describe, it, expect } from "vitest";
import {
  parseTitanSyncedData,
  parseTitanNumber,
  parseTitanDate,
  resolveTitanHeaderMap,
  titanRowHasSignal,
  titanExportWarnings,
  csvToMatrix,
  parseTitanCsv,
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
  it("RECOMPUTES loadPerMinute from load ÷ duration, never trusting the sheet's column", () => {
    // Sheet says Load/Minute = 999 (bogus); real = 412/64 = 6.438.
    const [r] = parseTitanSyncedData(HEADERS, [["2026-01-15", "Anna", "412", "64", "999", "40", "18", "22", "130"]]);
    expect(r.loadPerMinute).toBeCloseTo(6.438, 3);
  });
  it("loadPerMinute is null when duration is absent (never the sheet's flat value)", () => {
    const [r] = parseTitanSyncedData(HEADERS, [["2026-01-15", "Anna", "412", "", "1", "", "", "", "130"]]);
    expect(r.loadPerMinute).toBeNull();
  });
});

describe("degenerate real export (duplicate 'IMU Player Load' headers, Load/Minute=1, no Duration/Jumps)", () => {
  // The real Njarðvík W `_synced_data`: columns 3,4,6,7,8 all carry "IMU Player Load",
  // "Load / Minute" is a flat 1, IMU Duration / Jumps / Low-High Active are absent.
  const DEGENERATE = [
    "Date", "Player Name", "IMU Player Load", "IMU Player Load", "Load / Minute",
    "IMU Player Load", "IMU Player Load", "IMU Player Load", "Impacts",
  ];
  const ROW = ["2026-10-15", "Helena Rafnsdóttir", "773.1", "773.1", "1", "773.1", "773.1", "773.1", "3"];

  it("imports player load + impacts, nulls loadPerMinute / duration / jumps — nothing bogus", () => {
    const [r] = parseTitanSyncedData(DEGENERATE, [ROW]);
    expect(r.imuPlayerLoad).toBe(773.1);   // first "imu player load" column
    expect(r.impacts).toBe(3);
    expect(r.loadPerMinute).toBeNull();    // the flat `1` is never stored
    expect(r.imuDurationMin).toBeNull();
    expect(r.imuJumps).toBeNull();
    expect(titanRowHasSignal(r)).toBe(true);
  });
  it("returns a non-blocking warning naming the duplicated + missing columns", () => {
    const warnings = titanExportWarnings(DEGENERATE);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(" ")).toMatch(/duplicated columns/i);
    expect(warnings.join(" ")).toMatch(/IMU Player Load ×5/); // appears 5×
    expect(warnings.join(" ")).toMatch(/missing/i);
    expect(warnings.join(" ")).toMatch(/IMU durations/);
    expect(warnings.join(" ")).toMatch(/IMU Jumps/);
  });
  it("a clean full export produces no warnings", () => {
    expect(titanExportWarnings(HEADERS)).toEqual([]);
  });
  it("parseTitanCsv surfaces the warnings alongside rows", () => {
    const csv = [DEGENERATE.join(","), ROW.join(",")].join("\n");
    const { rows, warnings } = parseTitanCsv(csv);
    expect(rows.length).toBe(1);
    expect(rows[0].loadPerMinute).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("current Titan export (IMU Load Index + Movement Profile intensity durations)", () => {
  // The header set Titan/Hudl produces once the full IMU metric set is enabled on the account.
  const CURRENT = [
    "Date", "Player Name", "IMU Load Index",
    "IMU Movement Profile (Idx) Settled Duration",
    "IMU Movement Profile (Idx) Low Intensity Duration",
    "IMU Movement Profile (Idx) Mid Intensity Duration",
    "IMU Movement Profile (Idx) High Intensity Duration",
    "IMU Jumps", "Impacts ", // trailing space on Impacts is intentional (matches the real export)
  ];

  it("resolves Load Index as the load anchor and all four intensity-duration buckets", () => {
    const m = resolveTitanHeaderMap(CURRENT);
    expect(m.imuPlayerLoad).toBe(2); // "IMU Load Index" → load anchor
    expect(m.settledMin).toBe(3);
    expect(m.lowActiveMin).toBe(4);
    expect(m.midActiveMin).toBe(5);
    expect(m.highActiveMin).toBe(6);
    expect(m.imuJumps).toBe(7);
    expect(m.impacts).toBe(8); // trailing space tolerated
  });

  it("maps a populated current-export row to typed values", () => {
    const rows = [["10/15/2026", "Krista Glo Magnusdottir", "305", "12", "40", "9", "6", "76", "3"]];
    const [r] = parseTitanSyncedData(CURRENT, rows);
    expect(r.date).toBe("2026-10-15"); // US-style m/d/y in this export → day-first? see note
    expect(r.imuPlayerLoad).toBe(305);
    expect(r.settledMin).toBe(12);
    expect(r.lowActiveMin).toBe(40);
    expect(r.midActiveMin).toBe(9);
    expect(r.highActiveMin).toBe(6);
    expect(r.imuJumps).toBe(76);
    expect(r.impacts).toBe(3);
  });

  it("imports jumps + impacts even when load index and durations are blank (near-empty export)", () => {
    const [r] = parseTitanSyncedData(CURRENT, [["10/15/2026", "Sara", "0", "0", "0", "0", "0", "82", "4"]]);
    expect(r.imuJumps).toBe(82);
    expect(r.impacts).toBe(4);
    expect(titanRowHasSignal(r)).toBe(true);
  });

  it("produces NO warnings — this is the correct full export", () => {
    expect(titanExportWarnings(CURRENT)).toEqual([]);
  });

  it("detects the file-wide M/D order from a clear row and applies it to an ambiguous one", () => {
    // 10/15 is unambiguously M/D (day 15). 10/05 is ambiguous — it must follow the file's M/D order,
    // i.e. month 10 day 5, NOT the European day-first default (month 5).
    const rows = [
      ["10/15/2026", "Clear", "0", "0", "0", "0", "0", "10", "1"],
      ["10/05/2026", "Ambiguous", "0", "0", "0", "0", "0", "20", "2"],
    ];
    const out = parseTitanSyncedData(CURRENT, rows);
    expect(out[0].date).toBe("2026-10-15");
    expect(out[1].date).toBe("2026-10-05"); // file-wide M/D, not 2026-05-10
  });
});

describe("csvToMatrix / parseTitanCsv (shared by the upload page and the sheet sync)", () => {
  const csv = [
    "Date,Player Name,IMU Player Load,IMU Duration,Load / Minute,Low Active Duration,High Active Duration,IMU Jumps,Impacts",
    "2026-01-15,Anna Jóns,412,64,6.4,40,18,22,130",
    '2026-01-16,"Jón, Ari",300,55,5.5,,,10,90',
  ].join("\n");

  it("splits a quoted CSV into a matrix (comma inside quotes stays one field)", () => {
    const m = csvToMatrix(csv);
    expect(m.length).toBe(3);
    expect(m[2][1]).toBe("Jón, Ari"); // quoted comma preserved
  });

  it("parses the CSV to headers + typed rows identically to parseTitanSyncedData", () => {
    const { headers, rows } = parseTitanCsv(csv);
    expect(headers[0]).toBe("Date");
    expect(rows.length).toBe(2);
    expect(rows[0].imuPlayerLoad).toBe(412);
    expect(rows[1].playerName).toBe("Jón, Ari");
    expect(rows[1].imuDurationMin).toBe(55);
  });

  it("tolerates a BOM and blank leading lines", () => {
    const { rows } = parseTitanCsv("﻿\n" + csv);
    expect(rows.length).toBe(2);
  });

  it("returns empty for an all-blank sheet", () => {
    expect(parseTitanCsv("\n\n").rows.length).toBe(0);
  });
});
