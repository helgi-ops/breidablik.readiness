"use client";

/**
 * Power-curve card — the ADI peak-period read. Renders a player's power curve (peak value
 * vs rolling window) from player_load_peak_period: his season-best curve per metric, with the
 * latest session overlaid, plus the Explosive/Engine/Under-conditioned shape chip. Includes a
 * Catapult peak-period export uploader (the feed that populates the table). Empty until an
 * export is imported. Descriptive load context — never touches readiness. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import type { PeakPeriodRead, PowerCurve } from "@/lib/micropulse/load/peakPeriod";
import type { CurveShape, CurveShapeRead } from "@/lib/micropulse/load/curveShape";

type Resp = {
  ok: boolean; hasData: boolean; name: string | null;
  peakPeriod?: PeakPeriodRead; shapes?: Record<string, CurveShapeRead>;
};

const METRIC_LABEL: Record<string, { en: string; is: string }> = {
  player_load: { en: "PlayerLoad", is: "PlayerLoad" },
  hsr: { en: "High-speed running", is: "Háhraðahlaup" },
  metabolic_power: { en: "Metabolic power", is: "Efnaskiptaafl" },
  accel_density: { en: "Acceleration density", is: "Hröðunar-þéttleiki" },
  speed: { en: "Speed", is: "Hraði" },
  distance: { en: "Distance", is: "Vegalengd" },
};
const metricLabel = (m: string, is: boolean) => (METRIC_LABEL[m] ? (is ? METRIC_LABEL[m].is : METRIC_LABEL[m].en) : m);

const SHAPE_LABEL: Record<CurveShape, { en: string; is: string; tone: string }> = {
  explosive: { en: "Explosive", is: "Explosive", tone: "bg-rose-100 text-rose-700" },
  engine: { en: "Engine", is: "Engine", tone: "bg-emerald-100 text-emerald-700" },
  balanced: { en: "Balanced", is: "Jafnvægi", tone: "bg-slate-100 text-slate-700" },
  under_conditioned: { en: "Under-conditioned", is: "Under-conditioned", tone: "bg-amber-100 text-amber-800" },
  insufficient: { en: "—", is: "—", tone: "bg-slate-100 text-slate-400" },
};

const fmtWin = (m: number): string => (m < 1 ? `${Math.round(m * 60)}s` : `${m % 1 === 0 ? m : m.toFixed(1)}m`);
const fmtWinWord = (m: number, is: boolean): string => (m < 1 ? `${Math.round(m * 60)}${is ? " sek" : "s"}` : `${m % 1 === 0 ? m : m.toFixed(1)}${is ? " mín" : "-min"}`);
const fmt = (v: number | null | undefined, d = 1): string => (v == null ? "–" : v.toFixed(d));

/**
 * Plain-language, coach-usable read of a curve shape: what kind of runner he is (headline),
 * the "why" with his own numbers (meaning), and what to do with it (action). Explainability-first
 * — this leads the card so a non-S&C coach gets the point without touching the chart.
 */
