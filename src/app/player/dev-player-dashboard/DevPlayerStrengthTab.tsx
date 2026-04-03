"use client";

import React, { useEffect, useState } from "react";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";
import type { VbtExercisePB, VbtTodayVsPB, VbtLoadBreakdown } from "@/lib/micropulse/vbtReadiness/personalBest";

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Unauthorized");
  return { Authorization: `Bearer ${token}` };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type VbtResponse = {
  date: string;
  exercises: VbtExercisePB[];
  todayComparisons: VbtTodayVsPB[];
  recentHistory: Array<{
    date: string;
    sets: Array<{
      exerciseName: string;
      meanVelocity: number;
      loadKg: number | null;
      peakPower: number | null;
      reps: number | null;
      pbVelocityAtLoad: number | null;
      pbDiffPct: number | null;
      isPB: boolean;
    }>;
  }>;
  loadBreakdowns: Record<string, VbtLoadBreakdown[]>;
  totalSets: number;
};

// ─── Copy ────────────────────────────────────────────────────────────────────

const COPY = {
  IS: {
    title: "Styrkur / VBT",
    loading: "Hleð gögnum...",
    noData: "Engin VBT gögn fundust.",
    noDataSub: "Ýttu á samstilla til að sækja gögn frá GymAware.",
    exercise: "Æfing",
    bestLoad: "Hæsta þyngd",
    bestVelocity: "Besti hraði",
    bestPower: "Besti kraftur",
    est1rm: "Áætlað 1RM",
    sessions: "Lotur",
    todayVsPb: "Dagurinn í dag",
    todayVelocity: "Hraði í dag",
    pbVelocity: "PB hraði",
    diff: "Munur",
    newPb: "NÝTT PB!",
    load: "Þyngd",
    power: "Kraftur",
    pbRecords: "Persónuleg met",
    recentHistory: "Nýlegar æfingar",
    date: "Dagsetning",
    noTodayData: "Engin æfing skráð í dag",
    totalSets: "sett skráð",
    loadBreakdown: "Þyngdasundurliðun",
    velocity: "Hraði",
    peakPower: "Hámarkskraftur",
    sets: "Sett",
    sync: "Samstilla",
    syncing: "Samstilli...",
    syncDone: "Samstilling lokið",
    syncError: "Villa",
    best: "Best",
  },
  EN: {
    title: "Strength / VBT",
    loading: "Loading data...",
    noData: "No VBT data found.",
    noDataSub: "Tap sync to fetch data from GymAware.",
    exercise: "Exercise",
    bestLoad: "Best Load",
    bestVelocity: "Best Velocity",
    bestPower: "Best Power",
    est1rm: "Est. 1RM",
    sessions: "Sessions",
    todayVsPb: "Today's Session",
    todayVelocity: "Today",
    pbVelocity: "PB",
    diff: "Diff",
    newPb: "NEW PB!",
    load: "Load",
    power: "Power",
    pbRecords: "Personal Bests",
    recentHistory: "Recent Sessions",
    date: "Date",
    noTodayData: "No session recorded today",
    totalSets: "sets recorded",
    loadBreakdown: "Load Breakdown",
    velocity: "Velocity",
    peakPower: "Peak Power",
    sets: "Sets",
    sync: "Sync",
    syncing: "Syncing...",
    syncDone: "Sync complete",
    syncError: "Error",
    best: "Best",
  },
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtV(v: number | null): string {
  return v != null ? `${v.toFixed(2)}` : "—";
}
function fmtKg(v: number | null): string {
  return v != null ? `${v.toFixed(1)}` : "—";
}
function fmtW(v: number | null): string {
  return v != null ? `${Math.round(v)}` : "—";
}
function fmtPct(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
function pctColor(v: number | null): string {
  if (v == null) return "text-zinc-400";
  if (v > 2) return "text-emerald-600";
  if (v > -5) return "text-zinc-600";
  if (v > -15) return "text-amber-600";
  return "text-rose-600";
}
function pctBg(v: number | null): string {
  if (v == null) return "bg-zinc-50 border-zinc-200";
  if (v > 2) return "bg-emerald-50/60 border-emerald-200";
  if (v > -5) return "bg-zinc-50 border-zinc-200";
  if (v > -15) return "bg-amber-50/60 border-amber-200";
  return "bg-rose-50/60 border-rose-200";
}
function fmtDateShort(d: string): string {
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parseInt(parts[2])}. ${parseInt(parts[1])}.`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

// Color themes for each metric type
const METRIC_THEMES = {
  velocity: { bg: "bg-sky-50/70", border: "border-sky-200", accent: "text-sky-700", dot: "bg-sky-500" },
  power:    { bg: "bg-violet-50/70", border: "border-violet-200", accent: "text-violet-700", dot: "bg-violet-500" },
  load:     { bg: "bg-amber-50/70", border: "border-amber-200", accent: "text-amber-700", dot: "bg-amber-500" },
  neutral:  { bg: "bg-zinc-50", border: "border-zinc-200", accent: "text-zinc-700", dot: "bg-zinc-400" },
} as const;

type MetricTheme = keyof typeof METRIC_THEMES;

function MetricCard({ label, value, unit, sub, theme = "neutral" }: { label: string; value: string; unit: string; sub?: string; theme?: MetricTheme }) {
  const c = METRIC_THEMES[theme];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-3`}>
      <div className="flex items-center gap-1.5">
        <div className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
        <p className={`text-[10px] font-semibold uppercase tracking-widest ${c.accent} opacity-70`}>{label}</p>
      </div>
      <p className={`mt-1 text-xl font-bold tabular-nums ${c.accent}`}>
        {value} <span className="text-sm font-normal opacity-50">{unit}</span>
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-400">{sub}</p>}
    </div>
  );
}

