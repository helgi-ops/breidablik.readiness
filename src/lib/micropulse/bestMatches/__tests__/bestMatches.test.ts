import { describe, it, expect } from "vitest";
import { rankMatches, matchStrengths, seasonAverages, outcomeOf, type TeamMatch } from "../index";

const M = (p: Partial<TeamMatch>): TeamMatch => ({
  matchDate: "2026-01-01", opponent: "X", isHome: true, goals: 0, goalsAgainst: 0,
  xg: 1, xgAgainst: 1, obv: 1, pressures: 120, openPlayXg: 0.8, setPieceXg: 0.2, deepProgressions: 40, ...p,
});

const season: TeamMatch[] = [
  M({ matchDate: "2026-04-27", opponent: "Thor", goals: 4, goalsAgainst: 0, xg: 3.25, xgAgainst: 1.66, obv: 4.3, pressures: 101 }),
  M({ matchDate: "2026-06-21", opponent: "KA", goals: 3, goalsAgainst: 1, xg: 2.21, xgAgainst: 0.82, obv: 2.28, pressures: 159 }),
  M({ matchDate: "2026-05-22", opponent: "KR", goals: 6, goalsAgainst: 3, xg: 2.69, xgAgainst: 2.77, obv: 4.4, pressures: 181 }),
  M({ matchDate: "2026-07-13", opponent: "Keflavik", goals: 2, goalsAgainst: 1, xg: 0.54, xgAgainst: 0.92, obv: 0.38, pressures: 146 }),
  M({ matchDate: "2026-06-01", opponent: "FH", goals: 0, goalsAgainst: 2, xg: 0.5, xgAgainst: 2.4, obv: 0.2, pressures: 90 }),
];

describe("outcomeOf / seasonAverages", () => {
  it("classifies results", () => {
    expect(outcomeOf(2, 1)).toBe("win"); expect(outcomeOf(1, 1)).toBe("draw"); expect(outcomeOf(0, 1)).toBe("loss");
  });
  it("averages present values", () => {
    const a = seasonAverages(season);
    expect(a.xg).toBeCloseTo((3.25 + 2.21 + 2.69 + 0.54 + 0.5) / 5, 2);
  });
});

describe("rankMatches", () => {
  const ranked = rankMatches(season, { topN: 10 });
  it("puts wins first, ordered by goal margin then xG", () => {
    expect(ranked[0].opponent).toBe("Thor");   // 4-0, gd4, dominant
    expect(ranked[1].opponent).toBe("KR");     // 6-3, gd3 beats KA gd2
    expect(ranked[2].opponent).toBe("KA");     // 3-1, gd2
    expect(ranked.at(-1)!.opponent).toBe("FH"); // the loss is last
  });
  it("a loss always ranks below any win/draw", () => {
    const loss = ranked.find((m) => m.outcome === "loss")!;
    const wins = ranked.filter((m) => m.outcome === "win");
    expect(Math.min(...wins.map((w) => w.score))).toBeGreaterThan(loss.score);
  });
  it("respects topN", () => {
    expect(rankMatches(season, { topN: 2 })).toHaveLength(2);
  });
});

describe("matchStrengths", () => {
  const avg = seasonAverages(season);
  it("flags clean sheet + dominant win + xG control for the 4-0", () => {
    const s = matchStrengths(season[0], avg).map((x) => x.key);
    expect(s).toContain("cleansheet");
    expect(s).toContain("bigwin");
    expect(s).toContain("xgbattle");
    expect(s.length).toBeLessThanOrEqual(4);
  });
  it("flags clinical finishing when goals exceed xG by 1+", () => {
    const s = matchStrengths(season[3], avg).map((x) => x.key); // Keflavik 2-1 from 0.54 xG
    expect(s).toContain("clinical");
  });
  it("always returns at least one takeaway", () => {
    const s = matchStrengths(M({ goals: 1, goalsAgainst: 0, xg: 0.9, xgAgainst: 0.8, obv: 0.5, pressures: 100, setPieceXg: 0.1, deepProgressions: 30 }), avg);
    expect(s.length).toBeGreaterThan(0);
  });
});
