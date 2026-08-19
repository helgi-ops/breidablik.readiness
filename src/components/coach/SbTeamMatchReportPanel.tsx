"use client";

/**
 * "Team match stats" — a readable, briefing-style report of the StatsBomb team-aggregated numbers
 * for one game, on the Single Match Analysis page. Layered read: a one-line verdict (glance) → 2–3
 * plain facts → thematic stat groups (Attack · Build-up & passing · Pressing & defence · On-ball
 * value), each metric shown vs the opponent (where paired) and vs the team's own season average,
 * with jargon behind tooltips. Reads /api/coach/sb-team-match-report. Descriptive football context
 * — never touches readiness. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { fmtVal, type SbTeamMatchReport, type ReportMetric } from "@/lib/micropulse/matchReport/sbTeamMatchReport";

type Resp = { ok: boolean; hasData?: boolean; report?: SbTeamMatchReport; teamName?: string | null };

/** vs-season delta chip: +/−% coloured by whether higher is good for this metric. */
function DeltaChip({ m, is }: { m: ReportMetric; is: boolean }) {
  if (m.own == null || m.seasonAvg == null || m.seasonAvg === 0 || m.format === "pct") return null;
  const rel = (m.own - m.seasonAvg) / Math.abs(m.seasonAvg);
  if (Math.abs(rel) < 0.08) return <span className="text-[10px] text-slate-400">{is ? "≈ venja" : "≈ usual"}</span>;
  const good = (rel > 0) === m.higherIsBetter;
  const pct = Math.round(rel * 100);
  return (
    <span className={`text-[10px] font-semibold ${good ? "text-emerald-600" : "text-amber-700"}`} title={is ? `Tímabils-meðaltal ~${fmtVal(m.seasonAvg, m.format)}` : `Season average ~${fmtVal(m.seasonAvg, m.format)}`}>
      {rel > 0 ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

/** One metric row — label (+tooltip), own value, opponent (paired) with a two-sided bar, delta. */
function MetricRow({ m, is }: { m: ReportMetric; is: boolean }) {
  const has = m.own != null;
  const paired = m.opp != null;
  const total = paired ? (m.own ?? 0) + (m.opp ?? 0) : 0;
  const ownPct = paired && total > 0 ? Math.round(((m.own ?? 0) / total) * 100) : null;
  return (
    <div className={`flex items-center gap-3 border-b border-slate-100 py-1 ${has ? "" : "opacity-45"}`}>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate text-[12.5px] text-slate-700">{is ? m.label.is : m.label.en}</span>
        {m.estimated && m.own != null ? <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-700" title={is ? "Áætlun — ekki bein StatsBomb-tala" : "Estimate — not a StatsBomb-reported figure"}>{is ? "~áætl" : "~est"}</span> : null}
        {m.tip ? <span className="cursor-help text-slate-300" title={is ? m.tip.is : m.tip.en}>ⓘ</span> : null}
      </div>
      {paired ? (
        <div className="flex items-center gap-2">
          <span className="w-9 text-right text-[13px] font-bold tabular-nums text-slate-900">{fmtVal(m.own, m.format)}</span>
          <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 sm:block" title={is ? "þú vs andstæðingur" : "you vs opponent"}>
            <div className="h-full rounded-full bg-[#2740e6]" style={{ width: `${ownPct ?? 50}%` }} />
          </div>
          <span className="w-9 text-[12px] tabular-nums text-slate-400">{fmtVal(m.opp, m.format)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="w-9 text-right text-[13px] font-bold tabular-nums text-slate-900">{fmtVal(m.own, m.format)}</span>
          <span className="w-[104px]"><DeltaChip m={m} is={is} /></span>
        </div>
      )}
    </div>
  );
}

export default function SbTeamMatchReportPanel({ date }: { date?: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [report, setReport] = React.useState<SbTeamMatchReport | null>(null);
  const [teamName, setTeamName] = React.useState<string>("");
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [narrative, setNarrative] = React.useState<string | null>(null);
  const [narrBusy, setNarrBusy] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "loading" | "empty" | "ready">("idle");
  const [showEmpty, setShowEmpty] = React.useState(false);
  // Layered read: the raw stat grid is layer 2 — collapsed by default so the verdict + facts +
  // AI explanation lead, and the long table no longer dominates the page.
  const [showStats, setShowStats] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [upFile, setUpFile] = React.useState<File | null>(null);
  const [upBusy, setUpBusy] = React.useState(false);
  const [upMsg, setUpMsg] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  React.useEffect(() => {
    if (!date) { setState("idle"); setReport(null); return; }
    let alive = true;
    (async () => {
      setState("loading"); setNarrative(null);
      try {
        const tok = await token(); if (!tok) return;
        const r = (await fetch(`/api/coach/sb-team-match-report?date=${date}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" }).then((x) => x.json()).catch(() => null)) as Resp | null;
        if (!alive) return;
        if (r && r.ok && r.hasData && r.report) { setReport(r.report); setTeamName(r.teamName ?? ""); setState("ready"); }
        else { setReport(null); setState("empty"); }
      } catch { if (alive) setState("empty"); }
    })();
    return () => { alive = false; };
  }, [date, token, refreshKey]);

  async function uploadTeamFile() {
    if (!upFile) return;
    setUpBusy(true); setUpMsg(null);
    try {
      const tok = await token(); if (!tok) { setUpMsg(is ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const fd = new FormData(); fd.append("file", upFile);
      const res = await fetch(`/api/coach/sb-team-stats-file/upload`, { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setUpMsg(j.error ?? "Error"); return; }
      setUpMsg(is ? `${j.ingested} leikur/leikir vistaðir${j.skippedCount ? ` · ${j.skippedCount} sleppt` : ""}.` : `${j.ingested} match(es) saved${j.skippedCount ? ` · ${j.skippedCount} skipped` : ""}.`);
      setUpFile(null); setRefreshKey((k) => k + 1);
    } finally { setUpBusy(false); }
  }

  async function generateNarrative() {
    if (!report) return;
    setNarrBusy(true);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/sb-team-match-report/narrative`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ report, teamName, lang: is ? "IS" : "EN" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok && j.narrative) setNarrative(j.narrative);
    } finally { setNarrBusy(false); }
  }

  async function downloadPdf() {
    if (!report) return;
    setPdfBusy(true);
    try {
      const { downloadSbTeamMatchReportPdf } = await import("@/components/coach/SbTeamMatchReportPdf");
      await downloadSbTeamMatchReportPdf(report, teamName || (is ? "Okkar lið" : "Our team"), is ? "IS" : "EN", narrative);
    } finally { setPdfBusy(false); }
  }

  if (state === "idle") return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Liðs-tölfræði — ítarleg & sértæk (StatsBomb)" : "Team match stats — detailed & specific (StatsBomb)"}</span>
        <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]"
          title={is ? "Nákvæmu StatsBomb liðs-samtölur fyrir leikinn — lagskipt lesning. Reglur reikna réttu tölurnar (ekki AI-ágiskun). Lýsandi — snertir aldrei readiness." : "The exact StatsBomb team-aggregated numbers for the game — a layered read. Rules compute the real figures (not an AI guess). Descriptive — never touches readiness."}>
          {is ? "nákvæmar tölur ⓘ" : "exact numbers ⓘ"}
        </span>
        {state === "ready" && report ? (
          <button onClick={() => void downloadPdf()} disabled={pdfBusy} className="ml-auto rounded-lg border border-[#2740e6] px-3 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-50">
            {pdfBusy ? "…" : (is ? "Sækja PDF" : "Download PDF")}
          </button>
        ) : null}
      </div>

      {/* One-line "what this is" — sets it apart from the AI PDF briefing above: exact numbers, not narrative. */}
      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
        {is
          ? "Nákvæmu liðstölurnar fyrir þennan leik — xG, skot, PPDA, possession, directness o.fl. — sem læsileg skýrsla. Þetta eru réttu tölurnar (reglur reikna), ekki AI-frásögnin úr „Lesa leikskýrslu fyrir mig“ að ofan. Hladdu upp StatsBomb liðs-„Match Stats“ CSV."
          : "The exact team numbers for this game — xG, shots, PPDA, possession, directness and more — as a readable report. These are the real figures (rules compute them), not the AI narrative from “Read a match report for me” above. Upload the StatsBomb team “Match Stats” CSV."}
      </p>

      {/* Upload the StatsBomb team-level "Match Stats" export (whole season or a single game) — the
          authoritative source for the team-only metrics (long balls, aggressive actions, clear/
          counter shots, dribble %). Deterministic parse, not AI. */}
      <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">{is ? "Hlaða inn StatsBomb liðs-skrá (.csv)" : "Upload StatsBomb team file (.csv)"}</span>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setUpFile(e.target.files?.[0] ?? null); setUpMsg(null); }} className="text-[12px]" />
          <button onClick={() => void uploadTeamFile()} disabled={upBusy || !upFile} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">{upBusy ? "…" : (is ? "Hlaða" : "Upload")}</button>
          {upMsg ? <span className="text-[11px] font-medium text-slate-700">{upMsg}</span> : null}
        </div>
        <p className="mt-1 text-[10px] text-slate-400">{is ? "Season eða stakur leikur — sama snið. Fyllir PPDA-laus liðs-metrics fyrir alla leiki í skránni." : "Whole season or a single game — same format. Fills the team-only metrics for every match in the file."}</p>
      </div>

      {state === "loading" ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}

      {state === "empty" ? (
        <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-500">
          {is
            ? "Engar StatsBomb liðs-tölur fyrir þennan leik enn. Hladdu StatsBomb „Match Stats\" skránni inn (kassinn „One match — whole squad\" að ofan) — hún fyllir bæði leikmenn og þessar liðs-tölur."
            : "No StatsBomb team numbers for this match yet. Upload the StatsBomb “Match Stats” file (the “One match — whole squad” box above) — it fills both the players and these team numbers."}
        </p>
      ) : null}

      {state === "ready" && report ? (
        <div className="mt-3 space-y-4">
          {/* Glance: score line + one-sentence verdict */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-slate-500">
              <span className="font-semibold text-slate-700">{report.opponent ?? (is ? "Leikur" : "Match")}</span>
              <span>{report.matchDate}</span>
              {report.isHome != null ? <span>· {report.isHome ? (is ? "heima" : "home") : (is ? "úti" : "away")}</span> : null}
              {report.goals != null && report.goalsAgainst != null ? <span className="font-bold text-slate-800">· {report.goals}–{report.goalsAgainst}</span> : null}
            </div>
            <p className="mt-1 text-[14px] font-semibold leading-snug text-slate-900">{is ? report.headline.is : report.headline.en}</p>
            {report.facts.length ? (
              <ul className="mt-1.5 space-y-0.5">
                {report.facts.map((f, i) => (
                  <li key={i} className="text-[12.5px] leading-snug text-slate-600">• {is ? f.is : f.en}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* AI explanation — phrases the numbers above; labelled AI, cites the data, decides nothing. */}
          <div className="rounded-xl border border-slate-100 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-slate-600">{is ? "AI-útskýring" : "AI explanation"}</span>
              {!narrative ? (
                <button onClick={() => void generateNarrative()} disabled={narrBusy} className="rounded-lg border border-[#2740e6] px-2.5 py-1 text-[11px] font-semibold text-[#2740e6] disabled:opacity-50">
                  {narrBusy ? (is ? "Skrifa…" : "Writing…") : (is ? "Búa til AI-útskýringu" : "Generate AI explanation")}
                </button>
              ) : (
                <span className="text-[10px] font-medium text-slate-400">{is ? "AI · Claude Haiku · orðar tölurnar, ákveður ekkert" : "AI · Claude Haiku · phrases the numbers, decides nothing"}</span>
              )}
            </div>
            {narrative ? <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-slate-700">{narrative}</p> : (
              <p className="mt-1 text-[11px] text-slate-400">{is ? "Reglur reikna tölurnar að neðan. AI orðar þær — búðu til textann þegar þú vilt hann (og hann fylgir með í PDF)." : "Rules compute the figures below. The AI phrases them — generate it when you want the prose (it then rides along in the PDF)."}</p>
            )}
          </div>

          {/* Layer 2 — the full stat grid, collapsed by default (the verdict + facts + AI lead). */}
          <button type="button" onClick={() => setShowStats((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[12.5px] font-semibold text-slate-700 hover:bg-slate-100">
            <span className={`transition-transform ${showStats ? "rotate-90" : ""}`}>▸</span>
            {showStats
              ? (is ? "Fela allar tölur" : "Hide all stats")
              : (is ? `Sýna allar ${report.coverage.present} tölur (xG, skot, PPDA, OBV o.fl.)` : `Show all ${report.coverage.present} stats (xG, shots, PPDA, OBV & more)`)}
          </button>

          {showStats ? (
            <div className="space-y-4">
              {/* Column legend for the paired sections */}
              <div className="flex items-center justify-end gap-2 pr-1 text-[10px] uppercase tracking-wide text-slate-400">
                <span>{is ? "þú" : "you"}</span><span className="hidden sm:inline">·</span><span className="hidden sm:inline">{is ? "vs andstæðingur / venja" : "vs opp / usual"}</span>
              </div>

              {/* Thematic stat groups — packed into a 2-column grid so the table stays short. */}
              {report.sections.map((s) => {
                const anyData = s.metrics.some((m) => m.own != null);
                const rows = s.metrics.filter((m) => m.own != null || showEmpty);
                return (
                  <div key={s.group}>
                    <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-[#2740e6]">{is ? s.title.is : s.title.en}</div>
                    <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                      {rows.map((m) => <MetricRow key={m.key} m={m} is={is} />)}
                    </div>
                    {!anyData ? <p className="py-1 text-[11px] text-slate-400">{is ? "engin gögn í þessari skrá" : "no data in this file"}</p> : null}
                  </div>
                );
              })}

              {/* Toggle the not-yet-available metrics (they need the team-level file) */}
              {report.coverage.present < report.coverage.total ? (
                <button type="button" onClick={() => setShowEmpty((v) => !v)} className="text-[11px] font-semibold text-[#2740e6] hover:underline">
                  {showEmpty
                    ? (is ? "Fela tölur sem vantar" : "Hide unavailable metrics")
                    : (is ? `Sýna ${report.coverage.total - report.coverage.present} tölur sem vantar (þurfa StatsBomb liðs-skrá)` : `Show ${report.coverage.total - report.coverage.present} unavailable metrics (need the StatsBomb team file)`)}
                </button>
              ) : null}

              <p className="text-[11px] text-slate-400">
                {is
                  ? "StatsBomb liðs-samtölur (OBV = On-Ball Value). Reglur reikna — ekki AI. Lýsandi — snertir aldrei readiness."
                  : "StatsBomb team-aggregated numbers (OBV = On-Ball Value). Rules compute — not AI. Descriptive — never touches readiness."}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
