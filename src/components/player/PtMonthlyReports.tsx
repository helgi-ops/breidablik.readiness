"use client";

/**
 * PtMonthlyReports — the monthly progress reports built on the 1st of each month.
 * Trainer (clientId given): every month, "Download PDF" and "Send to client".
 * Client (no clientId): only the months their trainer sent.
 * Sending only makes the report visible in the client's app — nothing is emailed.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { PtClientReport } from "@/components/trainer/PtClientReportPdf";

type Row = { id: string; month: string; report: PtClientReport; generated_at: string; sent_at: string | null };

export default function PtMonthlyReports({ clientId, lang }: { clientId?: string; lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    return session?.access_token ?? "";
  }, []);

  const fetchRows = useCallback(async (): Promise<Row[]> => {
    try {
      const qs = clientId ? `?player_id=${encodeURIComponent(clientId)}` : "";
      const res = await fetch(`/api/pt/monthly-reports${qs}`, { headers: { Authorization: `Bearer ${await token()}` } });
      const j = await res.json().catch(() => ({}));
      return res.ok ? ((j.reports ?? []) as Row[]) : [];
    } catch { return []; }
  }, [clientId, token]);
  useEffect(() => {
    let alive = true;
    fetchRows().then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [fetchRows]);

  const monthLabel = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(is ? "is-IS" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" });

  const download = async (r: Row) => {
    setBusy(r.id); setErr(null);
    try {
      const { downloadPtClientReportPdf } = await import("@/components/trainer/PtClientReportPdf");
      await downloadPtClientReportPdf(r.report);
    } catch { setErr(is ? "Ekki tókst að búa til PDF." : "Could not create the PDF."); }
    finally { setBusy(null); }
  };

  const send = async (r: Row) => {
    setBusy(r.id); setErr(null);
    try {
      const res = await fetch(`/api/pt/monthly-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id: r.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? (is ? "Sending tókst ekki." : "Could not send.")); return; }
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, sent_at: j.sentAt ?? new Date().toISOString() } : x)));
    } catch { setErr(is ? "Sending tókst ekki." : "Could not send."); }
    finally { setBusy(null); }
  };

  if (rows.length === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {is ? "Mánaðarskýrslur" : "Monthly reports"}
      </div>
      <div className="mb-2 text-xs text-slate-500">
        {clientId
          ? (is ? "Búnar til 1. hvers mánaðar. Viðskiptavinurinn sér skýrslu aðeins eftir að þú sendir hana."
                : "Made on the 1st of each month. Your client only sees a report after you send it.")
          : (is ? "Frá þjálfaranum þínum." : "From your trainer.")}
      </div>
      {err && <div className="mb-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{err}</div>}
      <div className="space-y-1.5">
        {rows.map((r) => {
          const adh = r.report?.adherence;
          const fact = adh?.pct != null
            ? (is ? `${adh.completed} af ${adh.total} æfingum kláraðar` : `${adh.completed} of ${adh.total} sessions done`)
            : (is ? "Engar skráðar æfingar" : "No logged sessions");
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-1.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium capitalize text-slate-800">{monthLabel(r.month)}</div>
                <div className="text-[11px] text-slate-500">
                  {fact}
                  {clientId && (r.sent_at
                    ? ` · ${is ? "Send" : "Sent"} ${dayLabel(r.sent_at)}`
                    : ` · ${is ? "Ekki send" : "Not sent yet"}`)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => download(r)}
                  className="text-[12px] font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {is ? "Sækja PDF" : "Download PDF"}
                </button>
                {clientId && !r.sent_at && (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => send(r)}
                    className="rounded-md bg-slate-900 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busy === r.id ? "…" : (is ? "Senda á viðskiptavin" : "Send to client")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
