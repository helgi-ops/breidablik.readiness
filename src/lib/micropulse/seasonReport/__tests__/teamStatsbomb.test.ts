import { describe, it, expect } from "vitest";
import { buildTeamSeasonStatsbomb, type Sb } from "../teamStatsbomb";

// Breiðablik 2026 own StatsBomb profile vs the built-in League Average (real values —
// the same numbers as the hand-authored PDF the report format is modelled on).
const team_sb: Sb = { gf: 2.06, ga: 1.59, npxg: 1.38, npxgAgainst: 1.54, shots: 13.71, shotsAgainst: 15.53, openPlayXg: 1.02, counterAttackShots: 1.0, passes: 521.35, passingPct: 79, deepCompletions: 5.12, passesInsideBox: 3.41, passObv: 0.69, obv: 1.8, passesInsideBoxAgainst: 3.0, deepCompletionsAgainst: 5.06, highPressShotsConceded: 3.82, shotObvFaced: -0.14, setPieceXg: 0.36, setPieceGoalsAgainst: 0.06, setPieceXgAgainst: 0.34 };
const league_sb: Sb = { gf: 1.94, ga: 1.94, npxg: 1.61, npxgAgainst: 1.61, shots: 15.44, shotsAgainst: 15.44, openPlayXg: 1.23, counterAttackShots: 1.29, passes: 477.65, passingPct: 77, deepCompletions: 5.5, passesInsideBox: 3.52, passObv: 0.84, obv: 2.2, passesInsideBoxAgainst: 3.52, deepCompletionsAgainst: 5.5, highPressShotsConceded: 3.63, shotObvFaced: 0.03, setPieceXg: 0.38, setPieceGoalsAgainst: 0.4, setPieceXgAgainst: 0.38 };

describe("buildTeamSeasonStatsbomb", () => {
  const r = buildTeamSeasonStatsbomb({ team: "Breiðablik", season: "2026", matches: 17, team_sb, league_sb });
  const read = (k: string) => r.rows.find((x) => x.key === k)?.read;

  it("tags the vs-league read in first-person, direction-aware", () => {
    expect(read("goalsConceded")).toBe("strength");        // 1.59 vs 1.94 (lower better)
    expect(read("setPieceGoalsConceded")).toBe("strength"); // 0.06 vs 0.40 — elite defence
    expect(read("npxg")).toBe("below");                    // 1.38 vs 1.61 — create too little
    expect(read("openPlayXg")).toBe("below");
    expect(read("totalObv")).toBe("weak");                 // 1.80 vs 2.20
    expect(read("shotObvFaced")).toBe("weak");             // concede quality
    expect(read("passes")).toBe("above");                  // style — more possession, no value judgement
    expect(read("shotsFaced")).toBe("neutral");            // 15.53 vs 15.44 ≈
  });

  it("computes the headline signals the verdict/facts lean on", () => {
    expect(r.signals.npxgDiff).toBeCloseTo(-0.16, 2);       // 1.38 − 1.54
    expect(r.signals.finishing).toBeCloseTo(0.68, 2);       // 2.06 − 1.38 (overperformance)
    expect(r.signals.chanceCreationRel).toBeCloseTo(1.38 / 1.61, 2);
    expect(r.signals.weaknesses).toContain("npxg");
    expect(r.signals.strengths).toContain("goalsConceded");
  });

  it("emits one row per defined metric, league-aligned", () => {
    expect(r.rows.length).toBe(21);
    expect(r.rows.every((x) => x.dir === "style" || x.value == null || x.league == null || typeof x.rel === "number")).toBe(true);
  });
});
