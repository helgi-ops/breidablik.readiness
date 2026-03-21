import type { LoadBand } from "@/lib/session-rpe/types";

export function getSessionLoadBand(sessionLoad: number): LoadBand {
  if (sessionLoad < 200) return "VERY_LIGHT";
  if (sessionLoad < 400) return "LIGHT";
  if (sessionLoad < 600) return "MEDIUM";
  if (sessionLoad < 800) return "HIGH";
  return "VERY_HIGH";
}

export function formatLoadBandLabel(loadBand: LoadBand): string {
  if (loadBand === "VERY_HIGH") return "Very hard";
  if (loadBand === "HIGH") return "Hard";
  if (loadBand === "MEDIUM") return "Moderate";
  if (loadBand === "LIGHT") return "Light";
  return "Very light";
}

export function formatSessionTypeLabel(sessionType: string): string {
  switch (sessionType) {
    case "match":
      return "Match";
    case "team_training":
      return "Team training";
    case "gym":
      return "Gym";
    case "recovery":
      return "Recovery";
    case "individual":
      return "Individual";
    default:
      return "Other";
  }
}

export function formatLoadBandClass(loadBand: LoadBand): string {
  if (loadBand === "VERY_HIGH") return "border-red-200 bg-red-50 text-red-800";
  if (loadBand === "HIGH") return "border-amber-200 bg-amber-50 text-amber-800";
  if (loadBand === "MEDIUM") return "border-blue-200 bg-blue-50 text-blue-800";
  if (loadBand === "LIGHT") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}
