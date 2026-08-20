import { describe, it, expect } from "vitest";
import {
  isInstatPlayersSeasonHeader,
  parseInstatPlayersSeason,
  minutesToNumber,
  num,
} from "../statsInstatPlayersCsv";

// Synthetic rows mirroring the real "Players - Njardvik W" season export (no licensed file committed).
const HEADERS = [
  "Jersey number", "Player", "Games played", "Minutes", "Points", "Points per player's possession",
  "Field goals made", "Field goals attempted", "Field goals, %",
  "3-pt field goals made", "3-pt field goals attempted", "3-pt field goals, %",
  "Free throws made", "Free throws attempted", "Free throws, %",
  "Rebounds", "Offensive rebounds", "Defensive rebounds",
  "Assists", "Steals", "Turnovers", "Blocks", "Fouls", "Fouls drawn", "Plus/Minus",
];

const row = (over: Record<string, unknown>): Record<string, unknown> => {
  const base: Record<string, unknown> = {};
  for (const h of HEADERS) base[h] = "-";
  return { ...base, ...over };
};

describe("isInstatPlayersSeasonHeader", () => {
  it("accepts the Players season export (has Games played)", () => {
    expect(isInstatPlayersSeasonHeader(HEADERS)).toBe(true);
  });
  it("rejects a single-game per-player header (no Games played)", () => {
    expect(isInstatPlayersSeasonHeader(["Player", "Points", "Rebounds", "Assists"])).toBe(false);
  });
  it("rejects a lineups header", () => {
    expect(isInstatPlayersSeasonHeader(["Lineup", "Plus/Minus", "Possessions"])).toBe(false);
  });
});

describe("parseInstatPlayersSeason", () => {
  it("maps season averages to catalog keys + the two new InStat fields; drops the total row", () => {
    const { players, skipped } = parseInstatPlayersSeason([
      row({
        "Jersey number": "4", Player: "Danielle Rodriguez", "Games played": "34", Minutes: "35:08",
        Points: "20.6", "Points per player's possession": "1.05",
        "Field goals attempted": "14.6", "Free throws attempted": "6.1",
        "Field goals, %": "47.4%", "3-pt field goals, %": "38%", "Free throws, %": "85.6%",
        Rebounds: "9.2", "Offensive rebounds": "2.6", "Defensive rebounds": "6.6",
        Assists: "5.6", Steals: "1.8", Turnovers: "2.3", Blocks: "0.5", Fouls: "3.3", "Fouls drawn": "6", "Plus/Minus": "6.4",
      }),
      row({ Player: "Average per game", "Games played": "-" }),
    ]);
    expect(skipped.some((s) => s.reason === "not a player row")).toBe(true);
    expect(players).toHaveLength(1);
    const p = players[0];
    expect(p.sourcePlayerRef).toBe("instat:danielle rodriguez");
    expect(p.jersey).toBe("4");
    expect(p.games).toBe(34);
    // minutes total = 35:08/game x 34 ≈ 1195
    expect(p.minutesTotal).toBe(Math.round(minutesToNumber("35:08")! * 34));
    expect(p.metrics["Points per game"]).toBeCloseTo(20.6, 4);
    expect(p.metrics["Plus/Minus per game"]).toBeCloseTo(6.4, 4);
    expect(p.metrics["Points per possession"]).toBeCloseTo(1.05, 4);
    expect(p.metrics["Rebounds per game"]).toBeCloseTo(9.2, 4);
    expect(p.metrics["Field goals %"]).toBeCloseTo(47.4, 4);
    // Assist-to-turnover derived from per-game assists/turnovers = 5.6/2.3
    expect(p.metrics["Assist to turnover"]).toBeCloseTo(5.6 / 2.3, 2);
    // True shooting derived: 20.6 / (2 * (14.6 + 0.44*6.1)) * 100
    const ts = 20.6 / (2 * (14.6 + 0.44 * 6.1)) * 100;
    expect(p.metrics["True shooting %"]).toBeCloseTo(Math.round(ts * 10) / 10, 4);
  });

  it("leaves a never-reported metric null (renders '–', never 0)", () => {
    const { players } = parseInstatPlayersSeason([
      row({ Player: "Empty Player", "Games played": "1", Points: "-", Rebounds: "-", Assists: "-", Turnovers: "-" }),
    ]);
    expect(players[0].metrics["Rebounds per game"]).toBeNull();
    expect(players[0].metrics["Assist to turnover"]).toBeNull(); // turnovers absent → null, not 0
    expect(num("-")).toBeNull();
  });
});
