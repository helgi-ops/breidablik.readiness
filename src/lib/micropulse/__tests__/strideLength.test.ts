import { test } from "vitest";
import assert from "node:assert/strict";
import {
  assessStrideLength,
  classifySession,
  strideLength,
  type StrideSession,
} from "../strideLength";

/** Ágúst Orri Þorsteinsson — real Breiðablik data (player_external_load_daily). */
const match = (date: string, distM: number, strides: number): StrideSession => ({
  date,
  kind: "match",
  highCadenceDistanceM: distM,
  highCadenceStrides: strides,
});

// His prior full matches (minutes ≥ 80), band5-8 distance ÷ strides.
const HISTORY: StrideSession[] = [
  match("2026-05-08", 2340.84046, 997), // 2.348 m
  match("2026-05-17", 1961.72915, 865), // 2.268 m
  match("2026-05-22", 1872.37489, 768), // 2.438 m
  match("2026-06-12", 1229.62891, 478), // 2.572 m
];
// The full-90 match that hid in plain sight: 91 m/min, strides ~21% short.
const AGUST_0616 = match("2026-06-16", 529.19799, 279); // 1.897 m

test("the Ágúst Orri 2026-06-16 full match flags shortened at ~-21%", () => {
  const r = assessStrideLength(AGUST_0616, HISTORY);
  assert.equal(r.verdict, "shortened");
  assert.equal(r.strideLengthM, 1.897);
  assert.ok(r.deltaPct != null && r.deltaPct < -18 && r.deltaPct > -24, `deltaPct was ${r.deltaPct}`);
  assert.equal(r.historyN, 4);
  // both languages carry the plain "why"
  assert.ok(/shorter/i.test(r.reason));
  assert.ok(/styttri/i.test(r.reasonIs));
});

test("a light session is unmeasurable, and says so — never a green tick", () => {
  const light: StrideSession = {
    date: "2026-06-14",
    kind: "light_session",
    highCadenceDistanceM: 457.3,
    highCadenceStrides: 257,
  };
  const r = assessStrideLength(light, []);
  assert.equal(r.verdict, "unmeasurable");
  assert.ok(/three times|þrefalt/i.test(`${r.reason} ${r.reasonIs}`));
});

test("classifySession uses minutes first, distance only as fallback", () => {
  assert.equal(classifySession(90, 8222), "match");
  assert.equal(classifySession(88, null), "match");
  assert.equal(classifySession(60, null), "big_session");
  assert.equal(classifySession(20, 12000), "light_session"); // minutes win over big distance
  assert.equal(classifySession(null, 8222), "match"); // fallback
  assert.equal(classifySession(null, 3000), "light_session");
});

test("stride length needs enough strides to be meaningful", () => {
  assert.equal(strideLength({ date: "d", kind: "match", highCadenceDistanceM: 100, highCadenceStrides: 20 }), null);
  assert.equal(strideLength({ date: "d", kind: "match", highCadenceDistanceM: 529.2, highCadenceStrides: 279 }), 1.897);
});
