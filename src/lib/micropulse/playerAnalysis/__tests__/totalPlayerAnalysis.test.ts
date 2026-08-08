import { describe, it, expect } from "vitest";
import { buildTotalPlayerAnalysis, buildCrossLinks } from "../totalPlayerAnalysis";
import type { PlayerAnalysis } from "../index";
import type { AthleteProfile, QualityRead, QualityId } from "../athleteProfile";

function quality(id: QualityId, positionPercentile: number | null, value: number | null = 1): QualityRead {
  return {
    id, value, unit: "", source: "GPS", date: "2026-07-01", sampleSize: 6,
    positionPercentile, squadPercentile: positionPercentile, benchmark: "position",
    poolSize: 10, verdict: positionPercentile == null ? "no_data" : positionPercentile >= 70 ? "strength" : positionPercentile <= 30 ? "weakness" : "neutral",
    confidence: "high", trend: null,
  };
}

function athlete(qs: Partial<Record<QualityId, number | null>>): AthleteProfile {
  const qualities = Object.entries(qs).map(([id, p]) => quality(id as QualityId, p ?? null, p == null ? null : 1));
  const withData = qualities.filter((q) => q.value != null);
  return {
    playerId: "t", position: "CM", positionGroup: "CM", qualities,
    strengths: withData.filter((q) => q.verdict === "strength"),
    weaknesses: withData.filter((q) => q.verdict === "weakness"),
    coverage: { sources: ["GPS", "IMTP"], qualitiesWithData: withData.length, totalQualities: 9, ratio: withData.length / 9 },
  };
}

function footballer(byCategory: { attacking: number | null; possession: number | null; defending: number | null }): PlayerAnalysis {
  const strengths = Object.values(byCategory).filter((v): v is number => v != null && v >= 75);
  const weaknesses = Object.values(byCategory).filter((v): v is number => v != null && v <= 25);
  return {
    player: "Target", minutes: 1800, goals: 3, assists: 2, poolSize: 12,
    metrics: [{ key: "OBV", label: "Total OBV", category: "possession", value: 1, percentile: byCategory.possession }],
    strengths: strengths.map((p) => ({ key: "x", label: "x", category: "attacking" as const, value: 1, percentile: p })),
    weaknesses: weaknesses.map((p) => ({ key: "y", label: "y", category: "defending" as const, value: 1, percentile: p })),
    byCategory, role: "attacking", goalkeeper: false,
  };
}

describe("buildCrossLinks", () => {
  it("fires 'gym strength not on the pitch' when strength high but speed low", () => {
    const links = buildCrossLinks(null, athlete({ max_strength: 85, speed: 20, work_capacity: 60 }));
    const ids = links.map((l) => l.id);
    expect(ids).toContain("gym_not_on_pitch");
    const link = links.find((l) => l.id === "gym_not_on_pitch")!;
    expect(link.evidence.length).toBe(2); // both numbers cited
    expect(link.evidence[0].en).toContain("%ile");
  });

  it("fires 'covers ground, low end-product' from work capacity vs footballer attacking", () => {
    const links = buildCrossLinks(footballer({ attacking: 15, possession: 50, defending: 50 }), athlete({ work_capacity: 88 }));
    expect(links.map((l) => l.id)).toContain("ground_no_endproduct");
  });

  it("does not fire a cross-link when only one side has data", () => {
    // work capacity high but no footballer axis at all → no ground_no_endproduct
    const links = buildCrossLinks(null, athlete({ work_capacity: 88 }));
    expect(links.map((l) => l.id)).not.toContain("ground_no_endproduct");
  });

  it("stays quiet when nothing crosses the gates", () => {
    const links = buildCrossLinks(footballer({ attacking: 55, possession: 55, defending: 55 }), athlete({ speed: 55, work_capacity: 55, max_strength: 55 }));
    expect(links).toEqual([]);
  });
});

describe("buildTotalPlayerAnalysis", () => {
  it("keeps both axes and reports coverage", () => {
    const total = buildTotalPlayerAnalysis({
      playerId: "t",
      footballer: footballer({ attacking: 80, possession: 60, defending: 40 }),
      athlete: athlete({ speed: 85, work_capacity: 80, max_strength: 25 }),
    });
    expect(total.coverage.footballer).toBe(true);
    expect(total.coverage.athlete).toBe(true);
    expect(total.footballer).not.toBeNull();
    expect(total.athlete).not.toBeNull();
    expect(total.coverage.sources).toContain("Footballer stats");
  });

  it("writes a footballer-only headline when athlete data is missing", () => {
    const total = buildTotalPlayerAnalysis({
      playerId: "t",
      footballer: footballer({ attacking: 85, possession: 80, defending: 78 }),
      athlete: null,
    });
    expect(total.coverage.athlete).toBe(false);
    expect(total.headline.en).toMatch(/footballer/i);
    expect(total.headline.en).toMatch(/athlete data not linked/i);
  });

  it("never blends into one score — footballer and athlete stay separate objects", () => {
    const total = buildTotalPlayerAnalysis({
      playerId: "t",
      footballer: footballer({ attacking: 80, possession: 60, defending: 40 }),
      athlete: athlete({ speed: 85 }),
    });
    expect(total).not.toHaveProperty("score");
    expect(total).not.toHaveProperty("overall");
  });
});
