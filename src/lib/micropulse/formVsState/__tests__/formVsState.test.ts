import { describe, it, expect } from "vitest";
import { computeFormVsState, type FormInput, type TaggedMatch } from "../index";

let n = 0;
const m = (over: Partial<TaggedMatch>): TaggedMatch => ({
  date: `2026-0${1 + (n % 6)}-${10 + (n++ % 18)}`, opponent: "X",
  output: over.outputPer90 ?? 0.5, outputPer90: 0.5, minutes: 90,
  readinessColor: "GREEN", readinessImputed: false, homeAway: "home", result: "W", opponentLevel: "med",
  ...over,
});

const input = (matches: TaggedMatch[], baselinePer90: number | null = 0.5): FormInput => ({
  playerId: "p", name: "Test", position: "CM",
  primaryMetric: { key: "OBV", label: { en: "OBV", is: "OBV" } },
  baselinePer90, matches,
});

describe("computeFormVsState", () => {
  it("dip driven by compromised matches while clean matches hold → explained by state (+ counterfactual)", () => {
    const matches = [
      m({ outputPer90: 0.20, readinessColor: "RED", homeAway: "away" }),
      m({ outputPer90: 0.22, readinessColor: "YELLOW" }),
      m({ outputPer90: 0.18, readinessColor: "RED", homeAway: "away", opponentLevel: "high" }),
      m({ outputPer90: 0.50, readinessColor: "GREEN" }),
      m({ outputPer90: 0.52, readinessColor: "GREEN" }),
      m({ outputPer90: 0.49, readinessColor: "GREEN" }),
    ];
    const r = computeFormVsState(input(matches, 0.5));
    expect(r.verdict).toBe("explained_by_state");
    expect(r.counterfactual).not.toBeNull();
    expect(r.counterfactual!.en.toLowerCase()).toContain("state, not form");
    expect(r.headline.en.toLowerCase()).toContain("not a form flag");
  });

  it("dip that holds on his clean matches too → genuine form dip", () => {
    const matches = Array.from({ length: 6 }, () => m({ outputPer90: 0.30, readinessColor: "GREEN", homeAway: "home" }));
    const r = computeFormVsState(input(matches, 0.5));
    expect(r.verdict).toBe("genuine_dip");
    expect(r.counterfactual!.en.toLowerCase()).toContain("below his norm");
  });

  it("above norm while mostly compromised → over-performing while compromised", () => {
    const matches = [
      m({ outputPer90: 0.66, readinessColor: "YELLOW" }),
      m({ outputPer90: 0.64, readinessColor: "RED", homeAway: "away" }),
      m({ outputPer90: 0.68, readinessColor: "YELLOW" }),
      m({ outputPer90: 0.65, readinessColor: "GREEN" }),
    ];
    const r = computeFormVsState(input(matches, 0.5));
    expect(r.verdict).toBe("overperforming_compromised");
  });

  it("near his norm → steady", () => {
    const matches = Array.from({ length: 6 }, () => m({ outputPer90: 0.51, readinessColor: "GREEN" }));
    expect(computeFormVsState(input(matches, 0.5)).verdict).toBe("steady");
  });

  it("fewer than 4 graded matches → unknown, tagged history only", () => {
    const matches = [m({ outputPer90: 0.2, readinessColor: "RED" }), m({ outputPer90: 0.2, readinessColor: "RED" }), m({ outputPer90: 0.2, readinessColor: "RED" })];
    const r = computeFormVsState(input(matches, 0.5));
    expect(r.verdict).toBe("unknown");
    expect(r.headline.en.toLowerCase()).toContain("not enough matches");
    expect(r.perMatch).toHaveLength(3); // history still shown
  });

  it("no baseline → unknown (can't judge a trend)", () => {
    const matches = Array.from({ length: 6 }, () => m({ outputPer90: 0.3, readinessColor: "GREEN" }));
    expect(computeFormVsState(input(matches, null)).verdict).toBe("unknown");
  });

  it("mostly-imputed readiness caps confidence at low", () => {
    const matches = Array.from({ length: 6 }, () => m({ outputPer90: 0.3, readinessColor: "GREEN", readinessImputed: true }));
    const r = computeFormVsState(input(matches, 0.5));
    expect(r.confidence).toBe("low");
  });

  // ── V2: context-adjusted expected band ──
  it("V2: raw dip that the context band explains (green matches at norm) → explained_by_state", () => {
    const matches = [
      m({ outputPer90: 0.50, readinessColor: "GREEN" }), m({ outputPer90: 0.50, readinessColor: "GREEN" }), m({ outputPer90: 0.50, readinessColor: "GREEN" }),
      m({ outputPer90: 0.30, readinessColor: "YELLOW" }), m({ outputPer90: 0.30, readinessColor: "YELLOW" }), m({ outputPer90: 0.30, readinessColor: "YELLOW" }),
    ];
    const r = computeFormVsState(input(matches, 0.5));
    expect(r.expected?.adjusted).toBe(true);
    expect(r.expected?.drivers.readiness).toBeCloseTo(-0.4, 1); // amber ~40% below green
    expect(r.expected?.per90).toBeCloseTo(0.4, 2);
    expect(Math.abs(r.expected!.residualPct as number)).toBeLessThan(0.15); // within band
    expect(r.verdict).toBe("explained_by_state");
    expect(r.counterfactual!.en.toLowerCase()).toContain("context");
  });

  it("V2: dip that SURVIVES the context adjustment (green matches also below base) → genuine_dip", () => {
    const matches = [
      m({ outputPer90: 0.30, readinessColor: "GREEN" }), m({ outputPer90: 0.30, readinessColor: "GREEN" }), m({ outputPer90: 0.30, readinessColor: "GREEN" }),
      m({ outputPer90: 0.18, readinessColor: "YELLOW" }), m({ outputPer90: 0.18, readinessColor: "YELLOW" }), m({ outputPer90: 0.18, readinessColor: "YELLOW" }),
    ];
    const r = computeFormVsState(input(matches, 0.5)); // base 0.5, but even his GREEN output is 0.30
    expect(r.expected?.adjusted).toBe(true);
    expect((r.expected!.residualPct as number)).toBeLessThanOrEqual(-0.15); // below the adjusted bar
    expect(r.verdict).toBe("genuine_dip");
    expect(r.counterfactual!.en.toLowerCase()).toContain("survives the context");
  });

  it("V2: a context effect with too few matches per side is not estimated → no band, fallback verdict", () => {
    const matches = [
      ...Array.from({ length: 4 }, () => m({ outputPer90: 0.50, readinessColor: "GREEN" })),
      m({ outputPer90: 0.30, readinessColor: "YELLOW" }), m({ outputPer90: 0.30, readinessColor: "YELLOW" }), // only 2 non-green
    ];
    const r = computeFormVsState(input(matches, 0.5));
    expect(r.expected).toBeNull(); // no side reached minLevelN=3
  });

  it("matches with no readiness colour are excluded from the graded window", () => {
    const matches = [
      ...Array.from({ length: 4 }, () => m({ outputPer90: 0.5, readinessColor: "GREEN" })),
      m({ outputPer90: 0.9, readinessColor: null }), // ungraded — must not move the mean
    ];
    const r = computeFormVsState(input(matches, 0.5));
    expect(r.gradedN).toBe(4);
    expect(r.windowMean).toBeCloseTo(0.5, 5);
  });
});
