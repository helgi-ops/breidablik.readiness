import { test } from "vitest";
import assert from "node:assert/strict";
import { ewma, ewmaAcwr, acwrContributor } from "../ewmaAcwr";

test("ewma: empty → null; constant → constant; short span reacts faster", () => {
  assert.equal(ewma([], 7), null);
  assert.equal(ewma([5, 5, 5], 7), 5);
  const spike = [0, 0, 0, 0, 0, 0, 100];
  assert.ok(ewma(spike, 7)! > ewma(spike, 28)!);
});

test("ewmaAcwr: ratio null without a chronic base; >1 after a ramp", () => {
  assert.equal(ewmaAcwr([]).ratio, null);
  const flat = new Array(35).fill(200);
  const r1 = ewmaAcwr(flat).ratio!;
  assert.ok(Math.abs(r1 - 1) < 0.05, `flat load → ~1, got ${r1}`);
  const ramp = [...new Array(28).fill(150), 700, 700, 700, 700, 700, 700, 700];
  assert.ok(ewmaAcwr(ramp).ratio! > 1.5, "a heavy last week spikes acute:chronic");
});

test("acwrContributor: null on no ratio; flags only above threshold; counterfactual matches", () => {
  const metric = { en: "deceleration load", is: "hemlunar-álag" };
  // No chronic base → no signal (never a fabricated 0).
  assert.equal(acwrContributor({ key: "decel_acwr", metric, acwr: { acute: null, chronic: null, ratio: null }, coverageDays: 5, citation: "Saberisani 2025" }), null);

  // Within norm (1.1×) → not flagged, no counterfactual.
  const ok = acwrContributor({ key: "decel_acwr", metric, acwr: { acute: 110, chronic: 100, ratio: 1.1 }, coverageDays: 25, citation: "Saberisani 2025" })!;
  assert.equal(ok.flagged, false);
  assert.equal(ok.counterfactual, null);
  assert.equal(ok.confidence, "high"); // ≥21 days

  // Over threshold (1.6×) → flagged, with a counterfactual that names the clear line.
  const hot = acwrContributor({ key: "decel_acwr", metric, acwr: { acute: 160, chronic: 100, ratio: 1.6 }, coverageDays: 25, citation: "Saberisani 2025" })!;
  assert.equal(hot.flagged, true);
  assert.ok(hot.counterfactual != null);
  assert.match(hot.counterfactual!.en, /1\.6×/);
  assert.match(hot.counterfactual!.en, /≤1\.3×/);
  assert.ok(hot.severity > ok.severity, "hotter ratio ranks higher");
  // Bilingual everywhere.
  for (const b of [hot.label, hot.why, hot.detail, hot.counterfactual!]) assert.ok(b.en && b.is && b.en !== b.is);
});

test("acwrContributor: thin coverage → low confidence", () => {
  const c = acwrContributor({ key: "hsr_acwr", metric: { en: "high-speed running", is: "háhraðahlaup" }, acwr: { acute: 90, chronic: 100, ratio: 0.9 }, coverageDays: 6, citation: "Saberisani 2025" })!;
  assert.equal(c.confidence, "low");
  assert.equal(c.flagged, false);
});
