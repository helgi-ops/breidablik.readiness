import { describe, it, expect } from "vitest";
import { buildTeamMatchStatRows } from "../buildTeamMatchRows";

// General export: header, AVERAGE block (skipped), one fixture (own + opponent).
const general: unknown[][] = [
  ["Match", "Date", "Competition", "Team", "Scheme", "Goals", "xG", "Shots", "Passes", "Possession, %", "Losses", "Recoveries", "Duels", "Odd"],
  ["AVERAGE", "", "", "Breidablik", "4-3-3", 1.8, 1.9, "15 / 6", "520 / 470", "53", "11", "40", "56 / 31", "a"],
  ["Stjarnan 4:4 Breiðablik", "16.06.2026", "Besta deild", "Stjarnan", "4-4-2", 4, 2.5, "12 / 4", "500 / 400", "59", "10", "36", "50 / 28", "b"],
  ["", "", "", "Breiðablik", "4-3-3", 4, 2.55, "19 / 6", "337 / 261", "41", "13", "88", "122 / 69", "c"],
];
const indexes: unknown[][] = [
  ["Date", "Match", "Team", "PPDA"],
  ["Breidablik", null, null, 9.9], // AVERAGE-block noise → skipped
  ["2026-06-16", "Stjarnan 4:4 Breiðablik", "Stjarnan", 8.21],
  [null, null, "Breiðablik", 29.17],
];
const defending: unknown[][] = [
  ["Date", "Match", "Team", "Defensive duels / won", "", ""],
  ["2026-06-16", "Stjarnan 4:4 Breiðablik", "Stjarnan", 44, 20, 45.45],
  [null, null, "Breiðablik", 40, 21, 52.5],
];

describe("buildTeamMatchStatRows", () => {
  it("merges PPDA + def-duels onto the matching own/opponent General rows", () => {
    const b = buildTeamMatchStatRows({ generalMatrix: general, indexesMatrix: indexes, defendingMatrix: defending, teamId: "T", teamName: "Breiðablik" });
    expect(b.dbRows).toHaveLength(2);
    const own = b.dbRows.find((r) => !r.is_opponent)!;
    const opp = b.dbRows.find((r) => r.is_opponent)!;
    expect(own.match_date).toBe("2026-06-16");
    expect(own.ppda).toBe(29.17);
    expect(own.def_duels_won_pct).toBe(52.5);
    expect(opp.ppda).toBe(8.21);
    expect(opp.def_duels_won_pct).toBe(45.45);
    expect(own.team_id).toBe("T");
    expect(b.aux).toMatchObject({ ppdaMatched: true, defMatched: true });
    expect(b.ppdaHits).toBe(2);
    expect(b.defDuelsHits).toBe(2);
  });

  it("leaves aux columns null when those files are absent (General-only import)", () => {
    const b = buildTeamMatchStatRows({ generalMatrix: general, teamId: "T", teamName: "Breiðablik" });
    expect(b.dbRows.every((r) => r.ppda === null && r.def_duels_won_pct === null)).toBe(true);
    expect(b.aux.ppdaProvided).toBe(false);
    expect(b.ppdaHits).toBe(0);
  });

  it("reports aux dates that have no matching General row as orphans", () => {
    const extra: unknown[][] = [
      ["Date", "Match", "Team", "PPDA"],
      ["2026-06-16", "Stjarnan 4:4 Breiðablik", "Breiðablik", 29.17], // matches
      ["2026-05-01", "Valur 0:0 Breiðablik", "Breiðablik", 7.0],       // not in General → orphan
    ];
    const b = buildTeamMatchStatRows({ generalMatrix: general, indexesMatrix: extra, teamId: "T", teamName: "Breiðablik" });
    expect(b.ppdaOrphans).toEqual(["2026-05-01"]);
  });
});
