import { describe, it, expect } from "vitest";
import { buildBasketballSeason, type GameTotals, type SeasonInput } from "../basketballSeason";

const g = (o: Partial<GameTotals> & { gameId: string }): GameTotals => ({
  date: "2026-01-01", opponent: "Rivals", homeAway: "home",
  pts: 80, fgm: 30, fga: 60, tpm: 8, tpa: 24, ftm: 12, fta: 16,
  oreb: 10, dreb: 25, reb: 35, ast: 18, stl: 6, blk: 3, tov: 12, fouls: 18, ...o,
});

describe("buildBasketballSeason", () => {
  it("computes season averages and shooting percentages", () => {
    const input: SeasonInput = { games: [g({ gameId: "1", pts: 80, fgm: 30, fga: 60 }), g({ gameId: "2", pts: 70, fgm: 28, fga: 62 })], results: {} };
    const s = buildBasketballSeason(input);
    expect(s.gamesPlayed).toBe(2);
    expect(s.averages.pts).toBe(75);
    expect(s.averages.fgPct).toBe(47.5); // (30+28)/(60+62) = 58/122
  });

  it("orders per-game chronologically and computes per-game FG%", () => {
    const input: SeasonInput = { games: [g({ gameId: "2", date: "2026-02-01" }), g({ gameId: "1", date: "2026-01-01" })], results: {} };
    const s = buildBasketballSeason(input);
    expect(s.perGame.map((p) => p.gameId)).toEqual(["1", "2"]);
    expect(s.perGame[0].fgPct).toBe(50);
  });

  it("splits home vs away", () => {
    const input: SeasonInput = { games: [g({ gameId: "1", homeAway: "home", pts: 90 }), g({ gameId: "2", homeAway: "away", pts: 70 })], results: {} };
    const s = buildBasketballSeason(input);
    expect(s.homeAway.home.pts).toBe(90);
    expect(s.homeAway.away.pts).toBe(70);
  });

  it("has no record until a result is entered", () => {
    const s = buildBasketballSeason({ games: [g({ gameId: "1" })], results: {} });
    expect(s.record).toBeNull();
    expect(s.winLoss).toBeNull();
    expect(s.resultsEntered).toBe(0);
  });

  it("computes record, margin and win/loss box-score splits from entered opponent scores", () => {
    const input: SeasonInput = {
      games: [
        g({ gameId: "1", pts: 85, tov: 8 }),   // for 85
        g({ gameId: "2", pts: 70, tov: 20 }),  // for 70
        g({ gameId: "3", pts: 90, tov: 10 }),  // for 90
      ],
      results: { "1": { pointsFor: null, pointsAgainst: 80 }, "2": { pointsFor: null, pointsAgainst: 78 }, "3": { pointsFor: null, pointsAgainst: 88 } },
    };
    const s = buildBasketballSeason(input);
    expect(s.record).toEqual({ wins: 2, losses: 1, ties: 0 });
    expect(s.resultsEntered).toBe(3);
    // wins had lower turnovers (8, 10 → avg 9) than the loss (20)
    expect(s.winLoss!.win.tov).toBe(9);
    expect(s.winLoss!.loss.tov).toBe(20);
    const g1 = s.perGame.find((p) => p.gameId === "1")!;
    expect(g1.margin).toBe(5);
    expect(g1.result).toBe("W");
    expect(s.marginSeries).toHaveLength(3);
  });

  it("uses an entered points_for override when the box score is incomplete", () => {
    const s = buildBasketballSeason({ games: [g({ gameId: "1", pts: 0 })], results: { "1": { pointsFor: 77, pointsAgainst: 70 } } });
    expect(s.perGame[0].pointsFor).toBe(77);
    expect(s.perGame[0].result).toBe("W");
  });

  it("builds a per-opponent breakdown ordered by games played", () => {
    const input: SeasonInput = {
      games: [g({ gameId: "1", opponent: "A" }), g({ gameId: "2", opponent: "A" }), g({ gameId: "3", opponent: "B" })],
      results: { "1": { pointsFor: null, pointsAgainst: 70 } }, // A game 1 = win (80 vs 70)
    };
    const s = buildBasketballSeason(input);
    expect(s.byOpponent[0].opponent).toBe("A");
    expect(s.byOpponent[0].games).toBe(2);
    expect(s.byOpponent[0].wins).toBe(1);
  });
});
