"use client";

/**
 * Titan (Integrated Bionics / Hudl) indoor IMU upload.
 *
 * Coach drag-drops the Titan "Indoor Report" export — the `_synced_data` tab as CSV, or the whole
 * XLSX workbook (we read the `_synced_data` sheet in-browser via SheetJS). We parse it with
 * parseTitanSyncedData (alias-tolerant, null-safe), preview the mapping + sample rows, then SAVE:
 * the rows POST to /api/integrations/titan/upload, which resolves names to the coach's own players
 * and upserts into player_external_load_daily with source="titan" — the same table Catapult/WIMU
 * write to, so the readiness/load engine (ACWR on Player Load) treats it like any indoor load source.
 *
 * Indoor, IMU-only: Player Load + Impacts + Jumps + durations; GPS stays null. Descriptive — never
 * the readiness colour.
 */

import React, { useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { parseTitanSyncedData, titanRowHasSignal, type TitanRow } from "@/lib/integrations/titan";

type ParseSummary = {
  fileName: string;
  headers: string[];
  rows: TitanRow[];
  players: string[];
  dates: string[];
  withSignal: number;
  noDate: number;
};
type SaveResult = {
  sessionsStored: number;
  athletesMatched: number;
  athletesUnmatched: string[];
  skipped: number;
  earliestDate: string | null;
  latestDate: string | null;
};

const CANONICAL_HEADERS = [
  "Date", "Player Name", "IMU Player Load", "IMU Duration", "Load / Minute",
  "Low Active Duration", "High Active Duration", "IMU Jumps", "Impacts",
];

export default function Page() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStatus("parsing"); setError(null); setSummary(null); setSaveResult(null); setSaveError(null);
    try {
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      let matrix: string[][];
      if (ext === "csv" || ext === "txt") {
        matrix = parseCsv(await file.text());
      } else if (ext === "xlsx" || ext === "xls") {
        matrix = await xlsxToMatrix(file);
      } else {
        throw new Error("Óstudd skráargerð. Notaðu CSV (.csv) eða Excel (.xlsx) af _synced_data flipanum.");
      }
      // First non-empty row is the header (A1:I1 on _synced_data).
      const firstIdx = matrix.findIndex((r) => r.some((c) => String(c).trim() !== ""));
      if (firstIdx < 0) throw new Error("Skráin var tóm.");
      const headers = matrix[firstIdx];
      const body = matrix.slice(firstIdx + 1);
      const rows = parseTitanSyncedData(headers, body);
      if (rows.length === 0) throw new Error("Engar leikmanna-raðir fundust (er _synced_data flipinn réttur og ekki tómur?).");

      const players = Array.from(new Set(rows.map((r) => r.playerName))).sort();
      const dates = Array.from(new Set(rows.map((r) => r.date).filter((d): d is string => !!d))).sort();
      setSummary({
        fileName: file.name, headers, rows, players, dates,
        withSignal: rows.filter(titanRowHasSignal).length,
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
      const token = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Ekki innskráð(ur).");
      const res = await fetch("/api/integrations/titan/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ rows: summary.rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Vistun mistókst.");
      setSaveResult(json.result as SaveResult);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Vistun mistókst.");
    } finally { setSaving(false); }
  }

  const foundHeaders = useMemo(() => {
    if (!summary) return new Set<string>();
    const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const present = new Set(summary.headers.map(norm));
    return new Set(CANONICAL_HEADERS.filter((h) => present.has(norm(h))));
  }, [summary]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Titan innidyra-upphleðsla</h1>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">beta</span>
        </div>
        <p className="text-sm text-slate-500">
          Hladdu inn Titan „Indoor Report“ — <code className="rounded bg-slate-100 px-1">_synced_data</code> flipann sem CSV
          (File → Download → CSV) eða alla Excel-bókina. Kerfið les Player Load, Jumps, Impacts og lengd,
          sýnir þér hvað það fann, og þú vistar svo — það lendir í sömu álagsgreiningu og Catapult (ACWR á Player Load).
          GPS er ekki til innidyra og helst tómt.
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
          <p className="mt-2 text-sm font-medium text-slate-700">Smelltu eða dragðu Titan export hingað</p>
          <p className="mt-1 text-[11px] text-slate-500">CSV (.csv) af _synced_data flipanum, eða Excel (.xlsx) bókin</p>
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
                  Raðir: <strong>{summary.rows.length}</strong> · með IMU-merki: <strong>{summary.withSignal}</strong>
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
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">🔗 Dálkar sem fundust</h3>
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-3">
              {CANONICAL_HEADERS.map((h) => (
                <div key={h} className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${foundHeaders.has(h) ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-100 bg-slate-50 text-slate-400"}`}>
                  <span className="font-mono">{h}</span><span>{foundHeaders.has(h) ? "✓" : "—"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">🔍 Fyrstu {Math.min(5, summary.rows.length)} raðir</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <thead className="bg-slate-50 text-left text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="border-b border-slate-200 px-2 py-1.5">Leikmaður</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Dagsetning</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Player Load</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Lengd (mín)</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Jumps</th>
                    <th className="border-b border-slate-200 px-2 py-1.5">Impacts</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1.5 font-medium text-slate-800">{r.playerName}</td>
                      <td className={`px-2 py-1.5 ${r.date ? "text-slate-600" : "text-amber-700"}`}>{r.date ?? "—"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{fmt(r.imuPlayerLoad)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{fmt(r.imuDurationMin)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{fmt(r.imuJumps)}</td>
                      <td className="px-2 py-1.5 text-slate-600">{fmt(r.impacts)}</td>
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
                  Vistar í <code className="rounded bg-slate-100 px-1">player_external_load_daily</code> (source: titan).
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

// ─── CSV → matrix (quote-aware, comma/semicolon tolerant) ───────────────────
function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const delim = (t.split("\n")[0]?.split(";").length ?? 0) > (t.split("\n")[0]?.split(",").length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out;
}

// ─── XLSX → the _synced_data sheet as a matrix (in-browser, via SheetJS) ────
async function xlsxToMatrix(file: File): Promise<string[][]> {
  const XLSX = await loadSheetJS();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const names: string[] = workbook.SheetNames;
  const synced = names.find((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "") === "synceddata") ?? names[0];
  const sheet = workbook.Sheets[synced];
  const csv: string = XLSX.utils.sheet_to_csv(sheet);
  return parseCsv(csv);
}
async function loadSheetJS(): Promise<{ read: (b: ArrayBuffer, o: unknown) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_csv: (s: unknown) => string } }> {
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
