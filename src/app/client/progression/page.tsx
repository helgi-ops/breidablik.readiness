"use client";

/**
 * /client/progression — per-exercise e1RM trend chart with PR markers.
 *
 * Uses Recharts (already in deps from the team-side dashboards).
 */

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import LineSpark, { type Point as SparkPoint } from "@/components/client/LineSpark";
import VolumeLoadCard from "@/components/player/VolumeLoadCard";
import PersonalRecordsCard from "@/components/player/PersonalRecordsCard";
import AthleteHero from "@/components/player/AthleteHero";
import LoadQuadrant from "@/components/player/LoadQuadrant";
import TrainingLoadCard from "@/components/player/TrainingLoadCard";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Point = { date: string; weight_kg: number; reps: number; e1rm: number; is_pr: boolean };
type Exercise = { name: string; points: Point[]; pr_e1rm: number | null; sessions: number };

export default function ClientProgressionPage() {
  const [lang] = useLang();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/client/progression?days=180", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Failed"); return; }
      const xs = (json.exercises ?? []) as Exercise[];
      setExercises(xs);
      if (xs.length > 0 && !selected) setSelected(xs[0].name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { void load(); }, [load]);

  const current = useMemo(() => exercises.find((e) => e.name === selected) ?? null, [exercises, selected]);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xl font-semibold text-slate-900">
          {lang === "IS" ? "Framvinda" : "Progression"}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {lang === "IS"
            ? "e1RM (Epley spá) per æfing yfir tíma. PR-merki á efstu metum."
            : "e1RM (Epley estimate) per exercise over time. ★ marks personal records."}
        </div>
      </div>

      {/* Progress + load analytics (moved here from Today to keep Today lean). */}
      <AthleteHero lang={lang === "EN" ? "EN" : "IS"} />
      <LoadQuadrant lang={lang === "EN" ? "EN" : "IS"} />
      <TrainingLoadCard lang={lang === "EN" ? "EN" : "IS"} />
      <VolumeLoadCard lang={lang === "EN" ? "EN" : "IS"} />
      <PersonalRecordsCard lang={lang === "EN" ? "EN" : "IS"} />

      {loading ? (
        <div className="text-sm text-slate-500">{lang === "IS" ? "Hleð…" : "Loading…"}</div>
      ) : err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      ) : exercises.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {lang === "IS"
            ? "Engar skráðar æfingar enn. Farðu á Skrá → bæta við æfingu og lyftu."
            : "No logged sets yet. Head to Log → add an exercise and start lifting."}
        </div>
      ) : (
        <>
          {/* Exercise chips */}
          <div className="flex flex-wrap gap-1.5">
            {exercises.map((e) => (
              <button
                key={e.name}
                type="button"
                onClick={() => setSelected(e.name)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selected === e.name
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {e.name}
                <span className={`ml-1 ${selected === e.name ? "text-white/70" : "text-slate-400"}`}>
                  ·{e.sessions}
                </span>
              </button>
            ))}
          </div>

          {/* Chart for selected */}
          {current && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{current.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {current.sessions} {lang === "IS" ? "skráðar æfingar" : "logged sessions"}
                  </div>
                </div>
                {current.pr_e1rm && (
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold">PR e1RM</div>
                    <div className="text-base font-semibold text-amber-700">{current.pr_e1rm.toFixed(1)} kg</div>
                  </div>
                )}
              </div>

              <LineSpark
                data={current.points.map<SparkPoint>((p) => ({
                  x: p.date,
                  y: p.e1rm,
                  marker: p.is_pr ? "pr" : null,
                  extra: `${p.weight_kg}kg × ${p.reps}`,
                }))}
                height={200}
                yLabel="kg e1RM"
              />

              {/* Recent sets list */}
              <div>
                <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1">
                  {lang === "IS" ? "Síðustu æfingar" : "Recent sessions"}
                </div>
                <div className="space-y-1">
                  {current.points.slice(-5).reverse().map((p) => (
                    <div key={p.date} className="flex items-baseline justify-between text-xs border-b border-slate-100 pb-1 last:border-0">
                      <span className="text-slate-600">{p.date}</span>
                      <span className="text-slate-800 font-medium tabular-nums">
                        {p.weight_kg}kg × {p.reps}
                        <span className="text-slate-500 ml-1.5">→ {p.e1rm.toFixed(1)} kg e1RM</span>
                        {p.is_pr && <span className="ml-1.5 text-amber-700">★</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
