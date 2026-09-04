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
import { buildMesoPlan, buildMesoBlocks, buildCalendarBlock, recommendBlockGoal, positionGroup, BLOCK_GOAL_LABEL, type TeamAverages, type MesoPlan, type MesoBlock, type BlockGoalKey, type CalType, type CalDay } from "@/lib/micropulse/periodization";
import { useMatchScheduleRealtime } from "@/lib/useMatchScheduleRealtime";
import ProgressiveOverloadCard from "@/components/coach/ProgressiveOverloadCard";
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
type MatchUnit = { nNearFull: number; nInWindow: number; fellBack: boolean; confidence: "high" | "medium" | "low"; windowNote: Bi; minutesTypical: number | null; load: MatchUnitMetric; hsr: MatchUnitMetric; sprint: MatchUnitMetric; distance: MatchUnitMetric; accel: MatchUnitMetric; decel: MatchUnitMetric; accHiEff: MatchUnitMetric; decHiEff: MatchUnitMetric; stride: MatchUnitMetric; rhie: MatchUnitMetric; symmetry: MatchUnitMetric; metPower: MatchUnitMetric };
type WeekTargetPlan = { phase: "preseason" | "inseason"; sessionCount: number; weeklyLoadTarget: number | null; perSessionLoad: number | null; matchMultiple: number | null; topUp: number | null; note: Bi; cite: string };
type Player = { playerId: string; name: string; position: string | null; masKmh: number | null; masSource: string | null; masAgeDays: number | null; intervals: Interval[]; vbt: Vbt; strengthFallback: StrengthDefault | null; vald: Vald; gaps: Gap[]; matchUnit: MatchUnit; weekTargets: { preseason: WeekTargetPlan; inseason: WeekTargetPlan; current: "preseason" | "inseason" }; recentMinutesAvg: number | null };
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

