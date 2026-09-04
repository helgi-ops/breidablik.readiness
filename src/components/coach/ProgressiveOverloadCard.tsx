"use client";

/**
 * ProgressiveOverloadCard — preparation-phase build planner. Shows a safe
 * week-by-week ramp per load KPI (ACWR-capped, ceilinged at match demand,
 * differentiated rates) and a per-player build summary.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type CapReason = "rate" | "acwr" | "ceiling";
type WeekTarget = { week: number; target: number | null; pctStep: number | null; pctOfBaseline: number | null; pctOfMatch: number | null; projAcwr: number | null; cap: CapReason | null };
type KpiRamp = { kpi: string; baseline: number | null; matchRef: number | null; ratePct: number; weeks: WeekTarget[] };
type PlayerRamp = { player_id: string; name: string; baselinePL: number | null; acwr: number | null; status: "build" | "progress" | "hold"; statusReason: string; week1PL: number | null; finalPL: number | null; week1Dist: number | null; finalDist: number | null };
type Plan = {
  teamName?: string | null;
  weeks: number; hasData: boolean; teamAcwr: number | null; startWeekOf: string;
  ramps: KpiRamp[]; perPlayer: PlayerRamp[];
  coverage: { trainingDays: number; matchDays: number; playersWithHistory: number; totalPlayers: number };
  note: string;
};

const fmt = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
const CAP_TINT: Record<CapReason, string> = { rate: "text-slate-500", acwr: "text-amber-600", ceiling: "text-sky-600" };
// Hub stance: the plain guardrail is "don't spike the week" (acute-load trend), not an ACWR band —
// ACWR stays a labelled contested reference only (Teixeira 2021 + the club's "Dismiss ACWR" note).
const CAP_LABEL: Record<CapReason, string> = { rate: "rate", acwr: "held (no spike)", ceiling: "match ceiling" };

/** `playerId` focuses the projection on one player (his baseline → his match ref); `emphasis` biases the
 *  weekly rate of the given KPIs (the weakness steer) — the engine's ACWR + match-ceiling caps still bound
 *  it. `focusLabel` names the focus in the header. All optional → the neutral team-wide build. */
