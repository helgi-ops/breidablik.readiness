export function explainInjuryRiskWhy(triggeredRules: string[]): string[] {
  const lines: string[] = [];
  if (triggeredRules.includes("RAPID_WORKLOAD_INCREASE") || triggeredRules.includes("ELEVATED_ACWR")) {
    lines.push("Training load has increased rapidly over a short period.");
  }
  if (
    triggeredRules.includes("LOW_READINESS_STATE") &&
    (triggeredRules.includes("NEGATIVE_DELTA_Z") || triggeredRules.includes("POOR_RECOVERY_MARKERS"))
  ) {
    lines.push("Fatigue remains elevated while recovery markers are below normal.");
  }
  if (triggeredRules.includes("REPEATED_WARNING_DAYS") || triggeredRules.includes("HIGH_VOLATILITY")) {
    lines.push("Recent warning signs have been repeated across multiple days.");
  }
  if (
    triggeredRules.includes("GPS_SPIKE_POOR_RECOVERY") ||
    triggeredRules.includes("CONGESTION_TRAVEL_RECOVERY_STRAIN")
  ) {
    lines.push("Current loading context may increase risk if full loading continues.");
  }
  if (triggeredRules.includes("GOOD_SORENESS_SIGNAL")) {
    lines.push("Muscle soreness does not currently suggest elevated recovery concern.");
  }
  return Array.from(new Set(lines)).slice(0, 4);
}

export function explainInjuryRiskDrivers(triggeredRules: string[]): string[] {
  const drivers: string[] = [];
  if (triggeredRules.includes("RAPID_WORKLOAD_INCREASE")) drivers.push("Rapid workload increase");
  if (triggeredRules.includes("ELEVATED_ACWR")) drivers.push("Elevated ACWR");
  if (triggeredRules.includes("POOR_RECOVERY_MARKERS")) drivers.push("Suppressed recovery markers");
  if (triggeredRules.includes("NEGATIVE_DELTA_Z")) drivers.push("Negative readiness trend");
  if (triggeredRules.includes("HIGH_VOLATILITY")) drivers.push("High day-to-day volatility");
  if (triggeredRules.includes("REPEATED_WARNING_DAYS")) drivers.push("Repeated warning days");
  if (triggeredRules.includes("SORENESS_PAIN_FLAG")) drivers.push("Soreness/pain flag");
  if (triggeredRules.includes("GPS_SPIKE_POOR_RECOVERY")) drivers.push("GPS spike under poor recovery");
  return Array.from(new Set(drivers)).slice(0, 5);
}

export function explainInjuryRiskRecommendations(level: "LOW" | "MODERATE" | "HIGH"): string[] {
  if (level === "HIGH") {
    return [
      "Reduce sprint and explosive exposure.",
      "Avoid maximal or repeated explosive work.",
      "Modify total training load today.",
      "Prioritize recovery and reassess tomorrow.",
    ];
  }
  if (level === "MODERATE") {
    return [
      "Control high-speed and explosive volume.",
      "Modify total training load where possible.",
      "Monitor response in warm-up and first block.",
      "Prioritize recovery and reassess tomorrow.",
    ];
  }
  return ["Maintain planned load with standard monitoring."];
}
