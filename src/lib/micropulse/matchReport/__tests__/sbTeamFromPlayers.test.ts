import { describe, it, expect } from "vitest";
import { aggregateSbTeamFromPlayers } from "../sbTeamFromPlayers";

// Two players from a StatsBomb "Match Stats" squad CSV (metrics = raw headers).
const rows = [
  { "Pressures": "16", "Cross": "2", "KP": "1", "LB": "3", "TB": "1", "T": "0", "I": "0",
    "OP F3 Pass": "13", "Pass OBV": "0.002413053", "Shot OBV": "-0.09350532", "D&C OBV": "-0.029153002",
    "DA OBV": "0.15269656", "AerWin": "0", "Aer%": "0", "Cross%": "50", "Counterpressures Pressures": "5" },
  { "Pressures": "17", "Cross": "10", "KP": "1", "LB": "0", "TB": "1", "T": "1", "I": "0",
    "OP F3 Pass": "30", "Pass OBV": "0.4605864", "Shot OBV": "0.0018149801", "D&C OBV": "0.20611538",
    "DA OBV": "0.010110602", "AerWin": "2", "Aer%": "50", "Cross%": "30", "Counterpressures Pressures": "4" },
];

describe("aggregateSbTeamFromPlayers", () => {
  it("sums the clean counting stats + OBV components across the squad", () => {
    const t = aggregateSbTeamFromPlayers(rows);
    expect(t.pressures).toBe(33);
    expect(t.counterpressures).toBe(9);
    expect(t.crosses).toBe(12);
    expect(t.key_passes).toBe(2);
    expect(t.long_balls).toBe(3);
    expect(t.tackles).toBe(1);
    expect(t.passes_final_third).toBe(43);
    expect(t.pass_obv).toBeCloseTo(0.46, 2);   // rounded to 2dp
    expect(t.def_action_obv).toBeCloseTo(0.16, 2);
    expect(t.aerials_won).toBe(2);
  });

  it("reconstructs aerial contested count from win% (won ÷ pct)", () => {
    const t = aggregateSbTeamFromPlayers(rows);
    // player 2: 2 won at 50% → 4 contested; player 1: 0 won → 0. total 4.
    expect(t.aerials_total).toBe(4);
  });

  it("weights cross completion % by attempts", () => {
    const t = aggregateSbTeamFromPlayers(rows);
    // made = 2*0.5 + 10*0.3 = 4 ; att = 12 → 33.33%
    expect(t.cross_pct).toBeCloseTo(33.33, 1);
  });

  it("returns nothing for an empty squad", () => {
    expect(aggregateSbTeamFromPlayers([])).toEqual({});
  });
});
