import { describe, it, expect } from "vitest";
import { buildOpponentReport, type Metrics, type ScoutMatch } from "../opponentReport";

const zero: Metrics = {
  xgf: null, xga: null, gf: null, ga: null, shots: null, shotsAgainst: null, possession: null,
  ppda: null, defDuelsWonPct: null, forwardPasses: null, forwardPassAccPct: null,
  passesFinalThird: null, passesFinalThirdAccPct: null, progressivePasses: null, smartPasses: null,
  smartPassAccPct: null, crosses: null, crossAccPct: null, positionalAttacks: null, counterattacks: null,
  offensiveDuelsWonPct: null,
};
const league: Metrics = { ...zero, xgf: 1.6, xga: 1.6, gf: 1.5, ga: 1.5, shots: 12, shotsAgainst: 12, possession: 50, ppda: 11, defDuelsWonPct: 55, crosses: 14, smartPasses: 4, positionalAttacks: 28, counterattacks: 3, passesFinalThird: 45 };
const own: Metrics = { ...league, possession: 53, ppda: 10 };

// A possession-dominant, high-pressing side that concedes a lot and loses duels.
const opp: Metrics = {
  ...zero,
  xgf: 2.1, xga: 2.0, gf: 2.0, ga: 1.4, shots: 15, shotsAgainst: 15, possession: 58,
  ppda: 8.5, defDuelsWonPct: 45, crosses: 20, smartPasses: 6, positionalAttacks: 34, counterattacks: 2, passesFinalThird: 55,
};
const matches: ScoutMatch[] = [
  { date: "2026-06-01", opponent: "A", isHome: true, goals: 3, goalsAgainst: 1, xg: 2.4, xgAgainst: 1.1, result: "W" },
  { date: "2026-06-08", opponent: "B", isHome: false, goals: 1, goalsAgainst: 2, xg: 1.0, xgAgainst: 2.5, result: "L" },
  { date: "2026-06-15", opponent: "C", isHome: true, goals: 2, goalsAgainst: 2, xg: 2.2, xgAgainst: 2.0, result: "D" },
];

describe("buildOpponentReport", () => {
  const rep = buildOpponentReport({ opponent: { name: "Rivals FC", matches: 17, m: opp }, league, own, matches, players: [], season: "2026" });

  it("classifies identity: possession-dominant + high press, citing the numbers", () => {
    expect(rep.identity.flags).toContain("possession_dominant");
    expect(rep.identity.flags).toContain("high_press"); // ppda 8.5 <= 11 - 1.5
    expect(rep.identity.verdict.en).toMatch(/dominate the ball/i);
    expect(rep.identity.verdict.is).toMatch(/ráða boltanum/);
    expect(rep.identity.facts.find((f) => f.metric === "possession")?.value).toBe(58);
  });

  it("flags their attacking threat (crosses + positional) with the route named", () => {
    expect(rep.attack.flags).toContain("threat_crosses"); // 20 >= 18
    expect(rep.attack.flags).toContain("strong_attack"); // 2.1 vs 1.6
    expect(rep.attack.verdict.en).toMatch(/crosses/i);
  });

  it("produces 'how to hurt them' recs that each cite a signal, for a leaky/weak-duel side", () => {
    expect(rep.defend.flags).toEqual(expect.arrayContaining(["concedes_high_xga", "weak_def_duels", "high_line"]));
    const ids = rep.defend.recommendations.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["in_behind", "attack_channels", "take_them_on"]));
    for (const r of rep.defend.recommendations) expect(r.signal.metric).toBeTruthy(); // every rec cites a signal
  });

  it("builds the matchup vs the coach's own team with deltas", () => {
    const poss = rep.matchup.rows.find((r) => r.metric === "possession")!;
    expect(poss.them).toBe(58);
    expect(poss.you).toBe(53);
    expect(poss.delta).toBeCloseTo(5, 1);
    expect(poss.theyBetter).toBe(true); // higher possession = better, 58 > 53
  });

  it("reads form from the match list (record + trend)", () => {
    expect(rep.form.last).toHaveLength(3);
    expect(["rising", "falling", "steady"]).toContain(rep.form.trend);
    expect(rep.form.verdict.en).toMatch(/1W 1D 1L/);
  });

  it("reports confidence + honest empty player state", () => {
    expect(rep.keyPlayers.available).toBe(false);
    expect(rep.confidence.hasPassing).toBe(true);
    expect(rep.confidence.hasPlayers).toBe(false);
  });
});
