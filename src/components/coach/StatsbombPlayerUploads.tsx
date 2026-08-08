"use client";

/**
 * StatsbombPlayerUploads — all StatsBomb player uploads, co-located on the StatsBomb
 * side of the merged Player Season Analysis page (upload where you read). Three self-contained
 * uploaders, all hitting the existing content-auto-detecting endpoints:
 *   - Squad CSV (season per-90)      → player_season_stats (statsbomb_csv)
 *   - per-player Match Stats CSV      → player_match_stats
 *   - Match Report (whole squad, PDF/CSV) → player_match_stats
 * Descriptive football data — nothing here touches the readiness colour or the daily decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Candidate = { playerId: string; fullName: string; score: number };
type PreviewRow = {
  sourcePlayerRef: string; wyscoutPlayerName: string;
  minutes: number | null; goals: number | null; assists: number | null; xg: number | null;
  suggestedPlayerId: string | null; confidence: "exact" | "fuzzy" | "none"; remembered: boolean; candidates: Candidate[];
};
type Squad = { id: string; fullName: string };
type Preview = { ok: boolean; rows: PreviewRow[]; squad: Squad[]; season: string; sourceRef: string; counts?: { exact: number; fuzzy: number; none: number }; error?: string };

type MatchReportRow = {
  sourcePlayerRef: string; name: string; shots: number | null; xg: number | null; keyPasses: number | null;
  suggestedPlayerId: string | null; suggestedPlayerName: string | null; confidence: "exact" | "fuzzy" | "none";
};
type MatchReportPreview = {
  opponent: string; homeAway: "home" | "away"; date: string; home: string; away: string;
  reconciliation: Array<{ metric: string; teamTotal: number | null; playerSum: number; withinTolerance: boolean }>;
  counts: { exact: number; fuzzy: number; none: number }; squad: Array<{ id: string; name: string }>; rows: MatchReportRow[]; skippedOpponent: number; source?: "pdf" | "csv";
};

const YEAR_DEFAULT = "2026";

export default function StatsbombPlayerUploads() {
  const [lang] = useLang();
  const is = lang === "IS";

  // Squad season upload
  const [file, setFile] = React.useState<File | null>(null);
  const [season, setSeason] = React.useState(YEAR_DEFAULT);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [decisions, setDecisions] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  // per-player Match Stats
  const [roster, setRoster] = React.useState<Array<{ playerId: string; name: string; isGoalkeeper: boolean }>>([]);
  const [pmFile, setPmFile] = React.useState<File | null>(null);
  const [pmPlayerId, setPmPlayerId] = React.useState("");
  const [pmBusy, setPmBusy] = React.useState(false);
  const [pmMsg, setPmMsg] = React.useState<string | null>(null);
  // Match Report
  const [mrFile, setMrFile] = React.useState<File | null>(null);
  const [mrDate, setMrDate] = React.useState("");
  const [mrBusy, setMrBusy] = React.useState<"" | "preview" | "commit">("");
  const [mrPreview, setMrPreview] = React.useState<MatchReportPreview | null>(null);
  const [mrDecisions, setMrDecisions] = React.useState<Record<string, string>>({});
  const [mrMsg, setMrMsg] = React.useState<string | null>(null);
  const [mrErr, setMrErr] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  React.useEffect(() => {
    (async () => {
      const t = await token(); if (!t) return;
      const rr = await fetch("/api/coach/player-stats/roster", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      if (rr.ok) { const rj = await rr.json(); setRoster(Array.isArray(rj.players) ? rj.players : []); }
    })();
  }, [token]);

  async function runPreview() {
    if (!file) return;
    setBusy(true); setErr(null); setResult(null); setPreview(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", "preview"); fd.set("season", season); fd.set("file", file);
      const res = await fetch("/api/coach/player-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const json = (await res.json()) as Preview;
      if (!res.ok || !json.ok) { setErr(json.error ?? "Error"); return; }
      setPreview(json);
      const seed: Record<string, string> = {};
      for (const r of json.rows) seed[r.sourcePlayerRef] = r.confidence === "none" ? "" : (r.suggestedPlayerId ?? "");
      setDecisions(seed);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  async function runCommit() {
    if (!file || !preview) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", "commit"); fd.set("season", season); fd.set("file", file); fd.set("decisions", JSON.stringify(decisions));
      const res = await fetch("/api/coach/player-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Error"); return; }
      setResult(is ? `Vistað: ${json.rowsUpserted} raðir (${json.mapped} mappaðar).` : `Saved: ${json.rowsUpserted} rows (${json.mapped} mapped).`);
      setPreview(null); setDecisions({}); setFile(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  async function runPlayerMatchImport() {
    if (!pmFile || !pmPlayerId) return;
    setPmBusy(true); setPmMsg(null);
    try {
      const t = await token(); if (!t) { setPmMsg(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", "commit"); fd.set("player_id", pmPlayerId); fd.set("season", season); fd.set("file", pmFile);
      const res = await fetch("/api/coach/player-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const json = (await res.json()) as { ok: boolean; error?: string; player?: string; rowsUpserted?: number };
      if (!res.ok || !json.ok) { setPmMsg(json.error ?? "Error"); return; }
      setPmMsg(is ? `${json.player}: ${json.rowsUpserted} leikir fluttir inn.` : `${json.player}: ${json.rowsUpserted} matches imported.`);
    } catch (e) { setPmMsg(e instanceof Error ? e.message : "Error"); } finally { setPmBusy(false); }
  }

  async function mrSend(phase: "preview" | "commit") {
    if (!mrFile) return;
    setMrBusy(phase); setMrErr(null); setMrMsg(null);
    try {
      const t = await token(); if (!t) { setMrErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", phase); fd.set("file", mrFile);
      if (mrDate) fd.set("date", mrDate);
      if (phase === "commit") fd.set("decisions", JSON.stringify(mrDecisions));
      const res = await fetch("/api/coach/match-report/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setMrErr(j.error ?? "Error"); return; }
      if (phase === "preview") { setMrPreview(j); setMrDecisions({}); }
      else {
        setMrPreview(null); setMrDecisions({});
        setMrMsg(is ? `${j.rowsUpserted} leikmenn fluttir inn (${j.mapped} mappaðir, ${j.unmatched} ómappaðir).` : `${j.rowsUpserted} players imported (${j.mapped} mapped, ${j.unmatched} unmatched).`);
      }
    } catch (e) { setMrErr(e instanceof Error ? e.message : "Error"); } finally { setMrBusy(""); }
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        {is ? "Flytja inn StatsBomb-gögn leikmanna" : "Import StatsBomb player data"}
      </summary>

      <div className="mt-3 space-y-4">
        {/* Squad season CSV */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "StatsBomb Squad skrá (tímabil, per-90)" : "StatsBomb Squad file (season, per-90)"}</div>
          <p className="mt-1 text-[11px] text-slate-400">{is ? "StatsBomb IQ → liðið þitt → Squad → Export CSV (ein röð per leikmann). Þetta knýr percentíl-lesturinn hér að ofan." : "StatsBomb IQ → your team → Squad → Export CSV (one row per player). This powers the percentile read above."}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá (.csv / .xlsx)" : "File (.csv / .xlsx)"}</div>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); }} className="text-sm" />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Tímabil" : "Season"}</div>
              <input value={season} onChange={(e) => setSeason(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
            </label>
            <button onClick={runPreview} disabled={!file || busy} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy && !preview ? "…" : (is ? "Forskoða" : "Preview")}</button>
            <button onClick={runCommit} disabled={!preview || busy} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy && preview ? "…" : (is ? "Staðfesta & flytja inn" : "Confirm & import")}</button>
          </div>
          {err && <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p>}
          {result && <p className="mt-2 text-[12px] text-emerald-700">{result}</p>}
          {preview && (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="text-[12px] text-slate-600">
                {is ? "Úr" : "From"} <b>{preview.sourceRef}</b> · {(preview.counts?.exact ?? 0)} {is ? "sjálfvirkt" : "auto"} · {(preview.counts?.fuzzy ?? 0) + (preview.counts?.none ?? 0)} {is ? "til yfirferðar" : "to review"}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead><tr className="text-left text-slate-400"><th className="py-1 pr-2">{is ? "Leikmaður (StatsBomb)" : "Player (StatsBomb)"}</th><th className="pr-2">{is ? "Mín" : "Min"}</th><th>{is ? "Mappa á" : "Map to"}</th></tr></thead>
                  <tbody>
                    {preview.rows.map((r) => {
                      const val = decisions[r.sourcePlayerRef] ?? "";
                      return (
                        <tr key={r.sourcePlayerRef} className="border-t border-slate-200">
                          <td className="py-1 pr-2 text-slate-700">{r.wyscoutPlayerName}{r.confidence !== "exact" ? <span className="ml-1 text-[10px] text-amber-700">{r.confidence === "fuzzy" ? "?" : "—"}</span> : null}</td>
                          <td className="pr-2 tabular-nums text-slate-500">{r.minutes ?? "–"}</td>
                          <td>
                            <select value={val} onChange={(e) => setDecisions((d) => ({ ...d, [r.sourcePlayerRef]: e.target.value }))} className={`rounded border px-1 py-0.5 text-[12px] ${val ? "border-slate-300" : "border-amber-300 bg-amber-50"}`}>
                              <option value="">{is ? "— skilja eftir ómappað —" : "— leave unmatched —"}</option>
                              {preview.squad.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Per-player Match Stats CSV */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "StatsBomb — leikmanns-leikjaskrá (per leik)" : "StatsBomb — player match file (per match)"}</div>
          <p className="mt-1 text-[11px] text-slate-400">{is ? "Ein skrá per leikmann (ein röð per leik). Veldu leikmanninn og skrána — dýpri per-leik tölur (OBV, pressa)." : "One file per player (one row per match). Pick the player and the file — deeper per-match numbers (OBV, pressing)."}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Leikmaður" : "Player"}</div>
              <select value={pmPlayerId} onChange={(e) => setPmPlayerId(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm">
                <option value="">{is ? "Veldu…" : "Choose…"}</option>
                {roster.map((p) => <option key={p.playerId} value={p.playerId}>{p.name}{p.isGoalkeeper ? (is ? " (MV)" : " (GK)") : ""}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "StatsBomb skrá (.csv)" : "StatsBomb file (.csv)"}</div>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setPmFile(e.target.files?.[0] ?? null)} className="text-sm" />
            </label>
            <button onClick={runPlayerMatchImport} disabled={!pmFile || !pmPlayerId || pmBusy} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{pmBusy ? "…" : (is ? "Flytja inn" : "Import")}</button>
          </div>
          {roster.length === 0 ? <p className="mt-2 text-[11px] text-amber-700">{is ? "Enginn virkur leikmaður í hópnum enn." : "No active squad players yet."}</p> : null}
          {pmMsg && <p className="mt-2 text-[12px] text-slate-600">{pmMsg}</p>}
        </div>

        {/* Match Report — whole squad, one match */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "StatsBomb — leikur, allt liðið (PDF eða CSV)" : "StatsBomb — one match, whole squad (PDF or CSV)"}</div>
          <p className="mt-1 text-[11px] text-slate-400">{is ? "StatsBomb IQ → Game Team Analysis. Nær öllum þínum leikmönnum úr einum leik. CSV er nákvæmast; PDF les AI-inn. CSV þarf leikdagsetningu." : "StatsBomb IQ → Game Team Analysis. Pulls your whole squad from one match. The CSV is most accurate; the PDF is AI-read. A CSV needs the match date."}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá (.pdf / .csv)" : "File (.pdf / .csv)"}</div>
              <input type="file" accept=".pdf,.csv,.xlsx,.xls" onChange={(e) => { setMrFile(e.target.files?.[0] ?? null); setMrPreview(null); setMrMsg(null); }} className="text-sm" />
            </label>
            {mrFile && !mrFile.name.toLowerCase().endsWith(".pdf") ? (
              <label className="text-sm">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Leikdagur" : "Match date"}</div>
                <input type="date" value={mrDate} onChange={(e) => { setMrDate(e.target.value); setMrPreview(null); }} className="rounded border border-slate-300 px-2 py-1 text-sm" />
              </label>
            ) : null}
            <button onClick={() => mrSend("preview")} disabled={!mrFile || mrBusy !== "" || (!mrFile.name.toLowerCase().endsWith(".pdf") && !mrDate)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{mrBusy === "preview" ? (mrFile?.name.toLowerCase().endsWith(".pdf") ? (is ? "Les… (AI)" : "Reading… (AI)") : "…") : (is ? "Forskoða" : "Preview")}</button>
            <button onClick={() => mrSend("commit")} disabled={!mrPreview || mrBusy !== ""} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{mrBusy === "commit" ? "…" : (is ? "Flytja inn" : "Import")}</button>
          </div>
          {mrErr && <p className="mt-2 text-[12px] font-medium text-red-700">{mrErr}</p>}
          {mrMsg && <p className="mt-2 text-[12px] text-slate-600">{mrMsg}</p>}
          {mrPreview && (
            <div className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="text-[12px] text-slate-700">
                <b>{mrPreview.home} v {mrPreview.away}</b> · {mrPreview.date} · {is ? "þú" : "you"}: {mrPreview.homeAway === "home" ? (is ? "heima" : "home") : (is ? "úti" : "away")} · {mrPreview.rows.length} {is ? "leikmenn" : "players"}{mrPreview.skippedOpponent ? ` · ${mrPreview.skippedOpponent} ${is ? "andstæðingar sleppt" : "opponent skipped"}` : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {mrPreview.source === "csv" ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">✓ {is ? "CSV · nákvæmir dálkar" : "CSV · exact columns"}</span>
                ) : mrPreview.reconciliation.map((c) => (
                  <span key={c.metric} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${c.withinTolerance ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{c.withinTolerance ? "✓" : "⚠"} {c.metric}: {c.playerSum}{c.teamTotal != null ? ` / ${c.teamTotal}` : ""}</span>
                ))}
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">{mrPreview.counts.exact} {is ? "sjálfvirkt" : "auto"} · {mrPreview.counts.fuzzy + mrPreview.counts.none} {is ? "til yfirferðar" : "to review"}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead><tr className="text-left text-slate-400"><th className="py-1 pr-2">{is ? "Leikmaður (PDF)" : "Player (PDF)"}</th><th className="pr-2">Sh</th><th className="pr-2">xG</th><th>{is ? "Mappa á" : "Map to"}</th></tr></thead>
                  <tbody>
                    {mrPreview.rows.map((r) => {
                      const val = Object.prototype.hasOwnProperty.call(mrDecisions, r.sourcePlayerRef) ? mrDecisions[r.sourcePlayerRef] : (r.confidence === "exact" ? (r.suggestedPlayerId ?? "") : "");
                      return (
                        <tr key={r.sourcePlayerRef} className="border-t border-slate-200">
                          <td className="py-1 pr-2 text-slate-700">{r.name}{r.confidence !== "exact" ? <span className="ml-1 text-[10px] text-amber-700">{r.confidence === "fuzzy" ? "?" : "—"}</span> : null}</td>
                          <td className="pr-2 tabular-nums text-slate-500">{r.shots ?? "–"}</td>
                          <td className="pr-2 tabular-nums text-slate-500">{r.xg == null ? "–" : r.xg.toFixed(2)}</td>
                          <td>
                            <select value={val} onChange={(e) => setMrDecisions((d) => ({ ...d, [r.sourcePlayerRef]: e.target.value }))} className={`rounded border px-1 py-0.5 text-[12px] ${val ? "border-slate-300" : "border-amber-300 bg-amber-50"}`}>
                              <option value="">{is ? "— sleppa —" : "— skip —"}</option>
                              {mrPreview.squad.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
