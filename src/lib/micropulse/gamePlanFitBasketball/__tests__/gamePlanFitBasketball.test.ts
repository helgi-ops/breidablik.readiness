import { describe, it, expect } from "vitest";
import {
  computeBasketballFit, classifyOpponentStyle, ROLE_DEMAND, QUALITY_METRIC,
  type BQualityId, type FitInput,
} from "../index";

const mk = (over: Partial<FitInput>): FitInput => ({
  playerId: "p1", name: "Test Player", position: "PG",
  percentiles: {}, coverageRatio: 1, readinessColor: "GREEN", readinessImputed: false, opponentTag: "balanced",
  ...over,
});

// A guard strong across his demanded skills.
const strongGuard: Partial<Record<BQualityId, number>> = {
  playmaking: 80, perimeter_shooting: 75, ball_security: 70, perimeter_defense: 65, scoring: 60,
};

describe("computeBasketballFit", () => {
  it("strong capacity + green readiness → strong fit", () => {
    const r = computeBasketballFit(mk({ percentiles: strongGuard, readinessColor: "GREEN" }));
    expect(r.family).toBe("GUARD");
    expect(r.capacityTier).toBe("strong");
    expect(r.verdict).toBe("strong");
    expect(r.headline.en).toMatch(/Strong fit/i);
  });

  it("readiness YELLOW gates a strong capacity down to caution, with a GREEN counterfactual", () => {
    const r = computeBasketballFit(mk({ percentiles: strongGuard, readinessColor: "YELLOW" }));
    expect(r.capacityTier).toBe("strong");
    expect(r.verdict).toBe("caution");
    expect(r.counterfactual?.en).toMatch(/GREEN/);
    expect(r.advice?.en).toMatch(/minutes|rotate/i);
  });

  it("low skills for the role → poor even when green", () => {
    const r = computeBasketballFit(mk({ percentiles: { playmaking: 20, perimeter_shooting: 25, ball_security: 30, perimeter_defense: 20, scoring: 25 }, readinessColor: "GREEN" }));
    expect(r.verdict).toBe("poor");
    expect(r.driver.en).toMatch(/limiter/i);
  });

  it("no readiness check-in → unknown, names the missing layer, never guesses", () => {
    const r = computeBasketballFit(mk({ percentiles: strongGuard, readinessColor: null }));
    expect(r.verdict).toBe("unknown");
    expect(r.driver.en).toMatch(/readiness check-in/i);
    expect(r.headline.is.length).toBeGreaterThan(0);
  });

  it("no box-score data → unknown", () => {
    const r = computeBasketballFit(mk({ percentiles: {}, readinessColor: "GREEN" }));
    expect(r.capacityTier).toBe("unknown");
    expect(r.verdict).toBe("unknown");
  });

  it("opponent style re-weights the demand (three-heavy lifts perimeter defence)", () => {
    const balanced = computeBasketballFit(mk({ percentiles: strongGuard, opponentTag: "balanced" }));
    const threeHeavy = computeBasketballFit(mk({ percentiles: strongGuard, opponentTag: "three_heavy" }));
    const wB = balanced.demand.find((d) => d.quality === "perimeter_defense")!.weight;
    const wT = threeHeavy.demand.find((d) => d.quality === "perimeter_defense")!.weight;
    expect(wT).toBeGreaterThan(wB); // perimeter defence matters more vs a three-heavy team
  });

  it("every role-demand weight maps to a real catalog metric", () => {
    for (const fam of Object.keys(ROLE_DEMAND) as Array<keyof typeof ROLE_DEMAND>) {
      for (const q of Object.keys(ROLE_DEMAND[fam]) as BQualityId[]) {
        expect(typeof QUALITY_METRIC[q]).toBe("string");
      }
    }
  });
});

describe("classifyOpponentStyle", () => {
  const league = { threePtRate: 0.35, possessions: 88, oppTurnovers: 13, orebPerGame: 10 };
  it("high three-point share → three_heavy", () => {
    expect(classifyOpponentStyle({ ...league, threePtRate: 0.45 }, league).tag).toBe("three_heavy");
  });
  it("low three-point share → paint_heavy", () => {
    expect(classifyOpponentStyle({ ...league, threePtRate: 0.24 }, league).tag).toBe("paint_heavy");
  });
  it("dominant offensive glass → glass", () => {
    expect(classifyOpponentStyle({ ...league, orebPerGame: 14 }, league).tag).toBe("glass");
  });
  it("no standout → balanced", () => {
    expect(classifyOpponentStyle(league, league).tag).toBe("balanced");
  });
});
