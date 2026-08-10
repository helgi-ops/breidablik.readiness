"use client";

/**
 * StatsbombPlayerUploads — the SEASON Squad upload, co-located on the StatsBomb side of
 * Player Season Analysis (upload where you read the season percentile view):
 *   - Squad CSV (season per-90) → player_season_stats (statsbomb_csv)
 * Single-match uploads (a whole-squad Match Report, or one player's per-match file) live
 * on Single Match Analysis; the season Team Match Stats file lives on Season Match
 * Analysis. Descriptive football data — nothing here touches the readiness colour.
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

const YEAR_DEFAULT = "2026";

export default function StatsbombPlayerUploads() {
  const [lang] = useLang();
  const is = lang === "IS";

  const [file, setFile] = React.useState<File | null>(null);
  const [season, setSeason] = React.useState(YEAR_DEFAULT);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [decisions, setDecisions] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

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

  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        {is ? "Flytja inn StatsBomb Squad (tímabil)" : "Import StatsBomb Squad (season)"}
      </summary>

      <div className="mt-3 space-y-4">
        {/* Squad season CSV */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "StatsBomb Squad skrá (tímabil, per-90)" : "StatsBomb Squad file (season, per-90)"}</div>
          <p className="mt-1 text-[11px] text-slate-400">{is ? "StatsBomb IQ → liðið þitt → Squad → Export CSV (ein röð per leikmann). Þetta knýr percentíl-lesturinn hér að ofan. Fyrir einn leik notaðu Single Match Analysis." : "StatsBomb IQ → your team → Squad → Export CSV (one row per player). This powers the percentile read above. For a single match use Single Match Analysis."}</p>
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
      </div>
    </details>
  );
}
