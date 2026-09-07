import { describe, it, expect } from "vitest";
import { buildVariableTrends } from "../trend";
import type { ScreenFinding } from "../interpret";

const scr = (date: string, findings: ScreenFinding[]) => ({ screenDate: date, findings });

describe("buildVariableTrends", () => {
  it("flags improvement from the first flagged screen to the latest", () => {
    const trends = buildVariableTrends([
      scr("2026-08-14", [{ variableKey: "knee_valgus_contact", leg: "L", severity: "marked", value: 0.15 }]),
      scr("2026-09-01", [{ variableKey: "knee_valgus_contact", leg: "L", severity: "moderate", value: 0.08 }]),
    ]);
    const t = trends.find((x) => x.variableKey === "knee_valgus_contact" && x.leg === "L")!;
    expect(t.verdict).toBe("improving");
    expect(t.points.map((p) => p.date)).toEqual(["2026-08-14", "2026-09-01"]); // chronological
  });

  it("worse and unchanged", () => {
    expect(buildVariableTrends([
      scr("2026-08-01", [{ variableKey: "rsi", severity: "moderate" }]),
      scr("2026-09-01", [{ variableKey: "rsi", severity: "marked" }]),
    ])[0].verdict).toBe("worse");
    expect(buildVariableTrends([
      scr("2026-08-01", [{ variableKey: "rsi", severity: "moderate" }]),
      scr("2026-09-01", [{ variableKey: "rsi", severity: "moderate" }]),
    ])[0].verdict).toBe("unchanged");
  });

  it("a single screen is 'single'; never-flagged variables are dropped", () => {
    const trends = buildVariableTrends([
      scr("2026-09-01", [
        { variableKey: "knee_valgus_contact", leg: "L", severity: "marked" },
        { variableKey: "trunk_lean", severity: "ok" }, // never flagged → dropped
      ]),
    ]);
    expect(trends).toHaveLength(1);
    expect(trends[0].verdict).toBe("single");
  });
});
