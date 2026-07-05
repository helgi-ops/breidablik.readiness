"use client";

/**
 * src/components/player/WeeklyDigestCard.tsx
 *
 * "Vikan þín" — rolling 7-day digest shown on the Player Today tab.
 *
 * Consolidates streak + 7-day summary + wearable strip into one card.
 * Replaces the older standalone StreakCard on Today (StreakCard is still
 * used on the /team page).
 *
 * Surfaces data the player already submits (readiness check-ins + session RPE)
 * plus wearable data when connected, so the player can SEE the picture their
 * answers paint. Closes the "data in, nothing out" loop that kills daily-use
 * apps over time.
 *
 * Includes an empty-state CTA on day-1 so a brand new player isn't met with
 * a hidden card.
 *
 * Backed by GET /api/player/weekly-summary.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Lang } from "@/lib/lang";

type SeriesPoint = {
  date: string;
  totalScore: number | null;
  sleepQuality: number | null;
  rpeLoad: number | null;
  avgRpe: number | null;
  sleepMin: number | null;
  hrvMs: number | null;
};

type WeeklyData = {
  window: { fromDate: string; toDate: string; days: number };
  compliance: {
    checkinCount: number;
    checkinRate: number;
    rpeDayCount: number;
    rpeDayRate: number;
  };
  streak: {
    checkin: number;
    rpe: number;
  };
  readiness: {
    avgTotal: number | null;
    avgSleepQuality: number | null;
    avgFatigue: number | null;
    avgSoreness: number | null;
    avgStress: number | null;
    stressDays: number;
  };
  load: {
    sessionCount: number;
    avgRpe: number | null;
    totalLoad: number;
    totalDurationMin: number;
  };
  wearable: {
    connected: boolean;
    sleepNights: number;
    avgSleepMin: number | null;
    bestSleepMin: number | null;
    worstSleepMin: number | null;
    avgHrvMs: number | null;
    avgRestingHr: number | null;
    avgRecoveryScore: number | null;
  };
  series: SeriesPoint[];
};

const COPY = {
  IS: {
    title: "Vikan þín",
    subtitle: "Síðustu 7 dagar",
    checkin: "Check-in",
    rpe: "RPE",
    readiness: "Meðal readiness",
    avgSleep: "Meðal svefn",
    avgRpe: "Meðal RPE",
    totalLoad: "Heildarálag",
    avgHrv: "HRV",
    avgRestingHr: "Hvíldar HR",
    recoveryScore: "Recovery",
    stressDays: "hástressdagar",
    stressDaysSingular: "hástressdagur",
    rpeDays: "RPE-dagar",
    days: "d",
    sessions: "æf",
    sparklineLabel: "Readiness í vikunni",
    inStreak: "í röð",
    hours: "klst",
    min: "mín",
    emptyTitle: "Byrjaðu vikuna þína",
    emptyBody: "Fyrsta check-in tekur 60 sek. Þú færð síðan sjónræn gögn um svefn, álag og endurheimt vikulega hér.",
    emptyCta: "Skrá check-in →",
  },
  EN: {
    title: "Your week",
    subtitle: "Last 7 days",
    checkin: "Check-in",
    rpe: "RPE",
    readiness: "Avg readiness",
    avgSleep: "Avg sleep",
    avgRpe: "Avg RPE",
    totalLoad: "Total load",
    avgHrv: "HRV",
    avgRestingHr: "Resting HR",
    recoveryScore: "Recovery",
    stressDays: "high-stress days",
    stressDaysSingular: "high-stress day",
    rpeDays: "RPE days",
    days: "d",
    sessions: "sess",
    sparklineLabel: "Readiness this week",
    inStreak: "in a row",
    hours: "h",
    min: "m",
    emptyTitle: "Start your week",
    emptyBody: "Your first check-in takes 60 sec. You'll then see weekly visuals on sleep, load, and recovery here.",
    emptyCta: "Log check-in →",
  },
} as const;

function formatMinAsHm(mins: number | null | undefined, hLabel: string, mLabel: string): string {
  if (typeof mins !== "number" || !Number.isFinite(mins) || mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins - h * 60);
  if (h === 0) return `${m}${mLabel}`;
  if (m === 0) return `${h}${hLabel}`;
  return `${h}${hLabel} ${m}${mLabel}`;
}

function rateColor(rate: number): string {
  if (rate >= 80) return "text-emerald-600";
  if (rate >= 50) return "text-amber-600";
  return "text-rose-500";
}

function streakIcon(streak: number): string {
  if (streak >= 14) return "🔥";
  if (streak >= 7) return "⚡";
  if (streak >= 3) return "✅";
  return "•";
}

/** Tiny inline sparkline using SVG. Renders 7 points as an area + line.
 *  Skips gaps cleanly. */