// The dominant IMA direction of a day's split, as a short localized label.
const domDir = (dir: { fwd: number; back: number; lat: number } | null, is: boolean): string | null => {
  if (!dir) return null;
  const m = Math.max(dir.fwd, dir.back, dir.lat);
  const key = m === dir.fwd ? (is ? "fram" : "fwd") : m === dir.lat ? (is ? "hlið" : "lat") : (is ? "aftur" : "back");
  return `${key} ${Math.round(m * 100)}%`;
};
// Compact "Acc B2–3 · Dec B2–3 · Stride · dir" line for a day — only the metrics the feed carries.
const imaLine = (d: CalDay, is: boolean): string => {
  const p: string[] = [];
  if (d.accHiEff != null) p.push(`Acc B2–3 ${d.accHiEff}`);
  if (d.decHiEff != null) p.push(`Dec B2–3 ${d.decHiEff}`);
  if (d.stride != null) p.push(`${is ? "Skref" : "Stride"} ${d.stride}`);
  const dd = domDir(d.dir, is); if (dd) p.push(`${is ? "stefna" : "dir"} → ${dd}`);
  return p.join(" · ");
};

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
  const [cadence, setCadence] = React.useState<4 | 5 | 6>(4); // Macro deload cadence = mesocycle length
  const blkSessions = 5; // hub-PDF summary block default (the on-page block uses the calendar grid)
  const [blkBase, setBlkBase] = React.useState(100);
  const [blkStep, setBlkStep] = React.useState(5);
  const blkPosKey: number | null = null; // position baseline for the hub-PDF summary block (Team = first)
  const [blkScope, setBlkScope] = React.useState<"team" | "player">("team");
  const [blkGoal, setBlkGoal] = React.useState<"accum" | "transmute" | "realize">("accum");
  const [loadCurveKey, setLoadCurveKey] = React.useState(-1); // -1 = Team (whole squad), else a position key
  const [tab, setTab] = React.useState<"season" | "plan" | "micro" | "demands" | "players">(() => {
    if (typeof window === "undefined") return "season";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "plan" || t === "micro" || t === "demands" || t === "players" ? t : "season";
  });
  const [blkSkeleton, setBlkSkeleton] = React.useState<Record<string, DayState>>({}); // coach's 6-week day grid
  const [typeOverrides, setTypeOverrides] = React.useState<Record<string, CalType>>({}); // per-day day-type picks
  const [dayModal, setDayModal] = React.useState<string | null>(null); // ISO of the day open in the editor popup

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

  // THE ONE FIXTURE WRITE PATH (client side) — every match add/move/remove on the planner goes through the
  // shared server route so match_schedule stays the single source of truth; then we refetch so Macro + Meso
  // re-derive. Delete is guarded: if the fixture has recorded minutes/stats the server returns 409 and we
  // ask the coach to confirm before forcing.
  const writeFixture = React.useCallback(async (date: string, op: "upsert" | "delete", opts?: { force?: boolean; opponent?: string; competition?: string }): Promise<boolean> => {
    const res = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ fixture: { op, date, force: opts?.force ?? false, opponent: opts?.opponent, competition: opts?.competition } }) });
    if (res.status === 409) {
      const j = await res.json().catch(() => ({})) as { refs?: { minutes: number; stats: number } };
      const r = j.refs ?? { minutes: 0, stats: 0 };
      const msg = is
        ? `Þessi leikur á skráð gögn (${r.minutes} mínútur, ${r.stats} tölfræði) og er notaður annars staðar. Eyða samt?`
        : `This match has recorded data (${r.minutes} minutes, ${r.stats} stats) and is referenced elsewhere. Delete anyway?`;
      if (typeof window !== "undefined" && window.confirm(msg)) return writeFixture(date, op, { ...opts, force: true });
      return false;
    }
    if (!res.ok) { const j = await res.json().catch(() => ({})) as { error?: string }; setErr(j.error ?? "Fixture write failed"); return false; }
    await load(preStart, seasonEnd); // re-derive Macro + Meso from match_schedule
    return true;
  }, [authHeader, is, load, preStart, seasonEnd]);

  // Live-sync: any fixture change (this tab or another open tab / the Fixtures page / Week Setup) refetches
  // so the Macro anchors + Meso block re-derive without a manual reload. RLS scopes events to this team.
  useMatchScheduleRealtime("hub", React.useCallback(() => { void load(preStart, seasonEnd); }, [load, preStart, seasonEnd]), !!plan);

  // MACRO IS THE CONTROL — the meso blocks are recomputed from the season span + the chosen deload cadence
  // (= block length), so changing the cadence (or, via re-fetch, the anchors) re-flows the whole plan.
  const mesoBlocks: MesoBlock[] = React.useMemo(() => {
    if (!plan || plan.phases.length === 0) return (plan?.blocks as unknown as MesoBlock[]) ?? [];
    const s = plan.phases[0].start, e = plan.phases[plan.phases.length - 1].end;
    const curve = (plan.loadCurve ?? []).map((w) => ({ weekStart: w.weekStart, load: w.load, readiness: null }));
    return buildMesoBlocks(s, e, curve, cadence, plan.matchLoad, plan.fixtures ?? []);
  }, [plan, cadence]);

  // Cascade: the cadence sets the planner's block length; the planner opens on the current macro block.
  React.useEffect(() => {
    setBlkWeeks(cadence);
    if (mesoBlocks.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const cur = mesoBlocks.find((b) => b.start <= today && today < b.end) ?? mesoBlocks[0];
    if (cur) setBlkStart(cur.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadence, plan]);

  async function savePlan() {
    if (!plan) return;
    setSaved(false);
    const res = await fetch("/api/coach/periodization", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
      body: JSON.stringify({ seasonYear: plan.seasonYear, overrides: { preseasonStart: preStart || undefined, seasonEnd: seasonEnd || undefined },
        blocks: mesoBlocks.map((b) => ({ block_index: b.index, phase: b.phase.en, goal: b.goal.en, start_date: b.start, end_date: b.end, is_deload: b.isDeload, targets: { acwr: b.acwr, volumeTargetPct: b.volumeTargetPct } })) }),
    });
    setSaved(res.ok);
  }

  async function addFriendly() {
    if (!friendly) return;
    const ok = await writeFixture(friendly, "upsert"); // shared path → match_schedule; refetch re-anchors MD
    if (ok) setFriendly("");
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
    // Direction base = the whole-squad match split (the engine tilts it by position on training days).
    const dir = ta?.direction ?? null;
    const dirFields = { dirFwd: dir?.forward ?? null, dirBack: dir?.backward ?? null, dirLat: dir?.lateral ?? null };
    return isPlayerScope && mu
      ? { dist: mu.distance.typical, hsr: mu.hsr.typical, load: mu.load.typical, accdec: ((mu.accel.typical ?? 0) + (mu.decel.typical ?? 0)) || null,
          accHiEff: mu.accHiEff.typical, decHiEff: mu.decHiEff.typical, stride: mu.stride.typical, ...dirFields, rhie: mu.rhie.typical, symmetry: mu.symmetry.typical, metPower: mu.metPower.typical }
      : { dist: ta?.matchDistanceM ?? null, hsr: ta?.matchHsrM ?? null, load: ta?.matchPlayerLoad ?? null, accdec: ((ta?.matchAccel ?? 0) + (ta?.matchDecel ?? 0)) || null,
          accHiEff: ta?.matchAccelHiEff ?? null, decHiEff: ta?.matchDecelHiEff ?? null, stride: ta?.matchStrideHi ?? null, ...dirFields, rhie: ta?.rhieBouts ?? null, symmetry: ta?.runSymmetry ?? null, metPower: ta?.metabolicPower ?? null };
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
    setBlkSkeleton(sk); setTypeOverrides({}); setDayModal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkStart, blkWeeks, blkScope, selId]);

  // The coach's skeleton, split into the sets buildCalendarBlock consumes — shared by the team block and
  // every per-player block (so the Players tab is literally "computed from the Meso Cycle").
  const skeletonSets = React.useMemo(() => {
    const matchDates: string[] = [], offDays: string[] = [], onDays: string[] = [];
    for (const [k, v] of Object.entries(blkSkeleton)) { if (v === "match") matchDates.push(k); else if (v === "off") offDays.push(k); else onDays.push(k); }
    return { matchDates, offDays, onDays };
  }, [blkSkeleton]);

  const calBlock = React.useMemo(() => {
    if (!plan || Object.keys(blkSkeleton).length === 0) return null;
    return buildCalendarBlock({ unit: blkUnit, startDate: blkStart, numWeeks: blkWeeks, scopeName: isPlayerScope ? player!.name : "__team__", scopePos: isPlayerScope ? player!.position : null, phase: blkPhaseLabel, baseOverloadPct: blkBase, stepPct: blkStep, ...skeletonSets, typeOverrides });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkSkeleton, skeletonSets, typeOverrides, blkStart, blkWeeks, blkBase, blkStep, blkScope, selId, blkUnit]);

  // The SELECTED player's individualised block — same Meso skeleton, his own match unit + position tilt +
  // VALD cap + minutes trim. Change the Meso block and this updates with it.
  const playerBlock = React.useMemo(() => {
    if (!plan || !player || Object.keys(blkSkeleton).length === 0) return null;
    const mu = player.matchUnit; const MIN_SAMPLE = 4;
    const tb = plan.teamBaseline.avg;
    const dir = tb.direction ?? null;
    const dirFields = { dirFwd: dir?.forward ?? null, dirBack: dir?.backward ?? null, dirLat: dir?.lateral ?? null };
    const teamUnit = { dist: tb.matchDistanceM, hsr: tb.matchHsrM, load: tb.matchPlayerLoad, accdec: ((tb.matchAccel ?? 0) + (tb.matchDecel ?? 0)) || null,
      accHiEff: tb.matchAccelHiEff, decHiEff: tb.matchDecelHiEff, stride: tb.matchStrideHi, ...dirFields, rhie: tb.rhieBouts, symmetry: tb.runSymmetry, metPower: tb.metabolicPower };
    const useOwn = !!(mu && mu.load.typical != null && mu.nNearFull >= MIN_SAMPLE);
    const unit = useOwn ? { dist: mu.distance.typical, hsr: mu.hsr.typical, load: mu.load.typical, accdec: ((mu.accel.typical ?? 0) + (mu.decel.typical ?? 0)) || null,
      accHiEff: mu.accHiEff.typical, decHiEff: mu.decHiEff.typical, stride: mu.stride.typical, ...dirFields, rhie: mu.rhie.typical, symmetry: mu.symmetry.typical, metPower: mu.metPower.typical } : teamUnit;
    // Position emphasis, data-driven from the squad demands, clamped to a small ±15% bias (Figueiredo).
    const pg = positionGroup(player.position).key;
    const posB = (plan.positionBaselines ?? []).find((b) => b.key === pg && b.avg.sessions > 0) ?? null;
    const clamp = (x: number) => Math.max(0.85, Math.min(1.15, x));
    const hsrEmph = posB && posB.avg.hsrM && tb.hsrM ? clamp(posB.avg.hsrM / tb.hsrM) : 1;
    const teamMech = (tb.accel ?? 0) + (tb.decel ?? 0), posMech = (posB?.avg.accel ?? 0) + (posB?.avg.decel ?? 0);
    const mechEmph = posB && posMech > 0 && teamMech > 0 ? clamp(posMech / teamMech) : 1;
    // VALD readiness-to-load cap on the peak multiplier; minutes trim from how many full matches he plays.
    const capPct = player.vald.capPct;
    const maxMult = capPct == null ? 1.4 : capPct >= 100 ? 1.4 : capPct >= 85 ? 1.15 : 1.0;
    const n = mu?.nNearFull ?? 0;
    // Minutes trim from REAL recent minutes: a regular starter (~full games) carries load from matches →
    // add less training; a low-minute player keeps the full ramp and leans on the top-up days.
    const avgMin = player.recentMinutesAvg;
    const loadScale = avgMin == null ? 1.0 : avgMin >= 70 ? 0.9 : avgMin >= 40 ? 0.95 : 1.0;
    const block = buildCalendarBlock({ unit, startDate: blkStart, numWeeks: blkWeeks, scopeName: player.name, scopePos: player.position, phase: blkPhaseLabel, baseOverloadPct: blkBase, stepPct: blkStep, ...skeletonSets, typeOverrides, maxMult, loadScale, emphasis: { hsr: hsrEmph, mech: mechEmph } });
    const uncappedPeak = Math.min(1.4, (blkBase + blkStep * Math.max(0, blkWeeks - 2)) / 100);
    const lighterPct = uncappedPeak > 0 ? Math.round((1 - (Math.min(uncappedPeak, maxMult) * loadScale) / uncappedPeak) * 100) : 0;
    return { block, unit, useOwn, hsrEmph, mechEmph, maxMult, loadScale, capPct, nNearFull: n, avgMin, lighterPct, confidence: useOwn ? (mu?.confidence ?? "low") : "low", posLabel: posB?.label ?? null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, player, blkSkeleton, skeletonSets, typeOverrides, blkStart, blkWeeks, blkBase, blkStep]);

  async function exportPlayerBlock() {
    if (!playerBlock || !plan) return;
    await downloadPeriodizationBlockPdf({ teamName: plan.teamName, block: playerBlock.block }, is ? "IS" : "EN");
  }

  // Day-type editor: pick Off / a session type / Match — keeps the skeleton grid and the computed grid in
  // sync AND persists the match designation to match_schedule (the source of truth) when it changes.
  const isFixtureDay = (iso: string) => (plan?.fixtures ?? []).includes(iso);
  const setDayType = async (iso: string, t: CalType | "match") => {
    setWsApplied(null);
    const wasMatch = isFixtureDay(iso);
    if (t === "match") {
      setBlkSkeleton((s) => ({ ...s, [iso]: "match" })); setTypeOverrides((o) => { const n = { ...o }; delete n[iso]; return n; });
      if (!wasMatch) await writeFixture(iso, "upsert");
    } else {
      const local: DayState = t === "rest" ? "off" : "session";
      setBlkSkeleton((s) => ({ ...s, [iso]: local }));
      setTypeOverrides((o) => { const n = { ...o }; if (t === "rest") delete n[iso]; else n[iso] = t; return n; });
      if (wasMatch) { const ok = await writeFixture(iso, "delete"); if (!ok) { setBlkSkeleton((s) => ({ ...s, [iso]: "match" })); setTypeOverrides((o) => { const n = { ...o }; delete n[iso]; return n; }); } }
    }
  };

  const [wsApplied, setWsApplied] = React.useState<null | "ok" | "err">(null);
  const [wsBusy, setWsBusy] = React.useState(false);
  const cycleDay = async (iso: string) => {
    setWsApplied(null);
    const cur = blkSkeleton[iso] ?? "off";
    const next: DayState = cur === "off" ? "session" : cur === "session" ? "match" : "off";
    setBlkSkeleton((s) => ({ ...s, [iso]: next }));
    const wasMatch = isFixtureDay(iso);
    if (next === "match" && !wasMatch) await writeFixture(iso, "upsert");
    else if (next !== "match" && wasMatch) { const ok = await writeFixture(iso, "delete"); if (!ok) setBlkSkeleton((s) => ({ ...s, [iso]: "match" })); }
  };

  // Which block goal fits right now — a grounded recommendation from the hub's own signals (never auto-set).
  const goalRec = React.useMemo(() => {
    if (!plan || plan.phases.length === 0) return null;
    const gk = (en: string): BlockGoalKey => (en.startsWith("Accum") ? "accum" : en.startsWith("Transmut") ? "transmute" : en.startsWith("Realiz") ? "realize" : "deload");
    const curIdx = mesoBlocks.findIndex((b) => b.start <= blkStart && blkStart < b.end);
    const curBlock = curIdx >= 0 ? mesoBlocks[curIdx] : mesoBlocks[0] ?? null;
    const prevBlock = curIdx > 0 ? mesoBlocks[curIdx - 1] : null;
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
  }, [plan, mesoBlocks, blkStart, blkWeeks]);
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
    const blocks = mesoBlocks.map((b) => ({ phase: b.phase, goal: b.goal, start: b.start, end: b.end, weeks: b.weeks, isDeload: b.isDeload, tmr: b.tmr, volumeTargetPct: b.volumeTargetPct, flag: b.flag }));
    const tb = plan.teamBaseline?.avg;
    const teamUnit = tb ? { dist: tb.matchDistanceM, hsr: tb.matchHsrM, load: tb.matchPlayerLoad, accdec: ((tb.matchAccel ?? 0) + (tb.matchDecel ?? 0)) || null,
      accHiEff: tb.matchAccelHiEff, decHiEff: tb.matchDecelHiEff, stride: tb.matchStrideHi,
      dirFwd: tb.direction?.forward ?? null, dirBack: tb.direction?.backward ?? null, dirLat: tb.direction?.lateral ?? null,
      rhie: tb.rhieBouts, symmetry: tb.runSymmetry, metPower: tb.metabolicPower } : null;
    await downloadPeriodizationHubPdf({
      teamName: plan.teamName, seasonYear: plan.seasonYear, generatedAt: new Date().toISOString(), teamUnit,
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

          {/* HOW THE CYCLE IS BUILT — the season arc (macro map) with the layered read (Part 1b) */}
          {(() => {
            const GC: Record<BlockGoalKey, string> = { accum: "#2740E6", transmute: "#7A5CC4", realize: "#1C7A4A", deload: "#DE9328" };
            const blocks = mesoBlocks;
            const todayIso = new Date().toISOString().slice(0, 10);
            const preWeeks = plan.phases.find((p) => p.key === "preseason")?.weeks ?? null;
            const curPhase = plan.phases.find((p) => p.start <= todayIso && todayIso < p.end) ?? plan.phases[plan.phases.length - 1] ?? null;
            const weekInPhase = curPhase ? Math.max(1, Math.floor((Date.parse(todayIso) - Date.parse(curPhase.start)) / (7 * 86_400_000)) + 1) : null;
            const thin = (plan.fixtures?.length ?? 0) < 3 || (plan.loadCurve?.length ?? 0) < 4;
            const recLabel = goalRec ? (is ? BLOCK_GOAL_LABEL[goalRec.goal].is : BLOCK_GOAL_LABEL[goalRec.goal].en) : null;
            const spanStart = blocks.length ? Date.parse(blocks[0].start) : 0, spanEnd = blocks.length ? Date.parse(blocks[blocks.length - 1].end) : 1;
            const todayFrac = spanEnd > spanStart ? Math.max(0, Math.min(1, (Date.parse(todayIso) - spanStart) / (spanEnd - spanStart))) : null;
            const ANATOMY: Array<{ g: BlockGoalKey; role: Bi }> = [
              { g: "accum", role: { en: "build the base", is: "byggja grunninn" } },
              { g: "transmute", role: { en: "sharpen to football", is: "sérhæfa í fótbolta" } },
              { g: "realize", role: { en: "peak for matches", is: "toppa fyrir leiki" } },
            ];
            const verdict = is
              ? `Tímabilið byrjar á ${preWeeks ?? "~"} vikna undirbúnings-Uppsöfnun, endurtekur svo Umbreyting → Framkvæmd kringum leikina, og hver lota endar á niðurtröppunar-viku.${curPhase && weekInPhase ? ` Þú ert í viku ${weekInPhase} af ${curPhase.label.is}${recLabel ? ` — næst: ${recLabel}` : ""}.` : ""}`
              : `Your season opens with a ${preWeeks ?? "~"}-week pre-season Accumulation block, then repeats Transmutation → Realization around the fixtures, each block ending in a deload week.${curPhase && weekInPhase ? ` You're in week ${weekInPhase} of ${curPhase.label.en}${recLabel ? ` — next up: ${recLabel}` : ""}.` : ""}`;
            return (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">{is ? "Hvernig lotan er byggð" : "How the cycle is built"}</h2>
                {/* Level 0 — the verdict, first + boldest */}
                <p className="mt-1 text-[13px] font-semibold text-slate-900">{verdict}</p>

                {/* The macro map — the season arc, one goal-coloured block timeline + "you are here" */}
                {blocks.length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex h-4 w-full overflow-hidden rounded">
                      {plan.phases.map((ph) => <div key={ph.key} className="flex items-center justify-center text-[8px] font-medium uppercase tracking-wide text-white" style={{ flexGrow: ph.weeks, background: ph.key === "preseason" ? "#7a5cc4" : ph.key === "competitive" ? "#334155" : "#94a3b8" }}>{is ? ph.label.is : ph.label.en}</div>)}
                    </div>
                    <div className="relative">
                      <div className="flex h-9 w-full overflow-hidden rounded-lg">
                        {blocks.map((b) => {
                          const dwIdx = b.deloadWeekStart ? Math.max(0, Math.round((Date.parse(b.deloadWeekStart) - Date.parse(b.start)) / (7 * 86_400_000))) : b.weeks - 1;
                          const dwLeft = b.weeks > 0 ? (dwIdx / b.weeks) * 100 : 0, dwW = b.weeks > 0 ? (1 / b.weeks) * 100 : 0;
                          return (
                          <div key={b.index} className="relative flex min-w-0 items-center justify-center px-1 text-center text-[8px] font-semibold text-white" style={{ flexGrow: b.weeks, background: GC[b.goalKey] }} title={`${shortDate(b.start, is)}–${shortDate(b.end, is)} · ${is ? b.phase.is : b.phase.en} · ${is ? "niðurtröppun vika" : "deload week"} ${b.deloadWeekStart ? shortDate(b.deloadWeekStart, is) : "—"}${b.deloadNow ? (is ? " (færð framar)" : " (pulled forward)") : ""}`}>
                            <span className="truncate">{is ? b.phase.is : b.phase.en}</span>
                            {/* deload = a WEEK, drawn as a thin amber stripe at its position in the block (never a block) */}
                            <div className="pointer-events-none absolute inset-y-0" style={{ left: `${dwLeft}%`, width: `${dwW}%`, background: b.deloadNow ? "repeating-linear-gradient(45deg,#DE9328,#DE9328 3px,transparent 3px,transparent 6px)" : "#DE9328", opacity: b.deloadNow ? 1 : 0.85 }} />
                          </div>
                        ); })}
                      </div>
                      {todayFrac != null && (
                        <div className="pointer-events-none absolute -top-1 bottom-0" style={{ left: `${todayFrac * 100}%` }}>
                          <div className="h-11 w-0.5 -translate-x-1/2 bg-[#a83e28]" />
                          <span className="absolute top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#a83e28] px-1 py-0.5 text-[8px] font-bold text-white">{is ? "Nú" : "Now"}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Level 1 — 2–3 plain facts naming each goal's place in the cycle */}
                <ul className="mt-4 space-y-1 text-[12px] text-slate-700">
                  <li>• {is ? "Uppsöfnun byggir grunninn, Umbreyting sérhæfir hann í fótbolta, Framkvæmd toppar þig fyrir leiki — í þeirri röð." : "Accumulation builds the base, Transmutation sharpens it to football-specific, Realization peaks you for matches — in that order."}</li>
                  <li>• {is ? "Á tímabilinu skiptistu milli Umbreyting ↔ Framkvæmd kringum leiki; þú safnar aftur eftir niðurtröppun eða pásu." : "In-season you cycle Transmutation ↔ Realization around fixtures; you re-accumulate after a deload or a break."}</li>
                  <li>• {is ? "Niðurtröppun situr í lok lotu, eða þegar álag rýkur upp eða viðbragð lækkar — áætluð endurheimt, ekki tapaður tími." : "A deload sits at the end of a block, or whenever load spikes or readiness drifts — planned recovery, not lost time."}</li>
                </ul>

                {/* Anatomy of a block cycle — teaches the concept cold (chips) */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {ANATOMY.map((a, i) => (
                    <React.Fragment key={a.g}>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: GC[a.g] }}>{is ? BLOCK_GOAL_LABEL[a.g].is : BLOCK_GOAL_LABEL[a.g].en}<span className="font-normal opacity-80">· {is ? a.role.is : a.role.en}</span></span>
                      {i < ANATOMY.length - 1 && <span className="text-slate-300">→</span>}
                    </React.Fragment>
                  ))}
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500"><span className="inline-block h-2.5 w-2 rounded-sm" style={{ background: "#DE9328" }} />{is ? "Niðurtröppun er ekki fjórða lotan — hún er lokavika hverrar lotu (gula rákin), færð framar ef álag rýkur upp." : "Deload isn't a fourth block — it's the last week of every block (the amber stripe), pulled forward if load spikes."}</p>
                {thin && <p className="mt-2 text-[10px] text-amber-700">{is ? "Fá gögn enn (fáir leikir / lítil álags-saga) — lestu kortið sem vísbendingu." : "Thin data so far (few fixtures / little load history) — read the map as a hint."}</p>}

                {/* Level 2 — the model + honest anchor + citations (collapsed) */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] font-medium text-[#2740e6]">{is ? "Hvernig lotan er byggð (líkanið)" : "How the cycle is built (the model)"}</summary>
                  <p className="mt-1.5 text-[11px] text-slate-600">{is ? "MicroPulse setur loturnar á ÞÍNA leiki og álag — svo lengd og staðsetning eru liðsins eigin, ekki fast sniðmát. Röðin (Uppsöfnun → Umbreyting → Framkvæmd, niðurtröppun sem hvíld) er úr blokkar-periodisation; hún mælir með — val á lotu-markmiði er áfram þjálfarans." : "MicroPulse places the blocks on YOUR fixtures and load — so the lengths and positions are the team's own, not a fixed template. The order (Accumulation → Transmutation → Realization, deload as the unload) is block periodisation; it recommends — the block-goal choice stays the coach's call."}</p>
                  <p className="mt-1 text-[9px] text-slate-400">Issurin 2010 (block periodisation) · Martín-García 2018 + Owen 2017 (taper/realization into fixtures) · Teixeira 2021 (deload on load-trend + readiness, not ACWR) · Oliveira 2019/2021 (pre-season = accumulation). {is ? "Lýsandi — aldrei readiness-liturinn." : "Descriptive — never the readiness colour."}</p>
                </details>
              </section>
            );
          })()}

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
            {/* Macro IS the control — set these first; the deload cadence = mesocycle length, and drives
                the Meso blocks + Micro weeks below (change it and the whole plan re-flows). */}
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Stilltu fyrst" : "Set these first"}</span>
              <span className="text-[11px] text-slate-600">{is ? "Niðurtröppun / lotulengd:" : "Deload / block length:"}</span>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
                {([4, 5, 6] as const).map((c) => (
                  <button key={c} onClick={() => setCadence(c)} className={`px-2.5 py-1 text-[11px] font-semibold ${cadence === c ? "bg-[#2740e6] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{is ? `${c}. hverja` : `every ${c}`}</button>
                ))}
              </div>
              <span className="text-[10px] text-slate-500">{is ? `→ ${cadence - 1} uppbyggingarvikur + 1 niðurtröppun. Drífur Mesó + Míkró.` : `→ ${cadence - 1} build weeks + 1 deload. Drives Meso + Micro.`}</span>
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
              {plan.phases.length === 0 && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">{is ? "⚠ Engir leikir/akkeri í Makró enn — stilltu Makró-lotuna fyrst (undirbúningsdag, leikjaskrá, niðurtröppun). Lotan hér reiknast úr því." : "⚠ No Macro anchors/fixtures yet — set the Macro Cycle first (pre-season date, fixtures, deload cadence). This block is computed from it."}</p>}
              <p className="mt-1 text-[11px] text-slate-500">{is ? `Lotan kemur úr Makró (${cadence - 1} vikur + niðurtröppun, hefst á núverandi lotu). Fínstilltu: smelltu á dag til að skipta Frí → Æfing → Leikur. Leikir forstilltir úr leikjaskránni.` : `The block comes from Macro (${cadence - 1} weeks + deload, opens on the current block). Fine-tune: click a day to cycle Off → Session → Match. Matches pre-filled from your fixtures.`}</p>
              {/* Add a real fixture (friendly) to the schedule — an MD anchor that persists and re-seeds the block. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span>{is ? "Bæta æfingaleik/leik í leikjaskrá (MD-akkeri)" : "Add a friendly/match to the schedule (MD anchor)"}</span>
                <input type="date" value={friendly} onChange={(e) => setFriendly(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" />
                <button onClick={addFriendly} disabled={!friendly} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-[#2740e6] hover:bg-slate-50 disabled:opacity-40">{is ? "+ Leikur" : "+ Fixture"}</button>
                <span className="text-[9px] text-slate-400">{is ? "vistast í leikjaskrá og endur-fræsir lotuna" : "persists to the schedule and re-seeds the block"}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-[11px] text-slate-500">{is ? "Upphaf" : "Start"}<input type="date" value={blkStart} onChange={(e) => setBlkStart(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-[12px]" /></label>
                <label className="text-[11px] text-slate-500">{is ? "Vikur (úr Makró)" : "Weeks (from Macro)"}<div className="mt-0.5 flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] text-slate-600">{blkWeeks}<span className="text-[9px] text-slate-400">· {is ? "niðurtr. hverja" : "deload every"} {cadence}</span></div></label>
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
                    {blkGoal !== goalRec.goal && <button onClick={() => setBlkGoal(goalRec.goal as typeof blkGoal)} className="rounded border border-[#2740e6] px-1.5 py-0.5 text-[9px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">{is ? "Nota" : "Use"}</button>}
                  </div>
                  {goalRec.deloadNow && <p className="mt-1 flex items-center gap-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"><span className="inline-block h-2 w-1.5 rounded-sm" style={{ background: "#DE9328" }} />{is ? "Þreytumerki — færðu niðurtröppunar-vikuna framar (markmiðið helst)." : "Fatigue signal — pull the deload week forward (the goal is unchanged)."}</p>}
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
                const tint: Record<string, string> = { mechanical: "#F6E7E1", locomotive: "#E4F1EA", mixed: "#E7EAFB", activation: "#EFEFEF", topup: "#F0EAF7", match: "#FBEFDD", rest: "#f8fafc" };
                const abbr = (t: string): string => t === "mechanical" ? "Mech" : t === "locomotive" ? (is ? "Hlaup" : "Loco") : t === "mixed" ? (is ? "Bland" : "Mixed") : t === "activation" ? (is ? "Virkj" : "Activ") : t === "topup" ? (is ? "Áfyll" : "Top") : t === "match" ? (is ? "Leikur" : "Match") : "—";
                const dows = is ? ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                const dash = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));
                return (
                  <div className="mt-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Kerfið reiknar (fer í PDF)" : "The system computes (goes to the PDF)"}</span>
                      <span className="text-[9px] text-slate-400">{is ? "· sveimaðu yfir dag fyrir tölur" : "· hover a day for numbers"}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="grid min-w-[520px] gap-1" style={{ gridTemplateColumns: "auto repeat(7, 1fr)" }}>
                        <div />
                        {dows.map((d) => <div key={d} className="text-center text-[8px] font-medium uppercase text-slate-400">{d}</div>)}
                        {calBlock.weeks.map((w) => (
                          <React.Fragment key={w.index}>
                            <div className="flex flex-col justify-center pr-1" title={w.capNote ? (is ? w.capNote.is : w.capNote.en) : undefined}>
                              <span className="text-[10px] font-semibold text-slate-700">{is ? "V" : "W"}{w.index + 1}</span>
                              <span className={`text-[8px] font-bold ${w.isDeload ? "text-[#de9328]" : "text-[#2740e6]"}`}>{w.isDeload ? (is ? "niðurtr." : "deload") : `×${w.mult.toFixed(2)}`}</span>
                              {w.capNote && <span className="text-[7px] font-medium text-amber-600" title={is ? w.capNote.is : w.capNote.en}>⚑</span>}
                            </div>
                            {w.days.map((d, i) => { const iso = isoAdd(mondayOf(blkStart), w.index * 7 + i); const ima = d.type === "rest" ? "" : imaLine(d, is); return (
                              <button key={i} onClick={() => setDayModal(iso)} className="rounded px-0.5 py-1 text-center leading-tight hover:ring-2 hover:ring-[#2740e6]/40" style={{ background: tint[d.type] }} title={d.type === "rest" ? (is ? "Smelltu til að breyta dagsgerð" : "Click to change the day-type") : `${is ? d.label.is : d.label.en} · PL ${dash(d.load)}${ima ? ` · ${ima}` : ""}`}>
                                <div className="text-[9px] font-semibold" style={{ color: typeColor[d.type] }}>{abbr(d.type)}</div>
                                <div className="text-[8px] tabular-nums text-slate-500">{d.type === "rest" ? "" : `${dash(d.load)}`}</div>
                              </button>
                            ); })}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <p className="mt-1.5 text-[9px] text-slate-400">{is ? "Reitir litaðir eftir dagsgerð; talan = Player Load. Vikuálagið er stigvaxandi per mæligildi (magn hækkar hraðar en háhraði; hvert við leikþak — ⚑ sýnir hvað heldur vikunni). Lýsandi — upphafspunktur, ekki viðmið. Aldrei fleiri en 3 æfingar í röð. Malone 2017 · Gabbett 2016 · Figueiredo · Owen 2017 · Teixeira 2021." : "Cells coloured by day-type; the number = Player Load. Weekly overload ramps per-KPI (volume climbs faster than HSR; each ceilings at match — ⚑ shows what held the week). Descriptive — a starting point, not a norm. Never more than 3 sessions in a row. Malone 2017 · Gabbett 2016 · Figueiredo · Owen 2017 · Teixeira 2021."}</p>
                    {(calBlock.unit.accHiEff != null || calBlock.unit.stride != null) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] font-medium text-[#2740e6]">{is ? "Sýna vélrænt / IMA (Acc·Dec B2–3, skref, stefna)" : "Show mechanical/IMA detail (Acc·Dec B2–3, stride, direction)"}</summary>
                        <ul className="mt-1.5 space-y-0.5 text-[10px] text-slate-600">
                          {calBlock.weeks.flatMap((w) => w.days.map((d, i) => ({ d, i, wi: w.index })).filter(({ d }) => d.type !== "rest")).map(({ d, i, wi }) => (
                            <li key={`${wi}-${i}`} className="tabular-nums"><span className="text-slate-400">{is ? "V" : "W"}{wi + 1} {is ? d.dow.is : d.dow.en} {d.md}</span> · <b style={{ color: typeColor[d.type] }}>{abbr(d.type)}</b> — {imaLine(d, is) || (is ? "engin IMA-gögn" : "no IMA data")}</li>
                          ))}
                        </ul>
                        <p className="mt-1 text-[9px] text-slate-400">{is ? "Mechanical-dagar hlaða Acc/Dec Band 2–3 + skref; Locomotive-dagar hlaða skref + háhraða — aldrei á sama degi (Buchheit; aftanlæris-vernd)." : "Mechanical days load Acc/Dec Band 2–3 + strides; Locomotive days load stride + HSR — never the same day (Buchheit; hamstring protection)."}</p>
                      </details>
                    )}
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
              {mesoBlocks.map((b) => {
                const trendGlyph = b.loadTrend === "rising" ? "↗" : b.loadTrend === "falling" ? "↘" : b.loadTrend === "steady" ? "→" : "";
                const trendWord = b.loadTrend === "rising" ? (is ? "hækkandi" : "rising") : b.loadTrend === "falling" ? (is ? "lækkandi" : "falling") : b.loadTrend === "steady" ? (is ? "stöðugt" : "steady") : "";
                const bg: BlockGoalKey = b.goalKey;
                const GC: Record<BlockGoalKey, string> = { accum: "#2740E6", transmute: "#7A5CC4", realize: "#1C7A4A", deload: "#DE9328" };
                const isCurrent = b.start <= blkStart && blkStart < b.end;
                return (
                <div key={b.index} className={`rounded-lg border p-2.5 ${isCurrent ? "border-[#2740e6]/40" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: GC[bg] }} />
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
                    {b.deloadWeekStart && <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800"><span className="inline-block h-2 w-1.5 rounded-sm" style={{ background: "#DE9328" }} />{is ? "niðurtr. vika" : "deload wk"} {shortDate(b.deloadWeekStart, is)}{b.deloadNow ? (is ? " · færð framar" : " · pulled fwd") : ""}</span>}
                    {b.flag && <span className="rounded bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-900">{is ? b.flag.is : b.flag.en}</span>}
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

          {/* INDIVIDUALISED BLOCK — the Meso skeleton, this player's own numbers */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{is ? "Einstaklings-lota — reiknuð úr Mesó-lotunni" : "Individualised block — computed from the Meso Cycle"}</h2>
              <select value={selId} onChange={(e) => setSelId(e.target.value)} className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-[13px]">
                {plan.players.map((p) => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
              </select>
              {playerBlock && <button onClick={exportPlayerBlock} className="rounded-lg border border-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">{is ? "Sækja lotu leikmanns (PDF)" : "Export this player's block (PDF)"}</button>}
            </div>
            {!calBlock && <p className="mt-2 text-[12px] text-amber-700">{is ? "Settu upp lotu í Mesó-lotu flipanum fyrst — einstaklings-lotan reiknast úr henni." : "Lay out a block in the Meso Cycle tab first — the player's block is computed from it."}</p>}
            {player && playerBlock && (() => {
              const pb = playerBlock; const b = pb.block;
              const km = (m: number | null) => (m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
              const conf = pb.confidence === "high" ? { c: "bg-emerald-100 text-emerald-700", t: is ? "há vissa" : "high" } : pb.confidence === "medium" ? { c: "bg-amber-100 text-amber-700", t: is ? "miðlungs" : "medium" } : { c: "bg-rose-100 text-rose-700", t: is ? "lítil vissa" : "low" };
              const lighterTxt = pb.lighterPct > 0 ? (is ? `~${pb.lighterPct}% léttari` : `~${pb.lighterPct}% lighter`) : pb.lighterPct < 0 ? (is ? `~${-pb.lighterPct}% þyngri` : `~${-pb.lighterPct}% heavier`) : (is ? "á liðsálagi" : "at the squad load");
              const tiltTxt = pb.hsrEmph > 1.02 ? (is ? ", háhraði yfir liðinu á Locomotive-dögum" : ", HSR above the team on Locomotive days") : pb.hsrEmph < 0.98 ? (is ? ", meira vélrænt en liðið" : ", more mechanical than the team") : "";
              const typeColor: Record<string, string> = { mechanical: "#a83e28", locomotive: "#1c7a4a", mixed: "#2740e6", activation: "#64748b", topup: "#7a5cc4", match: "#1c7a4a", rest: "#cbd5e1" };
              const tint: Record<string, string> = { mechanical: "#F6E7E1", locomotive: "#E4F1EA", mixed: "#E7EAFB", activation: "#EFEFEF", topup: "#F0EAF7", match: "#FBEFDD", rest: "#f8fafc" };
              const abbr = (t: string): string => t === "mechanical" ? "Mech" : t === "locomotive" ? (is ? "Hlaup" : "Loco") : t === "mixed" ? (is ? "Bland" : "Mixed") : t === "activation" ? (is ? "Virkj" : "Activ") : t === "topup" ? (is ? "Áfyll" : "Top") : t === "match" ? (is ? "Leikur" : "Match") : "—";
              const dows = is ? ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
              return (
                <div className="mt-3">
                  {/* Level 0 — verdict */}
                  <p className="text-[13px] font-semibold text-slate-900">{is ? `${player.name}: lotan er ${lighterTxt} en fullur rampur${!pb.useOwn ? " (liðs-grunnlína — fáir heilir leikir)" : ""}${tiltTxt}.` : `${player.name}'s block runs ${lighterTxt} than the full ramp${!pb.useOwn ? " (squad baseline — few full matches)" : ""}${tiltTxt}.`}</p>
                  {/* Level 1 — the drivers */}
                  <ul className="mt-1.5 space-y-0.5 text-[12px] text-slate-700">
                    <li>• {pb.useOwn ? (is ? `Eigið leikviðmið: ${pb.unit.load} PL · ${km(pb.unit.hsr)} háhraði (miðgildi ${pb.nNearFull} heilla leikja).` : `Own match unit: ${pb.unit.load} PL · ${km(pb.unit.hsr)} HSR (median of ${pb.nNearFull} full matches).`) : (is ? `Fáir heilir leikir (${pb.nNearFull}) — nota liðs-leikviðmið.` : `Few full matches (${pb.nNearFull}) — using the squad match unit.`)}</li>
                    <li>• {pb.posLabel ? (is ? `${pb.posLabel.is}: háhraði ×${pb.hsrEmph.toFixed(2)}, vélrænt ×${pb.mechEmph.toFixed(2)} (Figueiredo).` : `${pb.posLabel.en} tilt: HSR ×${pb.hsrEmph.toFixed(2)}, mechanical ×${pb.mechEmph.toFixed(2)} (Figueiredo).`) : (is ? "Staða óþekkt — liðshlutföll." : "Position unknown — team shares.")}</li>
                    <li>• {pb.maxMult < 1.4 ? (is ? `VALD ${player.vald.status ?? ""}: toppur takmarkaður við ×${pb.maxMult.toFixed(2)}. ` : `VALD ${player.vald.status ?? ""}: peak capped at ×${pb.maxMult.toFixed(2)}. `) : ""}{pb.loadScale < 1 ? (is ? `~${pb.avgMin}′ að meðaltali nýlega → æfingaálag trimmað ×${pb.loadScale.toFixed(2)}.` : `~${pb.avgMin}′ recent average → training load trimmed ×${pb.loadScale.toFixed(2)}.`) : (pb.avgMin != null && pb.avgMin < 40 ? (is ? `Fáar mínútur (~${pb.avgMin}′) → fullur rampur + áfyllingar.` : `Low minutes (~${pb.avgMin}′) → full ramp + top-ups.`) : (pb.maxMult >= 1.4 ? (is ? "Fullur rampur — ekkert þak/trim." : "Full ramp — no cap or trim.") : ""))}</li>
                  </ul>
                  <div className="mt-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${conf.c}`}>{is ? "vissa" : "confidence"}: {conf.t}</span></div>
                  {/* Level 2 — the individualised block (compact calendar) */}
                  <div className="mt-3 overflow-x-auto">
                    <div className="grid min-w-[520px] gap-1" style={{ gridTemplateColumns: "auto repeat(7, 1fr)" }}>
                      <div />
                      {dows.map((d) => <div key={d} className="text-center text-[8px] font-medium uppercase text-slate-400">{d}</div>)}
                      {b.weeks.map((w) => (
                        <React.Fragment key={w.index}>
                          <div className="flex flex-col justify-center pr-1"><span className="text-[10px] font-semibold text-slate-700">{is ? "V" : "W"}{w.index + 1}</span><span className={`text-[8px] font-bold ${w.isDeload ? "text-[#de9328]" : "text-[#2740e6]"}`}>{w.isDeload ? (is ? "niðurtr." : "deload") : `×${w.mult.toFixed(2)}`}</span></div>
                          {w.days.map((d, i) => (
                            <div key={i} className="rounded px-0.5 py-1 text-center leading-tight" style={{ background: tint[d.type] }} title={d.type === "rest" ? `${is ? d.dow.is : d.dow.en} ${d.md} — ${is ? "Frí" : "Rest"}` : `${is ? d.dow.is : d.dow.en} ${d.md} · ${is ? d.label.is : d.label.en} · ${is ? "Vegal" : "Dist"} ${km(d.dist)} · HSR ${km(d.hsr)} · PL ${d.load ?? "–"}${imaLine(d, is) ? ` · ${imaLine(d, is)}` : ""}`}>
                              <div className="text-[9px] font-semibold" style={{ color: typeColor[d.type] }}>{abbr(d.type)}</div>
                              <div className="text-[8px] tabular-nums text-slate-500">{d.type === "rest" ? "" : d.load ?? ""}</div>
                            </div>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[9px] text-slate-400">{is ? "Sama beinagrind og Mesó-lotan (vikur/leikir/dagsgerðir/niðurtröppun) — aðeins tölur og þök einstaklingsmiðuð. Upphafspunktur, ekki viðmið (Little & Buchheit). Aldrei readiness-liturinn." : "Same skeleton as the Meso Cycle (weeks/matches/day-types/deload) — only the numbers and caps individualise. A starting point, not a norm (Little & Buchheit). Never the readiness colour."}</p>
                  {(b.unit.accHiEff != null || b.unit.stride != null) && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-[#2740e6]">{is ? "Sýna vélrænt / IMA (Acc·Dec B2–3, skref, stefna)" : "Show mechanical/IMA detail (Acc·Dec B2–3, stride, direction)"}</summary>
                      <ul className="mt-1.5 space-y-0.5 text-[10px] text-slate-600">
                        {b.weeks.flatMap((w) => w.days.map((d, i) => ({ d, i, wi: w.index })).filter(({ d }) => d.type !== "rest")).map(({ d, i, wi }) => (
                          <li key={`${wi}-${i}`} className="tabular-nums"><span className="text-slate-400">{is ? "V" : "W"}{wi + 1} {is ? d.dow.is : d.dow.en} {d.md}</span> · <b style={{ color: typeColor[d.type] }}>{abbr(d.type)}</b> — {imaLine(d, is) || (is ? "engin IMA-gögn" : "no IMA data")}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[9px] text-slate-400">{is ? "Stefnu-halli einstaklingsmiðaður eftir stöðu; skref/átök skala frá eigin leikviðmiði. Buchheit (stefnu-bil)." : "Direction tilt individualised by position; stride/efforts scale from his own match unit. Buchheit (directional gap)."}</p>
                    </details>
                  )}

                  {/* Optional — the squad at a glance: who's lighter/heavier and why */}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11px] font-medium text-[#2740e6]">{is ? "Allur hópurinn — hver er léttari/þyngri" : "Whole squad — who's lighter/heavier"}</summary>
                    <div className="mt-1.5 overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead><tr className="text-left text-[9px] uppercase tracking-wide text-slate-400"><th className="py-1 pr-2 font-medium">{is ? "Leikmaður" : "Player"}</th><th className="py-1 pr-2 text-right font-medium">{is ? "vs lið" : "vs squad"}</th><th className="py-1 pr-2 text-right font-medium">VALD</th><th className="py-1 text-right font-medium">{is ? "mín/leik" : "min/match"}</th></tr></thead>
                        <tbody>
                          {plan.players.map((p) => {
                            const cap = p.vald.capPct; const mm = cap == null ? 1.4 : cap >= 100 ? 1.4 : cap >= 85 ? 1.15 : 1.0;
                            const am = p.recentMinutesAvg; const ls = am == null ? 1.0 : am >= 70 ? 0.9 : am >= 40 ? 0.95 : 1.0;
                            const up = Math.min(1.4, (blkBase + blkStep * Math.max(0, blkWeeks - 2)) / 100);
                            const lp = up > 0 ? Math.round((1 - (Math.min(up, mm) * ls) / up) * 100) : 0;
                            return (
                              <tr key={p.playerId} className={`border-t border-slate-100 ${p.playerId === selId ? "bg-[#2740e6]/5" : ""}`}>
                                <td className="py-1 pr-2 text-slate-700">{p.name}</td>
                                <td className={`py-1 pr-2 text-right tabular-nums ${lp > 0 ? "text-emerald-700" : lp < 0 ? "text-rose-700" : "text-slate-500"}`}>{lp > 0 ? `−${lp}%` : lp < 0 ? `+${-lp}%` : "—"}</td>
                                <td className="py-1 pr-2 text-right">{cap != null && cap < 100 ? <span className={`rounded px-1 text-[9px] font-semibold ${cap >= 85 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>{p.vald.status}</span> : <span className="text-slate-300">–</span>}</td>
                                <td className="py-1 text-right tabular-nums text-slate-500">{am == null ? "–" : `${am}′`}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1 text-[9px] text-slate-400">{is ? "„vs lið“ = hversu miklu léttari (−) rampurinn er vs fullur rampur, eftir VALD-þaki + mínútu-trimmi." : "\"vs squad\" = how much lighter (−) the ramp is vs the full ramp, after the VALD cap + minutes trim."}</p>
                  </details>
                </div>
              );
            })()}
          </section>

          {/* BUILD-UP PLAN — the harvested Progressive Overload engine: ramp each player from current baseline
              TO his match unit (pre-season / return-to-play). Reuses ProgressiveOverloadCard (its own fetch). */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{is ? "Uppbyggingar-áætlun (undirbúningur / aftur í leik)" : "Build-up plan (pre-season / return-to-play)"}</h2>
            <p className="mt-1 mb-2 text-[11px] text-slate-500">{is ? "Örugg vikuleg þróun frá núverandi grunnlínu AÐ leikviðmiði hvers leikmanns — magn hraðast, háhraði/sprettur hægast (aftanlæri). Hver leikmaður merktur byggja / framvinda / halda. Aðal-þakið er leikkrafan + bráðaálags-þróun; ACWR er umdeilt aukagildi. Lýsandi — aldrei readiness-liturinn." : "A safe weekly ramp from current baseline TO each player's match unit — volume fastest, HSR/sprint slowest (hamstring). Each player tagged build / progress / hold. The primary ceiling is match demand + acute-load trend; ACWR is a contested secondary readout. Descriptive — never the readiness colour."}</p>
            <ProgressiveOverloadCard weeks={blkWeeks} />
          </section>

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

      {/* DAY EDITOR POPUP — change the day-type + see the team-average training variables (GPS + IMA) */}
      {dayModal && plan && calBlock && (() => {
        const start = mondayOf(blkStart);
        const off = Math.round((Date.parse(dayModal) - Date.parse(start)) / 86_400_000);
        const day = calBlock.weeks[Math.floor(off / 7)]?.days[((off % 7) + 7) % 7] ?? null;
        if (!day) return null;
        // Baseline = the SELECTED position (a player's own position; peak demands are position-specific),
        // falling back to the whole squad only when there's no position or no data for it.
        const posKey = isPlayerScope && player ? positionGroup(player.position).key : -1;
        const posBase = posKey >= 0 ? (plan.positionBaselines ?? []).find((b) => b.key === posKey && b.avg.sessions > 0) : null;
        const baseline = posBase ?? plan.teamBaseline;
        const a = baseline.avg;
        const typeColor: Record<string, string> = { mechanical: "#a83e28", locomotive: "#1c7a4a", mixed: "#2740e6", activation: "#64748b", topup: "#7a5cc4", match: "#1c7a4a", rest: "#94a3b8" };
        const picks: Array<{ k: CalType | "match"; label: Bi }> = [
          { k: "rest", label: { en: "Off", is: "Frí" } },
          { k: "mechanical", label: { en: "Mechanical", is: "Mechanical" } },
          { k: "locomotive", label: { en: "Locomotive", is: "Locomotive" } },
          { k: "mixed", label: { en: "Mixed", is: "Mixed" } },
          { k: "activation", label: { en: "Activation", is: "Virkjun" } },
          { k: "topup", label: { en: "Top-up", is: "Áfylling" } },
          { k: "match", label: { en: "Match", is: "Leikur" } },
        ];
        const km = (m: number | null) => (m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
        const dir = a.direction;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDayModal(null)}>
            <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: typeColor[day.type] }}>{day.md}</span>
                <h3 className="text-sm font-semibold text-slate-900">{is ? day.dow.is : day.dow.en} {shortDate(dayModal, is)}</h3>
                <button onClick={() => setDayModal(null)} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100">✕</button>
              </div>

              {/* Day-type picker */}
              <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Dagsgerð" : "Day-type"}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {picks.map((p) => { const active = day.type === p.k; return (
                  <button key={p.k} onClick={() => setDayType(dayModal, p.k)} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${active ? "border-transparent text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`} style={active ? { background: typeColor[p.k === "match" ? "match" : (p.k as string)] } : undefined}>{is ? p.label.is : p.label.en}</button>
                ); })}
              </div>

              {/* Computed targets for this day (from the match unit × day-type share × week multiplier) */}
              <div className="mt-3 rounded-lg bg-slate-50 p-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Reiknuð mörk þennan dag" : "Computed targets — this day"}</div>
                {day.type === "rest" ? <p className="mt-1 text-[12px] text-slate-500">{is ? "Hvíldardagur — engin mörk." : "Rest day — no targets."}</p> : (
                  <>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-slate-700">
                      <span>{is ? "Vegal" : "Dist"}: <b className="tabular-nums">{km(day.dist)}</b></span>
                      <span>HSR: <b className="tabular-nums">{km(day.hsr)}</b></span>
                      <span>PL: <b className="tabular-nums">{day.load ?? "–"}</b></span>
                      {day.type === "match" && <span className="text-[10px] text-slate-400">({is ? "leikkrafan = 100%" : "the match = 100%"})</span>}
                    </div>
                    {(day.accHiEff != null || day.decHiEff != null || day.stride != null || day.dir) && (
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                        {day.accHiEff != null && <span>Acc B2–3: <b className="tabular-nums">{day.accHiEff}</b></span>}
                        {day.decHiEff != null && <span>Dec B2–3: <b className="tabular-nums">{day.decHiEff}</b></span>}
                        {day.stride != null && <span>{is ? "Skref" : "Stride"}: <b className="tabular-nums">{day.stride}</b></span>}
                        {day.dir && <span>{is ? "stefna" : "dir"} → <b>{domDir(day.dir, is)}</b></span>}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Team average on the training variables (GPS + IMA) — the baseline the targets scale from */}
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{(is ? baseline.label.is : baseline.label.en)} — {is ? "meðaltal á æfingu (GPS + IMA)" : "average per session (GPS + IMA)"}</div>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] text-slate-700 sm:grid-cols-3">
                  <span>{is ? "Vegal" : "Distance"}: <b className="tabular-nums">{km(a.distanceM)}</b></span>
                  <span>HSR: <b className="tabular-nums">{a.hsrM == null ? "–" : `${Math.round(a.hsrM)} m`}</b></span>
                  <span>{is ? "Sprettur" : "Sprint"}: <b className="tabular-nums">{a.sprintM == null ? "–" : `${Math.round(a.sprintM)} m`}</b></span>
                  <span>{is ? "Hám. hraði" : "Max vel"}: <b className="tabular-nums">{a.maxKmh == null ? "–" : `${a.maxKmh} km/h`}</b></span>
                  <span>PL: <b className="tabular-nums">{a.playerLoad == null ? "–" : Math.round(a.playerLoad)}</b></span>
                  <span>PL/{is ? "mín" : "min"}: <b className="tabular-nums">{a.plPerMin ?? "–"}</b></span>
                  <span>{is ? "Hröðun" : "Accel"}: <b className="tabular-nums">{a.accel ?? "–"}</b></span>
                  <span>{is ? "Hraðam." : "Decel"}: <b className="tabular-nums">{a.decel ?? "–"}</b></span>
                  {a.accelHiEff != null && <span>Acc B2–3: <b className="tabular-nums">{a.accelHiEff}</b></span>}
                  {a.decelHiEff != null && <span>Dec B2–3: <b className="tabular-nums">{a.decelHiEff}</b></span>}
                  {a.strideHi != null && <span>{is ? "Skref" : "Stride"}: <b className="tabular-nums">{a.strideHi}</b></span>}
                  {a.rhieBouts != null && <span>RHIE: <b className="tabular-nums">{a.rhieBouts}</b></span>}
                  {a.runSymmetry != null && <span>{is ? "Samhverfa" : "Symmetry"}: <b className="tabular-nums">{a.runSymmetry}</b></span>}
                  {a.metabolicPower != null && <span>{is ? "Efnaafl" : "Met power"}: <b className="tabular-nums">{a.metabolicPower}</b></span>}
                </div>
                {dir && <p className="mt-1 text-[10px] text-slate-500">{is ? "IMA stefna" : "IMA direction"} — {is ? "fram" : "fwd"} {Math.round(dir.forward * 100)}% · {is ? "hlið" : "lat"} {Math.round(dir.lateral * 100)}% · {is ? "aftur" : "back"} {Math.round(dir.backward * 100)}%</p>}
                <p className="mt-1 text-[9px] text-slate-400">{posBase ? (is ? `Meðaltal per æfingu/leik yfir tímabilið fyrir stöðuna (${player?.name ?? ""}). Lýsandi — aldrei readiness-liturinn.` : `Average per session over the season for this position (${player?.name ?? ""}). Descriptive — never the readiness colour.`) : (is ? "Meðaltal per æfingu/leik yfir tímabilið (allt liðið — engin staða valin eða engin staðgögn). Lýsandi — aldrei readiness-liturinn." : "Average per session over the season (whole squad — no position selected or no position data). Descriptive — never the readiness colour.")}</p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
