"use client";

/**
 * StatsbombSingleMatchUpload — the SINGLE-MATCH StatsBomb uploads, co-located on Single
 * Match Analysis (upload one game where you read one game). Two uploaders:
 *   - Match Report (whole squad, one match — PDF or CSV) → player_match_stats
 *   - per-player Match Stats CSV (one player, per match)  → player_match_stats
 * The season Squad file lives on Player Season Analysis; the season Team Match Stats file
 * lives on Season Match Analysis. Descriptive football data — never touches the readiness
 * colour or the daily decision. `onImported` lets the page refresh the match list/recap.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

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

export default function StatsbombSingleMatchUpload({ onImported }: { onImported?: () => void }) {
  const [lang] = useLang();
  const is = lang === "IS";

  const [roster, setRoster] = React.useState<Array<{ playerId: string; name: string; isGoalkeeper: boolean }>>([]);
  // per-player Match Stats
  const [pmFile, setPmFile] = React.useState<File | null>(null);
  const [pmPlayerId, setPmPlayerId] = React.useState("");
  const [pmBusy, setPmBusy] = React.useState(false);
  const [pmMsg, setPmMsg] = React.useState<string | null>(null);
  // Team totals summary (one row per team)
  const [tsFile, setTsFile] = React.useState<File | null>(null);
  const [tsDate, setTsDate] = React.useState("");
  const [tsBusy, setTsBusy] = React.useState(false);
  const [tsMsg, setTsMsg] = React.useState<string | null>(null);
  const [tsErr, setTsErr] = React.useState<string | null>(null);
  // Match Report (whole squad, one match)
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

  async function runPlayerMatchImport() {
    if (!pmFile || !pmPlayerId) return;
    setPmBusy(true); setPmMsg(null);
    try {
      const t = await token(); if (!t) { setPmMsg(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", "commit"); fd.set("player_id", pmPlayerId); fd.set("season", YEAR_DEFAULT); fd.set("file", pmFile);
      const res = await fetch("/api/coach/player-stats/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const json = (await res.json()) as { ok: boolean; error?: string; player?: string; rowsUpserted?: number };
      if (!res.ok || !json.ok) { setPmMsg(json.error ?? "Error"); return; }
      setPmMsg(is ? `${json.player}: ${json.rowsUpserted} leikir fluttir inn.` : `${json.player}: ${json.rowsUpserted} matches imported.`);
      onImported?.();
    } catch (e) { setPmMsg(e instanceof Error ? e.message : "Error"); } finally { setPmBusy(false); }
  }

  async function tsSend() {
    if (!tsFile || !tsDate) return;
    setTsBusy(true); setTsErr(null); setTsMsg(null);
    try {
      const t = await token(); if (!t) { setTsErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("file", tsFile); fd.set("date", tsDate);
      const res = await fetch("/api/coach/sb-match-summary/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setTsErr(j.error ?? "Error"); return; }
      setTsMsg(is ? `Liðs-tölur vistaðar: ${j.opponent}${j.score ? ` ${j.score}` : ""} (xG ${j.xg ?? "–"}–${j.xgAgainst ?? "–"}).` : `Team totals saved: ${j.opponent}${j.score ? ` ${j.score}` : ""} (xG ${j.xg ?? "–"}–${j.xgAgainst ?? "–"}).`);
      onImported?.();
    } catch (e) { setTsErr(e instanceof Error ? e.message : "Error"); } finally { setTsBusy(false); }
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
        onImported?.();
      }
    } catch (e) { setMrErr(e instanceof Error ? e.message : "Error"); } finally { setMrBusy(""); }
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        {is ? "Flytja inn leik (StatsBomb)" : "Import a match (StatsBomb)"}
      </summary>

      <div className="mt-3 space-y-4">
        {/* PRIMARY — the one file a coach needs */}
        <div className="rounded-xl border-2 border-[#2740e6]/30 bg-[#2740e6]/[0.03] p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#2740e6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{is ? "Byrjaðu hér" : "Start here"}</span>
            <div className="text-sm font-semibold text-slate-800">{is ? "Settu inn leikskýrsluna — ein skrá" : "Upload your match file — one file"}</div>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
            {is
              ? "Þetta er allt sem þú þarft. Sæktu StatsBomb IQ → Game Team Analysis (eða Match Stats) fyrir leikinn — ein skrá með öllum leikmönnum. Hún fyllir bæði leikmanna-sundurliðunina OG liðs-tölur uppgjörsins (xG, skot, mörk, OBV)."
              : "This is all you need. Download StatsBomb IQ → Game Team Analysis (or Match Stats) for the game — one file with your whole squad. It fills both the per-player breakdown AND the recap's team numbers (xG, shots, goals, OBV)."}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{is ? "CSV er nákvæmast (þarf leikdag); PDF les AI-inn sjálfkrafa." : "CSV is most accurate (needs the match date); a PDF is read automatically by AI."}</p>
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
          {mrMsg && <p className="mt-2 text-[12px] text-emerald-700">{mrMsg}</p>}
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
                  <thead><tr className="text-left text-slate-400"><th className="py-1 pr-2">{is ? "Leikmaður (skrá)" : "Player (file)"}</th><th className="pr-2">Sh</th><th className="pr-2">xG</th><th>{is ? "Mappa á" : "Map to"}</th></tr></thead>
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

        {/* Secondary uploads — collapsed by default so the primary path is unambiguous */}
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">
            {is ? "Fleiri valkostir (valfrjálst)" : "More options (optional)"}
          </summary>
          <p className="mt-1 text-[11px] text-slate-400">{is ? "Þú þarft þessa yfirleitt ekki — skráin að ofan nær öllu. Notaðu þessa aðeins ef þig vantar boltahald/sendingar eða dýpri tölur fyrir einn leikmann." : "You usually don't need these — the file above covers everything. Use these only if you want possession/passing, or deeper numbers for a single player."}</p>
          <div className="mt-3 space-y-4">
        {/* Team totals — one row per team (the recap's team numbers) */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Leikur — liðs-tölur (valfrjálst: boltahald & sendingar)" : "One match — team totals (optional: possession & passing)"}</div>
          <p className="mt-1 text-[11px] text-slate-400">{is ? "Valfrjálst. StatsBomb IQ → Match Stats (liðs-samantekt): EIN röð á lið. „Allt liðið“ skráin að ofan fyllir nú þegar mörk/xG/skot/OBV — þessi bætir aðeins við boltahaldi og sendinganákvæmni (sem per-leikmanns skráin hefur ekki). Þarf leikdag." : "Optional. StatsBomb IQ → Match Stats (team summary): ONE row per team. The “whole squad” file above already fills goals/xG/shots/OBV — this only adds possession and passing % (which the per-player file doesn't carry). Needs the match date."}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá (.csv)" : "File (.csv)"}</div>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setTsFile(e.target.files?.[0] ?? null); setTsMsg(null); setTsErr(null); }} className="text-sm" />
            </label>
            <label className="text-sm">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Leikdagur" : "Match date"}</div>
              <input type="date" value={tsDate} onChange={(e) => setTsDate(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
            </label>
            <button onClick={tsSend} disabled={!tsFile || !tsDate || tsBusy} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{tsBusy ? "…" : (is ? "Flytja inn" : "Import")}</button>
          </div>
          {tsErr && <p className="mt-2 text-[12px] font-medium text-red-700">{tsErr}</p>}
          {tsMsg && <p className="mt-2 text-[12px] text-emerald-700">{tsMsg}</p>}
        </div>

        {/* Per-player Match Stats CSV */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Einn leikmaður (per-leik skrá)" : "One player (per-match file)"}</div>
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
          </div>
        </details>
      </div>
    </details>
  );
}
