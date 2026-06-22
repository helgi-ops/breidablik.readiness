// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { test } from "vitest";
import assert from "node:assert/strict";
import { getExerciseRecommendation } from "./recommend";
import { REASON_CODES } from "./reasons";
import { normalizeExerciseNameToId } from "./normalize";

// ── Phase 1 / 2 tests (existing, unchanged) ──────────────────────────────────

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

test("Split Squat ISO normalizes correctly", () => {
  assert.equal(normalizeExerciseNameToId("Split Squat ISO"), "ISOMETRIC_SPLIT_SQUAT_HOLD");
  assert.equal(normalizeExerciseNameToId("Iso Split Squat Hold"), "ISOMETRIC_SPLIT_SQUAT_HOLD");
});

// ── Phase 3 tests — Explosive accessory ──────────────────────────────────────

test("postMatchResidualFlag forces ISO_MID_THIGH_PULL even in GREEN/LOW", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "GREEN",
    riskState: "LOW",
    postMatchResidualFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "ISO_MID_THIGH_PULL");
  assert.equal(result.reasonCode, REASON_CODES.POST_MATCH_RESIDUAL);
});

test("postMatchResidualFlag forces ISO_MID_THIGH_PULL in YELLOW as well", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    postMatchResidualFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "ISO_MID_THIGH_PULL");
  assert.equal(result.reasonCode, REASON_CODES.POST_MATCH_RESIDUAL);
});

test("postMatchResidualFlag restricts explosive allowed list to ISO only", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "Jump Shrugs",
    readinessState: "GREEN",
    riskState: "LOW",
    postMatchResidualFlag: true,
  });
  assert.deepEqual(result.allowedExerciseIds, ["ISO_MID_THIGH_PULL"]);
});

test("scheduleCongestionFlag + YELLOW explosive recommends MID_THIGH_PULL", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    scheduleCongestionFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "MID_THIGH_PULL");
  assert.equal(result.reasonCode, REASON_CODES.SCHEDULE_CONGESTION_EXPLOSIVE);
});

test("scheduleCongestionFlag + YELLOW restricts explosive to [MID_THIGH_PULL, ISO_MID_THIGH_PULL]", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    scheduleCongestionFlag: true,
  });
  assert.deepEqual(result.allowedExerciseIds, ["MID_THIGH_PULL", "ISO_MID_THIGH_PULL"]);
  assert.ok(result.restrictedExerciseIds.includes("DB_SNATCH"));
  assert.ok(result.restrictedExerciseIds.includes("JUMP_SHRUGS"));
});

test("scheduleCongestionFlag alone (GREEN/LOW) does not change recommendation", () => {
  // Congestion modifier only applies when readiness is already YELLOW/MODERATE
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "GREEN",
    riskState: "LOW",
    scheduleCongestionFlag: true,
  });
  // GREEN + LOW without soreness → DB_SNATCH; congestion flag has no isolated GREEN branch
  assert.equal(result.recommendedExerciseId, "DB_SNATCH");
  assert.equal(result.reasonCode, REASON_CODES.GREEN_EXPLOSIVE);
});

test("lowerBodySorenessFlag + GREEN/LOW explosive recommends JUMP_SHRUGS", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "GREEN",
    riskState: "LOW",
    lowerBodySorenessFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "JUMP_SHRUGS");
  assert.equal(result.reasonCode, REASON_CODES.LOWER_BODY_SORENESS_EXPLOSIVE);
});

test("lowerBodySorenessFlag + GREEN/LOW restricts explosive — DB_SNATCH excluded", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "GREEN",
    riskState: "LOW",
    lowerBodySorenessFlag: true,
  });
  assert.ok(!result.allowedExerciseIds.includes("DB_SNATCH"));
  assert.ok(result.restrictedExerciseIds.includes("DB_SNATCH"));
});

test("lowerBodySorenessFlag + YELLOW still recommends JUMP_SHRUGS (YELLOW takes precedence)", () => {
  // The YELLOW branch fires before the lowerBodySoreness branch
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    lowerBodySorenessFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "JUMP_SHRUGS");
  assert.equal(result.reasonCode, REASON_CODES.MODERATE_EXPLOSIVE);
});

