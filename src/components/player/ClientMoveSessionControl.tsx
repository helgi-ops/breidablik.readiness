"use client";

/**
 * ClientMoveSessionControl — lets the ATHLETE move one of their own prescribed
 * sessions from its scheduled day to another day, in EITHER direction (e.g. pull
 * Thursday's session forward to Wednesday to do it early, or push it later). The
 * self-scoped parallel to the trainer's MoveClientSessionControl; the
 * /api/client/today resolver honours the move the same way.
 *
 * Distinct from ClientMoveSessionButton, which only pushes TODAY's session to a
 * LATER day. Here the athlete picks which day's session to move and where to.
 * Guard: the new day can't be in the past (you can't do a session yesterday).
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Resched = { from_date: string; to_date: string; session_id: string };

export default function ClientMoveSessionControl({ lang, onChanged }: { lang: "EN" | "IS"; onChanged?: () => void }) {
  const is = lang === "IS";
  const today = new Date().toISOString().slice(0, 10);
  const [list, setList] = useState<Resched[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const authHeader = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/session-reschedule`, { headers: await authHeader() });
      const j = await res.json();
      setList(res.ok ? (j.reschedules ?? []) : []);
    } catch { setList([]); }
  }, [authHeader]);
  useEffect(() => { void load(); }, [load]);

  const move = async () => {
    if (!from || !to) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/client/session-reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ from_date: from, to_date: to }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setFrom(""); setTo(""); setOpen(false); await load(); onChanged?.();
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setBusy(false); }
  };

  const undo = async (fromDate: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/client/session-reschedule?from_date=${fromDate}`, { method: "DELETE", headers: await authHeader() });
      if (res.ok) { await load(); onChanged?.(); }
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(is ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-700">{is ? "Færa æfingu" : "Move a session"}</div>
          <div className="text-[11px] text-slate-500">{is ? "Taktu æfingu fyrr eða síðar — t.d. fimmtudags-æfinguna á miðvikudag." : "Do a session earlier or later — e.g. Thursday's session on Wednesday."}</div>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
          {open ? (is ? "Loka" : "Close") : (is ? "Færa" : "Move")}
        </button>
      </div>

      {open && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-slate-500">
            <span className="block">{is ? "Dagur æfingar" : "Session's day"}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-[10px] text-slate-500">
            <span className="block">{is ? "Nýr dagur" : "New day"}</span>
            <input type="date" value={to} min={today} onChange={(e) => setTo(e.target.value)} className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <button type="button" disabled={busy || !from || !to} onClick={move} className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
            {busy ? "…" : (is ? "Færa" : "Move")}
          </button>
        </div>
      )}
      {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}

      {list.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {list.map((r) => (
            <div key={r.from_date} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
              <span>{fmt(r.from_date)} → <span className="font-medium text-slate-800">{fmt(r.to_date)}</span></span>
              <button type="button" disabled={busy} onClick={() => undo(r.from_date)} className="text-slate-500 underline hover:text-slate-700 disabled:opacity-50">
                {is ? "Afturkalla" : "Undo"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
