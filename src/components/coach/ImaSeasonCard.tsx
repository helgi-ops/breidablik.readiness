"use client";

/**
 * Season IMA graph — the "IMA half" of the season load read, in detail.
 *
 *   (1) Accel/decel DENSITY over the season (efforts per minute) as a line with a
 *       rolling-mean line and a trend arrow — the "how much braking / re-accelerating".
 *   (2) Movement SHAPE over the season — forward / backward / lateral share as a stacked
 *       area, from the IMA clock, using the same classifier as the aggregate mix.
 *
 * Read alongside the HSR trend (SeasonTrendsCard): forward + high HSR = attacking output;
 * backward + high accel/decel = defensive-transition load (the Ju "covering / recovery-run"
 * signature, approximated from Catapult alone). Density reads for Core (accel_decel_efforts)
 * too; the directional panel needs the IMA clock, so it hides when no clock is present.
 *
 * SESSION/match totals — NOT a peak window. Descriptive; never the readiness colour. EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Bi = { en: string; is: string };
type Point = { date: string; value: number };
type MetricTrend = { series: Point[]; rollingMean: number | null; latest: number | null; trend: "up" | "flat" | "down" };
type DirectionRead = { forward: number; backward: number; lateral: number; archetype: Bi | null };
type DirectionPoint = { date: string; forward: number; backward: number; lateral: number };
type Trends = {
  imaDensity: MetricTrend | null;
  direction: DirectionRead | null;
  directionSeries: DirectionPoint[];
  confidence: "high" | "medium" | "low";
};

// Direction colours (design tokens): forward = cobalt, backward = amber, lateral = muted slate.
const FWD = "#2740e6", BWD = "#de9328", LAT = "#94a3b8";
const ARROW: Record<"up" | "flat" | "down", string> = { up: "↑", flat: "→", down: "↓" };

/** Trailing rolling mean (presentation-only smoothing for the density line). */
function rolling(vals: number[], k = 5): number[] {
  return vals.map((_, i) => {
    const s = vals.slice(Math.max(0, i - k + 1), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
}

/** Density line: faint raw dots + an emphasised rolling-mean line. */
function DensityChart({ series }: { series: Point[] }) {
  const W = 320, H = 90, pad = 6;
  const raw = series.map((p) => p.value);
  const roll = rolling(raw);
  const all = [...raw, ...roll];
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const x = (i: number) => pad + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const rollPts = roll.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none" aria-hidden>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e2e8f0" strokeWidth="1" />
      {raw.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="1.6" fill={BWD} opacity="0.35" />)}
      <polyline points={rollPts} fill="none" stroke={BWD} strokeWidth="2" />
      <circle cx={x(series.length - 1)} cy={y(roll[roll.length - 1])} r="3" fill={BWD} />
    </svg>
  );
}

/** Stacked area of forward/lateral/backward share over time (bands sum to full height). */
function ShapeArea({ pts }: { pts: DirectionPoint[] }) {
  const W = 320, H = 96;
  const n = pts.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const yFrom = (cum: number) => (H * (1 - cum)).toFixed(1);
  // Cumulative boundaries, baseline (0) → forward → +lateral → +backward (~1).
  const cumF = pts.map((p) => p.forward);
  const cumL = pts.map((p) => p.forward + p.lateral);
  const cumB = pts.map((p) => p.forward + p.lateral + p.backward);
  const band = (lower: number[], upper: number[]) => {
    const top = upper.map((c, i) => `${x(i).toFixed(1)},${yFrom(c)}`);
    const bot = lower.map((c, i) => `${x(i).toFixed(1)},${yFrom(c)}`).reverse();
    return `M ${top.join(" L ")} L ${bot.join(" L ")} Z`;
  };
  const zeros = pts.map(() => 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={band(zeros, cumF)} fill={FWD} opacity="0.85" />
      <path d={band(cumF, cumL)} fill={LAT} opacity="0.7" />
      <path d={band(cumL, cumB)} fill={BWD} opacity="0.85" />
    </svg>
  );
}

/** Single composition bar when there's only one block of clock data (not enough for an area). */
function ShapeBar({ d, is }: { d: DirectionRead; is: boolean }) {
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        <span style={{ width: `${Math.round(d.forward * 100)}%`, background: FWD }} title={is ? "fram" : "forward"} />
        <span style={{ width: `${Math.round(d.lateral * 100)}%`, background: LAT }} title={is ? "hlið" : "lateral"} />
        <span style={{ width: `${Math.round(d.backward * 100)}%`, background: BWD }} title={is ? "aftur" : "backward"} />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">{is ? "Aðeins eitt gagnatímabil enn — sýni heildar-blöndu, ekki þróun." : "Only one block of data so far — showing the overall mix, not a trend."}</p>
    </div>
  );
}