function Sparkline({ values, lang }: { values: Array<number | null>; lang: Lang }) {
  const W = 280;
  const H = 56;
  const PAD_X = 4;
  const PAD_Y = 6;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;

  const numericValues = values.filter((v): v is number => typeof v === "number");
  if (numericValues.length === 0) return null;
  const minV = Math.min(...numericValues, 0);
  const maxV = Math.max(...numericValues, 21);
  const range = Math.max(1, maxV - minV);

  const stepX = innerW / Math.max(1, values.length - 1);

  const points = values
    .map((v, i) => {
      if (typeof v !== "number") return null;
      const x = PAD_X + i * stepX;
      const y = PAD_Y + innerH - ((v - minV) / range) * innerH;
      return { x, y, v };
    })
    .filter((p): p is { x: number; y: number; v: number } => p !== null);

  if (points.length === 0) return null;

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`))
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${H - PAD_Y} L ${points[0].x.toFixed(1)} ${H - PAD_Y} Z`;
  const lastPoint = points[points.length - 1];

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={COPY[lang].sparklineLabel}
    >
      <defs>
        <linearGradient id="weekly-digest-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b8a54" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#2b8a54" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#weekly-digest-grad)" />
      <path d={linePath} fill="none" stroke="#2b8a54" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 3 : 1.75}
          fill="#2b8a54"
          opacity={i === points.length - 1 ? 1 : 0.6}
        />
      ))}
      <circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill="#2b8a54" opacity="0.18" />
    </svg>
  );
}

