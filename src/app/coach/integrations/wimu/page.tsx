"use client";

/**
 * WIMU PRO upload (BETA).
 *
 * Lets a coach drag-drop a SPRO CSV (or XLSX, converted to CSV in-browser
 * via SheetJS), previews the parser's interpretation of the file (delimiter,
 * athlete/date counts, column mapping, first normalized rows), then SAVES it:
 * the "Vista í MicroPulse" button POSTs the athlete-day records to
 * /api/integrations/wimu/upload, which resolves names to the coach's own
 * players and upserts into player_external_load_daily with source="wimu" —
 * the same table Catapult / STATSports write to, so the load surfaces treat
 * WIMU identically. Descriptive external load; never the readiness colour.
 *
 * If important columns land in the Unmatched list, add aliases to
 * src/lib/integrations/wimu/metricCatalog.ts and they auto-detect next time.
 */

import React, { useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  parseWimuCsv,
  normalizeWimuRow,
  aggregateByAthleteDate,
  getWimuMetricDefinitions,
  type WimuMetricKey,
  type WimuSessionMetric,
} from "@/lib/integrations/wimu";

type ParseSummary = {
  fileName: string;
  delimiter: string;
  totalRows: number;
  athletes: string[];
  dates: string[];
  matchedColumns: Array<{ index: number; raw: string; key: WimuMetricKey }>;
  unmatchedColumns: Array<{ index: number; raw: string }>;
  normalizedSample: WimuSessionMetric[];
  aggregatedCount: number;
  /** The athlete-day records to store when the coach saves. */
  aggregatedRows: WimuSessionMetric[];
};

type SaveResult = {
  sessionsStored: number;
  athletesMatched: number;
  athletesUnmatched: string[];
  earliestDate: string | null;
  latestDate: string | null;
};

