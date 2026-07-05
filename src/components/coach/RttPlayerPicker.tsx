"use client";

/**
 * RttPlayerPicker — a dropdown to switch which player's return-to-training plan
 * you're viewing, without going back to a landing page. Lists the team's
 * injured / returning players first (union of both injury tables, from the RTT
 * index API), then a search over the rest of the roster. Team-scoped via the API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Injured = { player_id: string; name: string; injuryType: string | null; injuryDate: string | null; returnDate: string | null; currentlyInjured: boolean };
type Resp = { injured: Injured[]; roster: Array<{ id: string; name: string }>; error?: string };

export default function RttPlayerPicker({ currentId, currentName, defaultOpen = false }: { currentId?: string; currentName?: string; defaultOpen?: boolean }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState<Resp | null>(null);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? "", []);

  // Load the list the first time the menu opens.
  useEffect(() => {
    if (!open || data) return;
    (async () => {
      try {
        const res = await fetch("/api/coach/return-to-training", { headers: { Authorization: `Bearer ${await token()}` } });
        const j = (await res.json()) as Resp;
        if (res.ok) setData(j);
      } catch { /* keep menu; user can retry */ }
    })();
  }, [open, data, token]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = (id: string) => { setOpen(false); setQ(""); if (id !== currentId) router.push(`/coach/return-to-training/${id}`); };

  const s = q.trim().toLowerCase();
  const injuredList = useMemo(() => (data ? data.injured.filter((p) => !s || p.name.toLowerCase().includes(s)) : []), [data, s]);
  const otherMatches = useMemo(() => {
    if (!data) return [];
    const injuredIds = new Set(data.injured.map((i) => i.player_id));
    return data.roster.filter((p) => !injuredIds.has(p.id) && (!s || p.name.toLowerCase().includes(s))).slice(0, 8);
  }, [data, s]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-left hover:bg-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-xl font-bold text-slate-900">{currentName ?? (is ? "Veldu leikmann" : "Select player")}</span>
        <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.53a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {!data ? (
            <div className="p-3 text-sm text-slate-400">{is ? "Hleð…" : "Loading…"}</div>
          ) : (
            <>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={is ? "Leita að leikmanni…" : "Search a player…"} className="mb-2 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" />
              <div className="max-h-80 overflow-y-auto">
                {injuredList.length > 0 && (
                  <>
                    <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Meiddir / í endurkomu" : "Injured / returning"}</div>
                    {injuredList.map((p) => (
                      <button key={p.player_id} type="button" onClick={() => go(p.player_id)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${p.player_id === currentId ? "bg-indigo-50" : ""}`}>
                        <span className="min-w-0 truncate text-slate-800">{p.name}</span>
                        {p.currentlyInjured
                          ? <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-700">{is ? "meiddur" : "injured"}</span>
                          : <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700">{is ? "til baka" : "returned"}</span>}
                      </button>
                    ))}
                  </>
                )}
                {otherMatches.length > 0 && (
                  <>
                    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Aðrir leikmenn" : "Other players"}</div>
                    {otherMatches.map((p) => (
                      <button key={p.id} type="button" onClick={() => go(p.id)} className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 ${p.id === currentId ? "bg-indigo-50" : ""}`}>
                        <span className="min-w-0 truncate">{p.name}</span>
                      </button>
                    ))}
                  </>
                )}
                {injuredList.length === 0 && otherMatches.length === 0 && (
                  <div className="px-2 py-3 text-sm text-slate-400">{is ? "Enginn leikmaður fannst." : "No players found."}</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
