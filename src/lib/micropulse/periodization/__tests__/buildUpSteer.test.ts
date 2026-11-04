import { test } from "vitest";
import assert from "node:assert/strict";
import { computeBuildUpSteer, isHintOnly, WEAKNESS_AXIS, TLYP_METRIC_AXIS, type WeaknessInput, type ExposureInput } from "../buildUpSteer";

const w = (id: WeaknessInput["id"], p: number, over: Partial<WeaknessInput> = {}): WeaknessInput =>
  ({ id, percentile: p, confidence: "high", benchmark: "position", poolSize: 8, ...over });
const ex = (key: string, flag: "under" | "gap", pct: number): ExposureInput =>
  ({ key, axis: TLYP_METRIC_AXIS[key].axis, label: TLYP_METRIC_AXIS[key].label, flag, pct });

test("computeBuildUpSteer: a confident running weakness biases the HSR axis; mechanical stays neutral", () => {
  const s = computeBuildUpSteer([w("work_capacity", 12)]);
  assert.ok(s.hsrBoost > 1 && s.mechBoost === 1);
  assert.equal(s.hasHard, true);
  assert.equal(s.targets[0].axis, "hsr");
  assert.equal(WEAKNESS_AXIS.acceleration.axis, "mech");
});

test("computeBuildUpSteer: a confident acceleration weakness biases the mechanical axis", () => {
  const s = computeBuildUpSteer([w("acceleration", 20)]);
  assert.ok(s.mechBoost > 1 && s.hsrBoost === 1);
  assert.equal(s.targets[0].axis, "mech");
});

test("computeBuildUpSteer: low-confidence / small-pool weaknesses are HINTS — surfaced, never biased", () => {
  const s = computeBuildUpSteer([w("work_capacity", 10, { confidence: "low" }), w("acceleration", 15, { poolSize: 2 }), w("speed", 18, { benchmark: "squad" })]);
  assert.equal(s.hsrBoost, 1); assert.equal(s.mechBoost, 1); // nothing confident → no bias
  assert.equal(s.hasHard, false);
  assert.equal(s.targets.length, 3);
  assert.ok(s.targets.every((t) => t.hint));
  assert.ok(isHintOnly(w("x" as WeaknessInput["id"], 5, { poolSize: 3 })));
});

test("computeBuildUpSteer: strength qualities route to the VALD focus, not the GPS ramp; boosts are capped", () => {
  const s = computeBuildUpSteer([w("max_strength", 8), w("vbt_power", 14), w("work_capacity", 10), w("aerobic_endurance", 11)]);
  assert.equal(s.strengthTargets.length, 2);           // max_strength + vbt_power → VALD side
  assert.ok(s.strengthTargets.every((t) => t.axis === "strength"));
  assert.ok(s.hsrBoost <= 1.2);                          // two HSR weaknesses don't compound past the cap
  assert.equal(s.targets.every((t) => t.axis !== "strength"), true);
  // Worst-percentile first among the GPS targets.
  assert.ok((s.targets[0].percentile ?? 100) <= (s.targets[1].percentile ?? 100));
});

test("computeBuildUpSteer: a TLYP under-exposure biases its axis; a mild gap is a hint only", () => {
  const s = computeBuildUpSteer([], [ex("hsr_dist", "under", 42), ex("ima_decel", "gap", 68)]);
  assert.ok(s.hsrBoost > 1);            // under-exposed HSR → HSR axis biased
  assert.equal(s.mechBoost, 1);          // the decel "gap" is a hint, never biases
  assert.equal(s.hasHard, true);
  assert.equal(s.exposureTargets.length, 2);
  assert.equal(s.exposureTargets.find((e) => e.key === "ima_decel")!.hint, true);
  assert.equal(s.exposureTargets.find((e) => e.key === "hsr_dist")!.hint, false);
  // Worst-exposed (lowest pct) first.
  assert.equal(s.exposureTargets[0].key, "hsr_dist");
});

test("computeBuildUpSteer: weakness + exposure on the same axis don't compound past the +20% cap", () => {
  const s = computeBuildUpSteer([w("acceleration", 15)], [ex("ima_cod", "under", 30)]); // both → mech
  assert.ok(s.mechBoost <= 1.2);
  assert.equal(s.hasHard, true);
});

test("computeBuildUpSteer: exposure-only (no athlete weaknesses) still produces a steer", () => {
  const s = computeBuildUpSteer([], [ex("sprint_eff", "under", 38)]);
  assert.equal(s.targets.length, 0);
  assert.ok(s.hsrBoost > 1 && s.hasHard);
});

test("computeBuildUpSteer: an under-trained movement family tilts the direction split; small gaps are hints", () => {
  // dir 3 + 9 → lateral (sum 0.10 ≥ flag) → biased; dir 12 → forward (0.02 < flag) → hint only.
  const s = computeBuildUpSteer([], [], [{ dir: "3", delta: 0.06 }, { dir: "9", delta: 0.04 }, { dir: "12", delta: 0.02 }]);
  assert.ok(s.dirEmph.lat > 1);
  assert.equal(s.dirEmph.fwd, 1);
  assert.equal(s.dirEmph.back, 1);
  assert.equal(s.hasHard, true);
  assert.equal(s.dirTargets.find((d) => d.family === "lat")!.hint, false);
  assert.equal(s.dirTargets.find((d) => d.family === "fwd")!.hint, true);
  assert.equal(s.dirTargets[0].family, "lat"); // biggest gap first
});

test("computeBuildUpSteer: no shape dirs → neutral direction emphasis (unaffected)", () => {
  const s = computeBuildUpSteer([w("work_capacity", 12)]);
  assert.deepEqual(s.dirEmph, { fwd: 1, back: 1, lat: 1 });
  assert.equal(s.dirTargets.length, 0);
});