export default function Page() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const allMetricDefs = useMemo(() => getWimuMetricDefinitions(), []);
  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    allMetricDefs.forEach((d) => m.set(d.key, d.label));
    return m;
  }, [allMetricDefs]);

  async function handleFile(file: File) {
    setStatus("parsing");
    setError(null);
    setSummary(null);

    try {
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      let csvText: string;

      if (ext === "csv" || ext === "txt") {
        csvText = await file.text();
      } else if (ext === "xlsx" || ext === "xls") {
        csvText = await xlsxToCsv(file);
      } else {
        throw new Error(
          "Óstudd skráargerð. Notaðu CSV (.csv) eða Excel (.xlsx) frá SPRO export.",
        );
      }

      const parsed = parseWimuCsv(csvText);
      if (parsed.rows.length === 0) {
        throw new Error("Skráin var tóm eða engin þekkjanleg gögn fundust.");
      }

      const normalized = parsed.rows
        .map(normalizeWimuRow)
        .filter((r): r is WimuSessionMetric => r != null);

      const aggregated = aggregateByAthleteDate(normalized);

      const athletes = Array.from(new Set(normalized.map((n) => n.athleteName))).sort();
      const dates = Array.from(new Set(normalized.map((n) => n.date))).sort();

      const matchedColumns: ParseSummary["matchedColumns"] = [];
      parsed.matched.forEach((key, index) => {
        matchedColumns.push({ index, raw: parsed.headerCells[index] ?? "", key });
      });

      const unmatchedColumns: ParseSummary["unmatchedColumns"] = [];
      parsed.unmatched.forEach((raw, index) => {
        unmatchedColumns.push({ index, raw });
      });

      setSummary({
        fileName: file.name,
        delimiter: parsed.delimiter,
        totalRows: parsed.rows.length,
        athletes,
        dates,
        matchedColumns: matchedColumns.sort((a, b) => a.index - b.index),
        unmatchedColumns: unmatchedColumns.sort((a, b) => a.index - b.index),
        normalizedSample: normalized.slice(0, 5),
        aggregatedCount: aggregated.length,
        aggregatedRows: aggregated,
      });
      setStatus("ready");
    } catch (err: any) {
      setError(err?.message ?? "Óþekkt villa við lestur skráar.");
      setStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function reset() {
    setStatus("idle");
    setSummary(null);
    setError(null);
    setSaveResult(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!summary || summary.aggregatedRows.length === 0) return;
    setSaving(true);
    setSaveError(null);
    setSaveResult(null);
    try {
      const token = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Ekki innskráð(ur).");
      const res = await fetch("/api/integrations/wimu/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ sessions: summary.aggregatedRows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Vistun mistókst.");
      setSaveResult(json.result as SaveResult);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Vistun mistókst.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">WIMU PRO upload</h1>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
            beta
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Hladdu inn SPRO export skrá (CSV eða Excel). Kerfið les úr henni,
          sýnir column-mapping til staðfestingar, og þú vistar svo gögnin í
          MicroPulse — þau lenda í sömu álagsgreiningu og Catapult / STATSports.
        </p>
      </header>

      {/* Upload zone */}
      {status !== "ready" && (
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center transition hover:border-slate-400 hover:bg-slate-100"
        >
          <div className="text-3xl">📎</div>
          <p className="mt-2 text-sm font-medium text-slate-700">
            Smelltu eða dragðu SPRO export hingað
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            CSV (.csv) eða Excel (.xlsx) — venjulega "Export raw data from session" í SPRO
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={onInputChange}
          />
          {status === "parsing" && (
            <p className="mt-3 text-xs text-slate-500">Les skrá...</p>
          )}
        </div>
      )}

      {status === "error" && error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          ⚠️ {error}
          <button
            onClick={reset}
            className="ml-3 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold hover:bg-red-200"
          >
            Reyna aftur
          </button>
        </div>
      )}

      {status === "ready" && summary && (
        <PreviewPanel
          summary={summary}
          labelByKey={labelByKey}
          onReset={reset}
          onSave={handleSave}
          saving={saving}
          saveResult={saveResult}
          saveError={saveError}
        />
      )}
    </div>
  );
}

// ─── Preview panel ──────────────────────────────────────────────────────────

function PreviewPanel({
  summary,
  labelByKey,
  onReset,
  onSave,
  saving,
  saveResult,
  saveError,
}: {
  summary: ParseSummary;
  labelByKey: Map<string, string>;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
  saveResult: SaveResult | null;
  saveError: string | null;
}) {
  const minDate = summary.dates[0] ?? "—";
  const maxDate = summary.dates[summary.dates.length - 1] ?? "—";

  // Pick a manageable subset of metrics to show in the sample table
  const sampleColumns: WimuMetricKey[] = [
    "totalDistance",
    "playerLoad",
    "maxVelocity",
    "avgHeartRate",
    "metabolicPower",
    "highSpeedDistance",
  ];

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              📄 {summary.fileName}
            </h2>
            <p className="text-xs text-muted-foreground">
              Delimiter: <code className="rounded bg-slate-100 px-1">{summary.delimiter === "\t" ? "tab" : summary.delimiter}</code> ·
              Rows parsed: <strong>{summary.totalRows}</strong> ·
              Aggregated to <strong>{summary.aggregatedCount}</strong> athlete-day records
            </p>
          </div>
          <button
            onClick={onReset}
            className="rounded border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Hlaða annarri skrá
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <Metric label="Athletes" value={summary.athletes.length} />
          <Metric label="Dates" value={summary.dates.length} />
          <Metric label="Date range" value={minDate === maxDate ? minDate : `${minDate} → ${maxDate}`} />
        </div>
      </div>

      {/* Column mapping */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">
          🔗 Detected column mapping
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Vinstri = column nafn úr skránni. Hægri = canonical metric í MicroPulse kerfinu.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {summary.matchedColumns.map((c) => (
            <div
              key={c.index}
              className="flex items-center justify-between rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs"
            >
              <span className="font-mono text-slate-700">{c.raw || "(empty)"}</span>
              <span className="ml-2 truncate font-semibold text-emerald-700">
                ✓ {labelByKey.get(c.key) ?? c.key}
              </span>
            </div>
          ))}
        </div>

        {summary.unmatchedColumns.length > 0 && (
          <>
            <h4 className="mt-4 text-xs font-semibold uppercase text-amber-700">
              ⚠️ Unmatched ({summary.unmatchedColumns.length})
            </h4>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Þessar dálkur þekkjast ekki sjálfkrafa og verða hunsaðar. Ef einhver
              þeirra er mikilvæg, segðu okkur — bætum henni í alias catalog.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {summary.unmatchedColumns.map((c) => (
                <div
                  key={c.index}
                  className="rounded border border-amber-100 bg-amber-50 px-2 py-1 font-mono text-xs text-slate-700"
                >
                  {c.raw}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sample rows */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">
          🔍 First {summary.normalizedSample.length} normalized rows
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Eftir parse + type coercion (Spanish decimal commas, EU date formats, etc).
          Kíktu hvort tölurnar séu sanngjarnar.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead className="bg-slate-50 text-left text-[10px] uppercase text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-2 py-1.5">Athlete</th>
                <th className="border-b border-slate-200 px-2 py-1.5">Date</th>
                <th className="border-b border-slate-200 px-2 py-1.5">Dur (min)</th>
                {sampleColumns.map((k) => (
                  <th key={k} className="border-b border-slate-200 px-2 py-1.5">
                    {labelByKey.get(k) ?? k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.normalizedSample.map((row, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-2 py-1.5 font-medium text-slate-800">{row.athleteName}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.date}</td>
                  <td className="px-2 py-1.5 text-slate-600">{fmt(row.durationMinutes)}</td>
                  {sampleColumns.map((k) => (
                    <td key={k} className="px-2 py-1.5 text-slate-600">
                      {fmt(row[k] as number | null | undefined)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save into MicroPulse */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Vista í MicroPulse</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Vistar {summary.aggregatedCount} leikmanna-dag met í <code className="rounded bg-slate-100 px-1">player_external_load_daily</code> (source: WIMU).
              Nöfn eru pöruð við leikmenn liðsins þíns; ópöruð nöfn eru sýnd hér að neðan.
            </p>
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-[#2740e6] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          >
            {saving ? "Vista…" : "Vista í MicroPulse"}
          </button>
        </div>

        {saveError && (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">⚠️ {saveError}</div>
        )}

        {saveResult && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            ✓ Vistað: <strong>{saveResult.sessionsStored}</strong> met fyrir <strong>{saveResult.athletesMatched}</strong> leikmenn
            {saveResult.earliestDate && (
              <> ({saveResult.earliestDate === saveResult.latestDate ? saveResult.earliestDate : `${saveResult.earliestDate} → ${saveResult.latestDate}`})</>
            )}.
            {saveResult.athletesUnmatched.length > 0 && (
              <div className="mt-1.5 text-amber-800">
                ⚠️ Ópöruð nöfn ({saveResult.athletesUnmatched.length}) — bættu þeim á leikmanna­listann eða lagfærðu nafnið: {saveResult.athletesUnmatched.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
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

// ─── XLSX → CSV helper (in-browser, via SheetJS) ───────────────────────────

async function xlsxToCsv(file: File): Promise<string> {
  const XLSX: any = await loadSheetJS();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_csv(sheet);
}

async function loadSheetJS(): Promise<any> {
  if (typeof window !== "undefined" && (window as any).XLSX) return (window as any).XLSX;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => resolve((window as any).XLSX);
    s.onerror = () => reject(new Error("Tókst ekki að hlaða SheetJS"));
    document.head.appendChild(s);
  });
}
