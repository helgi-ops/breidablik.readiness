"use client";

/** Heavy-lifting exposure this week (Pareja-Blanco threshold). Hidden until a heavy set exists. */

import MethodologyLink from "@/components/common/MethodologyLink";

export type HeavyExposure = {
  heavy_sets: number;
  cap: number;
  saturation: number;
  status: "low" | "optimal" | "high" | "excessive";
  reason: string;
};

export default function HeavyLiftingCard({ exposure: e, lang }: { exposure: HeavyExposure; lang: "EN" | "IS" }) {
  if (e.heavy_sets <= 0) return null;
  const tone = e.status === "excessive" ? { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", bar: "bg-red-500" }
    : e.status === "high" ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", bar: "bg-amber-500" }
    : e.status === "optimal" ? { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", bar: "bg-emerald-500" }
    : { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", bar: "bg-slate-400" };
  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} p-3.5 space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">
          {lang === "IS" ? "Þung lyfting þessa viku" : "Heavy lifting this week"}
        </div>
        <div className={`text-sm font-semibold tabular-nums ${tone.text}`}>{e.heavy_sets} / {e.cap}</div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200/70 overflow-hidden">
        <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${Math.min(100, (e.heavy_sets / e.cap) * 100)}%` }} />
      </div>
      <div className={`text-xs ${tone.text}`}>{e.reason}</div>
      <div className="text-[10px] text-slate-500">≥80% 1RM · Pareja-Blanco 2017</div>
      <MethodologyLink />
    </div>
  );
}
