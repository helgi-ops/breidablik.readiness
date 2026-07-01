"use client";

/**
 * ImaVerdictStrip — the Driver-axis companion to the LoadVerdictCard strip
 * (Engine axis). GPS = engine, IMA = driver (Niklas Virtanen). One plain line
 * summarising today's high-intensity movement vs each player's own baseline,
 * linking to the IMA Intelligence page — the exact mirror of the "Load →" strip
 * that links to Load Intelligence.
 *
 * Rules decide, not AI. Self-hides when there is no IMA session captured today
 * (IMA is a per-session movement signal — nothing to summarise on a rest day).
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type ImaPlayer = { full_name: string; sprint_vs_baseline_pct: number | null; total_strides: number };
type ImaResp = { profile?: { per_player?: ImaPlayer[] } };

export default function ImaVerdictStrip({ lang, date }: { lang?: "IS" | "EN"; date?: string }) {
  const is = lang === "IS";
  const [state, setState] = useState<{ spikes: string[]; evaluated: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(
          `/api/coach/team/ima-day-profile?${date ? `date=${date}&` : ""}lang=${is ? "IS" : "EN"}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!alive || !res.ok) return;
        const j = (await res.json()) as ImaResp;
        const players = (j.profile?.per_player ?? []).filter((p) => p.total_strides > 0);
        // Same threshold the IMA page verdict uses: high-cadence sprint running
        // >= 150% of the player's 14-day training-only baseline = acute:chronic spike.
        const spikes = players.filter((p) => (p.sprint_vs_baseline_pct ?? 0) >= 150).map((p) => p.full_name);
        setState({ spikes, evaluated: players.length });
      } catch { /* supplementary — fail silent, the Load strip still stands */ }
    })();
    return () => { alive = false; };
  }, [date, is]);

  if (!state || state.evaluated === 0) return null;

  const spiking = state.spikes.length > 0;
  const names = state.spikes.slice(0, 3).map((n) => n.split(" ")[0]).join(", ")
    + (state.spikes.length > 3 ? ` +${state.spikes.length - 3}` : "");
  const tone = spiking ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-emerald-100 text-emerald-800 border-emerald-200";
  const label = spiking ? (is ? "Spike" : "Spiking") : (is ? "Í lagi" : "In range");
  const sentence = spiking
    ? (is
        ? `${state.spikes.length} ${state.spikes.length === 1 ? "hljóp" : "hlupu"} mun meira háákefðar en venjulega í dag — ${names}`
        : `${state.spikes.length} did much more high-intensity running than usual today — ${names}`)
    : (is
        ? "Háákefðar hlaup innan venju hjá öllum í dag"
        : "High-intensity running within range across the squad today");

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
