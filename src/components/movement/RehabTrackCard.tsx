"use client";

/**
 * Rehab-track card — a ROADMAP STEPPER, not a second exercise list. The player's
 * screen findings place them on a phased return-to-play continuum (Enda King's
 * spirit); this shows where they are (earlier · current · upcoming) and each
 * phase's exit gate. The CURRENT phase's exercises live in the corrective plan
 * above — so the roadmap doesn't duplicate them; upcoming phases (plyometric,
 * cutting/sprint) are clinician-gated and NOT sendable yet. REHAB-SUPPORT only —
 * the clinician gates every phase; never a diagnosis, never the readiness colour.
 */
import * as React from "react";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";

type ExitCriterion = { label: Bi; source: string; pending?: boolean };
type Exercise = { slug: string; name: Bi; dose: Bi; cue: Bi };
type PhaseView = {
  key: string; order: number; name: Bi; focus: Bi; continuumStage: string;
  indicated: boolean; isEntry: boolean; exercises: Exercise[]; exitCriteria: ExitCriterion[]; citation: string;
};
export type RehabTrackView = {
  track: string; name: Bi; summary: Bi; principles: Bi[]; caveat: Bi; citation: string;
  entryPhaseKey: string; phases: PhaseView[]; redFlags?: Bi; coachPath?: string;
};

const STAGE_LABEL: Record<string, { en: string; is: string }> = {
  clearance: { en: "Clearance", is: "Heimild" },
  motor_control: { en: "Motor control", is: "Hreyfistjórn" },
  mobility: { en: "Mobility", is: "Hreyfanleiki" },
  strength: { en: "Strength", is: "Styrkur" },
  ssc_plyometric: { en: "Plyometric / SSC", is: "Plyometric / SSC" },
  cutting_mechanics: { en: "Cutting / CoD", is: "Cutting / CoD" },
  sprint: { en: "Sprint", is: "Sprettur" },
};
const PURPLE = "#7a5cc4";

export default function RehabTrackCard({ track, isEN, playerId }: { track: RehabTrackView; isEN: boolean; playerId?: string }) {
  const [showPrinciples, setShowPrinciples] = React.useState(false);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const playerHref = playerId ? `?player=${encodeURIComponent(playerId)}` : "";
  const entry = track.phases.find((p) => p.key === track.entryPhaseKey);
  const entryOrder = entry?.order ?? track.phases[0]?.order ?? 0;
  const phases = [...track.phases].sort((a, b) => a.order - b.order);

  // Where the player sits on the roadmap, relative to the entry (current) phase.
  const statusOf = (p: PhaseView): "earlier" | "current" | "upcoming" =>
    p.isEntry ? "current" : p.order < entryOrder ? "earlier" : "upcoming";
  const STATUS: Record<string, { label: Bi; dot: string; text: string }> = {
    earlier: { label: { en: "foundational", is: "grunnur" }, dot: "#cbd5e1", text: "#94a3b8" },
    current: { label: { en: "current", is: "núverandi" }, dot: PURPLE, text: PURPLE },
    upcoming: { label: { en: "upcoming · clinician-gated", is: "væntanlegt · klíníker-gated" }, dot: "#e2e8f0", text: "#94a3b8" },
  };

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${PURPLE}33`, background: `${PURPLE}0d` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>{T("Rehab track", "Endurhæfingar-ferill")} · {L(track.name)}</p>
        {track.coachPath && (
          <a href={`${track.coachPath}${playerHref}`} className="text-[11px] font-semibold hover:underline" style={{ color: PURPLE }}>{T("Open the protocol →", "Opna prótókollið →")}</a>
        )}
      </div>

      {/* Red-flag gate — stop-and-refer, above everything (e.g. low-back / cauda equina). */}
      {track.redFlags && (
        <div className="mt-2 rounded-lg border-l-4 border-[#a83e28] bg-[#a83e28]/8 p-2.5">
          <p className="text-[11px] font-semibold text-[#a83e28]">⛔ {T("Red flags — stop and refer", "Rauð flögg — stopp og vísaðu")}</p>
          <p className="mt-0.5 text-[11px] text-slate-700">{L(track.redFlags)}</p>
        </div>
      )}

      {/* (0) verdict — where to start, + the "why" */}
      {entry && (
        <p className="mt-1.5 text-[13px] font-semibold text-slate-800">
          {T("You are here:", "Þú ert hér:")} <span style={{ color: PURPLE }}>{L(entry.name)}</span>
        </p>
      )}
      <p className="mt-1 text-[12px] text-slate-700">{L(track.summary)}</p>

      {/* (1) the roadmap stepper — one step per phase; NO exercise list (those live
          in the corrective plan above). Current phase highlighted; later phases are
          clinician-gated and not sendable yet. */}
      <ol className="mt-3 space-y-2">
        {phases.map((p) => {
          const st = statusOf(p);
          const s = STATUS[st];
          return (
            <li key={p.key} className="flex gap-2.5">
              <div className="flex flex-col items-center pt-0.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: s.dot }}>{p.order}</span>
              </div>
              <div className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 ${st === "current" ? "bg-white" : "bg-white/40"}`} style={{ borderColor: st === "current" ? `${PURPLE}55` : "#e2e8f0" }}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[12px] font-semibold" style={{ color: st === "current" ? "#1e293b" : "#64748b" }}>{L(p.name)}</span>
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `${PURPLE}14`, color: PURPLE }}>{isEN ? STAGE_LABEL[p.continuumStage]?.en : STAGE_LABEL[p.continuumStage]?.is}</span>
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `${s.dot}33`, color: s.text }}>{L(s.label)}</span>
                </div>
                <p className="mt-0.5 text-[11px]" style={{ color: st === "current" ? "#475569" : "#94a3b8" }}>{L(p.focus)}</p>
                {st === "current" && (
                  <p className="mt-0.5 text-[10px] font-medium" style={{ color: PURPLE }}>{T("→ this phase's exercises are in the corrective plan above.", "→ æfingar þessa fasa eru í leiðréttingar-planinu að ofan.")}</p>
                )}
                {p.exitCriteria.length > 0 && (
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    <span className="font-semibold uppercase tracking-wide">{T("Advance when: ", "Framvinda þegar: ")}</span>
                    {p.exitCriteria.map((c) => L(c.label)).join(" · ")}
                    {p.exitCriteria.some((c) => c.pending) && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700">{T("threshold pending", "viðmið í bið")}</span>}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <button onClick={() => setShowPrinciples((o) => !o)} className="mt-2 text-[10px] font-medium" style={{ color: PURPLE }}>
        {showPrinciples ? T("Hide principles", "Fela meginreglur") : T("Framework principles", "Meginreglur umgjörðar")}
      </button>
      {showPrinciples && (
        <div className="mt-1">
          <ul className="space-y-0.5">
            {track.principles.map((pr, i) => <li key={i} className="text-[11px] text-slate-600">· {L(pr)}</li>)}
          </ul>
          <p className="mt-1 text-[9px] text-slate-400">{track.citation}</p>
        </div>
      )}

      <p className="mt-2 text-[9px] text-slate-500">{L(track.caveat)}</p>
    </div>
  );
}
