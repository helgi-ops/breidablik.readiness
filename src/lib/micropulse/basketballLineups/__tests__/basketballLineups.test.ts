import { describe, it, expect } from "vitest";
import { computeLineupIntelligence, unitLabel, T, type LineupUnit } from "../index";

const mk = (over: Partial<LineupUnit> & { hash: string }): LineupUnit => ({
  lineupHash: over.hash,
  members: over.members ?? [
    { jersey: "4", name: "D. Rodriguez", playerId: null },
    { jersey: "12", name: "B. Dinkins", playerId: null },
    { jersey: "6", name: "P. Hersler", playerId: null },
    { jersey: "17", name: "H. Rafnsdottir", playerId: null },
    { jersey: "11", name: "H. Agnarsdottir", playerId: null },
  ],
  minutes: over.minutes ?? 10,
  possessions: over.possessions ?? 30,
  points: over.points ?? 30,
  plusMinus: over.plusMinus ?? 0,
});

describe("computeLineupIntelligence", () => {
  it("tags a high-possession, positive-net unit as an anchor", () => {
    // +6 over 30 poss → +20 per 100 → well above goodNet
    const read = computeLineupIntelligence({ season: "2025-2026", units: [
      mk({ hash: "a", possessions: 30, plusMinus: 6, minutes: 14 }),
      mk({ hash: "b", possessions: 25, plusMinus: 5, minutes: 10 }),
    ] });
    const anchor = read.units.find((u) => u.lineupHash === "a");
    expect(anchor?.tier).toBe("anchor");
    expect(anchor?.netPer100).toBeCloseTo(20, 4);
    expect(read.verdict).toBe("clear_anchor");
  });

  it("tags a high-possession, negative-net unit as a leak", () => {
    const read = computeLineupIntelligence({ season: null, units: [
      mk({ hash: "a", possessions: 30, plusMinus: 8, minutes: 14 }),
      mk({ hash: "leaky", possessions: 28, plusMinus: -5, minutes: 12 }),
    ] });
    const leak = read.units.find((u) => u.lineupHash === "leaky");
    expect(leak?.tier).toBe("leak");
    expect(read.verdict).toBe("mixed"); // one anchor + one leak
    expect(read.facts.some((f) => f.en.includes("Leaking unit"))).toBe(true);
  });

  it("tags a positive but low-possession unit as a spark (small-sample caveat), not an anchor", () => {
    const read = computeLineupIntelligence({ season: null, units: [
      mk({ hash: "a", possessions: 30, plusMinus: 6, minutes: 14 }),
      mk({ hash: "b", possessions: 25, plusMinus: 4, minutes: 10 }),
      mk({ hash: "spark", possessions: 5, plusMinus: 2, minutes: 2 }), // below minPoss but positive
    ] });
    const spark = read.units.find((u) => u.lineupHash === "spark");
    expect(spark?.tier).toBe("spark");
    // spark does NOT count toward the judged sample
    expect(spark && spark.possessions! < T.minPoss).toBe(true);
  });

  it("shows thin units but emits no verdict when too few clear the possession floor", () => {
    const read = computeLineupIntelligence({ season: null, units: [
      mk({ hash: "x", possessions: 6, plusMinus: -1, minutes: 2 }),
      mk({ hash: "y", possessions: 3, plusMinus: 0, minutes: 1 }),
    ] });
    expect(read.judgedN).toBe(0);
    expect(read.verdict).toBe("insufficient");
    expect(read.units.every((u) => u.tier === "thin" || u.tier === "spark")).toBe(true);
    expect(read.headline.en).toMatch(/not enough/i);
    expect(read.headline.is.length).toBeGreaterThan(0);
  });

  it("raises confidence as more possessions are covered", () => {
    const thinSample = computeLineupIntelligence({ season: null, units: [
      mk({ hash: "a", possessions: 22, plusMinus: 5 }),
      mk({ hash: "b", possessions: 21, plusMinus: -5 }),
    ] });
    const richSample = computeLineupIntelligence({ season: null, units: [
      mk({ hash: "a", possessions: 40, plusMinus: 8 }),
      mk({ hash: "b", possessions: 35, plusMinus: -6 }),
    ] });
    expect(thinSample.confidence).toBe("moderate");
    expect(richSample.confidence).toBe("high");
  });

  it("builds a readable unit label with jerseys", () => {
    expect(unitLabel(mk({ hash: "a" }))).toBe("4 D. Rodriguez, 12 B. Dinkins, 6 P. Hersler, 17 H. Rafnsdottir, 11 H. Agnarsdottir");
  });

  it("never emits a verdict without the cited possession-based reasoning", () => {
    const read = computeLineupIntelligence({ season: null, units: [
      mk({ hash: "a", possessions: 40, plusMinus: 8 }),
      mk({ hash: "b", possessions: 35, plusMinus: -6 }),
    ] });
    expect(read.citations.length).toBeGreaterThan(0);
    expect(read.citations.join(" ")).toMatch(/Oliver/);
  });
});
