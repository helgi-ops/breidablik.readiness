import { describe, it, expect } from "vitest";
import { buildMatchReview, type ReviewPlayer } from "../index";

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
