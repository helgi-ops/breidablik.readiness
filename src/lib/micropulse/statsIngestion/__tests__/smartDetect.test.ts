import { describe, it, expect } from "vitest";
import { detectStatsFile } from "../smartDetect";
import { computeCoverage } from "../statsCoverage";

// The exact header of the coach's StatsBomb IQ "Player Stats" export (per-90 season).
const PLAYER_STATS_HEADER = ["Name", "Team", "Minutes", "Goals & Pen Goals", "Non Penalty Goals", "Non Penalty xG", "Non Penalty Shots", "Assists", "xG Assisted", "Key Passes", "Dribbles", "Tackles", "Interceptions", "Pressures", "Passing%", "xGChain", "OBV", "Pass OBV", "Shot OBV"];

describe("detectStatsFile", () => {
  it("classifies the StatsBomb Player Stats export as per-player season (auto-import)", () => {
    const d = detectStatsFile(PLAYER_STATS_HEADER);
    expect(d.kind).toBe("sb_squad_season");
    expect(d.provider).toBe("statsbomb");
    expect(d.autoImport).toBe(true);
  });

  it("classifies the classic Squad export (Player + Player SBD ID)", () => {
    const d = detectStatsFile(["Player", "Player SBD ID", "Minutes", "Non Penalty xG", "OBV"]);
    expect(d.kind).toBe("sb_squad_season");
  });

  it("classifies every-fixture team totals (Match + Opposition markers) and routes them", () => {
    const d = detectStatsFile(["Team", "Match", "Date", "Goals", "xG", "OBV", "Opposition xG", "Opposition Passes"]);
    expect(d.kind).toBe("sb_team_match_season");
    expect(d.autoImport).toBe(false);
    expect(d.routeHint).toMatch(/Season Match/);
  });

  it("routes the single-match team summary (Team name + Possession %, no Match)", () => {
    const d = detectStatsFile(["Team name", "Goals", "xG", "Shots", "Possession %", "Pass Completion %"]);
    expect(d.kind).toBe("sb_team_match_single");
    expect(d.autoImport).toBe(false);
    expect(d.routeHint).toMatch(/Single Match/);
  });

  it("routes the season Team Stats profile (Team Name + SB tell)", () => {
    const d = detectStatsFile(["Team Name", "OBV", "Non Penalty xG", "Set Piece xG"]);
    expect(d.kind).toBe("sb_team_season");
    expect(d.autoImport).toBe(false);
  });

  it("classifies a Wyscout player list", () => {
    const d = detectStatsFile(["Player", "Team", "Minutes played", "Goals", "Assists", "xG", "Accurate passes, %"]);
    expect(d.kind).toBe("wyscout_player");
    expect(d.provider).toBe("wyscout");
    expect(d.autoImport).toBe(true);
  });

  it("returns unknown for an unrelated CSV", () => {
    expect(detectStatsFile(["foo", "bar", "baz"]).kind).toBe("unknown");
  });

  it("keeps a one-team, no-Match file as a season squad", () => {
    const rows = [
      { Name: "Aron Bjarnason", Team: "Breidablik", Minutes: "764", OBV: "0.4" },
      { Name: "Ivar Arnason", Team: "Breidablik", Minutes: "1505", OBV: "0.1" },
    ];
    const d = detectStatsFile(["Name", "Team", "Minutes", "OBV", "Non Penalty xG"], rows);
    expect(d.kind).toBe("sb_squad_season");
    expect(d.autoImport).toBe(true);
  });

  it("reclassifies a two-team, no-Match file as a single-match squad (both teams)", () => {
    const rows = [
      { Name: "Aron Bjarnason", Team: "Breidablik", Minutes: "94", OBV: "0.4" },
      { Name: "Bjarni Mark Antonsson", Team: "Valur", Minutes: "94", OBV: "0.2" },
    ];
    const d = detectStatsFile(["Name", "Team", "Minutes", "OBV", "Non Penalty xG"], rows);
    expect(d.kind).toBe("sb_match_report_squad");
    expect(d.autoImport).toBe(false);
    expect(d.routeHint).toMatch(/Single Match/);
  });
});

describe("computeCoverage", () => {
  it("reports OBV present and Set Piece xG missing for the Player Stats file", () => {
    const c = computeCoverage("sb_squad_season", PLAYER_STATS_HEADER);
    expect(c.present).toContain("OBV");
    expect(c.present).not.toContain("Team"); // identity column ignored
    // The file has no set-piece column, so the set-piece-dependent notes don't apply
    // to the per-player catalog; but a missing high-value col surfaces a lostFeature.
    expect(c.presentCount).toBeGreaterThan(0);
    expect(c.catalogCount).toBeGreaterThan(0);
  });

  it("flags Set Piece xG as a lost feature when a team-match file lacks it", () => {
    const header = ["Team", "Match", "Date", "Goals", "xG", "Shots", "Passing%"]; // no OBV / Set Piece xG
    const c = computeCoverage("sb_team_match_season", header);
    expect(c.missing).toContain("OBV");
    expect(c.missing).toContain("Set Piece xG");
    expect(c.lostFeatures.some((f) => f.column === "OBV")).toBe(true);
    expect(c.lostFeatures.some((f) => f.column === "Set Piece xG")).toBe(true);
  });

  it("treats 'Goals & Pen Goals' as satisfying the 'Goals & Penalty Goals' catalog entry", () => {
    const c = computeCoverage("sb_squad_season", PLAYER_STATS_HEADER);
    expect(c.missing).not.toContain("Goals & Penalty Goals");
  });
});