test("postMatchResidualFlag is captured in debugInfo.activeFlags", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "GREEN",
    riskState: "LOW",
    postMatchResidualFlag: true,
  });
  assert.ok(result.debugInfo.activeFlags.includes("postMatchResidualFlag"));
  assert.equal(result.debugInfo.selectedReasonCode, REASON_CODES.POST_MATCH_RESIDUAL);
});

// ── Phase 3 tests — Unilateral strength accessory ────────────────────────────

test("posteriorChainSorenessFlag recommends SPLIT_STANCE_TRAP_BAR_DEADLIFT", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "RFESS",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    posteriorChainSorenessFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "SPLIT_STANCE_TRAP_BAR_DEADLIFT");
  assert.equal(result.reasonCode, REASON_CODES.POSTERIOR_CHAIN_SORENESS_BIAS);
});

test("posteriorChainSorenessFlag removes RFESS from allowed list", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "RFESS",
    readinessState: "GREEN",
    riskState: "LOW",
    posteriorChainSorenessFlag: true,
  });
  assert.ok(!result.allowedExerciseIds.includes("RFESS"));
  assert.ok(result.restrictedExerciseIds.includes("RFESS"));
});

test("posteriorChainSorenessFlag + kneeIrritationFlag — SPLIT_STANCE recommended, RFESS excluded", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "RFESS",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    kneeIrritationFlag: true,
    posteriorChainSorenessFlag: true,
  });
  // kneeIrritationFlag fires first in decision tree; both flags exclude RFESS
  assert.equal(result.recommendedExerciseId, "SPLIT_STANCE_TRAP_BAR_DEADLIFT");
  assert.ok(!result.allowedExerciseIds.includes("RFESS"));
});

test("quadDominantSorenessFlag recommends ISOMETRIC_SPLIT_SQUAT_HOLD in GREEN/LOW", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "RFESS",
    readinessState: "GREEN",
    riskState: "LOW",
    quadDominantSorenessFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "ISOMETRIC_SPLIT_SQUAT_HOLD");
  assert.equal(result.reasonCode, REASON_CODES.QUAD_SORENESS_BIAS);
});

test("quadDominantSorenessFlag restricts unilateral allowed list to ISOMETRIC only", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "RFESS",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    quadDominantSorenessFlag: true,
  });
  assert.deepEqual(result.allowedExerciseIds, ["ISOMETRIC_SPLIT_SQUAT_HOLD"]);
  assert.ok(result.restrictedExerciseIds.includes("RFESS"));
  assert.ok(result.restrictedExerciseIds.includes("SPLIT_STANCE_TRAP_BAR_DEADLIFT"));
});

test("unilateralDeficitFlag + YELLOW uses UNILATERAL_DEFICIT_FOCUS reason", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "Split Stance Trap Bar Deadlift",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    unilateralDeficitFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "RFESS");
  assert.equal(result.reasonCode, REASON_CODES.UNILATERAL_DEFICIT_FOCUS);
});

test("unilateralDeficitFlag + GREEN/LOW does not override green_unilateral recommendation", () => {
  // Deficit focus only applies when in YELLOW band; GREEN goes to Split Stance as normal
  const result = getExerciseRecommendation({
    originalExerciseName: "RFESS",
    readinessState: "GREEN",
    riskState: "LOW",
    unilateralDeficitFlag: true,
  });
  assert.equal(result.recommendedExerciseId, "SPLIT_STANCE_TRAP_BAR_DEADLIFT");
  assert.equal(result.reasonCode, REASON_CODES.GREEN_UNILATERAL);
});

test("debugInfo.exclusions reflects restricted exercises", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "DB Snatch",
    readinessState: "YELLOW",
    riskState: "MODERATE",
    scheduleCongestionFlag: true,
  });
  const excludedIds = result.debugInfo.exclusions.map((e) => e.exerciseId);
  assert.ok(excludedIds.includes("DB_SNATCH"));
  assert.ok(excludedIds.includes("JUMP_SHRUGS"));
  assert.equal(result.debugInfo.selectedReasonCode, REASON_CODES.SCHEDULE_CONGESTION_EXPLOSIVE);
});

test("fallback result has empty debugInfo", () => {
  const result = getExerciseRecommendation({
    originalExerciseName: "Bench Press",
    readinessState: "GREEN",
    riskState: "LOW",
  });
  assert.equal(result.debugInfo.activeFlags.length, 0);
  assert.equal(result.debugInfo.selectedReasonCode, null);
  assert.equal(result.debugInfo.exclusions.length, 0);
});
