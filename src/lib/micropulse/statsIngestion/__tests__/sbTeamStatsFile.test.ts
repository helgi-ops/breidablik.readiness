import { describe, it, expect } from "vitest";
import { parseSbTeamStatsFile, isSbTeamStatsFileHeader, parseMatchDate } from "../sbTeamStatsFile";

// One real KR row's relevant fields (trailing space on the final-third header is intentional).
const KR_ROW: Record<string, unknown> = {
  Match: "KR Reykjavík vs. Breidablik", Date: "2026-08-16",
  "Cumulative xG": 3.1256900526, "Opposition xG": 2.5530382821, Goals: 3, "Goals Conceded": 3,
  Shots: 22, "Non Penalty Shots Faced": 23, Passes: 410, "Opposition Passes": 447, "Passing%": 0.7024,
  "Non Throw-in Passes Into Final Third ": 53, "Non Throw-in Through Balls": 1, "Non Throw-in Key Passes": 16,
  "Long Balls": 96, "Pressured Long Balls": 20, "Unpressured Long Balls": 76, "Long Ball%": 0.5,
  "Dribble%": 0.6923, "Aggressive Actions": 96, "Ball Recoveries": 63, "Line Breaking Passes": null,
  "Clear Shots": 4, "Opposition Clear Shots": 4, "Counter Attacking Shots": 4, "Opposition Counter Attacking Shots": 3,
  Tackles: 23, Interceptions: 9, Fouls: 14, Clearances: 28, "Touches in box": 59, "Deep Progressions": 42,
  OBV: 3.5562581795, "Pressures in Opposing Half%": 0.5367,
};

describe("isSbTeamStatsFileHeader", () => {
  it("detects the team-level export by its signature columns", () => {
    expect(isSbTeamStatsFileHeader(["Match", "Date", "Cumulative xG", "Pressures"])).toBe(true);
    expect(isSbTeamStatsFileHeader(["Team", "Player", "xG", "OBV"])).toBe(false); // per-player file
  });
});

describe("parseMatchDate", () => {
  it("handles ISO strings, Date objects, Excel serials, and M/D/YY", () => {
    expect(parseMatchDate("2026-08-16")).toBe("2026-08-16");
    expect(parseMatchDate(new Date("2026-08-16T00:00:00.000Z"))).toBe("2026-08-16");
    expect(parseMatchDate("8/16/26")).toBe("2026-08-16");
    expect(parseMatchDate(46250)).toBe("2026-08-16"); // Excel serial
    expect(parseMatchDate(null)).toBeNull();
  });
});

describe("parseSbTeamStatsFile", () => {
  const { matches } = parseSbTeamStatsFile([KR_ROW]);
  const m = matches[0];

  it("splits the match string and reads the date", () => {
    expect(m.homeTeam).toBe("KR Reykjavík");
    expect(m.awayTeam).toBe("Breidablik");
    expect(m.date).toBe("2026-08-16");
  });

  it("maps the wishlist columns (own + against)", () => {
    expect(m.patch.long_ball_pressured).toBe(20);
    expect(m.patch.long_ball_unpressured).toBe(76);
    expect(m.patch.long_balls).toBe(96);
    expect(m.patch.clear_shots).toBe(4);
    expect(m.patch.clear_shots_against).toBe(4);
    expect(m.patch.counter_shots).toBe(4);
    expect(m.patch.counter_shots_against).toBe(3);
    expect(m.patch.aggressive_actions).toBe(96);
    expect(m.patch.def_action_regains).toBe(63);
    expect(m.patch.opposition_passes).toBe(447);
    expect(m.patch.passes_final_third).toBe(53); // trailing-space header matched via trim
  });

  it("scales fraction percentages to 0–100", () => {
    expect(m.patch.passing_pct).toBeCloseTo(70.2, 1);
    expect(m.patch.dribble_pct).toBeCloseTo(69.2, 1);
    expect(m.patch.long_ball_pct).toBeCloseTo(50, 1);
    expect(m.patch.pressures_opp_half_pct).toBeCloseTo(53.7, 1);
  });

  it("leaves an empty column null (e.g. Line Breaking Passes)", () => {
    expect(m.patch.line_breaks).toBeNull();
  });
});
