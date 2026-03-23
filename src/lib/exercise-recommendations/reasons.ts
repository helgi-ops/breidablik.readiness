/**
 * Stable reason code constants for the exercise recommendation engine.
 *
 * Use these constants in all logic and tests — never use raw string literals in
 * decision code. This ensures safe refactoring and clear auditability of every
 * decision path.
 */

export const REASON_CODES = {
  // ─── Explosive accessory — Phase 1 / 2 ──────────────────────────────────
  /** RED / PROTECT / REGENERATE / modifiedOnly state */
  PROTECTIVE_EXPLOSIVE: "protective_explosive",
  /** Neural suppression flag — CNS fatigue override */
  NEURAL_PROTECTIVE: "neural_protective",
  /** Green readiness + LOW risk — full DB Snatch recommended */
  GREEN_EXPLOSIVE: "green_explosive",
  /** Yellow readiness or MODERATE risk — Jump Shrugs recommended */
  MODERATE_EXPLOSIVE: "moderate_explosive",

  // ─── Explosive accessory — Phase 3 ──────────────────────────────────────
  /** Post-match residual fatigue — down-regulate explosive CNS stimulus */
  POST_MATCH_RESIDUAL: "post_match_residual",
  /** Dense match schedule — bias toward lower CNS cost option */
  SCHEDULE_CONGESTION_EXPLOSIVE: "schedule_congestion_explosive",
  /** Lower body soreness in GREEN state — bias away from DB Snatch */
  LOWER_BODY_SORENESS_EXPLOSIVE: "lower_body_soreness_explosive",

  // ─── Unilateral strength — Phase 1 / 2 ──────────────────────────────────
  /** RED / PROTECT / REGENERATE state */
  PROTECTIVE_UNILATERAL: "protective_unilateral",
  /** Knee irritation — avoids RFESS, biases to Split Stance */
  KNEE_IRRITATION_BIAS: "knee_irritation_bias",
  /** Yellow readiness or MODERATE risk — RFESS recommended */
  MODERATE_UNILATERAL: "moderate_unilateral",
  /** Green readiness + LOW risk — Split Stance Trap Bar Deadlift recommended */
  GREEN_UNILATERAL: "green_unilateral",

  // ─── Unilateral strength — Phase 3 ──────────────────────────────────────
  /** Posterior chain soreness — bias away from RFESS toward Split Stance */
  POSTERIOR_CHAIN_SORENESS_BIAS: "posterior_chain_soreness_bias",
  /** Quad-dominant soreness — restrict to isometric hold */
  QUAD_SORENESS_BIAS: "quad_soreness_bias",
  /** Unilateral deficit flagged — prioritise RFESS for asymmetry correction */
  UNILATERAL_DEFICIT_FOCUS: "unilateral_deficit_focus",
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];
