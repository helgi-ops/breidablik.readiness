import { describe, it, expect } from "vitest";
import {
  parseScoutGames, parseScoutPlayers, parseScoutLineups,
  teamProfileFromGames, buildInstatOpponentScout,
  type InstatOpponentPayload,
} from "../scoutInstatOpponent";
import { playerTendencyNotes } from "../../basketballOpponentReport";

// Rows mirror the real InStat opponent season exports (header strings verified against
// a live "Armann W" export: Games "Box score", Players "Box score", Lineups "Lineups").

const gamesRows: Record<string, unknown>[] = [
  {
    Date: "10/21", Opponent: "@ KR Reykjavik", Score: "89:102", Possessions: 101, Points: 89,
    "Points per possession": 0.91, "Field goals made": 24, "Field goals attempted": 64,
    "3-pt field goals made": 8, "3-pt field goals attempted": 22, "Free throws made": 33, "Free throws attempted": 41,
    Rebounds: 32, "Offensive rebounds": 8, "Defensive rebounds": 24, Assists: 16, Steals: 10, Turnovers: 16, Blocks: 3,
    "PnR Handlers made": 4, "PnR Handlers attempted": 9, "Isolations made": 2, "Isolations attempted": 8,
    "Catch and shoot made": 3, "Catch and shoot attempted": 14, "Drives made": 4, "Drives with shot": 16,
    "Uncontested field goals made": 1, "Uncontested field goals": 1, "Contested field goals made": 22, "Contested field goals": 62,
    "Offensive rating": 88.1, "Defensive rating": 101, "Net rating": -12.9,
    "Effective field goal percentage": 43.8, "True shooting percentage": 60.9,
  },
  {
    Date: "10/13", Opponent: "vs Valur", Score: "78:89", Possessions: 97, Points: 78,
    "Points per possession": 0.82, "Field goals made": 31, "Field goals attempted": 74,
    "3-pt field goals made": 8, "3-pt field goals attempted": 25, "Free throws made": 8, "Free throws attempted": 11,
    Rebounds: 31, "Offensive rebounds": 9, "Defensive rebounds": 22, Assists: 23, Steals: 9, Turnovers: 16, Blocks: 3,
    "PnR Handlers made": 5, "PnR Handlers attempted": 11, "Isolations made": 2, "Isolations attempted": 6,
    "Catch and shoot made": 6, "Catch and shoot attempted": 15, "Drives made": 5, "Drives with shot": 9,
    "Uncontested field goals made": 2, "Uncontested field goals": 4, "Contested field goals made": 28, "Contested field goals": 69,
    "Offensive rating": 80.4, "Defensive rating": 87.3, "Net rating": -6.8,
    "Effective field goal percentage": 47.3, "True shooting percentage": 51,
  },
  // The summary row InStat appends — must be skipped.
  { Date: null, Opponent: "Average per game", Score: null, Possessions: 99, Points: 83 },
];

