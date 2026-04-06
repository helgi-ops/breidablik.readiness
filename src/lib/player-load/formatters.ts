import type { LoadBand } from "@/lib/player-load/types";

export function loadBandBadgeClass(band: LoadBand): string {
  if (band === "VERY_HIGH") return "border-rose-200 bg-rose-50 text-rose-800";
  if (band === "HIGH") return "border-amber-200 bg-amber-50 text-amber-800";
  if (band === "MODERATE") return "border-blue-200 bg-blue-50 text-blue-800";
  if (band === "LIGHT") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export function loadBandLabel(band: LoadBand): string {
  if (band === "VERY_HIGH") return "Very hard";
  if (band === "HIGH") return "Hard";
  if (band === "MODERATE") return "Moderate";
  if (band === "LIGHT") return "Light";
  return "Very light";
}

