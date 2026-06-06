"use client";

/**
 * LoadPlanCard — forward-looking "what should today's load be?" surface.
 * Fetches /api/coach/load-plan and shows the recommended session type
 * (mechanical / locomotive / mixed), per-KPI targets anchored to match demand,
 * acute:chronic context, a readiness modifier and per-player targets + flags,
 * with a detailed explanation. Deterministic numbers; AI narrative is layered
 * on separately.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type KpiTarget = { kpi: string; target: number | null; matchRef: number | null; pctOfMatch: number | null };
type PlayerPlan = {
  player_id: string; name: string;
  totalDistance: number | null; playerLoad: number | null; ima: number | null;
  acwr: number | null; flag: "ok" | "reduce" | "build"; flagReason: string | null;
};
type Plan = {
  sessionDate: string;
  planned: {
    applicable: boolean; mdLabel: string | null; loadType: "mechanical" | "locomotive" | "mixed";
    band: string; rpe: number; durationMin: number; sessionLoad: number; matchPct: number;
    rationaleEN: string;
  };
  applicable: boolean;
  targets: KpiTarget[];
  matchDaysUsed: number;
  teamAcwr: number | null; acutePL: number | null; chronicPL: number | null;
  readinessAdjustPct: number; readinessNote: string | null;
  perPlayer: PlayerPlan[];
};

const KPI_LABEL: Record<string, string> = {
  totalDistance: "Total distance (m)", playerLoad: "Player Load", hsr: "High-speed dist (m)",
  sprint: "Sprint dist (m)", accel: "Accelerations", decel: "Decelerations", ima: "IMA high-int (m)",
};
const TYPE_TINT: Record<string, string> = {
  mechanical: "bg-orange-100 text-orange-800",
  locomotive: "bg-sky-100 text-sky-800",
  mixed: "bg-violet-100 text-violet-800",
};
const TYPE_DESC: Record<string, string> = {
  mechanical: "force / accel-decel emphasis (mechanical work, short high-effort actions)",
  locomotive: "high-speed running emphasis (locomotor — sprints, HSR volume)",
  mixed: "balanced — neither force nor speed dominant",
};
const fmt = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

export default function LoadPlanCard({ date }: { date?: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showPlayers, setShowPlayers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/coach/load-plan${date ? `?date=${date}` : ""}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setPlan(j.plan as Plan);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Loading load plan…</div>;
  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>;
  if (!plan) return null;

  const p = plan.planned;
  const acwrColor = plan.teamAcwr == null ? "text-slate-700" : plan.teamAcwr > 1.3 ? "text-red-600" : plan.teamAcwr < 0.8 ? "text-amber-600" : "text-emerald-600";
  const targetBy = (k: string) => plan.targets.find((t) => t.kpi === k);
  const head = ["totalDistance", "hsr", "playerLoad", "ima"];
  const reducePlayers = plan.perPlayer.filter((x) => x.flag === "reduce");

  // Detailed deterministic explanation.
  const narrative: string[] = [];
  if (!plan.applicable) {
    narrative.push(p.rationaleEN);
  } else {
    narrative.push(
      `Today is ${p.mdLabel ?? "a training day"} in the microcycle, which calls for a ${p.loadType} session — ${TYPE_DESC[p.loadType]}. The target is set at ${p.matchPct}% of match demand and re-weighted toward that emphasis.`,
    );
    const td = targetBy("totalDistance"); const hsr = targetBy("hsr"); const pl = targetBy("playerLoad"); const ima = targetBy("ima");
    const bits: string[] = [];
    if (td?.target != null) bits.push(`~${fmt(td.target)} m total distance per player (${td.pctOfMatch}% of a match's ${fmt(td.matchRef)} m)`);
    if (hsr?.target != null) bits.push(`~${fmt(hsr.target)} m high-speed running`);
    if (pl?.target != null) bits.push(`~${fmt(pl.target)} Player Load`);
    if (ima?.target != null) bits.push(`~${fmt(ima.target)} m IMA high-intensity distance`);
    if (bits.length) narrative.push(`Per-player targets: ${bits.join(", ")}. The match reference is the squad's average on its ${plan.matchDaysUsed} highest-load days over the last 17 weeks.`);
    if (plan.teamAcwr != null) {
      narrative.push(
        `Recent load: the squad's acute (7-day) Player Load is ${fmt(plan.acutePL)} against a ${fmt(plan.chronicPL)} chronic (28-day) average — an acute:chronic ratio of ${plan.teamAcwr.toFixed(2)} (${plan.teamAcwr > 1.3 ? "above the Gabbett sweet spot — keep today controlled" : plan.teamAcwr < 0.8 ? "below the sweet spot — there is room to load" : "inside the 0.8–1.3 sweet spot"}).`,
      );
    }
    if (plan.readinessNote) narrative.push(plan.readinessNote);
    if (reducePlayers.length) narrative.push(`${reducePlayers.length} player${reducePlayers.length === 1 ? "" : "s"} should hold back today (already spiking): ${reducePlayers.slice(0, 6).map((x) => `${x.name} (ACWR ${x.acwr?.toFixed(2)})`).join(", ")}.`);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">Today&apos;s Load Target</h3>
        {p.applicable && (
          <>
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${TYPE_TINT[p.loadType]}`}>{p.loadType}</span>
            {p.mdLabel && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{p.mdLabel}</span>}
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{p.matchPct}% of match</span>
          </>
        )}
        <span className="ml-auto text-xs text-slate-400">{plan.sessionDate}</span>
      </div>

      {!p.applicable ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{p.rationaleEN}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {head.map((k) => {
              const t = targetBy(k);
              return (
                <div key={k} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-center">
                  <div className="text-lg font-bold text-slate-900">{fmt(t?.target ?? null)}</div>
                  <div className="text-[10px] text-slate-500">{KPI_LABEL[k]}</div>
                  {t?.pctOfMatch != null && <div className="text-[10px] text-slate-400">{t.pctOfMatch}% of match</div>}
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>sRPE target: <strong className="text-slate-900">{p.sessionLoad}</strong> AU (RPE {p.rpe} × {p.durationMin} min)</span>
            <span className="text-slate-300">·</span>
            <span>Team ACWR: <strong className={acwrColor}>{plan.teamAcwr != null ? plan.teamAcwr.toFixed(2) : "—"}</strong></span>
            {plan.readinessAdjustPct !== 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-amber-700">Readiness suggests {plan.readinessAdjustPct}%</span>
              </>
            )}
          </div>

          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            {narrative.map((s, i) => <p key={i} className={i > 0 ? "mt-1.5" : ""}>{s}</p>)}
          </div>

          <button type="button" onClick={() => setShowPlayers((v) => !v)} className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-700">
            {showPlayers ? "Hide" : "Show"} per-player targets ({plan.perPlayer.length})
          </button>
          {showPlayers && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-2 py-1 text-left">Player</th>
                    <th className="px-2 py-1 text-right">Dist (m)</th>
                    <th className="px-2 py-1 text-right">Player Load</th>
                    <th className="px-2 py-1 text-right">IMA (m)</th>
                    <th className="px-2 py-1 text-right">ACWR</th>
                    <th className="px-2 py-1 text-left">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.perPlayer.map((pp) => (
                    <tr key={pp.player_id} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-medium text-slate-800">{pp.name}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.totalDistance)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.playerLoad)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.ima)}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${pp.acwr != null && pp.acwr >= 1.3 ? "font-semibold text-red-600" : pp.acwr != null && pp.acwr < 0.8 ? "text-amber-600" : "text-slate-700"}`}>{pp.acwr != null ? pp.acwr.toFixed(2) : "—"}</td>
                      <td className="px-2 py-1 text-left text-[11px] text-slate-500">{pp.flag === "reduce" ? `↓ ${pp.flagReason ?? "reduce"}` : pp.flag === "build" ? `↑ ${pp.flagReason ?? "room to build"}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