function SyncButton({ syncing, syncResult, syncError, onSync, t }: {
  syncing: boolean;
  syncResult: string | null;
  syncError: boolean;
  onSync: () => void;
  t: (typeof COPY)["IS"] | (typeof COPY)["EN"];
}) {
  return (
    <div className="flex items-center gap-2">
      {syncResult && (
        <span className={`text-[10px] font-medium ${syncError ? "text-rose-500" : "text-emerald-600"}`}>
          {syncResult}
        </span>
      )}
      <button
        onClick={onSync}
        disabled={syncing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 8a6 6 0 0 1 10.3-4.1M14 8a6 6 0 0 1-10.3 4.1" strokeLinecap="round" />
          <path d="M12 1v3.5h-3.5M4 15v-3.5h3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {syncing ? t.syncing : t.sync}
      </button>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DevPlayerStrengthTab() {
  const [lang] = useLang();
  const t = COPY[lang];
  const [data, setData] = useState<VbtResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);

    getAuthHeader()
      .then((headers) => fetch(`/api/player/vbt?date=${today}`, { headers }))
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
  }, []);

  const triggerSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncError(false);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/player/vbt/sync", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSyncResult(json.error ?? "Unknown error");
        setSyncError(true);
      } else {
        const r = json.result;
        setSyncResult(
          `${r.setsFetched} ${lang === "IS" ? "sett sótt" : "sets fetched"}, ${r.setsStored} ${lang === "IS" ? "vistuð" : "stored"}`
        );
        fetchData();
      }
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : "Unknown");
      setSyncError(true);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
        <span className="ml-3 text-sm text-zinc-500">{t.loading}</span>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
        <p className="text-sm font-medium text-rose-700">{error}</p>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────
  if (!data || (data.exercises.length === 0 && data.todayComparisons.length === 0)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t.title}</h2>
          <SyncButton syncing={syncing} syncResult={syncResult} syncError={syncError} onSync={triggerSync} t={t} />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100">
            <svg className="h-5 w-5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.5 3A2.5 2.5 0 003 5.5v2.879a2.5 2.5 0 00.732 1.767l6.5 6.5a2.5 2.5 0 003.536 0l2.878-2.878a2.5 2.5 0 000-3.536l-6.5-6.5A2.5 2.5 0 008.38 3H5.5zM6 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-600">{t.noData}</p>
          <p className="mt-1 text-xs text-zinc-400">{t.noDataSub}</p>
        </div>
      </div>
    );
  }

  // ─── Compute summary metrics for hero cards ─────────────────────
  const topExercise = data.exercises.reduce<VbtExercisePB | null>(
    (best, ex) => (!best || (ex.bestMeanVelocity ?? 0) > (best.bestMeanVelocity ?? 0) ? ex : best),
    null,
  );
  const topPower = data.exercises.reduce<VbtExercisePB | null>(
    (best, ex) => (!best || (ex.bestPeakPower ?? 0) > (best.bestPeakPower ?? 0) ? ex : best),
    null,
  );

  return (
    <div className="space-y-5">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t.title}</h2>
        <SyncButton syncing={syncing} syncResult={syncResult} syncError={syncError} onSync={triggerSync} t={t} />
      </div>

      {/* ─── Hero metric cards ──────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <MetricCard
          label={t.bestVelocity}
          value={topExercise ? fmtV(topExercise.bestMeanVelocity) : "—"}
          unit="m/s"
          sub={topExercise?.exerciseName}
          theme="velocity"
        />
        <MetricCard
          label={t.bestPower}
          value={topPower?.bestPeakPower != null ? fmtW(topPower.bestPeakPower) : "—"}
          unit="W"
          sub={topPower?.exerciseName}
          theme="power"
        />
        <MetricCard
          label={t.bestLoad}
          value={data.exercises.reduce((max, ex) => Math.max(max, ex.bestLoadKg ?? 0), 0) > 0
            ? fmtKg(data.exercises.reduce((max, ex) => Math.max(max, ex.bestLoadKg ?? 0), 0))
            : "—"}
          unit="kg"
          theme="load"
        />
        <MetricCard
          label={t.sessions}
          value={String(data.totalSets)}
          unit={t.totalSets}
          theme="neutral"
        />
      </div>

      {/* ─── Today vs PB ──────────────────────────────────────────── */}
      {data.todayComparisons.length > 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 mb-3">{t.todayVsPb}</h3>
          <div className="space-y-2">
            {data.todayComparisons.map((c) => (
              <div key={c.exerciseName} className={`rounded-xl border p-3 ${pctBg(c.velocityVsPbPct)}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-zinc-800">{c.exerciseName}</span>
                  <div className="flex items-center gap-2">
                    {c.isNewPB && (
                      <span className="inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        {t.newPb}
                      </span>
                    )}
                    <span className={`text-sm font-bold tabular-nums ${pctColor(c.velocityVsPbPct)}`}>
                      {fmtPct(c.velocityVsPbPct)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span>{t.load}: <span className="font-semibold text-amber-700">{fmtKg(c.todayLoadKg)} kg</span></span>
                  <span>{t.todayVelocity}: <span className="font-semibold text-sky-700">{fmtV(c.todayMeanVelocity)} m/s</span></span>
                  <span>{t.pbVelocity}: <span className="text-sky-500/70">{fmtV(c.pbMeanVelocityAtLoad)} m/s</span></span>
                  {c.todayPeakPower != null && (
                    <span>{t.power}: <span className="font-semibold text-violet-700">{fmtW(c.todayPeakPower)} W</span></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-5 text-center">
          <p className="text-xs text-zinc-400">{t.noTodayData}</p>
        </div>
      )}

      {/* ─── Exercise Overview (PB + Load Profile merged) ─────────── */}
      {data.exercises.length > 0 && (
        <div className="space-y-3">
          {data.exercises.map((ex) => {
            const loads = data.loadBreakdowns?.[ex.exerciseName] ?? [];
            const hasMultipleLoads = loads.length > 1;

            return (
              <div key={ex.exerciseName} className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                {/* Exercise header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <span className="text-sm font-bold text-zinc-800">{ex.exerciseName}</span>
                  <div className="flex items-center gap-3">
                    {ex.estimated1RM != null && (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                        {t.est1rm} <span className="font-bold text-zinc-800">{ex.estimated1RM} kg</span>
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-400">{ex.totalSessions} {t.sessions.toLowerCase()}</span>
                  </div>
                </div>

                {/* PB summary row */}
                <div className="grid grid-cols-3 gap-px mx-4 mb-3 rounded-lg overflow-hidden">
                  <div className="bg-amber-50/80 px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-amber-500">{t.bestLoad}</p>
                    <p className="text-base font-bold tabular-nums text-amber-800">{fmtKg(ex.bestLoadKg)} <span className="text-[10px] font-normal text-amber-500">kg</span></p>
                  </div>
                  <div className="bg-sky-50/80 px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-sky-500">{t.bestVelocity}</p>
                    <p className="text-base font-bold tabular-nums text-sky-800">{fmtV(ex.bestMeanVelocity)} <span className="text-[10px] font-normal text-sky-500">m/s</span></p>
                  </div>
                  <div className="bg-violet-50/80 px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-violet-500">{t.bestPower}</p>
                    <p className="text-base font-bold tabular-nums text-violet-800">{fmtW(ex.bestPeakPower)} <span className="text-[10px] font-normal text-violet-500">W</span></p>
                  </div>
                </div>

                {/* Load profile (only if multiple loads exist) */}
                {hasMultipleLoads && (
                  <div className="border-t border-zinc-100 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">{t.loadBreakdown}</p>
                    <div className="space-y-1">
                      {loads.map((lb) => (
                        <div key={lb.loadKg} className="flex items-center gap-2.5 rounded-lg bg-zinc-50/70 px-2.5 py-1.5 text-xs">
                          <span className="min-w-[52px] font-bold tabular-nums text-amber-700">{fmtKg(lb.loadKg)} <span className="text-[9px] font-normal text-amber-400">kg</span></span>
                          <div className="h-3.5 w-px bg-zinc-200" />
                          <span className="min-w-[52px] font-medium tabular-nums text-sky-700">{fmtV(lb.bestMeanVelocity)} <span className="text-sky-400">m/s</span></span>
                          {lb.bestPeakPower != null && (
                            <>
                              <div className="h-3.5 w-px bg-zinc-200" />
                              <span className="min-w-[44px] font-medium tabular-nums text-violet-600">{fmtW(lb.bestPeakPower)} <span className="text-violet-400">W</span></span>
                            </>
                          )}
                          <div className="flex-1" />
                          <span className="text-[10px] text-zinc-400">{fmtDateShort(lb.bestDate)}</span>
                          <span className="text-[10px] tabular-nums text-zinc-300">{lb.sets}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Recent History ───────────────────────────────────────── */}
      {data.recentHistory.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{t.recentHistory}</h3>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[80px_1fr_72px_72px_72px_48px_56px] gap-1 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-widest border-b border-zinc-100">
            <span className="text-zinc-400">{t.date}</span>
            <span className="text-zinc-400">{t.exercise}</span>
            <span className="text-amber-500 text-right">{t.load}</span>
            <span className="text-sky-500 text-right">{t.velocity}</span>
            <span className="text-violet-500 text-right">{t.power}</span>
            <span className="text-zinc-400 text-right">Reps</span>
            <span className="text-zinc-400 text-right">vs PB</span>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-zinc-50">
            {data.recentHistory.slice(0, 8).map((session) => {
              const exercises = new Map<string, typeof session.sets>();
              for (const s of session.sets) {
                const arr = exercises.get(s.exerciseName) ?? [];
                arr.push(s);
                exercises.set(s.exerciseName, arr);
              }

              return Array.from(exercises.entries()).map(([exerciseName, sets]) =>
                sets.map((s, i) => {
                  const isFirstOfExercise = i === 0;
                  // Check if this is the first row for this date across all exercises
                  const isFirstOfDate = isFirstOfExercise && Array.from(exercises.keys())[0] === exerciseName;

                  return (
                    <div
                      key={`${session.date}-${exerciseName}-${i}`}
                      className={`grid grid-cols-[80px_1fr_72px_72px_72px_48px_56px] gap-1 px-4 py-1.5 text-xs items-center ${
                        isFirstOfDate && session !== data.recentHistory[0] ? "border-t border-zinc-100" : ""
                      } ${s.isPB ? "bg-emerald-50/30" : "hover:bg-zinc-50/50"}`}
                    >
                      {/* Date (only show on first row of each day) */}
                      <span className={`text-[11px] tabular-nums ${isFirstOfDate ? "font-semibold text-zinc-600" : "text-transparent"}`}>
                        {fmtDateShort(session.date)}
                      </span>

                      {/* Exercise name (only show on first row of each exercise) */}
                      <span className={`truncate ${isFirstOfExercise ? "font-medium text-zinc-700" : "text-transparent"}`}>
                        {exerciseName}
                      </span>

                      {/* Load */}
                      <span className="text-right tabular-nums font-semibold text-amber-700">
                        {fmtKg(s.loadKg)}
                      </span>

                      {/* Velocity */}
                      <span className="text-right tabular-nums font-medium text-sky-700">
                        {fmtV(s.meanVelocity)}
                      </span>

                      {/* Power */}
                      <span className="text-right tabular-nums text-violet-600">
                        {s.peakPower != null ? fmtW(s.peakPower) : "—"}
                      </span>

                      {/* Reps */}
                      <span className="text-right tabular-nums text-zinc-400">
                        {s.reps ?? "—"}
                      </span>

                      {/* PB diff */}
                      <span className={`text-right text-[11px] font-semibold tabular-nums ${s.isPB ? "text-emerald-600" : pctColor(s.pbDiffPct)}`}>
                        {s.isPB ? (
                          <span className="inline-flex items-center justify-end gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">PB</span>
                        ) : s.pbDiffPct != null ? (
                          fmtPct(s.pbDiffPct)
                        ) : "—"}
                      </span>
                    </div>
                  );
                })
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
