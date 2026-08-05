import { describe, it, expect } from "vitest";
import { parseWyscoutTeamStats, normTeam } from "../wyscoutTeamStats";

describe("normTeam", () => {
  it("folds Icelandic letters + accents so name variants match", () => {
    expect(normTeam("Breiðablik")).toBe("breidablik");
    expect(normTeam("Breidablik")).toBe("breidablik");
    expect(normTeam("Þór")).toBe("thor");
    expect(normTeam("Thór")).toBe("thor");
    expect(normTeam("ÍBV")).toBe("ibv");
  });
});

describe("parseWyscoutTeamStats", () => {
  // A title row, the header row, an AVERAGE block (two rows, must be skipped),
  // then two fixtures with two team-rows each. Repeated Match/Date/Competition
  // cells are blanked on the 2nd row of each fixture (Wyscout does this).
  const matrix: unknown[][] = [
    ["Besta deild karla 2026 — Team stats", null, null, null, null, null, null, null, null, null, null, null, null, null],
    ["Match", "Date", "Competition", "Team", "Scheme", "Goals", "xG", "Shots", "Passes", "Possession, %", "Losses", "Recoveries", "Duels", "Odd Col"],
    ["AVERAGE", "", "", "Breidablik", "4-3-3", 1.8, 1.9, "15 / 6", "520 / 470", "53", "11", "40", "56 / 31", "a"],
    ["", "", "", "Opponents", "", 1.2, 1.4, "12 / 4", "430 / 380", "47", "13", "35", "54 / 26", "b"],
    // Fixture 1 — Thór 1:0 Breiðablik, 04.08.2026
    ["Thór 1:0 Breiðablik", "04.08.2026", "Besta deild", "Thór", "3-5-2", 1, 2.09, "15 / 6", "480 / 420", "52", "12", "38", "55 / 30", "c"],
    ["", "", "", "Breiðablik", "4-3-3", 0, 2.33, "18 / 7", "540 / 500", "48", "9", "41", "58 / 34", "d"],
    // Fixture 2 — Breiðablik 1:0 ÍBV, 27.07.2026
    ["Breiðablik 1:0 ÍBV", "27.07.2026", "Besta deild", "Breiðablik", "4-3-3", 1, 1.23, "14 / 5", "560 / 520", "55", "8", "44", "50 / 28", "e"],
    ["", "", "", "ÍBV", "4-4-2", 0, 1.25, "10 / 3", "400 / 350", "45", "14", "33", "52 / 24", "f"],
  ];

  const res = parseWyscoutTeamStats(matrix, { teamName: "Breiðablik" });

  it("skips the AVERAGE block and finds both fixtures (2 rows each)", () => {
    expect(res.fixtures).toBe(2);
    expect(res.rows).toHaveLength(4);
    expect(res.skipped.some((s) => s.reason === "average block")).toBe(true);
    // No AVERAGE row leaked through.
    expect(res.rows.every((r) => r.goals !== 1.8)).toBe(true);
  });

  it("splits the own row from the opponent row and shares opponent_name", () => {
    const f1 = res.rows.filter((r) => r.matchDate === "2026-08-04");
    const own = f1.find((r) => !r.isOpponent)!;
    const opp = f1.find((r) => r.isOpponent)!;
    expect(own.opponentName).toBe("Thór");
    expect(opp.opponentName).toBe("Thór");
    // Our row = Breiðablik: xG 2.33, lost 0:1.
    expect(own.xg).toBeCloseTo(2.33, 5);
    expect(own.goals).toBe(0);
    // Opponent row = Thór: xG 2.09.
    expect(opp.xg).toBeCloseTo(2.09, 5);
    expect(opp.goals).toBe(1);
  });

  it("coerces 'primary / secondary' cells and strips the possession %", () => {
    const own = res.rows.find((r) => r.matchDate === "2026-08-04" && !r.isOpponent)!;
    expect(own.shots).toBe(18);
    expect(own.shotsOnTarget).toBe(7);
    expect(own.passes).toBe(540);
    expect(own.passesAccurate).toBe(500);
    expect(own.duels).toBe(58);
    expect(own.duelsWon).toBe(34);
    expect(own.possessionPct).toBe(48);
    expect(own.losses).toBe(9);
    expect(own.recoveries).toBe(41);
  });

  it("parses dd.mm.yyyy → ISO and keeps the full row in raw", () => {
    const f2own = res.rows.find((r) => r.matchDate === "2026-07-27" && !r.isOpponent)!;
    expect(f2own.opponentName).toBe("ÍBV");
    expect(f2own.competition).toBe("Besta deild");
    expect(f2own.scheme).toBe("4-3-3");
    // raw keeps the unmodelled column verbatim.
    expect(f2own.raw["Odd Col"]).toBe("e");
    expect(f2own.raw["xG"]).toBe(1.23);
  });

  it("reports the unmapped column so the caller can log it", () => {
    expect(res.unmappedHeaders).toContain("Odd Col");
    expect(res.headerRow).toContain("Possession, %");
  });

  it("returns an honest empty parse when no header row is present", () => {
    const empty = parseWyscoutTeamStats([["just", "some", "notes"]], { teamName: "Breiðablik" });
    expect(empty.rows).toHaveLength(0);
    expect(empty.skipped[0].reason).toContain("no header row");
  });
});
