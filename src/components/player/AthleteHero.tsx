"use client";

/**
 * AthleteHero — "Am I progressing?" at a glance, top of the Today page.
 *
 * Premium, mobile-first. Big trend numbers, a consistency streak (check-ins,
 * NOT "train every day"), strength + fitness deltas, a tracking-confidence
 * chip with its reason, and one explainable insight line. Falls back to a
 * motivating baseline state until there's enough data. Every number carries
 * provenance / confidence (manifesto principle #1).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Lang = "IS" | "EN";

type Hero = {
  baseline: boolean;
  days_with_data: number;
  profile_confidence_pct: number;
  consistency: { checkin_streak: number; compliance_pct: number; sessions_this_month: number };
  strength: { pct: number | null; top: Array<{ label: string }>; confident: boolean };
  fitness: { pct: number | null; confident: boolean };
  confidence: { level: "HIGH" | "MODERATE" | "LOW"; reason: string };
  insight: { text: string; signals: string[] };
  focus: string | null;
};

const COPY = {
  IS: {
    streak: "daga samkvæmni", compliance: "prógram-fylgni", sessions: "æfingar í mánuðinum",
    strength: "Styrkur", fitness: "Form", confidence: "Traust kerfis",
    focus: "Fókus dagsins", insight: "Þjálfaranóta", baselineTitle: "Að kynnast þér",
    baselineSub: "Því meira sem þú skráir, því klárari verður þjálfunin þín.",
    items: ["Daglegt check-in", "Líkamsþyngd", "Æfingar", "Íþróttaæfingar"],
    based: "Byggt á", noTrend: "—", profileConfidence: "Prófíl-traust",
  },
  EN: {
    streak: "day consistency", compliance: "program compliance", sessions: "sessions this month",
    strength: "Strength", fitness: "Fitness", confidence: "Tracking confidence",
    focus: "Today's focus", insight: "Coach note", baselineTitle: "Learning about you",
    baselineSub: "The more you log, the smarter your coaching becomes.",
    items: ["Daily check-in", "Body weight", "Workouts", "Sport sessions"],
    based: "Based on", noTrend: "—", profileConfidence: "Profile confidence",
  },
} as const;

const CONF_TONE: Record<string, { dot: string; text: string; bg: string }> = {
  HIGH:     { dot: "bg-emerald-500", text: "text-emerald-800", bg: "bg-emerald-50 border-emerald-200" },
  MODERATE: { dot: "bg-amber-500",   text: "text-amber-800",   bg: "bg-amber-50 border-amber-200" },
  LOW:      { dot: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-50 border-slate-200" },
};

function trendColor(pct: number | null): string {
  if (pct == null) return "text-slate-400";
  if (pct > 0) return "text-emerald-600";
  if (pct < 0) return "text-amber-600";
  return "text-slate-600";
}
function trendArrow(pct: number | null): string {
  if (pct == null) return "";
  if (pct > 0) return "↑";
  if (pct < 0) return "↓";
  return "→";
}

export default function AthleteHero({ lang = "IS" }: { lang?: Lang }) {
  const t = COPY[lang];
  const [h, setH] = useState<Hero | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/client/hero", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (json.ok) setH(json as Hero);
    } catch { /* soft */ } finally { setLoaded(true); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || !h) return null;

  // Baseline / empty state — motivating, not empty.
  if (h.baseline) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 p-4 text-white">
        <div className="text-base font-semibold">🔥 {t.baselineTitle}</div>
        <div className="text-xs text-white/70 mt-0.5">{t.baselineSub}</div>

        {/* Profile confidence — a progress bar people instinctively want to fill. */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-white/70">{t.profileConfidence}</span>
            <span className="text-lg font-bold tabular-nums">{h.profile_confidence_pct}%</span>
          </div>
          <div className="mt-1 h-2.5 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
              style={{ width: `${Math.max(4, h.profile_confidence_pct)}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {t.items.map((it) => (
            <div key={it} className="flex items-center gap-1.5 text-xs text-white/90">
              <span className="text-emerald-400">✓</span> {it}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const conf = CONF_TONE[h.confidence.level];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Streak + confidence band */}
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-2.5 text-white">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums">🔥 {h.consistency.checkin_streak}</span>
          <span className="text-[11px] text-white/70">{t.streak}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5">
          <span className={`h-2 w-2 rounded-full ${conf.dot}`} />
          <span className="text-[11px] font-semibold">{t.confidence}: {h.confidence.level}</span>
        </div>
      </div>

      {/* Trend numbers */}
      <div className="grid grid-cols-2 divide-x divide-slate-100">
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">💪 {t.strength}</div>
          <div className={`text-2xl font-bold tabular-nums ${trendColor(h.strength.pct)}`}>
            {h.strength.pct == null ? t.noTrend : `${h.strength.pct > 0 ? "+" : ""}${h.strength.pct}% ${trendArrow(h.strength.pct)}`}
          </div>
          {h.strength.top.map((x) => (
            <div key={x.label} className="text-[11px] text-slate-500 capitalize truncate">{x.label}</div>
          ))}
        </div>
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">📈 {t.fitness}</div>
          <div className={`text-2xl font-bold tabular-nums ${trendColor(h.fitness.pct)}`}>
            {h.fitness.pct == null ? t.noTrend : `${h.fitness.pct > 0 ? "+" : ""}${h.fitness.pct}% ${trendArrow(h.fitness.pct)}`}
          </div>
          <div className="text-[11px] text-slate-500">
            {h.consistency.compliance_pct}% {t.compliance} · {h.consistency.sessions_this_month} {t.sessions}
          </div>
        </div>
      </div>

      {/* Focus + insight */}
      <div className="border-t border-slate-100 px-4 py-3 space-y-2">
        {h.focus && (
          <div className="text-xs">
            <span className="font-semibold text-slate-700">{t.focus}:</span>{" "}
            <span className="text-slate-600">{h.focus}</span>
          </div>
        )}
        <div className={`rounded-lg border ${conf.bg} px-3 py-2`}>
          <div className="text-[13px] text-slate-800">{h.insight.text}</div>
          {h.insight.signals.length > 0 && (
            <div className="text-[10px] text-slate-500 mt-1">{t.based}: {h.insight.signals.join(" · ")}</div>
          )}
        </div>
        <div className="text-[10px] text-slate-400">{t.confidence}: {h.confidence.reason}</div>
      </div>
    </div>
  );
}