function plainRead(shape: CurveShapeRead, name: string, unit: string, is: boolean): { headline: string; meaning: string; action: string } | null {
  if (shape.shape === "insufficient" || shape.shortValue == null || shape.longValue == null || shape.retentionPct == null) return null;
  const who = name || (is ? "Leikmaðurinn" : "This player");
  const u = unit || (is ? "m/mín" : "m/min");
  const shortW = shape.shortWindowMin != null ? fmtWinWord(shape.shortWindowMin, is) : (is ? "stutt" : "short");
  const longW = shape.longWindowMin != null ? fmtWinWord(shape.longWindowMin, is) : (is ? "langt" : "long");
  const shortV = Math.round(shape.shortValue), longV = Math.round(shape.longValue), ret = shape.retentionPct;
  const squad = shape.longPercentile != null
    ? (is ? ` Það úthaldsstig er ${shape.longPercentile >= 50 ? "yfir" : "undir"} miðgildi liðsins.` : ` That sustained level is ${shape.longPercentile >= 50 ? "above" : "below"} the squad median.`)
    : "";
  const meaningBase = is
    ? `Hörðustu ${shortW} hljóp hann á ${shortV} ${u}; yfir ${longW} heldur hann enn ${ret}% af því (~${longV} ${u}).`
    : `His hardest ${shortW} ran at ${shortV} ${u}; over ${longW} he still holds ${ret}% of it (~${longV} ${u}).`;

  const copy: Record<string, { headline: string; action: string }> = {
    engine: {
      headline: is ? `${who} er úthalds-hlaupari — ákefðin dettur varla þó átökin lengist.` : `${who} is a sustained-effort runner — his intensity barely drops as efforts get longer.`,
      action: is ? "Nýttu hann þar sem þarf endurtekið há-tempó hlaup; bættu við stuttum snörpum sprettum ef þú vilt meiri topp-kraft." : "Use him where you need repeated high-tempo running; add short sharp sprints if you want more top-end.",
    },
    explosive: {
      headline: is ? `${who} er sprett-týpa — mikil ákefð snemma sem dvínar hratt yfir mínútur.` : `${who} is a short-burst runner — big early intensity that fades fast over minutes.`,
      action: is ? "Frábær í stutt, snörp átök; byggðu endurtekninguna ef hlutverkið krefst viðvarandi hlaups." : "Great for short, sharp efforts; build his repeat-ability if his role needs sustained running.",
    },
    balanced: {
      headline: is ? `${who} er í jafnvægi — engin sterk slagsíða milli spretta og viðvarandi hlaups.` : `${who} is balanced — no strong lean between short bursts and sustained running.`,
      action: is ? "Sveigjanlegur — engin sérstök þjálfunar-slagsíða til að miða á." : "Flexible — no specific conditioning bias to target.",
    },
    under_conditioned: {
      headline: is ? `${who} liggur undir liðinu í öllum átaka-lengdum — þrek-forgangur.` : `${who} sits below the squad at every effort length — a conditioning priority.`,
      action: is ? "Forgangsraðaðu loftháða grunninum — hann dvínar fyrr en jafningjarnir." : "Prioritise his aerobic base — he fades earlier than his peers.",
    },
  };
  const c = copy[shape.shape] ?? copy.balanced;
  return { headline: c.headline, meaning: meaningBase + squad, action: c.action };
}

