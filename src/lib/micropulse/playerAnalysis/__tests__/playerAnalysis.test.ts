import { describe, it, expect } from "vitest";
import { buildPlayerAnalysis, type PlayerRow } from "../index";

const P = (name: string, minutes: number, m: Record<string, number>): PlayerRow => ({ name, minutes, goals: null, assists: null, xg: null, metrics: m });

// A tiny squad: a clear attacker (Striker), a ball-progressor (Playmaker), two defenders.
const squad: PlayerRow[] = [
  P("Striker", 1000, { "Non Penalty xG": 0.56, "Shots": 3.0, "Touches in box": 8.7, "OBV": 0.47, "Deep Progressions": 1.8, "Passing%": 0.75, "Defensive Action OBV": 0.02, "Tackles": 0.5, "Interceptions": 0.1, "Ball Recoveries": 2.8, "Pressures": 17 }),
  P("Playmaker", 1000, { "Non Penalty xG": 0.05, "Shots": 0.6, "Touches in box": 1.5, "OBV": 0.44, "Dribble & Carry OBV": 0.17, "Pass OBV": 0.22, "Deep Progressions": 6.1, "Deep Completions": 1.3, "Passing%": 0.90, "Defensive Action OBV": 0.03, "Tackles": 1.5, "Interceptions": 0.1, "Ball Recoveries": 5.0, "Pressures": 20 }),
  P("Defender A", 1000, { "Non Penalty xG": 0.04, "Shots": 0.4, "Touches in box": 1.3, "OBV": 0.21, "Deep Progressions": 4.4, "Passing%": 0.86, "Defensive Action OBV": 0.10, "Tackles": 1.5, "Interceptions": 0.8, "Ball Recoveries": 2.8, "Pressures": 5 }),
  P("Defender B", 1000, { "Non Penalty xG": 0.03, "Shots": 0.4, "Touches in box": 0.3, "OBV": -0.07, "Deep Progressions": 2.9, "Passing%": 0.82, "Defensive Action OBV": -0.09, "Tackles": 1.6, "Interceptions": 0.9, "Ball Recoveries": 5.2, "Pressures": 13 }),
];

describe("buildPlayerAnalysis", () => {
  it("ranks the striker top on attacking metrics and classifies the role", () => {
    const r = buildPlayerAnalysis({ player: "Striker", squad })!;
    expect(r.poolSize).toBe(4);
    const npxg = r.metrics.find((m) => m.key === "Non Penalty xG")!;
    expect(npxg.percentile).toBe(100);                       // highest npxG in the pool
    expect(r.strengths.some((m) => m.key === "Non Penalty xG")).toBe(true);
    expect(r.role).toBe("attacking");
  });

  it("finds a ball-progressor's strength in possession", () => {
    const r = buildPlayerAnalysis({ player: "Playmaker", squad })!;
    const dp = r.metrics.find((m) => m.key === "Deep Progressions")!;
    expect(dp.percentile).toBe(100);                          // top deep progressions
    expect(r.role).toBe("possession");
  });

  it("flags weaknesses in the bottom quartile", () => {
    const r = buildPlayerAnalysis({ player: "Defender B", squad })!;
    // lowest total OBV → bottom quartile weakness.
    expect(r.weaknesses.some((m) => m.key === "OBV")).toBe(true);
  });

  it("excludes low-minute players from the pool but still analyses the picked one", () => {
    const withCameo = [...squad, P("Cameo", 20, { "Non Penalty xG": 5, "OBV": 5 })];
    const r = buildPlayerAnalysis({ player: "Striker", squad: withCameo, minMinutes: 300 })!;
    expect(r.poolSize).toBe(4);                               // cameo excluded from the pool
    const cameo = buildPlayerAnalysis({ player: "Cameo", squad: withCameo, minMinutes: 300 })!;
    expect(cameo.poolSize).toBe(5);                           // but the picked player is included
  });

  it("returns null for an unknown player", () => {
    expect(buildPlayerAnalysis({ player: "Nobody", squad })).toBeNull();
  });
});
