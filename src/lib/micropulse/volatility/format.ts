import type { PlayerVolatilitySummary } from "./types";

export function volatilityLevelLabel(level: PlayerVolatilitySummary["level"]): string {
  if (level === "LOW") return "Stable";
  if (level === "MODERATE") return "Moderate";
  if (level === "HIGH") return "High";
  return "Insufficient";
}

export function volatilityLevelTone(level: PlayerVolatilitySummary["level"]): string {
  if (level === "LOW") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (level === "MODERATE") return "border-amber-200 bg-amber-50 text-amber-700";
  if (level === "HIGH") return "border-red-200 bg-red-50 text-red-700";
  return "border-gray-200 bg-gray-100 text-gray-600";
}

export function summarizeDrivers(summary: PlayerVolatilitySummary): string {
  if (!summary.drivers.length) return "—";
  return summary.drivers.map((d) => d.label).join(", ");
}
