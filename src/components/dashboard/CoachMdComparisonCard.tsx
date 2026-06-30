"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import type { MdDay, MdMetricKey, MdComparisonResult, PlayerMdComparison, MdMetricScore, MdPlanningResult } from "@/lib/micropulse/externalLoad/mdComparisonTypes";
import { MD_METRIC_LABELS } from "@/lib/micropulse/externalLoad/mdComparisonTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = "IS" | "EN";

// ─── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  IS: {
    title: "MD Samanburður",
    subtitle: "Æfing dagsins vs YKKAR sögulega meðaltal fyrir sama MD-dag (vs ykkar venja — ekki leik-krafa; sjá „Train like you Play“ fyrir vs leik-kröfu).",
    noData: "Engin Catapult gögn fundust fyrir þennan dag.",
    noDataSub: "Samstilltu Catapult gögn eða veldu dag með skráðum gögnum.",
    loading: "Hleð MD samanburði...",
    player: "Leikmaður",
    overall: "Heild",
    sessions: "lotur",
    histSessions: "Söguleg meðaltöl byggð á",
    lowLoad: "Lítið álag",
    normalLoad: "Eðlilegt",
    highLoad: "Mikið álag",
    insufficient: "Of fá gögn",
    limited: "Takmörkuð gögn",
    good: "Gott",
    selectMd: "Veldu MD dag",
    auto: "Sjálfvirkt (ákvarðað af leikdagatali)",
    stenScale: "STEN kvarði",
    teamAverage: "Liðsmeðaltal",
    players: "Leikmenn",
    showPlayers: "Sýna leikmenn",
    hidePlayers: "Fela leikmenn",
    value: "Gildi",
    mdAvg: "MD meðalt.",
    zScore: "Z-score",
    planningMode: "Skipulagning",
    comparisonMode: "Samanburður",
    planningTitle: "MD Viðmið",
    planningSubtitle: "Söguleg meðaltöl liðsins — notaðu sem viðmið við uppsetningu æfingar",
    normalBand: "Eðlilegt bil",
    range: "Bil",
    mean: "Meðaltal",
    stdDev: "Staðalfrávik",
    min: "Lágm.",
    max: "Hám.",
    basedOn: "Byggt á",
    sessionsAndPlayers: "lotum og",
    playersLabel: "leikmönnum",
    selectMdPlanning: "Veldu MD dag til að sjá viðmið",
  },
  EN: {
    title: "MD Comparison",
    subtitle: "Today's session vs your OWN historical average for the same MD-day (vs your norm — not match demand; see “Train like you Play” for vs match demand).",
    noData: "No Catapult data found for this date.",
    noDataSub: "Sync Catapult data or select a date with recorded sessions.",
    loading: "Loading MD comparison...",
    player: "Player",
    overall: "Overall",
    sessions: "sessions",
    histSessions: "Historical averages based on",
    lowLoad: "Low load",
    normalLoad: "Normal",
    highLoad: "High load",
    insufficient: "Insufficient data",
    limited: "Limited data",
    good: "Good",
    selectMd: "Select MD day",
    auto: "Auto (based on match schedule)",
    stenScale: "STEN scale",
    teamAverage: "Team Average",
    players: "Players",
    showPlayers: "Show players",
    hidePlayers: "Hide players",
    value: "Value",
    mdAvg: "MD avg.",
    zScore: "Z-score",
    planningMode: "Planning",
    comparisonMode: "Comparison",
    planningTitle: "MD Benchmarks",
    planningSubtitle: "Historical team averages — use as reference when setting up training",
    normalBand: "Normal band",
    range: "Range",
    mean: "Mean",
    stdDev: "Std Dev",
    min: "Min",
    max: "Max",
    basedOn: "Based on",
    sessionsAndPlayers: "sessions and",
    playersLabel: "players",
    selectMdPlanning: "Select an MD day to view benchmarks",
  },
} as const;

