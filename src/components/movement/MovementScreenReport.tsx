"use client";

/**
 * Layered explainability view of a movement screen (manifesto read): verdict →
 * plain facts + confidence → behind-the-numbers (recorded variables with bands +
 * citations, the interpretation rules that fired, references, caveats). Shared by
 * the coach create-flow and the Total Player Analysis card. Never the readiness
 * colour; rules recommend, the coach/clinician decides.
 */
import * as React from "react";
import { STRENGTH_EMPHASIS_LABEL } from "@/lib/micropulse/movementScreen/interpret";
import type { ScreenReport, ReportTone, CheckpointView } from "@/lib/micropulse/movementScreen/report";

const TONE_HEX: Record<ReportTone, string> = { ok: "#1c7a4a", caution: "#de9328", alert: "#a83e28" };
const CONF_HEX: Record<string, string> = { high: "#1c7a4a", moderate: "#de9328", low: "#a83e28" };
const SEV_HEX: Record<string, string> = { ok: "#64748b", mild: "#64748b", moderate: "#de9328", marked: "#a83e28" };
const VIEW_ORDER: CheckpointView[] = ["front", "side", "back", "other"];
const VIEW_LABEL: Record<CheckpointView, { en: string; is: string }> = {
  front: { en: "Front view", is: "Framsýn" },
  side: { en: "Side view", is: "Hliðarsýn" },
  back: { en: "Back view", is: "Aftansýn" },
  other: { en: "Overall", is: "Heildar" },
};

export default function MovementScreenReport({
  report,
  isEN,
  title,
  subtitle,
  defaultOpen = false,
}: {
  report: ScreenReport;
  isEN: boolean;
  title?: string;
  subtitle?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const T = (en: string, is: string) => (isEN ? en : is);
  const L = (b: { en: string; is: string }) => (isEN ? b.en : b.is);

  return (
    <div>
      {(title || subtitle) && (
        <div className="mb-1 flex items-center gap-2">
          {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
          {subtitle && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{subtitle}</span>}
          <span className="ml-auto text-[10px] font-semibold" style={{ color: CONF_HEX[report.confidence] }}>{report.confidence}</span>
        </div>
      )}

      {/* Red flag overrides everything */}
      {report.redFlag ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          ⚑ {report.redFlagNote ? L(report.redFlagNote) : T("Refer to a clinician.", "Vísaðu til klíníkers.")}
        </div>
      ) : (
        <>
          {/* (0) Verdict */}
          <p className="text-[14px] font-bold" style={{ color: TONE_HEX[report.tone] }}>{L(report.verdict)}</p>

          {/* (1) Facts */}
          <ul className="mt-1.5 space-y-0.5">
            {report.facts.map((f, i) => <li key={i} className="text-[12px] text-slate-700">· {L(f)}</li>)}
          </ul>

          {/* Confidence */}
          <p className="mt-1.5 text-[11px] text-slate-500">
            <span className="font-semibold" style={{ color: CONF_HEX[report.confidence] }}>{report.confidence} {T("confidence", "vissa")}</span>{" — "}{L(report.confidenceNote)}
          </p>
        </>
      )}

      {/* (2) Behind the numbers */}
      <button onClick={() => setOpen(!open)} className="mt-2 text-[11px] font-medium text-[#2740e6] hover:underline">
        {open ? T("Hide details", "Fela smáatriði") : T("Behind the numbers", "Á bak við tölurnar")}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {/* Checkpoints by view — every checkpoint the test defines, whether the
              system read it (⚙ auto), the coach scored it (✎), or it wasn't
              captured. Shows exactly what was and wasn't seen. */}
          {report.checkpoints.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Checkpoints by view", "Checkpoints eftir sýn")}</p>
              <div className="space-y-2">
                {VIEW_ORDER.filter((view) => report.checkpoints.some((c) => c.view === view)).map((view) => (
                  <div key={view}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{L(VIEW_LABEL[view])}</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {report.checkpoints.filter((c) => c.view === view).map((c, i) => {
                        const u = c.unit === "band" ? "" : c.unit.replace("/band", "");
                        const statusColor = c.status === "flagged" ? (c.severity ? SEV_HEX[c.severity] : "#de9328") : c.status === "normal" ? "#1c7a4a" : "#94a3b8";
                        const statusText = c.status === "flagged" ? (c.bandLabel ? L(c.bandLabel) : c.severity ?? "") : c.status === "normal" ? T("within normal", "innan eðlilegs") : T("not captured", "ekki tekið upp");
                        return (
                          <li key={`${c.variableKey}|${c.leg ?? ""}|${i}`} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                            <span className="text-slate-400" title={c.source === "pose" ? T("Auto-measured from video", "Sjálfvirkt úr myndbandi") : T("Coach-scored", "Þjálfari skorar")}>{c.source === "pose" ? "⚙" : "✎"}</span>
                            <span className="text-slate-700">{L(c.label)}{c.leg && c.leg !== "both" && <span className="ml-1 rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-600">{c.leg}</span>}</span>
                            {c.value != null && <span className="tabular-nums text-slate-400">{c.value}{u ? ` ${u}` : ""}</span>}
                            <span className="font-semibold" style={{ color: statusColor }}>{statusText}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[9px] text-slate-400">⚙ {T("auto-measured from video", "sjálfvirkt úr myndbandi")} · ✎ {T("coach-scored", "þjálfari skorar")} · {T("“not captured” = that view / score is missing", "„ekki tekið upp“ = sú sýn / skor vantar")}</p>
            </div>
          )}

          {/* Interpretation — the rules that fired */}
          {report.readings.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("Interpretation", "Túlkun")}</p>
              <ul className="space-y-1.5">
                {report.readings.map((r, i) => (
                  <li key={i} className="rounded border border-slate-200 p-2 text-[11px]">
                    <div className="font-semibold text-slate-900">{L(r.finding)}{r.leg ? ` (${r.leg})` : ""}
                      <span className="ml-1.5 rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-500">{r.evidenceGrade}</span>
                    </div>
                    <div className="text-slate-600">↳ {T("likely", "líklega")}: {L(r.cause)}</div>
                    <div className="text-slate-800"><span className="font-medium">{L(STRENGTH_EMPHASIS_LABEL[r.strengthEmphasis])}:</span> {L(r.lever)}</div>
                    <div className="text-[9px] text-slate-400">{r.citation}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* References */}
          {report.references.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{T("References", "Heimildir")}</p>
              <ul className="space-y-0.5 text-[9px] text-slate-400">
                {report.references.map((ref, i) => <li key={i}>· {ref.label}{ref.source ? ` — ${ref.source}` : ""}</li>)}
              </ul>
            </div>
          )}

          {/* Caveats */}
          <ul className="space-y-0.5 text-[9px] text-slate-400">
            {report.caveats.map((c, i) => <li key={i}>· {L(c)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
