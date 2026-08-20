import { describe, it, expect } from "vitest";
import {
  computeGamePlanFit, classifyOpponentStyle, ROLE_DEMAND, OPPONENT_MODIFIERS,
  type FitInput,
} from "../index";
import type { AthleteProfile, QualityId, QualityRead } from "@/lib/micropulse/playerAnalysis/athleteProfile";

// Minimal AthleteProfile fixture — the engine only reads positionGroup, qualities[].positionPercentile,
// and coverage.ratio, so the rest are filled with valid-but-unused defaults.
function makeProfile(group: string, pctls: Partial<Record<QualityId, number | null>>, ratio = 0.8): AthleteProfile {
  const qualities: QualityRead[] = (Object.keys(pctls) as QualityId[]).map((id) => ({
    id, value: 1, unit: "", source: "GPS", date: null, sampleSize: 6,
    positionPercentile: pctls[id] ?? null, squadPercentile: pctls[id] ?? null,
    benchmark: "position", poolSize: 8, verdict: "neutral", confidence: "high", trend: null,
  }));
  return { playerId: "p", position: group, positionGroup: group, qualities, strengths: [], weaknesses: [],
    coverage: { sources: ["GPS"], qualitiesWithData: qualities.filter((q) => q.positionPercentile != null).length, totalQualities: 13, ratio } };
}

const input = (over: Partial<FitInput>): FitInput => ({
  playerId: "p", name: "Test", position: "CF", profile: null,
  readinessColor: "GREEN", readinessImputed: false, opponentTag: "balanced", ...over,
});

describe("classifyOpponentStyle", () => {
  it("tags high possession as possession, low as direct", () => {
    expect(classifyOpponentStyle({ possession: 60, ppda: 11 }, { possession: 50, ppda: 11 }).tag).toBe("possession");
    expect(classifyOpponentStyle({ possession: 40, ppda: 11 }, { possession: 50, ppda: 11 }).tag).toBe("direct");
  });
  it("tags low PPDA vs league as high_press, high PPDA as low_block", () => {
    expect(classifyOpponentStyle({ possession: 50, ppda: 8 }, { possession: 50, ppda: 11 }).tag).toBe("high_press");
    expect(classifyOpponentStyle({ possession: 50, ppda: 14 }, { possession: 50, ppda: 11 }).tag).toBe("low_block");
  });
  it("falls back to balanced when the numbers are absent", () => {
    expect(classifyOpponentStyle({ possession: null, ppda: null }, { possession: null, ppda: null }).tag).toBe("balanced");
  });
});

describe("role × opponent weighting", () => {
  it("high press up-weights the forward's anaerobic reserve vs balanced", () => {
    const cf = makeProfile("CF", { speed: 50, anaerobic_reserve: 50, acceleration: 50, reactive_power: 50 });
    const balanced = computeGamePlanFit(input({ profile: cf, opponentTag: "balanced" }));
    const press = computeGamePlanFit(input({ profile: cf, opponentTag: "high_press" }));
    const wBal = balanced.demand.find((d) => d.quality === "anaerobic_reserve")!.weight;
    const wPress = press.demand.find((d) => d.quality === "anaerobic_reserve")!.weight;
    expect(wPress).toBeGreaterThan(wBal); // high_press ×1.4 on anaerobic_reserve
    expect(ROLE_DEMAND.CF.speed).toBeGreaterThan(0);
    expect(OPPONENT_MODIFIERS.high_press.deceleration).toBeGreaterThan(1);
  });
});

describe("readiness gate + counterfactual", () => {
  const strongCf = () => makeProfile("CF", { speed: 90, anaerobic_reserve: 88, acceleration: 85, reactive_power: 80 });

  it("strong capacity + GREEN → strong fit", () => {
    const r = computeGamePlanFit(input({ profile: strongCf(), readinessColor: "GREEN" }));
    expect(r.verdict).toBe("strong");
    expect(r.scored).toBe(true);
    expect(r.counterfactual).toBeNull(); // strong needs no counterfactual
  });

  it("strong capacity + RED → poor fit, readiness is the driver, counterfactual restores it", () => {
    const r = computeGamePlanFit(input({ profile: strongCf(), readinessColor: "RED" }));
    expect(r.verdict).toBe("poor");
    expect(r.driver.en.toLowerCase()).toContain("readiness");
    expect(r.counterfactual).not.toBeNull();
    expect(r.counterfactual!.en).toMatch(/GREEN/);
  });

  it("weak capacity + GREEN → capacity is the driver, names the limiting quality", () => {
    const weak = makeProfile("CF", { speed: 20, anaerobic_reserve: 25, acceleration: 30, reactive_power: 35 });
    const r = computeGamePlanFit(input({ profile: weak, readinessColor: "GREEN" }));
    expect(r.verdict).toBe("poor");
    expect(r.counterfactual).not.toBeNull();
    // the highest-weighted shortfall (speed, weight 0.40) should be named
    expect(r.driver.en.toLowerCase()).toContain("speed");
  });
});

