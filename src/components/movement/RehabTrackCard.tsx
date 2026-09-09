"use client";

/**
 * Rehab-track card — a ROADMAP STEPPER with PERSISTED, clinician-gated progression.
 * The player's screen findings place them on a phased return-to-play continuum
 * (Enda King's spirit); this shows where they are, each phase's exit gate, and —
 * for an injured (rehab) track — lets the clinician ADVANCE / REGRESS / DISCHARGE
 * with a logged reason. Nothing auto-advances; criteria are never auto-evaluated as
 * met. A new screen re-anchors the RECOMMENDATION only; a divergence from the
 * tracked phase is surfaced, never silently resolved. The current phase's exercises
 * live in the corrective plan above. REHAB-SUPPORT only — the clinician gates every
 * step; never a diagnosis, never a clearance, never the readiness colour.
 */
import * as React from "react";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";

type ExitCriterion = { label: Bi; source: string; pending?: boolean };
type Exercise = { slug: string; name: Bi; dose: Bi; cue: Bi };
type PhaseView = {
  key: string; order: number; name: Bi; focus: Bi; continuumStage: string;
  indicated: boolean; isEntry: boolean; exercises: Exercise[]; exitCriteria: ExitCriterion[]; citation: string;
  reached?: boolean; isCurrent?: boolean;
};
type TrackStatus = "active" | "paused" | "completed" | "discharged";
export type RehabTrackView = {
  track: string; name: Bi; summary: Bi; principles: Bi[]; caveat: Bi; citation: string;
  entryPhaseKey: string; phases: PhaseView[]; redFlags?: Bi; coachPath?: string;
  mode?: "rehab" | "prehab";
  screenRecommendedPhaseKey?: string; trackedPhaseKey?: string; trackedStatus?: TrackStatus; divergesFromScreen?: boolean;
};
export type RehabActionPayload = { action: "enter" | "advance" | "regress" | "discharge" | "pause" | "resume"; toPhaseKey?: string; criteriaMet?: string[]; reason?: string };

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
const GREEN = "#1c7a4a";

