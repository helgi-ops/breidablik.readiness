import { describe, it, expect } from "vitest";
import { computePeakMovementSignature, sumClocks } from "../index";
import type { ClockGrid } from "@/lib/micropulse/directionalSignature";

// Build a clock grid: pass per-sector [high, medium, low]. Missing sectors = 0.
function grid(spec: Record<string, [number, number, number]>): ClockGrid {
  const g: ClockGrid = {};
  for (const [k, [high, medium, low]] of Object.entries(spec)) g[k] = { high, medium, low };
  return g;
}

describe("computePeakMovementSignature", () => {
  it("classifies a forward high-speed window as attacking sprints", () => {
    const r = computePeakMovementSignature({
      clock: grid({ "12": [20, 10, 2], "1": [5, 5, 1], "6": [1, 1, 5], "3": [1, 0, 3] }),
      topSpeedKmh: 33.5, peakDistancePerMin: 190, windowMin: 1,
    });
    expect(r.hasData).toBe(true);
    expect(r.archetype).toBe("straight_attacking");
    expect(r.segments.find((s) => s.key === "forward")!.share).toBeGreaterThan(0.5);
    // segments sum to 1
    expect(r.segments.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 5);
    expect(r.verdict.en.toLowerCase()).toContain("attacking");
    expect(r.confidence).toBe("high"); // 20+10+5+5 = 40 intense
  });

  it("classifies a backward-dominant window as recovery running", () => {
    const r = computePeakMovementSignature({
      clock: grid({ "6": [15, 8, 2], "5": [4, 3, 1], "12": [1, 1, 2] }),
      topSpeedKmh: 31, windowMin: 3,
    });
    expect(r.archetype).toBe("straight_recovery");
    expect(r.verdict.en.toLowerCase()).toContain("recovery");
  });

  it("classifies a lateral-dominant window as multidirectional", () => {
    const r = computePeakMovementSignature({
      clock: grid({ "3": [10, 6, 2], "9": [8, 5, 2], "12": [2, 1, 1] }),
      topSpeedKmh: 24,
    });
    expect(r.archetype).toBe("multidirectional");
    expect(r.segments.find((s) => s.key === "multidirectional")!.share).toBeGreaterThan(0.5);
  });

  it("uses baseline-excess, so a modest forward tilt beats the naturally-larger lateral share", () => {
    // Even split by sectors would be forward 25% / back 25% / lateral 50%. This
    // player is forward 40% / back 20% / lateral 40% — lateral is NOT above its
    // 50% baseline, but forward is well above its 25%, so it reads attacking.
    const r = computePeakMovementSignature({
      clock: grid({ "12": [40, 0, 0], "6": [20, 0, 0], "3": [20, 0, 0], "9": [20, 0, 0] }),
      topSpeedKmh: 34,
    });
    expect(r.segments.find((s) => s.key === "multidirectional")!.share).toBeCloseTo(0.4, 2);
    expect(r.archetype).toBe("straight_attacking");
  });

  it("reads low-intensity only when there are too few intense directional efforts", () => {
    const r = computePeakMovementSignature({
      clock: grid({ "12": [1, 1, 200], "6": [0, 1, 180], "3": [0, 0, 150] }),
    });
    expect(r.archetype).toBe("low_intensity");
    expect(r.segments).toHaveLength(0);
    expect(r.intenseShare).toBeLessThan(0.02);
  });

  it("flags forward movement without a high top speed as accelerations, not sprints", () => {
    const r = computePeakMovementSignature({
      clock: grid({ "12": [12, 8, 3], "1": [3, 2, 1] }),
      topSpeedKmh: 22, // below the 30 km/h high-speed gate, no hsrPerMin
    });
    expect(r.archetype).toBe("straight_attacking");
    expect(r.facts.some((f) => /accelerations rather than full sprints/i.test(f.en))).toBe(true);
  });

  it("honest empty states", () => {
    expect(computePeakMovementSignature({ clock: null }).hasData).toBe(false);
    expect(computePeakMovementSignature({ clock: null }).verdict.en).toMatch(/No IMA directional data/);
    const empty = computePeakMovementSignature({ clock: { "12": { high: 0, medium: 0, low: 0 } } });
    expect(empty.hasData).toBe(false);
    expect(empty.verdict.en).toMatch(/empty/);
  });

  it("confidence scales with intense-event count", () => {
    const mk = (h: number) => computePeakMovementSignature({ clock: grid({ "12": [h, 0, 0] }) }).confidence;
    expect(mk(45)).toBe("high");
    expect(mk(20)).toBe("medium");
    expect(mk(10)).toBe("low");
  });
});

describe("sumClocks", () => {
  it("sums per-sector tiers across grids and returns null when all empty", () => {
    const a = grid({ "12": [2, 1, 3], "6": [1, 0, 4] });
    const b = grid({ "12": [3, 2, 1] });
    const s = sumClocks([a, null, b])!;
    expect(s["12"]).toEqual({ high: 5, medium: 3, low: 4 });
    expect(s["6"]).toEqual({ high: 1, medium: 0, low: 4 });
    expect(sumClocks([null, undefined])).toBeNull();
  });
});
