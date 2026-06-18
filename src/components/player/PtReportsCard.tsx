"use client";

/**
 * PtReportsCard — upload + view a PT client's performance reports (VALD etc.).
 * Reused on both sides: pass clientId for the trainer viewing a client; omit it
 * for a client viewing their own. Files live in a private bucket and open via
 * short-lived signed URLs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Metric = { label: string; value: number | string; unit?: string };
type TestRow = { product?: string; test_type?: string; date?: string | null; metrics?: Metric[]; left_n?: number | null; right_n?: number | null; asymmetry_percent?: number | null; asymmetry_side?: string | null };
type Extracted = { athlete?: string | null; report_date?: string | null; body_weight_kg?: number | null; tests?: TestRow[] } | null;
type Report = {
  id: string; title: string | null; source: string | null; report_date: string | null;
  file_name: string; file_size: number | null; extracted?: Extracted; extracted_status: string; created_at: string; url: string | null;
};

export default function PtReportsCard({ clientId, lang }: { clientId?: string; lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const authHeader = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  const qs = clientId ? `?player_id=${clientId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await authHeader();
      const res = await fetch(`/api/pt/reports${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json();
      setReports(res.ok ? (j.reports ?? []) : []);
    } catch { setReports([]); }
    finally { setLoading(false); }
  }, [authHeader, qs]);
  useEffect(() => { void load(); }, [load]);

  const onPick = async (file: File) => {
    setBusy(true); setErr(null);
    try {
      const token = await authHeader();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name.replace(/\.[^.]+$/, ""));
      fd.append("source", "vald");
      if (clientId) fd.append("player_id", clientId);
      const res = await fetch(`/api/pt/reports`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Upload failed"); return; }
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const [working, setWorking] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const extract = async (id: string) => {
    setWorking(id); setErr(null);
    try {
      const token = await authHeader();
      const res = await fetch(`/api/pt/reports/${id}/extract`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Extraction failed"); return; }
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setWorking(null); }
  };

  const confirm = async (id: string, extracted: Extracted) => {
    setWorking(id); setNote(null);
    try {
      const token = await authHeader();
      const res = await fetch(`/api/pt/reports/${id}/extract`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ extracted }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const written = j?.vald?.written ?? 0;
        if (written > 0) {
          setNote(is
            ? `${written} ${written === 1 ? "próf" : "próf"} bætt í VALD-prófíl leikmannsins.`
            : `${written} test${written === 1 ? "" : "s"} added to the player's VALD profile.`);
        }
        load();
      }
    } catch { /* ignore */ }
    finally { setWorking(null); }
  };

  const del = async (id: string) => {
    setBusy(true);
    try {
      const token = await authHeader();
      const res = await fetch(`/api/pt/reports`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ id }) });
      if (res.ok) load();
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const kb = (n: number | null) => (n ? `${Math.round(n / 1024)} KB` : "");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {is ? "Frammistöðuskýrslur" : "Performance reports"}
          </div>
          <div className="text-xs text-slate-500">{is ? "T.d. VALD (ForceDecks, NordBord, ForceFrame)." : "e.g. VALD (ForceDecks, NordBord, ForceFrame)."}</div>
        </div>
        <label className="shrink-0 cursor-pointer rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
          {busy ? "…" : (is ? "Hlaða upp" : "Upload")}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); }}
          />
        </label>
      </div>

      {err && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{err}</div>}
      {note && <div className="mt-2 rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">{note}</div>}

      <div className="mt-3 space-y-1.5">
        {loading && <div className="text-xs text-slate-400">{is ? "Hleð…" : "Loading…"}</div>}
        {!loading && reports.length === 0 && (
          <div className="text-xs text-slate-400">{is ? "Engin skýrsla enn — hladdu upp PDF (t.d. frá VALD)." : "No reports yet — upload a PDF (e.g. from VALD)."}</div>
        )}
        {reports.map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-slate-800">
                  {r.title || r.file_name}
                  {r.extracted_status === "confirmed" && <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-700">{is ? "lesið ✓" : "read ✓"}</span>}
                  {r.extracted_status === "pending" && <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700">{is ? "yfirferð" : "review"}</span>}
                </div>
                <div className="text-[10px] text-slate-500">
                  {r.source ? r.source.toUpperCase() : ""}{r.report_date ? ` · ${fmtDate(r.report_date)}` : ` · ${fmtDate(r.created_at)}`}{r.file_size ? ` · ${kb(r.file_size)}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {clientId && r.extracted_status === "none" && (
                  <button type="button" disabled={working === r.id} onClick={() => extract(r.id)} className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
                    {working === r.id ? (is ? "Les…" : "Reading…") : (is ? "Lesa tölur (AI)" : "Read numbers (AI)")}
                  </button>
                )}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700">
                    {is ? "Skoða" : "View"}
                  </a>
                )}
                <button type="button" disabled={busy} onClick={() => del(r.id)} className="text-[11px] text-slate-400 hover:text-red-600 disabled:opacity-50">
                  {is ? "Eyða" : "Delete"}
                </button>
              </div>
            </div>

            {/* Extracted numbers — review + confirm (coach side). AI labelled. */}
            {clientId && r.extracted && r.extracted.tests && r.extracted.tests.length > 0 && r.extracted_status !== "none" && (
              <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {is ? "Lesið úr skýrslu (AI)" : "Read from report (AI)"}
                    {r.extracted.body_weight_kg ? ` · ${r.extracted.body_weight_kg} kg` : ""}
                  </span>
                  {r.extracted_status === "pending" && (
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={working === r.id} onClick={() => confirm(r.id, r.extracted ?? null)} className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50">
                        {is ? "Staðfesta" : "Confirm"}
                      </button>
                      <button type="button" disabled={working === r.id} onClick={() => extract(r.id)} className="text-[10px] text-slate-500 hover:text-slate-700 disabled:opacity-50">
                        {is ? "Lesa aftur" : "Re-read"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  {r.extracted.tests.map((t, ti) => (
                    <div key={ti} className="text-[11px]">
                      <span className="font-medium text-slate-700">{t.test_type ?? t.product}</span>
                      {t.date ? <span className="text-slate-400"> · {fmtDate(t.date)}</span> : null}
                      {t.asymmetry_percent != null ? <span className="text-amber-600"> · {is ? "ósamhverfa" : "asym"} {t.asymmetry_percent}%{t.asymmetry_side ? ` ${t.asymmetry_side}` : ""}</span> : null}
                      <div className="text-slate-500">
                        {(t.metrics ?? []).map((m, mi) => (
                          <span key={mi}>{mi > 0 ? " · " : ""}{m.label} {m.value}{m.unit ? ` ${m.unit}` : ""}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[9px] text-slate-400">
                  {is ? "AI las þetta úr skjalinu — staðfestu áður en það er treyst." : "AI read this from the document — confirm before it's trusted."}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
