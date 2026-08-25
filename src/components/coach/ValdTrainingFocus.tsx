"use client";

/**
 * Training focus — a rule-based development recommendation from the VALD detailed
 * test. Ranks the player's below/average qualities against the cited population
 * benchmarks and pairs each with its cited training lever (IMTP + CMJ core =
 * primary). Explainability-first: verdict -> prioritised qualities with the "why"
 * (his number vs the reference) and the "what to train". Rules decide, not AI;
 * never a fabricated band. Descriptive/performance — never the readiness verdict.
 */

import * as React from "react";
import type { ValdTrainingPlan } from "@/lib/micropulse/vald/valdSummary";

const BAND_CHIP: Record<string, string> = {
  below: "bg-[#f6e2dc] text-[#a83e28]",
  average: "bg-[#fbf0dc] text-[#a86f14]",
};

export default function ValdTrainingFocus({ plan, is, className = "" }: { plan: ValdTrainingPlan | null; is: boolean; className?: string }) {
  if (!plan || !plan.hasData) return null;

  return (
    <div className={`rounded-2xl border border-[#c9d0f7] bg-[#eef0fb] p-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-[#2740e6]">🎯 {is ? "Þjálfunar-áhersla" : "Training focus"}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#2740e6]">{is ? "reglur · ekki gervigreind" : "rules · not AI"}</span>
      </div>

      {/* Layer 0 — verdict */}
      <p className="mt-1.5 text-[15px] font-bold text-slate-900">{plan.verdict}</p>

      {/* Layer 1 — prioritised qualities with why + lever */}
      {plan.priorities.length > 0 ? (
        <ol className="mt-2 space-y-2">
          {plan.priorities.map((p, i) => (
            <li key={i} className="rounded-xl bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-slate-900">{i + 1}. {p.quality}</span>
                <span className="font-semibold tabular-nums text-slate-700 text-[13px]">{p.value}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BAND_CHIP[p.band] ?? ""}`}>{p.bandLabel}</span>
                {p.tier === "primary" ? (
                  <span className="rounded-full bg-[#eef0fb] px-2 py-0.5 text-[10px] font-semibold text-[#2740e6]">{is ? "IMTP/CMJ" : "IMTP/CMJ"}</span>
                ) : null}
              </div>
              <p className="mt-1 text-[12.5px] text-slate-700"><span className="font-semibold">{is ? "Þjálfa" : "Train"}: </span>{p.lever}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{is ? "vs" : "vs"} {p.why} · {p.cite}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {/* Strengths — brief, keeps the read balanced */}
      {plan.strengths.length > 0 ? (
        <p className="mt-2 text-[12px] text-slate-600">
          <span className="font-semibold text-[#1c7a4a]">{is ? "Sterkt" : "On track"}: </span>{plan.strengths.join(", ")}
        </p>
      ) : null}

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        {is
          ? "Reglur raða bilunum eftir tilvitnuðum viðmiðum; hver ábending er tilvitnuð aðferð. Þjálfari getur hnekkt. Frammistöðu-lestur — ekki readiness."
          : "Rules rank the gaps against the cited benchmarks; each lever is a cited method. Coach-overridable. A performance read — never the readiness verdict."}
      </p>
    </div>
  );
}
