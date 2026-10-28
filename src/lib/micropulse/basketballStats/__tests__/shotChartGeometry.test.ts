import { describe, it, expect } from "vitest";
import { shotChartGeometry } from "../shotChartGeometry";

describe("shotChartGeometry (web ↔ PDF parity)", () => {
  it("folds shots to one basket and maps to pixels deterministically", () => {
    const g = shotChartGeometry([
      { x: 10, y: 50, made: true },        // left half, stays
      { x: 90, y: 20, made: false },       // right half → folds to (10, 80)
      { x: null, y: 5, made: true },       // dropped (no x)
    ], 150, 140);
    expect(g.attempts).toBe(2);
    expect(g.made).toBe(1);
    expect(g.shots[0]).toEqual({ cx: 30, cy: 70, made: true, kind: "shot" });   // (10/50)*150, (50/100)*140
    expect(g.shots[1]).toEqual({ cx: 30, cy: 112, made: false, kind: "shot" }); // folded 90→10, 20→80
  });

  it("is a pure function of its input — same JSON in, same geometry out (both renderers share it)", () => {
    const pts = [{ x: 25, y: 40, made: true, kind: "paint" as const }, { x: 60, y: 60, made: false }];
    expect(shotChartGeometry(pts)).toEqual(shotChartGeometry(pts));
    expect(shotChartGeometry(pts).shots[0].kind).toBe("paint");
  });
});
