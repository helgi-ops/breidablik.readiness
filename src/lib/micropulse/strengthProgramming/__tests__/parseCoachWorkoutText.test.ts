import { test } from "vitest";
import assert from "node:assert/strict";
import { parseCoachWorkoutText } from "../parseCoachWorkoutText";

// The real UPPER_BODY_PUSH_V1 template description (workout_templates.description).
const UPPER_BODY_PUSH = [
  "UPPER BODY PUSH (V1)",
  "",
  "Block 1 (Contrast / complex)",
  "1a) Bench press — 5 reps",
  "- Velocity target: 0.75 m/s",
  "- Velocity cut-off: 0.675 m/s",
  "- Velocity drop-off: 10%",
  "- Rest: 20s between exercises, 15s between sets",
  "1b) Plyo push ups or push ups — 5 reps",
  "- Intent: Fast as possible",
  "- Cut-off: Speed decreases",
  "1c) MB Chest pass — 5 reps",
  "- Intent: Fast as possible",
  "- Rest between sets: 180s",
  "* Total: 2–4 sets",
  "",
  "Block 2 (Strength / assistance)",
  "2a) Shoulder press — 8–10 reps",
  "- Intent: Fast as possible",
  "2b) Bicep curl — 8–10 reps (2–3 sets)",
  "- Intent: Slow",
  "",
  "Core circuit",
  "3a) Pallof press — 6–8 / side",
  "- Intent: Slow",
  "3c) Overhead plank — 6–8 / side (2–3 sets)",
  "- Intent: Slow",
].join("\n");

test("recovers every block, dropping the leading title", () => {
  const blocks = parseCoachWorkoutText(UPPER_BODY_PUSH);
  assert.equal(blocks.length, 3);
  assert.ok(blocks[0].block.startsWith("Block 1 (Contrast / complex)"));
  assert.ok(blocks[1].block.startsWith("Block 2 (Strength / assistance)"));
  assert.equal(blocks[2].block, "Core circuit");
  // the "UPPER BODY PUSH (V1)" title is not a block
  assert.ok(!blocks.some((b) => /UPPER BODY PUSH/i.test(b.block)));
});

test("a block-level 'Total: N sets' annotates the block, not the last exercise", () => {
  const blocks = parseCoachWorkoutText(UPPER_BODY_PUSH);
  assert.ok(/Total: 2–4 sets/.test(blocks[0].block));
  // …and does not leak into MB Chest pass's note
  assert.ok(!/Total/.test(blocks[0].items[2]));
});

test("each exercise keeps its name, reps and detail bullets", () => {
  const blocks = parseCoachWorkoutText(UPPER_BODY_PUSH);
  assert.equal(blocks[0].items.length, 3);
  assert.equal(
    blocks[0].items[0],
    "Bench press — 5 reps (Velocity target: 0.75 m/s · Velocity cut-off: 0.675 m/s · Velocity drop-off: 10% · Rest: 20s between exercises, 15s between sets)",
  );
  assert.equal(blocks[0].items[1], "Plyo push ups or push ups — 5 reps (Intent: Fast as possible · Cut-off: Speed decreases)");
});

test("a bare 'N / side' rep count gains a unit so the item parser can read it", () => {
  const blocks = parseCoachWorkoutText(UPPER_BODY_PUSH);
  const core = blocks[2];
  assert.ok(core.items[0].startsWith("Pallof press — 6–8 reps / side"));
});

test("an inline '(2–3 sets)' on the exercise line moves into its details", () => {
  const blocks = parseCoachWorkoutText(UPPER_BODY_PUSH);
  const bicep = blocks[1].items[1];
  assert.ok(bicep.startsWith("Bicep curl — 8–10 reps ("));
  assert.ok(/2–3 sets/.test(bicep));
  assert.ok(/Intent: Slow/.test(bicep));
});

test("empty / non-workout text yields no blocks (caller falls back to plain render)", () => {
  assert.deepEqual(parseCoachWorkoutText(""), []);
  assert.deepEqual(parseCoachWorkoutText("   "), []);
  assert.deepEqual(parseCoachWorkoutText("Just a free-form coach note with no exercises."), []);
});

test("exercises with no block header still form a block", () => {
  const blocks = parseCoachWorkoutText("1) Squat — 5 reps\n2) Lunge — 8 reps");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].items.length, 2);
});