/** Tiny inline SVG line chart: season-best (solid) + latest (dashed) over the windows. */
function CurveSvg({ best, latest }: { best: PowerCurve; latest: PowerCurve | null }) {
  const W = 320, H = 120, padL = 34, padR = 8, padT = 10, padB = 22;
  const allVals = [...best.points, ...(latest?.points ?? [])].map((p) => p.value).filter((v): v is number => v != null);
  // ORDINAL x-axis: every window evenly spaced by rank (not by value), so a full 5s→15min
  // curve reads like Andrew Gray's chart instead of crushing the short windows at the left.
  const wins = [...new Set([...best.points, ...(latest?.points ?? [])].map((p) => p.windowMin))].sort((a, b) => a - b);
  if (!wins.length || !allVals.length) return null;
  const xIndex = new Map(wins.map((w, i) => [w, wins.length === 1 ? 0.5 : i / (wins.length - 1)]));
  const maxV = Math.max(...allVals);
  const x = (w: number) => padL + (xIndex.get(w) ?? 0.5) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (maxV > 0 ? v / maxV : 0)) * (H - padT - padB);
  const path = (c: PowerCurve) => c.points.filter((p) => p.value != null)
    .sort((a, b) => a.windowMin - b.windowMin)
    .map((p, i) => `${i ? "L" : "M"}${x(p.windowMin).toFixed(1)},${y(p.value!).toFixed(1)}`).join(" ");
  // Thin the tick labels when there are many windows (keep first, last, ~every Nth).
  const step = Math.max(1, Math.ceil(wins.length / 8));
  const showLabel = (i: number) => i === 0 || i === wins.length - 1 || i % step === 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="power curve">
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#e2e8f0" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#e2e8f0" />
      {latest ? <path d={path(latest)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" /> : null}
      <path d={path(best)} fill="none" stroke="#2740e6" strokeWidth="2" />
      {best.points.filter((p) => p.value != null).map((p) => {
        const i = wins.indexOf(p.windowMin);
        return (
          <g key={p.windowMin}>
            <circle cx={x(p.windowMin)} cy={y(p.value!)} r={wins.length > 8 ? 1.8 : 2.5} fill="#2740e6" />
            {showLabel(i) ? <text x={x(p.windowMin)} y={H - padB + 12} textAnchor="middle" fontSize="8" fill="#64748b">{fmtWin(p.windowMin)}</text> : null}
          </g>
        );
      })}
      <text x={padL - 4} y={y(maxV) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">{fmt(maxV)}</text>
    </svg>
  );
}

// ── Uploader ────────────────────────────────────────────────────────────────
function PeakPeriodUpload({ onImported }: { onImported: () => void }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [file, setFile] = React.useState<File | null>(null);
  const [date, setDate] = React.useState("");
  const [busy, setBusy] = React.useState<"" | "preview" | "commit">("");
  const [preview, setPreview] = React.useState<Record<string, unknown> | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  async function send(phase: "preview" | "commit") {
    if (!file) return;
    setBusy(phase); setErr(null);
    try {
      const tok = await token(); if (!tok) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const fd = new FormData();
      fd.set("file", file); fd.set("phase", phase); if (date) fd.set("date", date);
      const res = await fetch("/api/coach/load/peak-period/upload", { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); if (j.warnings?.length) setPreview(j); return; }
      if (phase === "preview") setPreview(j);
      else { setPreview(null); setFile(null); onImported(); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(""); }
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-600">
        <span className="transition-transform group-open:rotate-90">▸</span>
        {is ? "Fullur 5s–15mín ferill — Peak Period útflutningur" : "Full 5s–15min curve — Peak Period export"}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">{is ? "hærri tier" : "higher tier"}</span>
      </summary>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
        {is
          ? "Sjálfvirki syncinn fyllir 1/3/5-mín ferilinn núna. Fullur samfelldur ferill (5s–15mín) þarf OpenField „Peak Period“ fjöl-glugga útflutning — sá er á hærri OpenField-tier. Ef klúbburinn hefur hann: forskoðaðu fyrst (staðfestu glugga/mælikvarða/leikmenn) og flyttu svo inn."
          : "The daily sync fills the 1/3/5-min curve now. A full continuous curve (5s–15min) needs the OpenField \"Peak Period\" multi-window export — that report is on a higher OpenField tier. If your club has it: preview first (confirm windows/metrics/athletes), then import."}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} className="text-[12px]" />
        <label className="text-[11px] text-slate-500">{is ? "Dags. (ef vantar í skrá)" : "Date (if absent in file)"}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-1 rounded border border-slate-300 px-1.5 py-0.5 text-[12px]" />
        </label>
        <button onClick={() => send("preview")} disabled={!file || busy !== ""} className="rounded-lg bg-slate-800 px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">{busy === "preview" ? "…" : (is ? "Forskoða" : "Preview")}</button>
        <button onClick={() => send("commit")} disabled={!preview || busy !== ""} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">{busy === "commit" ? "…" : (is ? "Flytja inn" : "Import")}</button>
      </div>
      {err ? <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p> : null}
      {preview ? (
        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
          <div>{is ? "Greindir dálkar" : "Detected columns"}: <b>{String(preview.detectedColumns ?? 0)}</b> · {is ? "gluggar" : "windows"}: {Array.isArray(preview.windows) ? preview.windows.join(", ") : "—"} · {is ? "mælikvarðar" : "metrics"}: {Array.isArray(preview.metrics) ? preview.metrics.join(", ") : "—"}</div>
          <div>{is ? "Leikmenn: pössuðu" : "Athletes matched"}: <b>{String(preview.athletesMatched ?? 0)}</b>{Array.isArray(preview.athletesUnmatched) && preview.athletesUnmatched.length ? ` · ${is ? "ópössuð" : "unmatched"}: ${preview.athletesUnmatched.join(", ")}` : ""} · {is ? "raðir" : "rows"}: {String(preview.rows ?? 0)}</div>
          {Array.isArray(preview.warnings) && preview.warnings.length ? <div className="mt-1 text-amber-700">{preview.warnings.join(" · ")}</div> : null}
        </div>
      ) : null}
    </details>
  );
}

export default function PeakPeriodCurveCard({ players }: { players: Array<{ id: string; name: string }> }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [sel, setSel] = React.useState("");
  const [metric, setMetric] = React.useState("");
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => { if (!sel && players.length) setSel(players[0].id); }, [players, sel]);

  React.useEffect(() => {
    if (!sel) { setData(null); return; }
    let alive = true; setLoading(true);
    (async () => {
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch(`/api/coach/load/peak-period?player=${sel}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (!alive) return;
        setData(j && j.ok ? j : null);
        setMetric((j?.peakPeriod?.seasonBest?.[0]?.metric) ?? "");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sel, token, reloadKey]);

  const best = data?.peakPeriod?.seasonBest?.find((c) => c.metric === metric) ?? null;
  const latest = data?.peakPeriod?.latest?.curves?.find((c) => c.metric === metric) ?? null;
  const shape = data?.shapes?.[metric] ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Afl-kúrfa (peak period)" : "Power curve (peak period)"}</span>
        <span className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
          title={is ? "Per-mínútu ákefð í hverjum rúllandi glugga (1/3/5 mín úr Catapult MII; víðari ef stillt í OpenField) — ADI-grade lestur." : "Per-minute intensity in each rolling window (1/3/5 min from the Catapult MII feed; wider if configured in OpenField) — the ADI-grade read."}>
          ADI ⓘ
        </span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[13px]">
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <p className="mt-0.5 text-[12px] text-slate-500">
        {is ? "Er hann byggður fyrir stutt snörp átök eða viðvarandi hlaup? — mótar hvernig þú notar og þjálfar hann." : "Is he built for short sharp efforts or sustained running? — shapes how you use and train him."}
      </p>

      <div className="mt-3"><PeakPeriodUpload onImported={() => setReloadKey((k) => k + 1)} /></div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}

      {!loading && data && !data.hasData ? (
        <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] text-slate-500">
          {is
            ? "Engin peak-period gögn fyrir þennan leikmann enn — flyttu inn Catapult „Peak Period“ útflutning að ofan til að kveikja á afl-kúrfunni. (Þangað til sýnir „Hámarkskrafa“ kortið nálgunina.)"
            : "No peak-period data for this player yet — import a Catapult \"Peak Period\" export above to light up the power curve. (Until then the Peak demands card shows the proxy.)"}
        </p>
      ) : null}

      {!loading && best ? (() => {
        const metrics = data?.peakPeriod?.seasonBest?.map((c) => c.metric) ?? [];
        const s = shape?.shape ?? "insufficient";
        const sl = SHAPE_LABEL[s];
        return (
          <div className="mt-3 space-y-3">
            {metrics.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {metrics.map((m) => (
                  <button key={m} onClick={() => setMetric(m)}
                    className={`rounded-full px-2.5 py-0.5 text-[12px] ${m === metric ? "bg-[#2740e6] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                    {metricLabel(m, is)}
                  </button>
                ))}
              </div>
            ) : null}

            {(() => {
              const read = shape && s !== "insufficient" ? plainRead(shape, data?.name ?? "", best.unit ?? "", is) : null;
              if (!read) return null;
              return (
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                  {/* (0) verdict, boldest */}
                  <div className="flex flex-wrap items-start gap-2">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${sl.tone}`}>{is ? sl.is : sl.en}</span>
                    <p className="text-[15px] font-bold leading-snug text-slate-900">{read.headline}</p>
                  </div>
                  {/* (1) the plain "why" + what to do */}
                  <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{read.meaning}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#2740e6]">→ {read.action}</p>
                </div>
              );
            })()}

            {/* (2) the chart is the supporting picture, below the plain read — width-capped so a
                   wide card doesn't blow the 320×120 SVG up to full-page height. */}
            <div className="max-w-sm">
              <p className="mb-1 text-[11px] font-medium text-slate-500">{is ? "Ákefð (per mínútu) eftir átaka-lengd" : "Intensity (per minute) by effort length"}</p>
              <CurveSvg best={best} latest={latest} />
              <div className="flex items-center gap-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[#2740e6]" /> {is ? "Tímabils-hámark" : "Season best"}</span>
                {latest ? <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dashed border-slate-400" /> {is ? "Síðasti leikur" : "Latest"}</span> : null}
              </div>
            </div>

            <ShowDetails label={{ EN: "Show the curve numbers", IS: "Sýna kúrfu-tölurnar" }}>
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="py-1 font-medium">{is ? "Gluggi" : "Window"}</th>
                  <th className="py-1 text-right font-medium">{is ? "Tímabils-hámark" : "Season best"}</th>
                  <th className="py-1 text-right font-medium">{is ? "Síðasti" : "Latest"}</th>
                </tr></thead>
                <tbody className="tabular-nums text-slate-700">
                  {best.points.map((p) => {
                    const lv = latest?.points.find((q) => q.windowMin === p.windowMin)?.value ?? null;
                    return (
                      <tr key={p.windowMin} className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">{fmtWin(p.windowMin)}</td>
                        <td className="py-1 text-right">{fmt(p.value)}{best.unit ? ` ${best.unit}` : ""}</td>
                        <td className="py-1 text-right text-slate-500">{fmt(lv)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {shape ? <p className="mt-2 text-[11px] text-slate-500">{shape.caveat[is ? "is" : "en"]}</p> : null}
            </ShowDetails>

            <p className="text-[11px] text-slate-400">{is ? "Reglur reikna — ekki AI." : "Rules compute — not AI."}{shape ? ` · ${shape.citation}` : ""}</p>
          </div>
        );
      })() : null}
    </div>
  );
}
