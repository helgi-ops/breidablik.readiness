"use client";

/**
 * Periodization Hub (Team Planning) — a season macro → meso plan generated from the team's OWN data
 * (fixtures, load curve), plus per-player individualisation (Type 1–5 interval speeds from his MAS,
 * strength zone from his VBT) and an honest "data readiness" panel that names what's missing. The
 * micro (weekly) layer stays in Week Setup / the Training Programme — this hub links to it.
 * Rules recommend; the coach decides. Never overrides the readiness colour. EN default, IS toggle.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import PageCrossRef from "@/components/coach/PageCrossRef";
import { mdWeekTargets, buildMesoPlan, type MdDayTarget, type TeamAverages, type MesoPlan } from "@/lib/micropulse/periodization";
import { downloadPeriodizationBlockPdf } from "@/components/coach/PeriodizationBlockPdf";
import { downloadPeriodizationHubPdf } from "@/components/coach/PeriodizationHubPdf";

type Bi = { en: string; is: string };
type Phase = { key: string; label: Bi; start: string; end: string; weeks: number; matches: number; rationale: Bi };
type Block = { index: number; phase: Bi; goal: Bi; start: string; end: string; weeks: number; isDeload: boolean; volumeTargetPct: number | null; flag: Bi | null; tmr: number | null; loadTrend: "rising" | "steady" | "falling" | null; acwr: number | null; acwrNote: Bi };
type WeekLoad = { weekStart: string; load: number | null };
type Interval = { type: number; label: Bi; pctMas: number; kmh: number | null };
type Vbt = { exercise: string; latestLoadKg: number | null; latestMeanV: number | null; zone: Bi; note: Bi } | null;
type Gap = { key: string; severity: "missing" | "stale" | "ok"; message: Bi };
type StrengthDefault = { quality: Bi; pct1rm: Bi; velocity: Bi; intent: Bi; cite: string };
type Vald = { status: "green" | "yellow" | "red" | null; capPct: number | null; note: Bi };
type MatchUnitMetric = { typical: number | null; peak: number | null };
type MatchUnit = { nNearFull: number; nInWindow: number; fellBack: boolean; confidence: "high" | "medium" | "low"; windowNote: Bi; minutesTypical: number | null; load: MatchUnitMetric; hsr: MatchUnitMetric; sprint: MatchUnitMetric; distance: MatchUnitMetric; accel: MatchUnitMetric; decel: MatchUnitMetric };
type WeekTargetPlan = { phase: "preseason" | "inseason"; sessionCount: number; weeklyLoadTarget: number | null; perSessionLoad: number | null; matchMultiple: number | null; topUp: number | null; note: Bi; cite: string };
type Player = { playerId: string; name: string; position: string | null; masKmh: number | null; masSource: string | null; masAgeDays: number | null; intervals: Interval[]; vbt: Vbt; strengthFallback: StrengthDefault | null; vald: Vald; gaps: Gap[]; matchUnit: MatchUnit; weekTargets: { preseason: WeekTargetPlan; inseason: WeekTargetPlan; current: "preseason" | "inseason" } };
type TeamAvg = { sessions: number; players: number; distanceM: number | null; hsrM: number | null; sprintM: number | null; maxKmh: number | null; playerLoad: number | null; plPerMin: number | null; accel: number | null; decel: number | null; direction: { forward: number; backward: number; lateral: number } | null; matchSessions: number; matchDistanceM: number | null; matchHsrM: number | null; matchPlayerLoad: number | null; matchSprintM: number | null; matchAccel: number | null; matchDecel: number | null; accelHiEff: number | null; decelHiEff: number | null; strideHi: number | null; matchAccelHiEff: number | null; matchDecelHiEff: number | null; matchStrideHi: number | null; rhieBouts: number | null; runSymmetry: number | null; metabolicPower: number | null };
type AxisMetric = { metric: Bi; matchValue: string; trainingCeiling: string; band: string };
type Axis = { axis: "running" | "mechanical" | "internal"; label: Bi; matchNote: Bi; metrics: AxisMetric[]; flag: Bi | null };
type MatchAxes = { running: Axis; mechanical: Axis; internal: Axis; hsrDeficit: Bi | null; mechNeglect: Bi | null; capabilities: Bi[] };
type PositionBaseline = { key: number; label: Bi; avg: TeamAvg; axes: MatchAxes };
type Tier = { tier: "pro" | "core" | "rpe" | "none"; loadSource: "gps" | "srpe" | "none"; label: Bi; confidence: "high" | "medium" | "low"; unlock: Bi | null };
type WeekType = "normal" | "two_game" | "three_game";
type Plan = { seasonYear: number; teamName: string; phases: Phase[]; blocks: Block[]; loadCurve: WeekLoad[]; loadCurveByPos: Array<{ key: number; label: Bi; curve: WeekLoad[] }>; positionBaselines: PositionBaseline[]; teamBaseline: PositionBaseline; tier: Tier; mdShape: Record<string, number>; nextWeekType: WeekType; matchLoad: number | null; congested: Array<{ weekStart: string; matches: number }>; players: Player[]; fixtures: string[] };

const PHASE_BG: Record<string, string> = { preseason: "#7a5cc4", competitive: "#2740e6", offseason: "#94a3b8" };
const shortDate = (iso: string, is: boolean) => { try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };

function LoadCurve({ weeks, is }: { weeks: WeekLoad[]; is: boolean }) {
  const vals = weeks.map((w) => w.load ?? 0);
  if (vals.length < 2) return null;
  const max = Math.max(...vals) || 1;
  const W = 640, H = 90, padB = 4, slot = W / weeks.length, bw = Math.max(2, slot * 0.7);
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-slate-400">{is ? "Vikulegt álag liðsins (Player Load) — raunveruleg þróun" : "Weekly team load (Player Load) — the real trend"}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-24 w-full" preserveAspectRatio="none">
        {weeks.map((w, i) => { const h = ((w.load ?? 0) / max) * (H - padB); return <rect key={i} x={i * slot + (slot - bw) / 2} y={H - padB - h} width={bw} height={h} rx="1" fill="#2740e6" opacity="0.6"><title>{`${w.weekStart}: ${Math.round(w.load ?? 0)}`}</title></rect>; })}
      </svg>
      <div className="flex justify-between text-[9px] text-slate-400"><span>{shortDate(weeks[0].weekStart, is)}</span><span>{shortDate(weeks[weeks.length - 1].weekStart, is)}</span></div>
    </div>
  );
}

export default function PeriodizationHubPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [selId, setSelId] = React.useState("");
  const [preStart, setPreStart] = React.useState("");   // coach-set pre-season start (e.g. December)
  const [seasonEnd, setSeasonEnd] = React.useState("");  // coach-set season end (e.g. late October)
  const [saved, setSaved] = React.useState(false);
  const [friendly, setFriendly] = React.useState("");    // pre-season friendly date to add (MD anchor)
  const [mdPosKey, setMdPosKey] = React.useState<number | null>(null); // position for the MD-week template
  const [weekType, setWeekType] = React.useState<WeekType | null>(null); // MD-week congestion variant (null → use detected)
  // Meso plan-ahead editor state.
  const [blkStart, setBlkStart] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [blkWeeks, setBlkWeeks] = React.useState(4);
  const [blkSessions, setBlkSessions] = React.useState(5);
  const [blkBase, setBlkBase] = React.useState(100);
  const [blkStep, setBlkStep] = React.useState(5);
  const [blkPosKey, setBlkPosKey] = React.useState<number | null>(null);
  const [blkScope, setBlkScope] = React.useState<"team" | "player">("team");
  const [blkGoal, setBlkGoal] = React.useState<"accum" | "transmute" | "realize">("accum");
  const [loadCurveKey, setLoadCurveKey] = React.useState(-1); // -1 = Team (whole squad), else a position key
  const [tab, setTab] = React.useState<"season" | "demands" | "plan" | "players">("season");

  const authHeader = React.useCallback(async () => `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`, [supabase]);

  const load = React.useCallback(async (preS: string, endS: string) => {
    setLoading(true); setErr(null);
    try {
      const qs = new URLSearchParams();
      if (preS) qs.set("preStart", preS);
      if (endS) qs.set("seasonEnd", endS);
      const res = await fetch(`/api/coach/periodization?${qs}`, { headers: { Authorization: await authHeader() } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error ?? "Failed"); return; }
      setPlan(j.plan as Plan);
      setSelId((prev) => prev || ((j.plan as Plan).players?.[0]?.playerId ?? ""));
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [authHeader]);

  React.useEffect(() => { load("", ""); }, [load]);

  async function savePlan() {
    if (!plan) return;
    setSaved(false);
    const res = await fetch("/api/coach/periodization", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
      body: JSON.stringify({ seasonYear: plan.seasonYear, overrides: { preseasonStart: preStart || undefined, seasonEnd: seasonEnd || undefined },
        blocks: plan.blocks.map((b) => ({ block_index: b.index, phase: b.phase.en, goal: b.goal.en, start_date: b.start, end_date: b.end, is_deload: b.isDeload, targets: { acwr: b.acwr, volumeTargetPct: b.volumeTargetPct } })) }),
    });
    setSaved(res.ok);
  }

  async function addFriendly() {
    if (!friendly) return;
    const res = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ addFriendly: friendly }) });
    if (res.ok) { setFriendly(""); load(preStart, seasonEnd); } // re-anchor MD with the new friendly
  }

  const player = plan?.players.find((p) => p.playerId === selId) ?? null;
  const sevColor = (s: string) => (s === "missing" ? "bg-rose-100 text-rose-800" : s === "stale" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800");

  // Meso plan-ahead: generate a 4–6-week block from a position baseline + the match unit, client-side.
  const BLK_GOALS: Record<string, Bi> = {
    accum: { en: "Accumulation — work capacity + max-strength base", is: "Uppsöfnun — þol + hámarksstyrks grunnur" },
    transmute: { en: "Transmutation — strength–power + speed", is: "Umbreyting — styrkur–kraftur + hraði" },
    realize: { en: "Realization — freshness + peak power", is: "Framkvæmd — ferskleiki + hámarkskraftur" },
  };
  const blkPopulated = [...(plan ? [plan.teamBaseline] : []), ...(plan?.positionBaselines ?? [])].filter((b) => b && b.avg.sessions > 0);
  const blkPos = blkPopulated.find((b) => b.key === blkPosKey) ?? blkPopulated[0] ?? null;
  const blkMatchUnit = blkScope === "player" ? (player?.matchUnit.load.typical ?? plan?.matchLoad ?? null) : (plan?.matchLoad ?? null);
  const mesoPlan: MesoPlan | null = React.useMemo(() => {
    if (!plan || !blkPos || !blkStart) return null;
    return buildMesoPlan({ startDate: blkStart, numWeeks: blkWeeks, sessionsPerWeek: blkSessions, baseline: blkPos.avg as unknown as TeamAverages, mdShape: plan.mdShape, fixtures: plan.fixtures ?? [], matchUnitLoad: blkMatchUnit, baseOverloadPct: blkBase, stepPct: blkStep, goal: BLK_GOALS[blkGoal] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkPos, blkStart, blkWeeks, blkSessions, blkBase, blkStep, blkGoal, blkMatchUnit]);

  async function exportBlock() {
    if (!mesoPlan) return;
    const scope = blkScope === "player" && player ? { kind: "player" as const, name: player.name, position: player.position } : { kind: "team" as const, name: is ? "Liðið" : "Squad" };
    const mu = blkScope === "player" && player ? player.matchUnit : null;
    const matchUnitLabel = blkMatchUnit != null ? (mu ? `${blkMatchUnit} PL — ${is ? "miðgildi" : "median"} · ${mu.nNearFull} ${is ? "leikir ≥80 mín" : "matches ≥80 min"}` : `${blkMatchUnit} PL — ${is ? "liðs-leikmeðaltal" : "squad match average"}`) : null;
    await downloadPeriodizationBlockPdf({ teamName: plan?.teamName ?? "MicroPulse", scope, matchUnitLabel, plan: mesoPlan, generatedAt: new Date().toISOString() }, is ? "IS" : "EN");
  }

  // The whole hub → one PDF (all four tabs' data). This is the primary export at the top of the page.
  async function exportAll() {
    if (!plan) return;
    const baselines = [plan.teamBaseline, ...plan.positionBaselines].filter((b) => b && b.avg.sessions > 0).map((b) => ({ label: b.label, players: b.avg.players, distanceM: b.avg.distanceM, hsrM: b.avg.hsrM, maxKmh: b.avg.maxKmh, playerLoad: b.avg.playerLoad, accel: b.avg.accel, decel: b.avg.decel, isTeam: b.key === -1 }));
    const players = plan.players.map((p) => ({ name: p.name, position: p.position, masKmh: p.masKmh, matchUnitLoad: p.matchUnit.load.typical, matchUnitHsr: p.matchUnit.hsr.typical, nNearFull: p.matchUnit.nNearFull, valdCap: p.vald.capPct, gaps: p.gaps.filter((g) => g.severity !== "ok").length }));
    const blocks = plan.blocks.map((b) => ({ phase: b.phase, goal: b.goal, start: b.start, end: b.end, weeks: b.weeks, isDeload: b.isDeload, tmr: b.tmr, volumeTargetPct: b.volumeTargetPct, flag: b.flag }));
    await downloadPeriodizationHubPdf({
      teamName: plan.teamName, seasonYear: plan.seasonYear, generatedAt: new Date().toISOString(),
      tier: plan.tier ? { label: plan.tier.label, loadSource: plan.tier.loadSource, confidence: plan.tier.confidence } : null,
      phases: plan.phases.map((ph) => ({ label: ph.label, start: ph.start, end: ph.end, weeks: ph.weeks, matches: ph.matches, rationale: ph.rationale })),
      congested: plan.congested ?? [], baselines, teamAxes: plan.teamBaseline?.axes ?? null, blocks, mesoPlan, players,
    }, is ? "IS" : "EN");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{is ? "Tímabilsskipulag" : "Periodization Hub"}</h1>
        {plan && !loading && <button onClick={exportAll} className="ml-auto rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1e34c0]">{is ? "Sækja PDF (öll gögn)" : "Export PDF (all data)"}</button>}
      </div>
      <PagePurpose
        en="build a season plan — macro phases → meso blocks → the week — generated from this team's own fixtures, load and tests, not a generic template"
        is="byggðu tímabils-áætlun — makró fasar → mesó lotur → vikan — búin til úr eigin leikjum, álagi og prófum liðsins, ekki almennu sniðmáti"
      />
      <PageCrossRef
        en="This page: the season plan (macro → meso) from the team's data. The week itself (MD-minus/plus) lives in Week Setup; the per-player MD week in the Training Programme (Æfingavika)."
        is="Þessi síða: tímabils-áætlunin (makró → mesó) úr gögnum liðsins. Sjálf vikan (MD-mínus/plús) er í Week Setup; per-leikmanns MD-vikan í Æfingaviku."
      />

      {loading && <div className="mt-4 rounded-lg border bg-white p-6 text-center text-sm text-slate-500">{is ? "Set saman áætlun úr gögnum…" : "Assembling the plan from your data…"}</div>}
      {err && <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{err}</div>}

      {plan && !loading && (
        <div className="mt-4 space-y-4">
          {/* TIER — every club gets a plan; hardware only adds detail + confidence */}
          {plan.tier && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px]">
              <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{is ? "gagnastig" : "data tier"}</span>
              <span className="font-semibold text-slate-800">{is ? plan.tier.label.is : plan.tier.label.en}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">{is ? "álagsferill úr" : "load curve from"} {plan.tier.loadSource === "gps" ? (is ? "GPS ytra álagi" : "GPS external load") : plan.tier.loadSource === "srpe" ? "sRPE (RPE×mín)" : "—"}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{is ? "vissa" : "conf"}: {plan.tier.confidence}</span>
              {plan.tier.unlock && <span className="w-full text-[11px] text-slate-500">↑ {is ? plan.tier.unlock.is : plan.tier.unlock.en}</span>}
            </div>
          )}

          {/* TABS — macro → demands → the plan → players (one connected flow) */}
          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {([
              { key: "season", en: "Season", is: "Tímabil" },
              { key: "demands", en: "Squad demands", is: "Kröfur liðs" },
              { key: "plan", en: "The plan", is: "Áætlunin" },
              { key: "players", en: "Players", is: "Leikmenn" },
            ] as const).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px rounded-t-lg border-b-2 px-3 py-1.5 text-[12px] font-semibold ${tab === t.key ? "border-[#2740e6] text-[#2740e6]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{is ? t.is : t.en}</button>
            ))}
          </div>

          {/* SEASON tab */}
          {tab === "season" && (<div className="space-y-4">
          {/* MACRO */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{is ? "Makró — tímabils-kortið" : "Macro — the season map"} <span className="text-[11px] font-normal text-slate-400">{plan.seasonYear}</span></h2>
              {/* Coach sets the window — some start pre-season in December, season ends late October. */}
              <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span>{is ? "Undirb. frá" : "Pre-season from"}</span>
                <input type="date" value={preStart} onChange={(e) => setPreStart(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" />
                <span>{is ? "tímabil lýkur" : "season ends"}</span>
                <input type="date" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" />
                <button onClick={() => load(preStart, seasonEnd)} className="rounded-lg bg-[#2740e6] px-2 py-1 text-[11px] font-semibold text-white">{is ? "Uppfæra" : "Apply"}</button>
                <button onClick={savePlan} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{saved ? (is ? "✓ Vistað" : "✓ Saved") : (is ? "Vista" : "Save")}</button>
              </div>
            </div>
            {/* Pre-season friendlies anchor MD before the competitive season. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <span>{is ? "Bæta við æfingaleik (preseason → MD-akkeri)" : "Add a friendly (pre-season → MD anchor)"}</span>
              <input type="date" value={friendly} onChange={(e) => setFriendly(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" />
              <button onClick={addFriendly} disabled={!friendly} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-[#2740e6] hover:bg-slate-50 disabled:opacity-40">{is ? "+ Æfingaleikur" : "+ Friendly"}</button>
            </div>
            {plan.phases.length === 0 ? (
              <p className="mt-2 text-[12px] text-slate-500">{is ? "Engir leikir skráðir fyrir tímabilið." : "No fixtures on record for the season."}</p>
            ) : (
              <>
                <div className="mt-2 flex h-7 w-full overflow-hidden rounded-lg">
                  {plan.phases.map((ph) => <span key={ph.key} className="flex items-center justify-center text-[10px] font-semibold text-white" style={{ flexGrow: ph.weeks, background: PHASE_BG[ph.key] ?? "#64748b" }} title={`${ph.start} → ${ph.end}`}>{is ? ph.label.is : ph.label.en}</span>)}
                </div>
                <ul className="mt-2 space-y-1">
                  {plan.phases.map((ph) => <li key={ph.key} className="text-[12px] text-slate-600"><span className="font-medium text-slate-800">{is ? ph.label.is : ph.label.en}</span> ({shortDate(ph.start, is)}–{shortDate(ph.end, is)}) — {is ? ph.rationale.is : ph.rationale.en}</li>)}
                </ul>
                {(() => {
                  const curveOpts = [{ key: -1, label: { en: "Team (whole squad)", is: "Lið (allt liðið)" } as Bi, curve: plan.loadCurve }, ...(plan.loadCurveByPos ?? [])];
                  const sel = curveOpts.find((o) => o.key === loadCurveKey) ?? curveOpts[0];
                  return (
                    <div className="mt-3">
                      {curveOpts.length > 1 && (
                        <div className="flex justify-end">
                          <select value={sel.key} onChange={(e) => setLoadCurveKey(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px]" title={is ? "Álagsferill — lið eða staða" : "Load curve — team or position"}>
                            {curveOpts.map((o) => <option key={o.key} value={o.key}>{is ? o.label.is : o.label.en}</option>)}
                          </select>
                        </div>
                      )}
                      <LoadCurve weeks={sel.curve} is={is} />
                    </div>
                  );
                })()}
                {(plan.congested ?? []).length > 0 && (
                  <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{is ? `${plan.congested.length} þéttar vikur á tímabilinu (2+ leikir/viku) — mikró fellur saman þær vikur: ` : `${plan.congested.length} congested weeks this season (2+ matches/week) — the micro collapses those weeks: `}{plan.congested.map((c) => `${shortDate(c.weekStart, is)} (${c.matches})`).join(", ")}</p>
                )}
              </>
            )}
          </section>

          </div>)}

          {/* SQUAD DEMANDS tab */}
          {tab === "demands" && (<div className="space-y-4">
          {/* SQUAD BASELINE PER POSITION — GPS + IMA averages from the data that exists (the "squad default") */}
          {(plan.positionBaselines ?? []).some((b) => b.avg.sessions > 0) && (() => {
            const km = (m: number | null) => (m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
            const rows = plan.positionBaselines.filter((b) => b.avg.sessions > 0);
            return (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">{is ? "Grunnlína eftir stöðu (GPS + IMA)" : "Baseline by position (GPS + IMA)"}</h2>
                <p className="mt-1 text-[11px] text-slate-500">{is ? "Meðaltal per æfingu/leik yfir tímabilið úr raungögnum, eftir stöðu — peak-kröfur eru staða-sértækar (Ju). „Sjálfgefna gildið“ sem einstaklings-viðmið falla á er HANS staða, ekki allt liðið." : "Average per session over the season, from the real data, by position — peak demands are position-specific (Ju). The \"default\" a player falls back to is HIS position, not the whole team."}</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-left text-[9px] uppercase tracking-wide text-slate-400">
                      <th className="py-1 pr-2 font-medium">{is ? "Staða" : "Position"}</th>
                      <th className="py-1 pr-2 text-right font-medium">{is ? "Vegal." : "Dist"}</th>
                      <th className="py-1 pr-2 text-right font-medium">HSR</th>
                      <th className="py-1 pr-2 text-right font-medium">{is ? "Hám." : "Max"}</th>
                      <th className="py-1 pr-2 text-right font-medium">PL</th>
                      <th className="py-1 pr-2 text-right font-medium">Acc/Dec</th>
                      <th className="py-1 pl-2 font-medium">{is ? "IMA fram/hlið/aftur" : "IMA fwd/lat/back"}</th>
                    </tr></thead>
                    <tbody>
                      {[...(plan.teamBaseline && plan.teamBaseline.avg.sessions > 0 ? [plan.teamBaseline] : []), ...rows].map((b) => { const a = b.avg; const isTeam = b.key === -1; return (
                        <tr key={b.key} className={isTeam ? "border-t-2 border-slate-300 bg-slate-50/70" : "border-t border-slate-100"}>
                          <td className={`py-1 pr-2 ${isTeam ? "font-bold text-slate-900" : "font-medium text-slate-800"}`}>{is ? b.label.is : b.label.en} <span className="text-[9px] font-normal text-slate-400">({a.players})</span></td>
                          <td className={`py-1 pr-2 text-right tabular-nums ${isTeam ? "font-semibold" : ""}`}>{km(a.distanceM)}</td>
                          <td className={`py-1 pr-2 text-right tabular-nums ${isTeam ? "font-semibold" : ""}`}>{a.hsrM == null ? "–" : `${Math.round(a.hsrM)}m`}</td>
                          <td className={`py-1 pr-2 text-right tabular-nums ${isTeam ? "font-semibold" : ""}`}>{a.maxKmh == null ? "–" : a.maxKmh}</td>
                          <td className={`py-1 pr-2 text-right tabular-nums ${isTeam ? "font-semibold" : ""}`}>{a.playerLoad == null ? "–" : Math.round(a.playerLoad)}</td>
                          <td className={`py-1 pr-2 text-right tabular-nums ${isTeam ? "font-semibold" : ""}`}>{a.accel ?? "–"}/{a.decel ?? "–"}</td>
                          <td className="py-1 pl-2">
                            {a.direction ? (
                              <span className="inline-flex h-2 w-24 overflow-hidden rounded-full align-middle" title={`${Math.round(a.direction.forward * 100)}/${Math.round(a.direction.lateral * 100)}/${Math.round(a.direction.backward * 100)}`}>
                                <span className="bg-[#2740e6]" style={{ width: `${a.direction.forward * 100}%` }} /><span className="bg-slate-400" style={{ width: `${a.direction.lateral * 100}%` }} /><span className="bg-amber-500" style={{ width: `${a.direction.backward * 100}%` }} />
                              </span>
                            ) : <span className="text-slate-300">–</span>}
                          </td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[9px] text-slate-400">{is ? "Vegalengd/HSR/PL = meðaltal per session · Hám. = km/klst · IMA-slá: 🔵 fram / ⚪ hlið / 🟡 aftur. Lýsandi — aldrei readiness-liturinn." : "Distance/HSR/PL = mean per session · Max = km/h · IMA bar: 🔵 fwd / ⚪ lat / 🟡 back. Descriptive — never the readiness colour."}</p>
              </section>
            );
          })()}

          {/* THREE AXES vs THE MATCH — running / mechanical / internal (Figueiredo: no single "% of match") */}
          {(plan.positionBaselines ?? []).some((b) => b.avg.sessions > 0) && (() => {
            const rows = [plan.teamBaseline, ...plan.positionBaselines].filter((b) => b && b.avg.sessions > 0);
            const pos = rows.find((b) => b.key === mdPosKey) ?? rows[0];
            const ax = pos.axes;
            const AXIS_COLOR: Record<string, string> = { running: "#2740e6", mechanical: "#a83e28", internal: "#1c7a4a" };
            const axisList = [ax.running, ax.mechanical, ax.internal].filter((a) => a.axis !== "internal" || a.metrics.length > 0);
            return (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">{is ? "Þrír ásar gagnvart leiknum" : "Three axes vs the match"}</h2>
                  <select value={pos.key} onChange={(e) => setMdPosKey(Number(e.target.value))} className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px]">
                    {rows.map((b) => <option key={b.key} value={b.key}>{is ? b.label.is : b.label.en}</option>)}
                  </select>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{is ? "Það er ekkert eitt „%-af-leik“: æfingar fara YFIR leikinn á vélræna ásnum (accel/decel) en NÁ EKKI leiknum á hlaupa-ásnum (háhraði/sprettur). Hlaupa-plan eitt og sér er ófullnægjandi — sýndu alla þrjá ásana (Figueiredo o.fl.)." : "There is no single \"% of match\": training OVER-shoots the match on the mechanical axis (accel/decel) but UNDER-reaches it on the running axis (HSR/sprint). A running-only plan is incomplete — show all three axes (Figueiredo et al.)."}</p>
                {ax.hsrDeficit && <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">⚠ {is ? ax.hsrDeficit.is : ax.hsrDeficit.en}</p>}
                {ax.mechNeglect && <p className="mt-1.5 rounded-lg bg-[#a83e28]/10 px-2 py-1.5 text-[11px] font-medium text-[#a83e28]">⚠ {is ? ax.mechNeglect.is : ax.mechNeglect.en}</p>}
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {axisList.map((a) => (
                    <div key={a.axis} className="rounded-lg border border-slate-200 p-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: AXIS_COLOR[a.axis] }} />
                        <span className="text-[12px] font-semibold text-slate-900">{is ? a.label.is : a.label.en}</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500">{is ? a.matchNote.is : a.matchNote.en}</p>
                      {a.metrics.length > 0 && (
                        <table className="mt-1.5 w-full text-[11px]">
                          <thead><tr className="text-left text-[9px] uppercase tracking-wide text-slate-400"><th className="font-medium">{is ? "Mæling" : "Metric"}</th><th className="text-right font-medium">{is ? "Leikur" : "Match"}</th><th className="text-right font-medium">{is ? "Æf.þak" : "Tr. ceil"}</th><th className="text-right font-medium">%</th></tr></thead>
                          <tbody>
                            {a.metrics.map((m, i) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="py-0.5 text-slate-700">{is ? m.metric.is : m.metric.en}</td>
                                <td className="py-0.5 text-right tabular-nums text-slate-500">{m.matchValue}</td>
                                <td className="py-0.5 text-right font-semibold tabular-nums text-slate-900">{m.trainingCeiling}</td>
                                <td className="py-0.5 text-right tabular-nums text-slate-400">{m.band}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {a.flag && <p className="mt-1 text-[10px] font-medium text-[#a83e28]">{is ? a.flag.is : a.flag.en}</p>}
                    </div>
                  ))}
                </div>
                {ax.capabilities.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {ax.capabilities.map((c, i) => <li key={i} className="text-[10px] text-slate-500">✓ {is ? c.is : c.en}</li>)}
                  </ul>
                )}
                <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500">{is ? "Þessar tölur eru upphafspunktur, aldrei viðmið til að hlýða í blindni. Þær lýsa því sem leikurinn krefst og hvað æfing nær venjulega — leikmaðurinn, samhengið og viðbragðið stýra deginum (Little & Buchheit — „ekki þrælar GPS-viðmiða“)." : "These numbers are a starting point, never a norm to obey. They describe what the match demands and what a session usually reaches — the player, the context and readiness govern the day (Little & Buchheit — don't be \"slaves to GPS norms\")."}</p>
                <p className="mt-1 text-[9px] text-slate-400">Figueiredo et al. (dimension-specific training:match ratios) · Buchheit &amp; Simpson (mechanical vs locomotor). {is ? "Lýsandi — aldrei readiness-liturinn." : "Descriptive — never the readiness colour."}</p>
              </section>
            );
          })()}

          </div>)}

          {/* THE PLAN tab — micro (MD week) → meso blocks → plan-ahead + PDF */}
          {tab === "plan" && (<div className="space-y-4">
          {/* MD-ANCHORED WEEK — the numbers tied to matchday, per position (or the whole team) */}
          {(plan.positionBaselines ?? []).some((b) => b.avg.sessions > 0) && (() => {
            const rows = [plan.teamBaseline, ...plan.positionBaselines].filter((b) => b && b.avg.sessions > 0);
            const pos = rows.find((b) => b.key === mdPosKey) ?? rows[0];
            const wt: WeekType = weekType ?? plan.nextWeekType ?? "normal";
            const wtLabel: Record<WeekType, string> = { normal: is ? "Venjuleg (1 leikur)" : "Normal (1 game)", two_game: is ? "2-leikja (þétt)" : "2-game (congested)", three_game: is ? "3-leikja (mjög þétt)" : "3-game (very congested)" };
            const mdDays: MdDayTarget[] = mdWeekTargets(pos.avg as unknown as TeamAverages, { mdShape: plan.mdShape, weekType: wt });
            const typeColor: Record<string, string> = { mechanical: "#a83e28", locomotive: "#2740e6", mixed: "#7a5cc4", technical: "#64748b", restart: "#de9328", topup: "#de9328", match: "#1c7a4a" };
            const shapeFromData = plan.mdShape && Object.keys(plan.mdShape).length > 0;
            return (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">{is ? "MD-vika — álagsmörk bundin við leikdag" : "MD week — targets anchored to matchday"}</h2>
                  <select value={wt} onChange={(e) => setWeekType(e.target.value as WeekType)} className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px]" title={is ? "Vikugerð (þéttleiki leikja)" : "Week type (fixture congestion)"}>
                    {(["normal", "two_game", "three_game"] as WeekType[]).map((w) => <option key={w} value={w}>{wtLabel[w]}</option>)}
                  </select>
                  <select value={pos.key} onChange={(e) => setMdPosKey(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px]">
                    {rows.map((b) => <option key={b.key} value={b.key}>{is ? b.label.is : b.label.en}</option>)}
                  </select>
                </div>
                {wt !== "normal" && <p className="mt-1 text-[11px] font-medium text-amber-800">{is ? "⚠ Þétt vika — bygging felld niður (ekki MD-5/-4/-3); dagar milli leikja = endurheimt + stutt leik-undirbúningur (Oliveira 2019)." : "⚠ Congested week — the build is collapsed (no MD-5/-4/-3); the days between matches are recovery + short match-prep (Oliveira 2019)."}</p>}
                {plan.nextWeekType !== "normal" && weekType == null && <p className="mt-0.5 text-[10px] text-slate-400">{is ? "Sjálfkrafa greint: næsta vika er þétt." : "Auto-detected: the next microcycle is congested."}</p>}
                <p className="mt-1 text-[11px] text-slate-500">{is ? "Hver dagur vísar til leikdags (MD). Tölurnar koma úr stöðu-grunnlínunni × %-af-leikkröfu dagsins. Restart/Mechanical/Locomotive/Top-up. Þarf æfingaleik í preseason til að MD-N sé til." : "Each day is relative to matchday (MD). Numbers come from the position baseline × the day's %-of-match-demand. Restart/Mechanical/Locomotive/Top-up. Needs a pre-season friendly for MD-N to exist there."}</p>
                <div className="mt-2 space-y-1.5">
                  {mdDays.map((d) => (
                    <div key={d.mdTag} className="rounded-lg border border-slate-200 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: typeColor[d.type] }}>{d.mdTag}</span>
                        <span className="text-[12px] font-semibold text-slate-900">{is ? d.label.is : d.label.en}</span>
                        <span className="text-[11px] text-slate-500">— {is ? d.quality.is : d.quality.en}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-700">
                        {d.targets.map((t, i) => <span key={i}><span className="text-slate-400">{is ? t.metric.is : t.metric.en}:</span> <b className="tabular-nums">{t.value}</b></span>)}
                      </div>
                      {d.note && <p className="mt-0.5 text-[10px] text-slate-400">{is ? d.note.is : d.note.en}</p>}
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">{shapeFromData ? (is ? "✓ Niðurtröppunar-lögunin er úr EIGIN MD-meðaltölum liðsins (ekki kennslubók)." : "✓ The taper shape is from the team's OWN per-MD-day averages (not a textbook curve).") : (is ? "Sjálfgefin %-af-leikkröfu lögun (ekki næg eigin MD-gögn enn)." : "Default %-of-match-demand shape (not enough own per-MD data yet).")}</p>
                <p className="mt-1 text-[9px] text-slate-400">Owen 2017 (positional mesocycle, MD taper) · Oliveira 2019 (congested-week variants) · Oliveira 2021 (ACWR/monotony on sRPE+HSR, positional) · Teixeira 2021 (monitoring) · Martín-García 2018 (%-of-match-demand). {is ? "Lýsandi — aldrei readiness-liturinn." : "Descriptive — never the readiness colour."}</p>
              </section>
            );
          })()}

          {/* MESO — led by TMr (the match as the unit), ACWR demoted to a contested view */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{is ? "Mesó — 4-vikna lotur" : "Meso — 4-week blocks"}</h2>
            <p className="mt-1 text-[11px] text-slate-500">{is ? "Leikurinn er einingin: TMr = vikuálag ÷ eitt leikálag. Við röppum TMr skynsamlega og lesum bráðaálags-þróun + viðbragð — ekki ACWR-band." : "The match is the unit: TMr = weekly load ÷ one match's load. We ramp TMr sensibly and read the acute-load trend + readiness — not an ACWR band."}
              {plan.matchLoad != null && <span className="text-slate-400"> {is ? "Eitt leikálag" : "One match"} ≈ {plan.matchLoad} {plan.tier.loadSource === "srpe" ? "AU" : "PL"}.</span>}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {plan.blocks.map((b) => {
                const trendGlyph = b.loadTrend === "rising" ? "↗" : b.loadTrend === "falling" ? "↘" : b.loadTrend === "steady" ? "→" : "";
                const trendWord = b.loadTrend === "rising" ? (is ? "hækkandi" : "rising") : b.loadTrend === "falling" ? (is ? "lækkandi" : "falling") : b.loadTrend === "steady" ? (is ? "stöðugt" : "steady") : "";
                return (
                <div key={b.index} className={`rounded-lg border p-2.5 ${b.isDeload ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-slate-900">{is ? b.phase.is : b.phase.en}</span>
                    <span className="text-[10px] text-slate-400">{shortDate(b.start, is)}–{shortDate(b.end, is)} · {b.weeks}{is ? " vk" : "w"}</span>
                    {b.tmr != null && <span className="ml-auto rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#2740e6]" title={is ? "Vikuálag sem margfeldi af einu leikálagi (TMr)" : "Weekly load as a multiple of one match (TMr)"}>TMr {b.tmr}×</span>}
                  </div>
                  <p className="mt-1 text-[12px] text-slate-700">{is ? b.goal.is : b.goal.en}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                    {b.volumeTargetPct != null && <span className="text-slate-500">{is ? "Magn-mark" : "Volume target"}: <b>{b.volumeTargetPct}%</b></span>}
                    {b.loadTrend && <span className="text-slate-500">{is ? "Bráðaálag" : "Acute load"}: <b>{trendGlyph} {trendWord}</b></span>}
                    {b.flag && <span className={`rounded px-1.5 py-0.5 font-semibold ${b.isDeload ? "bg-amber-200 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{is ? b.flag.is : b.flag.en}</span>}
                  </div>
                  {b.acwr != null && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[9px] text-slate-400 hover:text-slate-600">{is ? `ACWR ${b.acwr} — umdeilt viðmið` : `ACWR ${b.acwr} — contested view`}</summary>
                      <p className="mt-0.5 text-[9px] text-slate-400">{is ? b.acwrNote.is : b.acwrNote.en}</p>
                    </details>
                  )}
                </div>
              ); })}
            </div>
          </section>

          {/* MESO PLAN-AHEAD EDITOR + PDF BLOCK */}
          {blkPopulated.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">{is ? "Skipuleggja mesó-lotu (4–6 vikur) + PDF" : "Plan a mesocycle (4–6 weeks) + PDF"}</h2>
                <button onClick={exportBlock} disabled={!mesoPlan} className="ml-auto rounded-lg border border-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-40" title={is ? "Bara þessa lotu (heildar-PDF er efst á síðunni)" : "Just this block (the full-data PDF is at the top of the page)"}>{is ? "Sækja þessa lotu (PDF)" : "Export this block (PDF)"}</button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{is ? "Settu upp lotu fram í tímann — vikufjölda, æfingar/viku, markmið og stígandi álag (niðurtröppun 4. hverja viku). Hver vika fyllist með MD-dögum og tölum sem skala frá leikviðmiðinu." : "Schedule a block ahead — weeks, sessions/week, goal and a progressive-overload ramp (deload every 4th week). Each week fills with MD-days and numbers scaled from the match unit."}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-[11px] text-slate-500">{is ? "Upphaf" : "Start"}<input type="date" value={blkStart} onChange={(e) => setBlkStart(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Vikur" : "Weeks"}<input type="number" min={1} max={8} value={blkWeeks} onChange={(e) => setBlkWeeks(Number(e.target.value))} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Æfingar/viku" : "Sessions/wk"}<input type="number" min={1} max={10} value={blkSessions} onChange={(e) => setBlkSessions(Number(e.target.value))} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Markmið" : "Goal"}<select value={blkGoal} onChange={(e) => setBlkGoal(e.target.value as typeof blkGoal)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]"><option value="accum">{is ? "Uppsöfnun" : "Accumulation"}</option><option value="transmute">{is ? "Umbreyting" : "Transmutation"}</option><option value="realize">{is ? "Framkvæmd" : "Realization"}</option></select></label>
                <label className="text-[11px] text-slate-500">{is ? "Grunn-álag %" : "Base overload %"}<input type="number" min={80} max={130} value={blkBase} onChange={(e) => setBlkBase(Number(e.target.value))} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Stig/viku %" : "Step/wk %"}<input type="number" min={0} max={15} value={blkStep} onChange={(e) => setBlkStep(Number(e.target.value))} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Staða (grunnlína)" : "Position (baseline)"}<select value={blkPos?.key ?? 0} onChange={(e) => setBlkPosKey(Number(e.target.value))} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]">{blkPopulated.map((b) => <option key={b.key} value={b.key}>{is ? b.label.is : b.label.en}</option>)}</select></label>
                <label className="text-[11px] text-slate-500">{is ? "Umfang" : "Scope"}<select value={blkScope} onChange={(e) => setBlkScope(e.target.value as typeof blkScope)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]"><option value="team">{is ? "Lið" : "Team"}</option><option value="player">{is ? `Leikmaður: ${player?.name ?? ""}` : `Player: ${player?.name ?? ""}`}</option></select></label>
              </div>
              {blkScope === "player" && <p className="mt-1 text-[10px] text-slate-400">{is ? `Leikviðmið úr leikmanni völdum í „Leikmenn“-flipanum${player ? ` (${player.name})` : ""}. Skiptu um leikmann þar.` : `Match unit from the player selected in the "Players" tab${player ? ` (${player.name})` : ""}. Change the player there.`}</p>}
              {mesoPlan && (() => {
                const typeColor: Record<string, string> = { mechanical: "#a83e28", locomotive: "#2740e6", mixed: "#7a5cc4", technical: "#64748b", restart: "#de9328", topup: "#de9328", match: "#1c7a4a" };
                return (
                  <div className="mt-3 space-y-2">
                    {mesoPlan.weeks.map((w) => (
                      <div key={w.index} className={`rounded-lg border p-2.5 ${w.isDeload ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-semibold text-slate-900">{is ? "Vika" : "Week"} {w.index + 1} · {shortDate(w.weekStart, is)}</span>
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: w.isDeload ? "#de9328" : "#2740e6" }}>{w.isDeload ? (is ? "Niðurtröppun" : "Deload") : `${w.overloadPct}% ${is ? "álag" : "overload"}`}</span>
                          {w.weeklyLoadTarget != null && <span className="text-[10px] text-slate-500">{is ? "vikumark" : "weekly"} ≈ {w.weeklyLoadTarget} PL {w.tmr != null && `(${w.tmr}×)`}</span>}
                          {w.matchesInWeek >= 2 && <span className="rounded bg-[#a83e28]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#a83e28]">{w.matchesInWeek} {is ? "leikir · þétt" : "matches · congested"}</span>}
                        </div>
                        <div className="mt-1.5 space-y-1">
                          {w.sessions.map((d, i) => (
                            <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                              <span className="w-11 shrink-0 rounded px-1 py-0.5 text-center text-[9px] font-bold text-white" style={{ background: typeColor[d.type] }}>{d.mdTag}</span>
                              <span className="w-24 shrink-0 font-semibold text-slate-800">{is ? d.label.is : d.label.en}</span>
                              <span className="text-slate-600">{d.targets.map((x) => `${is ? x.metric.is : x.metric.en}: ${x.value}`).join(" · ")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="text-[9px] text-slate-400">{is ? "Lýsandi — skalar frá leikviðmiðinu; upphafspunktur, ekki viðmið til að hlýða. Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021." : "Descriptive — scales from the match unit; a starting point, not a norm to obey. Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021."}</p>
                  </div>
                );
              })()}
            </section>
          )}

          {/* MICRO — link out */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{is ? "Mikró — vikan" : "Micro — the week"}</h2>
            <p className="mt-1 text-[12px] text-slate-600">{is ? "Vikan sjálf (MD-mínus/plús, dag fyrir dag) er byggð annars staðar — þessi hub setur lotu-markið, vikan útfærir það." : "The week itself (MD-minus/plus, day by day) is built elsewhere — this hub sets the block target, the week executes it."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href="/coach/week-setup" className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-slate-50">{is ? "Vikuuppsetning →" : "Week Setup →"}</a>
              <a href="/coach/training-programme" className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-slate-50">{is ? "Æfingavika (per leikmann) →" : "Training Programme (per player) →"}</a>
            </div>
          </section>

          </div>)}

          {/* PLAYERS tab — individualisation + match unit + VALD + data readiness */}
          {tab === "players" && (<div className="space-y-4">
          {/* INDIVIDUALISATION + DATA READINESS */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{is ? "Einstaklingsmiðun" : "Individualisation"}</h2>
              <select value={selId} onChange={(e) => setSelId(e.target.value)} className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-[13px]">
                {plan.players.map((p) => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
              </select>
            </div>

            {player && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {/* Endurance intervals from his MAS */}
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Þolþjálfun — interval-hraði (Type 1–5)" : "Endurance — interval speeds (Type 1–5)"}</div>
                  {player.masKmh != null ? (
                    <>
                      <p className="mt-1 text-[12px] text-slate-600">{is ? "MAS" : "MAS"}: <b>{player.masKmh} km/klst</b> <span className="text-slate-400">· {player.masSource}{player.masAgeDays != null ? ` · ${player.masAgeDays}d` : ""}</span></p>
                      <table className="mt-1 w-full text-[12px] text-slate-700">
                        <tbody>{player.intervals.map((z) => <tr key={z.type}><td className="py-0.5 pr-2 text-slate-500">T{z.type} · {is ? z.label.is : z.label.en}</td><td className="py-0.5 text-right font-semibold tabular-nums">{z.kmh} km/klst</td><td className="py-0.5 pl-2 text-right text-[10px] text-slate-400">{z.pctMas}% MAS</td></tr>)}</tbody>
                      </table>
                    </>
                  ) : <p className="mt-1 text-[12px] text-slate-400">{is ? "Ekkert þolpróf — sjá gögn-tilbúnaðar spjaldið." : "No endurance test — see the data-readiness panel."}</p>}
                </div>
                {/* Strength from his VBT */}
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Styrktarþjálfun — VBT" : "Strength — VBT"}</div>
                  {player.vbt ? (
                    <>
                      <p className="mt-1 text-[12px] text-slate-700">{player.vbt.exercise} · <b>{player.vbt.latestLoadKg ?? "–"} kg</b> @ {player.vbt.latestMeanV?.toFixed(2)} m/s → <span className="font-semibold">{is ? player.vbt.zone.is : player.vbt.zone.en}</span></p>
                      <p className="mt-1 text-[11px] text-slate-500">{is ? player.vbt.note.is : player.vbt.note.en}</p>
                    </>
                  ) : player.strengthFallback ? (
                    <>
                      <p className="mt-1 text-[12px] text-slate-700"><span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700">{is ? "rannsóknar-viðmið (enginn VBT)" : "research default (no VBT)"}</span> {is ? player.strengthFallback.quality.is : player.strengthFallback.quality.en}</p>
                      <p className="mt-1 text-[12px] text-slate-700"><b>{is ? player.strengthFallback.pct1rm.is : player.strengthFallback.pct1rm.en}</b> · {is ? player.strengthFallback.velocity.is : player.strengthFallback.velocity.en} · {is ? player.strengthFallback.intent.is : player.strengthFallback.intent.en}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{player.strengthFallback.cite}</p>
                    </>
                  ) : <p className="mt-1 text-[12px] text-slate-400">{is ? "Enginn VBT prófíll." : "No VBT profile."}</p>}
                </div>
              </div>
            )}

            {/* THE MATCH UNIT — his own near-full match (typical + peak) → the weekly target it implies */}
            {player && (() => {
              const mu = player.matchUnit;
              const wt = player.weekTargets[player.weekTargets.current];
              const conf = mu.confidence === "high" ? { c: "bg-emerald-100 text-emerald-700", t: is ? "há vissa" : "high confidence" } : mu.confidence === "medium" ? { c: "bg-amber-100 text-amber-700", t: is ? "miðlungs vissa" : "medium confidence" } : { c: "bg-rose-100 text-rose-700", t: is ? "lítil vissa" : "low confidence" };
              const cell = (m: MatchUnitMetric, unit: string) => m.typical == null ? "–" : `${m.typical}${unit}${m.peak != null && m.peak !== m.typical ? ` · ↑${m.peak}${unit}` : ""}`;
              return (
                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Leikviðmið hans (leikurinn = einingin)" : "His match unit (the match = the unit)"}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${conf.c}`}>{conf.t}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">{is ? mu.windowNote.is : mu.windowNote.en} {mu.minutesTypical != null && (is ? `Dæmigerðar ${mu.minutesTypical} mín.` : `Typical ${mu.minutesTypical} min.`)} {is ? "Dæmigert = miðgildi; ↑ = topp-leikur (p90)." : "Typical = median; ↑ = peak match (p90)."}</p>
                  {mu.load.typical != null ? (
                    <div className="mt-1.5 overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead><tr className="text-left text-[9px] uppercase tracking-wide text-slate-400"><th className="py-0.5 pr-2 font-medium">{is ? "Ás" : "Axis"}</th><th className="py-0.5 pr-2 text-right font-medium">PL</th><th className="py-0.5 pr-2 text-right font-medium">HSR</th><th className="py-0.5 pr-2 text-right font-medium">{is ? "Sprettur" : "Sprint"}</th><th className="py-0.5 pr-2 text-right font-medium">Acc</th><th className="py-0.5 text-right font-medium">Dec</th></tr></thead>
                        <tbody><tr className="border-t border-slate-100">
                          <td className="py-0.5 pr-2 text-slate-600">{is ? "Dæmigerður leikur" : "Typical match"}</td>
                          <td className="py-0.5 pr-2 text-right tabular-nums">{cell(mu.load, "")}</td>
                          <td className="py-0.5 pr-2 text-right tabular-nums">{cell(mu.hsr, "m")}</td>
                          <td className="py-0.5 pr-2 text-right tabular-nums">{cell(mu.sprint, "m")}</td>
                          <td className="py-0.5 pr-2 text-right tabular-nums">{cell(mu.accel, "")}</td>
                          <td className="py-0.5 text-right tabular-nums">{cell(mu.decel, "")}</td>
                        </tr></tbody>
                      </table>
                    </div>
                  ) : <p className="mt-1 text-[11px] text-slate-400">{is ? "Enginn næstum-heill leikur enn — vikumarkið fellur á stöðu-grunnlínu." : "No near-full match yet — the weekly target falls back to the position baseline."}</p>}
                  {/* The weekly target the unit implies — pre-season supra-match vs in-season match+headroom */}
                  <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: wt.phase === "preseason" ? "#7a5cc4" : "#2740e6" }}>{wt.phase === "preseason" ? (is ? "Undirbúningur" : "Pre-season") : (is ? "Keppni" : "In-season")}</span>
                      {wt.weeklyLoadTarget != null && <span className="text-[12px] font-semibold text-slate-900">{is ? "Vikumark" : "Weekly target"} ≈ {wt.weeklyLoadTarget} PL {wt.matchMultiple != null && <span className="font-normal text-slate-500">({wt.matchMultiple}× {is ? "leik" : "match"})</span>}</span>}
                      {wt.perSessionLoad != null && <span className="text-[11px] text-slate-500">≈ {wt.perSessionLoad}/{is ? "æfingu" : "session"} × {wt.sessionCount}</span>}
                      {wt.topUp != null && wt.topUp > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{is ? "Áfylling" : "Top-up"} +{wt.topUp}</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">{is ? wt.note.is : wt.note.en}</p>
                    <p className="mt-1 text-[9px] text-slate-400">{wt.cite}</p>
                  </div>
                </div>
              );
            })()}

            {/* VALD readiness to LOAD — volume cap (not the daily readiness colour) */}
            {player && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${player.vald.status === "green" ? "bg-emerald-500" : player.vald.status === "yellow" ? "bg-amber-500" : player.vald.status === "red" ? "bg-rose-500" : "bg-slate-300"}`} />
                <span className="text-[12px] text-slate-700"><span className="font-semibold">{is ? "VALD — geta til að taka álag" : "VALD — readiness to load"}{player.vald.capPct != null ? ` · ${is ? "magn-þak" : "cap"} ${player.vald.capPct}%` : ""}</span> — {is ? player.vald.note.is : player.vald.note.en}</span>
              </div>
            )}

            {/* Data readiness — name the gap */}
            {player && (
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Gögn tilbúin? — hvað vantar" : "Data readiness — what's missing"}</div>
                {player.gaps.length === 0 ? <p className="mt-1 text-[12px] text-emerald-700">{is ? "Öll gögn til staðar." : "All data present."}</p> : (
                  <ul className="mt-1 space-y-1">
                    {player.gaps.map((g) => <li key={g.key} className="flex items-start gap-2 text-[12px] text-slate-700"><span className={`mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${sevColor(g.severity)}`}>{g.severity}</span><span>{is ? g.message.is : g.message.en}</span></li>)}
                  </ul>
                )}
              </div>
            )}
          </section>
          </div>)}

          <p className="text-[10px] text-slate-400">{is ? "Reglur mæla með — þjálfari ákveður og hnekkir. Tímabilsskipulag setur áætlunina; readiness stýrir deginum. Það breytir aldrei readiness-litnum. Martin-García 2018 (taper) · Buchheit & Laursen 2013 (interval) · Mann/Weakley (VBT-svæði)." : "Rules recommend — the coach decides and overrides. Periodization sets the plan; readiness modulates the day. It never changes the readiness colour. Martin-García 2018 (taper) · Buchheit & Laursen 2013 (intervals) · Mann/Weakley (VBT zones)."}</p>
        </div>
      )}
    </div>
  );
}