const playerRows: Record<string, unknown>[] = [
  {
    "Jersey number": "3", Player: "Diamond Battles", "Games played": 4, Minutes: "35:46", Points: 23.3,
    "Field goals made": 7.5, "Field goals attempted": 18.3, "Field goals, %": "41.1%",
    "3-pt field goals made": 2.5, "3-pt field goals attempted": 6.3, "3-pt field goals, %": "40%",
    "2-pt field goals made": 5, "2-pt field goals attempted": 12, "2-pt field goals, %": "41.7%",
    "Free throws made": 5.8, "Free throws attempted": 7, "Free throws, %": "82.1%",
    Rebounds: 3.3, "Offensive rebounds": 1, "Defensive rebounds": 2.3, Assists: 4.3, Steals: 1.5, Turnovers: 6, Blocks: 0.8,
    "Plus/Minus": -18.7, "Usage Percentage": "29.6%",
    // Drive direction from the ATTEMPT counts (not the make-% columns, which collide on norm).
    "Drives with shot": 4.5, "Right drives": 2.8, "Right drives made": 0.3, "Left drives": 1.8, "Left drives made": 1,
    // Defence: opponents' shot mix against her + overall shooting allowed.
    "Opponent's field goals made": 5.3, "Opponent's field goals attempted": 11, "Opponent's field goals, %": "47.7%",
    "Opp Transition shots made": 1.5, "Opp Transition shots": 2,
    "Opp catch and shoot shots made": 0.5, "Opp catch and shoot shots": 2.8,
    "Opp Drives shots made": 0.8, "Opp Drives shots": 2.3,
  },
  {
    "Jersey number": "4", Player: "Edyta Falenczyk", "Games played": 4, Minutes: "31:17", Points: 15.5,
    "Field goals made": 5, "Field goals attempted": 13.8, "Field goals, %": "36.4%",
    "3-pt field goals made": 1.3, "3-pt field goals attempted": 4.5, "3-pt field goals, %": "27.8%",
    "2-pt field goals made": 3.8, "2-pt field goals attempted": 9.3, "2-pt field goals, %": "40.5%",
    "Free throws made": 4.3, "Free throws attempted": 4.8, "Free throws, %": "89.5%",
    Rebounds: 6.3, "Offensive rebounds": 1.5, "Defensive rebounds": 4.8, Assists: 2, Steals: 4, Turnovers: 4.5, Blocks: 0.8,
    "Plus/Minus": -14.5, "Usage Percentage": "23.5%",
  },
  // Only 1 game → dropped by MIN_PLAYER_GAMES.
  { "Jersey number": "12", Player: "Audur Hreinsdottir", "Games played": 1, Minutes: "01:37", Points: 0 },
  { Player: "Average per game", "Games played": 4, Points: 55 }, // summary-ish, skipped by isPlayerRow? name 'average' → skipped
];

const lineupRows: Record<string, unknown>[] = [
  { Lineup: "9 R. Bjork, 8 J. Karlsdottir, 3 D. Battles, 14 E. Falenczyk, 15 M. Sirovina", "Plus/Minus": -0.7, Minutes: "14:03", Possessions: 31.7, Points: 28, "Field goals, %": "40.3%" },
  { Lineup: "8 J. Karlsdottir, 11 B. Snorradottir, 3 D. Battles, 14 E. Falenczyk, 21 A. Hjalmarsdottir", "Plus/Minus": 6, Minutes: "08:21", Possessions: 20, Points: 23, "Field goals, %": "57.1%" },
  { Lineup: "Total", "Plus/Minus": 0, Minutes: "40:00" },
];

describe("parseScoutGames", () => {
  it("parses game rows and skips the average row", () => {
    const games = parseScoutGames(gamesRows, "2026-2027");
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ opponent: "KR Reykjavik", homeAway: "away", points: 89, result: "L" });
    expect(games[1]).toMatchObject({ opponent: "Valur", homeAway: "home", points: 78 });
    // 10/21 in a 2026-2027 season → October = first year.
    expect(games[0].date).toBe("2026-10-21");
    // Playtypes land as pt_*_m / pt_*_a for aggregateAdvancedShots.
    expect(games[0].advanced.pt_pnrHandler_m).toBe(4);
    expect(games[0].advanced.pt_pnrHandler_a).toBe(9);
    expect(games[0].advanced.eff_contestedFg_a).toBe(62);
  });
});

describe("teamProfileFromGames", () => {
  it("averages the box across games", () => {
    const profile = teamProfileFromGames(parseScoutGames(gamesRows, "2026-2027"));
    expect(profile.games).toBe(2);
    expect(profile.ppg).toBeCloseTo(83.5, 1);         // (89+78)/2
    expect(profile.awayPpg).toBeCloseTo(89, 1);
    expect(profile.homePpg).toBeCloseTo(78, 1);
    expect(profile.fgPct).toBeCloseTo(39.9, 1);        // (24+31)/(64+74)
  });
});

