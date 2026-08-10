"use client";

/**
 * SmartStatsImport — one box that takes ANY StatsBomb or Wyscout export. It detects
 * what the file is, shows a coverage report (which columns will fill / which known
 * columns are missing and what that costs), and for the common per-player SEASON
 * exports imports straight into player_season_stats (with a name-mapping review for
 * anything not an exact match). Other recognized files are named and the coach is
 * pointed at the right dedicated box. Descriptive — never touches the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Detection = { provider: string; kind: string; label: string; autoImport: boolean; target: string; routeHint?: string };
type Coverage = { present: string[]; missing: string[]; lostFeatures: { column: string; note: string }[]; presentCount: number; catalogCount: number };
type Row = { sourcePlayerRef: string; wyscoutPlayerName: string; minutes: number | null; goals: number | null; xg: number | null; suggestedPlayerId: string | null; confidence: "exact" | "fuzzy" | "none" };
type Squad = { id: string; fullName: string };
type Preview = { phase: string; detection: Detection; coverage: Coverage; imported: boolean; rows?: Row[]; squad?: Squad[]; counts?: { exact: number; fuzzy: number; none: number }; note?: string };

export default function SmartStatsImport({ onImported }: { onImported?: () => void }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [file, setFile] = React.useState<File | null>(null);
  const [season, setSeason] = React.useState(String(new Date().getFullYear()));
  const [busy, setBusy] = React.useState<"" | "preview" | "commit">("");
  const [pv, setPv] = React.useState<Preview | null>(null);
  const [decisions, setDecisions] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [showCols, setShowCols] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  async function send(phase: "preview" | "commit") {
    if (!file) return;
    setBusy(phase); setErr(null); setMsg(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData(); fd.set("phase", phase); fd.set("file", file); fd.set("season", season);
      if (phase === "commit") fd.set("decisions", JSON.stringify(decisions));
      const res = await fetch("/api/coach/stats/smart-import", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      if (phase === "commit") {
        setMsg(is ? `${j.rowsUpserted} raðir fluttar inn (${j.mapped} mappaðar, ${j.unmatched} ómappaðar).` : `${j.rowsUpserted} rows imported (${j.mapped} mapped, ${j.unmatched} unmatched).`);
        setPv(null); setDecisions({}); setFile(null); onImported?.();
      } else {
        setPv(j as Preview); setDecisions({});
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(""); }
  }

  const det = pv?.detection;
  const cov = pv?.coverage;
  const canImport = pv?.detection.autoImport && (pv.rows?.length ?? 0) > 0;

  return (
    <div className="rounded-2xl border-2 border-[#2740e6]/30 bg-[#2740e6]/[0.03] p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-[#2740e6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{is ? "Snjall" : "Smart"}</span>
        <div className="text-sm font-semibold text-slate-800">{is ? "Snjall-innflutningur — hvaða StatsBomb/Wyscout skrá sem er" : "Smart Import — any StatsBomb / Wyscout file"}</div>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
        {is
          ? "Slepptu hvaða StatsBomb- eða Wyscout-útflutningi sem er hér. Kerfið þekkir skrána, fyllir þá dálka sem eru í henni, og segir þér hvað vantar."
          : "Drop any StatsBomb or Wyscout export here. The system recognizes the file, fills whatever columns it has, and tells you what's missing."}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Skrá (.csv / .xlsx)" : "File (.csv / .xlsx)"}</div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPv(null); setMsg(null); setErr(null); }} className="text-sm" />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{is ? "Tímabil" : "Season"}</div>
          <input value={season} onChange={(e) => setSeason(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
        </label>
        <button onClick={() => send("preview")} disabled={!file || busy !== ""} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy === "preview" ? (is ? "Greini…" : "Detecting…") : (is ? "Greina skrá" : "Detect file")}
        </button>
        {canImport ? (
          <button onClick={() => send("commit")} disabled={busy !== ""} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "commit" ? "…" : (is ? "Flytja inn" : "Import")}
          </button>
        ) : null}
      </div>

      {err && <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p>}
      {msg && <p className="mt-2 text-[12px] text-emerald-700">{msg}</p>}

      {pv && det && cov ? (
        <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          {/* Detection */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Greint" : "Detected"}</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-semibold text-slate-700">{det.label}</span>
            <span className="text-[11px] text-slate-400">→ {det.target}</span>
          </div>

          {/* Not auto-importable → guidance */}
          {!det.autoImport ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-800">
              {det.kind === "unknown"
                ? (is ? "Þekki ekki þessa skrá sem StatsBomb eða Wyscout útflutning. Athugaðu að þú hafir flutt út CSV/XLSX." : det.routeHint)
                : (is ? `Þessi skrá notar sérstakt innflutningsflæði. ${det.routeHint ?? ""}` : det.routeHint)}
            </div>
          ) : null}

          {/* Coverage */}
          <div>
            <div className="text-[12px] text-slate-700">
              <b>{is ? "Þekja" : "Coverage"}:</b> {is ? `${cov.presentCount} dálkar í skránni þinni` : `${cov.presentCount} columns in your file`}
              {cov.catalogCount > 0 ? (is ? `, ${cov.missing.length} þekktir dálkar vantar` : `, ${cov.missing.length} known columns missing`) : ""}
            </div>
            {cov.lostFeatures.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {cov.lostFeatures.map((f) => (
                  <li key={f.column} className="flex gap-1.5 text-[12px] text-amber-800"><span>⚠</span><span><b>{f.column}</b> — {f.note}</span></li>
                ))}
              </ul>
            ) : cov.catalogCount > 0 && cov.missing.length === 0 ? (
              <p className="mt-1 text-[12px] text-emerald-700">{is ? "✓ Allir lykil-dálkar til staðar." : "✓ All key columns present."}</p>
            ) : null}

            {(cov.present.length > 0 || cov.missing.length > 0) ? (
              <button onClick={() => setShowCols((v) => !v)} className="mt-1.5 text-[12px] font-medium text-[#2740e6] hover:underline">
                {showCols ? (is ? "Fela alla dálka" : "Hide all columns") : (is ? "Sýna alla dálka" : "Show all columns")}
              </button>
            ) : null}
            {showCols ? (
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{is ? `Í skránni (${cov.present.length})` : `In your file (${cov.present.length})`}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cov.present.map((c) => <span key={c} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">{c}</span>)}
                  </div>
                </div>
                {cov.missing.length > 0 ? (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? `Vantar (${cov.missing.length})` : `Missing (${cov.missing.length})`}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {cov.missing.map((c) => <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{c}</span>)}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Per-player mapping preview */}
          {det.autoImport && pv.rows && pv.rows.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">{pv.counts?.exact ?? 0} {is ? "sjálfvirkt" : "auto"}</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">{(pv.counts?.fuzzy ?? 0) + (pv.counts?.none ?? 0)} {is ? "til yfirferðar" : "to review"}</span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-slate-50"><tr className="text-left text-slate-400"><th className="px-2 py-1">{is ? "Leikmaður (skrá)" : "Player (file)"}</th><th className="px-2">Min</th><th className="px-2">xG</th><th className="px-2">{is ? "Mappa á" : "Map to"}</th></tr></thead>
                  <tbody>
                    {pv.rows.map((r) => {
                      const val = Object.prototype.hasOwnProperty.call(decisions, r.sourcePlayerRef) ? decisions[r.sourcePlayerRef] : (r.confidence === "exact" ? (r.suggestedPlayerId ?? "") : "");
                      return (
                        <tr key={r.sourcePlayerRef} className="border-t border-slate-100">
                          <td className="px-2 py-1 text-slate-700">{r.wyscoutPlayerName}{r.confidence !== "exact" ? <span className="ml-1 text-[10px] text-amber-700">{r.confidence === "fuzzy" ? "?" : "—"}</span> : null}</td>
                          <td className="px-2 tabular-nums text-slate-500">{r.minutes ?? "–"}</td>
                          <td className="px-2 tabular-nums text-slate-500">{r.xg == null ? "–" : r.xg.toFixed(2)}</td>
                          <td className="px-2">
                            <select value={val} onChange={(e) => setDecisions((d) => ({ ...d, [r.sourcePlayerRef]: e.target.value }))} className={`rounded border px-1 py-0.5 text-[12px] ${val ? "border-slate-300" : "border-amber-300 bg-amber-50"}`}>
                              <option value="">{is ? "— sleppa —" : "— skip —"}</option>
                              {(pv.squad ?? []).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
