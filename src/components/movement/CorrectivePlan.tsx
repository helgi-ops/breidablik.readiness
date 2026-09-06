"use client";

/**
 * Corrective plan — the ordered corrective block a movement screen produces
 * (inhibit → lengthen → activate → integrate), with the combined root-cause
 * priority, %MVIC-ranked exercise selection, cues, videos, citations, an honest
 * caveat, and (for the coach) a "send to the player's Today" action. Descriptive
 * / training only — never a diagnosis, never the readiness colour.
 */
import * as React from "react";
import { MVIC_BAND_LABEL } from "@/lib/micropulse/movementScreen/correctives/registry";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import type { CorrectivePrescription } from "@/lib/micropulse/movementScreen/correctives/mapping";

const GRADE_HEX: Record<string, string> = { strong: "#1c7a4a", moderate: "#de9328", emerging: "#a83e28" };

export default function CorrectivePlan({
  prescription, isEN, onSend, sending, sentMsg, compact,
}: {
  prescription: CorrectivePrescription;
  isEN: boolean;
  onSend?: () => void;
  sending?: boolean;
  sentMsg?: string | null;
  compact?: boolean;
}) {
  const [showRefs, setShowRefs] = React.useState(false);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);

  return (
    <div className="rounded-xl border border-[#7a5cc4]/30 bg-[#7a5cc4]/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{T("Corrective plan", "Leiðréttingar-áætlun")}</h3>
        <span className="text-[10px] text-slate-500">{T(`Re-screen in ~${Math.round(prescription.reScreenInDays / 7)} weeks`, `Endurskima eftir ~${Math.round(prescription.reScreenInDays / 7)} vikur`)}</span>
      </div>

      {/* Combined priority — the shared root cause */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="text-[11px] font-semibold text-slate-600">{T("Priority:", "Áhersla:")}</span>
        {prescription.priorities.map((p) => (
          <span key={p.key} className="rounded bg-[#7a5cc4]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#5a3ea4]">{L(p.label)}</span>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">
        {T("From:", "Út frá:")} {prescription.compensations.map((c) => L(c.label)).join(" · ")}
      </p>

      {/* Ordered phases */}
      <div className="mt-3 space-y-2.5">
        {prescription.phases.map((grp) => (
          <div key={grp.phase}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#5a3ea4]">{L(grp.label)}</p>
            <ul className="mt-0.5 space-y-1">
              {grp.items.map((e) => (
                <li key={e.slug} className="text-[12px]">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-slate-800">{L(e.name)}</span>
                    <span className="text-slate-500">{L(e.dose)}</span>
                    {e.mvic && <span className="rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-500">{L(MVIC_BAND_LABEL[e.mvic.band])}</span>}
                    {e.videoUrl && <a href={e.videoUrl} target="_blank" rel="noreferrer" className="text-[10px] font-medium text-[#2740e6] hover:underline">{T("video", "myndband")} →</a>}
                  </div>
                  {!compact && <div className="text-[10px] text-slate-500">→ {L(e.cue)} · <span className="text-slate-400">{L(e.target)}</span></div>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Send to player */}
      {onSend && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={onSend} disabled={sending} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
            {sending ? T("Sending…", "Sendi…") : T("Send to player's Today", "Senda á Today leikmanns")}
          </button>
          {sentMsg && <span className="text-[11px] text-slate-600">{sentMsg}</span>}
        </div>
      )}

      {/* References + caveat */}
      <button onClick={() => setShowRefs(!showRefs)} className="mt-2 text-[10px] font-medium text-[#2740e6] hover:underline">
        {showRefs ? T("Hide evidence", "Fela heimildir") : T("Evidence", "Heimildir")}
      </button>
      {showRefs && (
        <ul className="mt-1 space-y-0.5 text-[9px] text-slate-400">
          {prescription.references.map((r, i) => <li key={i}>· {r}</li>)}
        </ul>
      )}
      <p className="mt-2 text-[9px] text-slate-500">
        <span style={{ color: GRADE_HEX.moderate }}>●</span> {L(prescription.caveat)}
      </p>
    </div>
  );
}
