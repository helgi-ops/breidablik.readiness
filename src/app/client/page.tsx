"use client";

/**
 * /client (today)
 *
 * Mobile home screen for the PT client:
 *   - Header card with trainer name
 *   - Daily check-in nudge (readiness) — links to /player for the form
 *     (re-using the established 6-step wellness UI rather than rebuilding)
 *   - Today's prescribed workout — pulled from active Explosive Power
 *     assignment or custom_template_sets player override
 *   - Quick bodyweight tile with 7-day delta
 *
 * One API call: GET /api/client/today composes everything.
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import LoadQuadrant from "@/components/player/LoadQuadrant";
import { isSeasonPhase, SEASON_PHASE_SPEC } from "@/lib/client/seasonPhase";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type TodayResp = {
  ok: true;
  player: { id: string; full_name: string };
  team: { id: string; name: string; type: string | null; short: string | null } | null;
  explosive: {
    level: string;
    programme_name: string | null;
    phase: number;
    phase_name: string;
    weeks_label: string;
    week_in_phase: number | null;
    weekday_label: string | null;
    rest_day: boolean;
    next_session_label: string | null;
    weeks_per_phase?: number;
    total_phases?: number;
    season_phase?: string | null;
    blocks: Array<{ name: string; rows: Array<{
      num?: string; exercise: string; reps: string; sets: number;
      velocity?: string | number; pct1rm?: number | null; method?: string;
      cluster_rest?: string; set_rest?: string;
    }> }>;
  } | null;
  readinessToday: { id: string; total_score: number | null; color: string | null } | null;
  bodyweight: { latest: { log_date: string; weight_kg: number }; delta_kg: number | null } | null;
  intelligence: {
    foster: {
      monotony: number | null; strain: number; total_load: number;
      status: "ok" | "watch" | "deload_recommended" | "deload_required";
      reason: string;
    };
    exposure: {
      heavy_sets: number; cap: number; saturation: number;
      status: "low" | "optimal" | "high" | "excessive";
      reason: string;
    };
    pr_forecast: {
      exercise_name: string;
      forecast: {
        current_pr_kg: number; weekly_rate_kg: number;
        target_kg: number; eta_days: number | null; eta_weeks: number | null;
        sessions: number; reason: string;
      };
    } | null;
  };
};

export default function ClientTodayPage() {
  const [lang] = useLang();
  const [data, setData] = useState<TodayResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/client/today", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error ?? "Failed to load");
        return;
      }
      setData(json as TodayResp);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>;
  if (!data) return <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>;

  const firstName = data.player.full_name.split(" ")[0];
  const readinessDone = !!data.readinessToday;

  return (
    <div className="space-y-3">
      {/* Greeting */}
      <div>
        <div className="text-xs text-slate-500">{lang === "IS" ? "Halló" : "Hello"}</div>
        <div className="text-xl font-semibold text-slate-900">{firstName} 👋</div>
        {data.team && (
          <div className="text-xs text-slate-500 mt-0.5">
            {lang === "IS" ? "Þjálfari" : "Trainer"}: {data.team.short ?? data.team.name}
          </div>
        )}
      </div>

      {/* Readiness nudge — stays in the PT shell (returns to /client) instead
          of dropping the client onto the football /team surface. */}
      <Link
        href="/player/checkin?return=/client"
        className={`block rounded-xl border p-3.5 transition-colors ${
          readinessDone
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-300 bg-amber-50 hover:bg-amber-100"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-600">
              {lang === "IS" ? "Daglegt check-in" : "Daily check-in"}
            </div>
            <div className={`mt-0.5 text-sm ${readinessDone ? "text-emerald-700" : "text-amber-900"}`}>
              {readinessDone
                ? (lang === "IS" ? "✓ Klárað í dag" : "✓ Done for today")
                : (lang === "IS" ? "Skráðu svefn, þreytu og bólgu" : "Log sleep, fatigue and soreness")}
            </div>
          </div>
          {!readinessDone && <span className="text-amber-700 text-sm font-medium">→</span>}
        </div>
      </Link>

      {/* Today's workout */}
      {data.explosive ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          {/* Programme name banner — always visible so client recognizes
              their plan even on rest days. Was missing before, which made
              rest days feel like nothing was assigned. */}
          {data.explosive.programme_name && (
            <div className="flex items-center gap-1.5 -mb-1">
              <span className="text-[10px]">📋</span>
              <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                {data.explosive.programme_name}
              </span>
            </div>
          )}
          {/* Season-phase banner — shows the trainer's chosen block and the
              plain-language volume/intensity adjustment (explainability). */}
          {isSeasonPhase(data.explosive.season_phase) && (
            <div className="rounded-lg bg-slate-100 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-slate-700">
                {SEASON_PHASE_SPEC[data.explosive.season_phase].label[lang === "EN" ? "EN" : "IS"]}
              </span>
              <span className="text-[11px] text-slate-500"> · {SEASON_PHASE_SPEC[data.explosive.season_phase].note[lang === "EN" ? "EN" : "IS"]}</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
                {data.explosive.rest_day
                  ? (data.explosive.blocks.length > 0
                      ? (lang === "IS" ? "Hvíldardagur · Næsta æfing" : "Rest day · Next session")
                      : (lang === "IS" ? "Hvíldardagur" : "Rest day"))
                  : (lang === "IS" ? "Æfing dagsins" : "Today's session")}
              </div>
              <div className="text-base font-semibold text-slate-900 mt-0.5 truncate">
                {data.explosive.blocks[0]?.name ?? data.explosive.phase_name}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                <span>
                  {(() => {
                    const wpp = data.explosive.weeks_per_phase ?? 3;
                    const tp = data.explosive.total_phases ?? 4;
                    const total = wpp * tp;
                    const cur = (data.explosive.phase - 1) * wpp + (data.explosive.week_in_phase ?? 1);
                    return `${lang === "IS" ? "Vika" : "Week"} ${cur} / ${total}`;
                  })()}
                </span>
                <span>·</span>
                <span>Phase {data.explosive.phase} · {data.explosive.phase_name}</span>
                {data.explosive.weekday_label && (<><span>·</span><span>{data.explosive.weekday_label}</span></>)}
              </div>
            </div>
            {!data.explosive.rest_day && (
              <Link
                href="/client/log"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shrink-0"
              >
                {lang === "IS" ? "Skrá" : "Log"}
              </Link>
            )}
          </div>

          {/* Rest day → encouraging note + next session label */}
          {data.explosive.rest_day && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700">
              {lang === "IS"
                ? "Hvíldu vel í dag — endurheimt er hluti af æfingunni."
                : "Take it easy today — recovery is part of the work."}
              {data.explosive.next_session_label && (
                <div className="text-xs text-slate-500 mt-0.5">
                  {lang === "IS" ? "Næsta æfing" : "Next session"}: {data.explosive.next_session_label}
                </div>
              )}
            </div>
          )}

          {/* Show prescribed exercises — for both today's session AND rest-day
              preview of next session. UI label above clarifies which it is.
              Block list capped to first 8 rows in either mode. */}
          {data.explosive.blocks.slice(0, 1).map((b) => (
            <div key={b.name} className="space-y-1">
              {b.rows.slice(0, 8).map((r, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 text-sm border-b border-slate-100 pb-1.5 last:border-0">
                  <span className="font-medium text-slate-800 truncate">{r.exercise}</span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">
                    {r.sets}×{r.reps}{r.pct1rm ? ` · ${Math.round(r.pct1rm * 100)}%1RM` : ""}
                    {r.velocity ? ` · ${r.velocity} m/s` : ""}
                  </span>
                </div>
              ))}
              {b.rows.length > 8 && (
                <div className="text-[11px] text-slate-400 italic">
                  +{b.rows.length - 8} {lang === "IS" ? "fleiri" : "more"}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1">
            {lang === "IS" ? "Æfing dagsins" : "Today's session"}
          </div>
          <div className="text-sm text-slate-600">
            {lang === "IS"
              ? "Engin föst æfing í dag — skráðu þína eigin æfingu."
              : "No prescribed session today — log your own workout."}
          </div>
          <Link
            href="/client/log"
            className="mt-3 inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            {lang === "IS" ? "Skrá æfingu" : "Log session"}
          </Link>
        </div>
      )}

      {/* Fitness × Fatigue quadrant — where the client sits on chronic vs
          acute load, in plain language. */}
      <LoadQuadrant lang={lang === "EN" ? "EN" : "IS"} />

      {/* Smart insights — Foster + heavy-lift exposure + PR forecast.
          These three are MicroPulse PT's main differentiators vs generic
          calendar apps. Render each card only when it has a useful signal. */}
      {(data.intelligence.foster.status !== "ok" || data.intelligence.exposure.heavy_sets > 0 || data.intelligence.pr_forecast) && (
        <div className="space-y-2">
          {/* Auto-deload alert (Foster) — only when watch+ */}
          {data.intelligence.foster.status !== "ok" && (() => {
            const f = data.intelligence.foster;
            const tone = f.status === "deload_required"
              ? { bg: "bg-red-50", border: "border-red-300", title: "text-red-900", body: "text-red-800", chip: "bg-red-200 text-red-900", icon: "🛑" }
              : f.status === "deload_recommended"
              ? { bg: "bg-amber-50", border: "border-amber-300", title: "text-amber-900", body: "text-amber-800", chip: "bg-amber-200 text-amber-900", icon: "⚠️" }
              : { bg: "bg-yellow-50", border: "border-yellow-300", title: "text-yellow-900", body: "text-yellow-800", chip: "bg-yellow-200 text-yellow-900", icon: "👀" };
            const titleText = f.status === "deload_required" ? (lang === "IS" ? "Deload nauðsynlegt" : "Deload required")
                           : f.status === "deload_recommended" ? (lang === "IS" ? "Deload mælt með" : "Deload recommended")
                           : (lang === "IS" ? "Fylgjast með álagi" : "Watch your load");
            return (
              <div className={`rounded-xl border ${tone.border} ${tone.bg} p-3.5`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{tone.icon}</span>
                    <span className={`text-[11px] uppercase tracking-wide font-semibold ${tone.title}`}>
                      {titleText}
                    </span>
                  </div>
                  {f.monotony != null && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.chip}`}>
                      Monotony {f.monotony.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className={`mt-1 text-sm ${tone.body}`}>{f.reason}</div>
                <div className="mt-1 text-[10px] text-slate-500">
                  Foster 1998 · sRPE × duration · 7-day rolling
                </div>
              </div>
            );
          })()}

          {/* Heavy-lifting exposure (Pareja-Blanco threshold) */}
          {data.intelligence.exposure.heavy_sets > 0 && (() => {
            const e = data.intelligence.exposure;
            const tone = e.status === "excessive" ? { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", bar: "bg-red-500" }
                       : e.status === "high"      ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", bar: "bg-amber-500" }
                       : e.status === "optimal"   ? { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", bar: "bg-emerald-500" }
                                                  : { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", bar: "bg-slate-400" };
            return (
              <div className={`rounded-xl border ${tone.border} ${tone.bg} p-3.5 space-y-2`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-700">
                    💪 {lang === "IS" ? "Þung lyfting þessa viku" : "Heavy lifting this week"}
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${tone.text}`}>
                    {e.heavy_sets} / {e.cap}
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200/70 overflow-hidden">
                  <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${Math.min(100, (e.heavy_sets / e.cap) * 100)}%` }} />
                </div>
                <div className={`text-xs ${tone.text}`}>{e.reason}</div>
                <div className="text-[10px] text-slate-500">
                  ≥80% 1RM · Pareja-Blanco 2017
                </div>
              </div>
            );
          })()}

          {/* PR forecast */}
          {data.intelligence.pr_forecast && (() => {
            const pr = data.intelligence.pr_forecast!;
            const f = pr.forecast;
            const onTrack = f.eta_days !== null;
            return (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-blue-800">
                    🎯 {lang === "IS" ? "Næsta met" : "Next PR"}
                  </div>
                  <span className="rounded-full bg-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-900 truncate max-w-[12rem]">
                    {pr.exercise_name}
                  </span>
                </div>
                <div className="mt-1 text-base font-semibold text-blue-900">
                  {onTrack
                    ? (lang === "IS"
                        ? `${f.target_kg} kg eftir ~${f.eta_weeks} vikur`
                        : `${f.target_kg} kg in ~${f.eta_weeks} weeks`)
                    : (lang === "IS" ? "Engin upp-leitni núna" : "No upward trend right now")}
                </div>
                <div className="text-xs text-blue-700 mt-0.5">
                  {lang === "IS" ? "Núv. PR" : "Current PR"} {f.current_pr_kg} kg
                  {onTrack && ` · +${f.weekly_rate_kg.toFixed(1)} kg/${lang === "IS" ? "viku" : "wk"}`}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Linear regression on Epley e1RM · {f.sessions} {lang === "IS" ? "skráðar æfingar" : "logged sessions"}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/client/profile" className="rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
            {lang === "IS" ? "Líkamsþyngd" : "Body weight"}
          </div>
          {data.bodyweight ? (
            <>
              <div className="text-base font-semibold text-slate-900 mt-0.5">
                {data.bodyweight.latest.weight_kg.toFixed(1)} kg
              </div>
              {data.bodyweight.delta_kg !== null && (
                <div className="text-[11px] text-slate-500">
                  {/* Neutral: mass change isn't good/bad for an athlete. */}
                  {data.bodyweight.delta_kg > 0 ? "+" : ""}{data.bodyweight.delta_kg.toFixed(1)} kg / 7d
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-500 mt-0.5">{lang === "IS" ? "Skrá þyngd →" : "Log weight →"}</div>
          )}
        </Link>
        <Link href="/client/progression" className="rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
            {lang === "IS" ? "Framvinda" : "Progression"}
          </div>
          <div className="text-sm text-slate-700 mt-0.5">
            {lang === "IS" ? "Sjá línurit →" : "View charts →"}
          </div>
        </Link>
      </div>
    </div>
  );
}