// ─── STEN Color Logic ─────────────────────────────────────────────────────────

function stenColor(sten: number | null): { bg: string; text: string; border: string } {
  if (sten == null) return { bg: "bg-slate-50", text: "text-slate-400", border: "border-slate-200" };
  if (sten <= 2) return { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" };
  if (sten <= 3) return { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" };
  if (sten <= 5) return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
  if (sten <= 7) return { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" };
  if (sten <= 8) return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
  if (sten <= 9) return { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" };
  return { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300" };
}

function stenBand(sten: number | null, lang: Lang): string {
  const t = COPY[lang];
  if (sten == null) return "—";
  if (sten <= 3) return t.lowLoad;
  if (sten <= 7) return t.normalLoad;
  return t.highLoad;
}

function fmtVal(v: number | null, digits = 1): string {
  if (v == null) return "—";
  return digits === 0 ? String(Math.round(v)) : v.toFixed(digits);
}

function fmtZ(z: number | null): string {
  if (z == null) return "—";
  const s = z >= 0 ? "+" : "";
  return `${s}${z.toFixed(1)}`;
}

// ─── MD Day Options ───────────────────────────────────────────────────────────

const MD_DAY_OPTIONS: MdDay[] = [
  "MD-5", "MD-4", "MD-3", "MD-2", "MD-1", "MD", "MD+1", "MD+2", "MD+3",
];

// ─── Team Average Computation ─────────────────────────────────────────────────

type TeamMetricAvg = {
  metric: MdMetricKey;
  avgValue: number | null;
  avgSten: number | null;
  avgZScore: number | null;
  mdMean: number;
  playerCount: number;
};

function computeTeamAverages(players: PlayerMdComparison[], activeMetrics: MdMetricKey[]): {
  metrics: TeamMetricAvg[];
  overallSten: number | null;
} {
  const metrics: TeamMetricAvg[] = activeMetrics.map((key) => {
    const vals: number[] = [];
    const stens: number[] = [];
    const zScores: number[] = [];
    const means: number[] = [];

    for (const p of players) {
      const m = p.metrics.find((pm) => pm.metric === key);
      if (!m) continue;
      if (m.value != null) vals.push(m.value);
      if (m.sten != null) stens.push(m.sten);
      if (m.zScore != null) zScores.push(m.zScore);
      if (m.mdMean > 0) means.push(m.mdMean);
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    return {
      metric: key,
      avgValue: avg(vals),
      avgSten: stens.length > 0 ? Math.round(stens.reduce((a, b) => a + b, 0) / stens.length) : null,
      avgZScore: avg(zScores),
      mdMean: means.length > 0 ? means.reduce((a, b) => a + b, 0) / means.length : 0,
      playerCount: vals.length,
    };
  });

  // Overall team STEN
  const allStens = metrics.filter((m) => m.avgSten != null).map((m) => m.avgSten!);
  const overallSten = allStens.length > 0 ? Math.round(allStens.reduce((a, b) => a + b, 0) / allStens.length) : null;

  return { metrics, overallSten };
}

// ─── Component ────────────────────────────────────────────────────────────────

type MdMode = "planning" | "comparison";

export default function CoachMdComparisonCard({
  teamId,
  date,
  lang,
}: {
  teamId: string;
  date: string;
  lang: Lang;
}) {
  const t = COPY[lang];
  const [mode, setMode] = useState<MdMode>("planning");
  const [data, setData] = useState<MdComparisonResult | null>(null);
  const [planningData, setPlanningData] = useState<MdPlanningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mdOverride, setMdOverride] = useState<MdDay | "auto">("auto");
  const [planningMd, setPlanningMd] = useState<MdDay>("MD-2");
  const [showPlayers, setShowPlayers] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [selectedTeamMetric, setSelectedTeamMetric] = useState<MdMetricKey | null>(null);

  // ─── Comparison mode fetch ─────────────────────────────────
  const fetchComparison = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ teamId, date });
    if (mdOverride !== "auto") params.set("mdDay", mdOverride);

    fetch(`/api/coach/session-comparison?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message ?? "Fetch failed");
        setLoading(false);
      });
  }, [teamId, date, mdOverride]);

  // ─── Planning mode fetch ───────────────────────────────────
  const fetchPlanning = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ teamId, mdDay: planningMd });

    fetch(`/api/coach/md-planning?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setPlanningData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message ?? "Fetch failed");
        setLoading(false);
      });
  }, [teamId, planningMd]);

  useEffect(() => {
    if (mode === "comparison") fetchComparison();
    else fetchPlanning();
  }, [mode, fetchComparison, fetchPlanning]);

  // Determine which metrics to show: must have data AND be capability-available
  // (the lib's dayShare gate drops dead sprint_distance / IMA / FMP on Lite that a
  // single stray Pro-pod row would otherwise keep alive).
  const activeMetrics = useMemo(() => {
    if (!data || data.players.length === 0) return [];
    const avail = data.availableMetrics ? new Set(data.availableMetrics) : null;
    return data.players[0].metrics
      .filter((m) => (!avail || avail.has(m.metric)) && data.players.some((p) => p.metrics.find((pm) => pm.metric === m.metric && pm.value != null)))
      .map((m) => m.metric);
  }, [data]);

  // Compute team averages
  const teamAvg = useMemo(() => {
    if (!data || data.players.length === 0) return null;
    return computeTeamAverages(data.players, activeMetrics);
  }, [data, activeMetrics]);

  // ─── Mode Toggle ────────────────────────────────────────────────
  const ModeToggle = () => (
    <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
      <button
        onClick={() => setMode("planning")}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
          mode === "planning"
            ? "bg-white text-slate-800 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
        </svg>
        {t.planningMode}
      </button>
      <button
        onClick={() => setMode("comparison")}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
          mode === "comparison"
            ? "bg-white text-slate-800 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
        </svg>
        {t.comparisonMode}
      </button>
    </div>
  );

  // ─── Loading ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <ModeToggle />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <span className="text-sm text-slate-500">{t.loading}</span>
        </div>
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <ModeToggle />
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PLANNING MODE
  // ═══════════════════════════════════════════════════════════════════
  if (mode === "planning") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-bold text-slate-800">{t.planningTitle}</h3>
                <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-bold text-violet-700">
                  {planningMd}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{t.planningSubtitle}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <ModeToggle />
              <select
                value={planningMd}
                onChange={(e) => setPlanningMd(e.target.value as MdDay)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm"
              >
                {MD_DAY_OPTIONS.map((md) => (
                  <option key={md} value={md}>{md}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Planning content */}
        {planningData && planningData.sessionCount > 0 ? (
          <>
            <PlanningMetricsGrid planning={planningData} lang={lang} />
            <div className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100">
              {t.basedOn} {planningData.sessionCount} {planningData.mdDay} {t.sessionsAndPlayers} {planningData.playerCount} {t.playersLabel}
            </div>
          </>
        ) : (
          <div className="mx-4 mb-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <p className="text-sm font-medium text-slate-500">{t.noData}</p>
            <p className="mt-1 text-xs text-slate-400">{t.noDataSub}</p>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  COMPARISON MODE (existing)
  // ═══════════════════════════════════════════════════════════════════

  // ─── Empty ───────────────────────────────────────────────────────
  if (!data || data.players.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <ModeToggle />
        </div>
        <Header t={t} data={data} mdOverride={mdOverride} onMdChange={setMdOverride} />
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm font-medium text-slate-500">{t.noData}</p>
          <p className="mt-1 text-xs text-slate-400">{t.noDataSub}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div />
          <ModeToggle />
        </div>
        <Header t={t} data={data} mdOverride={mdOverride} onMdChange={setMdOverride} />
      </div>

      {/* ─── STEN Scale Legend ──────────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-slate-400 mr-1">{t.stenScale}:</span>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => {
            const c = stenColor(s);
            return (
              <div key={s} className={`w-5 h-5 rounded flex items-center justify-center font-bold ${c.bg} ${c.text} border ${c.border}`}>
                {s}
              </div>
            );
          })}
          <div className="flex items-center gap-2 ml-2 text-[9px] text-slate-400">
            <span>← {t.lowLoad}</span>
            <span>{t.normalLoad}</span>
            <span>{t.highLoad} →</span>
          </div>
        </div>
      </div>

      {/* ─── Team Summary ──────────────────────────────────────── */}
      {teamAvg && (
        <div className="mx-4 mb-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white overflow-hidden">
          {/* Team header row */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100">
                <svg className="h-4 w-4 text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.97 5.97 0 00-.94-3.21A4.001 4.001 0 0119 17v1h-3zM4.26 13.79A6 6 0 003.34 17H1v-1a4 4 0 012.26-3.6z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">{t.teamAverage}</h4>
                <p className="text-[10px] text-slate-400">{data.players.length} {t.players.toLowerCase()}</p>
              </div>
            </div>
            <OverallBadge sten={teamAvg.overallSten} lang={lang} size="lg" />
          </div>

          {/* Team STEN heatmap row */}
          <div className="px-4 py-3">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${activeMetrics.length}, minmax(0, 1fr))` }}>
              {teamAvg.metrics.map((tm) => {
                const label = MD_METRIC_LABELS[tm.metric];
                const c = stenColor(tm.avgSten);
                const isSelected = selectedTeamMetric === tm.metric;
                return (
                  <div
                    key={tm.metric}
                    onClick={() => setSelectedTeamMetric(isSelected ? null : tm.metric)}
                    className={`rounded-lg border ${c.border} ${c.bg} p-2 text-center cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-indigo-400 shadow-md" : ""}`}
                  >
                    <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                      {lang === "IS" ? label.is : label.en}
                    </div>
                    <div className={`mt-1 text-lg font-bold tabular-nums ${c.text}`}>
                      {tm.avgSten ?? "—"}
                    </div>
                    <div className="text-[9px] text-slate-400 tabular-nums mt-0.5">
                      {fmtVal(tm.avgValue, 0)} <span className="text-slate-300">/ {fmtVal(tm.mdMean, 0)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Expanded metric detail */}
            {selectedTeamMetric && data && (() => {
              const metricKey = selectedTeamMetric;
              const label = MD_METRIC_LABELS[metricKey];
              const metricName = lang === "IS" ? label.is : label.en;
              const tm = teamAvg.metrics.find((m) => m.metric === metricKey);

              // Gather per-player data for this metric, sorted by value desc
              const playerMetrics = data.players
                .map((p) => {
                  const m = p.metrics.find((pm) => pm.metric === metricKey);
                  return {
                    name: p.playerName,
                    value: m?.value ?? null,
                    sten: m?.sten ?? null,
                    zScore: m?.zScore ?? null,
                    mdMean: m?.mdMean ?? 0,
                    mdStdDev: m?.mdStdDev ?? 0,
                  };
                })
                .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

              const allValues = playerMetrics.map((p) => p.value).filter((v): v is number => v != null);
              const minVal = allValues.length ? Math.min(...allValues) : 0;
              const maxVal = allValues.length ? Math.max(...allValues) : 0;

              return (
                <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-800">
                      {metricName} {label.unit && <span className="text-xs font-normal text-slate-400">({label.unit})</span>}
                    </h4>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedTeamMetric(null); }}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >✕</button>
                  </div>

                  {/* Summary stats */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg bg-white border border-slate-200 p-2">
                      <div className="text-[9px] text-slate-400 uppercase">{t.mean}</div>
                      <div className="text-base font-bold tabular-nums text-slate-800">{fmtVal(tm?.avgValue ?? null, label.unit === "#" ? 0 : 0)}</div>
                    </div>
                    <div className="rounded-lg bg-white border border-slate-200 p-2">
                      <div className="text-[9px] text-slate-400 uppercase">{t.mdAvg}</div>
                      <div className="text-base font-bold tabular-nums text-slate-600">{fmtVal(tm?.mdMean ?? 0, 0)}</div>
                    </div>
                    <div className="rounded-lg bg-white border border-slate-200 p-2">
                      <div className="text-[9px] text-slate-400 uppercase">{t.min}</div>
                      <div className="text-base font-bold tabular-nums text-blue-600">{fmtVal(minVal, 0)}</div>
                    </div>
                    <div className="rounded-lg bg-white border border-slate-200 p-2">
                      <div className="text-[9px] text-slate-400 uppercase">{t.max}</div>
                      <div className="text-base font-bold tabular-nums text-rose-600">{fmtVal(maxVal, 0)}</div>
                    </div>
                  </div>

                  {/* Per-player bar chart */}
                  <div className="space-y-1.5">
                    {playerMetrics.map((p) => {
                      const barPct = maxVal > 0 && p.value != null ? (p.value / maxVal) * 100 : 0;
                      const c = stenColor(p.sten);
                      const mdPct = maxVal > 0 && p.mdMean > 0 ? (p.mdMean / maxVal) * 100 : 0;
                      return (
                        <div key={p.name} className="flex items-center gap-2">
                          <div className="w-28 text-[10px] font-medium text-slate-600 truncate text-right">{p.name}</div>
                          <div className="flex-1 relative h-5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`absolute inset-y-0 left-0 rounded-full ${c.bg} border ${c.border}`} style={{ width: `${barPct}%` }} />
                            {mdPct > 0 && (
                              <div className="absolute inset-y-0 w-0.5 bg-slate-400" style={{ left: `${Math.min(mdPct, 100)}%` }} title={`MD avg: ${fmtVal(p.mdMean, 0)}`} />
                            )}
                          </div>
                          <div className="w-12 text-right text-[10px] tabular-nums font-semibold text-slate-700">
                            {p.value != null ? fmtVal(p.value, 0) : "—"}
                          </div>
                          <div className={`w-6 text-center text-[10px] font-bold rounded ${c.bg} ${c.text}`}>
                            {p.sten ?? "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-[9px] text-slate-400">
                    Lóðrétt lína = MD meðaltal sögulegra æfinga · Litir = STEN einkunn (1-10)
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ─── Toggle Players ────────────────────────────────────── */}
      <div className="px-4 pb-2">
        <button
          onClick={() => setShowPlayers(!showPlayers)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          <svg
            className={`h-3 w-3 transition-transform ${showPlayers ? "rotate-180" : ""}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {showPlayers ? t.hidePlayers : t.showPlayers} ({data.players.length})
        </button>
      </div>

      {/* ─── Player Heatmap Table ──────────────────────────────── */}
      {showPlayers && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-t border-b border-slate-100 bg-slate-50/80">
                <th className="sticky left-0 z-10 bg-slate-50/80 px-3 py-2 text-left font-semibold text-slate-600">
                  {t.player}
                </th>
                {activeMetrics.map((key) => {
                  const label = MD_METRIC_LABELS[key];
                  return (
                    <th key={key} className="px-2 py-2 text-center font-semibold text-slate-500 whitespace-nowrap">
                      <div className="text-[10px]">{lang === "IS" ? label.is : label.en}</div>
                      {label.unit && <div className="text-[8px] font-normal text-slate-400">{label.unit}</div>}
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-center font-semibold text-slate-600">
                  {t.overall}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.players.map((player) => {
                const isExpanded = expandedPlayer === player.playerId;
                return (
                  <React.Fragment key={player.playerId}>
                    <tr
                      className="border-b border-slate-50 cursor-pointer hover:bg-slate-50/50 transition-colors"
                      onClick={() => setExpandedPlayer(isExpanded ? null : player.playerId)}
                    >
                      {/* Player name */}
                      <td className="sticky left-0 z-10 bg-white px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{player.playerName}</span>
                          {player.dataQuality === "insufficient" && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-semibold text-slate-400">
                              {t.insufficient}
                            </span>
                          )}
                          {player.dataQuality === "limited" && (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[8px] font-semibold text-amber-500">
                              {t.limited}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Metric STEN cells */}
                      {activeMetrics.map((key) => {
                        const m = player.metrics.find((pm) => pm.metric === key);
                        return <StenCell key={key} score={m ?? null} />;
                      })}

                      {/* Overall STEN */}
                      <td className="px-3 py-2.5 text-center">
                        <OverallBadge sten={player.overallSten} lang={lang} />
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/30">
                        <td colSpan={activeMetrics.length + 2} className="px-3 py-3">
                          <PlayerDetailRow player={player} activeMetrics={activeMetrics} lang={lang} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100">
        {t.histSessions} {data.historicalSessionCount} {data.mdDay} {t.sessions}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Header({
  t,
  data,
  mdOverride,
  onMdChange,
}: {
  t: (typeof COPY)["IS"] | (typeof COPY)["EN"];
  data: MdComparisonResult | null;
  mdOverride: MdDay | "auto";
  onMdChange: (v: MdDay | "auto") => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">{t.title}</h3>
          {data?.mdDay && (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
              {data.mdDay}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">{t.subtitle}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <select
          value={mdOverride}
          onChange={(e) => onMdChange(e.target.value as MdDay | "auto")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm"
        >
          <option value="auto">{t.auto}</option>
          {MD_DAY_OPTIONS.map((md) => (
            <option key={md} value={md}>{md}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StenCell({ score }: { score: MdMetricScore | null }) {
  if (!score || score.sten == null) {
    return (
      <td className="px-2 py-2.5 text-center">
        <div className="inline-flex h-7 w-7 items-center justify-center rounded bg-slate-50 text-[10px] text-slate-300">
          —
        </div>
      </td>
    );
  }

  const c = stenColor(score.sten);
  return (
    <td className="px-2 py-2.5 text-center">
      <div
        className={`inline-flex h-7 min-w-[28px] items-center justify-center rounded font-bold text-sm tabular-nums ${c.bg} ${c.text} border ${c.border}`}
        title={`Value: ${fmtVal(score.value)} | Mean: ${fmtVal(score.mdMean)} | Z: ${fmtZ(score.zScore)} | n=${score.sampleSize}`}
      >
        {score.sten}
      </div>
    </td>
  );
}

function OverallBadge({ sten, lang, size = "sm" }: { sten: number | null; lang: Lang; size?: "sm" | "lg" }) {
  if (sten == null) return <span className="text-slate-300">—</span>;
  const c = stenColor(sten);
  const band = stenBand(sten, lang);

  if (size === "lg") {
    return (
      <div className="inline-flex flex-col items-center gap-1">
        <div className={`rounded-full px-4 py-1.5 font-bold text-lg tabular-nums ${c.bg} ${c.text} border ${c.border}`}>
          {sten}
        </div>
        <span className="text-[10px] font-medium text-slate-500">{band}</span>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className={`rounded-full px-3 py-1 font-bold text-sm tabular-nums ${c.bg} ${c.text} border ${c.border}`}>
        {sten}
      </div>
      <span className="text-[8px] text-slate-400">{band}</span>
    </div>
  );
}

function PlayerDetailRow({
  player,
  activeMetrics,
  lang,
}: {
  player: PlayerMdComparison;
  activeMetrics: MdMetricKey[];
  lang: Lang;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
      {activeMetrics.map((key) => {
        const m = player.metrics.find((pm) => pm.metric === key);
        if (!m || m.value == null) return null;
        const label = MD_METRIC_LABELS[key];
        const c = stenColor(m.sten);
        return (
          <div key={key} className={`rounded-lg border ${c.border} ${c.bg} p-2`}>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              {lang === "IS" ? label.is : label.en}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={`text-base font-bold tabular-nums ${c.text}`}>{fmtVal(m.value)}</span>
              <span className="text-[9px] text-slate-400">{label.unit}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[9px]">
              <span className="text-slate-400">
                μ={fmtVal(m.mdMean)} σ={fmtVal(m.mdStdDev)}
              </span>
              <span className={`font-semibold ${c.text}`}>
                Z={fmtZ(m.zScore)} → STEN {m.sten}
              </span>
            </div>
            <div className="text-[8px] text-slate-300 mt-0.5">n={m.sampleSize}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Planning Mode Grid ──────────────────────────────────────────────────────

function PlanningMetricsGrid({ planning, lang }: { planning: MdPlanningResult; lang: Lang }) {
  const t = COPY[lang];

  return (
    <div className="px-4 pb-4 space-y-3">
      {/* Main metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {planning.metrics.map((pm) => {
          const label = MD_METRIC_LABELS[pm.metric];
          const hasData = pm.sampleSize >= 1;

          return (
            <div
              key={pm.metric}
              className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/50 p-3 transition-shadow hover:shadow-sm"
            >
              {/* Metric name */}
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                {lang === "IS" ? label.is : label.en}
              </div>

              {hasData ? (
                <>
                  {/* Mean value — the main number */}
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-xl font-bold tabular-nums text-slate-800">
                      {fmtVal(pm.mean, pm.unit === "#" ? 0 : 0)}
                    </span>
                    {pm.unit && <span className="text-[10px] text-slate-400">{pm.unit}</span>}
                  </div>

                  {/* Normal band bar visualization */}
                  <div className="mt-2">
                    <div className="text-[8px] text-slate-400 mb-1">{t.normalBand}</div>
                    <PlanningBar low={pm.low} high={pm.high} min={pm.min} max={pm.max} mean={pm.mean} />
                  </div>

                  {/* Stats row */}
                  <div className="mt-2 flex items-center justify-between text-[9px] text-slate-400">
                    <span>{t.min}: {fmtVal(pm.min, 0)}</span>
                    <span>{t.max}: {fmtVal(pm.max, 0)}</span>
                  </div>

                  <div className="mt-1 text-[8px] text-slate-300">
                    σ={fmtVal(pm.stdDev, 1)} · n={pm.sampleSize}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-xs text-slate-300">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Visual bar showing the normal band (μ±1σ), range (min–max), and mean.
 * Hand-built SVG for consistency with the project's approach.
 */
function PlanningBar({
  low, high, min, max, mean,
}: {
  low: number; high: number; min: number; max: number; mean: number;
}) {
  // Compute positions as percentages
  const rangeMin = Math.min(min, low);
  const rangeMax = Math.max(max, high);
  const span = rangeMax - rangeMin || 1;

  const pct = (v: number) => ((v - rangeMin) / span) * 100;

  const lowPct = Math.max(0, pct(low));
  const highPct = Math.min(100, pct(high));
  const meanPct = pct(mean);

  return (
    <div className="relative h-5">
      {/* Full range background */}
      <div className="absolute inset-y-1.5 left-0 right-0 rounded-full bg-slate-100" />
      {/* Normal band (μ±1σ) */}
      <div
        className="absolute inset-y-1 rounded-full bg-emerald-200/70 border border-emerald-300/50"
        style={{ left: `${lowPct}%`, width: `${Math.max(highPct - lowPct, 2)}%` }}
      />
      {/* Mean marker */}
      <div
        className="absolute top-0 h-5 w-0.5 rounded-full bg-slate-700"
        style={{ left: `${meanPct}%` }}
      />
    </div>
  );
}
