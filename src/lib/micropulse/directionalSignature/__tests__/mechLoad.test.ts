import { describe, it, expect } from "vitest";
import { directionalMechLoad, MECH_DIR_WEIGHTS, type ClockGrid } from "../index";

const empty = (): ClockGrid => Object.fromEntries(
  ["1","2","3","4","5","6","7","8","9","10","11","12"].map((d) => [d, { high: 0, medium: 0, low: 0 }]),
) as ClockGrid;

describe("directionalMechLoad", () => {
  it("weights high > medium > low and shares sum to ~1", () => {
    const g = empty();
    g["3"] = { high: 10, medium: 0, low: 0 };  // 10×3 = 30 AU (right)
    g["9"] = { high: 0, medium: 0, low: 30 };  // 30×1 = 30 AU (left) — same load, many low cuts
    const r = directionalMechLoad([g])!;
    expect(r.totalAU).toBe(60);
    const right = r.perDirection.find((d) => d.dir === "3")!;
    const left = r.perDirection.find((d) => d.dir === "9")!;
    expect(right.loadAU).toBe(30);
    expect(left.loadAU).toBe(30);
    expect(right.share + left.share).toBeCloseTo(1, 5);
    expect(MECH_DIR_WEIGHTS.high).toBeGreaterThan(MECH_DIR_WEIGHTS.low);
  });

  it("a high-intensity cut outweighs the same count of low cuts", () => {
    const g = empty();
    g["4"] = { high: 5, medium: 0, low: 0 };   // 15 AU
    g["10"] = { high: 0, medium: 0, low: 5 };  // 5 AU
    const r = directionalMechLoad([g])!;
    expect(r.top[0].dir).toBe("4");             // right-back leads on load despite equal counts
    expect(r.perDirection.find((d) => d.dir === "4")!.loadAU).toBe(15);
    expect(r.perDirection.find((d) => d.dir === "10")!.loadAU).toBe(5);
  });

  it("sums across multiple grids and returns null when empty", () => {
    const g = empty(); g["12"] = { high: 2, medium: 2, low: 2 }; // 2*3+2*2+2*1 = 12 AU per grid
    const r = directionalMechLoad([g, g, null])!;
    expect(r.totalAU).toBe(24);
    expect(directionalMechLoad([null, empty()])).toBeNull();
    expect(directionalMechLoad([])).toBeNull();
  });

  it("computes per-minute load when minutes are supplied (comparable across players)", () => {
    const g = empty();
    g["3"] = { high: 30, medium: 0, low: 0 }; // 90 AU
    const r = directionalMechLoad([g], 30)!;   // over 30 minutes → 3 AU/min total
    expect(r.perMinTotal).toBeCloseTo(3, 5);
    expect(r.minutes).toBe(30);
    expect(r.perDirection.find((d) => d.dir === "3")!.perMin).toBeCloseTo(3, 5);
    // no minutes → perMin null
    expect(directionalMechLoad([g])!.perMinTotal).toBeNull();
    expect(directionalMechLoad([g], 0)!.perDirection[0].perMin).toBeNull();
  });
});
