"use client";

/**
 * ImaVerdictStrip — the Driver-axis companion to the LoadVerdictCard strip
 * (Engine axis). GPS = engine, IMA = driver (Niklas Virtanen). One plain line
 * summarising today's high-intensity movement vs each player's own baseline,
 * linking to the IMA Intelligence page — the exact mirror of the "Load →" strip
 * that links to Load Intelligence.
 *
 * Rules decide, not AI. Always present on any day the squad has an IMA history:
 * on a rest day it falls back to the last captured session (labelled), the same
 * way the Load strip stays present with its weekly read.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type ImaPlayer = { full_name: string; sprint_vs_baseline_pct: number | null; total_strides: number };
type ImaResp = { profile?: { per_player?: ImaPlayer[] }; date?: string; requestedDate?: string };

export default function ImaVerdictStrip({ lang, date }: { lang?: "IS" | "EN"; date?: string }) {
  const is = lang === "IS";
  const [state, setState] = useState<{ spikes: string[]; evaluated: number; shownDate: string | null; stale: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(
          `/api/coach/team/ima-day-profile?${date ? `date=${date}&` : ""}fallback=last&lang=${is ? "IS" : "EN"}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!alive || !res.ok) return;
        const j = (await res.json()) as ImaResp;
        const players = (j.profile?.per_player ?? []).filter((p) => p.total_strides > 0);
        // Same threshold the IMA page verdict uses: high-cadence sprint running
        // >= 150% of the player's 14-day training-only baseline = acute:chronic spike.
        const spikes = players.filter((p) => (p.sprint_vs_baseline_pct ?? 0) >= 150).map((p) => p.full_name);
        const shownDate = j.date ?? null;
        const stale = !!(j.requestedDate && shownDate && shownDate !== j.requestedDate);
        setState({ spikes, evaluated: players.length, shownDate, stale });
      } catch { /* supplementary — fail silent, the Load strip still stands */ }
    })();
    return () => { alive = false; };
  }, [date, is]);

  if (!state || state.evaluated === 0) return null;

  const dateNote = state.stale && state.shownDate
    ? ` (${new Date(`${state.shownDate}T00:00:00`).toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" })})`
    : "";

  const spiking = state.spikes.length > 0;
  const names = state.spikes.slice(0, 3).map((n) => n.split(" ")[0]).join(", ")
    + (state.spikes.length > 3 ? ` +${state.spikes.length - 3}` : "");
  const tone = spiking ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-emerald-100 text-emerald-800 border-emerald-200";
  const label = spiking ? (is ? "Spike" : "Spiking") : (is ? "Í lagi" : "In range");
  // "today" on a real session; "last session (29 Jun)" when it fell back.
  const when = state.stale
    ? (is ? `síðustu session${dateNote}` : `last session${dateNote}`)
    : (is ? "í dag" : "today");
  const sentence = spiking
    ? (is
        ? `${state.spikes.length} ${state.spikes.length === 1 ? "hljóp" : "hlupu"} mun meira háákefðar en venjulega ${when} — ${names}`
        : `${state.spikes.length} did much more high-intensity running than usual ${when} — ${names}`)
    : (is
        ? `Háákefðar hlaup innan venju hjá öllum ${when}`
        : `High-intensity running within range across the squad ${when}`);

  return (
    <a
      href="/coach/ima-intelligence"
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      title={is
        ? "IMA = drifið (hröðun/hemlun, háákefðar átak), fylgir GPS-vélinni. Reglur ákveða — ekki AI · smelltu fyrir IMA Intelligence"
        : "IMA = the driver (accel/decel, high-intensity efforts) to the GPS engine. Rules decide — not AI · open IMA Intelligence"}
    >
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{sentence}</span>
      {spiking && (
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {state.spikes.length} {is ? "athygli" : "to watch"}
        </span>
      )}
      <span className="shrink-0 text-[11px] font-medium text-indigo-600">{is ? "IMA →" : "IMA →"}</span>
    </a>
  );
}
