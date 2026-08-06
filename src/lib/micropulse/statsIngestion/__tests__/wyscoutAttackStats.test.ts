import { describe, it, expect } from "vitest";
import { parsePassing, parseAttacking } from "../wyscoutAttackStats";

// Passing export: accuracy sits in the trio's blank-header %-column (count / accurate / %).
// Header row, an AVERAGE block (Date not ISO → skipped), one fixture (opponent + own).
const passing: unknown[][] = [
  ["Date", "Match", "Team", "Forward passes / accurate", "", "", "Passes to final third / accurate", "", "", "Smart passes / accurate", "", "", "Progressive passes", "Crosses / accurate", "", ""],
  ["Breidablik", null, null, 100, 70, 70, 30, 20, 66, 4, 2, 50, 40, 12, 4, 33],
  ["2026-06-16", "Stjarnan - Breidablik", "Stjarnan", 150, 100, 66.7, 35, 22, 62.9, 6, 2, 33.3, 48, 14, 5, 35.7],
  [null, null, "Breidablik", 163, 113, 69.3, 40, 28, 70, 5, 2, 40, 55, 16, 5, 31.3],
];

const attacking: unknown[][] = [
  ["Date", "Match", "Team", "Touches in penalty area", "Positional attacks", "Counterattacks", "Offensive duels / won", "", ""],
  ["Breidablik", null, null, 20, 30, 5, 50, 25, 50],
  ["2026-06-16", "Stjarnan - Breidablik", "Stjarnan", 18, 28, 6, 45, 20, 44.4],
  [null, null, "Breidablik", 22, 35, 3, 48, 25, 52.1],
];

describe("parsePassing", () => {
  const { rows, matched } = parsePassing(passing, "Breidablik");
  const own = rows.find((r) => !r.isOpponent)!;
  const opp = rows.find((r) => r.isOpponent)!;

  it("reads promoted counts + trio accuracy %, attributes own vs opponent, skips AVERAGE", () => {
    expect(matched).toBe(true);
    expect(rows).toHaveLength(2); // average block dropped
    expect(own.matchDate).toBe("2026-06-16");
    expect(own.values.forward_passes).toBe(163);
    expect(own.values.forward_pass_acc_pct).toBeCloseTo(69.3, 5); // trio's blank-header % column
    expect(own.values.passes_final_third).toBe(40);
    expect(own.values.passes_final_third_acc_pct).toBe(70);
    expect(own.values.smart_passes).toBe(5);
    expect(own.values.progressive_passes).toBe(55);
    expect(own.values.crosses).toBe(16);
    expect(own.values.cross_acc_pct).toBeCloseTo(31.3, 5);
    expect(opp.values.forward_passes).toBe(150);
    expect(own.raw["Forward passes / accurate"]).toBe(163);
  });

  it("computes accuracy from a PACKED '163 / 113' cell when there's no blank-header % column", () => {
    const packed: unknown[][] = [
      ["Date", "Match", "Team", "Forward passes / accurate", "Progressive passes"],
      ["2026-06-16", "x - Breidablik", "Breidablik", "163 / 113", 55],
    ];
    const r = parsePassing(packed, "Breidablik").rows[0];
    expect(r.values.forward_passes).toBe(163);
    expect(r.values.forward_pass_acc_pct).toBeCloseTo(69.3, 1); // 113/163*100
  });
});

describe("parseAttacking", () => {
  it("reads touches/positional/counter + offensive-duels won % (trio +2)", () => {
    const { rows, matched } = parseAttacking(attacking, "Breidablik");
    expect(matched).toBe(true);
    const own = rows.find((r) => !r.isOpponent)!;
    expect(own.values.touches_in_box).toBe(22);
    expect(own.values.positional_attacks).toBe(35);
    expect(own.values.counterattacks).toBe(3);
    expect(own.values.offensive_duels_won_pct).toBeCloseTo(52.1, 5);
  });

  it("infers our team from the file when no teamName is given (2 fixtures → Breidablik most common)", () => {
    const twoFix: unknown[][] = [
      ["Date", "Match", "Team", "Touches in penalty area", "Positional attacks", "Counterattacks", "Offensive duels / won", "", ""],
      ["2026-06-16", "Stjarnan - Breidablik", "Stjarnan", 18, 28, 6, 45, 20, 44.4],
      [null, null, "Breidablik", 22, 35, 3, 48, 25, 52.1],
      ["2026-05-01", "Breidablik - Valur", "Breidablik", 25, 40, 4, 55, 30, 54.5],
      [null, null, "Valur", 12, 20, 8, 40, 18, 45.0],
    ];
    const rows = parseAttacking(twoFix).rows; // no teamName → infer
    const ownDates = rows.filter((r) => !r.isOpponent).map((r) => r.matchDate).sort();
    expect(ownDates).toEqual(["2026-05-01", "2026-06-16"]); // both Breidablik rows are own
  });
});
