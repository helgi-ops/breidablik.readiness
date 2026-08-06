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

describe("parseWyscoutTeamStats — real export layout", () => {
  // The ACTUAL Breiðablik export: header row 0 (no title), the AVERAGE block is
  // two rows whose Team column is empty (Date = "Breidablik"/"Opponents"),
  // multi-value stats live in SEPARATE columns with blank sub-headers
  // ("Shots / on target" → shots in col N, on-target count in col N+1), and the
  // match label is "Home - Away 1:0" (score at the end). Team names carry no ð.
  const H = ["Date", "Match", "Competition", "Duration", "Team", "Scheme", "Goals", "xG",
    "Shots / on target", "", "", "Passes / accurate", "", "", "Possession, %",
    "Losses / Low / Medium / High", "", "", "", "Recoveries / Low / Medium / High", "", "", "", "Duels / won", "", ""];
  const matrix: unknown[][] = [
    H,
    ["Breidablik", null, null, null, null, null, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["Opponents", null, null, null, null, null, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["2026-08-04", "Thór - Breidablik 1:0", "Iceland. Besta-deild karla", 100, "Breidablik", "4-2-3-1 (86.72%)", 0, 2.33, 14, 4, 28.57, 503, 417, 82.9, 62.11, 124, 34, 43, 47, 67, 34, 24, 9, 139, 54, 38.85],
    ["2026-08-04", "Thór - Breidablik 1:0", "Iceland. Besta-deild karla", 100, "Thór", "4-1-4-1 (100.0%)", 1, 2.09, 13, 3, 23.08, 304, 235, 77.3, 37.89, 116, 30, 34, 52, 73, 30, 29, 14, 139, 84, 60.43],
  ];
  const res = parseWyscoutTeamStats(matrix, { teamName: "Breiðablik" });

  it("skips the empty-Team AVERAGE rows and reads one fixture (2 rows)", () => {
    expect(res.fixtures).toBe(1);
    expect(res.rows).toHaveLength(2);
    expect(res.unmappedHeaders).toEqual(["Duration"]); // Duration modelled nowhere → kept in raw
  });

  it("reads secondaries from the adjacent blank-header sub-columns", () => {
    const own = res.rows.find((r) => !r.isOpponent)!;
    expect(own.opponentName).toBe("Thór");
    expect(own.xg).toBeCloseTo(2.33, 5);
    expect(own.goals).toBe(0);
    expect(own.shots).toBe(14);
    expect(own.shotsOnTarget).toBe(4);   // col N+1 (blank header)
    expect(own.passes).toBe(503);
    expect(own.passesAccurate).toBe(417);
    expect(own.possessionPct).toBeCloseTo(62.11, 5);
    expect(own.duels).toBe(139);
    expect(own.duelsWon).toBe(54);
    expect(own.losses).toBe(124);        // primary only; Low/Med/High stay in raw
    expect(own.recoveries).toBe(67);
  });

  it("keeps the opponent row and every sub-column in raw", () => {
    const opp = res.rows.find((r) => r.isOpponent)!;
    expect(opp.xg).toBeCloseTo(2.09, 5);
    expect(opp.possessionPct).toBeCloseTo(37.89, 5); // 62.11 + 37.89 = 100
    const own = res.rows.find((r) => !r.isOpponent)!;
    expect(own.raw["Shots / on target [2]"]).toBe(4);
    expect(own.raw["Losses / Low / Medium / High [2]"]).toBe(34);
    expect(own.raw["Duration"]).toBe(100);
  });
});

describe("infers our team from the file (any club, no hardcoded name)", () => {
  // A Keflavík "Show opponents" export: our side appears in BOTH fixtures, each
  // opponent once. Parsed with NO teamName → must infer "Keflavík", not default to
  // Breiðablik (which would flag every row as opponent → zero own rows).
  const matrix: unknown[][] = [
    ["Match", "Date", "Competition", "Team", "Scheme", "Goals", "xG", "Shots", "Passes", "Possession, %", "Losses", "Recoveries", "Duels", "x"],
    ["Keflavík 2:1 Valur", "04.08.2026", "Besta deild", "Keflavík", "4-3-3", 2, 1.8, "14 / 5", "500 / 450", "54", "10", "40", "55 / 30", "a"],
    ["", "", "", "Valur", "4-4-2", 1, 1.2, "9 / 3", "420 / 370", "46", "12", "35", "52 / 25", "b"],
    ["ÍA 0:3 Keflavík", "27.07.2026", "Besta deild", "ÍA", "4-4-2", 0, 0.9, "8 / 2", "410 / 360", "48", "13", "33", "50 / 24", "c"],
    ["", "", "", "Keflavík", "4-3-3", 3, 2.4, "16 / 7", "540 / 500", "52", "9", "44", "58 / 34", "d"],
  ];

  const res = parseWyscoutTeamStats(matrix); // no teamName → inference

  it("finds both fixtures and marks Keflavík rows as own, opponents as opponent", () => {
    expect(res.fixtures).toBe(2);
    const own = res.rows.filter((r) => !r.isOpponent);
    const opp = res.rows.filter((r) => r.isOpponent);
    expect(own).toHaveLength(2);
    expect(opp).toHaveLength(2);
    // Own rows are the Keflavík ones (xG 1.8 and 2.4); opponents are Valur/ÍA.
    expect(own.map((r) => r.xg).sort()).toEqual([1.8, 2.4]);
    expect(opp.every((r) => r.opponentName === "Keflavík" ? false : true)).toBe(true);
  });
});