describe("confidence + honesty guards", () => {
  it("no profile → not enough to judge, unknown verdict, low confidence", () => {
    const r = computeGamePlanFit(input({ profile: null, readinessColor: "GREEN" }));
    expect(r.verdict).toBe("unknown");
    expect(r.confidence).toBe("low");
    expect(r.headline.en.toLowerCase()).toContain("not enough");
  });

  it("no readiness check-in → unknown (can't gate)", () => {
    const r = computeGamePlanFit(input({ profile: makeProfile("CF", { speed: 90, anaerobic_reserve: 90, acceleration: 90, reactive_power: 90 }), readinessColor: null }));
    expect(r.verdict).toBe("unknown");
  });

  it("imputed readiness caps confidence at moderate", () => {
    const r = computeGamePlanFit(input({ profile: makeProfile("CF", { speed: 90, anaerobic_reserve: 90, acceleration: 90, reactive_power: 90 }), readinessColor: "GREEN", readinessImputed: true }));
    expect(r.confidence).not.toBe("high");
  });

  it("GK is out of scope, not scored", () => {
    const r = computeGamePlanFit(input({ position: "GK", profile: makeProfile("GK", {}), readinessColor: "GREEN" }));
    expect(r.scored).toBe(false);
    expect(r.headline.en.toLowerCase()).toContain("out of scope");
  });
});

describe("CMJ neuromuscular readiness (Janetzki)", () => {
  const strongCf = () => makeProfile("CF", { speed: 90, anaerobic_reserve: 88, acceleration: 85, reactive_power: 80 });

  it("a suppressed CMJ downgrades a GREEN player and becomes the driver", () => {
    const r = computeGamePlanFit(input({ profile: strongCf(), readinessColor: "GREEN", cmj: { dropPct: -12, daysSince: 1 } }));
    expect(r.verdict).not.toBe("strong");           // GREEN wellness would be strong; CMJ pulled it down
    expect(r.cmjTier).toBe("poor");
    expect(r.driver.en.toLowerCase()).toContain("cmj");
    expect(r.counterfactual!.en.toLowerCase()).toContain("cmj");
  });

  it("a fresh CMJ does not change a GREEN strong fit", () => {
    const r = computeGamePlanFit(input({ profile: strongCf(), readinessColor: "GREEN", cmj: { dropPct: 3, daysSince: 1 } }));
    expect(r.verdict).toBe("strong");
    expect(r.cmjTier).toBe("strong");
  });

  it("CMJ can only downgrade — a fresh CMJ never rescues a RED player", () => {
    const r = computeGamePlanFit(input({ profile: strongCf(), readinessColor: "RED", cmj: { dropPct: 5, daysSince: 1 } }));
    expect(r.verdict).toBe("poor");
  });

  it("a stale CMJ is ignored", () => {
    const r = computeGamePlanFit(input({ profile: strongCf(), readinessColor: "GREEN", cmj: { dropPct: -15, daysSince: 30 } }));
    expect(r.cmjTier).toBeNull();
    expect(r.verdict).toBe("strong");
  });
});

describe("per-instruction advice", () => {
  const strongCf = () => makeProfile("CF", { speed: 90, anaerobic_reserve: 88, acceleration: 85, reactive_power: 80 });

  it("strong fit gets no advice", () => {
    expect(computeGamePlanFit(input({ profile: strongCf(), readinessColor: "GREEN" })).advice).toBeNull();
  });
  it("unknown gets no advice", () => {
    expect(computeGamePlanFit(input({ profile: null, readinessColor: "GREEN" })).advice).toBeNull();
  });
  it("readiness-limited → load-management advice", () => {
    const r = computeGamePlanFit(input({ profile: strongCf(), readinessColor: "RED" }));
    expect(r.advice).not.toBeNull();
    expect(r.advice!.en.toLowerCase()).toMatch(/minutes|rotate|manage/);
  });
  it("capacity-limited → the limiting quality's lever", () => {
    // speed is the top CF demand (0.40); a low speed makes it the limiter → speed advice
    const weak = makeProfile("CF", { speed: 15, anaerobic_reserve: 80, acceleration: 80, reactive_power: 80 });
    const r = computeGamePlanFit(input({ profile: weak, readinessColor: "GREEN" }));
    expect(r.advice).not.toBeNull();
    expect(r.advice!.en.toLowerCase()).toContain("foot-race");
  });
});
