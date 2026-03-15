import type { WhoopFusionFeatures } from "./types";

/**
 * Builds compact, coach-safe explanation lines for WHOOP supporting signals.
 */
export function buildWhoopExplanationLines(features: WhoopFusionFeatures): string[] {
  if (!features.hasWhoopData) return [];

  const lines: string[] = [];
  const mixedRecoverySleep =
    (features.recoveryFlag === "positive" && features.sleepFlag === "negative") ||
    (features.recoveryFlag === "negative" && features.sleepFlag === "positive");

  if (mixedRecoverySleep) {
    lines.push("WHOOP showed mixed recovery and sleep signals.");
  } else if (features.recoveryFlag === "positive" && features.sleepFlag === "positive") {
    lines.push("WHOOP recovery and sleep data supported readiness.");
  } else if (features.recoveryFlag === "negative" || features.sleepFlag === "negative") {
    lines.push("WHOOP recovery and sleep data suggested mild caution.");
  }

  if (features.autonomicFlag === "negative") {
    lines.push("WHOOP autonomic markers suggested reduced freshness.");
  }

  if (features.loadFlag === "negative") {
    lines.push("WHOOP load was elevated, interpreted as context only.");
  }

  if (features.confidence < 0.4) {
    lines.push("WHOOP signal completeness was limited today.");
  }

  return Array.from(new Set(lines)).slice(0, 3);
}

