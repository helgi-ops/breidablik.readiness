"use client";

/**
 * Rehab-track card — the movement-quality continuum (Enda King's spirit) that a
 * player's screen findings map into (e.g. dynamic valgus / asymmetry → the
 * ACL/knee track). Layered read: the entry phase + track at a glance → the
 * phased continuum with each phase's "why" → exercises + exit criteria + King
 * principles behind a toggle. REHAB-SUPPORT only — the clinician gates every
 * phase; never a diagnosis, never the readiness colour.
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
  entryPhaseKey: string; phases: PhaseView[];
};

const STAGE_LABEL: Record<string, { en: string; is: string }> = {
  strength: { en: "Strength", is: "Styrkur" },
  ssc_plyometric: { en: "Plyometric / SSC", is: "Plyometric / SSC" },
  cutting_mechanics: { en: "Cutting / CoD", is: "Cutting / CoD" },
  sprint: { en: "Sprint", is: "Sprettur" },
};
const PURPLE = "#7a5cc4";

export default function RehabTrackCard({ track, isEN }: { track: RehabTrackView; isEN: boolean }) {
  const [open, setOpen] = React.useState(false);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const entry = track.phases.find((p) => p.key === track.entryPhaseKey);

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${PURPLE}33`, background: `${PURPLE}0d` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>{T("Rehab track", "Endurhæfingar-ferill")} · {L(track.name)}</p>
        <button onClick={() => setOpen((o) => !o)} className="text-[11px] font-semibold" style={{ color: PURPLE }}>
          {open ? T("Hide phases", "Fela þrep") : T("Show phases & exit criteria", "Sýna þrep & viðmið")}
        </button>
      </div>

      {/* (0) verdict — where to start */}
      {entry && (
        <p className="mt-1.5 text-[13px] font-semibold text-slate-800">
          {T("Start here:", "Byrjaðu hér:")} <span style={{ color: PURPLE }}>{L(entry.name)}</span>
        </p>
      )}
      {/* (1) plain "why" — the track framing + which phases the findings indicate */}
      <p className="mt-1 text-[12px] text-slate-700">{L(track.summary)}</p>
      <p className="mt-1 text-[11px] text-slate-600">
        {T("Findings point to: ", "Niðurstöður benda á: ")}
        {track.phases.filter((p) => p.indicated).map((p) => L(p.name)).join(" · ") || T("—", "—")}
      </p>

      {/* (2) details — the phased continuum, exercises, exit criteria, principles */}
      {open && (
        <div className="mt-3 space-y-2.5">
          {track.phases.map((p) => (
            <div key={p.key} className={`rounded-lg border p-2.5 ${p.indicated ? "bg-white" : "bg-white/50"}`} style={{ borderColor: p.indicated ? `${PURPLE}55` : "#e2e8f0" }}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[12px] font-semibold text-slate-800">{L(p.name)}</span>
                <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `${PURPLE}1a`, color: PURPLE }}>{isEN ? STAGE_LABEL[p.continuumStage]?.en : STAGE_LABEL[p.continuumStage]?.is}</span>
                {p.isEntry && <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ background: PURPLE }}>{T("START", "BYRJA")}</span>}
                {p.indicated && !p.isEntry && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{T("indicated", "ábending")}</span>}
              </div>
              <p className="mt-1 text-[11px] text-slate-600">{L(p.focus)}</p>
              {p.exercises.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-1">
                  {p.exercises.map((e) => <li key={e.slug} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700">{L(e.name)}</li>)}
                </ul>
              )}
              {p.exitCriteria.length > 0 && (
                <div className="mt-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{T("Advance when", "Framvinda þegar")}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {p.exitCriteria.map((c, i) => (
                      <li key={i} className="text-[11px] text-slate-600">✓ {L(c.label)}{c.pending && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-700">{T("threshold pending", "viðmið í bið")}</span>}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{T("Framework principles", "Meginreglur umgjörðar")}</p>
            <ul className="mt-0.5 space-y-0.5">
              {track.principles.map((pr, i) => <li key={i} className="text-[11px] text-slate-600">· {L(pr)}</li>)}
            </ul>
          </div>
          <p className="text-[9px] text-slate-400">{track.citation}</p>
        </div>
      )}

      <p className="mt-2 text-[9px] text-slate-500">{L(track.caveat)}</p>
    </div>
  );
}
