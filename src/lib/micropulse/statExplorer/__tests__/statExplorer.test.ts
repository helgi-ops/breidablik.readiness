import { describe, it, expect } from "vitest";
import { aggregatePlayers, rankLeaderboard, positionLine, type MatchRow, type PlayerRef } from "../index";

const players: PlayerRef[] = [
  { playerId: "p1", name: "Defender A", position: "CB" },
  { playerId: "p2", name: "Midfielder B", position: "CM" },
  { playerId: "p3", name: "Forward C", position: "CF" },
];

// 3 match dates, newest = 2026-08-24. Metrics use BOTH naming forms across imports.
const rows: MatchRow[] = [
  // p1 (defender): strong tackling. Short-code "T" one game, full name "Tackles" another.
  { playerId: "p1", matchDate: "2026-08-24", minutes: 90, metrics: { T: 5, I: 2, "Pass%": 90 } },
  { playerId: "p1", matchDate: "2026-08-16", minutes: 90, metrics: { Tackles: 3, Interceptions: 1, "Passing%": 80 } },
  { playerId: "p1", matchDate: "2026-08-01", minutes: null, metrics: { T: 4, I: 0, "Pass%": 70 } },
  // p2 (mid): fewer tackles, best passer.
  { playerId: "p2", matchDate: "2026-08-24", minutes: 90, metrics: { T: 1, "Pass%": 95, OBV: 0.5 } },
  { playerId: "p2", matchDate: "2026-08-16", minutes: 45, metrics: { T: 1, "Pass%": 91, OBV: 0.3 } },
  // p3 (fwd): goals, only 2 games.
  { playerId: "p3", matchDate: "2026-08-24", minutes: 90, metrics: { Goals: 2, xG: 1.1, Shots: 4 } },
  { playerId: "p3", matchDate: "2026-08-16", minutes: 60, metrics: { Goals: 1, xG: 0.6, Shots: 3 } },
];

describe("positionLine", () => {
  it("maps codes to lines", () => {
    expect(positionLine("CB")).toBe("DEF");
    expect(positionLine("CM")).toBe("MID");
    expect(positionLine("CF")).toBe("FWD");
    expect(positionLine("GK")).toBe("GK");
    expect(positionLine("")).toBe(null);
  });
});

describe("aggregatePlayers — window + alias folding", () => {
  it("aggregates tackles across BOTH naming forms and counts games", () => {
    const { players: aggs, matchDates } = aggregatePlayers(rows, players, null);
    const p1 = aggs.find((a) => a.playerId === "p1")!;
    expect(p1.games).toBe(3);
    expect(p1.byMetric["tackles"].sum).toBe(12);      // 5 + 3 + 4 across T/Tackles
    expect(p1.byMetric["interceptions"].sum).toBe(3); // 2 + 1 + 0 across I/Interceptions
    expect(p1.minutesGames).toBe(2);                  // one game had null minutes
    expect(matchDates.length).toBe(3);
  });

  it("last-2 window keeps only the two newest dates", () => {
    const { players: aggs } = aggregatePlayers(rows, players, 2);
    const p1 = aggs.find((a) => a.playerId === "p1")!;
    expect(p1.games).toBe(2);                         // 2026-08-01 dropped
    expect(p1.byMetric["tackles"].sum).toBe(8);       // 5 + 3
  });
});

describe("rankLeaderboard", () => {
  const { players: aggs } = aggregatePlayers(rows, players, null);

  it("ranks tackles per-game, defender on top", () => {
    const lb = rankLeaderboard(aggs, { metricKey: "tackles", mode: "perGame", minGames: 1 })!;
    expect(lb.rows[0].name).toBe("Defender A");
    expect(lb.rows[0].perGame).toBe(4);               // 12 / 3
    expect(lb.rows[0].total).toBe(12);
  });

  it("per-90 uses minutes and is null when a player has none", () => {
    const lb = rankLeaderboard(aggs, { metricKey: "tackles", mode: "per90", minGames: 1 })!;
    const p1 = lb.rows.find((r) => r.playerId === "p1")!;
    // p1 minutes = 90 + 90 = 180 (one null-minutes game excluded), tackles counted only where present…
    // sum across all 3 games = 12; per90 = 12 / 180 * 90 = 6
    expect(p1.value).toBeCloseTo(6, 5);
    expect(lb.minutesCoverage).toBeGreaterThan(0);
  });

  it("percentage metric is a minutes-weighted mean and ignores the mode", () => {
    const lb = rankLeaderboard(aggs, { metricKey: "pass_pct", mode: "total", minGames: 1 })!;
    expect(lb.mode).toBe("perGame");                  // forced for %
    expect(lb.rows[0].name).toBe("Midfielder B");     // ~93%
    expect(lb.rows[0].value!).toBeGreaterThan(90);
  });

  it("min-games floor and line filter drop players", () => {
    const byLine = rankLeaderboard(aggs, { metricKey: "tackles", mode: "perGame", minGames: 1, line: "DEF" })!;
    expect(byLine.rows.map((r) => r.name)).toEqual(["Defender A"]);
    const floor = rankLeaderboard(aggs, { metricKey: "goals", mode: "total", minGames: 3 })!;
    expect(floor.rows).toHaveLength(0);               // p3 only has 2 games
  });

  it("only ranks players who recorded the metric", () => {
    const lb = rankLeaderboard(aggs, { metricKey: "goals", mode: "total", minGames: 1 })!;
    expect(lb.rows.map((r) => r.name)).toEqual(["Forward C"]);
    expect(lb.rows[0].total).toBe(3);
  });
});
