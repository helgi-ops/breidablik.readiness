"use client";

/**
 * ClientMoveSessionButton — lets a PT client move TODAY's session to another day
 * when they can't do it (life happens). Sends only the new day; the server uses
 * its own "today" for the from-date (no timezone drift). Relocates just that one
 * session. Also renders the "moved to / from" note when a move is in effect.
 */

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function ClientMoveSessionButton({
  lang, movedTo, movedFrom, endDate, onChanged,
}: {
  lang: "IS" | "EN";
  movedTo?: string | null;     // today's session was moved away to this date
  movedFrom?: string | null;   // today shows a session moved in from this date
  endDate?: string | null;     // plan end (caps the date picker)
  onChanged: () => void;
}) {
  const is = lang === "IS";
  const [open, setOpen] = useState(false);
  const [toDate, setToDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  const authHeader = async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  };

  const move = async () => {
    if (!toDate) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/client/session-reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ to_date: toDate }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setOpen(false); setToDate(""); onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setBusy(false); }
  };

  const undo = async (fromDate: string) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/client/session-reschedule?from_date=${fromDate}`, { method: "DELETE", headers: await authHeader() });
      if (res.ok) onChanged();
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(is ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short" });

  // Today's session was moved away → show the note + undo.
  if (movedTo) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
        {is ? "Þú færðir æfingu dagsins yfir á " : "You moved today's session to "}<span className="font-semibold">{fmt(movedTo)}</span>.
        <button type="button" disabled={busy} onClick={() => undo(new Date().toISOString().slice(0, 10))} className="ml-2 font-medium text-amber-700 underline disabled:opacity-50">
          {is ? "Afturkalla" : "Undo"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {movedFrom && (
        <div className="text-[11px] text-slate-500">
          {is ? "Færð hingað frá " : "Moved here from "}{fmt(movedFrom)}.
        </div>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-[12px] font-medium text-indigo-600 hover:text-indigo-700">
          {is ? "Kemstu ekki í dag? Færa á annan dag" : "Can't do it today? Move to another day"}
        </button>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          <div className="text-[12px] text-slate-700">{is ? "Veldu nýjan dag fyrir æfinguna:" : "Pick a new day for this session:"}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={toDate}
              min={tomorrow}
              max={endDate ?? undefined}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button type="button" disabled={busy || !toDate} onClick={move} className="rounded-md bg-indigo-600 px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50">
              {busy ? "…" : (is ? "Færa" : "Move")}
            </button>
            <button type="button" disabled={busy} onClick={() => { setOpen(false); setToDate(""); }} className="text-[12px] text-slate-500 hover:text-slate-700">
              {is ? "Hætta við" : "Cancel"}
            </button>
          </div>
          {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
        </div>
      )}
    </div>
  );
}
