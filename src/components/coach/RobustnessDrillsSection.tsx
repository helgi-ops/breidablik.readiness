"use client";

/**
 * RobustnessDrillsSection — inside the per-player Movement profile, the coach's
 * view of individualised robustness drills: the player's dominant load demands
 * (z-scored vs squad) + any L/R asymmetry, each matched to capacity-building
 * drills the coach can assign. Capacity-building keyed to HIS load — the
 * deliberate complement to Unfamiliar Load (monitoring). Rules recommend; the
 * coach assigns (and can override).
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Drill = { id: string; quality: string; name: { en: string; is: string }; cue: { en: string; is: string }; dose: string; evidence: string; unilateral: boolean };
type Rec = { kind: "demand" | "asymmetry"; quality: string | null; label: { en: string; is: string }; why: { en: string; is: string }; drills: Drill[] };
type Plan = { demands: { quality: string; value: number; z: number | null }[]; asymmetryPct: number | null; asymmetryFlag: boolean; recommendations: Rec[]; confident: boolean; trainingDays: number };
type Resp = { ok: boolean; plan: Plan; assignedDrillIds: string[]; error?: string };

const IS = (l?: string) => (l ?? "").toUpperCase() === "IS";

export default function RobustnessDrillsSection({ playerId, lang }: { playerId: string; lang?: string }) {
  const is = IS(lang);
  const [data, setData] = useState<Resp | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const authHeader = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/coach/player/${playerId}/robustness`, { headers: await authHeader() });
      const j = (await res.json()) as Resp;
      if (res.ok) { setData(j); setAssigned(new Set(j.assignedDrillIds ?? [])); }
      else setData(null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [playerId, authHeader]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (drill: Drill, quality: string | null, reason: string) => {
    const next = !assigned.has(drill.id);
    setBusy(drill.id);
    try {
      const res = await fetch(`/api/coach/player/${playerId}/robustness`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ drill_id: drill.id, quality, reason, active: next }),
      });
      if (res.ok) setAssigned((prev) => { const s = new Set(prev); if (next) s.add(drill.id); else s.delete(drill.id); return s; });
    } catch { /* ignore */ }
    finally { setBusy(null); }
  };

  if (loading) return null;
  if (!data || data.plan.recommendations.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 p-3 text-[12px] text-slate-500">
        {is ? "Ekki næg gögn enn til að sníða robustness-drillur." : "Not enough data yet to tailor robustness drills."}
      </div>
    );
  }

  const { plan } = data;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">{is ? "Robustness-drillur" : "Robustness drills"}</span>
        <span className="text-[11px] text-slate-500">{is ? "byggja getu fyrir HANS álag" : "build capacity for HIS load"}</span>
      </div>
      <p className="mb-2 text-[11px] text-slate-400">
        {is
          ? "Sniðið að hans eigin álagsprófíl — ekki Unfamiliar Load. Reglur stinga upp á, þú úthlutar."
          : "Tailored to his own load profile — not Unfamiliar Load. Rules suggest; you assign."}
      </p>

      {plan.recommendations.map((rec, i) => (
        <div key={i} className="mb-2 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
          <div className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${rec.kind === "asymmetry" ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"}`}>
              {is ? rec.label.is : rec.label.en}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-600">{is ? rec.why.is : rec.why.en}</p>
          <div className="mt-1.5 space-y-1">
            {rec.drills.map((d) => {
              const on = assigned.has(d.id);
              return (
                <div key={d.id} className="flex items-start gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-slate-800">{is ? d.name.is : d.name.en} <span className="text-[10px] font-normal text-slate-400">· {d.dose}</span></div>
                    <div className="text-[10px] text-slate-500">{is ? d.cue.is : d.cue.en}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => toggle(d, rec.quality, is ? rec.why.is : rec.why.en)}
                    className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-50 ${on ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-600 hover:bg-white"}`}
                  >
                    {on ? (is ? "Úthlutað ✓" : "Assigned ✓") : (is ? "Úthluta" : "Assign")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="mt-1 text-[10px] text-slate-400">
        {is ? `Byggt á ${plan.trainingDays} æfingadögum${plan.confident ? "" : " (enn að safna — meðhöndla sem drög)"}.` : `Based on ${plan.trainingDays} training days${plan.confident ? "" : " (still building — treat as draft)"}.`}
      </p>
    </div>
  );
}
