"use client";

/**
 * ClientBreaksManager — trainer declares a PT client's vacation / break.
 * During it: reminders paused, no streak/compliance penalty, return ease-in.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Break = { id: string; start_date: string; end_date: string; label: string | null };
type ReturnPhase = { in_return: boolean; day: number; total_days: number; ease_pct: number };

export default function ClientBreaksManager({ clientId, lang }: { clientId: string; lang: "IS" | "EN" }) {
  const [breaks, setBreaks] = useState<Break[]>([]);
  const [ret, setRet] = useState<ReturnPhase | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const t = lang === "EN"
    ? { title: "Vacation / breaks", sub: "During a break the client gets a full rest — no reminders, no missed-check-in penalty, and a gentle ease-in on return.",
        from: "From", to: "To", label: "Label (optional)", add: "Add", none: "No upcoming breaks.", remove: "Remove", onb: "on vacation", ret: "returning" }
    : { title: "Frí", sub: "Í fríi fær iðkandinn fullt frí — engar áminningar, engin refsing fyrir check-in, og mild endurkoma á eftir.",
        from: "Frá", to: "Til", label: "Heiti (valfrjálst)", add: "Bæta við", none: "Engin frí framundan.", remove: "Eyða", onb: "í fríi", ret: "endurkoma" };

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/trainer/client/${clientId}/breaks`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json.ok) { setBreaks(json.breaks as Break[]); setRet((json.returnPhase as ReturnPhase) ?? null); }
    } catch { /* soft */ }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!start || !end) return;
    setBusy(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const res = await fetch(`/api/trainer/client/${clientId}/breaks`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ startDate: start, endDate: end, label: label || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      setStart(""); setEnd(""); setLabel("");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/trainer/client/${clientId}/breaks?breakId=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      await load();
    } catch { /* soft */ }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">🌴 {t.title}</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">{t.sub}</p>
      </div>

      {ret?.in_return && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          ↩︎ {lang === "EN" ? `Returning — day ${ret.day}/${ret.total_days}, ease in (~${ret.ease_pct}%).` : `Endurkoma — dagur ${ret.day}/${ret.total_days}, mildaðu (~${ret.ease_pct}%).`}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-600">{t.from}</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-600">{t.to}</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[8rem]">
          <label className="text-[11px] font-medium text-slate-600">{t.label}</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
        </div>
        <button onClick={add} disabled={busy || !start || !end}
          className="h-9 rounded-lg bg-neutral-900 px-3 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {t.add}
        </button>
      </div>

      {err && <div className="text-xs text-red-600">{err}</div>}

      {breaks.length === 0 ? (
        <div className="text-sm text-slate-500">{t.none}</div>
      ) : (
        <ul className="space-y-1.5">
          {breaks.map((b) => {
            const active = b.start_date <= today && today <= b.end_date;
            return (
              <li key={b.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-800">
                  <span className="font-medium tabular-nums">{b.start_date} → {b.end_date}</span>
                  {b.label ? <span className="text-slate-500"> · {b.label}</span> : null}
                  {active && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">{t.onb}</span>}
                </span>
                <button onClick={() => remove(b.id)} className="text-xs text-red-600 hover:text-red-800">{t.remove}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
