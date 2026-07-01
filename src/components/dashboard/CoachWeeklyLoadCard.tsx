"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  WeeklyLoadResult,
  WeeklyLoadMetricKey,
  WeeklyLoadMetricSummary,
  WeeklyLoadTargetMeta,
} from "@/lib/micropulse/externalLoad/weeklyLoadTypes";
import { WEEKLY_LOAD_LABELS } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";
import LoadTargetSettingsModal from "./LoadTargetSettingsModal";

// ─── Types ──────────────────────────────────────────────────────────────────

type Lang = "IS" | "EN";

// ─── Copy ───────────────────────────────────────────────────────────────────

const COPY = {
  IS: {
    title: "Vikuálag",
    subtitle: "Uppsafnað GPS álag vikunnar samanborið við söguleg meðaltöl",
    loading: "Hleð vikuálagi...",
    noData: "Engin GPS gögn fundust fyrir þessa viku.",
    ofTypical: "af dæmigerðri viku",
    ofTarget: "af markmiði",
    projected: "Áætlað",
    typical: "Dæmigert",
    target: "Markmið",
    current: "Núverandi",
    day: "dagur",
    days: "dagar",
    of: "af",
    basedOn: "Byggt á",
    historicalWeeks: "sögulegum vikum",
    onTrack: "Á réttu braut",
    belowTarget: "Undir markmiði",
    aboveTarget: "Yfir markmiði",
    weekProgress: "Vikuframvinda",
    mode: "Stilling",
    modeBaseline: "Söguleg meðaltöl",
    modeMatchDemand: "Leikálag",
    modeCoachWeekly: "Markmið þjálfara",
    settings: "Stillingar",
    mesoBuild: "Uppbygging",
    mesoMaintain: "Viðhald",
    mesoTaper: "Lækkun",
    matchesSampled: "leikir",
    noMatchesWarningTitle: "Engir leikir fundust",
    noMatchesWarningBody: "Leikálag-aðferðin þarf nýlega leiki til að reikna markmið. Merktu leikina í áætlun (week_plans / schedule) eða stilltu leik-detection þröskuldinn í stillingum.",
  },
  EN: {
    title: "Weekly Load",
    subtitle: "Cumulative GPS load this week vs historical averages",
    loading: "Loading weekly load...",
    noData: "No GPS data found for this week.",
    ofTypical: "of typical week",
    ofTarget: "of target",
    projected: "Projected",
    typical: "Typical",
    target: "Target",
    current: "Current",
    day: "day",
    days: "days",
    of: "of",
    basedOn: "Based on",
    historicalWeeks: "historical weeks",
    onTrack: "On track",
    belowTarget: "Below target",
    aboveTarget: "Above target",
    weekProgress: "Week progress",
    mode: "Mode",
    modeBaseline: "Historical baseline",
    modeMatchDemand: "Match demand",
    modeCoachWeekly: "Coach target",
    settings: "Settings",
    mesoBuild: "Build",
    mesoMaintain: "Maintain",
    mesoTaper: "Taper",
    matchesSampled: "matches",
    noMatchesWarningTitle: "No matches found",
    noMatchesWarningBody: "Match demand mode needs recent matches to compute a target. Mark matches in the schedule (week_plans / schedule) or tune the match detection threshold in settings.",
  },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(v: number, digits = 0): string {
  if (digits === 0) return Math.round(v).toLocaleString("is-IS");
  return v.toFixed(digits);
}

function pctColor(pct: number | null, expectedPct: number, corridorPct = 0.15): {
  text: string; bg: string; ring: string; label: string; labelColor: string;
} {
  if (pct == null) return { text: "text-slate-400", bg: "bg-slate-100", ring: "stroke-slate-300", label: "—", labelColor: "text-slate-400" };
  const ratio = pct / expectedPct;
  const low = 1 - corridorPct;
  const high = 1 + corridorPct;
  const amberHigh = 1 + corridorPct * 2;
  if (ratio < low) return { text: "text-blue-600", bg: "bg-blue-50", ring: "stroke-blue-400", label: "↓", labelColor: "text-blue-600" };
  if (ratio <= high) return { text: "text-emerald-600", bg: "bg-emerald-50", ring: "stroke-emerald-500", label: "✓", labelColor: "text-emerald-600" };
  if (ratio <= amberHigh) return { text: "text-amber-600", bg: "bg-amber-50", ring: "stroke-amber-400", label: "↑", labelColor: "text-amber-600" };
  return { text: "text-rose-600", bg: "bg-rose-50", ring: "stroke-rose-500", label: "⚠", labelColor: "text-rose-600" };
}

function statusLabel(pct: number | null, expectedPct: number, lang: Lang, corridorPct = 0.15): string {
  const t = COPY[lang];
  if (pct == null) return "—";
  const ratio = pct / expectedPct;
  const low = 1 - corridorPct;
  const high = 1 + corridorPct;
  if (ratio < low) return t.belowTarget;
  if (ratio <= high) return t.onTrack;
  return t.aboveTarget;
}

/**
 * For a given metric summary, pick the reference value + pct to display.
 * In non-baseline modes we prefer the coach/match-demand target when present;
 * otherwise fall back to the historical typical week.
 */
function pickReference(
  metric: WeeklyLoadMetricSummary,
  mode: WeeklyLoadTargetMeta["mode"] | undefined
): { pct: number | null; referenceValue: number; isTarget: boolean } {
  const useTarget =
    mode && mode !== "baseline" &&
    metric.targetWeekTotal != null && metric.targetWeekTotal > 0 &&
    metric.pctOfTarget != null;
  if (useTarget) {
    return {
      pct: metric.pctOfTarget ?? null,
      referenceValue: metric.targetWeekTotal as number,
      isTarget: true,
    };
  }
  return {
    pct: metric.pctOfTypical,
    referenceValue: metric.typicalWeekTotal,
    isTarget: false,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

type PlayerOption = { id: string; name: string };
type ViewMode = "team" | "player";

export default function CoachWeeklyLoadCard({
  teamId,
  lang,
  date,
  group,
  title,
  subtitle,
}: {
  teamId: string;
  lang: Lang;
  /** Optional reference date (ISO). When set, shows the week containing this date. */
  date?: string;
  /** KPI group override. "ima" fetches the IMA driver set (total + accel/decel/CoD). */
  group?: "ima";
  /** Header title override (e.g. "Weekly IMA Load"). Falls back to the default. */
  title?: string;
  /** Header subtitle override. Falls back to the default. */
  subtitle?: string;
}) {
  const t = COPY[lang];
  const headerTitle = title ?? t.title;
  const headerSubtitle = subtitle ?? t.subtitle;
  const [data, setData] = useState<WeeklyLoadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [primaryKey, setPrimaryKey] = useState<WeeklyLoadMetricKey>("totalDistance");
  const [viewMode, setViewMode] = useState<ViewMode>("team");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Fetch player roster once for the player selector.
  // NOTE: don't filter on is_active here — some legacy rows have NULL and
  // the strict `.eq("is_active", true)` was excluding them, leaving the
  // dropdown empty for teams whose players were imported before is_active
  // was added (reported 2026-05-20, Breiðablik on /coach?tab=gps). RLS
  // already restricts coaches to their own team's rows so all returned
  // players are appropriate to show in the selector.
  useEffect(() => {
    if (!teamId) return;
    (async () => {
      const { data: roster, error } = await supabase
        .from("players")
        .select("id, full_name, is_active")
        .eq("team_id", teamId)
        .order("full_name");
      if (error) {
        // Surface the failure so it doesn't fail silently — empty dropdown
        // looked identical to "no players on team" before this log.
        console.error("[CoachWeeklyLoadCard] failed to load players:", error.message);
        return;
      }
      const rows = (roster ?? []) as Array<{ id: string; full_name: string | null; is_active: boolean | null }>;
      // Treat is_active in (null, true) as "show" — only exclude players
      // explicitly flagged inactive.
      setPlayers(
        rows
          .filter((p) => p.is_active !== false)
          .map((p) => ({ id: p.id, name: p.full_name ?? "—" }))
      );
    })();
  }, [teamId]);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ teamId });
    if (date) params.set("date", date);
    if (group) params.set("group", group);
    if (viewMode === "player" && selectedPlayerId) {
      params.set("playerId", selectedPlayerId);
    }
    fetch(`/api/coach/weekly-load?${params.toString()}`)
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
  }, [teamId, date, group, viewMode, selectedPlayerId]);

  useEffect(() => {
    if (viewMode === "player" && !selectedPlayerId) return;
    fetchData();
  }, [fetchData, viewMode, selectedPlayerId]);

  // Reset primaryKey to a valid KPI for the active (outdoor/indoor) list
  // whenever new data arrives. Prevents "Total Distance" from being selected
  // on indoor teams where that KPI isn't computed.
  useEffect(() => {
    if (!data?.metrics || data.metrics.length === 0) return;
    const valid = data.metrics.some((m) => m.metric === primaryKey);
    if (!valid) {
      setPrimaryKey(data.metrics[0].metric);
    }
  }, [data, primaryKey]);

  // Auto-pick the first player as soon as the roster loads in player mode.
  // Without this, switching to Player just shows an empty dropdown that the
  // coach has to manually expand and pick from — fixed UX complaint that
  // "Leikmenn koma ekki upp" (players don't come up) on /coach?tab=gps.
  // This is a legitimate derive-from-async-source effect (player roster
  // arrives after mount), hence the eslint-disable for set-state-in-effect.
  useEffect(() => {
    if (viewMode !== "player") return;
    if (selectedPlayerId) return;
    if (players.length === 0) return;
    const first = [...players].sort((a, b) => a.name.localeCompare(b.name))[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (first) setSelectedPlayerId(first.id);
  }, [viewMode, selectedPlayerId, players]);

  // Player mode but roster hasn't loaded yet: show selector with explanation
  // so the coach knows what's happening (empty dropdown looked broken).
  if (viewMode === "player" && !selectedPlayerId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-bold text-slate-800">{headerTitle}</h3>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button className="px-2.5 py-1 text-[10px] font-semibold bg-white text-slate-500 hover:bg-slate-50" onClick={() => setViewMode("team")}>{lang === "IS" ? "Lið" : "Team"}</button>
              <button className="px-2.5 py-1 text-[10px] font-semibold bg-slate-800 text-white">{lang === "IS" ? "Leikmaður" : "Player"}</button>
            </div>
          </div>
          <select
            value=""
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-300 w-full max-w-xs"
          >
            <option value="">{lang === "IS" ? "Veldu leikmann..." : "Select player..."}</option>
            {[...players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {players.length === 0 && (
            <p className="mt-2 text-[11px] text-slate-500">
              {lang === "IS" ? "Sæki leikmenn…" : "Loading players…"}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <span className="text-sm text-slate-500">{t.loading}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm text-rose-700">{error}</p>
      </div>
    );
  }

  if (!data || data.days.every((d) => !d.hasData)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">{t.noData}</p>
      </div>
    );
  }

  // Target mode metadata
  const targetMeta = data.target;
  const mode = targetMeta?.mode ?? "baseline";
  const corridorPct = targetMeta?.corridorPct ?? 0.15;
  const indoor = targetMeta?.indoor === true || data.indoor === true;

  // Primary metric for the big display (swappable)
  const primaryMetric = data.metrics.find((m) => m.metric === primaryKey) ?? data.metrics[0];
  const primaryRef = pickReference(primaryMetric, mode);
  const primaryPct = primaryRef.pct;
  const primaryColor = pctColor(primaryPct, primaryMetric.expectedPctAtThisPoint, corridorPct);
  const primaryStatus = statusLabel(primaryPct, primaryMetric.expectedPctAtThisPoint, lang, corridorPct);
  const primaryLabel = WEEKLY_LOAD_LABELS[primaryMetric.metric];

  const modeLabel =
    mode === "match_demand" ? t.modeMatchDemand :
    mode === "coach_weekly" ? t.modeCoachWeekly :
    t.modeBaseline;
  const modeBadgeColor =
    mode === "match_demand" ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
    mode === "coach_weekly" ? "bg-violet-50 text-violet-700 border-violet-200" :
    "bg-slate-50 text-slate-600 border-slate-200";
  const mesoLabel =
    targetMeta?.mesocyclePhase === "build" ? t.mesoBuild :
    targetMeta?.mesocyclePhase === "maintain" ? t.mesoMaintain :
    targetMeta?.mesocyclePhase === "taper" ? t.mesoTaper :
    null;

  // Day labels for the week bar
  const dayLabelsIS = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
  const dayLabelsEN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayLabels = lang === "IS" ? dayLabelsIS : dayLabelsEN;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header + tab switcher */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-slate-800">{headerTitle}</h3>
              {/* Team / Player toggle */}
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                <button
                  className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    viewMode === "team"
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                  onClick={() => setViewMode("team")}
                >
                  {lang === "IS" ? "Lið" : "Team"}
                </button>
                <button
                  className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    viewMode === "player"
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                  onClick={() => setViewMode("player")}
                >
                  {lang === "IS" ? "Leikmaður" : "Player"}
                </button>
              </div>
            </div>
            {/* Player selector */}
            {viewMode === "player" && (
              <div className="mt-2">
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-300 w-full max-w-xs"
                >
                  <option value="">{lang === "IS" ? "Veldu leikmann..." : "Select player..."}</option>
                  {[...players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            {viewMode === "team" && (
              <p className="mt-0.5 text-[11px] text-slate-400">{headerSubtitle}</p>
            )}
            {viewMode === "player" && selectedPlayerId && (
              <p className="mt-0.5 text-[11px] text-slate-400">
                {lang === "IS" ? "Vikuálag leikmanns samanborið við hans eigin sögu" : "Player weekly load vs own historical average"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Mode badge */}
            <span className={`text-[9px] font-semibold uppercase tracking-wider rounded-full border px-2 py-0.5 ${modeBadgeColor}`}>
              {modeLabel}
            </span>
            {indoor && (
              <span
                className="text-[9px] font-semibold uppercase tracking-wider rounded-full border border-amber-200 bg-amber-50 text-amber-700 px-2 py-0.5"
                title={lang === "IS" ? "Innandyra — FMP/IMA KPI" : "Indoor — FMP/IMA KPIs"}
              >
                {lang === "IS" ? "Innandyra" : "Indoor"}
              </span>
            )}
            {mesoLabel && (
              <span className="text-[9px] font-semibold uppercase tracking-wider rounded-full border border-slate-200 bg-white text-slate-500 px-2 py-0.5">
                {mesoLabel} ×{(targetMeta?.mesocycleMultiplier ?? 1).toFixed(2)}
              </span>
            )}
            <span className="text-[10px] text-slate-400">
              {t.day} {data.daysElapsed} {t.of} {data.totalWeekDays}
            </span>
            {/* Settings gear */}
            <button
              onClick={() => setShowSettings(true)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition-colors"
              title={t.settings}
              aria-label={t.settings}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Warning: match_demand mode but no matches sampled */}
      {mode === "match_demand" && (targetMeta?.matchesSampled ?? 0) === 0 && (
        <div className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="flex items-start gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-600 mt-0.5 shrink-0"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-amber-800">
                {t.noMatchesWarningTitle}
              </div>
              <div className="text-[10px] text-amber-700 mt-0.5 leading-snug">
                {t.noMatchesWarningBody}
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="text-[10px] font-semibold text-amber-800 underline mt-1 hover:text-amber-900"
              >
                {t.settings} →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Big primary metric + progress ring */}
      <div className="px-4 pb-4">
        <div className={`rounded-xl ${primaryColor.bg} p-4`}>
          <div className="flex items-center gap-4">
            {/* Progress ring SVG */}
            <ProgressRing
              pct={primaryPct ?? 0}
              expectedPct={primaryMetric.expectedPctAtThisPoint}
              color={primaryColor}
            />
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold tabular-nums ${primaryColor.text}`}>
                  {primaryPct != null ? `${Math.round(primaryPct)}%` : "—"}
                </span>
                <span className="text-xs text-slate-500">
                  {primaryRef.isTarget ? t.ofTarget : t.ofTypical}
                </span>
              </div>
              <div className={`mt-1 text-xs font-semibold ${primaryColor.labelColor}`}>
                {primaryStatus}
              </div>
              <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500">
                <span>{t.current}: <strong className="text-slate-700">{fmtNum(primaryMetric.currentTotal)} {primaryLabel.unit}</strong></span>
                <span>
                  {primaryRef.isTarget ? t.target : t.typical}:{" "}
                  <strong className="text-slate-700">{fmtNum(primaryRef.referenceValue)} {primaryLabel.unit}</strong>
                </span>
                {primaryMetric.projectedWeekTotal != null && (
                  <span>{t.projected}: <strong className="text-slate-700">{fmtNum(primaryMetric.projectedWeekTotal)} {primaryLabel.unit}</strong></span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Week day bar chart (Total Distance per day) */}
      <div className="px-4 pb-3">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          {t.weekProgress}
        </div>
        <WeekBarChart data={data} dayLabels={dayLabels} metricKey={primaryKey} />
      </div>

      {/* Other metrics grid */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {data.metrics.filter((m) => m.metric !== primaryKey).map((m) => (
            <MetricMiniCard
              key={m.metric}
              metric={m}
              lang={lang}
              mode={mode}
              corridorPct={corridorPct}
              onClick={() => setPrimaryKey(m.metric)}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100 flex items-center justify-between">
        <span>
          {t.basedOn} {data.historicalWeeksUsed} {t.historicalWeeks}
        </span>
        {mode === "match_demand" && targetMeta?.matchesSampled != null && (
          <span>
            {targetMeta.matchesSampled} {t.matchesSampled}
          </span>
        )}
      </div>

      {/* Settings modal */}
      {showSettings && (
        <LoadTargetSettingsModal
          teamId={teamId}
          lang={lang}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ProgressRing({
  pct,
  expectedPct,
  color,
}: {
  pct: number;
  expectedPct: number;
  color: ReturnType<typeof pctColor>;
}) {
  const size = 64;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(pct, 100);
  const offset = circumference - (progress / 100) * circumference;
  // Expected marker position
  const expectedAngle = (expectedPct / 100) * 360 - 90;
  const expectedRad = (expectedAngle * Math.PI) / 180;
  const markerX = size / 2 + radius * Math.cos(expectedRad);
  const markerY = size / 2 + radius * Math.sin(expectedRad);

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-slate-200"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className={color.ring}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {/* Expected position marker */}
      <circle
        cx={markerX}
        cy={markerY}
        r={3}
        className="fill-slate-400"
      />
      {/* Center text */}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className={`text-sm font-bold ${color.text}`}
        fill="currentColor"
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function WeekBarChart({
  data,
  dayLabels,
  metricKey,
}: {
  data: WeeklyLoadResult;
  dayLabels: string[];
  metricKey: WeeklyLoadMetricKey;
}) {
  // Build 7 bars for Mon–Sun, mapping dayOfWeek correctly
  // data.days only contains days up to today
  const bars: { label: string; value: number; hasData: boolean; isToday: boolean; isFuture: boolean }[] = [];

  for (let i = 0; i < 7; i++) {
    // i=0 → Monday (dayOfWeek=1), i=6 → Sunday (dayOfWeek=0)
    const dow = i === 6 ? 0 : i + 1;
    const day = data.days.find((d) => d.dayOfWeek === dow);
    const val = day?.metrics[metricKey] ?? 0;
    const isToday = day?.date === data.today;
    const isFuture = !day;

    bars.push({
      label: dayLabels[i],
      value: val,
      hasData: day?.hasData ?? false,
      isToday,
      isFuture,
    });
  }

  const maxVal = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className="flex items-end gap-1.5 h-16">
      {bars.map((bar, i) => {
        const h = bar.value > 0 ? Math.max(4, Math.round((bar.value / maxVal) * 56)) : 2;
        const barColor = bar.isFuture
          ? "bg-slate-100"
          : bar.isToday
            ? "bg-indigo-500"
            : bar.hasData
              ? "bg-slate-300"
              : "bg-slate-100";

        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
              <div
                className={`w-full max-w-[28px] rounded-t ${barColor} transition-all`}
                style={{ height: h }}
                title={bar.hasData ? `${fmtNum(bar.value)} m` : "—"}
              />
            </div>
            <span className={`text-[9px] ${bar.isToday ? "font-bold text-indigo-600" : "text-slate-400"}`}>
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MetricMiniCard({
  metric,
  lang,
  mode,
  corridorPct,
  onClick,
}: {
  metric: WeeklyLoadMetricSummary;
  lang: Lang;
  mode?: WeeklyLoadTargetMeta["mode"];
  corridorPct?: number;
  onClick?: () => void;
}) {
  const t = COPY[lang];
  const label = WEEKLY_LOAD_LABELS[metric.metric];
  const ref = pickReference(metric, mode);
  const color = pctColor(ref.pct, metric.expectedPctAtThisPoint, corridorPct ?? 0.15);
  const projectionDenom = ref.referenceValue;

  return (
    <div
      className={`rounded-lg border border-slate-200 p-2.5 ${color.bg} ${onClick ? "cursor-pointer hover:shadow-md hover:border-slate-300 transition-all" : ""}`}
      onClick={onClick}
    >
      <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-400 truncate">
        {lang === "IS" ? label.is : label.en}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-lg font-bold tabular-nums ${color.text}`}>
          {ref.pct != null ? `${Math.round(ref.pct)}%` : "—"}
        </span>
      </div>
      <div className="mt-1 text-[9px] text-slate-400">
        {fmtNum(metric.currentTotal)} / {fmtNum(ref.referenceValue)} {label.unit}
      </div>
      {metric.projectedWeekTotal != null && projectionDenom > 0 && (
        <div className="mt-1 text-[9px] text-slate-400">
          {t.projected}: <span className="font-semibold text-slate-600">{fmtNum(metric.projectedWeekTotal)} {label.unit}</span>
          <span className="ml-1 text-[8px]">
            ({Math.round((metric.projectedWeekTotal / projectionDenom) * 100)}%)
          </span>
        </div>
      )}
    </div>
  );
}
