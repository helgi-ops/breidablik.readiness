/**
 * Drill Exposure Classifier
 *
 * Maps drill_library GPS metrics and category data to SessionExposureTag[],
 * allowing the drill-constraint matching engine to work with drills from
 * the SessionBuilder (coach drill picker) — not just session workflow blocks.
 *
 * This is a pure function — no side effects, no DB calls.
 */

import type { SessionExposureTag } from "@/lib/micropulse/autoSessionBuilder";

// ── Drill shape (matches SessionBuilder's Drill type) ──────────────

export type DrillLike = {
  category: string;
  vel_b5: number | null;
  vel_b6: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  player_load: number | null;
  player_load_per_min: number | null;
  duration_min: number | null;
  hir_total: number | null;
};

// ── Thresholds ─────────────────────────────────────────────────────
// These are conservative — any meaningful sprint or deceleration count
// is flagged so the constraint matcher can warn the coach.

const THRESHOLDS = {
  /** Any sprint distance (vel band 6, >25.2 km/h) triggers MAX_SPEED */
  vel_b6_any: 1,
  /** HSR distance (vel band 5, >19.8 km/h) — significant volume */
  vel_b5_significant: 40,
  /** Hard deceleration count (band 2-3) per drill set */
  decel_b23_high: 8,
  /** Duration above which FIELD_MINUTES tag is applied */
  duration_field_min: 20,
  /** Player load / min indicating high intensity */
  pl_per_min_high: 10,
} as const;

// ── Categories that imply contact ──────────────────────────────────

const CONTACT_CATEGORIES = new Set(["ssg"]);

// ── Categories that are safe / warm-up ─────────────────────────────

const SAFE_CATEGORIES = new Set(["warmup"]);

// ── Main classifier ────────────────────────────────────────────────

/**
 * Classify a drill from drill_library into SessionExposureTags.
 *
 * This allows the constraint matcher to check player restrictions
 * against drills the coach is adding to a session.
 */
export function classifyDrillExposureTags(drill: DrillLike): SessionExposureTag[] {
  const tags: SessionExposureTag[] = [];

  // Sprint / high-speed running exposure
  if (
    (drill.vel_b6 != null && drill.vel_b6 >= THRESHOLDS.vel_b6_any) ||
    (drill.vel_b5 != null && drill.vel_b5 >= THRESHOLDS.vel_b5_significant)
  ) {
    tags.push("MAX_SPEED");
  }

  // High deceleration load
  if (drill.decel_b23 != null && drill.decel_b23 >= THRESHOLDS.decel_b23_high) {
    tags.push("HIGH_DECEL");
  }

  // Contact exposure from small-sided games
  if (CONTACT_CATEGORIES.has(drill.category)) {
    tags.push("CONTACT");
  }

  // Long field time
  if (drill.duration_min != null && drill.duration_min >= THRESHOLDS.duration_field_min) {
    tags.push("FIELD_MINUTES");
  }

  // Safe warm-up drills → TECHNICAL_ONLY
  if (SAFE_CATEGORIES.has(drill.category) && tags.length === 0) {
    tags.push("TECHNICAL_ONLY");
  }

  return tags;
}

// ── Intensity estimation ───────────────────────────────────────────

export type DrillIntensityEstimate = "LOW" | "MODERATE" | "HIGH";

/**
 * Estimate a drill's intensity from its GPS profile.
 * Used by the constraint matcher to check intensity cap conflicts.
 */
export function estimateDrillIntensity(drill: DrillLike): DrillIntensityEstimate {
  // High PL/min or significant sprint distance → HIGH
  if (
    (drill.player_load_per_min != null && drill.player_load_per_min >= THRESHOLDS.pl_per_min_high) ||
    (drill.vel_b6 != null && drill.vel_b6 >= 50)
  ) {
    return "HIGH";
  }

  // Moderate PL/min or some HSR → MODERATE
  if (
    (drill.player_load_per_min != null && drill.player_load_per_min >= 6) ||
    (drill.vel_b5 != null && drill.vel_b5 >= THRESHOLDS.vel_b5_significant)
  ) {
    return "MODERATE";
  }

  return "LOW";
}

// ── Block type mapping ─────────────────────────────────────────────

/**
 * Map a drill category to a session block type for constraint matching.
 */
export function drillCategoryToBlockType(category: string): string {
  switch (category) {
    case "warmup":
      return "PREP";
    case "running":
      return "CONDITIONING";
    case "possession":
    case "ssg":
    case "transition":
    case "finishing":
      return "MAIN";
    default:
      return "MAIN";
  }
}
