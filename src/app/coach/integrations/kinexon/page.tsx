"use client";

/**
 * Kinexon Perform (IMU / local-positioning) manual upload.
 *
 * Drag-drop the Kinexon export (semicolon CSV or XLSX). We parse it in-browser
 * with parseKinexonExport (the same header detection the server ingest uses),
 * preview the mapping + sample, then POST the rows to
 * /api/integrations/kinexon/upload → player_external_load_daily (source='kinexon').
 * Kinexon fills the Titan gaps: per-session Duration + Changes of Direction.
 * Descriptive — never the readiness colour.
 *
 * Path A (REST API auto-pull) is a documented follow-up once the Kinexon demo
 * account's API endpoints/auth are confirmed.
 */

import React, { useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { splitKinexonCsv, parseKinexonExport, kinexonExportWarnings, type KinexonRow } from "@/lib/integrations/kinexon";

type ParseSummary = {
  fileName: string;
  headers: string[];
  rows: KinexonRow[];
  players: string[];
  dates: string[];
  withCod: number;
  withDuration: number;
  noDate: number;
  warnings: string[];
};
type SaveResult = {
  sessionsStored: number;
  athletesMatched: number;
  athletesUnmatched: string[];
  skipped: number;
  earliestDate: string | null;
  latestDate: string | null;
};

const KEY_COLUMNS = ["Player", "Date", "Duration", "Distance (m)", "Accumulated Acceleration Load", "Changes of Direction", "Metabolic Power"];

async function authToken(): Promise<string | null> {
  return (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
}

export default function Page() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [indoor, setIndoor] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStatus("parsing"); setError(null); setSummary(null); setSaveResult(null); setSaveError(null);
    try {
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      let csvText: string;
      if (ext === "csv" || ext === "txt") csvText = await file.text();
      else if (ext === "xlsx" || ext === "xls") csvText = await xlsxToCsv(file);
      else throw new Error("Óstudd skráargerð. Notaðu Kinexon CSV (.csv) eða Excel (.xlsx).");

      const { headers, rows: rawRows } = splitKinexonCsv(csvText);
      const rows = parseKinexonExport(headers, rawRows);
      if (rows.length === 0) throw new Error("Engar leikmanna-raðir fundust (er Kinexon exportið rétt og ekki tómt?).");

      const players = Array.from(new Set(rows.map((r) => r.playerName))).sort();
      const dates = Array.from(new Set(rows.map((r) => r.date).filter((d): d is string => !!d))).sort();
      setSummary({
        fileName: file.name, headers, rows, players, dates,
        warnings: kinexonExportWarnings(headers),
        withCod: rows.filter((r) => r.codEvents != null).length,
        withDuration: rows.filter((r) => r.durationMin != null).length,
        noDate: rows.filter((r) => !r.date).length,
      });
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Óþekkt villa við lestur skráar.");
      setStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }
  function onDrop(e: React.DragEvent) { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }
  function reset() { setStatus("idle"); setSummary(null); setError(null); setSaveResult(null); setSaveError(null); }

  async function handleSave() {
    if (!summary || summary.rows.length === 0) return;
    setSaving(true); setSaveError(null); setSaveResult(null);
    try {
      const token = await authToken();
      if (!token) throw new Error("Ekki innskráð(ur).");
      const res = await fetch("/api/integrations/kinexon/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ rows: summary.rows, indoor, warnings: summary.warnings }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Vistun mistókst.");
      setSaveResult(json.result as SaveResult);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Vistun mistókst.");
    } finally { setSaving(false); }
  }

  const foundHeaders = React.useMemo(() => {
    if (!summary) return new Set<string>();
    const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const present = summary.headers.map(norm);
    return new Set(KEY_COLUMNS.filter((h) => present.some((p) => p.includes(norm(h)))));
  }, [summary]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Kinexon upphleðsla</h1>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">beta</span>
        </div>
        <p className="text-sm text-slate-500">
          Kinexon Perform (IMU / staðsetning): Player Load, hröðun/hemlun, <strong>stefnubreytingar (CoD)</strong> og
          <strong> lengd æfingar</strong> — tvennt sem Titan vantar. Gögnin lenda í sömu álagsgreiningu og Catapult/Titan
          (ACWR á Player Load). Dragðu Kinexon exportið (semíkommu-CSV eða Excel) hingað.
        </p>
      </header>

      {status !== "ready" && (
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center transition hover:border-slate-400 hover:bg-slate-100"
        >
          <div className="text-3xl">📎</div>
          <p className="mt-2 text-sm font-medium text-slate-700">Smelltu eða dragðu Kinexon export hingað</p>
          <p className="mt-1 text-[11px] text-slate-500">CSV (.csv, semíkommu-aðskilið) eða Excel (.xlsx)</p>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={onInputChange} />
          {status === "parsing" && <p className="mt-3 text-xs text-slate-500">Les skrá…</p>}
        </div>
      )}

      {status === "error" && error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          ⚠️ {error}
          <button onClick={reset} className="ml-3 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold hover:bg-red-200">Reyna aftur</button>
        </div>
      )}

      {status === "ready" && summary && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">📄 {summary.fileName}</h2>
                <p className="text-xs text-slate-500">
                  Raðir: <strong>{summary.rows.length}</strong> · með CoD: <strong>{summary.withCod}</strong> · með lengd: <strong>{summary.withDuration}</strong>
                  {summary.noDate > 0 && <> · <span className="text-amber-700">{summary.noDate} án dagsetningar (sleppt)</span></>}
                </p>
              </div>
              <button onClick={reset} className="rounded border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50">Hlaða annarri skrá</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <Metric label="Leikmenn" value={summary.players.length} />
              <Metric label="Dagar" value={summary.dates.length} />
              <Metric label="Tímabil" value={summary.dates.length ? (summary.dates[0] === summary.dates[summary.dates.length - 1] ? summary.dates[0] : `${summary.dates[0]} → ${summary.dates[summary.dates.length - 1]}`) : "—"} />
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={indoor} onChange={(e) => setIndoor(e.target.checked)} />
              Innidyra (LPS) — GPS-hraðasvið eiga ekki við. Taktu hakið af fyrir útivistar-GPS session.
            </label>
          </div>

          {summary.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">⚠️ Athugið (gögnin eru samt vistuð):</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px]">
                {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">🔗 Lykildálkar sem fundust</h3>
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-3">
              {KEY_COLUMNS.map((h) => (
                <div key={h} className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${foundHeaders.has(h) ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-100 bg-slate-50 text-slate-400"}`}>
                  <span className="font-mono">{h}</span><span>{foundHeaders.has(h) ? "✓" : "—"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">🔍 Fyrstu {Math.min(5, summary.rows.length)} raðir</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead className="bg-slate-50 text-left text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-2 py-1.5">Leikmaður</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Dagsetning</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Player Load</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Lengd (mín)</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">CoD</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Accel/Decel</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1.5 font-medium text-slate-800">{r.playerName}</td>
                      <td className={`px-2 py-1.5 ${r.date ? "text-slate-600" : "text-amber-700"}`}>{r.date ?? "—"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{fmt(r.playerLoad)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{fmt(r.durationMin)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{fmt(r.codEvents)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{fmt(r.accelerations)}/{fmt(r.decelerations)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Vista í MicroPulse</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Vistar í <code className="rounded bg-slate-100 px-1">player_external_load_daily</code> (source: kinexon).
                  Nöfn eru pöruð við leikmenn liðsins þíns; ópöruð nöfn eru sýnd hér að neðan.
                </p>
              </div>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-[#2740e6] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50">
                {saving ? "Vista…" : "Vista í MicroPulse"}
              </button>
            </div>
            {saveError && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">⚠️ {saveError}</div>}
            {saveResult && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                ✓ Vistað: <strong>{saveResult.sessionsStored}</strong> met fyrir <strong>{saveResult.athletesMatched}</strong> leikmenn
                {saveResult.earliestDate && <> ({saveResult.earliestDate === saveResult.latestDate ? saveResult.earliestDate : `${saveResult.earliestDate} → ${saveResult.latestDate}`})</>}.
                {saveResult.skipped > 0 && <> {saveResult.skipped} röð(um) sleppt.</>}
                {saveResult.athletesUnmatched.length > 0 && (
                  <div className="mt-1.5 text-amber-800">
                    ⚠️ Ópöruð nöfn ({saveResult.athletesUnmatched.length}) — bættu þeim á leikmannalistann eða lagfærðu nafnið: {saveResult.athletesUnmatched.join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-slate-50 px-2 py-1.5">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 100) return Math.round(v).toString();
  return v.toFixed(1);
}

// ─── XLSX → CSV (in-browser, via SheetJS). FS=';' so European-decimal commas in
//     values never collide with the field delimiter. ──────────────────────────
async function xlsxToCsv(file: File): Promise<string> {
  const XLSX = await loadSheetJS();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const names: string[] = workbook.SheetNames;
  return XLSX.utils.sheet_to_csv(workbook.Sheets[names[0]], { FS: ";" });
}
async function loadSheetJS(): Promise<{ read: (b: ArrayBuffer, o: unknown) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_csv: (s: unknown, o: unknown) => string } }> {
  const w = window as unknown as { XLSX?: unknown };
  if (typeof window !== "undefined" && w.XLSX) return w.XLSX as never;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => resolve((window as unknown as { XLSX: never }).XLSX);
    s.onerror = () => reject(new Error("Tókst ekki að hlaða SheetJS"));
    document.head.appendChild(s);
  });
}