export default function RehabTrackCard({ track, isEN, playerId, onAction, busy }: {
  track: RehabTrackView; isEN: boolean; playerId?: string;
  onAction?: (p: RehabActionPayload) => void; busy?: boolean;
}) {
  const [showPrinciples, setShowPrinciples] = React.useState(false);
  const [pending, setPending] = React.useState<"advance" | "regress" | "discharge" | null>(null);
  const [reason, setReason] = React.useState("");
  const [met, setMet] = React.useState<Set<string>>(new Set());
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const playerHref = playerId ? `?player=${encodeURIComponent(playerId)}` : "";
  const isPrehab = track.mode === "prehab";
  const phases = [...track.phases].sort((a, b) => a.order - b.order);
  const tracked = !!track.trackedPhaseKey;
  const status = track.trackedStatus;
  const canAct = !isPrehab && !!onAction; // tracking is for an injured (rehab) track

  const entry = track.phases.find((p) => p.key === track.entryPhaseKey);
  const entryOrder = entry?.order ?? phases[0]?.order ?? 0;
  const current = tracked ? phases.find((p) => p.isCurrent) : entry;
  const next = current ? phases.find((p) => p.order === current.order + 1) : undefined;
  const prev = current ? phases.find((p) => p.order === current.order - 1) : undefined;
  const phaseName = (key?: string) => { const p = phases.find((x) => x.key === key); return p ? L(p.name) : (key ?? ""); };

  // Per-phase visual state: tracked → done / current / upcoming from persisted
  // reached/isCurrent; untracked → relative to the screen-recommended entry.
  const stateOf = (p: PhaseView): "done" | "current" | "upcoming" => {
    if (tracked) return p.isCurrent ? "current" : p.reached ? "done" : "upcoming";
    return p.isEntry ? "current" : p.order < entryOrder ? "done" : "upcoming";
  };
  const DOT: Record<string, string> = { done: tracked ? GREEN : "#cbd5e1", current: PURPLE, upcoming: "#e2e8f0" };
  const stateLabel = (s: string): Bi =>
    s === "current" ? { en: "current", is: "núverandi" }
      : s === "done" ? (tracked ? { en: "cleared", is: "lokið" } : { en: "foundational", is: "grunnur" })
        : { en: "upcoming · clinician-gated", is: "væntanlegt · klíníker-gated" };

  const terminal = status === "discharged" || status === "completed";
  const submit = (action: "advance" | "regress" | "discharge") => {
    if (!onAction) return;
    onAction({ action, toPhaseKey: action === "advance" ? next?.key : action === "regress" ? prev?.key : undefined, criteriaMet: [...met], reason: reason.trim() });
    setPending(null); setReason(""); setMet(new Set());
  };

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${PURPLE}33`, background: `${PURPLE}0d` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>
          {isPrehab ? T("Prehab progression", "Prehab framvinda") : T("Rehab track", "Endurhæfingar-ferill")} · {L(track.name)}
        </p>
        {track.coachPath && (
          <a href={`${track.coachPath}${playerHref}`} className="text-[11px] font-semibold hover:underline" style={{ color: PURPLE }}>{T("Open the protocol →", "Opna prótókollið →")}</a>
        )}
      </div>
      {isPrehab && (
        <p className="mt-1 text-[10px] text-slate-500">{T("Not injured — a movement-quality prehab progression, not active rehab. (An active injury would drive the phase, clinician-gated.)", "Ekki meiddur — hreyfigæða prehab framvinda, ekki virk endurhæfing. (Virkt meiðsli myndi stýra fasanum, klíníker-stýrt.)")}</p>
      )}

      {/* Red-flag gate — stop-and-refer, above everything (e.g. low-back / cauda equina). */}
      {track.redFlags && (
        <div className="mt-2 rounded-lg border-l-4 border-[#a83e28] bg-[#a83e28]/8 p-2.5">
          <p className="text-[11px] font-semibold text-[#a83e28]">⛔ {T("Red flags — stop and refer", "Rauð flögg — stopp og vísaðu")}</p>
          <p className="mt-0.5 text-[11px] text-slate-700">{L(track.redFlags)}</p>
        </div>
      )}

      {/* (0) verdict — tracked phase + status, or the recommendation when untracked */}
      {current && (
        <p className="mt-1.5 text-[13px] font-semibold text-slate-800">
          {tracked ? T("Tracked at:", "Skráð á:") : isPrehab ? T("Suggested start:", "Tillaga að byrjun:") : T("Recommended start:", "Ráðlögð byrjun:")}{" "}
          <span style={{ color: PURPLE }}>{L(current.name)}</span>
          {tracked && status && <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: terminal ? "#94a3b833" : `${GREEN}22`, color: terminal ? "#64748b" : GREEN }}>{status}</span>}
        </p>
      )}
      <p className="mt-1 text-[12px] text-slate-700">{L(track.summary)}</p>

      {/* Divergence — a new screen re-anchored the recommendation away from the
          tracked phase. Surfaced for the clinician; never auto-resolved. */}
      {tracked && track.divergesFromScreen && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5">
          <p className="text-[11px] text-amber-800">
            ⚑ {T(`Latest screen suggests ${phaseName(track.screenRecommendedPhaseKey)}; player is tracked at ${phaseName(track.trackedPhaseKey)} — review.`, `Nýjasta skimun bendir á ${phaseName(track.screenRecommendedPhaseKey)}; leikmaður er skráður á ${phaseName(track.trackedPhaseKey)} — yfirfara.`)}
          </p>
        </div>
      )}

      {/* Not-yet-tracked (injured track) → offer to seed tracking at the recommendation. */}
      {canAct && !tracked && current && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[#7a5cc4]/30 bg-white px-2.5 py-1.5">
          <span className="text-[11px] text-slate-600">{T("Not tracked yet.", "Ekki skráð enn.")}</span>
          <button disabled={busy} onClick={() => onAction?.({ action: "enter", toPhaseKey: track.screenRecommendedPhaseKey ?? current.key })} className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40" style={{ borderColor: PURPLE, color: PURPLE }}>
            {T(`Start tracking at ${L(current.name)}`, `Byrja að fylgja á ${L(current.name)}`)}
          </button>
        </div>
      )}

      {/* (1) the roadmap stepper */}
      <ol className="mt-3 space-y-2">
        {phases.map((p) => {
          const st = stateOf(p);
          return (
            <li key={p.key} className="flex gap-2.5">
              <div className="flex flex-col items-center pt-0.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: DOT[st] }}>{st === "done" && tracked ? "✓" : p.order}</span>
              </div>
              <div className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 ${st === "current" ? "bg-white" : "bg-white/40"}`} style={{ borderColor: st === "current" ? `${PURPLE}55` : "#e2e8f0" }}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[12px] font-semibold" style={{ color: st === "current" ? "#1e293b" : "#64748b" }}>{L(p.name)}</span>
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `${PURPLE}14`, color: PURPLE }}>{isEN ? STAGE_LABEL[p.continuumStage]?.en : STAGE_LABEL[p.continuumStage]?.is}</span>
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `${DOT[st]}33`, color: st === "current" ? PURPLE : st === "done" && tracked ? GREEN : "#94a3b8" }}>{L(stateLabel(st))}</span>
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

      {/* Clinician-gated actions — only for a tracked, non-terminal injured track. */}
      {canAct && tracked && !terminal && current && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{T("Clinician action (logged)", "Klíníker-aðgerð (skráð)")}</p>
          {/* Gates for the current phase — which criteria were judged met. */}
          {pending === "advance" && current.exitCriteria.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {current.exitCriteria.map((c) => (
                <li key={c.label.en}>
                  <label className="flex items-start gap-1.5 text-[11px] text-slate-700">
                    <input type="checkbox" className="mt-0.5" checked={met.has(c.label.en)} onChange={() => setMet((s) => { const n = new Set(s); if (n.has(c.label.en)) n.delete(c.label.en); else n.add(c.label.en); return n; })} />
                    <span>{L(c.label)} {c.pending && <span className="rounded bg-amber-100 px-1 text-[9px] text-amber-700">{T("threshold pending", "viðmið í bið")}</span>}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {pending ? (
            <div className="mt-2">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={T(`Reason to ${pending}${pending === "advance" && next ? ` → ${L(next.name)}` : pending === "regress" && prev ? ` → ${L(prev.name)}` : ""} (required)`, `Ástæða (${pending}) — skylda`)} className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]" />
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button disabled={busy || !reason.trim()} onClick={() => submit(pending)} className="rounded-lg px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40" style={{ background: pending === "discharge" ? "#a83e28" : PURPLE }}>
                  {busy ? T("Saving…", "Vista…") : T("Confirm", "Staðfesta")}
                </button>
                <button onClick={() => { setPending(null); setReason(""); setMet(new Set()); }} className="text-[11px] font-medium text-slate-500 hover:underline">{T("Cancel", "Hætta við")}</button>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {next && <button disabled={busy} onClick={() => setPending("advance")} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40" style={{ background: PURPLE }}>{T(`Advance → ${L(next.name)}`, `Framvinda → ${L(next.name)}`)}</button>}
              {prev && <button disabled={busy} onClick={() => setPending("regress")} className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40" style={{ borderColor: "#de9328", color: "#8a5a12" }}>{T(`Regress → ${L(prev.name)}`, `Afturför → ${L(prev.name)}`)}</button>}
              <button disabled={busy} onClick={() => setPending("discharge")} className="rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-[#a83e28] disabled:opacity-40" style={{ borderColor: "#a83e2855" }}>{T("Discharge", "Útskrifa")}</button>
              <button disabled={busy} onClick={() => onAction?.({ action: status === "paused" ? "resume" : "pause" })} className="text-[11px] font-medium text-slate-500 hover:underline disabled:opacity-40">{status === "paused" ? T("Resume", "Halda áfram") : T("Pause", "Gera hlé")}</button>
            </div>
          )}
          <p className="mt-1.5 text-[9px] text-slate-400">{T("Advancing confirms this track's ledger deficits; discharge resolves them. Nothing auto-advances — you gate every step.", "Framvinda staðfestir halla þessa ferils í halla-bók; útskrift leysir þá. Ekkert stigmagnast sjálfkrafa — þú stýrir hverju skrefi.")}</p>
        </div>
      )}

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
