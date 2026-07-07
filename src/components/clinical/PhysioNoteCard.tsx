"use client";

/**
 * PhysioNoteCard — the confirmed physio note surfaced on the return-to-training
 * page. Layered read: (0) one-line status verdict; (1) prevention focus + the
 * L/R cross-check (does the physio's one-sided finding show up on the pitch?);
 * (2) findings/full report behind a toggle. The clinician's note is authoritative
 * — this only READS confirmed data; it never overrides the RTT engine.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Side = "left" | "right" | "bilateral" | null;
type Finding = { flag: string; side: Side; location: string | null };
type Summary = {
  ok: boolean;
  report: null | { id: string; report_date: string | null; clinician_name: string | null; clinic: string | null; current_status: string | null; return_to_play: { status: string | null; match_fitness: string | null } | null; url: string | null };
  findings: Finding[];
  prevention: string[];
  returnToPlay: string[];
  reportedSide: "left" | "right" | null;
  ima: null | { leftPct: number; rightPct: number; asymmetryPct: number; heavierSide: "left" | "right"; imbalanced: boolean; days: number; windowDays: number };
  crossCheck: null | { reportedSide: "left" | "right"; onPitchLighterSide: "left" | "right"; consistent: boolean };
};

const sideLabel = (s: Side, is: boolean) => s === "left" ? (is ? "vinstri" : "left") : s === "right" ? (is ? "hægri" : "right") : s === "bilateral" ? (is ? "báðum megin" : "bilateral") : "";

export default function PhysioNoteCard({ playerId, is }: { playerId: string; is: boolean }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? "", []);
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/coach/clinical-reports/summary?player_id=${playerId}`, { headers: { Authorization: `Bearer ${await token()}` } });
        const j = await res.json();
        setData(res.ok ? j : null);
      } catch { setData(null); }
      finally { setLoading(false); }
    })();
  }, [playerId, token]);

  if (loading) return null;
  if (!data || !data.report) return null; // no confirmed physio note — render nothing

  const { report, findings, prevention, returnToPlay, ima, crossCheck } = data;
  const verdict = report.current_status || returnToPlay[0] || (is ? "Sjúkraþjálfaraskýrsla skráð" : "Physio note on file");

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">{is ? "Sjúkraþjálfaraskýrsla" : "Physio note"}</span>
        {report.report_date && <span className="text-[11px] text-teal-700/70">{fmtDate(report.report_date)}</span>}
      </div>

      {/* Layer 0 — verdict */}
      <div className="mt-1.5 text-[15px] font-bold text-slate-900">{verdict}</div>

      {/* Layer 1 — prevention focus + return-to-play (plain, no click) */}
      <div className="mt-1.5 space-y-1 text-sm text-slate-700">
        {returnToPlay.length > 0 && report.current_status && (
          <div><span className="text-slate-400">{is ? "Endurkoma: " : "Return: "}</span>{returnToPlay.join("; ")}</div>
        )}
        {prevention.length > 0 && (
          <div><span className="text-slate-400">{is ? "Forvarnir: " : "Prevention focus: "}</span>{prevention.join("; ")}</div>
        )}
      </div>

      {/* Layer 1 — L/R cross-check: physio side vs on-pitch IMA CoD split */}
      {ima && (
        <div className="mt-2.5 rounded-lg border border-teal-100 bg-white p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Á vellinum: stefnubreytingar V/H" : "On the pitch: change-of-direction L/R"}</span>
            <span className="text-[10px] text-slate-400">{is ? `${ima.windowDays} dagar` : `${ima.windowDays} days`} · {ima.days} {is ? "æfingar" : "sessions"}</span>
          </div>
          <div className="mt-1 text-sm text-slate-800">
            <span className="font-semibold">{ima.leftPct}% {is ? "vinstri" : "left"} / {ima.rightPct}% {is ? "hægri" : "right"}</span>
            {ima.imbalanced && <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700">{is ? `${ima.asymmetryPct}% ójafnvægi` : `${ima.asymmetryPct}% asymmetry`}</span>}
          </div>
          {crossCheck ? (
            <p className="mt-1 text-[11px] leading-snug text-slate-600">
              {crossCheck.consistent
                ? (is
                    ? `Passar við skýrsluna: minni stefnubreyting ${sideLabel(crossCheck.onPitchLighterSide, is)} megin — hliðin sem skýrslan nefnir (${sideLabel(crossCheck.reportedSide, is)}). Getur bent til að hann hlífi hliðinni.`
                    : `Consistent with the note: less change-of-direction on the ${sideLabel(crossCheck.onPitchLighterSide, is)} side — the side the report flags (${sideLabel(crossCheck.reportedSide, is)}). May indicate he offloads it.`)
                : (is
                    ? `Skýrslan nefnir ${sideLabel(crossCheck.reportedSide, is)} hlið, en á vellinum er minni stefnubreyting ${sideLabel(crossCheck.onPitchLighterSide, is)} megin. Ekki samræmi — vert að skoða.`
                    : `The note flags the ${sideLabel(crossCheck.reportedSide, is)} side, but on the pitch he does less change-of-direction on the ${sideLabel(crossCheck.onPitchLighterSide, is)} side. Not consistent — worth a look.`)}
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              {is ? "Athugun, ekki greining. Ber saman raun-hreyfingu við hlið sem skýrslan nefnir." : "An observation, not a diagnosis. Compares on-pitch movement to the side the report flags."}
            </p>
          )}
        </div>
      )}

      {/* Layer 2 — findings + provenance */}
      {(findings.length > 0 || report.url) && (
        <button type="button" onClick={() => setShowDetails((v) => !v)} className="mt-2 text-[11px] font-semibold text-teal-700 hover:text-teal-900">
          {showDetails ? (is ? "Fela smáatriði ▲" : "Hide details ▲") : (is ? "Klínísk atriði · full skýrsla ▼" : "Clinical findings · full report ▼")}
        </button>
      )}
      {showDetails && (
        <div className="mt-2 space-y-1.5 border-t border-teal-100 pt-2 text-sm">
          {findings.map((f, i) => (
            <div key={i} className="text-slate-700">
              • {f.flag}{f.side ? <span className="text-slate-400"> ({sideLabel(f.side, is)})</span> : null}
            </div>
          ))}
          {report.url && (
            <a href={report.url} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 text-[12px] font-medium text-indigo-600 hover:text-indigo-700">{is ? "Opna PDF-skýrslu ↗" : "Open PDF report ↗"}</a>
          )}
        </div>
      )}

      <p className="mt-2 border-t border-teal-100 pt-2 text-[10px] text-teal-700/70">
        {report.clinician_name ? `${is ? "Heimild" : "Source"}: ${report.clinician_name}${report.clinic ? `, ${report.clinic}` : ""} · ` : ""}
        {is ? "Athugasemd sjúkraþjálfarans er heimildin. Kerfið les hana — það hnekkir henni aldrei." : "The clinician's note is authoritative. The system reads it — it never overrides it."}
      </p>
    </div>
  );
}
