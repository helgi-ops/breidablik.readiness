import { describe, it, expect } from "vitest";
import { buildMatchReview, buildMatchAnalysis, type ReviewPlayer, type TeamMatchNumbers } from "../index";

const P = (name: string, o: Partial<ReviewPlayer>): ReviewPlayer => ({
  name, goals: null, assists: null, xg: null, shots: null, keyPasses: null, xgAssisted: null, xgChain: null, tackles: null, interceptions: null, ...o,
});

describe("buildMatchReview", () => {
  const players = [
    P("Arnar Bjarki", { goals: 0, xg: 0.88, shots: 1, keyPasses: 1, xgAssisted: 0.11, xgChain: 1.0, tackles: 2, interceptions: 1 }),
    P("Hlynur Freyr", { goals: 1, xg: 0.16, shots: 2, keyPasses: 0, xgAssisted: 0, xgChain: 0.42 }),
    P("Kristinn Jónsson", { goals: 0, xg: 0, shots: 0, keyPasses: 2, xgAssisted: 0.30, xgChain: 0.22, tackles: 3, interceptions: 2 }),
    P("Óli Valur", { goals: 0, xg: 0.15, shots: 2, keyPasses: 1, xgAssisted: 0.04, xgChain: 1.44 }),
  ];

  it("sums the team's attacking output and finishing", () => {
    const r = buildMatchReview(players);
    expect(r.players).toBe(4);
    expect(r.team.shots).toBe(5);
    expect(r.team.goals).toBe(1);
    expect(r.team.xg).toBeCloseTo(1.19, 2);
    expect(r.team.finishing).toBeCloseTo(-0.19, 2); // 1 goal − 1.19 xG
  });

  it("names the top threat, creator, build-up hub and defender", () => {
    const r = buildMatchReview(players);
    expect(r.threat!.name).toBe("Arnar Bjarki");     // highest xG 0.88
    expect(r.creator!.name).toBe("Kristinn Jónsson"); // highest xG assisted 0.30
    expect(r.creator!.metric).toBe("xgAssisted");
    expect(r.buildup!.name).toBe("Óli Valur");        // highest xG chain 1.44
    expect(r.defender!.name).toBe("Kristinn Jónsson"); // 3 T+I
  });

  it("flags finishing outliers both ways", () => {
    const r = buildMatchReview(players);
    expect(r.underperformer!.name).toBe("Arnar Bjarki"); // 0.88 xG, 0 goals
    expect(r.overperformer!.name).toBe("Hlynur Freyr");  // 1 goal on 0.16 xG
  });

  it("falls back to key passes when nobody has xG assisted", () => {
    const r = buildMatchReview([P("A", { keyPasses: 3 }), P("B", { keyPasses: 1 })]);
    expect(r.creator!.metric).toBe("keyPasses");
    expect(r.creator!.name).toBe("A");
  });
});

// The real 2026-08-04 Thor Akureyri v Breiðablik team row (from sb_team_match_stats).
const TEAM_0804: TeamMatchNumbers = {
  goals: 0, goalsAgainst: 1, xg: 1.61, xgAgainst: 1.62, openPlayXg: 0.52,
  shots: 14, shotsAgainst: 13, possessionPct: 60.8, passingPct: 82.6, boxTouches: 39,
  obv: 0.76, oppositionObv: 2.19, setPieceXg: 1.10, oppSetPieceGoals: 1,
  gkPassLength: 29.84, gkLongBallPct: 46.2,
};

describe("buildMatchAnalysis", () => {
  const players = [
    P("Arnar Bjarki", { goals: 0, xg: 0.88, shots: 1, xgChain: 1.0 }),
    P("Óli Valur", { goals: 0, xg: 0.15, shots: 2, xgChain: 1.44 }),
  ];
  const base = {
    header: { opponent: "Thor Akureyri", homeAway: "away", competition: "Besta deild karla", date: "2026-08-04", venue: "Þórsvöllur" },
    players,
    playerObv: [{ name: "Anton Einarsson", obv: 0.72, isGoalkeeper: true }, { name: "Óli Valur", obv: 0.30 }],
    team: TEAM_0804,
    seasonContext: { matches: 17, setPieceGoalsConcededPerMatch: 0.06, openPlayXgPerMatch: 0.6 },
  };

  it("builds the score, two-column table and both-side OBV from the team row", () => {
    const a = buildMatchAnalysis(base);
    expect(a.hasTeamData).toBe(true);
    expect(a.header.score).toBe("0–1");
    const obv = a.gameInNumbers.find((r) => r.key === "obv")!;
    expect(obv.own).toBeCloseTo(0.76, 2);
    expect(obv.opp).toBeCloseTo(2.19, 2);       // opposition OBV surfaced
    const poss = a.gameInNumbers.find((r) => r.key === "possession")!;
    expect(poss.own).toBeCloseTo(60.8, 1);
    expect(poss.opp).toBeCloseTo(39.2, 1);       // 100 − own
  });

  it("leaves opponent cells null where StatsBomb doesn't store them", () => {
    const a = buildMatchAnalysis(base);
    expect(a.gameInNumbers.find((r) => r.key === "passing")!.opp).toBeNull();
    expect(a.gameInNumbers.find((r) => r.key === "setPieceXg")!.opp).toBeNull();
    expect(a.gameInNumbers.find((r) => r.key === "boxTouches")!.opp).toBeNull();
  });

  it("derives biggest-chance reliance and flags the GK as most valuable on the ball", () => {
    const a = buildMatchAnalysis(base);
    expect(a.derived.biggestChanceXg).toBeCloseTo(0.88, 2);
    expect(a.derived.xgMinusBiggestChance).toBeCloseTo(0.73, 2);   // 1.61 − 0.88
    expect(a.playerFacts.mostValuable!.name).toBe("Anton Einarsson");
    expect(a.playerFacts.mostValuable!.isGoalkeeper).toBe(true);   // build-up going sideways/back
    expect(a.playerFacts.buildup!.name).toBe("Óli Valur");         // max xGChain
  });

  it("degrades honestly when the team row is missing (no fabricated numbers)", () => {
    const a = buildMatchAnalysis({ ...base, team: null });
    expect(a.hasTeamData).toBe(false);
    expect(a.header.score).toBeNull();
    expect(a.gameInNumbers).toHaveLength(0);
    expect(a.confidence.level).toBe("low");
    expect(a.playerFacts.threat!.name).toBe("Arnar Bjarki"); // per-player facts still available
  });
});
