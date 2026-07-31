"use client";

/**
 * PostTrainingCard — on-screen "did we hit the plan?" surface, the post-session
 * mirror of LoadPlanCard. Fetches /api/coach/post-training (the pre-session PLAN
 * diffed against the ACTUAL session GPS) and shows the variance per KPI at team
 * level and per player, so a coach who runs the system can read the session
 * without downloading anything. The PDF download remains for consulting/sending.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import {
  PVA_KPIS, PVA_LABEL,
  type PlannedVsActual, type PvaStatus, type KpiCompare,
} from "@/lib/micropulse/loadPlan/plannedVsActual";

type Rpe = { rpe: number | null; sessionLoad: number | null; durationMin: number | null; n: number };
type RttSummaryPlayer = {
  playerId: string;
  name: string;
  currentlyInjured: boolean;
  rtpStatus: string | null;
  rtpStage: number | null;
  started: boolean;
  thisWeek: { status: "under" | "on" | "over"; loadActual: number; loadTarget: number; deltaPct: number; inProgress: boolean } | null;
};
type Resp = {
  ok: boolean;
  sessionDate: string | null;
  teamName: string | null;
  plannedVsActual: PlannedVsActual | null;
  rpe: Rpe | null;
  playersCaptured?: number;
  error?: string;
};

const fmt = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

// Status → colour + short word. on=green, over/under=amber, well_*=red, na=slate.
const STATUS_TINT: Record<PvaStatus, string> = {
  on: "bg-emerald-100 text-emerald-800",
  over: "bg-amber-100 text-amber-800",
  well_over: "bg-rose-100 text-rose-800",
  under: "bg-amber-100 text-amber-800",
  well_under: "bg-rose-100 text-rose-800",
  na: "bg-slate-100 text-slate-500",
};
const STATUS_DOT: Record<PvaStatus, string> = {
  on: "bg-emerald-500", over: "bg-amber-400", well_over: "bg-rose-500",
  under: "bg-amber-400", well_under: "bg-rose-500", na: "bg-slate-300",
};
const STATUS_WORD: Record<PvaStatus, string> = {
  on: "on plan", over: "over", well_over: "well over",
  under: "under", well_under: "well under", na: "—",
};
const pctTxt = (k: KpiCompare) => (k.pctOfPlan == null ? "—" : `${k.pctOfPlan}%`);

export default function PostTrainingCard({ date }: { date?: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [rtt, setRtt] = useState<RttSummaryPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showPlayers, setShowPlayers] = useState(true);
  const [lang] = useLang();
  const L = (s: { EN: string; IS: string }) => (lang === "IS" ? s.IS : s.EN);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/coach/post-training${date ? `?date=${date}` : ""}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = (await res.json()) as Resp;
      if (!res.ok) { setErr(j.error ?? "Failed"); return; }
      setData(j);
      // Return-to-training snapshot — same source as the PDF, so page == report.
      try {
        const rttRes = await fetch("/api/coach/return-to-training/summary", { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        if (rttRes.ok) { const rj = await rttRes.json(); setRtt((rj.players ?? []) as RttSummaryPlayer[]); }
      } catch { /* non-fatal */ }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Loading post-training report…</div>;
  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>;
  if (!data) return null;

  if (!data.sessionDate) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-base font-semibold text-slate-900">Post-Training Report</h3>
        <p className="text-sm text-slate-600">No captured session was found on or before this date. Once a session&apos;s GPS data is in the system, this page compares it against the pre-session plan.</p>
      </div>
    );
  }

  const pva = data.plannedVsActual;
  const teamBy = (k: string) => pva?.team.find((t) => t.kpi === k) ?? null;
  // Capability-aware: only the KPIs the club has data for (Lite/Core lacks the
  // accel/decel split + IMA but has the combined "efforts").
  const avail = new Set(pva?.availableKpis ?? PVA_KPIS);
  // The ~4 headline metrics, in preference order, filtered to what's available
  // (Full → …ima; Lite → …efforts; indoor/basketball → the IMA counts appended
  // last, which a GPS team never reaches because it fills 4 first). Used for both
  // the headline tiles + per-player breakdown.
  const headKpis = (["totalDistance", "playerLoad", "hsr", "efforts", "ima", "sprint", "imaAccel", "imaDecel", "imaCod", "jumps"] as const)
    .filter((k) => avail.has(k)).slice(0, 4);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">Post-Training Report</h3>
        {data.teamName && <span className="rounded-md bg-slate-900/5 px-2 py-0.5 text-xs font-medium text-slate-700">{data.teamName}</span>}
        {pva?.hasPlan && pva.mdLabel && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{pva.mdLabel}</span>}
        {pva?.hasPlan && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-600">{pva.loadType}</span>}
        <span className="ml-auto text-xs text-slate-400">Session {data.sessionDate}{data.playersCaptured != null ? ` · ${data.playersCaptured} captured` : ""}</span>
      </div>

      {/* One-sentence verdict — the headline a busy coach reads first */}
      {pva && (
        <div className="mb-3 rounded-lg border-l-4 border-indigo-400 bg-indigo-50/50 px-3 py-2 text-sm font-medium text-slate-800">
          {pva.summary}
        </div>
      )}

      {/* Confidence — how much of the squad this read actually saw (principle #4: every verdict shows its confidence) */}
      {(() => {
        const squad = pva?.players.length ?? data.playersCaptured ?? 0;
        const captured = data.playersCaptured ?? 0;
        const cov = squad > 0 ? captured / squad : 0;
        const rpeLogged = !!(data.rpe && data.rpe.rpe != null);
        const rpeN = data.rpe?.n ?? 0;
        const level: "high" | "moderate" | "low" =
          cov >= 0.8 && rpeLogged ? "high" : cov >= 0.5 ? "moderate" : "low";
        const levelLabel = { high: { EN: "high", IS: "há" }, moderate: { EN: "moderate", IS: "miðlungs" }, low: { EN: "low", IS: "lág" } }[level];
        const tone =
          level === "high" ? "bg-emerald-100 text-emerald-800 border-emerald-200"
          : level === "moderate" ? "bg-amber-100 text-amber-800 border-amber-200"
          : "bg-slate-100 text-slate-600 border-slate-200";
        const covTxt = squad > 0 ? `${captured}/${squad} ${L({ EN: "GPS captured", IS: "með GPS" })}` : L({ EN: "no squad list", IS: "enginn hóplisti" });
        const rpeTxt = rpeLogged
          ? `${L({ EN: "effort logged", IS: "áreynsla skráð" })} (${rpeN})`
          : L({ EN: "no effort logged", IS: "engin áreynsla skráð" });
        const thin = cov < 0.5 || !rpeLogged;
        return (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}
              title={L({
                EN: "Confidence reflects how much of the squad this read saw: GPS coverage (players captured vs squad) and whether effort (session-RPE) was logged. Thin coverage → read with caution.",
                IS: "Vissa endurspeglar hve stóran hluta hópsins þessi lestur sá: GPS-þekju (leikmenn með gögn af hópi) og hvort áreynsla (session-RPE) var skráð. Þunn þekja → lesið með varúð.",
              })}
            >
              {L({ EN: "Confidence", IS: "Vissa" })}: {L(levelLabel)} · {covTxt} · {rpeTxt}
            </span>
            {thin && (
              <span className="text-[11px] text-slate-400">
                {L({ EN: "thin coverage — read with caution", IS: "þunn þekja — lesið með varúð" })}
              </span>
            )}
          </div>
        );
      })()}

      {/* How hard it felt — internal load (session-RPE behind a tooltip, not the primary label) */}
      {data.rpe && data.rpe.rpe != null && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span
            className="cursor-help"
            title={L({
              EN: "How hard the session felt — session-RPE: each player's rating of perceived exertion on a 0–10 scale (Foster 2001).",
              IS: "Hve erfið æfingin var — session-RPE: hver leikmaður gefur upplifaða áreynslu á kvarða 0–10 (Foster 2001).",
            })}
          >
            {L({ EN: "How hard it felt", IS: "Hve erfitt það var" })}: <strong className="text-slate-900">{data.rpe.rpe}</strong>/10
          </span>
          {data.rpe.sessionLoad != null && (
            <>
              <span className="text-slate-300">·</span>
              <span
                className="cursor-help"
                title={L({
                  EN: "Internal load — session-RPE load (sRPE): effort rating × session minutes, in arbitrary units (AU). Foster 2001.",
                  IS: "Innra álag — session-RPE álag (sRPE): áreynslueinkunn × mínútur, í handahófseiningum (AU). Foster 2001.",
                })}
              >
                {L({ EN: "Internal load", IS: "Innra álag" })} <strong className="text-slate-900">{fmt(data.rpe.sessionLoad)}</strong> AU
              </span>
            </>
          )}
          {data.rpe.durationMin != null && <><span className="text-slate-300">·</span><span>{fmt(data.rpe.durationMin)} min</span></>}
          <span className="text-slate-300">·</span>
          <span className="text-slate-400">{data.rpe.n} {data.rpe.n === 1 ? L({ EN: "response", IS: "svar" }) : L({ EN: "responses", IS: "svör" })}</span>
        </div>
      )}

      {/* Return-to-training — how each returning player's ramp is going. Same
          source as the PDF report (one verdict, visible everywhere). */}
      {(() => {
        const returning = rtt.filter((p) => p.currentlyInjured || p.started);
        if (returning.length === 0) return null;
        const over = returning.filter((p) => p.thisWeek?.status === "over");
        return (
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">{L({ EN: "Return-to-training — how the ramp is going", IS: "Aftur í æfingar — hvernig upptröppun gengur" })}</div>
              <div className="text-[11px] text-slate-500">{returning.length}{over.length > 0 ? ` · ${over.length} ${L({ EN: "over ramp", IS: "yfir" })}` : ""}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-400">
                  <th className="py-1 pr-2 font-medium">{L({ EN: "Player", IS: "Leikmaður" })}</th>
                  <th className="py-1 pr-2 font-medium">{L({ EN: "RTP stage", IS: "RTP stig" })}</th>
                  <th className="py-1 pr-2 text-right font-medium">{L({ EN: "Week load", IS: "Vikuálag" })}</th>
                  <th className="py-1 pr-2 text-right font-medium">{L({ EN: "Recommended", IS: "Ráðlagt" })}</th>
                  <th className="py-1 pr-2 text-right font-medium">{L({ EN: "vs ramp", IS: "vs upptröppun" })}</th>
                </tr></thead>
                <tbody>
                  {returning.map((p) => {
                    const st = p.thisWeek?.status;
                    const color = st === "over" ? "text-rose-600" : st === "under" ? "text-slate-400" : "text-emerald-600";
                    const vs = !p.thisWeek ? (p.started ? "—" : L({ EN: "not started", IS: "ekki byrjað" }))
                      : st === "over" ? `+${p.thisWeek.deltaPct}% ${L({ EN: "over", IS: "yfir" })}`
                      : st === "under" ? `${p.thisWeek.deltaPct}%${p.thisWeek.inProgress ? ` ${L({ EN: "so far", IS: "hingað til" })}` : ""}`
                      : L({ EN: "on plan", IS: "á áætlun" });
                    const stage = p.rtpStatus ? `${p.rtpStatus.replace(/_/g, " ")} · ${p.rtpStage ?? 0}/5` : (p.currentlyInjured ? L({ EN: "injured", IS: "meiddur" }) : L({ EN: "returned", IS: "til baka" }));
                    return (
                      <tr key={p.playerId} className="border-t border-slate-100">
                        <td className="py-1 pr-2 font-medium text-slate-800">{p.name}</td>
                        <td className="py-1 pr-2 text-slate-600">{stage}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{p.thisWeek ? fmt(p.thisWeek.loadActual) : "—"}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{p.thisWeek ? fmt(p.thisWeek.loadTarget) : "—"}</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${color}`}>{vs}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">{L({ EN: "Over the ramp = ease off; under is usually fine (a partial week reads “so far”). Same source as the PDF report.", IS: "Yfir upptröppun = draga úr; undir er yfirleitt í lagi (hálf vika sýnir “hingað til”). Sama heimild og PDF-reportíð." })}</p>
          </div>
        );
      })()}

      {!pva?.hasPlan ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {pva?.summary ?? "No pre-session plan was available for this date, so there is nothing to compare against."}
        </div>
      ) : (
        <>
          {pva.readinessAdjustPct !== 0 && (
            <p className="mb-2 text-[11px] text-slate-500">Targets shown are the readiness-adjusted plan ({pva.readinessAdjustPct > 0 ? "+" : ""}{pva.readinessAdjustPct}% applied before the session).</p>
          )}

          {/* Headline KPIs: planned → actual with adherence tint */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {headKpis.map((k) => {
              const t = teamBy(k);
              const st = t?.status ?? "na";
              return (
                <div key={k} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-center">
                  <div className="text-lg font-bold text-slate-900">{fmt(t?.actual ?? null)}</div>
                  <div className="text-[10px] text-slate-500">{PVA_LABEL[k]}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">plan {fmt(t?.planned ?? null)}</div>
                  <div className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TINT[st]}`}>{pctTxt(t as KpiCompare)} · {STATUS_WORD[st]}</div>
                </div>
              );
            })}
          </div>

          {/* All 7 KPIs — team planned vs actual */}
          <details className="mt-3 rounded-lg border border-slate-200" open>
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-700">
              All metrics — team plan vs actual
            </summary>
            <div className="overflow-x-auto px-1 pb-2">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-2 py-1 text-left font-semibold">Metric</th>
                    <th className="px-2 py-1 text-right font-semibold">Planned</th>
                    <th className="px-2 py-1 text-right font-semibold">Actual</th>
                    <th className="px-2 py-1 text-right font-semibold">% of plan</th>
                    <th className="px-2 py-1 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {PVA_KPIS.filter((k) => avail.has(k)).map((k) => {
                    const t = teamBy(k);
                    const st = t?.status ?? "na";
                    return (
                      <tr key={k} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 font-medium text-slate-800">{PVA_LABEL[k]}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmt(t?.planned ?? null)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-900">{fmt(t?.actual ?? null)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{t ? pctTxt(t) : "—"}</td>
                        <td className="px-2 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[st]}`} />
                            <span className="text-[11px] text-slate-600">{STATUS_WORD[st]}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="px-2 pt-1.5 text-[10px] leading-relaxed text-slate-400">
                On plan = 85–115% of target (green). Over/under = 60–85% or 115–140% (amber). Well over/under = beyond ±40% (red). Planned = the readiness-adjusted pre-session target; actual = the session-mean captured by GPS.
              </p>
            </div>
          </details>

          {/* Per-player adherence */}
          <button type="button" onClick={() => setShowPlayers((v) => !v)} className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-700">
            {showPlayers ? "Hide" : "Show"} per-player breakdown ({pva.players.length})
          </button>
          {showPlayers && pva.players.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-2 py-1 text-left">Player</th>
                    {headKpis.map((k) => <th key={k} className="px-2 py-1 text-right">{PVA_LABEL[k]}</th>)}
                    <th className="px-2 py-1 text-right">PL % plan</th>
                    <th className="px-2 py-1 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pva.players.map((pp) => {
                    const cell = (k: typeof PVA_KPIS[number]) => {
                      const c = pp.byKpi[k];
                      return (
                        <td key={k} className="px-2 py-1 text-right tabular-nums">
                          <span className="text-slate-900">{fmt(c.actual)}</span>
                          <span className="text-[10px] text-slate-400"> / {fmt(c.planned)}</span>
                        </td>
                      );
                    };
                    return (
                      <tr key={pp.player_id} className="border-t border-slate-100">
                        <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-800">{pp.name}</td>
                        {headKpis.map(cell)}
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">{pp.pctOfPlan != null ? `${pp.pctOfPlan}%` : "—"}</td>
                        <td className="whitespace-nowrap px-2 py-1">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TINT[pp.status]}`}>{STATUS_WORD[pp.status]}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="px-2 pt-1.5 text-[10px] text-slate-400">Each cell shows actual / planned. Status reflects Player Load adherence. Sorted by who ran hottest vs their plan.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
