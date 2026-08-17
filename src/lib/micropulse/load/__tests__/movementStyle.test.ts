import { describe, it, expect } from "vitest";
import { styleRatio, percentileRank, labelFor, computeSquadStyle, type PlayerStyleInput } from "../movementStyle";

describe("styleRatio", () => {
  it("is codLoad ÷ linearFastLoad, null when linear side missing/zero", () => {
    expect(styleRatio(300, 600)).toBe(0.5);
    expect(styleRatio(300, 0)).toBeNull();
    expect(styleRatio(300, null)).toBeNull();
    expect(styleRatio(null, 600)).toBeNull();
  });
});

describe("percentileRank / labelFor", () => {
  it("ranks within the pool and labels by percentile band", () => {
    const pool = [0.2, 0.3, 0.4, 0.5, 0.8];
    expect(percentileRank(0.2, pool)).toBe(0);
    expect(percentileRank(0.8, pool)).toBe(100);
    expect(labelFor(80)).toBe("multidirectional");
    expect(labelFor(20)).toBe("linear");
    expect(labelFor(50)).toBe("balanced");
    expect(labelFor(null)).toBe("insufficient");
  });
});

describe("computeSquadStyle", () => {
  // Real Breiðablik shape: a cutter (high CoD per linear) vs a straight-line runner.
  const squad: PlayerStyleInput[] = [
    { playerId: "asgeir", codLoad: 261, linearFastLoad: 339 }, // 0.77 — most multidirectional
    { playerId: "agust", codLoad: 537, linearFastLoad: 996 },  // 0.54
    { playerId: "hosk", codLoad: 333, linearFastLoad: 672 },   // 0.50
    { playerId: "hlynur", codLoad: 391, linearFastLoad: 909 }, // 0.43
    { playerId: "ivar", codLoad: 368, linearFastLoad: 1627 },  // 0.23
    { playerId: "valgeir", codLoad: 154, linearFastLoad: 747 },// 0.21 — most linear
  ];

  it("differentiates: cutter reads multidirectional, straight-line runner reads linear", () => {
    const out = computeSquadStyle(squad);
    const by = Object.fromEntries(out.map((r) => [r.playerId, r]));
    expect(by.asgeir.label).toBe("multidirectional");
    expect(by.valgeir.label).toBe("linear");
    expect(by.ivar.label).toBe("linear");
    // ratios are ordered as expected
    expect(by.asgeir.ratio!).toBeGreaterThan(by.valgeir.ratio!);
    expect(by.asgeir.percentile!).toBeGreaterThan(by.valgeir.percentile!);
  });

  it("marks players without a ratio (no linear data) as insufficient", () => {
    const out = computeSquadStyle([...squad, { playerId: "noload", codLoad: 100, linearFastLoad: 0 }]);
    const noload = out.find((r) => r.playerId === "noload")!;
    expect(noload.ratio).toBeNull();
    expect(noload.label).toBe("insufficient");
  });

  it("all insufficient when the squad is too small to rank", () => {
    const out = computeSquadStyle([{ playerId: "solo", codLoad: 300, linearFastLoad: 600 }]);
    expect(out[0].percentile).toBeNull();
    expect(out[0].label).toBe("insufficient");
  });
});