const DENSITY_TREND: Record<"up" | "flat" | "down", Bi> = {
  up: { en: "trending up", is: "hækkandi" },
  flat: { en: "steady", is: "stöðugt" },
  down: { en: "trending down", is: "lækkandi" },
};

export default function ImaSeasonCard({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [t, setT] = React.useState<Trends | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [err, setErr] = React.useState(false);

  React.useEffect(() => {
    if (!playerId) return;
    let alive = true;
    (async () => {
      setLoading(true); setErr(false);
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
        const res = await fetch(`/api/coach/player/${playerId}/season-trends`, { headers: { Authorization: `Bearer ${tok ?? ""}` } });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error("failed");
        if (alive) setT(j.trends as Trends);
      } catch { if (alive) setErr(true); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{is ? "Hleð…" : "Loading…"}</div>;
  if (err || !t) return null;

  const density = t.imaDensity && t.imaDensity.series.length >= 2 ? t.imaDensity : null;
  const series = t.directionSeries ?? [];
  const hasArea = series.length >= 2;
  const hasBar = !hasArea && !!t.direction;
  const hasDirection = hasArea || hasBar;
  if (!density && !hasDirection) return null; // nothing to graph — stay silent

  // Dominant direction (latest area point, else the aggregate) → tactical read.
  const latest = hasArea ? series[series.length - 1] : t.direction ? { forward: t.direction.forward, backward: t.direction.backward, lateral: t.direction.lateral } : null;
  const domKey = latest
    ? (latest.forward >= latest.backward && latest.forward >= latest.lateral ? "forward"
      : latest.lateral >= latest.forward && latest.lateral >= latest.backward ? "lateral" : "backward")
    : null;
  const domPhrase: Bi | null = domKey === "forward" ? { en: "forward-dominant (attacking drive)", is: "fram-drifið (sóknar-þungi)" }
    : domKey === "lateral" ? { en: "multidirectional (covering / cutting)", is: "fjöl-átta (þekja / skurðir)" }
    : domKey === "backward" ? { en: "backward-leaning (defensive transition)", is: "aftur-drifið (varnar-umskipti)" } : null;

  const dTrend = density ? DENSITY_TREND[density.trend] : null;
  const verdict: Bi = {
    en: `${dTrend ? `Accel/decel load ${dTrend.en}` : "Movement shape"}${domPhrase ? `; movement is ${domPhrase.en}` : ""} this block.`,
    is: `${dTrend ? `Hröðun/hraðaminnkun ${dTrend.is}` : "Hreyfimynstur"}${domPhrase ? `; hreyfing er ${domPhrase.is}` : ""} þetta tímabil.`,
  };

  const facts: Bi[] = [];
  if (density) facts.push({
    en: `Accel/decel density: ${density.latest}/min latest, ~${density.rollingMean}/min rolling (${dTrend!.en}).`,
    is: `Hröðunar/hraðaminnkunar-þéttleiki: ${density.latest}/mín nýjast, ~${density.rollingMean}/mín hlaupandi (${dTrend!.is}).`,
  });
  if (latest) facts.push({
    en: `Movement shape now: ${Math.round(latest.forward * 100)}% forward · ${Math.round(latest.lateral * 100)}% lateral · ${Math.round(latest.backward * 100)}% backward.`,
    is: `Hreyfimynstur núna: ${Math.round(latest.forward * 100)}% fram · ${Math.round(latest.lateral * 100)}% hlið · ${Math.round(latest.backward * 100)}% aftur.`,
  });
  if (domKey === "backward") facts.push({ en: "Backward-leaning shape = recovery-running / covering load (defensive transition).", is: "Aftur-drifið mynstur = endurheimtar-hlaup / þekju-álag (varnar-umskipti)." });
  else if (domKey === "forward") facts.push({ en: "Forward-dominant shape = attacking drive / pressing forward.", is: "Fram-drifið mynstur = sóknar-þungi / pressa fram." });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-900">{is ? "IMA yfir tímabilið" : "Season IMA"}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">{is ? "per leik/æfingu" : "per session"}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{is ? "vissa" : "conf"}: {t.confidence}</span>
      </div>

      <p className="mt-2 text-sm font-medium text-slate-900">{is ? verdict.is : verdict.en}</p>
      <ul className="mt-2 space-y-1">
        {facts.map((f, i) => <li key={i} className="text-[13px] text-slate-700">• {is ? f.is : f.en}</li>)}
      </ul>

      {density && (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span>{is ? "Hröðun/hraðaminnkun (á mín)" : "Accel/decel density (per min)"}</span>
            <span className="ml-auto normal-case text-slate-500">{ARROW[density.trend]} {is ? "nýjast" : "latest"} {density.latest} · {is ? "hlaupandi" : "rolling"} {density.rollingMean}</span>
          </div>
          <DensityChart series={density.series} />
        </div>
      )}

      {hasDirection && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Hreyfimynstur yfir tímabilið" : "Movement shape over the season"}</div>
          <div className="mt-1">
            {hasArea ? <ShapeArea pts={series} /> : t.direction ? <ShapeBar d={t.direction} is={is} /> : null}
          </div>
          <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: FWD }} />{is ? "Fram" : "Forward"}</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: LAT }} />{is ? "Hlið" : "Lateral"}</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: BWD }} />{is ? "Aftur" : "Backward"}</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        {is
          ? "Lesið með háhraða-þróuninni að ofan: fram + mikill háhraði = sóknar-afköst; aftur + mikil hröðun/hraðaminnkun = varnar-umskipta-álag."
          : "Read alongside the HSR trend above: forward + high HSR = attacking output; backward + high accel/decel = defensive-transition load."}
      </p>

      <button onClick={() => setOpen((s) => !s)} className="mt-2 text-xs font-medium text-[#2740e6] hover:underline">
        {open ? (is ? "Fela smáatriði" : "Hide details") : (is ? "Sýna smáatriði" : "Show details")}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
          {density && (
            <div className="max-h-40 overflow-auto">
              <table className="w-full text-[11px] text-slate-600">
                <thead><tr className="text-left text-slate-400"><th className="pr-3 font-medium">{is ? "Dags" : "Date"}</th><th className="font-medium">{is ? "Þéttleiki /mín" : "Density /min"}</th></tr></thead>
                <tbody>{density.series.slice().reverse().map((p) => <tr key={p.date}><td className="pr-3">{p.date}</td><td>{p.value}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {t.direction && (
            <p className="text-[11px] text-slate-500">{is ? "Heildar-blanda tímabils" : "Season aggregate mix"}: {Math.round(t.direction.forward * 100)}% {is ? "fram" : "fwd"} · {Math.round(t.direction.lateral * 100)}% {is ? "hlið" : "lat"} · {Math.round(t.direction.backward * 100)}% {is ? "aftur" : "back"}{t.direction.archetype ? ` · ${is ? t.direction.archetype.is : t.direction.archetype.en}` : ""}.</p>
          )}
          <p className="text-[10px] text-slate-400">{is ? "Stefnu-blanda úr IMA-klukkunni (12 áttir → fram/hlið/aftur), sami flokkari og hreyfi-fingrafarið. Per leik/æfingu heildir — ekki peak-gluggi. Lýsandi; breytir aldrei readiness-dómnum." : "Direction from the IMA clock (12 positions → forward/lateral/backward), the same classifier as the movement signature. Per-session totals — not a peak window. Descriptive; never changes the readiness verdict."}</p>
        </div>
      )}
    </div>
  );
}
