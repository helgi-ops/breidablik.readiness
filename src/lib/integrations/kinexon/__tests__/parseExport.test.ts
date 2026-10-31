import { describe, it, expect } from "vitest";
import {
  splitKinexonCsv,
  parseKinexonExport,
  parseKinexonNumber,
  parseDurationToMinutes,
  kinexonExportWarnings,
} from "../parseExport";
import { kinexonRowToExternalLoad } from "../toExternalLoad";

// A minimal, representative Kinexon Perform export: UTF-8 BOM, semicolon-delimited,
// Duration as hh:mm:ss, speed in km/h, European-formatted numbers, CoD + L/R.
const SAMPLE =
  "﻿Player;Date;Duration;Distance (m);Distance (speed | high) (m);Distance (speed | very high) (m);Distance (speed | extreme) (m);Speed (max.) (km/h);Accumulated Acceleration Load;Accumulated Acceleration Load / min;Accel 1;Accel 2;Accel 3;Accel 4;Decel 1;Decel 2;Decel 3;Decel 4;Changes of Direction;Changes of Direction (left);Changes of Direction (right);Mechanical Load;Jumps;Jump Load (J);Metabolic Power (Ø) (W);Metabolic Power (max.) (W);Metabolic Work (kcal);High Metabolic Power Distance (m);Steps\n" +
  "Jón Ari Björnsson;2026-10-28;01:12:30;2.345,5;180,2;60,1;25,0;27,36;512,4;7,1;40;22;9;4;38;20;8;3;31;14;17;88,5;12;340,0;9,8;21,4;512;210,3;3200\n" +
  "Ólöf Þórsdóttir;28.10.2026;00:58:00;-;-;-;-;-;410,0;-;30;18;6;2;28;15;5;1;19;9;10;70,0;8;-;8,1;17,0;300;150,0;2600\n";

describe("kinexon parseExport", () => {
  it("parses hh:mm:ss duration to minutes", () => {
    expect(parseDurationToMinutes("01:12:30")).toBe(72.5);
    expect(parseDurationToMinutes("00:58:00")).toBe(58);
    expect(parseDurationToMinutes("-")).toBeNull();
    expect(parseDurationToMinutes("")).toBeNull();
  });

  it("parses European and US numbers, blanks to null (never 0)", () => {
    expect(parseKinexonNumber("2.345,5")).toBe(2345.5); // European
    expect(parseKinexonNumber("1,234.56")).toBe(1234.56); // US
    expect(parseKinexonNumber("27,36")).toBe(27.36); // European decimal
    expect(parseKinexonNumber("-")).toBeNull();
    expect(parseKinexonNumber("")).toBeNull();
    expect(parseKinexonNumber(null)).toBeNull();
  });

  it("splits a BOM + semicolon export into headers and rows", () => {
    const { headers, rows } = splitKinexonCsv(SAMPLE);
    expect(headers[0]).toBe("Player");
    expect(headers).toContain("Changes of Direction");
    expect(rows).toHaveLength(2);
  });

  const { headers, rows } = splitKinexonCsv(SAMPLE);
  const parsed = parseKinexonExport(headers, rows);

  it("maps the first row: duration, distances, speed (km/h→m/s), accel/decel sums, CoD", () => {
    const r = parsed[0];
    expect(r.playerName).toBe("Jón Ari Björnsson");
    expect(r.date).toBe("2026-10-28");
    expect(r.durationMin).toBe(72.5);
    expect(r.totalDistance).toBe(2345.5);
    expect(r.highSpeedDistance).toBeCloseTo(240.3, 1); // 180.2 + 60.1
    expect(r.sprintDistance).toBe(25);
    expect(r.maxVelocity).toBeCloseTo(7.6, 1); // 27.36 / 3.6
    expect(r.accelerations).toBe(75); // 40+22+9+4
    expect(r.decelerations).toBe(69); // 38+20+8+3
    expect(r.accelHighEfforts).toBe(13); // 9+4
    expect(r.decelHighEfforts).toBe(11); // 8+3
    expect(r.codEvents).toBe(31); // the Titan gap, now filled
    expect(r.codLeft).toBe(14);
    expect(r.codRight).toBe(17);
    expect(r.metabolicEnergyKj).toBeCloseTo(512 * 4.184, 0); // kcal → kJ
  });

  it("parses a day-first European date and keeps blanks null (not 0)", () => {
    const r = parsed[1];
    expect(r.date).toBe("2026-10-28"); // 28.10.2026
    expect(r.totalDistance).toBeNull(); // '-' → null, NOT 0
    expect(r.highSpeedDistance).toBeNull();
    expect(r.jumpLoadJ).toBeNull();
    expect(r.playerLoad).toBe(410); // still present
  });

  it("maps to an external-load upsert row with source='kinexon' + CoD + duration", () => {
    const row = kinexonRowToExternalLoad(parsed[0], "player-uuid", "team-uuid");
    expect(row).not.toBeNull();
    expect(row!.source).toBe("kinexon");
    expect(row!.session_duration_minutes).toBe(72.5);
    expect(row!.cod_events).toBe(31);
    expect(row!.ima_cod).toBe(31);
    expect(row!.total_player_load).toBe(512.4);
    expect(row!.accelerations).toBe(75);
    // Integer columns are rounded
    expect(Number.isInteger(row!.decelerations!)).toBe(true);
    // Vendor extras + L/R CoD preserved in raw
    const raw = row!.raw_payload_json as Record<string, unknown>;
    expect(raw.provider).toBe("kinexon");
    expect(raw.mechanical_load_kinexon).toBe(88.5);
    expect(raw.cod_left).toBe(14);
  });

  it("warns when key columns are missing", () => {
    const w = kinexonExportWarnings(["Foo", "Bar"]);
    expect(w.some((x) => /Player/.test(x))).toBe(true);
    expect(w.some((x) => /Date/.test(x))).toBe(true);
  });
});
