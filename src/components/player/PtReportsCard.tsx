"use client";

/**
 * PtReportsCard — upload + view a PT client's performance reports (VALD etc.).
 * Reused on both sides: pass clientId for the trainer viewing a client; omit it
 * for a client viewing their own. Files live in a private bucket and open via
 * short-lived signed URLs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Report = {
  id: string; title: string | null; source: string | null; report_date: string | null;
  file_name: string; file_size: number | null; extracted_status: string; created_at: string; url: string | null;
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

      <div className="mt-3 space-y-1.5">
        {loading && <div className="text-xs text-slate-400">{is ? "Hleð…" : "Loading…"}</div>}
        {!loading && reports.length === 0 && (
          <div className="text-xs text-slate-400">{is ? "Engin skýrsla enn — hladdu upp PDF (t.d. frá VALD)." : "No reports yet — upload a PDF (e.g. from VALD)."}</div>
        )}
        {reports.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-slate-800">{r.title || r.file_name}</div>
              <div className="text-[10px] text-slate-500">
                {r.source ? r.source.toUpperCase() : ""}{r.report_date ? ` · ${fmtDate(r.report_date)}` : ` · ${fmtDate(r.created_at)}`}{r.file_size ? ` · ${kb(r.file_size)}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
        ))}
      </div>
    </div>
  );
}
