import { describe, it, expect } from "vitest";
import { aggregatePlayers, buildBasketballPlayerAnalysis, type BoxLine } from "../basketballPlayerAnalysis";

const key = (n: string) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "").slice(-8);

describe("basketballPlayerAnalysis", () => {
  it("aggregates per-game lines into season averages", () => {
    const lines: BoxLine[] = [
      { name: "A", pts: 20, reb: 4, ast: 2, fgm: 8, fga: 16, tpm: 2, tpa: 5, ftm: 2, fta: 2, tov: 3 },
      { name: "A", pts: 10, reb: 6, ast: 4, fgm: 4, fga: 10, tpm: 0, tpa: 2, ftm: 2, fta: 4, tov: 1 },
    ];
    const [a] = aggregatePlayers(lines, key);
    expect(a.games).toBe(2);
    expect(a.ppg).toBe(15);
    expect(a.rpg).toBe(5);
    expect(a.apg).toBe(3);
    expect(a.topg).toBe(2);
    expect(a.fgPct).toBe(46.2); // 12/26
    expect(a.efgPct).toBe(50);  // (12 + 0.5*2)/26 = 50
  });

  it("merges name-format variants by key (InStat vs KKÍ)", () => {
    const lines: BoxLine[] = [
      { name: "Asta Grimsdottir", pts: 10, reb: 5 },
      { name: "Ásta Júlía Grímsdóttir", pts: 20, reb: 15 },
    ];
    const agg = aggregatePlayers(lines, key);
    expect(agg).toHaveLength(1);
    expect(agg[0].games).toBe(2);
    expect(agg[0].name).toBe("Ásta Júlía Grímsdóttir"); // fuller spelling kept
  });

  it("builds within-squad percentiles, role, strengths/weaknesses", () => {
    const pool = aggregatePlayers([
      { name: "Scorer", pts: 30, reb: 2, ast: 1, fgm: 12, fga: 20, stl: 0, blk: 0, tov: 4 },
      { name: "Glass", pts: 6, reb: 15, oreb: 6, dreb: 9, ast: 1, fgm: 3, fga: 6, stl: 1, blk: 3, tov: 1 },
      { name: "Floor", pts: 10, reb: 3, ast: 10, fgm: 4, fga: 9, stl: 3, blk: 0, tov: 2 },
    ], key);
    const scorer = buildBasketballPlayerAnalysis(pool, "Scorer", key)!;
    expect(scorer).toBeTruthy();
    expect(scorer.poolSize).toBe(3);
    // Scorer leads PPG → top scoring percentile.
    const scoring = scorer.categories.find((c) => c.key === "scoring")!;
    expect(scoring.metrics.find((m) => m.key === "ppg")!.percentile).toBe(100);
    expect(scorer.smallSample).toBe(true); // 1 game
    const glass = buildBasketballPlayerAnalysis(pool, "Glass", key)!;
    expect(glass.role?.key).toBe("rebounding"); // dominates boards + blocks
    expect(glass.strengths.some((m) => m.key === "rpg")).toBe(true);
  });

  it("returns null for an unknown player", () => {
    const pool = aggregatePlayers([{ name: "A", pts: 10 }], key);
    expect(buildBasketballPlayerAnalysis(pool, "Nobody", key)).toBeNull();
  });
});
