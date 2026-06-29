"use client";

/**
 * ProgramOverviewModal — read-only overview of a saved training plan (æfingakerfi).
 * Lets a coach SEE what's in a program (weeks → sessions → exercises with sets ×
 * reps × load) without entering the full PlanBuilder editor. No editing, no save.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Exercise = { name: string; sets: number; reps: string; loadType?: string; loadValue?: number; velocityTarget?: number; rpeTarget?: number };
type Group = { label: string; exercises: Exercise[] };
type Session = { name?: string; method?: string; bodySplit?: string; dayOfWeek?: number; groups?: Group[]; exercises?: Exercise[] };
type Week = { week: number; sessions: Session[] };
type Tpl = { name: string; plan_type: string; duration_weeks: number; sessions_per_week: number; readiness_enabled?: boolean; structure: Week[] | string };

export default function ProgramOverviewModal({ teamId, templateId, templateName, lang, onClose }: { teamId: string; templateId: string; templateName: string; lang?: string; onClose: () => void }) {
  const isIS = (lang ?? "").toUpperCase() === "IS";
  const [meta, setMeta] = useState<Tpl | null>(null);
  const [weeks, setWeeks] = useState<Week[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        const res = await fetch(`/api/trainer/templates?id=${encodeURIComponent(templateId)}&team_id=${encodeURIComponent(teamId)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        const j = await res.json();
        if (!alive) return;
        if (!res.ok) { setErr(j.error ?? "Failed"); return; }
        const t = j.template as Tpl;
        setMeta(t);
        let parsed: Week[] = [];
        if (typeof t.structure === "string") { try { parsed = JSON.parse(t.structure); } catch { parsed = []; } }
        else if (t.structure) parsed = t.structure as Week[];
        setWeeks(parsed);
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : "Network error"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [teamId, templateId]);

  const loadStr = (e: Exercise): string => {
    if (e.loadType === "velocity" || e.velocityTarget) return e.velocityTarget ? `${e.velocityTarget} m/s` : "";
    if (e.loadType === "RPE" || e.rpeTarget != null) return `RPE ${e.rpeTarget ?? e.loadValue ?? ""}`;
    if (e.loadType === "%1RM") return e.loadValue != null ? `${e.loadValue}% 1RM` : "";
    if (e.loadType === "kg") return e.loadValue ? `${e.loadValue} kg` : "";
    return "";
  };
  const groupsOf = (s: Session): Group[] =>
    (s.groups && s.groups.length) ? s.groups : [{ label: "", exercises: s.exercises ?? [] }];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{isIS ? "Yfirlit æfingakerfis" : "Program overview"}</div>
            <h2 className="truncate text-base font-semibold text-slate-900">{meta?.name ?? templateName}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={isIS ? "Loka" : "Close"}>✕</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-sm text-slate-500">{isIS ? "Hleð…" : "Loading…"}</div>
          ) : err ? (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
          ) : (
            <>
              {meta && (
                <div className="mb-4 text-xs text-slate-500">
                  {meta.duration_weeks} {isIS ? "vikur" : "weeks"} · {meta.sessions_per_week}× {isIS ? "í viku" : "per week"}
                  {meta.readiness_enabled ? ` · ${isIS ? "readiness virkt" : "readiness on"}` : ""}
                </div>
              )}
              {(!weeks || weeks.length === 0) ? (
                <div className="text-sm text-slate-500">{isIS ? "Ekkert innihald í kerfinu." : "No content in this plan."}</div>
              ) : (
                <div className="space-y-4">
                  {weeks.map((w) => (
                    <div key={w.week}>
                      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{isIS ? "Vika" : "Week"} {w.week}</div>
                      <div className="space-y-2">
                        {w.sessions.map((s, si) => {
                          const groups = groupsOf(s);
                          const empty = groups.every((g) => !g.exercises?.length);
                          return (
                            <div key={si} className="rounded-lg border border-slate-200 p-3">
                              <div className="text-sm font-semibold text-slate-800">
                                {s.name || `${isIS ? "Lota" : "Session"} ${si + 1}`}
                                {s.bodySplit ? <span className="ml-1.5 text-[10px] uppercase text-slate-400">{s.bodySplit}</span> : null}
                              </div>
                              <div className="mt-1.5 space-y-1.5">
                                {empty ? (
                                  <div className="text-[12px] text-slate-400">{isIS ? "Engar æfingar" : "No exercises"}</div>
                                ) : groups.map((g, gi) => (
                                  <div key={gi}>
                                    {g.label && <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</div>}
                                    {(g.exercises ?? []).map((e, ei) => {
                                      const ld = loadStr(e);
                                      return (
                                        <div key={ei} className="flex items-baseline justify-between gap-3 text-[13px]">
                                          <span className="text-slate-700">{e.name}</span>
                                          <span className="shrink-0 tabular-nums text-slate-500">{e.sets}×{e.reps}{ld ? ` · ${ld}` : ""}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 text-right">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {isIS ? "Loka" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
