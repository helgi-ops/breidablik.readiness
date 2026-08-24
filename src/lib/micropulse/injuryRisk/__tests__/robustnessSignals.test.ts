import { test } from "vitest";
import assert from "node:assert/strict";
import { evaluateInjuryRiskRules } from "../rules";
import { buildInjuryRiskDecision } from "../index";
import type { InjuryRiskInput } from "../types";

// A clean baseline input: no signals present → LOW, no robustness rules fire.
function clean(o: Partial<InjuryRiskInput> = {}): InjuryRiskInput {
  return { acwr: 1.0, deltaZ: 0, volatility: 10, sleepScore: 4, hrvChangePct: 0, sorenessScore: 4, highSpeedRunning: 400, ...o };
}

// ── Null-safety: absent robustness inputs never fabricate a rule ──────────────
test("robustness inputs null → no robustness rules, LOW risk", () => {
  const r = evaluateInjuryRiskRules(clean());
  const robustness = r.triggeredRules.filter((x) =>
    /RUNNING_ASYMMETRY|FOOTSTRIKE|RHIE|CMJ_/.test(x));
  assert.equal(robustness.length, 0);
  assert.equal(r.injuryRiskLevel, "LOW");
});

// ── Running asymmetry: personal-z gated, escalates under strain ───────────────
test("running asymmetry below +1.5σ does not fire", () => {
  const r = evaluateInjuryRiskRules(clean({ runningAsymmetryZ: 1.0 }));
  assert.ok(!r.triggeredRules.includes("RUNNING_ASYMMETRY_RISING"));
});

test("running asymmetry ≥ +1.5σ fires the mild rule (+1)", () => {
  const base = evaluateInjuryRiskRules(clean());
  const r = evaluateInjuryRiskRules(clean({ runningAsymmetryZ: 1.6 }));
  assert.ok(r.triggeredRules.includes("RUNNING_ASYMMETRY_RISING"));
  assert.equal(r.riskScore, base.riskScore + 1);
});

test("running asymmetry under poor recovery escalates to +2", () => {
  // sleepScore 2 → poorRecovery; isolate the delta from the asymmetry rule.
  const withRecoveryOnly = evaluateInjuryRiskRules(clean({ sleepScore: 2 }));
  const withBoth = evaluateInjuryRiskRules(clean({ sleepScore: 2, runningAsymmetryZ: 1.6 }));
  assert.ok(withBoth.triggeredRules.includes("RUNNING_ASYMMETRY_WITH_STRAIN"));
  assert.ok(!withBoth.triggeredRules.includes("RUNNING_ASYMMETRY_RISING"));
  assert.equal(withBoth.riskScore, withRecoveryOnly.riskScore + 2);
});

// ── Footstrike volume: hard-gated at +2σ (supporting signal) ──────────────────
test("footstrike spike gated at +2σ", () => {
  assert.ok(!evaluateInjuryRiskRules(clean({ footstrikesZ: 1.9 })).triggeredRules.includes("FOOTSTRIKE_VOLUME_SPIKE"));
  assert.ok(evaluateInjuryRiskRules(clean({ footstrikesZ: 2.1 })).triggeredRules.includes("FOOTSTRIKE_VOLUME_SPIKE"));
});

// ── RHIE: load-shape modifier, escalates with a volume spike ──────────────────
test("RHIE spike alone is +1; with load spike is +2", () => {
  const alone = evaluateInjuryRiskRules(clean({ rhieBoutsZ: 1.6 }));
  assert.ok(alone.triggeredRules.includes("RHIE_SPIKE"));

  const baseSpike = evaluateInjuryRiskRules(clean({ acwr: 1.4 })); // elevatedAcwr
  const withRhie = evaluateInjuryRiskRules(clean({ acwr: 1.4, rhieBoutsZ: 1.6 }));
  assert.ok(withRhie.triggeredRules.includes("RHIE_SPIKE_WITH_LOAD"));
  assert.equal(withRhie.riskScore, baseSpike.riskScore + 2);
});

// ── CMJ fatigue slope: read the multi-day trend, personal-z gated ─────────────
test("CMJ slope ≤ -1σ fires; escalates under strain", () => {
  assert.ok(evaluateInjuryRiskRules(clean({ cmjSlopeZ: -1.2 })).triggeredRules.includes("CMJ_FATIGUE_TREND"));
  assert.ok(!evaluateInjuryRiskRules(clean({ cmjSlopeZ: -0.5 })).triggeredRules.includes("CMJ_FATIGUE_TREND"));
  assert.ok(evaluateInjuryRiskRules(clean({ cmjSlopeZ: -1.2, sleepScore: 2 })).triggeredRules.includes("CMJ_FATIGUE_TREND_WITH_STRAIN"));
});

// ── CMJ recovery deficit: two-tier by size ────────────────────────────────────
test("CMJ recovery deficit tiers at 0.05 / 0.10", () => {
  assert.ok(!evaluateInjuryRiskRules(clean({ cmjRecoveryDeficit: 0.03 })).triggeredRules.some((x) => x.startsWith("CMJ_RECOVERY_DEFICIT")));
  assert.ok(evaluateInjuryRiskRules(clean({ cmjRecoveryDeficit: 0.06 })).triggeredRules.includes("CMJ_RECOVERY_DEFICIT"));
  assert.ok(evaluateInjuryRiskRules(clean({ cmjRecoveryDeficit: 0.12 })).triggeredRules.includes("CMJ_RECOVERY_DEFICIT_HIGH"));
});

// ── Explainability: new rules surface a plain "why" + driver ──────────────────
test("decision exposes plain why + driver for a robustness signal", () => {
  const d = buildInjuryRiskDecision(clean({ runningAsymmetryZ: 1.8, cmjSlopeZ: -1.3 }));
  assert.ok(d.why.some((w) => /asymmetry|jump/i.test(w)));
  assert.ok(d.modifiableDrivers.some((x) => /asymmetry|CMJ/i.test(x)));
});

// ── Specificity guard: a single mild robustness signal must NOT reach HIGH ─────
test("one mild robustness signal stays LOW/MODERATE, never HIGH", () => {
  const d = buildInjuryRiskDecision(clean({ runningAsymmetryZ: 1.6 }));
  assert.notEqual(d.injuryRiskLevel, "HIGH");
});
