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
import { downloadLoadPlanPdf } from "@/components/coach/LoadPlanPdf";
import { buildLoadPlanNarrative, buildLoadPlanBottomLine } from "@/lib/micropulse/loadPlan/narrative";
import { useLang } from "@/lib/lang";

type KpiTarget = { kpi: string; target: number | null; matchRef: number | null; pctOfMatch: number | null };
type PlayerPlan = {
  player_id: string; name: string;
  totalDistance: number | null; playerLoad: number | null;
  hsr: number | null; sprint: number | null; accel: number | null; decel: number | null;
  ima: number | null;
  acwr: number | null; flag: "ok" | "reduce" | "build"; flagReason: string | null;
};
type Plan = {
  sessionDate: string;
  teamName?: string | null;
  planned: {
    applicable: boolean; mdLabel: string | null; loadType: "mechanical" | "locomotive" | "mixed";
    band: string; rpe: number; durationMin: number; sessionLoad: number; matchPct: number;
    rationaleEN: string;
  };
  applicable: boolean;
  mode: "microcycle" | "recent_baseline" | "unavailable";
  hasTargets: boolean;
  baselineNote: string | null;
  targets: KpiTarget[];
  availableKpis?: string[];
  matchDaysUsed: number;
  teamAcwr: number | null; acutePL: number | null; chronicPL: number | null;
  readinessAdjustPct: number; readinessNote: string | null;
  targetRpe: number | null; targetDurationMin: number | null; targetSrpe: number | null; srpeSource: "microcycle" | "recent" | "none";
  recentSessions: Array<{ date: string; totalDistance: number | null; playerLoad: number | null; hsr: number | null; isPeak: boolean }>;
  perPlayer: PlayerPlan[];
  recentAvg: Record<string, number | null>;
  adjustedTargets: KpiTarget[];
  coverage: { trainingDays: number; matchDays: number; distinctDates: number; playersWithHistory: number; totalPlayers: number; windowDays: number };
  recentLean: { mechIdx: number | null; locoIdx: number | null; lean: "mechanical" | "locomotive" | "balanced" | null; note: string | null };
};
type ReadinessSummary = { green: number; yellow: number; red: number; checkedIn: number; rosterWithGps: number };
type AttentionPlayer = { player_id: string; name: string; color: string; score: number | null; acwr: number | null; reason: string | null; drivers?: string[] };

const KPI_LABEL: Record<string, string> = {
  totalDistance: "Total distance (m)", playerLoad: "Player Load", hsr: "High-speed dist (m)",
  sprint: "Sprint dist (m)", accel: "Accelerations", decel: "Decelerations", efforts: "Hard efforts", ima: "High-intensity efforts (m)",
  imaAccel: "IMA accelerations", imaDecel: "IMA decelerations", imaCod: "Change of direction", jumps: "Jumps",
};
// Optional jargon tooltip per KPI — the abbreviation + paper citation stays reachable
// on hover so the primary label can read plainly (explainability-first §jargon).
const KPI_TOOLTIP: Record<string, string> = {
  hsr: "HSR = high-speed running (band 5)",
  ima: "IMA = high-intensity accel/decel/change-of-direction efforts (McBurnie 2022)",
};
const TYPE_TINT: Record<string, string> = {
  mechanical: "bg-orange-100 text-orange-800",
  locomotive: "bg-sky-100 text-sky-800",
  mixed: "bg-violet-100 text-violet-800",
};
const KPI_ALL: string[] = ["totalDistance", "playerLoad", "hsr", "sprint", "accel", "decel", "efforts", "ima", "imaAccel", "imaDecel", "imaCod", "jumps"];
const KPI_MEANING: Record<string, string> = {
  totalDistance: "Overall running volume — the size of the session.",
  playerLoad: "Total mechanical work (accelerometer) — the best single 'how hard' number.",
  hsr: "Distance run at high speed (band 5) — conditioning + hamstring exposure.",
  sprint: "Distance at sprint speed (band 6) — top-end speed exposure.",
  accel: "High-intensity accelerations — explosive starts (mechanical load).",
  decel: "High-intensity decelerations — braking actions (knee/quad load).",
  ima: "High-intensity multidirectional distance — cutting, changes of direction.",
  imaAccel: "Explosive accelerations (IMA inertial-sensor count) — Pro only.",
  imaDecel: "Explosive decelerations / braking (IMA count) — Pro only (McBurnie 2022).",
  imaCod: "Change-of-direction events (IMA) — cutting load (McBurnie 2022).",
  jumps: "Jumps (IMA) — take-off / landing load.",
};
const fmt = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

