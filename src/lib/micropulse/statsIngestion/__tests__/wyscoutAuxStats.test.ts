import { describe, it, expect } from "vitest";
import { parsePpda, parseDefDuelsWonPct, parseWyscoutAuxColumn } from "../wyscoutAuxStats";

// Minimal Wyscout "Indexes" shape: header row, an AVERAGE block (Date = team name,
// no Team cell), then own + opponent rows per fixture with blanked repeat dates.
const indexes: unknown[][] = [
  ["Date", "Match", "Team", "PPDA"],
  ["Breidablik", null, null, 9.9],        // AVERAGE block — no real date, no Team → skipped
  ["Opponents", null, null, 11.1],        // AVERAGE block
  ["2026-06-16", "Stjarnan - Breidablik 4:4", "Breidablik", 29.17],
  [null, null, "Stjarnan", 8.21],          // same fixture, date blanked → carried forward
  ["2026-05-13", "Breidablik - Throttur 2:2", "Breidablik", 24],
  [null, null, "Throttur", 6.5],
];

// "Defending": "Defensive duels / won" is a trio — total, won, won% — with the
// two follow-on columns carrying blank headers.
const defending: unknown[][] = [
  ["Date", "Match", "Team", "Defensive duels / won", "", ""],
  ["Breidablik", null, null, 100, 55, 55],
  ["2026-06-16", "Stjarnan - Breidablik 4:4", "Breidablik", 40, 21, 52.5],
  [null, null, "Stjarnan", 44, 20, 45.45],
];

describe("parseWyscoutAuxColumn — PPDA (Indexes)", () => {
  it("reads own + opponent PPDA, skips the average block, carries the date forward", () => {
    const { rows, matched, skipped } = parsePpda(indexes, "Breiðablik");
    expect(matched).toBe(true);
    expect(skipped).toBeGreaterThanOrEqual(2); // two average rows
    const own = rows.filter((r) => !r.isOpponent);
    const opp = rows.filter((r) => r.isOpponent);
    expect(own).toEqual([
      { matchDate: "2026-06-16", isOpponent: false, value: 29.17 },
      { matchDate: "2026-05-13", isOpponent: false, value: 24 },
    ]);
    expect(opp[0]).toEqual({ matchDate: "2026-06-16", isOpponent: true, value: 8.21 });
  });

  it("folds Icelandic team spelling (Þróttur/Throttur, ð) when deciding own vs opponent", () => {
    // ourKey "breidablik" matches "Breidablik"; everything else is the opponent.
    const { rows } = parsePpda(indexes, "Breidablik");
    expect(rows.find((r) => r.matchDate === "2026-05-13" && r.isOpponent)?.value).toBe(6.5);
  });
});

describe("parseDefDuelsWonPct — Defending", () => {
  it("takes the trio's WON % (offset +2), not the total or the won count", () => {
    const { rows, matched, matchedHeader } = parseDefDuelsWonPct(defending, "Breidablik");
    expect(matched).toBe(true);
    expect(matchedHeader).toBe("Defensive duels / won");
    expect(rows.find((r) => !r.isOpponent)).toEqual({ matchDate: "2026-06-16", isOpponent: false, value: 52.5 });
    expect(rows.find((r) => r.isOpponent)?.value).toBe(45.45);
  });
});

describe("wrong export handling", () => {
  it("reports matched=false when the target column is absent (fail loud, no rows)", () => {
    const general: unknown[][] = [["Date", "Match", "Team", "xG"], ["2026-06-16", "x", "Breidablik", 2.5]];
    const res = parseWyscoutAuxColumn(general, { teamName: "Breidablik", headerMatch: "ppda" });
    expect(res.matched).toBe(false);
    expect(res.rows).toHaveLength(0);
  });
});
