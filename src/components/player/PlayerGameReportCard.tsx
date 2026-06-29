"use client";

/**
 * PlayerGameReportCard — the player's OWN season game report, so he can follow
 * his physical profile. Self-scoped (/api/player/game-report — player_id comes
 * from his auth, never a param). Capability-aware: shows whatever metrics his
 * team actually records (Lite → GPS; Pro → GPS + IMA), dropping empty ones.
 *
 * Explainability-first: a one-sentence verdict on top, plain-language standout /
 * focus lines, the squad-percentile radar, per-match trends, and a "behind the
 * numbers" details toggle. Confidence (matches + squad size) is always visible.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ProfileRadar, MatchTrendBars, type RadarMetric, type TrendBar } from "@/components/coach/PlayerGameReportCharts";

type Bench = { player: number; team_avg: number; percentile: number; rank: number; n: number } | null;
type P90 = Record<string, number>;
type Match = { date: string; opponent: string | null; competition?: string | null; is_home?: boolean | null; minutes: number; has_gps: boolean; p90: P90 | null };
type Report = {
  player: { full_name: string; position: string | null; age: number | null };
  season: { year: number };
  summary: { matches_played: number; matches_with_gps: number; total_minutes: number; qualifying_matches: number; per90_avg: P90; best_top_speed_kmh: number };
  benchmarks: Record<string, Bench>;
  availableKeys: string[];
  matches: Match[];
};

const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString());
const f1 = (v: number | null | undefined) => (v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString());

// Metric labels (bilingual) + formatter — mirrors the coach report so the two
// surfaces describe the same numbers identically.
type MetricCfg = { key: string; is: string; en: string; unit: string; fmt: (v: number | null | undefined) => string };
const METRICS: MetricCfg[] = [
  { key: "total_distance", is: "Vegalengd", en: "Distance", unit: "m", fmt: n0 },
  { key: "hsr", is: "Háhraðahlaup", en: "High-speed running", unit: "m", fmt: n0 },
  { key: "sprint", is: "Sprettir", en: "Sprinting", unit: "m", fmt: n0 },
  { key: "top_speed_kmh", is: "Hæsti hraði", en: "Top speed", unit: "km/h", fmt: f1 },
  { key: "accel", is: "Hröðun", en: "Accelerations", unit: "", fmt: f1 },
  { key: "decel", is: "Hraðaminnkun", en: "Decelerations", unit: "", fmt: f1 },
  { key: "cod", is: "Stefnubreytingar", en: "Change of direction", unit: "", fmt: f1 },
  { key: "jumps", is: "Stökk", en: "Jumps", unit: "", fmt: f1 },
  { key: "efforts", is: "Átök", en: "Efforts", unit: "", fmt: f1 },
  { key: "hml", is: "Hááless. vegal.", en: "High metabolic dist.", unit: "m", fmt: n0 },
];
// Short axis labels for the radar (kept tight so they don't overlap).
const SHORT: Record<string, { is: string; en: string }> = {
  total_distance: { is: "Vegal.", en: "Dist" }, hsr: { is: "Háhraði", en: "HSR" }, sprint: { is: "Sprettur", en: "Sprint" },
  top_speed_kmh: { is: "Hraði", en: "Speed" }, accel: { is: "Hröðun", en: "Acc" }, decel: { is: "Hraðam.", en: "Dec" },
  cod: { is: "Stefnub.", en: "CoD" }, jumps: { is: "Stökk", en: "Jumps" }, efforts: { is: "Átök", en: "Efforts" }, hml: { is: "HML", en: "HML" },
};

export default function PlayerGameReportCard({ lang = "IS" }: { lang?: "IS" | "EN" }) {
  const isIS = lang === "IS";
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [ai, setAi] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  const genAi = async () => {
    setAiLoading(true); setAiErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/player/game-report/narrative`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ lang }),
      });
      const j = await res.json();
      if (!res.ok) { setAiErr(j.error ?? "Failed"); return; }
      setAi(j.narrative as string);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/player/game-report`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const j = await res.json();
        if (!alive) return;
        if (!res.ok) { setErr(j.error ?? "Failed"); return; }
        setReport(j as Report);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Network error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const avail = useMemo(() => (report?.availableKeys ? new Set(report.availableKeys) : null), [report]);

  // Radar: squad percentile per metric (spikes out = strengths).
  const radar: RadarMetric[] = useMemo(() => {
    if (!report) return [];
    return METRICS
      .filter((m) => (avail ? avail.has(m.key) : true))
      .map((m) => {
        const b = report.benchmarks[m.key];
        if (!b) return null;
        const s = SHORT[m.key];
        return { label: isIS ? (s?.is ?? m.is) : (s?.en ?? m.en), percentile: b.percentile, valueLabel: m.fmt(b.player) } as RadarMetric;
      })
      .filter((x): x is RadarMetric => x != null);
  }, [report, avail, isIS]);

  // Plain-language standout / focus, derived from the radar percentiles.
  const verdict = useMemo(() => {
    if (!report || radar.length < 2) return null;
    const sorted = [...radar].sort((a, b) => b.percentile - a.percentile);
    const top = sorted[0], low = sorted[sorted.length - 1];
    return { top, low };
  }, [report, radar]);

  const series = (key: string): TrendBar[] =>
    (report?.matches ?? []).filter((m) => m.has_gps && m.p90).map((m) => ({
      label: (m.opponent ?? "—").slice(0, 6),
      value: (m.p90?.[key] as number) ?? 0,
    }));

  if (loading) return <div className="mx-auto max-w-lg px-1 py-6 text-sm text-zinc-500">{isIS ? "Hleð leikjaskýrslu…" : "Loading game report…"}</div>;
  if (err) return <div className="mx-auto max-w-lg px-1 py-6"><div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div></div>;
  if (!report) return null;

  const s = report.summary;
  const noData = s.matches_with_gps === 0;

  return (
    <div className="mx-auto max-w-lg space-y-3 pb-24">
      {/* Header + one-sentence verdict */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          {isIS ? "Leikjaskýrsla" : "Game report"} · {report.season.year}
        </div>
        <h2 className="mt-0.5 text-lg font-bold tracking-tight text-zinc-900">{report.player.full_name}</h2>
        {noData ? (
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            {isIS ? "Engin leikgögn skráð enn á þessu tímabili. Skýrslan fyllist um leið og GPS-gögn úr leik berast." : "No match data recorded yet this season. Your report fills in as soon as match GPS data arrives."}
          </p>
        ) : (
          <p className="mt-1 text-sm leading-relaxed text-zinc-700">
            {isIS
              ? `Þú hefur spilað ${s.matches_played} ${s.matches_played === 1 ? "deildarleik" : "deildarleiki"} í ár. Hér er líkamlega prófílinn þinn — borinn saman við liðið.`
              : `You've played ${s.matches_played} league ${s.matches_played === 1 ? "match" : "matches"} this season. Here's your physical profile — compared to the squad.`}
          </p>
        )}
        {/* Confidence: what the report is built on */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip label={isIS ? "Leikir" : "Matches"} value={String(s.matches_with_gps)} />
          <Chip label={isIS ? "Mínútur" : "Minutes"} value={n0(s.total_minutes)} />
          {report.benchmarks.top_speed_kmh && <Chip label={isIS ? "Hæsti hraði" : "Top speed"} value={`${f1(s.best_top_speed_kmh)} km/h`} />}
        </div>
      </div>

      {!noData && (
        <>
          {/* Plain-language standout / focus */}
          {verdict && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-base">⭐</span>
                <p className="text-sm leading-relaxed text-zinc-700">
                  <span className="font-semibold text-zinc-900">{isIS ? "Þinn styrkur: " : "Your standout: "}</span>
                  {verdict.top.label} — {isIS ? `betri en ${verdict.top.percentile}% af liðinu.` : `better than ${verdict.top.percentile}% of the squad.`}
                </p>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <span className="mt-0.5 text-base">🎯</span>
                <p className="text-sm leading-relaxed text-zinc-700">
                  <span className="font-semibold text-zinc-900">{isIS ? "Mest svigrúm: " : "Most room to grow: "}</span>
                  {verdict.low.label} — {isIS ? `${verdict.low.percentile}. hundraðshluti í liðinu.` : `${verdict.low.percentile}th percentile in the squad.`}
                </p>
              </div>
            </div>
          )}

          {/* AI summary about you — on-demand, labelled as AI, from your own numbers */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
                <span>✨</span>{isIS ? "AI samantekt um þig" : "AI summary about you"}
              </div>
              {!ai && (
                <button type="button" onClick={genAi} disabled={aiLoading}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  {aiLoading ? (isIS ? "Skrifa…" : "Writing…") : (isIS ? "Búa til" : "Generate")}
                </button>
              )}
            </div>
            {aiErr && <div className="mt-2 text-xs text-red-600">{aiErr}</div>}
            {ai ? (
              <>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{ai}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-indigo-700">AI</span>
                  {isIS ? "Búið til úr þínum eigin leiktölum. AI útskýrir — tölurnar ráða." : "Generated from your own match numbers. AI explains — the numbers decide."}
                </div>
              </>
            ) : !aiLoading && !aiErr ? (
              <p className="mt-1 text-xs text-indigo-700/70">
                {isIS ? "Fáðu stutta samantekt á prófílnum þínum, skrifaða úr þínum eigin tölum." : "Get a short summary of your profile, written from your own numbers."}
              </p>
            ) : null}
          </div>

          {/* Percentile radar */}
          {radar.length >= 3 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-zinc-900">{isIS ? "Prófíllinn þinn vs liðið" : "Your profile vs the squad"}</div>
              <div className="text-[11px] text-zinc-500">{isIS ? "Hver ás = hundraðshluti þinn í liðinu. Toppar út = styrkur." : "Each axis = your squad percentile. Spikes out = strengths."}</div>
              <ProfileRadar metrics={radar} />
            </div>
          )}

          {/* Per-match trends */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-4">
            <div className="text-sm font-semibold text-zinc-900">{isIS ? "Per leik (á 90 mín)" : "Per match (per 90)"}</div>
            <MatchTrendBars title={isIS ? "Vegalengd" : "Distance"} unit="m" bars={series("total_distance")} avg={s.per90_avg.total_distance ?? null} />
            {(avail ? avail.has("hsr") : true) && (
              <MatchTrendBars title={isIS ? "Háhraðahlaup" : "High-speed running"} unit="m" bars={series("hsr")} avg={s.per90_avg.hsr ?? null} color="#0891b2" />
            )}
          </div>

          {/* All matches — the player's full game list (his own data) */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setShowMatches((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-zinc-900">
              <span>{isIS ? "Allir leikir" : "All matches"} <span className="text-zinc-400">({report.matches.length})</span></span>
              <span className="text-zinc-400">{showMatches ? "▲" : "▼"}</span>
            </button>
            {showMatches && (
              <div className="mt-2 divide-y divide-zinc-100">
                {report.matches.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                    <div className="min-w-0">
                      <div className="truncate text-zinc-800">{m.opponent ?? "—"}{m.is_home != null ? <span className="text-zinc-400"> · {m.is_home ? (isIS ? "heima" : "home") : (isIS ? "úti" : "away")}</span> : null}</div>
                      <div className="text-[11px] text-zinc-400">{m.date} · {m.minutes}′{!m.has_gps ? (isIS ? " · engin GPS" : " · no GPS") : ""}</div>
                    </div>
                    {m.has_gps && m.p90 ? (
                      <div className="shrink-0 text-right text-[11px] tabular-nums text-zinc-500">{n0(m.p90.total_distance)} m<span className="text-zinc-400"> /90</span></div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Behind the numbers — full per-90 vs squad table */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setShowDetails((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-zinc-900">
              <span>{isIS ? "Tölurnar á bak við" : "Behind the numbers"}</span>
              <span className="text-zinc-400">{showDetails ? "▲" : "▼"}</span>
            </button>
            {showDetails && (
              <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
                <table className="w-full text-[12px]">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">{isIS ? "Mæling" : "Metric"}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{isIS ? "Þú" : "You"}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{isIS ? "Lið" : "Squad"}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{isIS ? "Röð" : "Rank"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.filter((m) => (avail ? avail.has(m.key) : true) && report.benchmarks[m.key]).map((m) => {
                      const b = report.benchmarks[m.key]!;
                      return (
                        <tr key={m.key} className="border-t border-zinc-100">
                          <td className="px-2 py-1.5 text-zinc-700">{isIS ? m.is : m.en}{m.unit ? <span className="text-zinc-400"> ({m.unit})</span> : null}</td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-zinc-900">{m.fmt(b.player)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-zinc-500">{m.fmt(b.team_avg)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-zinc-500">{b.rank}/{b.n}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="bg-zinc-50 px-2 py-1.5 text-[10px] text-zinc-400">
                  {isIS
                    ? "Allt á 90 mín, meðaltal yfir leiki með ≥20 mín. Hæsti hraði er toppgildi (ekki á 90)."
                    : "All per 90, averaged over matches with ≥20 min. Top speed is a peak (not per-90)."}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-900">{value}</span>
    </span>
  );
}
