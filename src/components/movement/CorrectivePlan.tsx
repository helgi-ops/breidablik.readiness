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
import { EXERCISE_SOURCE_LABEL } from "@/lib/micropulse/movementScreen/correctives/exerciseSources";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import type { CorrectivePrescription } from "@/lib/micropulse/movementScreen/correctives/mapping";

const GRADE_HEX: Record<string, string> = { strong: "#1c7a4a", moderate: "#de9328", emerging: "#a83e28" };

export default function CorrectivePlan({
  prescription, isEN, onSend, sending, sentMsg, compact,
  selectable, selected, onToggle, onSendSelected, gatedPhases,
}: {
  prescription: CorrectivePrescription;
  isEN: boolean;
  onSend?: () => void;
  sending?: boolean;
  sentMsg?: string | null;
  compact?: boolean;
  /** Checkbox mode: the coach picks which exercises to send. */
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (slug: string) => void;
  onSendSelected?: () => void;
  /** Phases held for the clinician (e.g. integrate for an injured player) — shown
   *  with a "clinician-gated" chip and unticked by default. */
  gatedPhases?: string[];
}) {
  const [showRefs, setShowRefs] = React.useState(false);
  const [openAlts, setOpenAlts] = React.useState<Record<string, boolean>>({});
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);

  const renderItem = (e: CorrectivePrescription["phases"][number]["items"][number]) => (
    <li key={e.slug} className="text-[12px]">
      <div className="flex flex-wrap items-baseline gap-x-2">
        {selectable && <input type="checkbox" checked={selected?.has(e.slug) ?? false} onChange={() => onToggle?.(e.slug)} className="self-center" />}
        <span className="font-medium text-slate-800">{L(e.name)}</span>
        <span className="text-slate-500">{L(e.dose)}</span>
        {e.source && e.source !== "emg_library" && <span className="rounded bg-[#7a5cc4]/15 px-1 text-[9px] font-semibold text-[#5a3ea4]">{L(EXERCISE_SOURCE_LABEL[e.source])}</span>}
        {e.mvic && <span className="rounded bg-slate-100 px-1 text-[9px] font-medium text-slate-500">{L(MVIC_BAND_LABEL[e.mvic.band])}</span>}
        {e.videoUrl && <a href={e.videoUrl} target="_blank" rel="noreferrer" className="text-[10px] font-medium text-[#2740e6] hover:underline">{T("video", "myndband")} →</a>}
      </div>
      {!compact && <div className="text-[10px] text-slate-500">→ {L(e.cue)} · <span className="text-slate-400">{L(e.target)}</span></div>}
    </li>
  );

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
        {T("Addressing:", "Tekur á:")} {prescription.compensations.map((c) => L(c.label)).join(" · ")}
      </p>

      {/* Provenance — exactly what data the plan was built from */}
      {(() => {
        const screenSrc = prescription.sources?.filter((s) => s.kind === "screen") ?? [];
        const regionSrc = prescription.sources?.filter((s) => s.kind === "region") ?? [];
        const vald = prescription.objectiveSignals ?? [];
        return (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-600">{T("Based on:", "Byggt á:")}</span>
            {screenSrc.map((s, i) => <span key={`s${i}`} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{T("Screen", "Skimun")} · {L(s.label)}</span>)}
            {regionSrc.map((s, i) => <span key={`r${i}`} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{T("Region", "Svæði")} · {L(s.label)}</span>)}
            {vald.map((s, i) => <span key={`v${i}`} className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] text-[#2740e6]">{s.source} · {L(s.detail)} · {s.ageDays}{T("d", "d")}</span>)}
            {screenSrc.length === 0 && regionSrc.length === 0 && vald.length > 0 && (
              <span className="text-[10px] italic text-slate-400">{T("— VALD only; save a movement screen to add its findings", "— aðeins VALD; vistaðu skimun til að bæta niðurstöðum við")}</span>
            )}
          </div>
        );
      })()}

      {/* Ordered phases — two columns on wider screens to cut height. Each phase
          leads with ONE primary (sent by default); secondary alternatives collapse
          behind a "+ N alternatives" toggle so the default read stays short. */}
      <div className="mt-3 grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
        {prescription.phases.map((grp) => {
          const primary = grp.items.filter((e) => e.tier !== "secondary");
          const secondary = grp.items.filter((e) => e.tier === "secondary");
          const altsOpen = !!openAlts[grp.phase];
          const gated = gatedPhases?.includes(grp.phase);
          return (
            <div key={grp.phase}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#5a3ea4]">
                {L(grp.label)}
                {gated && <span className="ml-1.5 rounded bg-[#7a5cc4]/15 px-1 py-0.5 text-[8px] font-semibold normal-case text-[#5a3ea4]">{T("clinician-gated", "klíníker-gated")}</span>}
              </p>
              <ul className="mt-0.5 space-y-1">
                {primary.map(renderItem)}
              </ul>
              {secondary.length > 0 && (
                <>
                  <button onClick={() => setOpenAlts((s) => ({ ...s, [grp.phase]: !s[grp.phase] }))} className="mt-1 text-[10px] font-medium text-[#7a5cc4] hover:underline">
                    {altsOpen ? T("− Hide alternatives", "− Fela valkosti") : T(`+ ${secondary.length} alternative${secondary.length > 1 ? "s" : ""}`, `+ ${secondary.length} valkost${secondary.length > 1 ? "ir" : "ur"}`)}
                  </button>
                  {altsOpen && <ul className="mt-1 space-y-1 border-l-2 border-slate-100 pl-2">{secondary.map(renderItem)}</ul>}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Send to player — selected exercises (selectable) or the whole block */}
      {(onSend || onSendSelected) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={selectable ? onSendSelected : onSend} disabled={sending || (selectable && (selected?.size ?? 0) === 0)} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
            {sending ? T("Sending…", "Sendi…") : selectable ? T(`Send selected (${selected?.size ?? 0}) to player's Today`, `Senda valið (${selected?.size ?? 0}) á Today leikmanns`) : T("Send to player's Today", "Senda á Today leikmanns")}
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
