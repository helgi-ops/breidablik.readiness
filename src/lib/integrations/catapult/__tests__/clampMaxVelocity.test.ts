import { test } from "vitest";
import assert from "node:assert/strict";
import { clampMaxVelocityKmh, MAX_PLAUSIBLE_VELOCITY_KMH } from "../normalize";

test("passes plausible football top speeds through unchanged", () => {
  assert.equal(clampMaxVelocityKmh(34.5), 34.5);
  assert.equal(clampMaxVelocityKmh(MAX_PLAUSIBLE_VELOCITY_KMH), 38); // exactly the ceiling is kept
  assert.equal(clampMaxVelocityKmh(0), 0);
});

test("drops impossible spikes to null", () => {
  assert.equal(clampMaxVelocityKmh(38.12), null); // Arnþór — above the ~37 human record
  assert.equal(clampMaxVelocityKmh(59.41), null); // Magnús Arnar
  assert.equal(clampMaxVelocityKmh(6650235.45), null); // lost GPS lock
});

test("null / non-finite in → null out", () => {
  assert.equal(clampMaxVelocityKmh(null), null);
  assert.equal(clampMaxVelocityKmh(undefined), null);
  assert.equal(clampMaxVelocityKmh(Number.NaN), null);
});
