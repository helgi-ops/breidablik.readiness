import type { AcwrBand } from "@/lib/player-load-metrics/types";

export function acwrBandBadgeClass(band: AcwrBand): string {
  if (band === "RISK") return "border-rose-200 bg-rose-50 text-rose-800";
  if (band === "CAUTION") return "border-amber-200 bg-amber-50 text-amber-800";
  if (band === "SAFE") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (band === "LOW") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

