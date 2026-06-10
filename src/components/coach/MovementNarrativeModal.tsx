"use client";

/**
 * MovementNarrativeModal — per-player "movement narrative" (Unfamiliar Load,
 * Phase 4). Tells the story of how a player has been moving over the last ~4
 * weeks in the Engine (GPS capacity/volume) vs Driver (IMA movement quality)
 * framing, each metric vs his own prior norm, with a sparkline. Opened from the
 * Attention Router card. Explainability-first: a plain-language verdict on top;
 * the z-scores sit beside each metric as drill-down.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Metric = { label: string; recent: number | null; mean: number | null; sd: number | null; z: number | null; n: number; trend: number[] };
type DriverComp = { key: string; label: string; isShare: boolean; recent: number | null; mean: number | null; sd: number | null; z: number | null; n: number; flagged: boolean; trend: number[] };
type Resp = {
  ok: boolean; name: string | null; position: string | null; refDate?: string; sessions: number;
  baselineDays?: number; calibrating?: boolean; driftType?: string;
  engine: { totalDistance: Metric; hsr: Metric; sprint: Metric } | null;
  driver: { components: DriverComp[]; totalDistanceZ: number | null } | null;
  narrative: { engineLine: string; driverLine: string; summary: string; suggestedAction: string | null; counterfactual: string | null } | null;
  error?: string;
};

const IS = (lang?: string) => (lang ?? "").toUpperCase() === "IS";

// Inline sparkline — no chart lib. Oldest→newest, scaled to the box.
function Spark({ values, flag }: { values: number[]; flag?: boolean }) {
  if (!values || values.length < 2) return <span className="text-[10px] text-slate-300">—</span>;
  const w = 80, h = 22, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / span) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = values[values.length - 1];
  const lx = w - pad, ly = h - pad - ((last - min) / span) * (h - 2 * pad);
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={flag ? "#e11d48" : "#6366f1"} strokeWidth="1.5" />
      <circle cx={lx} cy={ly} r="2" fill={flag ? "#e11d48" : "#6366f1"} />
    </svg>
  );
}

function zChip(z: number | null) {
  if (z == null) return <span className="text-[10px] text-slate-400">—</span>;
  const tint = Math.abs(z) >= 2 ? "bg-rose-100 text-rose-700" : Math.abs(z) >= 1 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tint}`}>{z > 0 ? "+" : ""}{z} SD</span>;
}

export default function MovementNarrativeModal({ playerId, lang, onClose }: { playerId: string; lang?: string; onClose: () => void }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/coach/player/${playerId}/movement-narrative`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = (await res.json()) as Resp;
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setData(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [playerId]);
  useEffect(() => { void load(); }, [load]);

  const fmt = (n: number | null, share = false) => n == null ? "—" : (share ? n.toFixed(3) : Math.round(n).toLocaleString("en-US"));

  const metricRow = (m: Metric | DriverComp, share = false) => (
    <div className="flex items-center gap-2 border-t border-slate-100 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate-800">{m.label}</div>
        <div className="text-[10px] text-slate-500">
          {IS(lang) ? "nýlegt" : "recent"} <span className="font-semibold text-slate-700">{fmt(m.recent, share)}</span> · {IS(lang) ? "venjulega" : "usual"} {fmt(m.mean, share)}{m.sd != null ? `±${fmt(m.sd, share)}` : ""}
        </div>
      </div>
      <Spark values={m.trend} flag={"flagged" in m ? m.flagged : (m.z != null && Math.abs(m.z) >= 1)} />
      <div className="w-14 text-right">{zChip(m.z)}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{IS(lang) ? "Hreyfi-prófíll" : "Movement profile"}{data?.name ? ` — ${data.name}` : ""}</h3>
            <p className="text-[11px] text-slate-500">
              {IS(lang) ? "Hvernig hann hefur hreyft sig vs sitt eigið norm" : "How he's been moving vs his own norm"}
              {data?.position ? ` · ${data.position}` : ""}{data?.sessions ? ` · ${data.sessions} ${IS(lang) ? "æfingar" : "sessions"}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>

        {loading && <div className="py-8 text-center text-sm text-slate-500">{IS(lang) ? "Hleð…" : "Loading…"}</div>}
        {err && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        {data && !loading && (!data.engine || !data.driver) && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
            {IS(lang) ? "Ekki næg hlaupagögn enn til að byggja hreyfi-prófíl." : "Not enough running data yet to build a movement profile."}
          </div>
        )}

        {data?.narrative && data.engine && data.driver && (
          <>
            {/* One-sentence verdict */}
            <div className="mb-3 rounded-lg border-l-4 border-indigo-400 bg-indigo-50/50 px-3 py-2 text-sm font-medium text-slate-800">
              {data.narrative.summary}
            </div>

            {/* Engine */}
            <div className="mb-3 rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-800">Engine</span>
                <span className="text-[11px] text-slate-500">{IS(lang) ? "GPS — geta / rúmmál" : "GPS — capacity / volume"}</span>
              </div>
              <p className="mb-1 text-[12px] text-slate-700">{data.narrative.engineLine}</p>
              {metricRow(data.engine.totalDistance)}
              {metricRow(data.engine.hsr)}
              {metricRow(data.engine.sprint)}
            </div>

            {/* Driver */}
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-800">Driver</span>
                <span className="text-[11px] text-slate-500">{IS(lang) ? "IMA — hreyfigæði / hegðun" : "IMA — movement quality / behaviour"}</span>
              </div>
              <p className="mb-1 text-[12px] text-slate-700">{data.narrative.driverLine}</p>
              {data.driver.components.map((c) => <div key={c.key}>{metricRow(c, c.isShare)}</div>)}
              {data.narrative.suggestedAction && (
                <p className="mt-2 text-[12px] text-slate-700"><span className="font-semibold">{IS(lang) ? "Tillaga: " : "Suggested: "}</span>{data.narrative.suggestedAction}</p>
              )}
            </div>

            <p className="mt-3 text-[10px] leading-snug text-slate-400">
              {IS(lang)
                ? "Engine = GPS geta/rúmmál; Driver = IMA hreyfigæði. Hvert mæligildi borið saman við leikmannsins eigið fyrra norm. Lýsandi, ekki meiðslaspá."
                : "Engine = GPS capacity/volume; Driver = IMA movement quality. Each metric vs the player's own prior norm. Descriptive, not injury-predictive."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
