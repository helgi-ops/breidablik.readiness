"use client";

/**
 * Periodization Hub (Team Planning) — the whole periodisation spine in one place, generated from the
 * team's OWN data: Macro cycle (the season — phases + fixtures + block map) → Meso cycle (the 4–6 week
 * block — the calendar planner + PDF) → Micro cycle (the week — the existing Week Setup, mounted in-place).
 * Plus Demands (position baselines + the match unit) and Players (individualisation + data-readiness).
 * Rules recommend; the coach decides. Never overrides the readiness colour. EN default, IS toggle.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import WeekSetupPage from "@/app/coach/week-setup/page";
import PageCrossRef from "@/components/coach/PageCrossRef";
import { buildMesoPlan, buildCalendarBlock, recommendBlockGoal, BLOCK_GOAL_LABEL, type TeamAverages, type MesoPlan, type BlockGoalKey } from "@/lib/micropulse/periodization";
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
const isoAdd = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (iso: string) => { const dt = new Date(`${iso}T00:00:00Z`); const dow = (dt.getUTCDay() + 6) % 7; return new Date(dt.getTime() - dow * 86_400_000).toISOString().slice(0, 10); };
type DayState = "match" | "session" | "off";

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
  const [mdPosKey, setMdPosKey] = React.useState<number | null>(null); // position selector for the three-axes card
  // Meso plan-ahead editor state.
  const [blkStart, setBlkStart] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [blkWeeks, setBlkWeeks] = React.useState(4);
  const blkSessions = 5; // hub-PDF summary block default (the on-page block uses the calendar grid)
  const [blkBase, setBlkBase] = React.useState(100);
  const [blkStep, setBlkStep] = React.useState(5);
  const blkPosKey: number | null = null; // position baseline for the hub-PDF summary block (Team = first)
  const [blkScope, setBlkScope] = React.useState<"team" | "player">("team");
  const [blkGoal, setBlkGoal] = React.useState<"accum" | "transmute" | "realize">("accum");
  const [loadCurveKey, setLoadCurveKey] = React.useState(-1); // -1 = Team (whole squad), else a position key
  const [tab, setTab] = React.useState<"season" | "plan" | "micro" | "demands" | "players">("season");
  const [blkSkeleton, setBlkSkeleton] = React.useState<Record<string, DayState>>({}); // coach's 6-week day grid

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

  // The scope's match unit (absolute) — a player's own near-full match, else the squad's match average.
  const isPlayerScope = blkScope === "player" && !!player;
  const blkUnit = React.useMemo(() => {
    const mu = isPlayerScope ? player!.matchUnit : null;
    const ta = plan?.teamBaseline?.avg;
    return isPlayerScope && mu
      ? { dist: mu.distance.typical, hsr: mu.hsr.typical, load: mu.load.typical, accdec: ((mu.accel.typical ?? 0) + (mu.decel.typical ?? 0)) || null }
      : { dist: ta?.matchDistanceM ?? null, hsr: ta?.matchHsrM ?? null, load: ta?.matchPlayerLoad ?? null, accdec: ((ta?.matchAccel ?? 0) + (ta?.matchDecel ?? 0)) || null };
  }, [isPlayerScope, player, plan]);
  const blkPhaseLabel = plan?.phases.find((ph) => ph.start <= blkStart && blkStart < ph.end)?.label ?? { en: "Season block", is: "Tímabils-lota" };

  // Seed the 6-week skeleton from the auto layout + real fixtures (Week Setup / match_schedule) whenever
  // the block window or scope changes; the coach then edits day states and the engine recomputes.
  React.useEffect(() => {
    if (!plan) return;
    const start = mondayOf(blkStart);
    const auto = buildCalendarBlock({ unit: blkUnit, startDate: blkStart, numWeeks: blkWeeks, scopeName: isPlayerScope ? player!.name : "__team__", baseOverloadPct: blkBase, stepPct: blkStep });
    const sk: Record<string, DayState> = {};
    auto.weeks.flatMap((w) => w.days).forEach((d, i) => { sk[isoAdd(start, i)] = d.type === "match" ? "match" : d.type === "rest" ? "off" : "session"; });
    const startMs = Date.parse(start), endMs = startMs + blkWeeks * 7 * 86_400_000;
    for (const f of plan.fixtures ?? []) { const ms = Date.parse(f); if (ms >= startMs && ms < endMs) sk[isoAdd(start, Math.round((ms - startMs) / 86_400_000))] = "match"; }
    setBlkSkeleton(sk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkStart, blkWeeks, blkScope, selId]);

  const calBlock = React.useMemo(() => {
    if (!plan || Object.keys(blkSkeleton).length === 0) return null;
    const matchDates: string[] = [], offDays: string[] = [], onDays: string[] = [];
    for (const [k, v] of Object.entries(blkSkeleton)) { if (v === "match") matchDates.push(k); else if (v === "off") offDays.push(k); else onDays.push(k); }
    return buildCalendarBlock({ unit: blkUnit, startDate: blkStart, numWeeks: blkWeeks, scopeName: isPlayerScope ? player!.name : "__team__", scopePos: isPlayerScope ? player!.position : null, phase: blkPhaseLabel, baseOverloadPct: blkBase, stepPct: blkStep, matchDates, offDays, onDays });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkSkeleton, blkStart, blkWeeks, blkBase, blkStep, blkScope, selId, blkUnit]);

  const [wsApplied, setWsApplied] = React.useState<null | "ok" | "err">(null);
  const [wsBusy, setWsBusy] = React.useState(false);
  const cycleDay = (iso: string) => { setWsApplied(null); setBlkSkeleton((s) => ({ ...s, [iso]: s[iso] === "off" ? "session" : s[iso] === "session" ? "match" : "off" })); };

  // Which block goal fits right now — a grounded recommendation from the hub's own signals (never auto-set).
  const goalRec = React.useMemo(() => {
    if (!plan || plan.phases.length === 0) return null;
    const gk = (en: string): BlockGoalKey => (en.startsWith("Accum") ? "accum" : en.startsWith("Transmut") ? "transmute" : en.startsWith("Realiz") ? "realize" : "deload");
    const curIdx = plan.blocks.findIndex((b) => b.start <= blkStart && blkStart < b.end);
    const curBlock = curIdx >= 0 ? plan.blocks[curIdx] : plan.blocks[0] ?? null;
    const prevBlock = curIdx > 0 ? plan.blocks[curIdx - 1] : null;
    const phaseKey = plan.phases.find((ph) => ph.start <= blkStart && blkStart < ph.end)?.key as "preseason" | "competitive" | "offseason" | undefined;
    const startMs = Date.parse(blkStart), endMs = startMs + blkWeeks * 7 * 86_400_000;
    const fx = (plan.fixtures ?? []).map((f) => Date.parse(f));
    const future = fx.filter((ms) => ms >= startMs).sort((a, b) => a - b);
    const weeksToNextFixture = future.length ? Math.max(0, Math.round((future[0] - startMs) / (7 * 86_400_000))) : null;
    const inWin = fx.filter((ms) => ms >= startMs && ms < endMs).length;
    return recommendBlockGoal({
      phaseKey: phaseKey ?? null, weeksToNextFixture, matchesPerWeek: blkWeeks > 0 ? inWin / blkWeeks : null,
      deloadNow: !!curBlock?.isDeload, deloadReason: curBlock?.flag ?? null,
      prevGoal: prevBlock ? gk(prevBlock.phase.en) : null,
      fixturesLoaded: (plan.fixtures ?? []).length, loadHistoryWeeks: (plan.loadCurve ?? []).length,
    });
  }, [plan, blkStart, blkWeeks]);
  const recTint = (c: "high" | "medium" | "low") => (c === "high" ? "bg-emerald-100 text-emerald-700" : c === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500");

  async function exportBlock() {
    if (!calBlock || !plan) return;
    await downloadPeriodizationBlockPdf({ teamName: plan.teamName, block: calBlock }, is ? "IS" : "EN");
  }

  // Write the block skeleton back into Week Setup (week_setups + week_plans) so the two stay in sync.
  async function applyToWeekSetup() {
    if (!calBlock) return;
    setWsBusy(true); setWsApplied(null);
    const applyWeekSetup = calBlock.weeks.map((w) => ({
      week_start: w.weekStart,
      system_key: w.isDeload ? "RECOVERY" : blkGoal === "accum" ? "STRENGTH" : "POWER",
      intensity_target: w.isDeload ? 3 : Math.max(3, Math.min(9, Math.round(5 + (w.mult - 1) * 12))),
      days: w.days.map((d, i) => ({
        day_index: i + 1, day_date: isoAdd(w.weekStart, i),
        day_type: d.type === "match" ? "GAME" : d.type === "rest" ? "OFF" : "TRAIN",
        focus: d.type === "rest" || d.type === "match" ? null : d.label.en,
        day_intent: d.md,
      })),
    }));
    try {
      const res = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ applyWeekSetup }) });
      setWsApplied(res.ok ? "ok" : "err");
    } catch { setWsApplied("err"); }
    setWsBusy(false);
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
        en="the whole periodisation spine in one place — Macro cycle (the season) → Meso cycle (the 4–6 week block) → Micro cycle (the week) — generated from this team's own fixtures, load and tests, not a generic template"
        is="öll periodisation-keðjan á einum stað — Makró-lota (tímabilið) → Mesó-lota (4–6 vikna lotan) → Míkró-lota (vikan) — búin til úr eigin leikjum, álagi og prófum liðsins, ekki almennu sniðmáti"
      />
      <PageCrossRef
        en="Macro cycle — the season · Meso cycle — the block (calendar + PDF) · Micro cycle — the week (Week Setup, in-place). Demands + Players feed all three. The per-player MD week is in the Training Programme (Æfingavika)."
        is="Makró-lota — tímabilið · Mesó-lota — lotan (dagatal + PDF) · Míkró-lota — vikan (Vikuuppsetning, innfeld). Kröfur + Leikmenn næra allar þrjár. Per-leikmanns MD-vikan er í Æfingaviku."
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

          {/* TABS — the periodisation spine (macro → meso → micro), then the supporting inputs */}
          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {([
              { key: "season", en: "Macro Cycle", is: "Makró-lota", subEn: "the season", subIs: "tímabilið" },
              { key: "plan", en: "Meso Cycle", is: "Mesó-lota", subEn: "the 4–6 week block", subIs: "4–6 vikna lotan" },
              { key: "micro", en: "Micro Cycle", is: "Míkró-lota", subEn: "the week", subIs: "vikan" },
              { key: "demands", en: "Demands", is: "Kröfur", subEn: "baselines & match unit", subIs: "grunnlínur & leikviðmið" },
              { key: "players", en: "Players", is: "Leikmenn", subEn: "individualisation", subIs: "einstaklingsmiðun" },
            ] as const).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px rounded-t-lg border-b-2 px-3 py-1.5 text-left ${tab === t.key ? "border-[#2740e6]" : "border-transparent hover:bg-slate-50"}`}>
                <span className={`block text-[12px] font-semibold ${tab === t.key ? "text-[#2740e6]" : "text-slate-600"}`}>{is ? t.is : t.en}</span>
                <span className="block text-[9px] text-slate-400">{is ? t.subIs : t.subEn}</span>
              </button>
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

          {/* THE PLAN tab — the block planner (primary) → the season meso map (context) → micro link */}
          {tab === "plan" && (<div className="space-y-4">
          {/* MESO PLAN-AHEAD EDITOR + PDF BLOCK */}
          {blkPopulated.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">{is ? "Skipuleggja lotu — dagatal + PDF" : "Plan a block — calendar + PDF"}</h2>
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={applyToWeekSetup} disabled={!calBlock || wsBusy} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1e34c0] disabled:opacity-40" title={is ? "Skrifar dagana í Vikuuppsetningu (week_plans)" : "Writes the days into Week Setup (week_plans)"}>{wsBusy ? (is ? "Vista…" : "Saving…") : wsApplied === "ok" ? (is ? "✓ Sett í Vikuuppsetningu" : "✓ Applied to Week Setup") : (is ? "Setja í Vikuuppsetningu" : "Apply to Week Setup")}</button>
                  <button onClick={exportBlock} disabled={!calBlock} className="rounded-lg border border-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-40" title={is ? "Bara þessa lotu (heildar-PDF er efst á síðunni)" : "Just this block (the full-data PDF is at the top of the page)"}>{is ? "Sækja þessa lotu (PDF)" : "Export this block (PDF)"}</button>
                </div>
              </div>
              {wsApplied === "ok" && <p className="mt-1 text-[11px] font-medium text-emerald-700">{is ? "✓ Lotan er komin í Vikuuppsetningu — leikir/æfingar/frí og dagsgerðir skrifaðar á week_plans." : "✓ The block is in Week Setup — matches/sessions/off and day-types written to week_plans."}</p>}
              {wsApplied === "err" && <p className="mt-1 text-[11px] font-medium text-rose-700">{is ? "Ekki tókst að vista í Vikuuppsetningu." : "Couldn't save to Week Setup."}</p>}
              <p className="mt-1 text-[11px] text-slate-500">{is ? "Settu upp lotuna sjálf(ur): smelltu á dag til að skipta Frí → Æfing → Leikur. Leikir eru forstilltir úr leikjaskránni (match_schedule / Vikuuppsetning). Kerfið reiknar dagsgerðir (Mechanical/Locomotive/Mixed…) og tölur út frá leikviðmiðinu." : "Lay out the block yourself: click a day to cycle Off → Session → Match. Matches are pre-filled from your fixtures (match_schedule / Week Setup). The system computes the day-types (Mechanical/Locomotive/Mixed…) and the numbers from the match unit."}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-[11px] text-slate-500">{is ? "Upphaf" : "Start"}<input type="date" value={blkStart} onChange={(e) => setBlkStart(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Vikur" : "Weeks"}<input type="number" min={1} max={8} value={blkWeeks} onChange={(e) => setBlkWeeks(Number(e.target.value))} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Grunn-álag %" : "Base overload %"}<input type="number" min={80} max={130} value={blkBase} onChange={(e) => setBlkBase(Number(e.target.value))} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Stig/viku %" : "Step/wk %"}<input type="number" min={0} max={15} value={blkStep} onChange={(e) => setBlkStep(Number(e.target.value))} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Markmið" : "Goal"}<select value={blkGoal} onChange={(e) => setBlkGoal(e.target.value as typeof blkGoal)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]">{(["accum", "transmute", "realize"] as const).map((g) => <option key={g} value={g}>{is ? BLOCK_GOAL_LABEL[g].is : BLOCK_GOAL_LABEL[g].en}{goalRec?.goal === g ? (is ? " (Ráðlagt)" : " (Recommended)") : ""}</option>)}</select></label>
                <label className="text-[11px] text-slate-500">{is ? "Umfang" : "Scope"}<select value={blkScope} onChange={(e) => setBlkScope(e.target.value as typeof blkScope)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]"><option value="team">{is ? "Lið" : "Team"}</option><option value="player">{is ? `Leikmaður: ${player?.name ?? ""}` : `Player: ${player?.name ?? ""}`}</option></select></label>
              </div>
              {blkScope === "player" && <p className="mt-1 text-[10px] text-slate-400">{is ? `Leikviðmið úr leikmanni völdum í „Leikmenn“-flipanum${player ? ` (${player.name})` : ""}. Skiptu um leikmann þar.` : `Match unit from the player selected in the "Players" tab${player ? ` (${player.name})` : ""}. Change the player there.`}</p>}

              {/* Recommended block goal — verdict → why → confidence → override (never auto-set) */}
              {goalRec && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-500">{is ? "Ráðlagt markmið" : "Recommended goal"}:</span>
                    <span className="text-[12px] font-semibold text-slate-900">{is ? BLOCK_GOAL_LABEL[goalRec.goal].is : BLOCK_GOAL_LABEL[goalRec.goal].en}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${recTint(goalRec.confidence)}`}>{is ? "vissa" : "conf"}: {goalRec.confidence}</span>
                    {goalRec.goal !== "deload" && blkGoal !== goalRec.goal && <button onClick={() => setBlkGoal(goalRec.goal as typeof blkGoal)} className="rounded border border-[#2740e6] px-1.5 py-0.5 text-[9px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">{is ? "Nota" : "Use"}</button>}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {goalRec.reasons.slice(0, 3).map((r, i) => <li key={i} className="text-[11px] text-slate-600">• {is ? r.is : r.en}</li>)}
                  </ul>
                  <p className="mt-1 text-[10px] text-slate-400">{is ? "Annar kostur" : "Alternative"}: <b>{is ? BLOCK_GOAL_LABEL[goalRec.alternative.goal].is : BLOCK_GOAL_LABEL[goalRec.alternative.goal].en}</b> — {is ? goalRec.alternative.when.is : goalRec.alternative.when.en}</p>
                  <p className="mt-1 text-[9px] text-slate-400">{is ? "Val á lotu-markmiði er þjálfaramat — þetta er grundaður sjálfgefinn kostur úr eigin leikjum + álagi liðsins, ekki fyrirmæli (Issurin 2010; Little & Buchheit). Ekki sjálfvirkt sett." : "Block-goal choice is a coaching judgment — a grounded default from the team's own fixtures + load, not a mandate (Issurin 2010; Little & Buchheit). Not auto-applied."}</p>
                </div>
              )}

              {/* THE COACH'S 6-WEEK SKELETON GRID — click a day to cycle Off / Session / Match */}
              {(() => {
                const start = mondayOf(blkStart);
                const dows = is ? ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                const stateStyle: Record<DayState, string> = { match: "bg-[#1c7a4a] text-white border-[#1c7a4a]", session: "bg-[#2740e6] text-white border-[#2740e6]", off: "bg-slate-100 text-slate-400 border-slate-200" };
                const stateLbl: Record<DayState, string> = { match: is ? "Leikur" : "Match", session: is ? "Æfing" : "Session", off: is ? "Frí" : "Off" };
                return (
                  <div className="mt-3">
                    <div className="mb-1 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                      <span className="font-semibold uppercase tracking-wide text-slate-400">{is ? "Uppsetning lotu" : "Block setup"}</span>
                      {(["match", "session", "off"] as DayState[]).map((st) => <span key={st} className="inline-flex items-center gap-1"><span className={`inline-block h-2.5 w-2.5 rounded-sm ${stateStyle[st].split(" ")[0]}`} />{stateLbl[st]}</span>)}
                      <span className="text-slate-400">{is ? "· smelltu til að skipta" : "· click to cycle"}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="grid min-w-[420px] gap-1" style={{ gridTemplateColumns: "auto repeat(7, 1fr)" }}>
                        <div />
                        {dows.map((d) => <div key={d} className="text-center text-[9px] font-medium uppercase text-slate-400">{d}</div>)}
                        {Array.from({ length: blkWeeks }, (_, i) => (
                          <React.Fragment key={i}>
                            <div className="flex items-center pr-1 text-[10px] font-semibold text-slate-500">{is ? "V" : "W"}{i + 1}</div>
                            {Array.from({ length: 7 }, (_, d) => {
                              const iso = isoAdd(start, i * 7 + d); const st = blkSkeleton[iso] ?? "off";
                              return (
                                <button key={d} onClick={() => cycleDay(iso)} title={`${shortDate(iso, is)} — ${stateLbl[st]}`} className={`rounded-md border py-1 text-center text-[10px] font-semibold ${stateStyle[st]}`}>
                                  {new Date(`${iso}T00:00:00`).getUTCDate()}
                                </button>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* WHAT THE SYSTEM COMPUTES from the coach's skeleton (day-types + loads, the PDF content) */}
              {calBlock && (() => {
                const typeColor: Record<string, string> = { mechanical: "#a83e28", locomotive: "#1c7a4a", mixed: "#2740e6", activation: "#64748b", topup: "#7a5cc4", match: "#1c7a4a", rest: "#cbd5e1" };
                const dash = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));
                return (
                  <div className="mt-3 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Kerfið reiknar (fer í PDF)" : "The system computes (goes to the PDF)"}</div>
                    {calBlock.weeks.map((w) => (
                      <div key={w.index} className={`rounded-lg border p-2.5 ${w.isDeload ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-semibold text-slate-900">{is ? "Vika" : "Week"} {w.index + 1} · {shortDate(w.weekStart, is)}</span>
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: w.isDeload ? "#de9328" : "#2740e6" }}>{w.isDeload ? (is ? "Niðurtröppun" : "Deload") : `×${w.mult.toFixed(2)}`}</span>
                          <span className="text-[10px] text-slate-500">{is ? "leikur" : "match"} {is ? w.matchDow.is : w.matchDow.en}</span>
                          <span className="ml-auto text-[9px] text-slate-400">{is ? "hlaup" : "run"} {w.pctRunning ?? "—"}% · HSR {w.pctHsr ?? "—"}% · {is ? "vélr." : "mech"} {w.pctMech ?? "—"}% · {w.restDays} {is ? "frí" : "off"}</span>
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          {w.days.map((d, i) => (
                            <div key={i} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                              <span className="w-8 shrink-0 text-slate-400">{is ? d.dow.is : d.dow.en}</span>
                              <span className="w-10 shrink-0 text-[9px] text-slate-400">{d.md}</span>
                              <span className="w-20 shrink-0 font-semibold" style={{ color: typeColor[d.type] }}>{is ? d.label.is : d.label.en}</span>
                              <span className="text-slate-600">{d.type === "rest" ? "—" : `${is ? "Vegal" : "Dist"} ${dash(d.dist)}m · HSR ${dash(d.hsr)}m · PL ${dash(d.load)}`}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="text-[9px] text-slate-400">{is ? "Lýsandi — dagsgerðir + tölur reiknaðar úr beinagrind þinni og leikviðmiðinu; upphafspunktur, ekki viðmið til að hlýða. Aldrei fleiri en 3 æfingar í röð. Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021." : "Descriptive — day-types + numbers computed from your skeleton and the match unit; a starting point, not a norm to obey. Never more than 3 sessions in a row. Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021."}</p>
                  </div>
                );
              })()}

              {/* What the day-types mean (folded in from the old MD-week legend) + citations */}
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] font-medium text-[#2740e6]">{is ? "Hvað þýða dagsgerðirnar?" : "What the day-types mean"}</summary>
                <ul className="mt-1.5 space-y-1 text-[11px] text-slate-600">
                  <li><b className="text-[#a83e28]">Mechanical</b> — {is ? "þröngt rými, mikil accel/decel — ASD undirb. (lágt háhraðahlaup)." : "tight-space, high accel/decel — ASD prep (low HSR)."}</li>
                  <li><b className="text-[#1c7a4a]">Locomotive</b> — {is ? "opið rými, hæsti háhraði — hlaupageta." : "open-space, highest HSR — running capacity."}</li>
                  <li><b className="text-[#2740e6]">Mixed</b> — {is ? "leiklíkt áreiti, hámarks heildarálag." : "match-like stimulus, peak overall load."}</li>
                  <li><b className="text-slate-600">Activation</b> — {is ? "lágt lífeðlislegt álag (niðurtröppun fyrir leik)." : "low physiological load, a pre-match primer."}</li>
                  <li><b className="text-[#7a5cc4]">Top-up</b> — {is ? "koma <60′ leikmönnum í vikumarkið; endurheimt fyrir byrjunarlið." : "bring <60′ players to the weekly target; recovery for starters."}</li>
                  <li><b className="text-[#1c7a4a]">Match</b> — {is ? "leikkrafan sjálf (viðmiðunareiningin, 100%)." : "the match demand itself (the reference unit, 100%)."} · <b className="text-slate-400">Off</b> — {is ? "heill frídagur." : "full rest day."}</li>
                </ul>
                <p className="mt-1.5 text-[9px] text-slate-400">Issurin 2010 (block periodisation) · Owen 2017 (positional mesocycle, MD taper) · Oliveira 2019 (congested-week variants) · Oliveira 2021 (ACWR/monotony on sRPE+HSR) · Teixeira 2021 (monitoring) · Martín-García 2018 (%-of-match-demand). {is ? "Lýsandi — aldrei readiness-liturinn." : "Descriptive — never the readiness colour."}</p>
              </details>
            </section>
          )}

          {/* MESO — the season-long map of blocks (context below the planner); goal recommendation on the current block */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{is ? "Mesó — kort lotanna yfir tímabilið" : "Meso — the season map of blocks"}</h2>
            <p className="mt-1 text-[11px] text-slate-500">{is ? "Leikurinn er einingin: TMr = vikuálag ÷ eitt leikálag. Við röppum TMr skynsamlega og lesum bráðaálags-þróun + viðbragð — ekki ACWR-band." : "The match is the unit: TMr = weekly load ÷ one match's load. We ramp TMr sensibly and read the acute-load trend + readiness — not an ACWR band."}
              {plan.matchLoad != null && <span className="text-slate-400"> {is ? "Eitt leikálag" : "One match"} ≈ {plan.matchLoad} {plan.tier.loadSource === "srpe" ? "AU" : "PL"}.</span>}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {plan.blocks.map((b) => {
                const trendGlyph = b.loadTrend === "rising" ? "↗" : b.loadTrend === "falling" ? "↘" : b.loadTrend === "steady" ? "→" : "";
                const trendWord = b.loadTrend === "rising" ? (is ? "hækkandi" : "rising") : b.loadTrend === "falling" ? (is ? "lækkandi" : "falling") : b.loadTrend === "steady" ? (is ? "stöðugt" : "steady") : "";
                const bg: BlockGoalKey = b.phase.en.startsWith("Accum") ? "accum" : b.phase.en.startsWith("Transmut") ? "transmute" : b.phase.en.startsWith("Realiz") ? "realize" : "deload";
                const isCurrent = b.start <= blkStart && blkStart < b.end;
                return (
                <div key={b.index} className={`rounded-lg border p-2.5 ${b.isDeload ? "border-amber-300 bg-amber-50" : isCurrent ? "border-[#2740e6]/40" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-semibold text-slate-900">{is ? b.phase.is : b.phase.en}</span>
                    <span className="text-[10px] text-slate-400">{shortDate(b.start, is)}–{shortDate(b.end, is)} · {b.weeks}{is ? " vk" : "w"}</span>
                    {isCurrent && goalRec && (bg === goalRec.goal
                      ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">{is ? "✓ Ráðlagt" : "✓ Recommended"}</span>
                      : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500" title={goalRec.reasons.map((r) => (is ? r.is : r.en)).join(" · ")}>{is ? "Uppástunga" : "Suggested"}: {is ? BLOCK_GOAL_LABEL[goalRec.goal].is : BLOCK_GOAL_LABEL[goalRec.goal].en}</span>)}
                    {b.tmr != null && <span className="ml-auto rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#2740e6]" title={is ? "Vikuálag sem margfeldi af einu leikálagi (TMr)" : "Weekly load as a multiple of one match (TMr)"}>TMr {b.tmr}×</span>}
                  </div>
                  <p className="mt-1 text-[12px] text-slate-700">{is ? b.goal.is : b.goal.en}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                    {b.volumeTargetPct != null && <span className="text-slate-500">{is ? "Magn-mark" : "Volume target"}: <b>{b.volumeTargetPct}%</b></span>}
                    {b.loadTrend && <span className="text-slate-500">{is ? "Bráðaálag" : "Acute load"}: <b>{trendGlyph} {trendWord}</b></span>}
                    {b.flag && <span className={`rounded px-1.5 py-0.5 font-semibold ${b.isDeload ? "bg-amber-200 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{is ? b.flag.is : b.flag.en}</span>}
                  </div>
                  {isCurrent && goalRec && bg !== goalRec.goal && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[9px] text-[#2740e6]">{is ? "Af hverju uppástunga?" : "Why the suggestion?"}</summary>
                      <ul className="mt-0.5 space-y-0.5">{goalRec.reasons.slice(0, 3).map((r, i) => <li key={i} className="text-[9px] text-slate-500">• {is ? r.is : r.en}</li>)}</ul>
                    </details>
                  )}
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

          {/* MESO → MICRO handoff — the week is the next tab (fed by "Apply to Week Setup" above) */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{is ? "Míkró — vikan" : "Micro — the week"}</h2>
            <p className="mt-1 text-[12px] text-slate-600">{is ? "Þegar þú ýtir „Setja í Vikuuppsetningu“ hér að ofan birtist vikan dag-fyrir-dag í Míkró-lotu flipanum." : "When you press \"Apply to Week Setup\" above, the day-by-day week appears in the Micro Cycle tab."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setTab("micro")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-slate-50">{is ? "Míkró-lota (vikan) →" : "Micro Cycle (the week) →"}</button>
              <a href="/coach/training-programme" className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-slate-50">{is ? "Æfingavika (per leikmann) →" : "Training Programme (per player) →"}</a>
            </div>
          </section>

          </div>)}

          {/* MICRO CYCLE tab — the existing Week Setup, mounted in-place (one macro→meso→micro flow) */}
          {tab === "micro" && (
            <div className="-mx-4 -mb-6">
              <WeekSetupPage />
            </div>
          )}

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
