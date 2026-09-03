"use client";

/**
 * Season HSR trend — how much high-speed running (>19.8 km/h) the player does per match over the
 * season, with a rolling average. HSR ONLY: the IMA half (accel/decel density + movement shape)
 * lives in the Season IMA card, so this card doesn't duplicate it. Verdict → one fact → a clearly
 * LABELLED chart (dots = matches, oldest→newest; line = rolling average). Per-session/match totals,
 * not a peak window. Descriptive — never the readiness colour. EN default, IS toggle.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Bi = { en: string; is: string };
type Point = { date: string; value: number };
type MetricTrend = { series: Point[]; rollingMean: number | null; latest: number | null; trend: "up" | "flat" | "down" };
type Trends = { hsr: MetricTrend | null; confidence: "high" | "medium" | "low" };

const ARROW: Record<"up" | "flat" | "down", string> = { up: "↑", flat: "→", down: "↓" };
function shortDate(iso: string, is: boolean): string {
  try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); }
  catch { return iso; }
}
function rolling(vals: number[], k = 5): number[] {
  return vals.map((_, i) => { const s = vals.slice(Math.max(0, i - k + 1), i + 1); return s.reduce((a, b) => a + b, 0) / s.length; });
}

/** Labelled trend chart: ONE BAR PER MATCH (easy to read a single match) + a thin rolling-average
 *  line over the bar tops so the trend still reads. Value scale (max) + date range shown; hover a
 *  bar for its match + metres. */
function HsrChart({ series, is }: { series: Point[]; is: boolean }) {
  if (series.length < 2) return null;
  const W = 320, H = 96, padL = 4, padR = 4, padT = 8, padB = 16, plotH = H - padT - padB;
  const raw = series.map((p) => p.value);
  const roll = rolling(raw);
  const max = Math.max(...raw, ...roll) || 1;
  const slot = (W - padL - padR) / series.length;
  const bw = Math.max(2, slot * 0.6);
  const xc = (i: number) => padL + slot * i + slot / 2;
  const yTop = (v: number) => H - padB - (v / max) * plotH;
  const rollPts = roll.map((v, i) => `${xc(i).toFixed(1)},${yTop(v).toFixed(1)}`).join(" ");
  return (
    <div>
      <div className="flex justify-between text-[9px] text-slate-400"><span>{Math.round(max)} m</span><span>{is ? "hærra = meiri háhraði" : "higher = more HSR"}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none">
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#e2e8f0" strokeWidth="1" />
        {raw.map((v, i) => (
          <rect key={i} x={xc(i) - bw / 2} y={yTop(v)} width={bw} height={Math.max(0, H - padB - yTop(v))} rx="1" fill="#2740e6" opacity={i === series.length - 1 ? 0.9 : 0.45}>
            <title>{`${shortDate(series[i].date, is)}: ${Math.round(v)} m`}</title>
          </rect>
        ))}
        <polyline points={rollPts} fill="none" stroke="#2740e6" strokeWidth="1.5" opacity="0.9" />
      </svg>
      <div className="flex justify-between text-[9px] text-slate-400">
        <span>{shortDate(series[0].date, is)}</span>
        <span>{is ? "hver súla = einn leikur · lína = hlaupandi meðaltal" : "each bar = one match · line = rolling average"}</span>
        <span>{shortDate(series[series.length - 1].date, is)}</span>
      </div>
    </div>
  );
}

export default function SeasonTrendsCard({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [t, setT] = React.useState<Trends | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!playerId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
        const res = await fetch(`/api/coach/player/${playerId}/season-trends`, { headers: { Authorization: `Bearer ${tok ?? ""}` } });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error("failed");
        if (alive) setT(j.trends as Trends);
      } catch { if (alive) setT(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{is ? "Hleð…" : "Loading…"}</div>;
  if (!t || !t.hsr || t.hsr.latest == null) return null;

  const hsr = t.hsr;
  const verdict: Bi = hsr.trend === "down"
    ? { en: "His high-speed running has drifted down over recent matches.", is: "Háhraðahlaup hans hefur lækkað síðustu leiki." }
    : hsr.trend === "up"
      ? { en: "His high-speed running is trending up over recent matches.", is: "Háhraðahlaup hans er hækkandi síðustu leiki." }
      : { en: "His high-speed running is steady over recent matches.", is: "Háhraðahlaup hans er stöðugt síðustu leiki." };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-900">{is ? "Leiktímabils-þróun háhraða" : "Season HSR trend"}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">{is ? "per leik" : "per match"}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{is ? "vissa" : "conf"}: {t.confidence}</span>
      </div>

      <p className="mt-2 text-sm font-medium text-slate-900">{ARROW[hsr.trend]} {is ? verdict.is : verdict.en}</p>
      <p className="mt-1 text-[13px] text-slate-700">
        {is
          ? `Síðasti leikur: ${hsr.latest} m af háhraðahlaupi (>19,8 km/klst). Venjulega ~${hsr.rollingMean} m.`
          : `Latest match: ${hsr.latest} m of high-speed running (>19.8 km/h). Usually ~${hsr.rollingMean} m.`}
      </p>

      <button onClick={() => setOpen((s) => !s)} className="mt-3 text-xs font-medium text-[#2740e6] hover:underline">
        {open ? (is ? "Fela graf" : "Hide chart") : (is ? "Sýna graf" : "Show chart")}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-slate-50 p-3">
          <HsrChart series={hsr.series} is={is} />
          <p className="mt-2 text-[10px] text-slate-400">{is ? "Metrar háhraðahlaups (>19,8 km/klst) per leik úr sjálfvirku Catapult-samstillingunni — ekki peak-gluggi. IMA (hröðun/hreyfing) er á „Season IMA“ kortinu. Lýsandi; breytir aldrei readiness-dómnum." : "Metres of high-speed running (>19.8 km/h) per match from the automatic Catapult sync — not a peak window. IMA (accel/movement) is on the “Season IMA” card. Descriptive; never changes the readiness verdict."}</p>
        </div>
      )}
    </div>
  );
}
