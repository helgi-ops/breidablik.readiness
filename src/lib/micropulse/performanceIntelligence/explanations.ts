import type { DriverContribution, PerformanceIntelligenceDecision } from "./types";

export function formatDriverLabel(driver: DriverContribution): string {
  const sign = driver.contribution >= 0 ? "+" : "";
  const pts = Number.isFinite(driver.contribution) ? `${sign}${driver.contribution.toFixed(1)}` : "0";
  return `${driver.label} (${pts})`;
}

function topLabels(drivers: DriverContribution[]): string[] {
  return drivers.slice(0, 2).map((d) => d.label);
}

/**
 * Build concise coach-facing summary line from model outputs.
 */
export function buildPerformanceIntelligenceCoachSummary(decision: PerformanceIntelligenceDecision): string {
  const risk = decision.injuryRisk.band;
  const perf = decision.performanceForecast.band;
  const load = decision.loadForecast.band;

  if (risk === "CRITICAL" || load === "RECOVERY_ONLY") {
    return "Protection-first day: recovery emphasis is recommended.";
  }
  if (risk === "HIGH" || load === "TOLERATES_LOW") {
    return "Elevated risk profile: reduce load and prioritize execution quality.";
  }
  if (perf === "PEAK" && risk === "LOW" && load === "TOLERATES_HIGH") {
    return "Strong profile today: full training is supported with normal monitoring.";
  }
  if (perf === "READY" && (load === "TOLERATES_MODERATE" || load === "TOLERATES_HIGH")) {
    return "Ready profile with manageable constraints: moderate-to-full loading is appropriate.";
  }

  return "Mixed profile today: use controlled loading and monitor early session response.";
}

/**
 * Build compact explanation lines suitable for coach UI details and exports.
 */
export function buildPerformanceIntelligenceExplanationLines(decision: PerformanceIntelligenceDecision): string[] {
  const riskDrivers = topLabels(decision.injuryRisk.primaryDrivers);
  const perfDrivers = topLabels(decision.performanceForecast.primaryDrivers);
  const loadDrivers = topLabels(decision.loadForecast.primaryDrivers);

  const lines: string[] = [];

  if (riskDrivers.length) {
    lines.push(`Injury risk drivers: ${riskDrivers.join(", ")}.`);
  }
  if (perfDrivers.length) {
    lines.push(`Performance forecast drivers: ${perfDrivers.join(", ")}.`);
  }
  if (loadDrivers.length) {
    lines.push(`Load tolerance drivers: ${loadDrivers.join(", ")}.`);
  }

  if (!lines.length) {
    lines.push("Insufficient driver detail; maintain standard monitoring.");
  }

  if (decision.loadForecast.recommendedAction === "recovery") {
    lines.push("Recommended action: recovery session emphasis.");
  } else if (decision.loadForecast.recommendedAction === "modified") {
    lines.push("Recommended action: modified session with controlled intensity.");
  } else {
    lines.push("Recommended action: full session with normal control.");
  }

  return lines.slice(0, 4);
}
