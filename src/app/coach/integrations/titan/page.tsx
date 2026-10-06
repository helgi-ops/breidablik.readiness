"use client";

/**
 * Titan (Integrated Bionics / Hudl) indoor IMU upload + Google-Sheet auto-sync.
 *
 * Manual path: drag-drop the `_synced_data` tab as CSV, or the whole XLSX workbook (we read the
 * `_synced_data` sheet in-browser via SheetJS). We parse it with the shared parseTitanCsv (same
 * header detection the server sync uses), preview the mapping + sample rows, then POST the rows to
 * /api/integrations/titan/upload → player_external_load_daily (source="titan"), GPS null.
 *
 * Auto-sync path (B): paste the workbook's published `_synced_data` CSV URL (Publish to web → CSV).
 * A daily cron pulls it; "Sync now" runs it on demand. Descriptive — never the readiness colour.
 */

import React, { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { parseTitanCsv, titanRowHasSignal, type TitanRow } from "@/lib/integrations/titan";

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

async function authToken(): Promise<string | null> {
  return (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
}

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
      let csvText: string;
      if (ext === "csv" || ext === "txt") csvText = await file.text();
      else if (ext === "xlsx" || ext === "xls") csvText = await xlsxToCsv(file);
      else throw new Error("Óstudd skráargerð. Notaðu CSV (.csv) eða Excel (.xlsx) af _synced_data flipanum.");

      const { headers, rows } = parseTitanCsv(csvText);
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
      const token = await authToken();
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

  const foundHeaders = React.useMemo(() => {
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
          Indoor IMU: Player Load, Jumps, Impacts og lengd — GPS er ekki til innidyra og helst tómt. Gögnin
          lenda í sömu álagsgreiningu og Catapult (ACWR á Player Load). Tveir valkostir: sjálfvirk Google-Sheet
          samstilling (að neðan) eða handvirk CSV/Excel upphleðsla.
        </p>
      </header>

      <AutoSyncCard />

      <div className="border-t border-slate-200 pt-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Eða: handvirk upphleðsla</h2>

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
    </div>
  );
}

// ─── Auto-sync (Google Sheet published CSV) ────────────────────────────────
function AutoSyncCard() {
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await authToken(); if (!token) return;
        const res = await fetch("/api/integrations/titan/sheet", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (alive && j?.ok) {
          setUrl(j.publishedCsvUrl ?? "");
          setLastSyncedAt(j.lastSyncedAt ?? null);
          setLastStatus(j.lastSyncStatus ?? null);
          setLastError(j.lastSyncError ?? null);
        }
      } finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const token = await authToken(); if (!token) throw new Error("Ekki innskráð(ur).");
      const res = await fetch("/api/integrations/titan/sheet", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ publishedCsvUrl: url.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "Vistun mistókst.");
      setMsg({ kind: "ok", text: url.trim() ? "Slóð vistuð — sjálfvirk samstilling virk (daglega)." : "Sjálfvirk samstilling aftengd." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Vistun mistókst." });
    } finally { setSaving(false); }
  }

  async function syncNow() {
    setSyncing(true); setMsg(null);
    try {
      const token = await authToken(); if (!token) throw new Error("Ekki innskráð(ur).");
      const res = await fetch("/api/integrations/titan/daily-sync", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? j?.result?.error ?? "Samstilling mistókst.");
      const stored = j?.result?.stored ?? 0;
      const unmatched = j?.result?.unmatched ?? 0;
      setMsg({ kind: "ok", text: `Samstillt: ${stored} met vistuð${unmatched ? `, ${unmatched} ópöruð nöfn` : ""}.` });
      setLastSyncedAt(new Date().toISOString()); setLastStatus("ok"); setLastError(null);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Samstilling mistókst." });
      setLastStatus("error");
    } finally { setSyncing(false); }
  }

  if (!loaded) return null;

  return (
    <div className="rounded-xl border border-[#2740e6]/20 bg-[#2740e6]/5 p-4">
      <h2 className="text-sm font-semibold text-slate-900">🔄 Sjálfvirk Google-Sheet samstilling</h2>
      <p className="mt-1 text-[12px] text-slate-600">
        Í Titan-bókinni: <strong>File → Share → Publish to web</strong>, veldu <code className="rounded bg-white px-1">_synced_data</code> flipann og
        snið <strong>CSV</strong>. Límdu slóðina hér — kerfið sækir hana sjálfkrafa daglega (kl. 04) og uppfærir álagið. Engin innskráning þarf (skrifvarið).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&single=true&output=csv"
          className="min-w-[280px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px]"
        />
        <button onClick={save} disabled={saving} className="rounded-md bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
          {saving ? "Vista…" : "Vista slóð"}
        </button>
        <button onClick={syncNow} disabled={syncing || !url.trim()} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {syncing ? "Samstilli…" : "Samstilla núna"}
        </button>
      </div>
      {msg && <div className={`mt-2 text-[12px] ${msg.kind === "ok" ? "text-emerald-700" : "text-red-700"}`}>{msg.kind === "ok" ? "✓ " : "⚠️ "}{msg.text}</div>}
      {lastSyncedAt && (
        <p className="mt-2 text-[11px] text-slate-500">
          Síðasta samstilling: {new Date(lastSyncedAt).toLocaleString("is-IS")} · staða: <span className={lastStatus === "error" ? "text-red-600" : "text-emerald-600"}>{lastStatus ?? "—"}</span>
          {lastStatus === "error" && lastError ? ` — ${lastError}` : ""}
        </p>
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

// ─── XLSX → the _synced_data sheet as CSV (in-browser, via SheetJS) ────────
async function xlsxToCsv(file: File): Promise<string> {
  const XLSX = await loadSheetJS();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "buffer" });
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
    s.onerror = () => reject(new Error("Tókst ekki að hlaða SheetJS"));
    document.head.appendChild(s);
  });
}
