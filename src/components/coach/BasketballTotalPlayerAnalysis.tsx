"use client";

/**
 * BasketballTotalPlayerAnalysis — the two-axis player profile for basketball: PRODUCTION
 * (within-squad box-score percentiles, as a radar) + STYLE (InStat play-type mix, as bars) +
 * an archetype. Reads what Single/Season Match Analysis ingested — no upload. Never blends the
 * two axes. Descriptive — never the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Lbl = { en: string; is: string };
type MetricCell = { key: string; label: Lbl; value: number | null; percentile: number | null };
type Category = { key: string; label: Lbl; avgPercentile: number | null; metrics: MetricCell[] };
type Production = { name: string; games: number; role: { key: string; label: Lbl } | null; categories: Category[]; strengths: MetricCell[]; weaknesses: MetricCell[]; smallSample: boolean; poolSize: number };
type StyleSlice = { key: string; label: Lbl; attempts: number; made: number; share: number; pct: number | null };
type Style = { games: number; totalAttempts: number; mix: StyleSlice[]; defense: { oppFgPct: number | null; oppFga: number; possessions: number } | null } | null;
type Archetype = { key: string; label: Lbl; why: Lbl };
type Resp = { production: Production; style: Style; archetype: Archetype; ai: { summary: string; development: string } | null };
type ListPlayer = { name: string; games: number; ppg: number };

const RADAR_ORDER = ["scoring", "efficiency", "playmaking", "defense", "rebounding"];
const col = (p: number) => (p >= 75 ? "#1c7a4a" : p <= 25 ? "#a83e28" : "#2740e6");

/** Pentagon radar of the five category percentiles (0–100). */
function Radar({ cats, is }: { cats: Category[]; is: boolean }) {
  const byKey = new Map(cats.map((c) => [c.key, c]));
  const axes = RADAR_ORDER.map((k) => byKey.get(k)).filter((c): c is Category => !!c);
  const N = axes.length, R = 64, cx = 84, cy = 80;
  const pt = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / N;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)] as const;
  };
  const poly = axes.map((c, i) => pt(i, (R * (c.avgPercentile ?? 0)) / 100).join(",")).join(" ");
  return (
    <svg viewBox="0 0 168 164" className="w-full max-w-[280px]">
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={axes.map((_, i) => pt(i, (R * ring) / 100).join(",")).join(" ")} fill="none" stroke="#e8e5dd" strokeWidth={0.8} />
      ))}
      {axes.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e8e5dd" strokeWidth={0.8} />; })}
      <polygon points={poly} fill="#2740e6" fillOpacity={0.18} stroke="#2740e6" strokeWidth={1.4} />
      {axes.map((c, i) => {
        const [x, y] = pt(i, R + 12);
        return <text key={c.key} x={x} y={y} fontSize={7.5} fontWeight={600} fill="#475569" textAnchor="middle" dominantBaseline="middle">{is ? c.label.is : c.label.en}</text>;
      })}
    </svg>
  );
}

