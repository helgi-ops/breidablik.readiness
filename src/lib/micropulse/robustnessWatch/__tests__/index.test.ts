import { describe, it, expect } from "vitest";
import { computeRobustnessWatch, type RobustnessWatchInput } from "../index";
import type { SignalPack } from "@/lib/micropulse/signalPack";
import type { InjuryRiskDecision } from "@/lib/micropulse/injuryRisk";
import type { CmjFatigueRead } from "@/lib/micropulse/cmjFatigue";

const emptyPack: SignalPack = { contributors: [], flaggedCount: 0, citation: "" };

function injury(level: InjuryRiskDecision["injuryRiskLevel"], confidence: InjuryRiskDecision["confidence"]): InjuryRiskDecision {
  return { injuryRiskLevel: level, confidence, riskScore: 0, why: [], modifiableDrivers: [], recommendation: [] };
}

function base(over: Partial<RobustnessWatchInput> = {}): RobustnessWatchInput {
  return {
    asOf: "2026-08-24",
    playerId: "p1",
    playerName: "Test Player",
    signalPack: emptyPack,
    injury: injury("LOW", "high"),
    cmj: null,
    trend: "stable",
    mechanical: { runningAsymmetryZ: null, runningAsymmetryPct: null, footstrikesZ: null, rhieBoutsZ: null, hasLoadSpike: false },
    coverage: { loadDays: 30, cmjTests: 6 },
    ...over,
  };
}

describe("computeRobustnessWatch — level gating", () => {
  it("LOW injury -> steady, no counterfactual", () => {
    const r = computeRobustnessWatch(base());
    expect(r.level).toBe("steady");
    expect(r.counterfactual).toBeNull();
    expect(r.verdict.en).toMatch(/steady/i);
  });

  it("MODERATE injury -> watch", () => {
    const r = computeRobustnessWatch(base({ injury: injury("MODERATE", "high") }));
    expect(r.level).toBe("watch");
  });

  it("HIGH injury + high confidence -> elevated", () => {
    const r = computeRobustnessWatch(base({ injury: injury("HIGH", "high") }));
    expect(r.level).toBe("elevated");
  });

  it("HIGH injury + LOW confidence is capped to watch (never a hard elevated on thin data)", () => {
    const r = computeRobustnessWatch(base({ injury: injury("HIGH", "low"), coverage: { loadDays: 30, cmjTests: 6 } }));
    // confidence floor is min(coverage, injury) = low -> cap
    expect(r.confidence).toBe("low");
    expect(r.level).toBe("watch");
  });

  it("thin CMJ + thin load forces low confidence", () => {
    const r = computeRobustnessWatch(base({ coverage: { loadDays: 5, cmjTests: 1 } }));
    expect(r.confidence).toBe("low");
  });
});

describe("computeRobustnessWatch — contributors", () => {
  it("adds a flagged running-asymmetry contributor and surfaces its counterfactual", () => {
    const r = computeRobustnessWatch(base({
      injury: injury("MODERATE", "high"),
      mechanical: { runningAsymmetryZ: 1.8, runningAsymmetryPct: 12, footstrikesZ: null, rhieBoutsZ: null, hasLoadSpike: false },
    }));
    const c = r.contributors.find((x) => x.key === "running_asymmetry");
    expect(c).toBeTruthy();
    expect(c!.flagged).toBe(true);
    expect(r.counterfactual?.en).toMatch(/asymmetry/i);
  });

  it("running-asymmetry below +1.5σ is present but not flagged", () => {
    const r = computeRobustnessWatch(base({
      mechanical: { runningAsymmetryZ: 1.0, runningAsymmetryPct: 8, footstrikesZ: null, rhieBoutsZ: null, hasLoadSpike: false },
    }));
    const c = r.contributors.find((x) => x.key === "running_asymmetry");
    expect(c!.flagged).toBe(false);
  });

  it("surfaces fatigueType only when the CMJ reads fatigued", () => {
    const cmjDown: CmjFatigueRead = {
      hasData: true, cmjSlopeZ: -1.4, latestZ: -1.2, cmjFatigued: true, fatigueType: "peripheral",
      cmjRecoveryDeficit: 0.12, recoveryLabel: "slow", confidence: "high",
      verdict: { en: "", is: "" }, facts: [], citation: "",
    };
    const r = computeRobustnessWatch(base({ injury: injury("MODERATE", "high"), cmj: cmjDown }));
    expect(r.fatigueType).toBe("peripheral");
    expect(r.contributors.some((c) => c.key === "cmj_trend" && c.flagged)).toBe(true);
    expect(r.contributors.some((c) => c.key === "cmj_recovery" && c.flagged)).toBe(true);
  });

  it("no fatigueType when CMJ steady", () => {
    const cmjSteady: CmjFatigueRead = {
      hasData: true, cmjSlopeZ: 0.1, latestZ: 0, cmjFatigued: false, fatigueType: null,
      cmjRecoveryDeficit: 0, recoveryLabel: "on_track", confidence: "high",
      verdict: { en: "", is: "" }, facts: [], citation: "",
    };
    const r = computeRobustnessWatch(base({ cmj: cmjSteady }));
    expect(r.fatigueType).toBeNull();
  });

  it("tracks present vs missing #5 inputs for provenance", () => {
    const r = computeRobustnessWatch(base({
      mechanical: { runningAsymmetryZ: 1.0, runningAsymmetryPct: 8, footstrikesZ: null, rhieBoutsZ: null, hasLoadSpike: false },
    }));
    expect(r.presentInputs).toContain("running_asymmetry");
    expect(r.missingInputs).toContain("footstrikes");
    expect(r.missingInputs).toContain("rhie");
  });
});
