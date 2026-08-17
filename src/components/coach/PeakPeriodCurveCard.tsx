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
import type { CurveShapeRead } from "@/lib/micropulse/load/curveShape";

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

const fmtWin = (m: number): string => (m < 1 ? `${Math.round(m * 60)}s` : `${m % 1 === 0 ? m : m.toFixed(1)}m`);
const fmtWinWord = (m: number, is: boolean): string => (m < 1 ? `${Math.round(m * 60)}${is ? " sek" : "s"}` : `${m % 1 === 0 ? m : m.toFixed(1)}${is ? " mín" : "-min"}`);
const fmt = (v: number | null | undefined, d = 1): string => (v == null ? "–" : v.toFixed(d));

/**
 * Honest, coach-usable read of the power curve. We deliberately DON'T slap a value-laden
 * Explosive/Engine badge on it — with only 1/3/5-min INCIDENTAL peak windows that mislabels a
 * low-ceiling player as an "Engine" and then contradicts itself against the squad. Instead we lead
 * with the one thing this data shows reliably (within-player DURABILITY: how much intensity holds
 * from the short to the long window), state the squad rank as a neutral fact, and point to MAS/CS
 * for the firmer number. Explainability-first, no self-contradiction.
 */
function plainRead(shape: CurveShapeRead, unit: string, is: boolean): { headline: string; facts: string; action: string; confidence: string } | null {
  if (shape.shape === "insufficient" || shape.shortValue == null || shape.longValue == null || shape.retentionPct == null) return null;
  const u = unit || (is ? "m/mín" : "m/min");
  const shortW = shape.shortWindowMin != null ? fmtWinWord(shape.shortWindowMin, is) : (is ? "stutt" : "short");
  const longW = shape.longWindowMin != null ? fmtWinWord(shape.longWindowMin, is) : (is ? "langt" : "long");
  const shortV = Math.round(shape.shortValue), longV = Math.round(shape.longValue), ret = shape.retentionPct;
  const sPct = shape.shortPercentile, lPct = shape.longPercentile;

  // (0) Durability — within-player, needs no squad calibration → the trustworthy read.
  const headline = ret >= 55
    ? (is ? `Ákefðin helst vel þegar átökin lengjast — hann heldur ${ret}% af hörðustu ${shortW} ferðinni yfir ${longW}.` : `His intensity holds up well as efforts lengthen — he keeps ${ret}% of his hardest-${shortW} pace over ${longW}.`)
    : ret <= 40
      ? (is ? `Ákefðin er framhlaðin — hún fellur niður í ${ret}% af hörðustu ${shortW} ferðinni þegar komið er í ${longW}.` : `His intensity is front-loaded — it falls to ${ret}% of his hardest-${shortW} pace by ${longW}.`)
      : (is ? `Ákefðin helst hóflega — ${ret}% af hörðustu ${shortW} ferðinni eftir í ${longW}.` : `His intensity holds moderately — ${ret}% of his hardest-${shortW} pace remains at ${longW}.`);

  // (1) The numbers + neutral squad rank (a fact, not a colour).
  const rank = sPct != null && lPct != null ? (is ? ` — röðun í liði ${sPct}% / ${lPct}%` : ` — squad rank ${sPct}% / ${lPct}%`) : "";
  const facts = is
    ? `Hörðustu ${shortW}: ${shortV} ${u} · yfir ${longW}: ${longV} ${u}${rank}`
    : `Hardest ${shortW}: ${shortV} ${u} · over ${longW}: ${longV} ${u}${rank}`;

  // (2) Action — synthesised from where his SUSTAINED output ranks (honest, no over-claim).
  const level = lPct ?? sPct;
  const action = level == null ? ""
    : level < 45 ? (is ? "Afköst hans hér liggja undir liðinu — forgangsraðaðu þrekþjálfun til að hækka þakið." : "His output here sits below the squad — prioritise running conditioning to raise the ceiling.")
    : level >= 60 ? (is ? "Yfir liðinu — áreiðanlegur kostur þegar þarf viðvarandi hlaup." : "Above the squad — a reliable option when you need sustained running.")
    : (is ? "Um miðju liðsins í viðvarandi hlaupi." : "Around squad average for sustained running.");

  const confidence = is
    ? "Lesið úr topp-gluggum æfinga (1/3/5 mín), ekki hámarksprófi — MAS og Critical Speed hér að neðan eru traustari þrek-tölurnar."
    : "Read from session peak windows (1/3/5 min), not an all-out test — his MAS and Critical Speed below are the firmer conditioning numbers.";

  return { headline, facts, action, confidence };
}

