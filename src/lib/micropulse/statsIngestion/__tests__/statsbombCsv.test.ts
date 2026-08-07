import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseStatsbombTeamStats, toSbDbRows } from "../statsbombCsv";

// Minimal CSV → matrix (the fixture has no quoted/embedded-comma fields).
function toMatrix(csv: string): string[][] {
  return csv.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length).map((l) => l.split(","));
}
// The StatsBomb export is licensed data — kept locally, NOT committed. Skip in CI when absent.
const fixture = path.join(process.cwd(), "docs/samples/statsbomb/Breidablik-MatchStats-2026.csv");
const hasFixture = fs.existsSync(fixture);
const matrix = hasFixture ? toMatrix(fs.readFileSync(fixture, "utf-8").replace(/^﻿/, "")) : [];

describe.skipIf(!hasFixture)("parseStatsbombTeamStats (real IQ export)", () => {
  const p = parseStatsbombTeamStats(matrix, { teamName: "Breidablik" });

  it("parses all 17 fixtures and infers the club", () => {
    expect(p.fixtures).toBe(17);
    expect(p.rows.every((r) => r.matchDate)).toBe(true);
  });

  it("reads own + opposition sides of a known match", () => {
    const m = p.rows.find((r) => r.matchDate === "2026-08-04")!; // "Thor Akureyri vs. Breidablik"
    expect(m.isHome).toBe(false);
    expect(m.opponent).toBe("Thor Akureyri");
    expect(m.goals).toBe(0);
    expect(m.goalsAgainst).toBe(1);
    expect(m.xg).toBeCloseTo(1.61, 1);
    expect(m.xgAgainst).toBeCloseTo(1.62, 1);
  });

  it("promotes StatsBomb-only metrics (OBV, pressures, set-piece for & against)", () => {
    const m = p.rows.find((r) => r.matchDate === "2026-08-04")!;
    expect(m.obv).toBeCloseTo(0.76, 1);
    expect(m.oppositionObv).toBeCloseTo(2.19, 1);
    expect(m.pressures).toBe(106);
    expect(m.setPieceXg).toBeCloseTo(1.10, 1);
    expect(m.oppSetPieceGoals).toBe(1);
  });

  it("converts fractions to percent and proxies possession", () => {
    const m = p.rows.find((r) => r.matchDate === "2026-08-04")!;
    expect(m.passingPct).toBeCloseTo(82.6, 0);      // 0.8256 → 82.6
    expect(m.possessionProxyPct).toBeCloseTo(60.8, 0); // 562 / (562 + 362)
  });

  it("drops the empty Iceland 360 families from raw", () => {
    const m = p.rows[0];
    expect(Object.keys(m.raw).some((k) => /Line Breaking Passes|Ball Receipts in Space|Space Received/.test(k))).toBe(false);
    expect(Object.keys(m.raw).length).toBeGreaterThan(80); // still keeps the rest verbatim
  });

  it("maps to snake_case db rows for upsert", () => {
    const db = toSbDbRows(p.rows, { teamId: "team-uuid", sbTeamId: 2041, season: "2026" });
    expect(db).toHaveLength(17);
    const one = db[0];
    expect(one.source).toBe("statsbomb");
    expect(one.team_id).toBe("team-uuid");
    expect(one).toHaveProperty("opposition_obv");
    expect(one).toHaveProperty("set_piece_xg");
  });
});

// Always-on coverage (no licensed fixture needed): a tiny synthetic export.
describe("parseStatsbombTeamStats (synthetic)", () => {
  const header = ["Match", "Date", "Game Week", "Goals", "Goals Conceded", "xG", "Opposition xG", "Passing%", "Passes", "Opposition Passes", "OBV", "Opposition OBV", "Set Piece xG", "Line Breaking Passes", "Minutes"];
  const rows = [
    ["Breidablik vs. Valur", "2026-05-01", "1", "2", "1", "1.80", "0.90", "0.75", "500", "300", "1.2", "0.4", "0.5", "", "96"],
    ["KR vs. Breidablik", "2026-05-08", "2", "0", "3", "0.60", "2.40", "0.55", "300", "480", "-0.5", "1.9", "0.2", "", "95"],
  ];
  const p = parseStatsbombTeamStats([header, ...rows], { teamName: "Breidablik" });

  it("infers home/away and opponent per row", () => {
    expect(p.fixtures).toBe(2);
    expect(p.rows[0].isHome).toBe(true);
    expect(p.rows[0].opponent).toBe("Valur");
    expect(p.rows[1].isHome).toBe(false);
    expect(p.rows[1].opponent).toBe("KR");
  });

  it("splits own vs opposition metrics and proxies possession", () => {
    expect(p.rows[0].xg).toBeCloseTo(1.8, 5);
    expect(p.rows[0].xgAgainst).toBeCloseTo(0.9, 5);
    expect(p.rows[0].passingPct).toBeCloseTo(75, 5);
    expect(p.rows[0].possessionProxyPct).toBeCloseTo(62.5, 1); // 500 / 800
    expect(p.rows[1].oppositionObv).toBeCloseTo(1.9, 5);
  });

  it("drops empty 360 columns and keeps unmapped in raw", () => {
    expect(p.rows[0].raw).not.toHaveProperty("Line Breaking Passes");
  });
});
