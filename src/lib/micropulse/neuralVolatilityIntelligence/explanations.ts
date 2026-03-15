import type { DriverContribution, NeuralVolatilityIntelligenceDecision } from "./types";

export function formatNeuralVolatilityDriverLabel(driver: DriverContribution): string {
  const sign = driver.contribution >= 0 ? "+" : "";
  const pts = Number.isFinite(driver.contribution) ? `${sign}${driver.contribution.toFixed(1)}` : "0";
  return `${driver.label} (${pts})`;
}

function topDriverLabel(decision: { primaryDrivers: DriverContribution[] }): string | null {
  return decision.primaryDrivers[0]?.label ?? null;
}

/**
 * Build concise coach-facing headline from neural + volatility intelligence.
 */
export function buildNeuralVolatilityCoachSummary(decision: NeuralVolatilityIntelligenceDecision): string {
  const collapse = decision.collapseRisk.band;
  const instability = decision.instabilityWindow.band;
  const fatigue = decision.fatigueAccumulation.band;
  const peak = decision.peakWindow.band;

  if (collapse === "CRITICAL") {
    return "Collapse-risk window is critical; protect load immediately.";
  }
  if (collapse === "HIGH" || instability === "HIGHLY_UNSTABLE") {
    return "High short-term fragility detected; use tight load control.";
  }
  if ((fatigue === "ELEVATED" || fatigue === "HEAVY") && instability !== "STABLE") {
    return "Fatigue is building with instability; monitor first block response closely.";
  }
  if (peak === "PEAK" || peak === "OPEN") {
    return "Recovery and stability profile supports a high-performance window.";
  }
  return "Profile is broadly stable with no major hidden-risk signal.";
}

/**
 * Build compact explanation lines for coach details and exports.
 */
export function buildNeuralVolatilityExplanationLines(decision: NeuralVolatilityIntelligenceDecision): string[] {
  const lines: string[] = [];

  if (decision.fatigueAccumulation.band !== "LOW") {
    const driver = topDriverLabel(decision.fatigueAccumulation);
    lines.push(
      driver
        ? `Fatigue build is ${decision.fatigueAccumulation.band.toLowerCase()} (${driver.toLowerCase()}).`
        : `Fatigue build is ${decision.fatigueAccumulation.band.toLowerCase()}.`,
    );
  }

  if (decision.instabilityWindow.band !== "STABLE") {
    const driver = topDriverLabel(decision.instabilityWindow);
    lines.push(
      driver
        ? `Stability is ${decision.instabilityWindow.band.toLowerCase()} (${driver.toLowerCase()}).`
        : `Stability is ${decision.instabilityWindow.band.toLowerCase()}.`,
    );
  }

  if (decision.collapseRisk.band !== "LOW") {
    const driver = topDriverLabel(decision.collapseRisk);
    lines.push(
      driver
        ? `Collapse risk is ${decision.collapseRisk.band.toLowerCase()} (${driver.toLowerCase()}).`
        : `Collapse risk is ${decision.collapseRisk.band.toLowerCase()}.`,
    );
  }

  if (decision.peakWindow.band === "OPEN" || decision.peakWindow.band === "PEAK") {
    lines.push(`Peak window is ${decision.peakWindow.band.toLowerCase()}; keep quality high.`);
  }

  if (lines.length === 0) {
    lines.push("No major hidden instability signal detected.");
  }

  lines.push(`Trend: ${decision.trendState.direction.toLowerCase().replace(/_/g, " ")}.`);
  return lines.slice(0, 5);
}
