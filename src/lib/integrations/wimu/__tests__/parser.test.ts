/**
 * Tests for WIMU CSV parser + normalize.
 *
 * Run with:  npx vitest src/lib/integrations/wimu/__tests__/parser.test.ts
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, it, expect } from "vitest";

import {
  matchHeader,
  buildHeaderAliasIndex,
  normalizeColumnName,
} from "../metricCatalog";
import {
  detectDelimiter,
  findHeaderLine,
  mapHeaderColumns,
  parseWimuCsv,
} from "../parser";
import {
  parseNumber,
  parseDate,
  parseDurationMinutes,
  normalizeWimuRow,
  aggregateByAthleteDate,
} from "../normalize";

// ── Header alias matching ────────────────────────────────────────────────

describe("metricCatalog.matchHeader", () => {
  it("matches English column names", () => {
    expect(matchHeader("Total Distance (m)")).toBe("totalDistance");
    expect(matchHeader("Player Load")).toBe("playerLoad");
    expect(matchHeader("Avg HR (bpm)")).toBe("avgHeartRate");
    expect(matchHeader("Max Velocity")).toBe("maxVelocity");
    expect(matchHeader("HSR Distance")).toBe("highSpeedDistance");
  });

  it("matches Spanish column names", () => {
    expect(matchHeader("Distancia Total")).toBe("totalDistance");
    expect(matchHeader("Carga Jugador")).toBe("playerLoad");
    expect(matchHeader("FC Media")).toBe("avgHeartRate");
    expect(matchHeader("Velocidad Máxima")).toBe("maxVelocity");
  });

  it("ignores case, punctuation, and accents", () => {
    expect(matchHeader("DISTANCIA  TOTAL!!!")).toBe("totalDistance");
    expect(matchHeader("velocidad-máxima")).toBe("maxVelocity");
  });

  it("returns null for unknown columns", () => {
    expect(matchHeader("Some Random Column")).toBeNull();
    expect(matchHeader("")).toBeNull();
  });

  it("normalizeColumnName strips diacritics, punctuation, and unit suffixes", () => {
    expect(normalizeColumnName("Distancia Máxima!")).toBe("distanciamaxima");
    // "(s)" is stripped as a unit suffix → "hr zone 1 " → "hrzone1"
    expect(normalizeColumnName("HR Zone 1 (s)")).toBe("hrzone1");
    expect(normalizeColumnName("Total Distance (m)")).toBe("totaldistance");
    expect(normalizeColumnName("Max Velocity (km/h)")).toBe("maxvelocity");
    expect(normalizeColumnName("Avg HR (bpm)")).toBe("avghr");
  });
});

// ── Delimiter + header detection ─────────────────────────────────────────

describe("parser.detectDelimiter", () => {
  it("detects comma delimiter", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });
  it("detects semicolon delimiter (Spanish locale)", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });
  it("detects tab delimiter", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
});

describe("parser.findHeaderLine", () => {
  it("skips metadata preamble and finds the real header row", () => {
    const lines = [
      "SPRO Export",
      "Club: Breiðablik",
      "",
      "Athlete,Date,Total Distance,Player Load",
      "Andri,2026-04-22,8500,512",
    ];
    const r = findHeaderLine(lines, ",");
    expect(r.headerLineIndex).toBe(3);
    expect(r.headerCells).toEqual(["Athlete", "Date", "Total Distance", "Player Load"]);
  });
});

describe("parser.mapHeaderColumns", () => {
  it("matches known columns and surfaces unknown ones for review", () => {
    const headers = ["Athlete", "Date", "Total Distance (m)", "Mystery Stat"];
    const r = mapHeaderColumns(headers);
    expect(r.matched.get(0)).toBe("athleteName");
    expect(r.matched.get(1)).toBe("date");
    expect(r.matched.get(2)).toBe("totalDistance");
    expect(r.matched.has(3)).toBe(false);
    expect(r.unmatched.get(3)).toBe("Mystery Stat");
  });
});

// ── Full CSV parse ───────────────────────────────────────────────────────

const SAMPLE_ENGLISH_CSV = `Athlete,Date,Session,Duration (min),Total Distance (m),HSR Distance,Player Load,Max Velocity (km/h),Avg HR,Max HR
Andri Yeoman,2026-04-22,Training A,75,8542,1234,512,32.4,156,182
Magnus Olsen,2026-04-22,Training A,75,9100,1402,580,33.1,162,188
`;

const SAMPLE_SPANISH_CSV = `Jugador;Fecha;Sesión;Duración;Distancia Total;Distancia Alta Velocidad;Carga Jugador;Velocidad Máxima;FC Media;FC Máxima
Andri Yeoman;22/04/2026;Entrenamiento;75;8542;1234;512;32,4;156;182
Magnus Olsen;22/04/2026;Entrenamiento;75;9100;1402;580;33,1;162;188
`;

describe("parser.parseWimuCsv (end-to-end)", () => {
  it("parses English-locale comma-separated SPRO export", () => {
    const r = parseWimuCsv(SAMPLE_ENGLISH_CSV);
    expect(r.delimiter).toBe(",");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].athleteName).toBe("Andri Yeoman");
    expect(r.rows[0].date).toBe("2026-04-22");
    expect(r.rows[0].raw["totalDistance"]).toBe("8542");
    expect(r.rows[0].raw["playerLoad"]).toBe("512");
    expect(r.matched.size).toBeGreaterThanOrEqual(8);
  });

  it("parses Spanish-locale semicolon-separated SPRO export", () => {
    const r = parseWimuCsv(SAMPLE_SPANISH_CSV);
    expect(r.delimiter).toBe(";");
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].athleteName).toBe("Andri Yeoman");
    expect(r.rows[0].date).toBe("22/04/2026");  // raw — normalize converts
    expect(r.rows[0].raw["totalDistance"]).toBe("8542");
    expect(r.rows[0].raw["maxVelocity"]).toBe("32,4");  // raw with comma
  });

  it("respects header overrides for unmatched columns", () => {
    const csv = `Athlete,Date,Mystery Stat,Player Load
Andri,2026-04-22,1234,512
`;
    const overrides = new Map([["Mystery Stat", "totalDistance" as const]]);
    const r = parseWimuCsv(csv, overrides);
    expect(r.rows[0].raw["totalDistance"]).toBe("1234");
    expect(r.matched.get(2)).toBe("totalDistance");
  });

  it("handles UTF-8 BOM and Windows line endings", () => {
    const csv = "\uFEFFAthlete,Date,Total Distance\r\nAndri,2026-04-22,8500\r\n";
    const r = parseWimuCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].raw["totalDistance"]).toBe("8500");
  });
});

// ── Number / date / duration normalization ───────────────────────────────

describe("normalize.parseNumber", () => {
  it("parses English decimals", () => {
    expect(parseNumber("1234.5")).toBe(1234.5);
    expect(parseNumber("1,234.5")).toBe(1234.5);
  });
  it("parses Spanish decimals", () => {
    expect(parseNumber("32,4")).toBe(32.4);
    expect(parseNumber("1234,5")).toBe(1234.5);
  });
  it("handles empty / dash / N/A", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("N/A")).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe("normalize.parseDate", () => {
  it("parses ISO format", () => {
    expect(parseDate("2026-04-22")).toBe("2026-04-22");
    expect(parseDate("2026/04/22")).toBe("2026-04-22");
  });
  it("parses European DD/MM/YYYY", () => {
    expect(parseDate("22/04/2026")).toBe("2026-04-22");
    expect(parseDate("22.04.2026")).toBe("2026-04-22");
  });
  it("disambiguates US format when day > 12", () => {
    // 22 can only be a day → Spanish/European
    expect(parseDate("22/04/2026")).toBe("2026-04-22");
  });
  it("returns null for unrecognized format", () => {
    expect(parseDate("hello world")).toBeNull();
  });
});

describe("normalize.parseDurationMinutes", () => {
  it("parses HH:MM:SS", () => {
    expect(parseDurationMinutes("01:15:00")).toBeCloseTo(75, 1);
  });
  it("parses MM:SS heuristically", () => {
    expect(parseDurationMinutes("75:00")).toBeCloseTo(75, 1);  // > 6 → MM:SS
  });
  it("parses plain number with min suffix", () => {
    expect(parseDurationMinutes("75")).toBe(75);
    expect(parseDurationMinutes("75 min")).toBe(75);
    expect(parseDurationMinutes("75 mínútur")).toBe(75);
  });
  it("parses compound 1h15m", () => {
    expect(parseDurationMinutes("1h15m")).toBe(75);
    expect(parseDurationMinutes("1h 15min")).toBe(75);
  });
});

// ── Row normalize ────────────────────────────────────────────────────────

describe("normalize.normalizeWimuRow", () => {
  it("returns typed metric row with parsed values", () => {
    const r = parseWimuCsv(SAMPLE_ENGLISH_CSV);
    const norm = normalizeWimuRow(r.rows[0])!;
    expect(norm.athleteName).toBe("Andri Yeoman");
    expect(norm.date).toBe("2026-04-22");
    expect(norm.totalDistance).toBe(8542);
    expect(norm.maxVelocity).toBe(32.4);
    expect(norm.avgHeartRate).toBe(156);
    expect(norm.durationMinutes).toBe(75);
  });

  it("handles Spanish decimal commas correctly", () => {
    const r = parseWimuCsv(SAMPLE_SPANISH_CSV);
    const norm = normalizeWimuRow(r.rows[0])!;
    expect(norm.maxVelocity).toBe(32.4);
    expect(norm.date).toBe("2026-04-22");
  });

  it("returns null when athlete or date missing", () => {
    const row = { raw: {}, athleteName: null, date: null };
    expect(normalizeWimuRow(row)).toBeNull();
  });
});

// ── Multi-session aggregation ────────────────────────────────────────────

describe("normalize.aggregateByAthleteDate", () => {
  it("sums volume and takes max for peaks", () => {
    const sessions = [
      { athleteName: "A", date: "2026-04-22", totalDistance: 4000, playerLoad: 250, maxVelocity: 30, durationMinutes: 40 },
      { athleteName: "A", date: "2026-04-22", totalDistance: 5000, playerLoad: 280, maxVelocity: 32, durationMinutes: 35 },
    ] as any;
    const r = aggregateByAthleteDate(sessions);
    expect(r).toHaveLength(1);
    expect(r[0].totalDistance).toBe(9000);
    expect(r[0].playerLoad).toBe(530);
    expect(r[0].maxVelocity).toBe(32);
    expect(r[0].durationMinutes).toBe(75);
  });

  it("weighted-averages rate metrics by duration", () => {
    const sessions = [
      { athleteName: "A", date: "2026-04-22", avgHeartRate: 150, durationMinutes: 60 },
      { athleteName: "A", date: "2026-04-22", avgHeartRate: 170, durationMinutes: 30 },
    ] as any;
    const r = aggregateByAthleteDate(sessions);
    // (150*60 + 170*30) / 90 = 156.66...
    expect(r[0].avgHeartRate).toBeCloseTo(156.67, 1);
  });

  it("keeps single-session rows untouched", () => {
    const sessions = [
      { athleteName: "B", date: "2026-04-22", totalDistance: 8000 },
    ] as any;
    const r = aggregateByAthleteDate(sessions);
    expect(r).toHaveLength(1);
    expect(r[0].totalDistance).toBe(8000);
  });
});
