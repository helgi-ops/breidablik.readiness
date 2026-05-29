"use client";

/**
 * PtGamesManager — trainer enters a client's upcoming game dates (from the
 * schedule the athlete sends). Drives automatic pre-game tapering on the client
 * surface. Athletes never edit this themselves.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Game = { id: string; game_date: string; label: string | null };

export default function PtGamesManager({ clientId, lang }: { clientId: string; lang: "IS" | "EN" }) {
  const [games, setGames] = useState<Game[]>([]);
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const t = lang === "IS"
    ? { title: "Leikir framundan", none: "Engir leikir skráðir.", add: "Bæta við", date: "Dagsetning", label: "Andstæðingur / heiti (valfrjálst)", remove: "Eyða", hint: "Kerfið trappar æfingaálag sjálfkrafa niður dagana fyrir leik." }
    : { title: "Upcoming games", none: "No games scheduled.", add: "Add", date: "Date", label: "Opponent / label (optional)", remove: "Delete", hint: "The system automatically tapers training load in the days before a game." };

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/trainer/client/${clientId}/games`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.ok) setGames(json.games as Game[]);
    } catch { /* soft */ }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!date) return;
    setBusy(true);
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not signed in");
      const res = await fetch(`/api/trainer/client/${clientId}/games`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ gameDate: date, label: label || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      setDate(""); setLabel("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/trainer/client/${clientId}/games?gameId=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      await load();
    } catch { /* soft */ }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">⚽ {t.title}</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">{t.hint}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-600">{t.date}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
          <label className="text-[11px] font-medium text-slate-600">{t.label}</label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
        </div>
        <button onClick={add} disabled={busy || !date}
          className="h-9 rounded-lg bg-neutral-900 px-3 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          {t.add}
        </button>
      </div>

      {err && <div className="text-xs text-red-600">{err}</div>}

      {games.length === 0 ? (
        <div className="text-sm text-slate-500">{t.none}</div>
      ) : (
        <ul className="space-y-1.5">
          {games.map((g) => (
            <li key={g.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-800">
                <span className="font-medium tabular-nums">{g.game_date}</span>
                {g.label ? <span className="text-slate-500"> · {g.label}</span> : null}
              </span>
              <button onClick={() => remove(g.id)} className="text-xs text-red-600 hover:text-red-800">{t.remove}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
