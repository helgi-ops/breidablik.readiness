import { test } from "vitest";
import assert from "node:assert/strict";
import {
  computeBasketballIndoorLoad,
  PROVISIONAL_WEIGHTS,
  type BballLoadRow,
  type Bi,
} from "../indoorLoad/basketball";

function assertBilingual(b: Bi, label: string) {
  assert.ok(b.en && b.en.trim().length > 0, `${label}: empty EN`);
  assert.ok(b.is && b.is.trim().length > 0, `${label}: empty IS`);
  assert.notEqual(b.en, b.is, `${label}: IS is a copy of EN`);
}

const day = (n: number) => `2026-07-${String(n).padStart(2, "0")}`;

// A steady player whose every session equals his own average → each session ~100.
function steady(count: number): BballLoadRow[] {
  return Array.from({ length: count }, (_, i) => ({
    date: day(i + 1),
    playerLoad: 400,
    highAccel: 20,
    highDecel: 18,
    highCod: 12,
    jumps: 30,
  }));
}

test("a session equal to the player's own baseline scores ~100", () => {
  const res = computeBasketballIndoorLoad(steady(14));
  assert.ok(res.latest);
  assert.ok(Math.abs((res.latest!.score ?? 0) - 100) < 0.5, `score ${res.latest!.score}`);
  assert.equal(res.latest!.band, "typical");
  assert.equal(res.latest!.components.playerLoad, 100);
  assert.equal(res.latest!.components.highIntensityIma, 100);
  assert.equal(res.latest!.components.jumps, 100);
});

test("a heavy final session scores above baseline and bands up", () => {
  const rows = steady(10);
  rows.push({ date: day(11), playerLoad: 640, highAccel: 40, highDecel: 32, highCod: 24, jumps: 60 }); // ~160% across the board
  const res = computeBasketballIndoorLoad(rows);
  assert.ok((res.latest!.score ?? 0) > 140, `score ${res.latest!.score}`);
  assert.equal(res.latest!.band, "spike");
});

test("a missing component renormalises the others — no NaN, weights don't leak", () => {
  // No jumps anywhere; PlayerLoad + IMA only. A session at 100/100 must still score 100,
  // not be dragged by a phantom jumps term.
  const rows: BballLoadRow[] = Array.from({ length: 8 }, (_, i) => ({
    date: day(i + 1),
    playerLoad: 400,
    highAccel: 20,
    highDecel: 20,
    highCod: 10,
    jumps: null,
  }));
  const res = computeBasketballIndoorLoad(rows);
  assert.equal(res.dataCoverage.hasJumps, false);
  assert.equal(res.latest!.components.jumps, null);
  assert.ok(Math.abs((res.latest!.score ?? 0) - 100) < 0.5, `score ${res.latest!.score}`);
  assert.ok(!Number.isNaN(res.latest!.score));
});

test("weights are a provisional, documented constant", () => {
  const sum = PROVISIONAL_WEIGHTS.playerLoad + PROVISIONAL_WEIGHTS.highIntensityIma + PROVISIONAL_WEIGHTS.jumps;
  assert.ok(Math.abs(sum - 1) < 1e-9, "weights should sum to 1");
});

test("thin baseline stays low confidence even with full signal coverage", () => {
  const res = computeBasketballIndoorLoad(steady(4)); // < MIN_MATURE_SESSIONS
  assert.equal(res.confidence, "low");
});

test("zero IMA data → hasIma false and confidence never rises above low", () => {
  const rows: BballLoadRow[] = Array.from({ length: 20 }, (_, i) => ({
    date: day(i + 1),
    playerLoad: 400,
    highAccel: null,
    highDecel: null,
    highCod: null,
    jumps: 30,
  }));
  const res = computeBasketballIndoorLoad(rows);
  assert.equal(res.dataCoverage.hasIma, false);
  assert.equal(res.confidence, "low", "no IMA = the defining signal is missing");
  assert.equal(res.latest!.components.highIntensityIma, null);
});

test("full mature coverage earns higher confidence", () => {
  const res = computeBasketballIndoorLoad(steady(14));
  assert.notEqual(res.confidence, "low");
});

test("empty input yields a null latest and empty history, not a crash", () => {
  const res = computeBasketballIndoorLoad([]);
  assert.equal(res.latest, null);
  assert.deepEqual(res.history, []);
  assert.equal(res.baseline.sessions, 0);
  assert.equal(res.confidence, "low");
  assert.equal(res.dataCoverage.hasIma, false);
});

test("carries honest, bilingual provenance (Tuttle adapted + Band-3 caveat)", () => {
  const res = computeBasketballIndoorLoad(steady(8));
  assert.match(res.citation, /Tuttle/);
  assert.match(res.citation, /adapted/i);
  assertBilingual(res.caveat, "caveat");
  assert.match(res.caveat.en, /3\.0/); // states the >3.0 proxy honestly
  assert.match(res.caveat.en, /provisional/i);
});
