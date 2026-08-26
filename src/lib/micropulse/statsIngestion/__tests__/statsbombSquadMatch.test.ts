import { describe, it, expect } from "vitest";
import { isStatsbombSquadMatchHeader, parseStatsbombSquadMatch } from "../statsbombSquadMatch";

describe("isStatsbombSquadMatchHeader", () => {
  it("accepts the Squad export (Player + Minutes + Player SBD ID, no Team/Match)", () => {
    expect(isStatsbombSquadMatchHeader(["Player", "Minutes", "Age", "Shots", "OBV", "Player SBD ID"])).toBe(true);
  });
  it("rejects the per-match Match Stats file (has Team, no Minutes/SBD id)", () => {
    expect(isStatsbombSquadMatchHeader(["Team", "Player", "Shots", "xGChain", "OBV"])).toBe(false);
  });
  it("rejects a season/fixture file that carries a Match or Date column", () => {
    expect(isStatsbombSquadMatchHeader(["Player", "Minutes", "Player SBD ID", "Date"])).toBe(false);
  });
});

describe("parseStatsbombSquadMatch — de-normalises per-90 to match totals", () => {
  // Real rows from Breidablik-Squad.csv (per-90 values + actual match minutes).
  const rows = [
    // Full-90 starter: 1 raw shot → 0.9409 per-90 (90/95.6494). De-norm must recover 1.
    { Player: "Kristófer Kristinsson", Minutes: "95.6494", Shots: "0.9409", "Goals & Penalty Goals": "0",
      xG: "0.0459", "Key Passes": "0.9409", "Open Play Passes": "28.228", Pressures: "8.4684",
      "Passing%": "18.9299", "Aerial Win%": "0.2", OBV: "-0.0828", Age: "27", Height: "190" },
    // 25-minute sub: 4 raw deep progressions → 14.1383 per-90. De-norm must recover 4, not 14.
    { Player: "Anton Logi Lúdvíksson", Minutes: "25.4627", "Deep Progressions": "14.1383",
      Pressures: "7.0691", xG: "0", "Open Play Passes": "70.6916", "Passing%": "81.2953" },
  ];

  const { players } = parseStatsbombSquadMatch(rows);
  const kris = players.find((p) => p.name.startsWith("Kristófer"))!;
  const sub = players.find((p) => p.name.startsWith("Anton Logi"))!;

  it("recovers whole-number counts for a full-90 starter", () => {
    expect(kris.shots).toBe(1);         // 0.9409 × 95.6494/90 → 1
    expect(kris.keyPasses).toBe(1);
    expect(kris.metrics["Open Play Passes"]).toBe(30); // 28.228 × 1.0628 → 30
    expect(kris.metrics["Pressures"]).toBe(9);          // 8.4684 × 1.0628 → 9
  });

  it("keeps value columns (xG, OBV) at 2 dp", () => {
    expect(kris.xg).toBeCloseTo(0.05, 2);   // 0.0459 × 1.0628
    expect(kris.metrics["OBV"]).toBeCloseTo(-0.09, 2);
  });

  it("does NOT inflate a short-minutes sub — 14.14 per-90 → 4 for the match", () => {
    expect(sub.metrics["Deep Progressions"]).toBe(4);  // 14.1383 × 25.4627/90 → 4
    expect(sub.metrics["Pressures"]).toBe(2);          // 7.0691 × 0.2829 → 2
  });

  it("leaves rates/percentages and static columns untouched", () => {
    expect(kris.metrics["Passing%"]).toBeCloseTo(18.93, 1);
    expect(kris.metrics["Aerial Win%"]).toBeCloseTo(0.2, 2);
    expect(kris.metrics["Age"]).toBe(27);
    expect(kris.metrics["Height"]).toBe(190);
    expect(kris.metrics["Minutes"]).toBeCloseTo(95.65, 1);
  });

  it("skips players with no minutes (can't de-normalise)", () => {
    const { players: p2 } = parseStatsbombSquadMatch([{ Player: "DNP", Minutes: "0", Shots: "1" }]);
    expect(p2).toHaveLength(0);
  });
});
