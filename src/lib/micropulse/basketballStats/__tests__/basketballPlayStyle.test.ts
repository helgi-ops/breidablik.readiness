import { describe, it, expect } from "vitest";
import { buildPlayStyle, archetype } from "../basketballPlayStyle";

describe("basketballPlayStyle", () => {
  it("builds the style mix + defense from InStat rows", () => {
    const rows = [{
      "PnR Handlers made": 4, "PnR Handlers attempted": 8,
      "Catch and shoot made": 1, "Catch and shoot attempted": 2,
      "Isolations made": "-", "Isolations attempted": "-",
      "Opponent's field goals made": 3, "Opponent's field goals attempted": 9, "Opponent possessions played": 20,
    }];
    const s = buildPlayStyle(rows)!;
    expect(s.totalAttempts).toBe(10);
    const pnr = s.mix.find((m) => m.key === "pnrHandler")!;
    expect(pnr.attempts).toBe(8);
    expect(pnr.share).toBe(80);
    expect(pnr.pct).toBe(50);
    expect(s.mix.find((m) => m.key === "iso")).toBeUndefined(); // 0 attempts filtered
    expect(s.defense!.oppFgPct).toBeCloseTo(33.3, 1);
  });

  it("returns null for no rows", () => {
    expect(buildPlayStyle([])).toBeNull();
  });

  it("derives archetypes from style + production", () => {
    const pnrHeavy = buildPlayStyle([{ "PnR Handlers made": 5, "PnR Handlers attempted": 12, "Catch and shoot attempted": 2 }])!;
    // On-ball PnR: score-first → Primary scorer; pass-first (apg > ppg) → Floor general.
    expect(archetype({ percentileOf: { ppg: 90, apg: 40 } }, pnrHeavy).key).toBe("scorer");
    expect(archetype({ percentileOf: { ppg: 40, apg: 90 } }, pnrHeavy).key).toBe("floor_general");

    const shooter = buildPlayStyle([{ "Catch and shoot made": 4, "Catch and shoot attempted": 10, "PnR Handlers attempted": 1 }])!;
    expect(archetype({ percentileOf: {} }, shooter).key).toBe("shooter");
    // same shooter but opponents shoot poorly against them → 3&D wing
    const shooterD = buildPlayStyle([{ "Catch and shoot made": 4, "Catch and shoot attempted": 10, "PnR Handlers attempted": 1, "Opponent's field goals made": 2, "Opponent's field goals attempted": 8 }])!;
    expect(archetype({ percentileOf: {} }, shooterD).key).toBe("three_and_d");

    const big = buildPlayStyle([{ "Posts up made": 3, "Posts up attempted": 6, "Cuts attempted": 3 }])!;
    expect(archetype({ percentileOf: {} }, big).key).toBe("interior");

    // production fallback (no style)
    expect(archetype({ percentileOf: { apg: 90 } }, null).key).toBe("floor_general");
    expect(archetype({ percentileOf: { rpg: 90, bpg: 80 } }, null).key).toBe("interior");
    expect(archetype({ percentileOf: {} }, null).key).toBe("connector");
  });
});
