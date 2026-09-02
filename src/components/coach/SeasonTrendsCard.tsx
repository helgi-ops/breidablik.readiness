"use client";

/**
 * Season HSR + IMA trends — surfacing already-synced load (seasonTrends engine).
 * Verdict → 2–3 facts → Show details (raw series). SESSION/match totals, clearly not a
 * peak window. Descriptive — never the readiness colour. EN default, IS toggle.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Bi = { en: string; is: string };
type Point = { date: string; value: number };
type MetricTrend = { series: Point[]; rollingMean: number | null; latest: number | null; trend: "up" | "flat" | "down" };
type Direction = { forward: number; backward: number; lateral: number; archetype: Bi | null };
type Trends = {
  scope: "match" | "all"; n: number;
  hsr: MetricTrend | null; imaDensity: MetricTrend | null; direction: Direction | null;
  verdict: Bi; facts: Bi[]; confidence: "high" | "medium" | "low";
};

function Sparkline({ series, color }: { series: Point[]; color: string }) {
  if (series.length < 2) return null;
  const W = 240, H = 44, pad = 3;
  const vals = series.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = series.map((p, i) => {
    const x = pad + (i / (series.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((p.value - min) / span) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={pad + (W - 2 * pad)} cy={H - pad - ((series[series.length - 1].value - min) / span) * (H - 2 * pad)} r="2.5" fill={color} />
    </svg>
  );
}

const ARROW: Record<"up" | "flat" | "down", string> = { up: "↑", flat: "→", down: "↓" };

export default function SeasonTrendsCard({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [t, setT] = React.useState<Trends | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!playerId) return;
    let alive = true;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
        const res = await fetch(`/api/coach/player/${playerId}/season-trends`, { headers: { Authorization: `Bearer ${tok ?? ""}` } });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j.error ?? "Failed");
        if (alive) setT(j.trends as Trends);
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : "Failed"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{is ? "Hleð…" : "Loading…"}</div>;
  if (err) return null;
  if (!t || (!t.hsr && !t.direction)) return null;

  const dir = t.direction;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-900">{is ? "Leiktímabils-þróun (háhraði + IMA)" : "Season trend (HSR + IMA)"}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">{is ? "per leik/æfingu" : "per session"}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{is ? "vissa" : "conf"}: {t.confidence}</span>
      </div>

      <p className="mt-2 text-sm font-medium text-slate-900">{is ? t.verdict.is : t.verdict.en}</p>
      <ul className="mt-2 space-y-1">
        {t.facts.map((f, i) => <li key={i} className="text-[13px] text-slate-700">• {is ? f.is : f.en}</li>)}
      </ul>

      {dir && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Hreyfi-blanda" : "Movement mix"}{dir.archetype ? ` · ${is ? dir.archetype.is : dir.archetype.en}` : ""}</div>
          <div className="mt-1 flex h-3 w-full overflow-hidden rounded-full">
            <span className="bg-emerald-500" style={{ width: `${Math.round(dir.forward * 100)}%` }} title={is ? "fram" : "forward"} />
            <span className="bg-amber-500" style={{ width: `${Math.round(dir.lateral * 100)}%` }} title={is ? "til hliðar" : "lateral"} />
            <span className="bg-slate-400" style={{ width: `${Math.round(dir.backward * 100)}%` }} title={is ? "aftur" : "backward"} />
          </div>
          <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
            <span>🟢 {Math.round(dir.forward * 100)}% {is ? "fram" : "fwd"}</span>
            <span>🟡 {Math.round(dir.lateral * 100)}% {is ? "hlið" : "lat"}</span>
            <span>⚪ {Math.round(dir.backward * 100)}% {is ? "aftur" : "back"}</span>
          </div>
        </div>
      )}

      <button onClick={() => setOpen((s) => !s)} className="mt-3 text-xs font-medium text-[#2740e6] hover:underline">
        {open ? (is ? "Fela smáatriði" : "Hide details") : (is ? "Sýna smáatriði" : "Show details")}
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
          {t.hsr && (
            <div>
              <div className="text-[11px] text-slate-500">{is ? "Háhraði (>19,8 km/klst) per leik/æfingu" : "HSR (>19.8 km/h) per session"} — {ARROW[t.hsr.trend]} {is ? "nýjast" : "latest"} {t.hsr.latest} m · {is ? "hlaupandi" : "rolling"} {t.hsr.rollingMean} m</div>
              <Sparkline series={t.hsr.series} color="#2740e6" />
            </div>
          )}
          {t.imaDensity && (
            <div>
              <div className="text-[11px] text-slate-500">{is ? "Hröðun/hraðaminnkun /mín" : "Accel/decel /min"} — {ARROW[t.imaDensity.trend]} {is ? "nýjast" : "latest"} {t.imaDensity.latest} · {is ? "hlaupandi" : "rolling"} {t.imaDensity.rollingMean}</div>
              <Sparkline series={t.imaDensity.series} color="#de9328" />
            </div>
          )}
          <p className="text-[10px] text-slate-400">{is ? "Per leik/æfingu heildir úr sjálfvirku Catapult-samstillingunni — ekki peak-gluggi. Lýsandi; breytir aldrei readiness-dómnum." : "Per-session totals from the automatic Catapult sync — not a peak window. Descriptive; never changes the readiness verdict."}</p>
        </div>
      )}
    </div>
  );
}