export default function ProgressiveOverloadCard({ date, weeks = 5, playerId, emphasis, focusLabel }: { date?: string; weeks?: number; playerId?: string; emphasis?: Record<string, number>; focusLabel?: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showPlayers, setShowPlayers] = useState(false);

  const emphKey = emphasis ? Object.entries(emphasis).filter(([, v]) => v !== 1).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(",") : "";
  const steered = emphKey.length > 0;

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const qs = new URLSearchParams();
      if (date) qs.set("date", date);
      qs.set("weeks", String(weeks));
      if (playerId) qs.set("player", playerId);
      if (emphKey) qs.set("emph", emphKey);
      const res = await fetch(`/api/coach/progressive-overload?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setPlan(j.plan as Plan);
      setLabels((j.labels ?? {}) as Record<string, string>);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  }, [date, weeks, playerId, emphKey]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Loading build plan…</div>;
  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>;
  if (!plan) return null;

  const acwrColor = plan.teamAcwr == null ? "text-slate-700" : plan.teamAcwr > 1.3 ? "text-red-600" : plan.teamAcwr < 0.8 ? "text-amber-600" : "text-emerald-600";
  const holdN = plan.perPlayer.filter((p) => p.status === "hold").length;
  const buildN = plan.perPlayer.filter((p) => p.status === "build").length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">Progressive Overload — Build Plan</h3>
        {focusLabel ? <span className="rounded-md bg-[#2740e6]/10 px-2 py-0.5 text-xs font-medium text-[#2740e6]">{focusLabel}</span> : plan.teamName && <span className="rounded-md bg-slate-900/5 px-2 py-0.5 text-xs font-medium text-slate-700">{plan.teamName}</span>}
        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">{plan.weeks}-week ramp</span>
        {steered && <span className="rounded-md bg-[#7a5cc4]/10 px-2 py-0.5 text-xs font-medium text-[#7a5cc4]" title="Weakness-steered: the emphasised KPIs ramp faster, still within the ACWR + match-ceiling caps.">weakness-steered</span>}
        <span className="ml-auto text-xs text-slate-400">from {plan.startWeekOf}</span>
      </div>

      {!plan.hasData ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{plan.note}</div>
      ) : (
        <>
          <div className="mb-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] leading-snug text-sky-800">{plan.note}</div>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span title="Contested reference only (Teixeira 2021). The plan's guardrails are match demand + the acute-load trend, not an ACWR band.">Team ACWR <span className="text-slate-400">(contested)</span>: <strong className={acwrColor}>{plan.teamAcwr != null ? plan.teamAcwr.toFixed(2) : "—"}</strong></span>
            <span className="text-slate-300">·</span>
            <span>Built on {plan.coverage.trainingDays} training days · {plan.coverage.playersWithHistory}/{plan.coverage.totalPlayers} players</span>
            {(holdN > 0 || buildN > 0) && <span className="text-slate-300">·</span>}
            {holdN > 0 && <span className="text-amber-700">{holdN} to hold</span>}
            {buildN > 0 && <span className="text-emerald-700">{buildN} room to build</span>}
          </div>

          {/* Weekly ramp per KPI */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 text-left">Metric (per session / player)</th>
                  <th className="px-2 py-1.5 text-right">Now</th>
                  {plan.ramps[0]?.weeks.map((w) => (
                    <th key={w.week} className="px-2 py-1.5 text-right">Wk {w.week}</th>
                  ))}
                  <th className="px-2 py-1.5 text-right">Match</th>
                </tr>
              </thead>
              <tbody>
                {plan.ramps.map((r) => (
                  <tr key={r.kpi} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-slate-800">{labels[r.kpi] ?? r.kpi}</div>
                      <div className="text-[10px] text-slate-400">+{r.ratePct}% / week</div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{fmt(r.baseline)}</td>
                    {r.weeks.map((w) => (
                      <td key={w.week} className="px-2 py-1.5 text-right tabular-nums">
                        <div className="font-semibold text-slate-900">{fmt(w.target)}</div>
                        <div className={`text-[9px] ${w.cap ? CAP_TINT[w.cap] : "text-slate-400"}`}>
                          {w.pctOfMatch != null ? `${w.pctOfMatch}%m` : ""}{w.cap && w.cap !== "rate" ? ` · ${CAP_LABEL[w.cap]}` : ""}
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{fmt(r.matchRef)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
            Each cell = the recommended per-session per-player target for that week. <span className="text-amber-600">held (no spike)</span> = the week was trimmed so acute load doesn&apos;t jump too far past recent load; <span className="text-sky-600">match ceiling</span> = it reached match demand and holds. &quot;%m&quot; = % of the squad&apos;s match reference. Volume ramps faster than high-speed/sprint by design (hamstring exposure). ACWR is shown as a contested reference only — the guardrails are match demand + the acute-load trend (Teixeira 2021).
          </p>

          <button type="button" onClick={() => setShowPlayers((v) => !v)} className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-700">
            {showPlayers ? "Hide" : "Show"} per-player build ({plan.perPlayer.length})
          </button>
          {showPlayers && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-2 py-1 text-left">Player</th>
                    <th className="px-2 py-1 text-right">ACWR</th>
                    <th className="px-2 py-1 text-left">Plan</th>
                    <th className="px-2 py-1 text-right">Player Load now→wk{plan.weeks}</th>
                    <th className="px-2 py-1 text-right">Dist wk{plan.weeks} (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.perPlayer.map((p) => (
                    <tr key={p.player_id} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-medium text-slate-800">{p.name}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${p.acwr != null && p.acwr >= 1.3 ? "font-semibold text-red-600" : p.acwr != null && p.acwr < 0.8 ? "text-amber-600" : "text-slate-700"}`}>{p.acwr != null ? p.acwr.toFixed(2) : "—"}</td>
                      <td className="px-2 py-1 text-left text-[11px]">
                        <span className={p.status === "hold" ? "text-amber-700" : p.status === "build" ? "text-emerald-700" : "text-slate-600"}>
                          {p.status === "hold" ? "↺ hold" : p.status === "build" ? "↑ build faster" : "→ progress"}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(p.baselinePL)} → <strong>{fmt(p.finalPL)}</strong></td>
                      <td className="px-2 py-1 text-right tabular-nums"><strong>{fmt(p.finalDist)}</strong></td>
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
