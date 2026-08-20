import { describe, it, expect } from "vitest";
import { isInstatGamesHeader, parseInstatGames, mmddToIso, num } from "../statsInstatGamesCsv";

// Synthetic rows mirroring the real "Games - Njardvik W" export (no licensed file committed).
const HEADERS = [
  "Date", "Opponent", "Score", "Possessions", "Points", "Points per possession",
  "Field goals made", "Field goals attempted", "Field goals %",
  "2-pt field goals made", "2-pt field goals attempted", "2-pt field goals %",
  "3-pt field goals made", "3-pt field goals attempted", "3-pt field goals %",
  "Free throws made", "Free throws attempted", "Free throws %",
  "Rebounds", "Offensive rebounds", "Defensive rebounds",
  "Assists", "Steals", "Turnovers", "Blocks", "Fouls", "Fouls drawn",
];

const row = (over: Record<string, unknown>): Record<string, unknown> => {
  const base: Record<string, unknown> = {};
  for (const h of HEADERS) base[h] = "-";
  return { ...base, ...over };
};

describe("isInstatGamesHeader", () => {
  it("accepts the Games export header", () => {
    expect(isInstatGamesHeader(HEADERS)).toBe(true);
  });
  it("rejects a lineups / players header", () => {
    expect(isInstatGamesHeader(["Lineup", "Plus/Minus", "Possessions"])).toBe(false);
    expect(isInstatGamesHeader(["Player", "Games played", "Points"])).toBe(false);
  });
});

describe("mmddToIso", () => {
  it("infers the year from an autumn→spring season", () => {
    expect(mmddToIso("05/17", "2025-2026")).toBe("2026-05-17"); // spring → later year
    expect(mmddToIso("09/20", "2025-2026")).toBe("2025-09-20"); // autumn → earlier year
  });
  it("passes through ISO and rejects junk", () => {
    expect(mmddToIso("2026-05-17", "2025-2026")).toBe("2026-05-17");
    expect(mmddToIso("-", "2025-2026")).toBeNull();
  });
});

describe("parseInstatGames", () => {
  it("parses home/away, result and derives Four Factors; drops the average row", () => {
    const { games, skipped } = parseInstatGames([
      row({
        Date: "05/17", Opponent: "vs Haukar", Score: "95:70", Possessions: "89", Points: "95",
        "Points per possession": "1.11", "Field goals made": "35", "Field goals attempted": "64",
        "3-pt field goals made": "13", "Free throws made": "12", Turnovers: "14",
      }),
      row({ Date: "05/14", Opponent: "@ Haukar", Score: "69:77", Possessions: "93", Points: "69" }),
      row({ Date: "", Opponent: "Average per game", Score: "-" }),
    ], "2025-2026");

    expect(skipped.some((s) => s.reason === "not a game row")).toBe(true);
    expect(games).toHaveLength(2);

    const g0 = games[0];
    expect(g0.homeAway).toBe("home");
    expect(g0.opponent).toBe("Haukar");
    expect(g0.pointsFor).toBe(95);
    expect(g0.pointsAgainst).toBe(70);
    expect(g0.result).toBe("W");
    expect(g0.matchDate).toBe("2026-05-17");
    // eFG% = (35 + 0.5*13)/64 * 100 = 64.84 → 64.8
    expect(g0.efgPct).toBeCloseTo(64.8, 1);
    // TO% = 14/89 * 100 = 15.73 → 15.7
    expect(g0.toPct).toBeCloseTo(15.7, 1);
    // FTF = 12/64 = 0.1875 → 0.188
    expect(g0.ftf).toBeCloseTo(0.188, 3);
    // PPP from points/possessions = 95/89 = 1.07
    expect(g0.ppp).toBeCloseTo(1.07, 2);

    const g1 = games[1];
    expect(g1.homeAway).toBe("away");
    expect(g1.result).toBe("L");
  });

  it("leaves a never-reported factor null (no attempts → null, not 0)", () => {
    const { games } = parseInstatGames([
      row({ Date: "01/03", Opponent: "vs X", Score: "50:40", Possessions: "80", Points: "50" }),
    ], "2025-2026");
    expect(games[0].efgPct).toBeNull(); // no FGM/FGA/3PM
    expect(num("-")).toBeNull();
    expect(games[0].matchDate).toBe("2026-01-03"); // Jan → later year
  });
});
