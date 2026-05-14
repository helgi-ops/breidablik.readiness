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
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type TodayResp = {
  ok: true;
  player: { id: string; full_name: string };
  team: { id: string; name: string; type: string | null; short: string | null } | null;
  explosive: {
    level: string; phase: number; phase_name: string; weeks_label: string;
    blocks: Array<{ name: string; rows: Array<{
      num?: string; exercise: string; reps: string; sets: number;
      velocity?: string | number; pct1rm?: number | null; method?: string;
      cluster_rest?: string; set_rest?: string;
    }> }>;
  } | null;
  readinessToday: { id: string; total_score: number | null; color: string | null } | null;
  bodyweight: { latest: { log_date: string; weight_kg: number }; delta_kg: number | null } | null;
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

      {/* Readiness nudge */}
      <Link
        href="/player"
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
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">
                {lang === "IS" ? "Æfing dagsins" : "Today's session"}
              </div>
              <div className="text-base font-semibold text-slate-900 mt-0.5">
                {data.explosive.phase_name}
              </div>
              <div className="text-xs text-slate-500">
                {data.explosive.weeks_label} · {data.explosive.level}
              </div>
            </div>
            <Link
              href="/client/log"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              {lang === "IS" ? "Skrá" : "Log"}
            </Link>
          </div>

          {data.explosive.blocks.slice(0, 1).map((b) => (
            <div key={b.name} className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{b.name}</div>
              <div className="space-y-1">
                {b.rows.slice(0, 6).map((r, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 text-sm border-b border-slate-100 pb-1.5 last:border-0">
                    <span className="font-medium text-slate-800 truncate">{r.exercise}</span>
                    <span className="text-xs text-slate-500 tabular-nums shrink-0">
                      {r.sets}×{r.reps}{r.pct1rm ? ` · ${Math.round(r.pct1rm * 100)}%1RM` : ""}
                      {r.velocity ? ` · ${r.velocity} m/s` : ""}
                    </span>
                  </div>
                ))}
                {b.rows.length > 6 && (
                  <div className="text-[11px] text-slate-400 italic">
                    +{b.rows.length - 6} {lang === "IS" ? "fleiri" : "more"}
                  </div>
                )}
              </div>
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
                <div className={`text-[11px] ${
                  data.bodyweight.delta_kg > 0 ? "text-amber-700"
                  : data.bodyweight.delta_kg < 0 ? "text-emerald-700"
                  : "text-slate-500"
                }`}>
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
