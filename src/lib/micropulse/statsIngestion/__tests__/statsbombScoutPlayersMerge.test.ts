import { describe, it, expect } from "vitest";
import { mergeStatsbombScoutPlayerFiles, isStatsbombScoutPlayerHeader } from "../statsbombScoutPlayers";

describe("isStatsbombScoutPlayerHeader", () => {
  it("accepts EVERY category file (Name+Team+Minutes), not just the shooting one", () => {
    expect(isStatsbombScoutPlayerHeader(["Name", "Team", "Minutes", "Non Penalty xG"])).toBe(true); // shooting
    expect(isStatsbombScoutPlayerHeader(["Name", "Team", "Minutes", "Pressures", "Counterpressures"])).toBe(true); // pressing
    expect(isStatsbombScoutPlayerHeader(["Name", "Team", "Minutes", "OBV", "Pass OBV"])).toBe(true); // obv
    expect(isStatsbombScoutPlayerHeader(["Name", "Team", "Minutes", "Tackles", "Interceptions"])).toBe(true); // defending
  });
  it("rejects the Squad export (keyed on Player) and team files", () => {
    expect(isStatsbombScoutPlayerHeader(["Player", "Player SBD ID", "Minutes", "OBV"])).toBe(false);
    expect(isStatsbombScoutPlayerHeader(["Team Name", "xG", "PPDA"])).toBe(false);
  });
});

// Two StatsBomb category exports for the same squad, keyed on Name — one shooting, one OBV.
const shooting = [
  { Name: "Kennie Chopart", Team: "Fram", Minutes: 1702, "Non Penalty xG": 0.25, "Non Penalty Shots": 2.64, "Goals & Pen Goals": 0.48 },
  { Name: "Simon Tibbling", Team: "Fram", Minutes: 875, "Non Penalty xG": 0.03, "Non Penalty Shots": 0.31, "Goals & Pen Goals": 0.1 },
];
const obv = [
  { Name: "Kennie Chopart", Team: "Fram", Minutes: 1702, OBV: 0.45, "Pass OBV": 0.22, "Deep Progressions": 5.18, Tackles: 2.54 },
  { Name: "Simon Tibbling", Team: "Fram", Minutes: 875, OBV: 0.14, "Pass OBV": 0.07, "Deep Progressions": 7.2, Tackles: 1.75 },
];

describe("mergeStatsbombScoutPlayerFiles", () => {
  const players = mergeStatsbombScoutPlayerFiles([shooting, obv], { teamName: "Fram" });

  it("unions category columns into one rich bag per player", () => {
    const k = players.find((p) => p.player_name === "Kennie Chopart")!;
    expect(k).toBeTruthy();
    expect(k.metrics).not.toBeNull();
    // metrics from BOTH files present
    expect(k.metrics!["Non Penalty xG"]).toBe(0.25);
    expect(k.metrics!["OBV"]).toBe(0.45);
    expect(k.metrics!["Deep Progressions"]).toBe(5.18);
    expect(k.metrics!["Tackles"]).toBe(2.54);
  });

  it("keeps one row per player and derives minutes / totals", () => {
    expect(players).toHaveLength(2);
    const k = players.find((p) => p.player_name === "Kennie Chopart")!;
    expect(k.minutes).toBe(1702);
    // xg = per90 0.25 × 1702/90 ≈ 4.73
    expect(k.xg).toBeCloseTo(4.73, 1);
  });
});
