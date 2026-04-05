"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  WeeklyLoadResult,
  WeeklyLoadMetricKey,
  WeeklyLoadMetricSummary,
} from "@/lib/micropulse/externalLoad/weeklyLoadTypes";
import { WEEKLY_LOAD_LABELS } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

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
    projected: "Áætlað",
    typical: "Dæmigert",
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
  },
  EN: {
    title: "Weekly Load",
    subtitle: "Cumulative GPS load this week vs historical averages",
    loading: "Loading weekly load...",
    noData: "No GPS data found for this week.",
    ofTypical: "of typical week",
    projected: "Projected",
    typical: "Typical",
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
  },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(v: number, digits = 0): string {
  if (digits === 0) return Math.round(v).toLocaleString("is-IS");
  return v.toFixed(digits);
}

function pctColor(pct: number | null, expectedPct: number): {
  text: string; bg: string; ring: string; label: string; labelColor: string;
} {
  if (pct == null) return { text: "text-slate-400", bg: "bg-slate-100", ring: "stroke-slate-300", label: "—", labelColor: "text-slate-400" };
  const ratio = pct / expectedPct;
  if (ratio < 0.75) return { text: "text-blue-600", bg: "bg-blue-50", ring: "stroke-blue-400", label: "↓", labelColor: "text-blue-600" };
  if (ratio <= 1.15) return { text: "text-emerald-600", bg: "bg-emerald-50", ring: "stroke-emerald-500", label: "✓", labelColor: "text-emerald-600" };
  if (ratio <= 1.35) return { text: "text-amber-600", bg: "bg-amber-50", ring: "stroke-amber-400", label: "↑", labelColor: "text-amber-600" };
  return { text: "text-rose-600", bg: "bg-rose-50", ring: "stroke-rose-500", label: "⚠", labelColor: "text-rose-600" };
}

function statusLabel(pct: number | null, expectedPct: number, lang: Lang): string {
  const t = COPY[lang];
  if (pct == null) return "—";
  const ratio = pct / expectedPct;
  if (ratio < 0.75) return t.belowTarget;
  if (ratio <= 1.15) return t.onTrack;
  return t.aboveTarget;
}

// ─── Component ──────────────────────────────────────────────────────────────

type PlayerOption = { id: string; name: string };
type ViewMode = "team" | "player";

export default function CoachWeeklyLoadCard({
  teamId,
  lang,
}: {
  teamId: string;
  lang: Lang;
}) {
  const t = COPY[lang];
  const [data, setData] = useState<WeeklyLoadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [primaryKey, setPrimaryKey] = useState<WeeklyLoadMetricKey>("totalDistance");
  const [viewMode, setViewMode] = useState<ViewMode>("team");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [players, setPlayers] = useState<PlayerOption[]>([]);

  // Fetch player roster once for the player selector
  useEffect(() => {
    (async () => {
      const { data: roster } = await supabase
        .from("players")
        .select("id, full_name")
        .eq("team_id", teamId)
        .eq("is_active", true)
        .order("full_name");
      if (roster) {
        setPlayers(
          (roster as Array<{ id: string; full_name: string | null }>)
            .map((p) => ({ id: p.id, name: p.full_name ?? "—" }))
        );
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ teamId });
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
  }, [teamId, viewMode, selectedPlayerId]);

  useEffect(() => {
    if (viewMode === "player" && !selectedPlayerId) return;
    fetchData();
  }, [fetchData, viewMode, selectedPlayerId]);

  // Player mode with no selection: show selector only
  if (viewMode === "player" && !selectedPlayerId) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-bold text-slate-800">{t.title}</h3>
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

  // Primary metric for the big display (swappable)
  const primaryMetric = data.metrics.find((m) => m.metric === primaryKey) ?? data.metrics[0];
  const primaryPct = primaryMetric.pctOfTypical;
  const primaryColor = pctColor(primaryPct, primaryMetric.expectedPctAtThisPoint);
  const primaryStatus = statusLabel(primaryPct, primaryMetric.expectedPctAtThisPoint, lang);
  const primaryLabel = WEEKLY_LOAD_LABELS[primaryMetric.metric];

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
              <h3 className="text-sm font-bold text-slate-800">{t.title}</h3>
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
              <p className="mt-0.5 text-[11px] text-slate-400">{t.subtitle}</p>
            )}
            {viewMode === "player" && selectedPlayerId && (
              <p className="mt-0.5 text-[11px] text-slate-400">
                {lang === "IS" ? "Vikuálag leikmanns samanborið við hans eigin sögu" : "Player weekly load vs own historical average"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-slate-400">
              {t.day} {data.daysElapsed} {t.of} {data.totalWeekDays}
            </span>
          </div>
        </div>
      </div>

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
                <span className="text-xs text-slate-500">{t.ofTypical}</span>
              </div>
              <div className={`mt-1 text-xs font-semibold ${primaryColor.labelColor}`}>
                {primaryStatus}
              </div>
              <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500">
                <span>{t.current}: <strong className="text-slate-700">{fmtNum(primaryMetric.currentTotal)} {primaryLabel.unit}</strong></span>
                <span>{t.typical}: <strong className="text-slate-700">{fmtNum(primaryMetric.typicalWeekTotal)} {primaryLabel.unit}</strong></span>
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
            <MetricMiniCard key={m.metric} metric={m} lang={lang} onClick={() => setPrimaryKey(m.metric)} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100">
        {t.basedOn} {data.historicalWeeksUsed} {t.historicalWeeks}
      </div>
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
  onClick,
}: {
  metric: WeeklyLoadMetricSummary;
  lang: Lang;
  onClick?: () => void;
}) {
  const t = COPY[lang];
  const label = WEEKLY_LOAD_LABELS[metric.metric];
  const color = pctColor(metric.pctOfTypical, metric.expectedPctAtThisPoint);

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
          {metric.pctOfTypical != null ? `${Math.round(metric.pctOfTypical)}%` : "—"}
        </span>
      </div>
      <div className="mt-1 text-[9px] text-slate-400">
        {fmtNum(metric.currentTotal)} / {fmtNum(metric.typicalWeekTotal)} {label.unit}
      </div>
      {metric.projectedWeekTotal != null && metric.typicalWeekTotal > 0 && (
        <div className="mt-1 text-[9px] text-slate-400">
          {t.projected}: <span className="font-semibold text-slate-600">{fmtNum(metric.projectedWeekTotal)} {label.unit}</span>
          <span className="ml-1 text-[8px]">
            ({Math.round((metric.projectedWeekTotal / metric.typicalWeekTotal) * 100)}%)
          </span>
        </div>
      )}
    </div>
  );
}
