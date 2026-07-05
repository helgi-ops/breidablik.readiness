"use client";

/**
 * ReturnToTrainingIndex — pick a player to open their return-to-training plan.
 * Lists the team's injured / recently-injured players first (union of both
 * injury tables), plus a search to start a plan for any player (edge case: no
 * injury record yet). Team-scoped via the API.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Injured = { player_id: string; name: string; injuryType: string | null; injuryDate: string | null; returnDate: string | null; currentlyInjured: boolean };
type Resp = { injured: Injured[]; roster: Array<{ id: string; name: string }>; error?: string };

export default function ReturnToTrainingIndex() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? "", []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/coach/return-to-training", { headers: { Authorization: `Bearer ${await token()}` } });
        const j = (await res.json()) as Resp;
        if (!res.ok) setErr(j.error ?? "Failed"); else setData(j);
      } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const rosterMatches = useMemo(() => {
    if (!data || !q.trim()) return [];
    const s = q.trim().toLowerCase();
    const injuredIds = new Set(data.injured.map((i) => i.player_id));
    return data.roster.filter((p) => p.name.toLowerCase().includes(s) && !injuredIds.has(p.id)).slice(0, 8);
  }, [data, q]);

  if (loading) return <div className="p-6 text-sm text-slate-500">{is ? "Hleð…" : "Loading…"}</div>;
  if (err || !data) return <div className="p-6"><div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err ?? "No data"}</div></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{is ? "Aftur í æfingar" : "Return-to-training"}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{is ? "Veldu meiddan leikmann til að skoða álagssögu og byggja upp endurkomu-áætlun." : "Pick an injured player to see their load history and build a return-to-training plan."}</p>
      </div>

      {/* Injured / recently-injured players */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-800">{is ? "Meiddir / í endurkomu" : "Injured / returning"} <span className="text-slate-400">({data.injured.length})</span></div>
        {data.injured.length === 0 ? (
          <div className="py-4 text-sm text-slate-500">{is ? "Engir skráðir meiðsli á liðinu núna." : "No recorded injuries on the squad right now."}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.injured.map((p) => (
              <Link key={p.player_id} href={`/coach/return-to-training/${p.player_id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50/60">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-800">{p.name}</span>
                    {p.currentlyInjured
                      ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">{is ? "meiddur" : "injured"}</span>
                      : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{is ? "kominn til baka" : "returned"}</span>}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {p.injuryType ?? (is ? "meiðsli" : "injury")}{p.injuryDate ? ` · ${p.injuryDate}` : ""}{p.returnDate && !p.currentlyInjured ? ` → ${p.returnDate}` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-indigo-600">{is ? "Opna →" : "Open →"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pick any player (no injury record yet) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-800">{is ? "Eða veldu hvaða leikmann sem er" : "Or pick any player"}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={is ? "Leita að leikmanni…" : "Search a player…"} className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" />
        {rosterMatches.length > 0 && (
          <div className="mt-2 divide-y divide-slate-100">
            {rosterMatches.map((p) => (
              <Link key={p.id} href={`/coach/return-to-training/${p.id}`} className="flex items-center justify-between py-2 text-sm hover:bg-slate-50/60">
                <span className="text-slate-700">{p.name}</span>
                <span className="text-indigo-600">{is ? "Opna →" : "Open →"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
