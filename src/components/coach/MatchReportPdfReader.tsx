"use client";

/**
 * MatchReportPdfReader — "read this match report for me". The coach uploads a full
 * match-report PDF (Wyscout Report Center, StatsBomb Game Team Analysis, a league
 * report…) and the model returns a plain-language coach briefing: headline verdict,
 * what went well / to improve, key players, tactical + opponent notes.
 *
 * Labelled AS AI, cites the uploaded report, DESCRIPTIVE — it writes nothing and never
 * touches the readiness colour. Complements the structured CSV/Excel importers with the
 * qualitative read those can't give.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Read = {
  headline?: string; score?: string; competition?: string; summary?: string; phases?: string;
  keyMoments?: string[]; statHighlights?: Array<{ label: string; value: string }>;
  wentWell?: string[]; toImprove?: string[]; keyPlayers?: Array<{ name: string; note: string }>;
  tactical?: string; opponent?: string;
};

export default function MatchReportPdfReader({ date }: { date?: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [read, setRead] = React.useState<Read | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  // Load a saved briefing for the selected match — no re-upload needed to see it again.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setRead(null); setSource(null); setSavedAt(null); setErr(null);
      if (!date) return;
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) return;
      const res = await fetch(`/api/coach/match-report-read?date=${date}`, { headers: { Authorization: `Bearer ${tok}` } })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (cancelled || !res?.read) return;
      setRead(res.read as Read); setSource(res.source ?? null); setSavedAt(res.savedAt ?? null); setOpen(true);
    })();
    return () => { cancelled = true; };
  }, [date]);

  async function downloadPdf() {
    if (!read) return;
    setPdfBusy(true);
    try {
      const { downloadMatchReportReadPdf } = await import("@/components/coach/MatchReportReadPdf");
      await downloadMatchReportReadPdf(read, source, is ? "IS" : "EN");
    } finally { setPdfBusy(false); }
  }

  async function run() {
    if (!file) return;
    setBusy(true); setErr(null); setRead(null);
    try {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("file", file); fd.set("lang", is ? "IS" : "EN");
      if (date) fd.set("date", date);
      const res = await fetch("/api/coach/match-report-read", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setRead(j.read as Read); setSource(j.source ?? file.name); setSavedAt(j.saved ? new Date().toISOString() : null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  const List = ({ title, items, tone }: { title: string; items?: string[]; tone: "good" | "bad" }) =>
    items && items.length > 0 ? (
      <div>
        <div className={`text-[12px] font-bold ${tone === "good" ? "text-[#1c7a4a]" : "text-[#a83e28]"}`}>{title}</div>
        <ul className="mt-1 space-y-1">
          {items.map((x, i) => <li key={i} className="flex gap-1.5 text-[13px] text-slate-700"><span className={tone === "good" ? "text-[#1c7a4a]" : "text-[#a83e28]"}>{tone === "good" ? "▲" : "▼"}</span><span>{x}</span></li>)}
        </ul>
      </div>
    ) : null;

  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        {is ? "Lesa leikskýrslu fyrir mig (PDF · AI)" : "Read a match report for me (PDF · AI)"}
      </summary>
      <p className="mt-1 text-[11px] text-slate-400">
        {is
          ? "Settu inn heila leikskýrslu (Wyscout / StatsBomb / deildarskýrslu). AI-inn les allt skjalið og gefur þér læsilega samantekt. Hún vistast á valinn leik — svo þú þarft ekki að upphlaða aftur. Lýsandi — snertir ekki readiness."
          : "Upload a full match report (Wyscout / StatsBomb / a league report). The AI reads the whole document and gives you a plain-language briefing. It's saved against the selected match — no need to re-upload. Descriptive — never touches readiness."}
      </p>
      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
        {is
          ? "Ath.: þetta er FRÁSÖGN, ekki tölfræði. Hún fer ekki inn í tölu-dálkana sem aðrar síður lesa (percentílar, Player Season Analysis, xG-línur). Til að fá tölur inn í kerfið þarftu að flytja inn gagnaskrárnar — StatsBomb/Wyscout CSV eða Excel (Smart Import á Player Season Analysis, eða innflutningsreitirnir hér að ofan)."
          : "Note: this is a NARRATIVE, not stats. It does NOT feed the number columns other pages read (percentiles, Player Season Analysis, xG charts). To get numbers into the system, import the data files — StatsBomb/Wyscout CSV or Excel (Smart Import on Player Season Analysis, or the import boxes above)."}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá (.pdf)" : "File (.pdf)"}</div>
          <input type="file" accept=".pdf,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRead(null); setErr(null); }} className="text-sm" />
        </label>
        <button onClick={run} disabled={!file || busy} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? (is ? "Les skýrsluna… (AI)" : "Reading the report… (AI)") : (is ? "Lesa skýrslu" : "Read report")}
        </button>
      </div>
      {err && <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p>}

      {read && (
        <div className="mt-3 space-y-3 rounded-xl border border-[#2740e6]/20 bg-[#eef0fb] p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">
              {is ? "AI · lesið úr uppsettu skýrslunni þinni, ákveður ekkert" : "AI · read from your uploaded report, decides nothing"}
              {savedAt ? <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">{is ? "VISTAÐ" : "SAVED"}</span> : null}
            </div>
            <button onClick={() => void downloadPdf()} disabled={pdfBusy} className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {pdfBusy ? "…" : (is ? "Sækja PDF" : "Download PDF")}
            </button>
          </div>
          {read.headline ? <p className="text-[15px] font-semibold leading-snug text-slate-900">{read.headline}</p> : null}
          {(read.score || read.competition) ? (
            <div className="text-[12px] font-medium text-slate-500">{[read.score, read.competition].filter(Boolean).join(" · ")}</div>
          ) : null}
          {read.summary ? <p className="text-[13px] leading-relaxed text-slate-700">{read.summary}</p> : null}

          {read.phases ? (
            <div><div className="text-[12px] font-bold text-slate-900">{is ? "Hvernig leikurinn flæddi" : "How it flowed"}</div><p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{read.phases}</p></div>
          ) : null}

          {read.keyMoments && read.keyMoments.length > 0 ? (
            <div>
              <div className="text-[12px] font-bold text-slate-900">{is ? "Lykilaugnablik" : "Key moments"}</div>
              <ul className="mt-1 space-y-0.5">
                {read.keyMoments.map((m, i) => <li key={i} className="flex gap-1.5 text-[13px] text-slate-700"><span className="text-slate-400">•</span><span>{m}</span></li>)}
              </ul>
            </div>
          ) : null}

          {read.statHighlights && read.statHighlights.length > 0 ? (
            <div>
              <div className="text-[12px] font-bold text-slate-900">{is ? "Tölfræði-hápunktar" : "Stat highlights"}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                {read.statHighlights.map((s2, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 border-b border-slate-200/70 py-0.5 text-[12px]"><span className="text-slate-500">{s2.label}</span><span className="font-semibold tabular-nums text-slate-800">{s2.value}</span></div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <List title={is ? "Það sem gekk vel" : "What went well"} items={read.wentWell} tone="good" />
            <List title={is ? "Til að bæta" : "To improve"} items={read.toImprove} tone="bad" />
          </div>

          {read.keyPlayers && read.keyPlayers.length > 0 ? (
            <div>
              <div className="text-[12px] font-bold text-slate-900">{is ? "Lykilleikmenn" : "Key players"}</div>
              <ul className="mt-1 space-y-1">
                {read.keyPlayers.map((p, i) => <li key={i} className="text-[13px] text-slate-700"><b>{p.name}</b>{p.note ? ` — ${p.note}` : ""}</li>)}
              </ul>
            </div>
          ) : null}

          {read.tactical ? (
            <div><div className="text-[12px] font-bold text-slate-900">{is ? "Taktík & skiptingar" : "Tactical & subs"}</div><p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{read.tactical}</p></div>
          ) : null}
          {read.opponent ? (
            <div><div className="text-[12px] font-bold text-slate-900">{is ? "Andstæðingurinn" : "The opponent"}</div><p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{read.opponent}</p></div>
          ) : null}

          {source ? <p className="text-[11px] text-slate-400">{is ? "Heimild" : "Source"}: {source}</p> : null}
        </div>
      )}
    </details>
  );
}