export default function BasketballTotalPlayerAnalysis() {
  const [lang] = useLang();
  const is = lang === "IS";
  const L = (l: Lbl) => (is ? l.is : l.en);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const [players, setPlayers] = React.useState<ListPlayer[] | null>(null);
  const [sel, setSel] = React.useState<string>("");
  const [data, setData] = React.useState<Resp | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ai, setAi] = React.useState<{ summary: string; development: string } | null>(null);
  const [aiBusy, setAiBusy] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const t = await token(); if (!t) return;
      const res = await fetch("/api/coach/basketball-total-player-analysis?list=1", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const j = await res.json();
      if (j.ok) { setPlayers(j.players ?? []); if (j.players?.[0]) setSel(j.players[0].name); }
    })();
  }, [token]);

  React.useEffect(() => {
    setAi(null);
    if (!sel) { setData(null); return; }
    (async () => {
      setBusy(true); setErr(null);
      try {
        const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
        const res = await fetch("/api/coach/basketball-total-player-analysis", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ player: sel }) });
        const j = await res.json();
        if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); setData(null); return; }
        setData(j as Resp);
      } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
    })();
  }, [sel, token, is]);

  async function fetchAi() {
    if (!sel) return;
    setAiBusy(true);
    try {
      const t = await token(); if (!t) return;
      const res = await fetch("/api/coach/basketball-total-player-analysis", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ player: sel, prose: true, lang }) });
      const j = await res.json();
      if (j.ok && j.ai) setAi(j.ai);
    } finally { setAiBusy(false); }
  }

  if (players && players.length === 0) {
    return <p className="text-[13px] text-slate-500">{is ? "Engin leikmanna-gögn enn — flyttu inn leik á Single Match Analysis (eða tengdu KKÍ-leik)." : "No player data yet — import a game on Single Match Analysis (or link a KKÍ game)."}</p>;
  }

  const d = data;
  const maxShare = Math.max(1, ...(d?.style?.mix ?? []).map((s) => s.share));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Leikmaður" : "Player"}</span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {(players ?? []).map((p) => <option key={p.name} value={p.name}>{p.name} · {p.ppg} {is ? "stig" : "pts"}</option>)}
        </select>
      </div>

      {err && <p className="text-[12px] text-red-600">{err}</p>}
      {busy && !d && <p className="text-[13px] text-slate-500">{is ? "Reikna…" : "Computing…"}</p>}

      {d && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-bold text-slate-900">{d.production.name}</span>
            <span className="rounded-full bg-[#7a5cc4]/12 px-2.5 py-0.5 text-[12px] font-bold text-[#7a5cc4]">{L(d.archetype.label)}</span>
            <span className="text-[12px] text-slate-400">{d.production.games} {is ? "leikir" : "games"} · {is ? "vs" : "vs"} {d.production.poolSize} {is ? "liðsfélaga" : "teammates"}</span>
            {d.production.smallSample ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{is ? "lítið úrtak" : "small sample"}</span> : null}
            {!ai ? <button type="button" onClick={() => void fetchAi()} disabled={aiBusy} className="ml-auto rounded-lg border border-[#2740e6] px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-[#eef0fb] disabled:opacity-50">{aiBusy ? (is ? "AI skrifar…" : "AI writing…") : (is ? "✨ AI-samantekt" : "✨ AI summary")}</button> : null}
          </div>
          <p className="text-[12px] text-slate-500">{L(d.archetype.why)}</p>

          {ai ? (
            <div className="rounded-xl border border-[#c4cbf5] bg-[#f6f7fe] p-3">
              <div className="mb-1.5 flex items-center gap-2"><span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">AI</span><span className="text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">{is ? "les tölurnar — ákveður ekkert" : "reads the numbers — decides nothing"}</span></div>
              <p className="text-[13px] leading-relaxed text-slate-700">{ai.summary}</p>
              {ai.development ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-800">{ai.development}</p> : null}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {/* PRODUCTION axis — radar */}
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[13px] font-bold text-slate-900">{is ? "Framlag" : "Production"} <span className="text-[10px] font-medium text-slate-400">· {is ? "percentílar innan liðs" : "within-squad percentiles"}</span></div>
              <div className="mt-1 flex justify-center">{d.production.categories.length ? <Radar cats={d.production.categories} is={is} /> : null}</div>
              <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                {d.production.categories.filter((c) => c.avgPercentile != null).map((c) => (
                  <span key={c.key} className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px]"><span className="text-slate-500">{L(c.label)} </span><b style={{ color: col(c.avgPercentile!) }}>{c.avgPercentile}</b></span>
                ))}
              </div>
            </section>

            {/* STYLE axis — play-type mix */}
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[13px] font-bold text-slate-900">{is ? "Stíll — hvernig hann/hún skorar" : "Style — how they score"} <span className="text-[10px] font-medium text-slate-400">· InStat</span></div>
              {d.style && d.style.mix.length ? (
                <div className="mt-2 space-y-1.5">
                  {d.style.mix.slice(0, 8).map((s) => (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="w-[110px] shrink-0 truncate text-[11px] text-slate-600">{L(s.label)}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#2740e6]" style={{ width: `${(s.share / maxShare) * 100}%` }} />
                      </div>
                      <span className="w-[86px] shrink-0 text-right text-[11px] tabular-nums text-slate-500">{s.share}% · {s.pct == null ? "–" : `${s.pct}%`}</span>
                    </div>
                  ))}
                  {d.style.defense?.oppFgPct != null ? (
                    <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">{is ? "Vörn: andstæðingar hittu" : "Defense: opponents shot"} <b className="text-slate-700">{d.style.defense.oppFgPct}%</b> {is ? "á móti honum/henni" : "against them"} ({d.style.defense.oppFga} {is ? "skot" : "FGA"})</p>
                  ) : null}
                  <p className="text-[10px] text-slate-400">{is ? "Hlutfall sókna · nýting. Aðeins InStat-leikir." : "Attempt share · efficiency. InStat games only."}</p>
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-slate-500">{is ? "Engin InStat sóknartegunda-gögn — hladdu inn single-match InStat leik til að sjá stíl." : "No InStat play-type data — upload a single-match InStat game to see style."}</p>
              )}
            </section>
          </div>

          {(d.production.strengths.length || d.production.weaknesses.length) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {d.production.strengths.length ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3"><div className="text-[12px] font-bold text-emerald-800">{is ? "Styrkleikar" : "Strengths"}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{d.production.strengths.map((m) => <span key={m.key} className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700">{L(m.label)} · {m.percentile}</span>)}</div></div>
              ) : null}
              {d.production.weaknesses.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3"><div className="text-[12px] font-bold text-amber-800">{is ? "Til að bæta" : "To improve"}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{d.production.weaknesses.map((m) => <span key={m.key} className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700">{L(m.label)} · {m.percentile}</span>)}</div></div>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <p className="text-[11px] text-slate-400">{is ? "Tveir ásar — framlag OG stíll — aldrei blandað. Úr box-score (InStat + KKÍ) og InStat sóknartegundum. Lýsandi — snertir ekki readiness-litinn." : "Two axes — production AND style — never blended. From the box scores (InStat + KKÍ) and InStat play types. Descriptive — never touches the readiness colour."}</p>
    </div>
  );
}
