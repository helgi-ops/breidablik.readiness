import test from "node:test";
import assert from "node:assert/strict";
import { getExerciseRecommendation } from "./recommend";

test("GREEN explosive recommends DB_SNATCH", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "Mid-Thigh Pull",
    readinessState: "GREEN",
    riskState: "LOW",
  });
  assert.equal(result.recommendedExerciseId, "DB_SNATCH");
});

test("YELLOW explosive recommends JUMP_SHRUGS", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "YELLOW",
    riskState: "MODERATE",
  });
  assert.equal(result.recommendedExerciseId, "JUMP_SHRUGS");
});

test("RED explosive recommends ISO_MID_THIGH_PULL", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "RED",
  });
  assert.equal(result.recommendedExerciseId, "ISO_MID_THIGH_PULL");
});

test("GREEN unilateral recommends SPLIT_STANCE_TRAP_BAR_DEADLIFT", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "RFESS",
    readinessState: "GREEN",
    riskState: "LOW",
  });
  assert.equal(result.recommendedExerciseId, "SPLIT_STANCE_TRAP_BAR_DEADLIFT");
});

test("YELLOW unilateral recommends RFESS", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "Split Stance Trap Bar Deadlift",
    readinessState: "YELLOW",
    riskState: "MODERATE",
  });
  assert.equal(result.recommendedExerciseId, "RFESS");
});

test("RED unilateral recommends ISOMETRIC_SPLIT_SQUAT_HOLD", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "RFESS",
    readinessState: "RED",
  });
  assert.equal(result.recommendedExerciseId, "ISOMETRIC_SPLIT_SQUAT_HOLD");
});

test("unknown exercise returns no recommendation", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "Bench Press",
    readinessState: "GREEN",
    riskState: "LOW",
  });
  assert.equal(result.shouldRenderRecommendation, false);
});

test("missing readiness falls back to original behavior", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
  });
  assert.equal(result.shouldRenderRecommendation, false);
  assert.equal(result.recommendedExerciseId, "DB_SNATCH");
});

test("knee irritation avoids RFESS", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "RFESS",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    kneeIrritationFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "SPLIT_STANCE_TRAP_BAR_DEADLIFT");
  assert.ok(!result.allowedExerciseIds.includes("RFESS"));
});

test("allowed and restricted options are derived correctly", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "YELLOW",
    riskState: "MODERATE",
  });
  assert.deepEqual(result.allowedExerciseIds, ["JUMP_SHRUGS", "MID_THIGH_PULL", "ISO_MID_THIGH_PULL"]);
  assert.ok(result.restrictedExerciseIds.includes("DB_SNATCH"));
});

test("Jump Shrugs normalizes correctly", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "Barbell Jump Shrugs",
    readinessState: "GREEN",
    riskState: "LOW",
  });
  assert.equal(result.originalExerciseId, "JUMP_SHRUGS");
});
