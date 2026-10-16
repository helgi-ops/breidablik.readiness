"use client";

/**
 * Titan indoor-IMU upload card — on Today, for a Titan team.
 *
 * The coach's team data-source profile (teams.gps_provider = 'titan') means Today
 * already knows they're on Titan, so instead of sending them to a sidebar URL we
 * put the upload right here: pick today's `_synced_data` (CSV or XLSX), it parses
 * in-browser with the SHARED parseTitanCsv (same header detection + loadPerMinute
 * guard + export warnings the sidebar page and the Sheet cron use), then POSTs the
 * typed rows to the existing /api/integrations/titan/upload. Descriptive indoor
 * load — never the readiness colour.
 */

import React, { useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { parseTitanCsv, titanRowHasSignal, type TitanRow } from "@/lib/integrations/titan";

type Lang = "EN" | "IS";
type Parsed = { fileName: string; rows: TitanRow[]; players: number; dates: string[]; warnings: string[] };
type SaveResult = { sessionsStored: number; athletesMatched: number; athletesUnmatched: string[]; skipped: number; earliestDate: string | null; latestDate: string | null };

const T = {
  EN: {
    title: "Upload today's Titan session", sub: "Indoor IMU: Player Load, Impacts, Jumps. Lands in the same load analysis (ACWR) as a vest — GPS stays empty indoors.",
    pick: "Choose or drop the _synced_data file", hint: "CSV (.csv) of the _synced_data tab, or the Excel (.xlsx) workbook",
    reading: "Reading…", another: "Load another", save: "Save to MicroPulse", saving: "Saving…",
    rows: "rows", withSignal: "with IMU signal", players: "players", unmatched: "Unmatched names",
    saved: "Saved", records: "records for", athletes: "players", warnTitle: "Heads up — this export is incomplete (valid data still saved):",
    err: "Upload failed.", badFile: "Unsupported file. Use CSV (.csv) or Excel (.xlsx) of the _synced_data tab.", noRows: "No player rows found (is the _synced_data tab correct and not empty?).",
  },
  IS: {
    title: "Hlaða upp Titan æfingu dagsins", sub: "Innidyra IMU: Player Load, Impacts, Jumps. Lendir í sömu álagsgreiningu (ACWR) og vesti — GPS helst tómt innandyra.",
    pick: "Veldu eða dragðu _synced_data skrána", hint: "CSV (.csv) af _synced_data flipanum, eða Excel (.xlsx) bókin",
    reading: "Les…", another: "Hlaða annarri", save: "Vista í MicroPulse", saving: "Vista…",
    rows: "raðir", withSignal: "með IMU-merki", players: "leikmenn", unmatched: "Ópöruð nöfn",
    saved: "Vistað", records: "met fyrir", athletes: "leikmenn", warnTitle: "Athugið — exportið er ófullkomið (gild gögn eru samt vistuð):",
    err: "Upphleðsla mistókst.", badFile: "Óstudd skráargerð. Notaðu CSV (.csv) eða Excel (.xlsx) af _synced_data flipanum.", noRows: "Engar leikmanna-raðir fundust (er _synced_data flipinn réttur og ekki tómur?).",
  },
} as const;

async function authToken(): Promise<string | null> {
  return (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
}

export default function TitanTodayUploadCard({ lang }: { lang: Lang }) {
  const t = T[lang];
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStatus("parsing"); setError(null); setParsed(null); setSaveResult(null); setSaveError(null);
    try {
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      let csvText: string;
      if (ext === "csv" || ext === "txt") csvText = await file.text();
      else if (ext === "xlsx" || ext === "xls") csvText = await xlsxToCsv(file);
      else throw new Error(t.badFile);
      const { rows, warnings } = parseTitanCsv(csvText);
      if (rows.length === 0) throw new Error(t.noRows);
      const dates = Array.from(new Set(rows.map((r) => r.date).filter((d): d is string => !!d))).sort();
      setParsed({ fileName: file.name, rows, players: new Set(rows.map((r) => r.playerName)).size, dates, warnings });
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.err);
      setStatus("error");
    }
  }

  async function handleSave() {
    if (!parsed) return;
    setSaving(true); setSaveError(null); setSaveResult(null);
    try {
      const token = await authToken();
      if (!token) throw new Error("Unauthorized");
      const res = await fetch("/api/integrations/titan/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? t.err);
      setSaveResult(json.result as SaveResult);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t.err);
    } finally { setSaving(false); }
  }

  function reset() { setStatus("idle"); setParsed(null); setError(null); setSaveResult(null); setSaveError(null); }

  return (
    <div className="rounded-xl border border-[#2740e6]/25 bg-[#2740e6]/[0.04] p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏀</span>
        <h3 className="text-sm font-semibold text-slate-900">{t.title}</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">Titan</span>
      </div>
      <p className="mt-1 text-[12px] text-slate-600">{t.sub}</p>

      {status !== "ready" && (
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="mt-3 cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white/60 p-5 text-center transition hover:border-[#2740e6]/50 hover:bg-white"
        >
          <div className="text-2xl">📎</div>
          <p className="mt-1 text-[13px] font-medium text-slate-700">{t.pick}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{t.hint}</p>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          {status === "parsing" && <p className="mt-2 text-xs text-slate-500">{t.reading}</p>}
        </div>
      )}

      {status === "error" && error && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-700">
          ⚠️ {error}
          <button onClick={reset} className="ml-3 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold hover:bg-red-200">↻</button>
        </div>
      )}

      {status === "ready" && parsed && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px]">
            <span className="text-slate-700">
              📄 <strong>{parsed.fileName}</strong> · {parsed.rows.length} {t.rows} · {parsed.rows.filter(titanRowHasSignal).length} {t.withSignal} · {parsed.players} {t.players}
              {parsed.dates.length > 0 && <> · {parsed.dates.length === 1 ? parsed.dates[0] : `${parsed.dates[0]} → ${parsed.dates[parsed.dates.length - 1]}`}</>}
            </span>
            <button onClick={reset} className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium hover:bg-slate-50">{t.another}</button>
          </div>

          {parsed.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-800">
              <p className="font-semibold">⚠️ {t.warnTitle}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          {!saveResult && (
            <button onClick={handleSave} disabled={saving}
              className="rounded-lg bg-[#2740e6] px-4 py-2 text-[13px] font-semibold text-white hover:brightness-95 disabled:opacity-50">
              {saving ? t.saving : t.save}
            </button>
          )}
          {saveError && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-700">⚠️ {saveError}</div>}
          {saveResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
              ✓ {t.saved}: <strong>{saveResult.sessionsStored}</strong> {t.records} <strong>{saveResult.athletesMatched}</strong> {t.athletes}
              {saveResult.earliestDate && <> ({saveResult.earliestDate === saveResult.latestDate ? saveResult.earliestDate : `${saveResult.earliestDate} → ${saveResult.latestDate}`})</>}.
              {saveResult.athletesUnmatched.length > 0 && (
                <div className="mt-1 text-amber-800">⚠️ {t.unmatched} ({saveResult.athletesUnmatched.length}): {saveResult.athletesUnmatched.join(", ")}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── XLSX → the _synced_data sheet as CSV (in-browser, via SheetJS) ────────
async function xlsxToCsv(file: File): Promise<string> {
  const XLSX = await loadSheetJS();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "buffer" });
  const names: string[] = workbook.SheetNames;
  const synced = names.find((n) => n.toLowerCase().replace(/[^a-z0-9]/g, "") === "synceddata") ?? names[0];
  return XLSX.utils.sheet_to_csv(workbook.Sheets[synced]);
}
async function loadSheetJS(): Promise<{ read: (b: ArrayBuffer, o: unknown) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_csv: (s: unknown) => string } }> {
  const w = window as unknown as { XLSX?: unknown };
  if (typeof window !== "undefined" && w.XLSX) return w.XLSX as never;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => resolve((window as unknown as { XLSX: never }).XLSX);
    s.onerror = () => reject(new Error("Failed to load SheetJS"));
    document.head.appendChild(s);
  });
}
