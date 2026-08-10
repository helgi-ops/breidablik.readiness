import { describe, it, expect } from "vitest";
import { buildBasketballOpponentReport, type OppPlayerGame } from "../basketballOpponentReport";

const pg = (o: Partial<OppPlayerGame> & { gameId: string; playerRef: string; playerName: string }): OppPlayerGame => ({
  gameDate: "2026-01-01", opponent: "Us", homeAway: "home",
  minutes: 25, points: 10, fgm: 4, fga: 8, tpm: 1, tpa: 3, ftm: 1, fta: 2,
  oreb: 1, dreb: 3, reb: 4, assists: 2, steals: 1, blocks: 0, turnovers: 2, fouls: 2, ...o,
});

/** Three games, one dominant scorer who is also a 3pt threat, plus role players. */
function season(): OppPlayerGame[] {
  const rows: OppPlayerGame[] = [];
  for (const g of ["1", "2", "3"]) {
    rows.push(pg({ gameId: g, playerRef: "star", playerName: "Star Guard", points: 28, tpm: 4, tpa: 9, assists: 6, reb: 4 }));
    rows.push(pg({ gameId: g, playerRef: "big", playerName: "Big Man", points: 12, tpm: 0, tpa: 0, reb: 10, oreb: 4, assists: 1 }));
    rows.push(pg({ gameId: g, playerRef: "role", playerName: "Role Player", points: 6, tpm: 1, tpa: 2, reb: 3, assists: 2 }));
  }
  return rows;
}

describe("buildBasketballOpponentReport", () => {
  it("builds a team profile from the summed box scores", () => {
    const r = buildBasketballOpponentReport("Rivals", season());
    expect(r.games).toBe(3);
    expect(r.team.ppg).toBe(46); // 28+12+6 per game
    expect(r.team.oreb).toBeGreaterThan(0);
  });

  it("ranks players by scoring and tags the star as a scorer, threat and playmaker", () => {
    const r = buildBasketballOpponentReport("Rivals", season());
    expect(r.players[0].name).toBe("Star Guard");
    expect(r.players[0].tags).toContain("primary_scorer");
    expect(r.players[0].tags).toContain("three_point_threat");
    expect(r.players[0].tags).toContain("playmaker");
    expect(r.players[0].scoreShare).toBeGreaterThanOrEqual(0.28);
  });

  it("composes a plain-language descriptor for the star from his own numbers", () => {
    const r = buildBasketballOpponentReport("Rivals", season());
    const star = r.players[0];
    expect(star.descriptor.en).toMatch(/scorer/i);
    expect(star.descriptor.en).toContain(String(star.ppg)); // cites his real PPG
    expect(star.descriptor.en.endsWith(".")).toBe(true);
    expect(star.descriptor.is.length).toBeGreaterThan(0);   // Icelandic present too
  });

  it("tags the big as a glass presence, not a shooter", () => {
    const r = buildBasketballOpponentReport("Rivals", season());
    const big = r.players.find((p) => p.name === "Big Man")!;
    expect(big.tags).toContain("glass");
    expect(big.tags).not.toContain("three_point_threat");
  });

  it("fires the 'one dominant scorer' defend flag citing the star", () => {
    const r = buildBasketballOpponentReport("Rivals", season());
    const flag = r.howToDefend.find((f) => f.id === "one_scorer");
    expect(flag).toBeTruthy();
    expect(flag!.evidence).toContain("Star Guard");
    expect(r.keyPlayers[0].name).toBe("Star Guard");
  });

  it("drops players below the minimum games (noise guard)", () => {
    const rows = season();
    rows.push(pg({ gameId: "1", playerRef: "cameo", playerName: "Cameo", points: 30 })); // 1 game only
    const r = buildBasketballOpponentReport("Rivals", rows);
    expect(r.players.find((p) => p.name === "Cameo")).toBeUndefined();
  });
});