export default function LoadPlanCard({ date, restDay = false }: { date?: string; restDay?: boolean }) {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [plan, setPlan] = useState<Plan | null>(null);
  const [readiness, setReadiness] = useState<ReadinessSummary | null>(null);
  const [topAttention, setTopAttention] = useState<AttentionPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showPlayers, setShowPlayers] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

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
      setReadiness((j.readiness ?? null) as ReadinessSummary | null);
      setTopAttention((j.topAttention ?? []) as AttentionPlayer[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const doPdf = useCallback(async () => {
    if (!plan) return;
    setPdfBusy(true);
    try { await downloadLoadPlanPdf(plan, topAttention, readiness, restDay); }
    catch { /* ignore */ }
    finally { setPdfBusy(false); }
  }, [plan, topAttention, readiness, restDay]);

  if (loading) return <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Loading load plan…</div>;
  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>;
  if (!plan) return null;

  const p = plan.planned;
  const acwrColor = plan.teamAcwr == null ? "text-slate-700" : plan.teamAcwr > 1.3 ? "text-red-600" : plan.teamAcwr < 0.8 ? "text-amber-600" : "text-emerald-600";
  const targetBy = (k: string) => plan.targets.find((t) => t.kpi === k);
  // Capability-aware: only show KPIs the club has data for (Lite/Core lacks the
  // accel/decel split + IMA, but has the combined "efforts"). Falls back to all.
  const avail = new Set(plan.availableKpis ?? KPI_ALL);
  const shownKpis = KPI_ALL.filter((k) => avail.has(k));
  const head = ["totalDistance", "hsr", "playerLoad", "efforts", "ima", "sprint"].filter((k) => avail.has(k)).slice(0, 4);

  // Detailed deterministic explanation — the SAME text the PDF renders.
  const narrative = buildLoadPlanNarrative(plan, readiness?.checkedIn ?? null);
  const bottomLine = buildLoadPlanBottomLine(plan, readiness?.red ?? null);

  // Confidence — derived deterministically from coverage already computed
  // (principle #4: every verdict shows its confidence; never fake it).
  // How many players the plan rests on + how many training/match days sit
  // behind the targets. Thin coverage → "low"; never silently confident.
  const cov = plan.coverage;
  const histShare = cov.totalPlayers > 0 ? cov.playersWithHistory / cov.totalPlayers : 0;
  const confLevel: "high" | "moderate" | "low" =
    plan.mode === "unavailable" || !plan.hasTargets
      ? "low"
      : histShare >= 0.7 && cov.trainingDays >= 6 && cov.matchDays >= 2
        ? "high"
        : histShare >= 0.4 && cov.trainingDays >= 3 && cov.matchDays >= 1
          ? "moderate"
          : "low";
  const confLabel = { high: { EN: "high", IS: "mikil" }, moderate: { EN: "moderate", IS: "miðlungs" }, low: { EN: "low", IS: "lítil" } }[confLevel];
  const confChipText = IS
    ? `Vissa: ${confLabel.IS} · ${cov.playersWithHistory}/${cov.totalPlayers} leikm. með sögu · ${cov.trainingDays} æfinga-/${cov.matchDays} leikdagar`
    : `Confidence: ${confLabel.EN} · ${cov.playersWithHistory}/${cov.totalPlayers} players with history · ${cov.trainingDays} training/${cov.matchDays} match days`;
  const confChipTitle = IS
    ? "Þekja merkja + grunnlínu-þroski — hve margir leikmenn og dagar liggja að baki ráðleggingunni"
    : "Signal coverage + baseline maturity — how many players and days the plan rests on";
  const confTone =
    confLevel === "high" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : confLevel === "moderate" ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">Pre-Session Report</h3>
        {plan.teamName && <span className="rounded-md bg-slate-900/5 px-2 py-0.5 text-xs font-medium text-slate-700">{plan.teamName}</span>}
        {plan.mode === "microcycle" ? (
          <>
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${TYPE_TINT[p.loadType]}`}>{p.loadType}</span>
            {p.mdLabel && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{p.mdLabel}</span>}
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{p.matchPct}% of match</span>
          </>
        ) : plan.mode === "recent_baseline" ? (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Recent-load baseline</span>
        ) : null}
        <span className="ml-auto text-xs text-slate-400">{plan.sessionDate}</span>
      </div>

      {/* Today's bottom line — the one sentence a busy coach reads first */}
      {plan.hasTargets && !restDay && (
        <div className="mb-3 rounded-lg border-l-4 border-indigo-400 bg-indigo-50/50 px-3 py-2 text-sm font-medium text-slate-800">
          {bottomLine}
        </div>
      )}

      {/* Confidence chip — sits with the verdict, never buried (principle #4) */}
      <div className={`mb-3 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${confTone}`} title={confChipTitle}>
        {confChipText}
      </div>

      {/* Top attention today — checked-in players flagged red/yellow */}
      {(readiness || topAttention.length > 0) && (
        <div className="mb-3 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top attention today</span>
            {readiness && (
              <span className="text-[11px] text-slate-400">
                {readiness.checkedIn} checked in · <span className="text-emerald-600">{readiness.green} green</span> · <span className="text-amber-600">{readiness.yellow} yellow</span> · <span className="text-rose-600">{readiness.red} red</span>
              </span>
            )}
          </div>
          {topAttention.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">No flagged check-ins — squad is broadly green.</p>
          ) : (
            <div className="mt-1.5 space-y-2">
              {topAttention.slice(0, 15).map((a) => (
                <div key={a.player_id} className="flex items-baseline gap-2 text-xs">
                  <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${a.color === "red" ? "bg-rose-500" : "bg-amber-400"}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-slate-800">{a.name}</span>
                      <span className={`text-[10px] font-semibold uppercase ${a.color === "red" ? "text-rose-600" : "text-amber-600"}`}>{a.color}</span>
                      {a.score != null && <span className="text-[10px] text-slate-400">readiness {a.score}/25</span>}
                    </div>
                    {a.drivers && a.drivers.length > 0 ? (
                      <ul className="mt-0.5 space-y-0.5">
                        {a.drivers.map((d, i) => (
                          <li key={i} className="text-[11px] leading-snug text-slate-600">— {d}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-600">{a.reason ?? (a.color === "red" ? "Red readiness" : "Yellow readiness")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {restDay ? (
        <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Rest day — no training load planned.</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Marked as a rest day, so no load targets are prescribed. Use today for recovery; the readiness check-ins above still flag anyone to keep an eye on. Uncheck &quot;Rest day&quot; to see the recommended session load instead.
          </p>
          <button
            type="button"
            onClick={doPdf}
            disabled={pdfBusy}
            className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {pdfBusy ? "…" : "Download PDF"}
          </button>
        </div>
      ) : !plan.hasTargets ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{p.rationaleEN}</div>
      ) : (
        <>
          {plan.mode === "recent_baseline" && plan.baselineNote && (
            <div className="mb-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] leading-snug text-sky-800">{plan.baselineNote}</div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {head.map((k) => {
              const t = targetBy(k);
              return (
                <div key={k} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-center">
                  <div className="text-lg font-bold text-slate-900">{fmt(t?.target ?? null)}</div>
                  <div className="text-[10px] text-slate-500" title={KPI_TOOLTIP[k]}>{KPI_LABEL[k]}</div>
                  {t?.pctOfMatch != null && <div className="text-[10px] text-slate-400">{t.pctOfMatch}% of match</div>}
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            {plan.mode === "microcycle" ? (
              <span title="sRPE (session-RPE) = perceived exertion × minutes (Foster 2001)">Session-load target: <strong className="text-slate-900">{p.sessionLoad}</strong> AU (RPE {p.rpe} × {p.durationMin} min)</span>
            ) : (
              <span>
                Session emphasis: <strong className="text-slate-900">mixed</strong>{plan.recentLean.lean ? <> · recent squad lean: <strong className="text-slate-900">{plan.recentLean.lean}</strong></> : null}
                {plan.targetSrpe != null ? <span title="sRPE (session-RPE) = perceived exertion × minutes (Foster 2001)"> · target session-load <strong className="text-slate-900">{plan.targetSrpe}</strong> AU (RPE ~{plan.targetRpe} × {plan.targetDurationMin} min)</span> : null}
              </span>
            )}
            <span className="text-slate-300">·</span>
            <span title="ACWR = acute:chronic workload ratio (Gabbett 2017)">Recent vs usual load: <strong className={acwrColor}>{plan.teamAcwr != null ? plan.teamAcwr.toFixed(2) : "—"}</strong></span>
            {plan.readinessAdjustPct !== 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-amber-700">Readiness suggests {plan.readinessAdjustPct}%</span>
              </>
            )}
          </div>

          {/* Readiness-adjusted prescription — the numbers to actually use today */}
          {plan.readinessAdjustPct !== 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold">After the {plan.readinessAdjustPct}% readiness trim — prescribe today:</span>{" "}
              {head.map((k, i) => {
                const a = plan.adjustedTargets.find((t) => t.kpi === k);
                return <span key={k}>{i > 0 ? " · " : ""}<span title={KPI_TOOLTIP[k]}>{KPI_LABEL[k]}</span> <strong>{fmt(a?.target ?? null)}</strong></span>;
              })}
            </div>
          )}

          {/* Leading in — the squad's last sessions before today */}
          {plan.recentSessions.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Leading in — last {plan.recentSessions.length} session{plan.recentSessions.length === 1 ? "" : "s"}</div>
              <div className="flex gap-1.5 overflow-x-auto">
                {plan.recentSessions.map((sx) => (
                  <div key={sx.date} className={`min-w-[88px] flex-1 rounded-lg border p-2 text-center ${sx.isPeak ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-slate-50/60"}`}>
                    <div className="text-[10px] text-slate-500">{sx.date.slice(5)}{sx.isPeak ? " · peak" : ""}</div>
                    <div className="text-sm font-bold text-slate-900">{fmt(sx.playerLoad)}</div>
                    <div className="text-[9px] text-slate-400">Player Load</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{fmt(sx.totalDistance)} m · <span title="HSR = high-speed running">{fmt(sx.hsr)} high-speed</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            {narrative.map((s, i) => <p key={i} className={i > 0 ? "mt-1.5" : ""}>{s}</p>)}
          </div>

          {/* Full per-metric breakdown — every KPI, what it means, target vs match vs recent */}
          <details className="mt-2 rounded-lg border border-slate-200">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-700">
              {`All ${shownKpis.length} metrics explained`} — target vs match demand vs recent average
            </summary>
            <div className="overflow-x-auto px-1 pb-2">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-2 py-1 text-left font-semibold">Metric</th>
                    <th className="px-2 py-1 text-right font-semibold">Target</th>
                    <th className="px-2 py-1 text-right font-semibold">% of match</th>
                    <th className="px-2 py-1 text-right font-semibold">Match ref</th>
                    <th className="px-2 py-1 text-right font-semibold">Recent avg</th>
                  </tr>
                </thead>
                <tbody>
                  {shownKpis.map((k) => {
                    const t = targetBy(k);
                    const recent = plan.recentAvg?.[k] ?? null;
                    return (
                      <tr key={k} className="border-b border-slate-100 align-top">
                        <td className="px-2 py-1.5">
                          <div className="font-medium text-slate-800">{KPI_LABEL[k]}</div>
                          <div className="text-[10px] text-slate-500">{KPI_MEANING[k]}</div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-900">{fmt(t?.target ?? null)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{t?.pctOfMatch != null ? `${t.pctOfMatch}%` : "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{fmt(t?.matchRef ?? null)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{fmt(recent != null ? Math.round(recent) : null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="px-2 pt-1.5 text-[10px] leading-relaxed text-slate-400">
                Target = recent training-day average re-scaled by the squad acute:chronic ratio ({plan.teamAcwr != null ? plan.teamAcwr.toFixed(2) : "—"}). Match ref = the squad&apos;s average on its {plan.coverage.matchDays} highest-load (≈ match) days. Recent avg = the raw last-4-week training-day mean before any adjustment. ACWR 0.8–1.3 ≈ a load change within the familiar range; it&apos;s a spike-size context for scaling, not an injury predictor (Gabbett 2016; not validated for injury risk — Impellizzeri 2020).
              </p>
            </div>
          </details>

          {/* Export action */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={doPdf}
              disabled={pdfBusy}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {pdfBusy ? "…" : "Download PDF"}
            </button>
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
                    <th className="px-2 py-1 text-right" title="HSR = high-speed running (velocity band 5)">HSR VB5 (m)</th>
                    <th className="px-2 py-1 text-right">Sprint VB6 (m)</th>
                    <th className="px-2 py-1 text-right">Player Load</th>
                    <th className="px-2 py-1 text-right">Accel B2-3</th>
                    <th className="px-2 py-1 text-right">Decel B2-3</th>
                    <th className="px-2 py-1 text-right" title="IMA high-intensity running distance (Catapult Free-Running bands 5-8)">IMA HIR (m)</th>
                    <th className="px-2 py-1 text-right" title="ACWR = acute:chronic workload ratio (Gabbett 2017)">ACWR</th>
                    <th className="px-2 py-1 text-left">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.perPlayer.map((pp) => (
                    <tr key={pp.player_id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-800">{pp.name}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.totalDistance)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.hsr)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.sprint)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.playerLoad)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.accel)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.decel)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(pp.ima)}</td>
                      <td className={`px-2 py-1 text-right tabular-nums ${pp.acwr != null && pp.acwr >= 1.3 ? "font-semibold text-red-600" : pp.acwr != null && pp.acwr < 0.8 ? "text-amber-600" : "text-slate-700"}`}>{pp.acwr != null ? pp.acwr.toFixed(2) : "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-left text-[11px] text-slate-500">{pp.flag === "reduce" ? `↓ ${pp.flagReason ?? "reduce"}` : pp.flag === "build" ? `↑ ${pp.flagReason ?? "room to build"}` : "—"}</td>
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
