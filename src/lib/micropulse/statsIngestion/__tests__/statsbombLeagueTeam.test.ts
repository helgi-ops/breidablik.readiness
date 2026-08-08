import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseStatsbombLeagueTeam } from "../statsbombLeagueTeam";

const dir = path.join(process.cwd(), "docs/samples/statsbomb/league-team-stats");
const cats = ["summary", "defensive-pressing", "set-pieces", "obv", "shooting", "passing"];
// Proper RFC-4180 CSV parse (these league files are quoted with embedded commas).
// The real upload route parses via SheetJS; this mirrors that for the test.
function toMatrix(csv: string): string[][] {
  const text = csv.replace(/﻿/g, "");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
const hasFixtures = fs.existsSync(dir) && cats.every((c) => fs.existsSync(path.join(dir, `Valur-vs-LeagueAvg_${c}.csv`)));

describe.skipIf(!hasFixtures)("parseStatsbombLeagueTeam (real Valur category export)", () => {
  if (!hasFixtures) return; // skipIf skips the tests; this stops the eager reads below running at collection
  const files = cats.map((c) => ({ matrix: toMatrix(fs.readFileSync(path.join(dir, `Valur-vs-LeagueAvg_${c}.csv`), "utf-8")) }));
  const p = parseStatsbombLeagueTeam(files);
  const valur = p.teams.find((t) => t.name === "Valur")!;

  it("merges all categories into one team profile + the league average", () => {
    expect(p.categories).toBe(6);
    expect(p.leagueAverage).toBeTruthy();
    expect(valur).toBeTruthy();
  });

  it("maps StatsBomb npxG / PPDA into provider-agnostic metrics", () => {
    expect(valur.metrics.xgf).toBeCloseTo(1.56, 2);      // Non Penalty xG
    expect(valur.metrics.xga).toBeCloseTo(1.87, 2);
    expect(valur.metrics.ppda).toBeCloseTo(11.57, 2);    // from defensive-pressing
    expect(valur.metrics.shotsAgainst).toBeCloseTo(19.35, 2);
    expect(p.leagueAverage!.metrics.xgf).toBeCloseTo(1.61, 2);
    expect(p.leagueAverage!.metrics.ppda).toBeCloseTo(11.04, 2);
  });

  it("captures StatsBomb-only extras (OBV + set-piece for & against)", () => {
    expect(valur.sb.obv).toBeCloseTo(2.15, 2);
    expect(valur.sb.obvAgainst).toBeCloseTo(2.51, 2);
    expect(valur.sb.setPieceShotsAgainst).toBeCloseTo(5.18, 2);
    expect(valur.sb.carryObvConceded).toBeCloseTo(1.29, 2); // they get carried through
  });

  it("proxies possession from passes and flags it", () => {
    // Passes 495.53 / (495.53 + 497.24)
    expect(valur.metrics.possession).toBeCloseTo(49.9, 0);
    expect(valur.possessionIsProxy).toBe(true);
  });
});

describe("parseStatsbombLeagueTeam (synthetic, always-on)", () => {
  const summary = [["Team Name", "Games", "Goals", "Goals Conceded", "Non Penalty xG", "Non Penalty xG Faced"],
    ["League Average", "17", "1.9", "1.9", "1.6", "1.6"],
    ["Valur", "17", "1.65", "2.06", "1.56", "1.87"]];
  const press = [["Team Name", "PPDA"], ["League Average", "11.0"], ["Valur", "11.6"]];
  const obv = [["Team Name", "OBV", "OBV Conceded"], ["League Average", "2.2", "2.2"], ["Valur", "2.15", "2.51"]];
  const p = parseStatsbombLeagueTeam([{ matrix: summary }, { matrix: press }, { matrix: obv }]);

  it("merges by team name across files and separates league average", () => {
    expect(p.teams).toHaveLength(1);
    const v = p.teams[0];
    expect(v.name).toBe("Valur");
    expect(v.metrics.xgf).toBeCloseTo(1.56, 5);
    expect(v.metrics.ppda).toBeCloseTo(11.6, 5);
    expect(v.sb.obvAgainst).toBeCloseTo(2.51, 5);
    expect(p.leagueAverage!.metrics.xgf).toBeCloseTo(1.6, 5);
  });
});
