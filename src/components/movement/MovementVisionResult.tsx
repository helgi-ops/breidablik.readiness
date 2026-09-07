"use client";

/**
 * Presentational render of an AI movement-vision analysis (shared by the
 * freeform panel and the test screen, so the same upload can drive it). Shows
 * the summary, capture quality, observations by region, patterns, corrective
 * suggestions (linked to the library), tests to run next, references, red flags,
 * and the carry-over into the assessment (region + priority fields). Decision
 * support only — never a diagnosis, never the readiness colour.
 */
import * as React from "react";
import { REGIONS, REGION_BY_KEY, fieldLabel, type RegionKey } from "@/lib/micropulse/movementScreen/vision/regions";
import { carryOverMovement } from "@/lib/micropulse/movementScreen/vision/carryover";
import type { MovementVisionAnalysis, VisionSeverity } from "@/lib/micropulse/movementScreen/vision/schema";
import { CORRECTIVE_BY_SLUG } from "@/lib/micropulse/movementScreen/correctives/registry";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";

const SEV_HEX: Record<VisionSeverity, string> = { notable: "#a83e28", mild: "#de9328", normal: "#1c7a4a" };

export default function MovementVisionResult({ analysis, isEN }: { analysis: MovementVisionAnalysis; isEN: boolean }) {
  const [carried, setCarried] = React.useState<RegionKey | null>(null);
  const T = (en: string, is: string) => (isEN ? en : is);
  const L = (b: Bi) => (isEN ? b.en : b.is);

  const carry = (region: RegionKey) => {
    carryOverMovement(region, analysis.region === region ? analysis.priorityFieldIds : []);
    setCarried(region);
  };

  return (
    <div>
      {analysis.summary && <p className="text-[13px] text-slate-800">{analysis.summary}</p>}
      {analysis.captureQuality && <p className="mt-1 text-[11px] italic text-slate-400">{T("Capture quality:", "Myndgæði:")} {analysis.captureQuality}</p>}

      {analysis.redFlags.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">⚑ {T("Red flags — route to a clinician", "Rauð flögg — vísaðu til klíníkers")}</p>
          <ul className="mt-1 space-y-0.5">{analysis.redFlags.map((r, i) => <li key={i} className="text-[12px] text-red-800">· {r}</li>)}</ul>
        </div>
      )}

      {/* Two columns on wide screens: observations/patterns | suggestions. */}
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {analysis.observations.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Observations", "Athuganir")}</p>
              <ul className="mt-1 space-y-1">
                {analysis.observations.map((o, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-[12px]">
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEV_HEX[o.severity] }} />
                    <span><span className="font-semibold text-slate-700">{L(REGION_BY_KEY[o.region]?.label ?? { en: o.region, is: o.region })}:</span> <span className="text-slate-700">{o.text}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysis.patterns.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Patterns / compensations", "Mynstur / kompensasjónir")}</p>
              <ul className="mt-1 space-y-0.5">{analysis.patterns.map((p, i) => <li key={i} className="text-[12px] text-slate-700">· {p}</li>)}</ul>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {analysis.suggestions.length > 0 && (
            <div className="rounded-lg border border-[#1c7a4a]/20 bg-[#1c7a4a]/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1c7a4a]">{T("Suggestions — what to work on", "Tillögur — hvað á að vinna með")}</p>
              <div className="mt-1 space-y-2">
                {analysis.suggestions.map((sug, i) => (
                  <div key={i}>
                    <span className="text-[12px] font-semibold text-slate-800">{sug.title}</span>
                    {sug.detail && <span className="text-[12px] text-slate-700"> — {sug.detail}</span>}
                    {sug.cite && <span className="text-[10px] text-slate-400"> ({sug.cite})</span>}
                    {sug.correctiveSlugs && sug.correctiveSlugs.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {sug.correctiveSlugs.map((slug) => { const ex = CORRECTIVE_BY_SLUG[slug]; return ex ? <span key={slug} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#5a3ea4]">{L(ex.name)}{ex.videoUrl ? " ▶" : ""}</span> : null; })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[9px] italic text-slate-400">{T("Suggestions to consider — you choose the treatment.", "Tillögur til íhugunar — þú velur meðferðina.")}</p>
            </div>
          )}
          {analysis.region && analysis.priorityFieldIds.length > 0 && (
            <p className="text-[12px] text-slate-700">
              <span className="font-semibold">{T("Assess next:", "Prófa næst:")}</span>{" "}
              {analysis.priorityFieldIds.map((id) => L(fieldLabel(analysis.region!, id) ?? { en: id, is: id })).join(", ")}
            </p>
          )}
          {analysis.references.length > 0 && <p className="text-[9px] text-slate-400">{T("References:", "Heimildir:")} {analysis.references.join(" · ")}</p>}
        </div>
      </div>

      {analysis.region && (
        <button onClick={() => carry(analysis.region!)} className="mt-3 rounded-lg border border-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-[#2740e6]">
          {carried === analysis.region ? T("Carried ✓", "Tekið með ✓") : `${T("Take into assessment:", "Taka með í mat:")} ${L(REGION_BY_KEY[analysis.region].label)} →`}
        </button>
      )}

      <div className="mt-3">
        <p className="text-[11px] font-semibold text-slate-500">{T("Choose a region:", "Veldu svæði:")}</p>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {REGIONS.map((r) => (
            <button key={r.key} onClick={() => carry(r.key)} className={`rounded-lg border px-3 py-2 text-[12px] ${carried === r.key ? "border-[#2740e6] bg-[#2740e6]/10 text-[#2740e6]" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
              {L(r.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
