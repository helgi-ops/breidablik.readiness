import { describe, it, expect } from "vitest";
import {
  isInstatLineupsHeader,
  parseInstatLineups,
  minutesToNumber,
  num,
  distinctMembers,
} from "../statsInstatLineupsCsv";

// Synthetic rows mirroring the real "Lineups - Njardvik W" export header (no licensed file committed).
const HEADERS = [
  "Lineup", "Plus/Minus", "Minutes", "Possessions", "Points",
  "Field goals attempted", "Field goals made", "Field goals, %",
  "3-pt field goals attempted", "3-pt field goals made", "3-pt field goals, %",
  "Free throws attempted", "Free throws made", "Free throws, %",
  "Rebounds", "Offensive rebounds", "Defensive rebounds",
  "Assists", "Steals", "Turnovers", "Fouls",
];

const row = (over: Record<string, unknown>): Record<string, unknown> => {
  const base: Record<string, unknown> = {};
  for (const h of HEADERS) base[h] = "-";
  return { ...base, ...over };
};

describe("isInstatLineupsHeader", () => {
  it("accepts the Lineups export header", () => {
    expect(isInstatLineupsHeader(HEADERS)).toBe(true);
  });
  it("rejects a per-player header (has a player name column, not Lineup)", () => {
    expect(isInstatLineupsHeader(["Player", "Points", "Rebounds", "Plus/Minus"])).toBe(false);
  });
});

describe("minutesToNumber / num", () => {
  it("parses mm:ss to decimal minutes", () => {
    expect(minutesToNumber("14:29")).toBeCloseTo(14.483, 2);
    expect(minutesToNumber("06:57")).toBeCloseTo(6.95, 2);
  });
  it("treats '-' as null", () => {
    expect(minutesToNumber("-")).toBeNull();
    expect(num("-")).toBeNull();
    expect(num("45.5%")).toBeCloseTo(45.5, 4);
  });
});

describe("parseInstatLineups", () => {
  it("parses members, jerseys, box columns and a stable hash; drops the total row", () => {
    const { lineups, skipped } = parseInstatLineups([
      row({
        Lineup: "4 D. Rodriguez, 12 B. Dinkins, 6 P. Hersler, 17 H. Rafnsdottir, 11 H. Agnarsdottir",
        "Plus/Minus": "4.3", Minutes: "14:29", Possessions: "35.3", Points: "29.3",
        "Field goals made": "10", "Field goals attempted": "26", "Field goals, %": "38.5%",
      }),
      row({ Lineup: "Average per game", "Plus/Minus": "-", Possessions: "-" }),
    ]);
    expect(skipped.some((s) => s.reason === "not a lineup row")).toBe(true);
    expect(lineups).toHaveLength(1);
    const l = lineups[0];
    expect(l.members).toHaveLength(5);
    expect(l.members[0]).toEqual({ jersey: "4", name: "D. Rodriguez" });
    // hash = sorted jerseys (numeric)
    expect(l.lineupHash).toBe("4-6-11-12-17");
    expect(l.possessions).toBeCloseTo(35.3, 4);
    expect(l.plusMinus).toBeCloseTo(4.3, 4);
    expect(l.minutes).toBeCloseTo(14.483, 2);
    expect(l.fgm).toBe(10);
    expect(l.fgPct).toBeCloseTo(38.5, 4);
  });

  it("hash is order-independent (same five in any order → same hash)", () => {
    const a = parseInstatLineups([row({ Lineup: "11 A, 4 B, 17 C, 6 D, 12 E", "Plus/Minus": "1", Possessions: "20" })]).lineups[0];
    const b = parseInstatLineups([row({ Lineup: "4 B, 6 D, 11 A, 12 E, 17 C", "Plus/Minus": "1", Possessions: "20" })]).lineups[0];
    expect(a.lineupHash).toBe(b.lineupHash);
  });

  it("collects distinct members across lineups for name mapping", () => {
    const { lineups } = parseInstatLineups([
      row({ Lineup: "4 D. Rodriguez, 12 B. Dinkins, 6 P. Hersler, 17 H. Rafnsdottir, 11 H. Agnarsdottir", Possessions: "30" }),
      row({ Lineup: "4 D. Rodriguez, 12 B. Dinkins, 21 S. Roma, 17 H. Rafnsdottir, 11 H. Agnarsdottir", Possessions: "14" }),
    ]);
    const members = distinctMembers(lineups);
    // Union of the two units = 6 distinct players (Roma is the swap-in).
    expect(members).toHaveLength(6);
    expect(members.some((m) => m.name === "S. Roma")).toBe(true);
  });
});
