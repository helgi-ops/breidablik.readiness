import { describe, it, expect } from "vitest";
import { leversForProfile, ATHLETE_LEVERS } from "../developmentLevers";
import { QUALITIES, type AthleteProfile, type QualityRead, type QualityId } from "../athleteProfile";
import type { PlayerAnalysis } from "../index";

function q(id: QualityId, pctl: number): QualityRead {
  return { id, value: 1, unit: "", source: "GPS", date: "2026-07-01", sampleSize: 6, positionPercentile: pctl, squadPercentile: pctl, benchmark: "position", poolSize: 10, verdict: pctl <= 30 ? "weakness" : pctl >= 70 ? "strength" : "neutral", confidence: "high", trend: null };
}
function athlete(weak: QualityId[]): AthleteProfile {
  const qualities = weak.map((id) => q(id, 15));
  return { playerId: "t", position: "CM", positionGroup: "CM", qualities, strengths: [], weaknesses: qualities, coverage: { sources: ["GPS"], qualitiesWithData: qualities.length, totalQualities: QUALITIES.length, ratio: 0.3 } };
}
function footballer(byCategory: { attacking: number; possession: number; defending: number }): PlayerAnalysis {
  return { player: "T", minutes: 900, goals: 1, assists: 1, poolSize: 12, metrics: [{ key: "x", label: "x", category: "attacking", value: 1, percentile: 50 }], strengths: [], weaknesses: [], byCategory, role: "attacking", goalkeeper: false };
}

describe("leversForProfile", () => {
  it("gives a lever for every athlete weakness", () => {
    const items = leversForProfile(null, athlete(["vbt_power", "speed"]));
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.axis === "athlete" && i.lever.en.length > 0)).toBe(true);
    expect(items.find((i) => i.key === "vbt_power")!.lever).toBe(ATHLETE_LEVERS.vbt_power);
  });

  it("adds a lever for a weak footballer category (bottom third)", () => {
    const items = leversForProfile(footballer({ attacking: 80, possession: 60, defending: 12 }), null);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ axis: "footballer", key: "defending" });
  });

  it("orders most-severe (lowest percentile) first across both axes", () => {
    const items = leversForProfile(footballer({ attacking: 25, possession: 60, defending: 60 }), athlete(["speed"]));
    // athlete speed is 15th, footballer attacking 25th → speed first
    expect(items[0].key).toBe("speed");
    expect(items[1].key).toBe("attacking");
  });

  it("robustness lever hands the medical read back to RTP (never injury advice here)", () => {
    expect(ATHLETE_LEVERS.robustness.en).toMatch(/RTP/);
    expect(ATHLETE_LEVERS.robustness.is).toMatch(/RTP/);
  });

  it("is empty when there are no weaknesses", () => {
    expect(leversForProfile(footballer({ attacking: 60, possession: 60, defending: 60 }), athlete([]))).toEqual([]);
  });
});
