"use client";

/**
 * BasketballPlayerAnalysis — a basketball-native player read on /coach/player-analysis.
 * Pick one of your own players → within-squad percentiles (scoring / rebounding / playmaking /
 * defence / efficiency) with a season line, strengths and weaknesses. Reads the data Single /
 * Season Match Analysis already ingested (no upload here). Descriptive — never the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type MetricCell = { key: string; label: { en: string; is: string }; value: number | null; percentile: number | null };
type Category = { key: string; label: { en: string; is: string }; avgPercentile: number | null; metrics: MetricCell[] };
type Season = { games: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number; fgPct: number | null; tpPct: number | null; ftPct: number | null; tsPct: number | null };
type Analysis = {
  name: string; games: number; season: Season;
  role: { key: string; label: { en: string; is: string } } | null;
  categories: Category[]; strengths: MetricCell[]; weaknesses: MetricCell[]; smallSample: boolean; poolSize: number;
};
type ListPlayer = { name: string; games: number; ppg: number };

const barColor = (p: number) => (p >= 75 ? "#1c7a4a" : p <= 25 ? "#a83e28" : "#2740e6");
const fmt = (v: number | null | undefined, pctSign = false) => (v == null ? "–" : `${v}${pctSign ? "%" : ""}`);

export default function BasketballPlayerAnalysis() {
  const [lang] = useLang();
  const is = lang === "IS";
  const L = (l: { en: string; is: string }) => (is ? l.is : l.en);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const [players, setPlayers] = React.useState<ListPlayer[] | null>(null);
  const [sel, setSel] = React.useState<string>("");
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const t = await token(); if (!t) return;
      const res = await fetch("/api/coach/basketball-player-analysis?list=1", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const j = await res.json();
      if (j.ok) { setPlayers(j.players ?? []); if (j.players?.[0]) setSel(j.players[0].name); }
    })();
  }, [token]);

  React.useEffect(() => {
    if (!sel) { setAnalysis(null); return; }
    (async () => {
      setBusy(true); setErr(null);
      try {
        const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
        const res = await fetch("/api/coach/basketball-player-analysis", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ player: sel }) });
        const j = await res.json();
        if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); setAnalysis(null); return; }
        setAnalysis(j.analysis as Analysis);
      } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
    })();
  }, [sel, token, is]);

  if (players && players.length === 0) {
    return <p className="text-[13px] text-slate-500">{is ? "Engin leikmanna-gögn enn — flyttu inn leik á Single Match Analysis (eða tengdu KKÍ-leik)." : "No player data yet — import a game on Single Match Analysis (or link a KKÍ game)."}</p>;
  }

  const a = analysis;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Leikmaður" : "Player"}</span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {(players ?? []).map((p) => <option key={p.name} value={p.name}>{p.name} · {p.ppg} {is ? "stig" : "pts"}</option>)}
        </select>
      </div>

      {err && <p className="text-[12px] text-red-600">{err}</p>}
      {busy && !a && <p className="text-[13px] text-slate-500">{is ? "Reikna…" : "Computing…"}</p>}

      {a && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[17px] font-bold text-slate-900">{a.name}</span>
            {a.role ? <span className="rounded-full bg-[#2740e6]/10 px-2 py-0.5 text-[11px] font-bold text-[#2740e6]">{L(a.role.label)}</span> : null}
            <span className="text-[12px] text-slate-400">{a.games} {is ? "leikir" : "games"} · {is ? "borið saman við" : "vs"} {a.poolSize} {is ? "liðsfélaga" : "teammates"}</span>
            {a.smallSample ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{is ? "lítið úrtak" : "small sample"}</span> : null}
          </div>

          {/* Season line */}
          <div className="flex flex-wrap gap-2">
            {([["PPG", a.season.ppg], ["RPG", a.season.rpg], ["APG", a.season.apg], ["SPG", a.season.spg], ["BPG", a.season.bpg], ["FG%", a.season.fgPct], ["3P%", a.season.tpPct], ["TS%", a.season.tsPct]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{k}</div>
                <div className="text-[15px] font-bold tabular-nums text-slate-900">{fmt(v, k.includes("%"))}</div>
              </div>
            ))}
          </div>

          {/* Category percentile bars */}
          <div className="grid gap-3 sm:grid-cols-2">
            {a.categories.map((c) => (
              <div key={c.key} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[13px] font-bold text-slate-900">{L(c.label)}</span>
                  {c.avgPercentile != null ? <span className="text-[11px] font-semibold tabular-nums" style={{ color: barColor(c.avgPercentile) }}>{c.avgPercentile}{is ? ". hundraðshluti" : "th pct"}</span> : null}
                </div>
                <div className="space-y-1.5">
                  {c.metrics.map((m) => (
                    <div key={m.key} className="flex items-center gap-2">
                      <span className="w-[108px] shrink-0 truncate text-[11px] text-slate-500">{L(m.label)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${m.percentile ?? 0}%`, backgroundColor: m.percentile == null ? "#cbd5e1" : barColor(m.percentile) }} />
                      </div>
                      <span className="w-[42px] shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-800">{fmt(m.value, m.key.includes("Pct"))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Strengths / weaknesses */}
          {(a.strengths.length || a.weaknesses.length) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {a.strengths.length ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                  <div className="text-[12px] font-bold text-emerald-800">{is ? "Styrkleikar" : "Strengths"}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{a.strengths.map((m) => <span key={m.key} className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700">{L(m.label)} · {m.percentile}</span>)}</div>
                </div>
              ) : null}
              {a.weaknesses.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                  <div className="text-[12px] font-bold text-amber-800">{is ? "Til að bæta" : "To improve"}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{a.weaknesses.map((m) => <span key={m.key} className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700">{L(m.label)} · {m.percentile}</span>)}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <p className="text-[11px] text-slate-400">
        {is ? "Percentílar eru innan þíns liðs, úr box-score leikjanna (InStat + KKÍ). Lýsandi — snertir ekki readiness-litinn." : "Percentiles are within your own squad, from the games' box scores (InStat + KKÍ). Descriptive — never touches the readiness colour."}
      </p>
    </div>
  );
}
