import { describe, it, expect } from "vitest";
import { parseStatsbombMatchStats, isStatsbombMatchStatsHeader } from "../statsbombMatchStatsCsv";

describe("StatsBomb per-match Match Stats CSV (player grain)", () => {
  it("detects its header and rejects the season Squad / Team Stats headers", () => {
    expect(isStatsbombMatchStatsHeader(["Team", "Player", "Shots", "xG", "xGChain", "OBV", "Pressures"])).toBe(true);
    expect(isStatsbombMatchStatsHeader(["Player", "Player SBD ID", "OBV", "Minutes"])).toBe(false); // Squad season
    expect(isStatsbombMatchStatsHeader(["Team Name", "Non Penalty xG", "OBV"])).toBe(false);        // Team Stats
    expect(isStatsbombMatchStatsHeader(["Name", "Team", "Non Penalty xG"])).toBe(false);            // scout Player Stats
  });

  it("parses per-player rows for both teams and keeps the full metric bag", () => {
    const rows = [
      { Team: "FH", Player: "A. Player", Shots: "4", Goals: "1", xG: "0.23", KP: "2", Assists: "0", "OP Pass": "18", xGChain: "0.68", OBV: "0.92", Pressures: "14" },
      { Team: "KR Reykjavík", Player: "Aron Sigurðarson", Shots: "7", Goals: "0", xG: "0.6214", KP: "6", Assists: "0", "OP Pass": "56", xGChain: "2.478", OBV: "0.294", Pressures: "8" },
    ];
    const p = parseStatsbombMatchStats(rows);
    expect(p.teams).toEqual(["FH", "KR Reykjavík"]);
    expect(p.players.length).toBe(2);
    const aron = p.players.find((x) => x.name === "Aron Sigurðarson")!;
    expect(aron.teamName).toBe("KR Reykjavík");
    expect(aron.shots).toBe(7);
    expect(aron.xg).toBeCloseTo(0.6214, 3);
    expect(aron.keyPasses).toBe(6);
    expect(aron.passes).toBe(56);              // from OP Pass
    expect(aron.metrics["xGChain"]).toBeCloseTo(2.478, 2);
    expect(aron.metrics["OBV"]).toBeCloseTo(0.294, 2);
    expect(aron.metrics["Team"]).toBeUndefined(); // Team/Player never enter the metric bag
  });
});