describe("parseScoutPlayers", () => {
  it("parses season averages and refs, keeping tendencies", () => {
    const players = parseScoutPlayers(playerRows);
    const names = players.map((p) => p.name);
    expect(names).toContain("Diamond Battles");
    expect(names).not.toContain("Average per game");
    const battles = players.find((p) => p.name === "Diamond Battles")!;
    expect(battles.ref).toBe("instat:diamondbattles");
    expect(battles.ppg).toBe(23.3);
    expect(battles.usagePct).toBe(29.6);
    // Drive lean from attempts: right 2.8 / (2.8 + 1.8) = 60.9% right.
    expect(battles.driveRightShare).toBeCloseTo(60.9, 1);
    expect(battles.drivesPg).toBe(4.5);
    // Defence: overall FG% allowed + shot mix sorted by attempts (catch&shoot most).
    expect(battles.oppFgPctAllowed).toBe(47.7);
    expect(battles.defense[0].key).toBe("catchShoot");
    expect(battles.defense[0].att).toBe(2.8);
  });
});

describe("parseScoutLineups", () => {
  it("parses units sorted by minutes, skipping totals", () => {
    const lineups = parseScoutLineups(lineupRows);
    expect(lineups).toHaveLength(2);
    expect(lineups[0].minutes).toBeGreaterThan(lineups[1].minutes!);
    expect(lineups[0].members).toHaveLength(5);
  });
});

describe("buildInstatOpponentScout", () => {
  it("builds the report + playtypes + lineups the UI reads", () => {
    const payload: InstatOpponentPayload = {
      season: "2026-2027",
      teamGames: parseScoutGames(gamesRows, "2026-2027"),
      players: parseScoutPlayers(playerRows),
      lineups: parseScoutLineups(lineupRows),
    };
    const scout = buildInstatOpponentScout("Ármann", payload);
    expect(scout.report.opponentName).toBe("Ármann");
    expect(scout.report.games).toBe(2);
    // Battles (23.3 PPG, 4 games) is the top scorer and a primary scorer; the 1-game
    // player is filtered out.
    expect(scout.report.players.map((p) => p.name)).toEqual(["Diamond Battles", "Edyta Falenczyk"]);
    expect(scout.report.players[0].tags).toContain("primary_scorer");
    expect(scout.report.keyPlayers[0].name).toBe("Diamond Battles");
    // Season tendencies flow through to the player for the detailed analysis.
    expect(scout.report.players[0].season).toMatchObject({ usagePct: 29.6, plusMinus: -18.7, oppFgPctAllowed: 47.7 });
    expect(scout.report.players[0].season?.driveRightShare).toBeCloseTo(60.9, 1);
    // Playtypes aggregate across games, ranked by volume.
    expect(scout.playtypes.find((p) => p.key === "pnrHandler")?.att).toBe(20); // 9 + 11
    expect(scout.efficiency.find((e) => e.key === "contestedFg")?.att).toBe(131); // 62 + 69
    expect(scout.lineups).toHaveLength(2);
  });

  it("produces plain-language tendency notes (offense + defense)", () => {
    const payload: InstatOpponentPayload = {
      season: "2026-2027",
      teamGames: parseScoutGames(gamesRows, "2026-2027"),
      players: parseScoutPlayers(playerRows),
      lineups: [],
    };
    const scout = buildInstatOpponentScout("Ármann", payload);
    const notes = playerTendencyNotes(scout.report.players[0], "EN");
    // Usage 29.6% -> "carries the offense" tier; on-court net worded; defence FG% + shot mix.
    expect(notes.offense.some((n) => /carries the offense/i.test(n))).toBe(true);
    expect(notes.offense.some((n) => /outscored by 18\.7/i.test(n))).toBe(true);
    expect(notes.offense.some((n) => /driving right/i.test(n))).toBe(true);
    // Scoring style: 4.5 drives/g + 7 FTA/g -> rim attacker.
    expect(notes.offense.some((n) => /Attacks the rim/i.test(n))).toBe(true);
    expect(notes.defense.some((n) => /47\.7% with them defending/i.test(n))).toBe(true);
    expect(notes.defense.some((n) => /Attacked most off/i.test(n))).toBe(true);
    // Icelandic variant renders too.
    expect(playerTendencyNotes(scout.report.players[0], "IS").defense.length).toBeGreaterThan(0);
  });
});
