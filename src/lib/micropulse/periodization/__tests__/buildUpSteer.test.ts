import { test } from "vitest";
import assert from "node:assert/strict";
import { computeBuildUpSteer, isHintOnly, WEAKNESS_AXIS, type WeaknessInput } from "../buildUpSteer";

const w = (id: WeaknessInput["id"], p: number, over: Partial<WeaknessInput> = {}): WeaknessInput =>
  ({ id, percentile: p, confidence: "high", benchmark: "position", poolSize: 8, ...over });

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
