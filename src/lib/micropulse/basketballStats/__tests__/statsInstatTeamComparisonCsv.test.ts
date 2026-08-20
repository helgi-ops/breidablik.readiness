import { describe, it, expect } from "vitest";
import { isInstatTeamComparisonMatrix, parseInstatTeamComparison, num } from "../statsInstatTeamComparisonCsv";

// Synthetic matrix mirroring the real "Team comparison - Njardvik W" sheet (key/value layout).
const MATRIX: unknown[][] = [
  [null, "NJARDVIK W\nIceland\n\nIceland. Bonus kvenna\nSeason 2025-2026", null],
  ["Games played", 34, null],
  ["Possessions", 88.9, "Average per game"],
  ["Points", 86.7, "Average per game"],
  ["Points per possession", 0.95, null],
  ["Field goals made", 31.3, "Average per game"],
  ["Field goals attempted", 71.6, "Average per game"],
  ["Field goals, %", "43.7%", null],
  ["3-pt field goals made", 9.1, "Average per game"],
  ["3-pt field goals attempted", 27.4, "Average per game"],
  ["3-pt field goals, %", "33.3%", null],
  ["Free throws made", 15.1, "Average per game"],
  ["Free throws attempted", 17.8, "Average per game"],
  ["Free throws, %", "84.9%", null],
  ["Rebounds", 37.9, "Average per game"],
  ["Offensive rebounds", 10.6, "Average per game"],
  ["Defensive rebounds", 27.3, "Average per game"],
  ["Assists", 18.7, "Average per game"],
  ["Steals", 8.1, "Average per game"],
  ["Turnovers", 12.2, "Average per game"],
  ["Blocks", 2.2, "Average per game"],
  ["Fouls", 17.3, "Average per game"],
  ["Fouls drawn", 17.5, "Average per game"],
];

describe("isInstatTeamComparisonMatrix", () => {
  it("accepts the Team comparison matrix", () => {
    expect(isInstatTeamComparisonMatrix(MATRIX)).toBe(true);
  });
  it("rejects an unrelated matrix", () => {
    expect(isInstatTeamComparisonMatrix([["Date", "Opponent", "Score"], ["05/17", "vs X", "95:70"]])).toBe(false);
  });
});

describe("parseInstatTeamComparison", () => {
  it("pulls the season label + averages, and derives eFG%", () => {
    const t = parseInstatTeamComparison(MATRIX);
    expect(t.season).toBe("2025-2026");
    expect(t.gamesPlayed).toBe(34);
    expect(t.possessions).toBeCloseTo(88.9, 4);
    expect(t.ppp).toBeCloseTo(0.95, 4);
    expect(t.fgPct).toBeCloseTo(43.7, 4);
    expect(t.tpPct).toBeCloseTo(33.3, 4);
    expect(t.foulsDrawn).toBeCloseTo(17.5, 4);
    // eFG% = (31.3 + 0.5*9.1)/71.6 * 100 = 50.06 → 50.1
    expect(t.efgPct).toBeCloseTo(50.1, 1);
  });

  it("num strips % and treats '-' as null", () => {
    expect(num("43.7%")).toBeCloseTo(43.7, 4);
    expect(num("-")).toBeNull();
  });
});
