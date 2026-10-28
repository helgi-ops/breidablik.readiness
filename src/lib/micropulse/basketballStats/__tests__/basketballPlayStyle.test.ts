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
    expect(archetype({ percentileOf: {} }, pnrHeavy).key).toBe("floor_general");
    const shooter = buildPlayStyle([{ "Catch and shoot made": 4, "Catch and shoot attempted": 10, "PnR Handlers attempted": 1 }])!;
    expect(archetype({ percentileOf: {} }, shooter).key).toBe("shooter");
    const big = buildPlayStyle([{ "Posts up made": 3, "Posts up attempted": 6, "Cuts attempted": 3 }])!;
    expect(archetype({ percentileOf: {} }, big).key).toBe("interior");
    // production can tip it even with no style
    expect(archetype({ percentileOf: { apg: 90 } }, null).key).toBe("floor_general");
  });
});
