import type { DriverContribution, PrescriptionDecision } from "./types";

export function formatPrescriptionDriverLabel(driver: DriverContribution): string {
  const sign = driver.contribution >= 0 ? "+" : "";
  const pts = Number.isFinite(driver.contribution) ? `${sign}${driver.contribution.toFixed(1)}` : "0";
  return `${driver.label} (${pts})`;
}

/**
 * Build coach-facing single instruction line from prescription output.
 */
export function buildPrescriptionCoachInstruction(decision: PrescriptionDecision): string {
  if (decision.action === "HOLD") {
    return "Hold full training today and use recovery-only work.";
  }
  if (decision.action === "RECOVERY") {
    return "Recovery emphasis recommended today. Keep intensity low and protect exposure.";
  }
  if (decision.action === "MODIFIED") {
    return "Modified session recommended. Cap intensity, reduce volume, and control key exposures.";
  }
  if (decision.intensityCap === "NO_CAP" && decision.volumeAdjustment === "NO_REDUCTION") {
    return "Full training allowed. Stable profile supports normal exposure.";
  }
  return "Full training with light control is recommended.";
}

/**
 * Build concise staff summary naming primary constraints/opportunities.
 */
export function buildPrescriptionStaffSummary(decision: PrescriptionDecision): string {
  const top = decision.primaryDrivers.slice(0, 2).map((d) => d.label);
  const driverText = top.length ? top.join(" and ").toLowerCase() : "current profile";

  if (decision.action === "FULL") {
    return `Primary support: ${driverText}. Keep execution quality high.`;
  }

  if (decision.action === "MODIFIED") {
    return `Main restrictions: ${driverText}. Apply targeted load controls.`;
  }

  if (decision.action === "RECOVERY") {
    return `Recovery-first profile driven by ${driverText}.`;
  }

  return `Protective hold driven by ${driverText}.`;
}

/**
 * Build compact explanation lines for drill-down and report exports.
 */
export function buildPrescriptionExplanationLines(decision: PrescriptionDecision): string[] {
  const lines: string[] = [];

  lines.push(`Action: ${decision.action}.`);

  if (decision.intensityCap !== "NO_CAP") {
    lines.push(`Intensity cap: ${decision.intensityCap.toLowerCase().replace(/_/g, " ")}.`);
  }

  if (decision.volumeAdjustment !== "NO_REDUCTION") {
    lines.push(`Volume adjustment: ${decision.volumeAdjustment.toLowerCase().replace(/_/g, " ")}.`);
  }

  if (decision.exposureGuidance.length) {
    lines.push(`Exposure: ${decision.exposureGuidance.slice(0, 3).map((x) => x.toLowerCase().replace(/_/g, " ")).join(", ")}.`);
  }

  if (decision.matchContext.length) {
    lines.push(`Match context: ${decision.matchContext.slice(0, 2).map((x) => x.toLowerCase().replace(/_/g, " ")).join(", ")}.`);
  }

  return lines.slice(0, 5);
}
