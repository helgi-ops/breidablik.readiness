import { test } from "vitest";
import assert from "node:assert/strict";
import {
  classifyPhaseChange,
  worstRealChange,
  METRIC_META,
  PHASE_NOISE_K,
} from "../phaseChange";

// A tight baseline (SD 0) isolates the LITERATURE CV as the noise floor, so
// these tests prove the gate on the metric's known measurement noise alone.
function flatBaseline(value: number, n: number): number[] {
  return Array.from({ length: n }, () => value);
}

test("THE ACCEPTANCE TEST: a 10% move flags a low-CV metric but NOT a high-CV metric", () => {
  // Jump height CV ~5.3% → threshold ~7.95% → a 10% drop is REAL.
  const jh = classifyPhaseChange({
    metric: "jumpHeight",
    latest: 90, // −10% vs 100
    baselineValues: flatBaseline(100, 6),
  });
  assert.equal(jh.status, "real", `jump height 10% drop should flag; got ${jh.status}`);

  // RFD CV ~16.2% → threshold ~24.3% → the SAME 10% drop is NOISE.
  const rfd = classifyPhaseChange({
    metric: "meanRFD",
    latest: 90, // −10% vs 100
    baselineValues: flatBaseline(100, 6),
  });
  assert.equal(rfd.status, "noise", `RFD 10% drop must NOT flag; got ${rfd.status}`);
});

test("a time metric flags when contraction time INCREASES (slower = worse)", () => {
  // timeToTakeoff CV ~7.7% → threshold ~11.55%. +15% is worse (slower) and real.
  const slower = classifyPhaseChange({
    metric: "timeToTakeoff",
    latest: 690, // +15% vs 600
    baselineValues: flatBaseline(600, 6),
  });
  assert.equal(slower.status, "real");
  assert.equal(slower.worse, true);

  // A DECREASE in contraction time (faster) is a good move → not a fatigue flag.
  const faster = classifyPhaseChange({
    metric: "timeToTakeoff",
    latest: 510, // −15% vs 600
    baselineValues: flatBaseline(600, 6),
  });
  assert.equal(faster.worse, false);
  assert.notEqual(faster.status, "real");
});

test("a change that clears metric noise but not the player's wider CV is worth-watching, not real", () => {
  // Player is noisy: baseline mean 100, SD 15 → observed CV 15% (mature, n≥5).
  // effectiveCV = max(literature 5.3, 15) = 15 → threshold 22.5%. A 10% drop
  // clears the literature floor (7.95%) but NOT the personal floor → worth-watching.
  const noisyBaseline = [70, 85, 100, 115, 130, 100]; // mean 100, SD ~20
  const res = classifyPhaseChange({
    metric: "jumpHeight",
    latest: 90,
    baselineValues: noisyBaseline,
  });
  assert.ok(res.playerCvPct != null && res.playerCvPct > res.literatureCvPct, "player CV should widen the floor");
  assert.equal(res.status, "worth-watching");
});

test("the player CV never NARROWS the floor below the literature value", () => {
  // Extremely consistent player (SD 0) → observed CV 0, but the effective CV
  // must stay at the literature value, so a sub-literature move is still noise.
  const res = classifyPhaseChange({
    metric: "jumpHeight",
    latest: 96, // −4% vs 100, below the 7.95% literature floor
    baselineValues: flatBaseline(100, 8),
  });
  assert.equal(res.effectiveCvPct, METRIC_META.jumpHeight.cvPct);
  assert.equal(res.status, "noise");
});

test("thin or empty baselines are insufficient, never a fabricated flag", () => {
  assert.equal(
    classifyPhaseChange({ metric: "peakForce", latest: 2000, baselineValues: [] }).status,
    "insufficient",
  );
  assert.equal(
    classifyPhaseChange({ metric: "peakForce", latest: 2000, baselineValues: [1900, 2100] }).status,
    "insufficient",
  );
  // null latest is insufficient regardless of baseline depth.
  assert.equal(
    classifyPhaseChange({ metric: "peakForce", latest: null, baselineValues: flatBaseline(2000, 8) }).status,
    "insufficient",
  );
});

test("worstRealChange picks the largest gate-relative move and ignores non-real", () => {
  const results = [
    classifyPhaseChange({ metric: "jumpHeight", latest: 91, baselineValues: flatBaseline(100, 6) }), // −9%, real, small excess
    classifyPhaseChange({ metric: "peakForce", latest: 1600, baselineValues: flatBaseline(2000, 6) }), // −20%, real, big excess
    classifyPhaseChange({ metric: "meanRFD", latest: 90, baselineValues: flatBaseline(100, 6) }), // noise
  ];
  const worst = worstRealChange(results);
  assert.equal(worst?.metric, "peakForce");

  const noneReal = worstRealChange([
    classifyPhaseChange({ metric: "meanRFD", latest: 95, baselineValues: flatBaseline(100, 6) }),
  ]);
  assert.equal(noneReal, null);
});

test("every metric carries an EN and an IS string for every status", () => {
  const metrics = Object.keys(METRIC_META) as Array<keyof typeof METRIC_META>;
  for (const metric of metrics) {
    // real (worse), noise, worth-watching (good move), insufficient
    const worse = METRIC_META[metric].worse;
    const bigWorseLatest = worse === "decrease" ? 50 : 200; // vs baseline 100 → clearly worse
    const cases = [
      classifyPhaseChange({ metric, latest: bigWorseLatest, baselineValues: flatBaseline(100, 6) }),
      classifyPhaseChange({ metric, latest: 100, baselineValues: flatBaseline(100, 6) }),
      classifyPhaseChange({ metric, latest: null, baselineValues: [] }),
    ];
    for (const c of cases) {
      assert.ok(c.label.en.trim().length > 0, `${metric}/${c.status} missing EN`);
      assert.ok(c.label.is.trim().length > 0, `${metric}/${c.status} missing IS`);
      assert.notEqual(c.label.en, c.label.is, `${metric}/${c.status} EN and IS identical`);
    }
  }
});

test("PHASE_NOISE_K scales the threshold as documented", () => {
  const res = classifyPhaseChange({ metric: "jumpHeight", latest: 90, baselineValues: flatBaseline(100, 8) });
  assert.ok(Math.abs(res.thresholdPct - METRIC_META.jumpHeight.cvPct * PHASE_NOISE_K) < 1e-9);
});
