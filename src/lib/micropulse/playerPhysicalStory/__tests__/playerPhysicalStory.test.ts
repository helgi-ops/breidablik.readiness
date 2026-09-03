import { test } from "vitest";
import assert from "node:assert/strict";
import { buildPhysicalStory, type StoryInput } from "../index";

// Kristófer-like: durable endurance CF, multidirectional, at-norm output, HSR drifting down.
const enduranceCF: StoryInput = {
  role: { roleLabel: { en: "Centre-forward", is: "Miðframherji" }, engineBand: "strong", driverFit: "fits", outputRead: "at", watch: [{ en: "Repeated-sprint base", is: "Endurtekinn spretta-grunnur" }], confidence: "medium", smallGroup: true },
  powerCurve: { retentionPct: 82, rankPct: 68, confidence: "high" },
  season: { hsrTrend: "down", imaTrend: "flat", forward: 0.3, backward: 0.25, lateral: 0.45, confidence: "high" },
  style: { label: "multidirectional", confidence: "medium" },
};

test("endurance CF: durable-engine verdict + 3 tagged facts + all three reconciliations", () => {
  const s = buildPhysicalStory(enduranceCF);
  assert.ok(s.hasData);
  assert.match(s.verdict.en, /Centre-forward/);
  assert.match(s.verdict.en, /durable endurance engine/);
  assert.match(s.verdict.en, /laterally/);           // multidirectional style clause
  assert.equal(s.facts.length, 3);
  assert.ok(s.facts.some((f) => /82%/.test(f.text.en) && f.anchor === "pc-curve")); // durability fact, tagged to power curve
  assert.ok(s.facts.every((f) => f.source.en.length > 0 && f.anchor.startsWith("pc-"))); // every fact carries a source + anchor
  assert.equal(s.reconciliations.length, 3);         // multi-vs-linear, engine+watch, at-norm+HSR-down all fire
  assert.equal(s.confidence, "medium");              // min(medium, high, high, medium)
  assert.ok(s.smallGroupNote && /n≈2–3/.test(s.smallGroupNote.en));
});

// Sprint-type: front-loaded explosive engine, linear, above output, HSR steady — verdict must FLIP.
const sprintType: StoryInput = {
  role: { roleLabel: { en: "Wide attacker", is: "Kantmaður" }, engineBand: "solid", driverFit: "fits", outputRead: "above", watch: [], confidence: "high", smallGroup: false },
  powerCurve: { retentionPct: 36, rankPct: 40, confidence: "high" },
  season: { hsrTrend: "up", imaTrend: "up", forward: 0.55, backward: 0.15, lateral: 0.3, confidence: "medium" },
  style: { label: "linear", confidence: "high" },
};

test("sprint type: verdict flips to explosive/front-loaded, no false reconciliations, no small-group note", () => {
  const s = buildPhysicalStory(sprintType);
  assert.match(s.verdict.en, /front-loaded, explosive engine/); // flipped from the retention %
  assert.match(s.verdict.en, /straight-line runner/);           // linear style clause
  assert.match(s.verdict.en, /above-usual output/);
  assert.equal(s.reconciliations.length, 0);                    // no watch-item, HSR not down, not multidirectional
  assert.equal(s.smallGroupNote, null);                         // smallGroup false
  assert.ok(s.facts.some((f) => /forward-leaning/.test(f.text.en))); // dominant direction = forward
});

test("degrades gracefully with only season data (no crash, still a verdict)", () => {
  const s = buildPhysicalStory({ season: { hsrTrend: "up", forward: 0.4, backward: 0.3, lateral: 0.3 } });
  assert.ok(s.hasData);
  assert.ok(s.verdict.en.length > 0);
  assert.ok(s.facts.length >= 1);
});

test("empty input → no data, low confidence, no crash", () => {
  const s = buildPhysicalStory({});
  assert.equal(s.hasData, false);
  assert.equal(s.confidence, "low");
  assert.equal(s.reconciliations.length, 0);
});
