import { describe, it, expect } from "vitest";
import { buildPeakMatchStory } from "../index";

describe("buildPeakMatchStory", () => {
  it("no windows → hasData false", () => {
    const r = buildPeakMatchStory({ tacticalAligned: true });
    expect(r.hasData).toBe(false);
    expect(r.facts).toEqual([]);
  });

  it("both peaks in attack (tactically aligned) → attack verdict, high conf from window", () => {
    const r = buildPeakMatchStory({
      tacticalAligned: true,
      hardestMinute: { plPerMin: 22.8, clock: "41:28", phase: "attacking", secondHalf: false, confidence: "high", events: 9 },
      hardestRun: { distanceM: 450, windowMin: 5, phase: "attacking" },
      hsr: { h1: 343, h2: 100 },
    });
    expect(r.hasData).toBe(true);
    expect(r.verdict.en.toLowerCase()).toContain("attack");
    expect(r.verdict.en).toContain("71%"); // fade magnitude present in verdict
    expect(r.confidence).toBe("high");
    // why: provenance cites the aligned-event count, and the fade reading lists alternatives (no single cause)
    expect(r.why.length).toBeGreaterThanOrEqual(2);
    expect(r.why[0].en).toContain("9 Wyscout event");
    expect(r.why.some((w) => w.en.toLowerCase().includes("fatigue") && w.en.toLowerCase().includes("tactical"))).toBe(true);
    expect(r.facts.some((f) => f.en.includes("41:28"))).toBe(true);
    expect(r.facts.some((f) => f.en.includes("-71%"))).toBe(true);
    expect(r.caveat?.en.toLowerCase()).toContain("match clock"); // HSR half-level caveat only
    expect(r.caveat?.en.toLowerCase()).not.toContain("upload the wyscout");
  });

  it("not tactically aligned → magnitude-only verdict, low confidence, upload caveat", () => {
    const r = buildPeakMatchStory({
      tacticalAligned: false,
      hardestMinute: { plPerMin: 20, clock: "30:00", phase: "open", secondHalf: false, confidence: "high" },
      hardestRun: { distanceM: 400, windowMin: 5, phase: "open" },
    });
    expect(r.verdict.en.toLowerCase()).not.toContain("attack");
    expect(r.verdict.en).toContain("Player Load/min");
    expect(r.confidence).toBe("low"); // phase unknown → signature read not backed
    expect(r.caveat?.en.toLowerCase()).toContain("upload the wyscout");
    expect(r.facts.every((f) => !/· (attack|defence|open)/.test(f.en))).toBe(true); // no phase tag on facts
    expect(r.why[0].en.toLowerCase()).toContain("no wyscout team-events"); // why explains the low confidence
  });

  it("mixed phases → split verdict", () => {
    const r = buildPeakMatchStory({
      tacticalAligned: true,
      hardestMinute: { plPerMin: 21, clock: "12:00", phase: "attacking", secondHalf: false, confidence: "medium" },
      hardestRun: { distanceM: 420, windowMin: 5, phase: "defending" },
    });
    expect(r.verdict.en.toLowerCase()).toContain("split across attack and defence");
    expect(r.confidence).toBe("medium");
  });

  it("HSR rise is reported as a rise, not a fade", () => {
    const r = buildPeakMatchStory({
      tacticalAligned: true,
      hardestMinute: { plPerMin: 19, clock: "70:00", phase: "defending", secondHalf: true, confidence: "medium" },
      hsr: { h1: 100, h2: 160 },
    });
    expect(r.verdict.en.toLowerCase()).toContain("climbs");
    expect(r.facts.some((f) => f.en.includes("+60%"))).toBe(true);
  });
});
