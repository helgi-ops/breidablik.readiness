"use client";

/**
 * ClientProgrammeOverview — the PT client's read-only view of their whole
 * programme layout (phases/weeks → sessions → exercises with sets×reps, no
 * loads). Renders nothing unless the coach has turned plan visibility on.
 * Collapsible so "today" stays the focus.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Exercise = { name: string; sets: number | null; reps: string | null };
type Session = { name: string; exercises: Exercise[] };
type Group = { label: string; sessions: Session[] };
type Resp = { ok: boolean; visible: boolean; programme_name: string | null; groups: Group[] };

export default function ClientProgrammeOverview({ lang }: { lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<number | null>(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        const res = await fetch(`/api/client/programme`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const j = (await res.json()) as Resp;
        if (alive) setData(res.ok ? j : null);
      } catch { if (alive) setData(null); }
    })();
    return () => { alive = false; };
  }, []);

  if (!data || !data.visible || data.groups.length === 0) return null;

  const setsReps = (e: Exercise) => {
    const parts: string[] = [];
    if (e.sets != null) parts.push(String(e.sets));
    if (e.reps) parts.push(e.reps);
    return parts.join(" × ");
  };

  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <div>
          <div className="text-sm font-semibold text-slate-900">{is ? "Æfingakerfið mitt" : "My programme"}</div>
          {data.programme_name && <div className="text-xs text-slate-500">{data.programme_name} · {data.groups.length} {is ? "fasar/vikur" : "phases/weeks"}</div>}
        </div>
        <span className="text-slate-400">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="border-t px-3 pb-3 pt-2">
          {data.groups.map((g, gi) => {
            const gOpen = openGroup === gi;
            return (
              <div key={gi} className="border-b border-slate-100 last:border-b-0">
                <button type="button" onClick={() => setOpenGroup(gOpen ? null : gi)} className="flex w-full items-center justify-between gap-2 py-2 text-left">
                  <span className="text-[13px] font-medium text-slate-800">{g.label}</span>
                  <span className="text-[11px] text-slate-400">{g.sessions.length} {is ? "æfingar" : "sessions"} {gOpen ? "▴" : "▾"}</span>
                </button>
                {gOpen && (
                  <div className="space-y-2 pb-2">
                    {g.sessions.map((s, si) => (
                      <div key={si} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                        <div className="mb-1 text-[12px] font-semibold text-slate-700">{s.name}</div>
                        <div className="space-y-0.5">
                          {s.exercises.length === 0 && <div className="text-[11px] text-slate-400">—</div>}
                          {s.exercises.map((e, ei) => (
                            <div key={ei} className="flex items-baseline justify-between gap-2 text-[12px]">
                              <span className="text-slate-700">{e.name}</span>
                              <span className="shrink-0 tabular-nums text-slate-400">{setsReps(e)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="mt-2 text-[10px] text-slate-400">
            {is ? "Yfirlit yfir kerfið þitt — þjálfarinn stýrir nákvæmu álagi dag frá degi." : "An overview of your programme — your coach sets the exact loads day to day."}
          </p>
        </div>
      )}
    </div>
  );
}
