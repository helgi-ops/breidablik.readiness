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
  headline?: string; score?: string; competition?: string; summary?: string;
  wentWell?: string[]; toImprove?: string[]; keyPlayers?: Array<{ name: string; note: string }>;
  tactical?: string; opponent?: string;
};

export default function MatchReportPdfReader() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [read, setRead] = React.useState<Read | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  async function run() {
    if (!file) return;
    setBusy(true); setErr(null); setRead(null);
    try {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("file", file); fd.set("lang", is ? "IS" : "EN");
      const res = await fetch("/api/coach/match-report-read", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setRead(j.read as Read); setSource(j.source ?? file.name);
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
          ? "Settu inn heila leikskýrslu (Wyscout / StatsBomb / deildarskýrslu). AI-inn les allt skjalið og gefur þér læsilega samantekt. Lýsandi — skrifar ekkert og snertir ekki readiness."
          : "Upload a full match report (Wyscout / StatsBomb / a league report). The AI reads the whole document and gives you a plain-language briefing. Descriptive — it writes nothing and never touches readiness."}
      </p>

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
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">
            {is ? "AI · lesið úr uppsettu skýrslunni þinni, ákveður ekkert" : "AI · read from your uploaded report, decides nothing"}
          </div>
          {read.headline ? <p className="text-[15px] font-semibold leading-snug text-slate-900">{read.headline}</p> : null}
          {(read.score || read.competition) ? (
            <div className="text-[12px] font-medium text-slate-500">{[read.score, read.competition].filter(Boolean).join(" · ")}</div>
          ) : null}
          {read.summary ? <p className="text-[13px] leading-relaxed text-slate-700">{read.summary}</p> : null}

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
