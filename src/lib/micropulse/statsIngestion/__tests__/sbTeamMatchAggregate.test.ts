import { describe, it, expect } from "vitest";
import { aggregateSbTeamMatchStats, type AggPlayer } from "../sbTeamMatchAggregate";

const A: AggPlayer = {
  keyPasses: 3, assists: 1,
  metrics: { "OP F3 Pass": 10, "TB": 1, "LB": 6, "KP": 3, "xG Assist": 0.2, "T": 2, "I": 1, "Fouls": 1, "Clear": 0, "AerWin": 2, "Aer%": 50, "Drib": 3, "Disp": 1, "Cross": 4, "Cross%": 50 },
};
const B: AggPlayer = {
  keyPasses: 1, assists: 0,
  metrics: { "OP F3 Pass": 6, "TB": 0, "LB": 3, "KP": 1, "xG Assist": 0.1, "T": 1, "I": 0, "Fouls": 0, "Clear": 2, "AerWin": 0, "Aer%": 0, "Drib": 1, "Disp": 0, "Cross": 2, "Cross%": 0 },
};

describe("aggregateSbTeamMatchStats", () => {
  const t = aggregateSbTeamMatchStats([A, B]);

  it("sums the counting stats to team totals", () => {
    expect(t.passes_final_third).toBe(16);
    expect(t.line_breaks).toBe(9);
    expect(t.through_balls).toBe(1);
    expect(t.key_passes).toBe(4);
    expect(t.assists).toBe(1);
    expect(t.xg_assist).toBeCloseTo(0.3, 5);
    expect(t.tackles).toBe(3);
    expect(t.interceptions).toBe(1);
    expect(t.clearances).toBe(2);
    expect(t.dribbles).toBe(4);
    expect(t.dispossessed).toBe(1);
  });

  it("reconstructs aerials contested from won ÷ win%", () => {
    // A: 2 won at 50% → 4 contested; B: 0 won → +0. Team won 2, total 4.
    expect(t.aerials_won).toBe(2);
    expect(t.aerials_total).toBe(4);
  });

  it("weights cross completion % by attempts", () => {
    // attempts 4+2=6; completed 4*0.5 + 2*0 = 2 → 33.3%
    expect(t.cross_pct).toBeCloseTo(33.3, 1);
  });

  it("returns null for a metric no player carried (leaves existing value untouched)", () => {
    const none = aggregateSbTeamMatchStats([{ metrics: {} }]);
    expect(none.line_breaks).toBeNull();
    expect(none.tackles).toBeNull();
    expect(none.cross_pct).toBeNull();
    expect(none.aerials_won).toBeNull();
  });
});