export default function WeeklyDigestCard({
  lang = "IS",
  hideWellness = false,
}: {
  lang?: Lang;
  /** GPS-only team mode: hide check-in compliance, sparkline based on
   *  readiness, stress chip, RPE chip. Keep the wearable strip + load /
   *  total distance — those are still useful even without wellness. */
  hideWellness?: boolean;
}) {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const ct = COPY[lang];

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const { data: auth } = await supabase.auth.getSession();
        const token = auth?.session?.access_token;
        if (!token) {
          if (alive) setLoading(false);
          return;
        }
        const res = await fetch("/api/player/weekly-summary", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (alive && json.ok) setData(json.data as WeeklyData);
      } catch {
        // Silently fail — digest card is non-critical
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return null;
  if (!data) return null;

  const isEmpty =
    data.compliance.checkinCount === 0 &&
    data.load.sessionCount === 0 &&
    !data.wearable.connected;

  // Empty state — brand new player on day 1. Show a friendly CTA instead of
  // hiding the card entirely. GPS-only teams have no check-in CTA so the
  // card just hides if there's nothing to show yet.
  if (isEmpty) {
    if (hideWellness) return null;
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">{ct.emptyTitle}</div>
        <div className="mt-1 text-[12px] leading-relaxed text-zinc-600">{ct.emptyBody}</div>
        <a
          href="/player/checkin"
          className="mt-3 inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          {ct.emptyCta}
        </a>
      </div>
    );
  }

  const stressDayLabel = data.readiness.stressDays === 1 ? ct.stressDaysSingular : ct.stressDays;
  const checkinStreak = data.streak.checkin;
  const rpeStreak = data.streak.rpe;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Header — title left, streak + week-count right (hidden when no wellness) */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">{ct.title}</div>
          <div className="text-[11px] text-zinc-500">{ct.subtitle}</div>
        </div>
        {!hideWellness && (
          <div className="flex items-center gap-2 text-right">
            {checkinStreak > 0 && (
              <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-1">
                  <span className="text-base leading-none">{streakIcon(checkinStreak)}</span>
                  <span className="text-base font-bold tabular-nums text-zinc-900">{checkinStreak}</span>
                </div>
                <div className="text-[9px] uppercase tracking-wide text-zinc-400">{ct.inStreak}</div>
              </div>
            )}
            <div className="flex flex-col items-end border-l border-zinc-200 pl-2.5">
              <div className={`text-sm font-bold tabular-nums ${rateColor(data.compliance.checkinRate)}`}>
                {data.compliance.checkinCount}/7
              </div>
              <div className="text-[9px] uppercase tracking-wide text-zinc-400">{ct.checkin}</div>
            </div>
          </div>
        )}
      </div>

      {/* Sparkline — wellness-driven (readiness trend). Hidden in GPS-only mode. */}
      {!hideWellness && data.compliance.checkinCount > 0 && (
        <div className="mt-3">
          <Sparkline values={data.series.map((p) => p.totalScore)} lang={lang} />
        </div>
      )}

      {/* KPI grid — wellness mode shows readiness + sleep + RPE + load.
          GPS-only mode shows only wearable-derived sleep (if connected) +
          load. Readiness and RPE-derived stats hidden. */}
      {hideWellness ? (
        data.wearable.connected ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat
              label={ct.avgSleep}
              value={
                data.wearable.avgSleepMin != null
                  ? formatMinAsHm(data.wearable.avgSleepMin, ct.hours, ct.min)
                  : "—"
              }
              accent
            />
            <Stat label={ct.totalLoad} value={data.load.totalLoad > 0 ? data.load.totalLoad.toLocaleString("is-IS") : "—"} suffix="AU" />
          </div>
        ) : null
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={ct.readiness} value={data.readiness.avgTotal != null ? data.readiness.avgTotal.toFixed(1) : "—"} suffix="/21" />
          <Stat
            label={ct.avgSleep}
            value={
              data.wearable.avgSleepMin != null
                ? formatMinAsHm(data.wearable.avgSleepMin, ct.hours, ct.min)
                : data.readiness.avgSleepQuality != null
                  ? `${data.readiness.avgSleepQuality.toFixed(1)}/6`
                  : "—"
            }
            accent={data.wearable.connected}
          />
          <Stat
            label={ct.avgRpe}
            value={data.load.avgRpe != null ? data.load.avgRpe.toFixed(1) : "—"}
            suffix="/10"
          />
          <Stat label={ct.totalLoad} value={data.load.totalLoad > 0 ? data.load.totalLoad.toLocaleString("is-IS") : "—"} suffix="AU" />
        </div>
      )}

      {/* Wearable strip — only when connected */}
      {data.wearable.connected && (
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-emerald-50/60 p-2.5">
          <Stat
            label={ct.avgHrv}
            value={data.wearable.avgHrvMs != null ? data.wearable.avgHrvMs.toFixed(0) : "—"}
            suffix="ms"
            compact
          />
          <Stat
            label={ct.avgRestingHr}
            value={data.wearable.avgRestingHr != null ? data.wearable.avgRestingHr.toFixed(0) : "—"}
            suffix="bpm"
            compact
          />
          <Stat
            label={ct.recoveryScore}
            value={data.wearable.avgRecoveryScore != null ? data.wearable.avgRecoveryScore.toFixed(0) : "—"}
            suffix="%"
            compact
          />
        </div>
      )}

      {/* Footer chips: stress days + RPE streak/compliance.
          All hidden in GPS-only mode (no wellness data to report on). */}
      {!hideWellness && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {data.readiness.stressDays > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
              <span>⚡</span>
              <span className="font-medium tabular-nums">{data.readiness.stressDays}</span>
              <span>{stressDayLabel}</span>
            </span>
          )}
          {data.compliance.rpeDayCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">
              <span>💪</span>
              <span className="font-medium tabular-nums">{data.compliance.rpeDayCount}/7</span>
              <span>{ct.rpeDays}</span>
            </span>
          )}
          {rpeStreak >= 3 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
              <span>{streakIcon(rpeStreak)}</span>
              <span className="font-medium tabular-nums">{rpeStreak}</span>
              <span>
                {ct.rpe} {ct.inStreak}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  accent,
  compact,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5"}>
      <div className={`${compact ? "text-[9px]" : "text-[10px]"} font-medium uppercase tracking-wide text-zinc-500`}>
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`${compact ? "text-sm" : "text-base"} font-semibold tabular-nums ${accent ? "text-emerald-700" : "text-zinc-900"}`}>
          {value}
        </span>
        {suffix && <span className="text-[10px] text-zinc-400">{suffix}</span>}
      </div>
    </div>
  );
}
