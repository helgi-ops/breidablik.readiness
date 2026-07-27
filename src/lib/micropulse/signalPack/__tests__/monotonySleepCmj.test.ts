import { test } from "vitest";
import assert from "node:assert/strict";
import { weeklyMonotony, monotonyContributor } from "../monotony";
import { sleepContributor, cmjJumpContributor, cmjAsymContributor } from "../sleepCmj";

// ── Monotony ────────────────────────────────────────────────────────────────
test("weeklyMonotony: thin week → null; flat week → maximal; varied week → low", () => {
  assert.equal(weeklyMonotony([300, 300]), null);          // <3 days
  assert.equal(weeklyMonotony([300, 300, 300, 300]), 3);   // no variation → capped high
  assert.ok(weeklyMonotony([0, 600, 100, 500, 0, 400])! < 2, "varied week is low-monotony");
});

test("monotonyContributor: flags a samey week vs own norm with a counterfactual", () => {
  // A samey week (monotony ~2.5) vs a norm of 1.2 → ratio ~2× → flag.
  const c = monotonyContributor({ weekLoads: [400, 420, 400, 410, 400, 420], monotonyNorm: 1.2, coverageDays: 25 })!;
  assert.equal(c.flagged, true);
  assert.ok(c.counterfactual && /variation|tilbreyt/i.test(c.counterfactual.en + c.counterfactual.is));
  const ok = monotonyContributor({ weekLoads: [0, 600, 100, 500, 0, 400], monotonyNorm: 1.2, coverageDays: 25 })!;
  assert.equal(ok.flagged, false);
  assert.equal(ok.counterfactual, null);
});

// ── Sleep ───────────────────────────────────────────────────────────────────
test("sleepContributor: no data → null; below own norm → flag + counterfactual", () => {
  assert.equal(sleepContributor({ recent: null, baselineMean: 4, baselineSd: 0.5, coverageDays: 20 }), null);
  const low = sleepContributor({ recent: 2.5, baselineMean: 4, baselineSd: 0.5, coverageDays: 20 })!; // z −3
  assert.equal(low.flagged, true);
  assert.match(low.counterfactual!.en, /4\.0\/5/);
  const ok = sleepContributor({ recent: 4, baselineMean: 4, baselineSd: 0.5, coverageDays: 20 })!;
  assert.equal(ok.flagged, false);
});

// ── CMJ ─────────────────────────────────────────────────────────────────────
test("cmjJumpContributor: a drop below his baseline flags; at baseline clears", () => {
  const down = cmjJumpContributor({ latest: 34, baselineMean: 38, baselineSd: 2, testCount: 8 })!; // z −2
  assert.equal(down.flagged, true);
  assert.equal(down.confidence, "high");
  assert.match(down.counterfactual!.en, /38\.0 cm/);
  const ok = cmjJumpContributor({ latest: 38, baselineMean: 38, baselineSd: 2, testCount: 2 })!;
  assert.equal(ok.flagged, false);
  assert.equal(ok.confidence, "low"); // n=2
});

test("cmjAsymContributor: >10% flags with a counterfactual; ≤10% clears; null on no data", () => {
  assert.equal(cmjAsymContributor({ asymPct: null, testCount: 3 }), null);
  const hi = cmjAsymContributor({ asymPct: 14, testCount: 3 })!;
  assert.equal(hi.flagged, true);
  assert.match(hi.counterfactual!.en, /≤10%/);
  const ok = cmjAsymContributor({ asymPct: 6, testCount: 3 })!;
  assert.equal(ok.flagged, false);
  assert.equal(ok.counterfactual, null);
});