/** Tiny inline SVG line chart: season-best (solid) + latest (dashed) over the windows. */
function CurveSvg({ best, latest }: { best: PowerCurve; latest: PowerCurve | null }) {
  const W = 360, H = 210, padL = 38, padR = 10, padT = 12, padB = 26;
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
            <circle cx={x(p.windowMin)} cy={y(p.value!)} r={wins.length > 8 ? 2.2 : 3.5} fill="#2740e6" />
            {showLabel(i) ? <text x={x(p.windowMin)} y={H - padB + 15} textAnchor="middle" fontSize="11" fill="#64748b">{fmtWin(p.windowMin)}</text> : null}
          </g>
        );
      })}
      <text x={padL - 5} y={y(maxV) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{fmt(maxV)}</text>
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

            {/* Two-column on desktop: the plain read carries the meaning (left), the chart is the
                supporting picture at a readable size (right). Stacks on mobile. */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
              <div className="lg:flex-1">
                {(() => {
                  const read = shape && s !== "insufficient" ? plainRead(shape, best.unit ?? "", is) : null;
                  if (!read) return <p className="text-[13px] text-slate-500">{is ? "Ekki næg kúrfa enn til að lesa." : "Not enough of a curve to read yet."}</p>;
                  return (
                    <div className="h-full rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
                      {/* (0) durability verdict — the read this data can honestly give, boldest */}
                      <p className="text-[16px] font-bold leading-snug text-slate-900">{read.headline}</p>
                      {/* (1) numbers + neutral squad rank */}
                      <p className="mt-2 text-[13px] leading-relaxed text-slate-700">{read.facts}</p>
                      {/* (2) what to do */}
                      {read.action ? <p className="mt-1.5 text-[13px] leading-relaxed text-[#2740e6]">→ {read.action}</p> : null}
                      {/* confidence + cross-link to the firmer numbers */}
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{read.confidence}</p>
                    </div>
                  );
                })()}
              </div>
              <div className="lg:w-[460px] lg:shrink-0">
                <p className="mb-1 text-[11px] font-medium text-slate-500">{is ? "Ákefð (per mínútu) eftir átaka-lengd" : "Intensity (per minute) by effort length"}</p>
                <CurveSvg best={best} latest={latest} />
                <div className="mt-1 flex items-center gap-4 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[#2740e6]" /> {is ? "Tímabils-hámark" : "Season best"}</span>
                  {latest ? <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dashed border-slate-400" /> {is ? "Síðasti leikur" : "Latest"}</span> : null}
                </div>
              </div>
            </div>

            {/* Deeper explainability — the "behind the numbers" narrative, behind a toggle so the
                glance stays clean. Teaches the concept + reads each point for THIS player. */}
            {shape && s !== "insufficient" && shape.shortValue != null && shape.longValue != null && shape.retentionPct != null ? (() => {
              const u = best.unit || (is ? "m/mín" : "m/min");
              const who = data?.name || (is ? "leikmaðurinn" : "the player");
              const shortW = shape.shortWindowMin != null ? fmtWinWord(shape.shortWindowMin, is) : "";
              const longW = shape.longWindowMin != null ? fmtWinWord(shape.longWindowMin, is) : "";
              const shortV = Math.round(shape.shortValue), longV = Math.round(shape.longValue), ret = shape.retentionPct;
              const sPct = shape.shortPercentile, lPct = shape.longPercentile;
              return (
                <ShowDetails label={{ EN: "How to read this", IS: "Hvernig á að lesa þetta" }}>
                  <div className="space-y-2 text-[12px] leading-relaxed text-slate-600">
                    <p>{is
                      ? `Kúrfan sýnir bestu hlaupa-ákefð ${who} (${u}) í hverri átaka-lengd. LÖGUNIN er merkið: flöt lína = hann heldur afköstunum þegar átökin lengjast (úthald); brött lækkun = framhlaðið (stór byrjun sem dvínar).`
                      : `The curve plots ${who}'s best running intensity (${u}) at each effort length. The SHAPE is the signal: a flat line = he holds output as efforts lengthen (durable); a steep drop = front-loaded (a big early burst that fades).`}</p>
                    <ul className="space-y-1">
                      <li>{is
                        ? `• Hörðustu ${shortW}: ${shortV} ${u} — hans skarpasta samfellda ${shortW}${sPct != null ? `, röðun í liði ${sPct}%` : ""}.`
                        : `• Hardest ${shortW}: ${shortV} ${u} — his sharpest sustained ${shortW}${sPct != null ? `, squad rank ${sPct}%` : ""}.`}</li>
                      <li>{is
                        ? `• Yfir ${longW}: ${longV} ${u} — endurtekanleg afköst hans${lPct != null ? `, röðun í liði ${lPct}%` : ""}.`
                        : `• Over ${longW}: ${longV} ${u} — his repeatable output${lPct != null ? `, squad rank ${lPct}%` : ""}.`}</li>
                      <li>{is
                        ? `• Retention ${ret}%: hann heldur ${ret}% af ${shortW} ákefðinni yfir ${longW}. Yfir ~55% = helst vel; undir ~40% = dvínar hratt.`
                        : `• Retention ${ret}%: he keeps ${ret}% of his ${shortW} intensity over ${longW}. Above ~55% holds well; below ~40% fades fast.`}</li>
                    </ul>
                    {latest ? <p>{is
                      ? "Dass-línan er síðasti leikur/æfing; liggi hún vel undir heildar-hámarkinu þýðir það oftast léttari lotu (eða hann náði ekki toppákefð) — ekki viðvörun í sjálfu sér."
                      : "The dashed line is his latest session; sitting well below the solid season-best usually means a lighter session (or he didn't reach peak intensity), not a warning on its own."}</p> : null}
                    <p className="text-slate-500">{is
                      ? "Þetta eru topp-gluggar úr nýlegum lotum, ekki hámarkspróf — hreyfi-prófíll, ekki þrek-einkunn. Fyrir kvarðaðar loftháðar tölur notaðu MAS og Critical Speed á kortinu fyrir neðan. Hækkaðu lága úthalds-röðun með loftháðri/tempó-þjálfun; skerptu dvínandi kúrfu með endurteknum há-ákefðar átökum."
                      : "These are peak windows from recent sessions, not an all-out test — a movement profile, not a fitness grade. For calibrated aerobic numbers use MAS and Critical Speed on the card below. Raise a low sustained rank with aerobic/tempo conditioning; sharpen a fading curve with repeated high-intensity efforts."}</p>
                  </div>
                </ShowDetails>
              );
            })() : null}

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
