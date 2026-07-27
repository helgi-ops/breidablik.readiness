import { test } from "vitest";
import assert from "node:assert/strict";
import { fitOrdinal, predictClass, predictProba, expectedClass, clampClass, type OrdinalSample } from "../ordinal";

// Deterministic LCG so the synthetic data (and thus the test) is reproducible without
// Math.random — mirrors the engine's no-RNG guarantee.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Ground-truth ordinal process: class rises with x0, falls with x1, plus noise.
function makeData(n: number, seed: number): OrdinalSample[] {
  const rnd = lcg(seed);
  const out: OrdinalSample[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = rnd() * 4 - 2; // ~N-ish spread
    const x1 = rnd() * 4 - 2;
    const latent = 1.6 * x0 - 1.1 * x1 + (rnd() - 0.5) * 1.2; // signal + noise
    // Cut the latent into 4 ordered classes at fixed thresholds.
    const y = latent < -1.5 ? 1 : latent < 0 ? 2 : latent < 1.5 ? 3 : 4;
    out.push({ x: [x0, x1], y });
  }
  return out;
}

test("fitOrdinal recovers coefficient signs and ordered thresholds", () => {
  const model = fitOrdinal(makeData(400, 7), { k: 4, l2: 0.5, maxIter: 4000 });
  // x0 pushes toward higher classes → positive; x1 toward lower → negative.
  assert.ok(model.beta[0] > 0.3, `beta0 should be clearly positive, got ${model.beta[0].toFixed(3)}`);
  assert.ok(model.beta[1] < -0.3, `beta1 should be clearly negative, got ${model.beta[1].toFixed(3)}`);
  // Thresholds strictly ascending (proportional-odds ordering held).
  for (let j = 1; j < model.thetas.length; j++) {
    assert.ok(model.thetas[j] > model.thetas[j - 1], `thetas must ascend: ${model.thetas.join(",")}`);
  }
  assert.ok(Number.isFinite(model.nll) && model.nll > 0);
});

test("predicted probabilities are a valid distribution and argmax is stable", () => {
  const model = fitOrdinal(makeData(400, 11), { k: 4, l2: 0.5 });
  const p = predictProba(model, [1.5, -1.5]); // strong high-class signal
  const sum = p.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `probs must sum to 1, got ${sum}`);
  assert.ok(p.every((v) => v >= 0));
  assert.equal(p.length, 4);
  const cls = predictClass(model, [1.5, -1.5]);
  assert.ok(cls >= 3, `strong high signal should predict class 3–4, got ${cls}`);
  const clsLow = predictClass(model, [-1.5, 1.5]);
  assert.ok(clsLow <= 2, `strong low signal should predict class 1–2, got ${clsLow}`);
});

test("beats a naive majority-class baseline within ±1 class on a holdout", () => {
  const train = makeData(400, 3);
  const test = makeData(200, 99);
  const model = fitOrdinal(train, { k: 4, l2: 0.5 });

  // Majority class on the training set = the naive baseline.
  const counts = [0, 0, 0, 0];
  for (const s of train) counts[s.y - 1]++;
  const majority = counts.indexOf(Math.max(...counts)) + 1;

  let modelWithin1 = 0, naiveWithin1 = 0, modelExact = 0;
  for (const s of test) {
    const pred = predictClass(model, s.x);
    if (Math.abs(pred - s.y) <= 1) modelWithin1++;
    if (pred === s.y) modelExact++;
    if (Math.abs(majority - s.y) <= 1) naiveWithin1++;
  }
  const modelPct = modelWithin1 / test.length;
  const naivePct = naiveWithin1 / test.length;
  assert.ok(modelPct > naivePct, `model within±1 ${(modelPct * 100).toFixed(0)}% must beat naive ${(naivePct * 100).toFixed(0)}%`);
  assert.ok(modelPct >= 0.85, `within±1 should be strong on clean synthetic data, got ${(modelPct * 100).toFixed(0)}%`);
  // exact-class is modest (Perri ~39%) — just assert it's non-trivial.
  assert.ok(modelExact / test.length > 0.4, `exact-class too low: ${(modelExact / test.length * 100).toFixed(0)}%`);
});

test("expectedClass sits between the argmax neighbours; clampClass bounds it", () => {
  const model = fitOrdinal(makeData(300, 5), { k: 4, l2: 0.5 });
  const e = expectedClass(model, [0.2, -0.1]);
  assert.ok(e >= 1 && e <= 4);
  assert.equal(clampClass(3.7, 4), 4);
  assert.equal(clampClass(0.2, 4), 1);
  assert.equal(clampClass(2.4, 4), 2);
});

test("handles a degenerate single-class training set without NaNs", () => {
  const all3: OrdinalSample[] = Array.from({ length: 20 }, (_, i) => ({ x: [i / 20, -i / 20], y: 3 }));
  const model = fitOrdinal(all3, { k: 4, l2: 1.0, maxIter: 500 });
  const p = predictProba(model, [0, 0]);
  assert.ok(p.every((v) => Number.isFinite(v)));
  assert.ok(Math.abs(p.reduce((s, v) => s + v, 0) - 1) < 1e-9);
});
