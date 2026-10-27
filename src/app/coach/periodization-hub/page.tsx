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
import WeekSetupView from "@/components/coach/WeekSetupView";
import PageCrossRef from "@/components/coach/PageCrossRef";
import PeriodizationModelPicker from "@/components/coach/PeriodizationModelPicker";
import { buildMesoPlan, buildMesoBlocks, buildCalendarBlock, sliceByLengths, recommendBlockGoal, positionGroup, BLOCK_GOAL_LABEL, type TeamAverages, type MesoPlan, type MesoBlock, type BlockGoalKey, type CalType, type CalDay, type CalendarBlock } from "@/lib/micropulse/periodization";
import { useMatchScheduleRealtime } from "@/lib/useMatchScheduleRealtime";
import { computeBuildUpSteer, type BuildUpSteer, type WeaknessInput } from "@/lib/micropulse/periodization/buildUpSteer";
import { buildPlayerBlock, pickActiveBlock } from "@/lib/micropulse/periodization/playerBlock";
import { classifyInSeasonSubPhase, subPhaseInfo, SUBPHASE_KEYS, type InSeasonSubPhaseKey } from "@/lib/micropulse/periodization/inSeasonSubPhase";
import { strengthForBlockGoal, STRENGTH_METHODS } from "@/lib/micropulse/strengthProgramming/seasonPhaseStrength";
import { QUALITY_BY_ID, type QualityRead } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { buildValdTrainingPlan, valdHasData, type ValdTrainingPlan } from "@/lib/micropulse/vald/valdSummary";
import type { ValdSlice } from "@/components/coach/ValdAssessmentBlock";
import ProgressiveOverloadCard from "@/components/coach/ProgressiveOverloadCard";
import BuildUpTrackingCard from "@/components/coach/BuildUpTrackingCard";
import { downloadPeriodizationBlockPdf } from "@/components/coach/PeriodizationBlockPdf";
import OffWeekProgramButton from "@/components/coach/OffWeekProgramButton";
import { downloadPeriodizationHubPdf } from "@/components/coach/PeriodizationHubPdf";
import { strengthConfigForPhase, preseasonBlockForWeeksOut, type SeasonPhaseKey, type CoachStrengthRules } from "@/lib/micropulse/strengthProgramming/seasonPhaseStrength";
import { preseasonStartRamp, preseasonMatchExposure, type LoadAnchor, type PreseasonWeekTarget } from "@/lib/micropulse/periodization/preseasonStart";
import { standardTrainingDays, weeklyTrainingMultiple, weeklyKpiMultiple, kpiVolumes, mesoWeeklyMultiples, mesoTotalMultiple, buildPlannedVolume, kpiPathway, matchesPerWeek, kpiTmRefRange } from "@/lib/micropulse/periodization/plannedVolume";
import { recommendTestingSchedule, testsForBlock, TEST_SHORT, type TestKey } from "@/lib/micropulse/periodization/testingSchedule";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

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
type RecentBaseline = { sessions: number; playerLoad: number | null; hsrM: number | null; distanceM: number | null; sprintM: number | null };
type Player = { playerId: string; name: string; position: string | null; masKmh: number | null; masSource: string | null; masAgeDays: number | null; intervals: Interval[]; vbt: Vbt; strengthFallback: StrengthDefault | null; vald: Vald; gaps: Gap[]; matchUnit: MatchUnit; weekTargets: { preseason: WeekTargetPlan; inseason: WeekTargetPlan; current: "preseason" | "inseason" }; recentMinutesAvg: number | null; recentBaseline: RecentBaseline | null };
type TeamAvg = { sessions: number; players: number; distanceM: number | null; hsrM: number | null; sprintM: number | null; maxKmh: number | null; playerLoad: number | null; plPerMin: number | null; accel: number | null; decel: number | null; direction: { forward: number; backward: number; lateral: number } | null; matchSessions: number; matchDistanceM: number | null; matchHsrM: number | null; matchPlayerLoad: number | null; matchSprintM: number | null; matchAccel: number | null; matchDecel: number | null; accelHiEff: number | null; decelHiEff: number | null; strideHi: number | null; matchAccelHiEff: number | null; matchDecelHiEff: number | null; matchStrideHi: number | null; rhieBouts: number | null; runSymmetry: number | null; metabolicPower: number | null };
type AxisMetric = { metric: Bi; matchValue: string; trainingCeiling: string; band: string };
type Axis = { axis: "running" | "mechanical" | "internal"; label: Bi; matchNote: Bi; metrics: AxisMetric[]; flag: Bi | null };
type MatchAxes = { running: Axis; mechanical: Axis; internal: Axis; hsrDeficit: Bi | null; mechNeglect: Bi | null; capabilities: Bi[] };
type MdDemandBucket = { key: string; label: Bi; offsets: number[]; avg: TeamAvg };
type MdDemandProfile = { phases: MdDemandBucket[]; days: MdDemandBucket[] };
type PositionBaseline = { key: number; label: Bi; avg: TeamAvg; axes: MatchAxes; md: MdDemandProfile };
type Tier = { tier: "pro" | "core" | "rpe" | "none"; loadSource: "gps" | "srpe" | "none"; label: Bi; confidence: "high" | "medium" | "low"; unlock: Bi | null };
type WeekType = "normal" | "two_game" | "three_game";
type Plan = { seasonYear: number; teamName: string; phases: Phase[]; blocks: Block[]; loadCurve: WeekLoad[]; loadCurveByPos: Array<{ key: number; label: Bi; curve: WeekLoad[] }>; positionBaselines: PositionBaseline[]; teamBaseline: PositionBaseline; tier: Tier; mdShape: Record<string, number>; nextWeekType: WeekType; matchLoad: number | null; matchLoadTeam: number | null; matchSrpe: number | null; congested: Array<{ weekStart: string; matches: number }>; players: Player[]; fixtures: string[]; nextFirstFixture?: string | null; nextSeasonYear?: number | null };

const shortDate = (iso: string, is: boolean) => { try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };
const isoAdd = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (iso: string) => { const dt = new Date(`${iso}T00:00:00Z`); const dow = (dt.getUTCDay() + 6) % 7; return new Date(dt.getTime() - dow * 86_400_000).toISOString().slice(0, 10); };

// Map a match unit (per-axis typicals) to the weekly-load KPI vocabulary, so the pre-season start
// ramp can scale every main variable. velocityBand5 = HSR − sprint(band6) when both are present.
const kpiAvgFromUnit = (mu: MatchUnit): Partial<Record<WeeklyLoadMetricKey, number>> => {
  const out: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  if (mu.load.typical != null) out.totalPlayerLoad = mu.load.typical;
  if (mu.distance.typical != null) out.totalDistance = mu.distance.typical;
  if (mu.sprint.typical != null) out.velocityBand6 = mu.sprint.typical;
  if (mu.hsr.typical != null && mu.sprint.typical != null && mu.hsr.typical > mu.sprint.typical) out.velocityBand5 = Math.round(mu.hsr.typical - mu.sprint.typical);
  if (mu.accel.typical != null) out.accelB23 = mu.accel.typical;
  if (mu.decel.typical != null) out.decelB23 = mu.decel.typical;
  return out;
};
// Team KPI average across players who have a match unit (mean per KPI).
const teamKpiAvg = (players: Player[]): Partial<Record<WeeklyLoadMetricKey, number>> => {
  const sums: Partial<Record<WeeklyLoadMetricKey, { s: number; n: number }>> = {};
  for (const p of players) {
    const k = kpiAvgFromUnit(p.matchUnit);
    for (const key of Object.keys(k) as WeeklyLoadMetricKey[]) {
      const v = k[key]; if (v == null) continue;
      const acc = sums[key] ?? { s: 0, n: 0 }; acc.s += v; acc.n += 1; sums[key] = acc;
    }
  }
  const out: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of Object.keys(sums) as WeeklyLoadMetricKey[]) { const a = sums[key]!; out[key] = Math.round(a.s / a.n); }
  return out;
};
type DayState = "match" | "session" | "off";

/** The pre-season to PLAN FOR, relative to today. `detectSeasonPhases` only ever emits ONE pre-season
 *  (the build-up before THIS season's first fixture — in the past once the season is under way). Once
 *  we're in or past the off-season, the pre-season that matters is the NEXT one, which starts when the
 *  off-season ends (= the coach's next-pre-season date, or the shown off-season horizon). Its length is
 *  computed to the NEXT season's first competitive game (`nextFirstFixture`) when the coach has entered it,
 *  else it reuses the detected pre-season's week count. Returns null when there's no pre-season to plan. */
function upcomingPreseason(phases: Phase[], todayIso: string, nextFirstFixture?: string | null): { start: string; weeks: number; end?: string } | null {
  const pre = phases.find((p) => p.key === "preseason");
  const off = phases.find((p) => p.key === "offseason");
  if (off && todayIso >= off.start) {
    // Compute to the real opener when known, else fall back to the detected pre-season length.
    if (nextFirstFixture && nextFirstFixture > off.end) {
      const weeks = Math.max(1, Math.round((Date.parse(`${nextFirstFixture}T00:00:00Z`) - Date.parse(`${off.end}T00:00:00Z`)) / (7 * 86_400_000)));
      return { start: off.end, weeks, end: nextFirstFixture };
    }
    return { start: off.end, weeks: Math.max(1, pre?.weeks ?? 10) };
  }
  if (pre) return { start: pre.start, weeks: Math.max(1, pre.weeks), end: pre.end };
  return null;
}

// The meso always seeds a full 6-week skeleton; a smaller cadence (4/5) just RENDERS fewer weeks
// (the tail is trimmed, not reshuffled), so switching 6→4→5 shows the same block minus the last
// 1–2 weeks and keeps the coach's day edits.
const MESO_HORIZON = 6;
// Reverse of CAL_LABEL.en (what "Apply to Week Setup" writes into week_plans.focus) → CalType, so a
// saved training day reads its stimulus type back into the block skeleton. Substring match because
// focus now carries the MD tag too, e.g. "MD-5 Mechanical".
const caltypeFromFocus = (focus: string): CalType | undefined => {
  const f = focus.toLowerCase();
  if (f.includes("mechanical")) return "mechanical";
  if (f.includes("locomotive")) return "locomotive";
  if (f.includes("mixed")) return "mixed";
  if (f.includes("activation")) return "activation";
  if (f.includes("top-up") || f.includes("topup") || f.includes("áfyll")) return "topup";
  return undefined;
};
// Forward map: a chosen training stimulus → the English label written into week_plans.focus. These exact
// words round-trip through caltypeFromFocus above, so a day's stimulus set on the Pre-season card reads back.
const CALTYPE_FOCUS_LABEL: Partial<Record<CalType, string>> = { mechanical: "Mechanical", locomotive: "Locomotive", mixed: "Mixed", activation: "Activation", topup: "Top-up" };
// Backwards periodization: given the pre-season window length and the coach's game-anchored TAIL blocks
// (lengths of the meso cycles nearest the opener — e.g. a short power/peaking block that ends ON the first
// game), lay out every block so the LAST ends at the opener and the FIRST (base) block absorbs the leftover
// weeks. Tail blocks that would leave < 2 base weeks are dropped from the earliest tail inward. Returns the
// split so the editor can render the flexible base separately from the coach's exact tail.
const PRE_MIN_BLOCK = 2, PRE_MAX_BLOCK = 8;
function preseasonMeso(windowWeeks: number, tail: number[], cadence: number): { lens: number[]; base: number[]; tail: number[] } {
  const W = Math.max(1, Math.round(windowWeeks));
  let t = tail.map((n) => Math.max(PRE_MIN_BLOCK, Math.min(PRE_MAX_BLOCK, Math.round(n))));
  let sumTail = t.reduce((s, n) => s + n, 0);
  while (t.length && W - sumTail < PRE_MIN_BLOCK) { sumTail -= t[0]; t = t.slice(1); }
  const baseWeeks = Math.max(0, W - sumTail);
  const base: number[] = [];
  if (baseWeeks > 0) {
    const n = Math.max(1, Math.ceil(baseWeeks / Math.max(2, cadence)));
    for (let k = 0; k < n; k++) base.push(Math.max(2, cadence));
    base[0] = baseWeeks - Math.max(2, cadence) * (n - 1); // earliest block absorbs the remainder
    if (base[0] < PRE_MIN_BLOCK && base.length > 1) { base[1] += base[0]; base.shift(); }
    if (base.length === 1) base[0] = baseWeeks;           // single base block = all the base weeks
  }
  return { lens: [...base, ...t], base, tail: t };
}
const lensToBlockWeeks = (lens: number[]): Record<string, number> => { const m: Record<string, number> = {}; lens.forEach((n, i) => { m[String(i)] = n; }); return m; };

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
  const [nextPreStart, setNextPreStart] = React.useState(""); // coach-set NEXT pre-season start — bounds the off-season by date
  const [offStart, setOffStart] = React.useState("");         // coach-set off-season (reconditioning) START — the days between season end and this are a holiday (Frí)
  const [saved, setSaved] = React.useState(false);
  // Refs so `load` can read the latest off-season window without changing its identity (deps).
  const nextPreStartRef = React.useRef(nextPreStart); nextPreStartRef.current = nextPreStart;
  const didPopulateWindow = React.useRef(false);
  const didPopulateNext = React.useRef(false); // guard for the upcoming-pre-season (next-year) overrides restore
  const [friendly, setFriendly] = React.useState("");    // pre-season friendly date to add (MD anchor)
  const [friendlyKind, setFriendlyKind] = React.useState<"friendly" | "competitive">("friendly"); // tag so friendlies don't start the season
  const [mdPosKey, setMdPosKey] = React.useState<number | null>(null); // position selector for the three-axes + MD-demand cards
  const [mdDaysOpen, setMdDaysOpen] = React.useState(false); // "Show MD-day detail" toggle under the microcycle-demand phases
  // Macro season-map inline block editor: the block (by start ISO) the coach opened to edit goal + length.
  const [macroEditStart, setMacroEditStart] = React.useState<string | null>(null);
  // Meso plan-ahead editor state.
  const [blkStart, setBlkStart] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [blkWeeks, setBlkWeeks] = React.useState(4);
  const [cadence, setCadence] = React.useState<4 | 5 | 6>(4); // Macro deload cadence = mesocycle length
  const blkSessions = 5; // hub-PDF summary block default (the on-page block uses the calendar grid)
  // Which players get an individualised block in the full-plan PDF: just the selected one (default — a
  // light export), the whole eligible roster ("All"), or a custom tick-list.
  const [pdfPlayerMode, setPdfPlayerMode] = React.useState<"selected" | "all" | "custom">("selected");
  const [pdfCustom, setPdfCustom] = React.useState<Set<string>>(new Set());
  const [pdfPickerOpen, setPdfPickerOpen] = React.useState(false);
  const [blkBase, setBlkBase] = React.useState(100);
  const [blkStep, setBlkStep] = React.useState(5);
  const blkPosKey: number | null = null; // position baseline for the hub-PDF summary block (Team = first)
  const [blkScope, setBlkScope] = React.useState<"team" | "player">("team");
  // Per-block goal overrides, keyed by block start ISO (coach's choice wins over the engine's default).
  // Persisted in season_plans.overrides.blockGoals; the editable goal is derived per selected block below.
  const [blockGoals, setBlockGoals] = React.useState<Record<string, "accum" | "transmute" | "realize">>({});
  // Per-block LENGTH + DELOAD-week overrides, keyed by block start ISO. Persisted in
  // season_plans.overrides.blockWeeks / .blockDeload; applied inside buildMesoBlocks (so the server-side
  // plan target lands on the same blocks). Default = the auto cadence / smart deload placement.
  const [blockLenOv, setBlockLenOv] = React.useState<Record<string, number>>({});
  const [blockDeloadOv, setBlockDeloadOv] = React.useState<Record<string, string>>({});
  const [loadCurveKey, setLoadCurveKey] = React.useState(-1); // -1 = Team (whole squad), else a position key
  // Pre-season week-1 starting target + ramp (editable launch pad; coach builds from it).
  const [psWeek1Mult, setPsWeek1Mult] = React.useState(1.3); // week-1 ×match (controlled re-entry)
  const [psSessions, setPsSessions] = React.useState(4);      // sessions / week
  const [psWeekSel, setPsWeekSel] = React.useState(1);        // which pre-season week the cards show (1 = week 1)
  // UPCOMING pre-season (next season) overrides — a SEPARATE store persisted to `plan.nextSeasonYear`'s
  // season_plans row, so next year's planning survives the calendar rollover and never shares block indices
  // with the current season (the ártal-skörðun fix). Only used when `upcomingYear` (see below); in-season the
  // Pre-season tab falls back to the current-year store unchanged.
  const [preBlockLenOv, setPreBlockLenOv] = React.useState<Record<string, number>>({});
  const [prePsWeek1Mult, setPrePsWeek1Mult] = React.useState(1.3);
  const [prePsSessions, setPrePsSessions] = React.useState(4);
  // Game-anchored pre-season meso-cycle tail (lengths of the blocks NEAREST the opener; the base block
  // absorbs the remainder — backwards periodization). null = not set → derive from the auto layout. Used
  // only when `upcomingYear`; the next-year row holds pre-season blocks only, so add/remove never shifts a
  // competitive-block index. Current-year pre-season keeps the per-block length dropdowns.
  const [nextMesoTail, setNextMesoTail] = React.useState<number[] | null>(null);
  const [tab, setTab] = React.useState<"season" | "preseason" | "plan" | "micro" | "testing" | "demands" | "players">(() => {
    if (typeof window === "undefined") return "season";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "preseason" || t === "plan" || t === "micro" || t === "testing" || t === "demands" || t === "players" ? t : "season";
  });
  const [preseasonJumpWeek, setPreseasonJumpWeek] = React.useState<string | undefined>(undefined); // deep-link Pre-season week → Week Setup
  const [preDaySave, setPreDaySave] = React.useState<null | "saving" | "saved" | "err">(null); // pre-season draft day-toggle save status
  const [preDayPick, setPreDayPick] = React.useState<{ weekStart: string; di: number } | null>(null); // pre-season day open in the stimulus picker
  const [blkSkeleton, setBlkSkeleton] = React.useState<Record<string, DayState>>({}); // coach's 6-week day grid
  const [typeOverrides, setTypeOverrides] = React.useState<Record<string, CalType>>({}); // per-day day-type picks
  const [savedPlans, setSavedPlans] = React.useState<Record<string, { dayType: string; focus: string | null }>>({}); // saved week_plans (read-back)
  const [dayModal, setDayModal] = React.useState<string | null>(null); // ISO of the day open in the editor popup
  // Scheduled performance tests (dates pinned to test types) — shared with Week Setup via the API.
  const [scheduledTests, setScheduledTests] = React.useState<{ id: string; test_key: TestKey; test_date: string; note: string | null }[]>([]);
  const [testAddKey, setTestAddKey] = React.useState<TestKey>("aerobic");
  const [testAddDate, setTestAddDate] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [testShowAll, setTestShowAll] = React.useState(false); // Testing tab: show every block, not just the next three
  const [testFocus, setTestFocus] = React.useState<string | null>(null); // Testing tab: block (start ISO) clicked on the strip
  const [plSub, setPlSub] = React.useState(0); // Players tab: which player section is open (block / build-up / values / data)

  const authHeader = React.useCallback(async () => `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`, [supabase]);

  // Sport — the athlete-axis "Build Target" card (StatsBomb/GPS/VALD) is hidden for basketball.
  const [isBasketball, setIsBasketball] = React.useState(false);
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/coach/player-stats/config", { headers: { Authorization: await authHeader() } });
        if (res.ok) { const j = await res.json(); setIsBasketball(String(j.sport ?? "").toLowerCase() === "basketball"); }
      } catch { /* default football */ }
    })();
  }, [authHeader]);

  // The strength coach's build-rule overrides (coach_strength_rules) — merged over the defaults so the
  // STRENGTH lane + phase-goal card reflect what the coach set. null → evidence-based defaults.
  const [coachStrengthRules, setCoachStrengthRules] = React.useState<CoachStrengthRules | null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/team/strength-rules", { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => null);
        if (alive && res.ok && j?.ok) setCoachStrengthRules((j.rules ?? {}) as CoachStrengthRules);
      } catch { /* defaults win */ }
    })();
    return () => { alive = false; };
  }, [authHeader]);

  const loadScheduledTests = React.useCallback(async () => {
    try {
      const res = await fetch("/api/coach/test-schedule", { headers: { Authorization: await authHeader() } });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) setScheduledTests(j.tests ?? []);
    } catch { /* non-fatal */ }
  }, [authHeader]);
  React.useEffect(() => { void loadScheduledTests(); }, [loadScheduledTests]);

  const scheduleTest = React.useCallback(async (test_key: TestKey, test_date: string) => {
    const res = await fetch("/api/coach/test-schedule", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
      body: JSON.stringify({ test_key, test_date }),
    });
    if (res.ok) await loadScheduledTests();
  }, [authHeader, loadScheduledTests]);

  const unscheduleTest = React.useCallback(async (id: string) => {
    const res = await fetch(`/api/coach/test-schedule?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: await authHeader() } });
    if (res.ok) await loadScheduledTests();
  }, [authHeader, loadScheduledTests]);

  // Part 3 — in-season strength MODE (microdose vs traditional); persisted in team_settings.
  const [inSeasonMode, setInSeasonMode] = React.useState<"microdose" | "traditional">("microdose");
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/team/settings`, { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => ({}));
        if (alive && (j.in_season_strength_mode === "microdose" || j.in_season_strength_mode === "traditional")) setInSeasonMode(j.in_season_strength_mode);
      } catch { /* default microdose */ }
    })();
    return () => { alive = false; };
  }, [authHeader]);
  const changeInSeasonMode = (m: "microdose" | "traditional") => {
    setInSeasonMode(m);
    (async () => { try { await fetch(`/api/team/settings`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ in_season_strength_mode: m }) }); } catch { /* best-effort persist */ } })();
  };

  const load = React.useCallback(async (preS: string, endS: string) => {
    setLoading(true); setErr(null);
    try {
      const qs = new URLSearchParams();
      if (preS) qs.set("preStart", preS);
      if (endS) qs.set("seasonEnd", endS);
      if (nextPreStartRef.current) qs.set("nextPreStart", nextPreStartRef.current);
      const res = await fetch(`/api/coach/periodization?${qs}`, { headers: { Authorization: await authHeader() } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error ?? "Failed"); return; }
      setPlan(j.plan as Plan);
      // Populate the season-window inputs from the saved overrides, once, so they reflect what's stored.
      const sw = (j as { savedWindow?: { preseasonStart?: string | null; seasonEnd?: string | null; nextPreseasonStart?: string | null; offseasonWeeks?: number | null; offseasonStart?: string | null; preseasonWeek1Mult?: number | null; preseasonSessions?: number | null; stepPct?: number | null; blockGoals?: Record<string, "accum" | "transmute" | "realize">; blockWeeks?: Record<string, number>; blockDeload?: Record<string, string> } }).savedWindow;
      if (sw && !didPopulateWindow.current) {
        didPopulateWindow.current = true;
        if (sw.preseasonStart) setPreStart(sw.preseasonStart);
        if (sw.seasonEnd) setSeasonEnd(sw.seasonEnd);
        if (sw.nextPreseasonStart) setNextPreStart(sw.nextPreseasonStart);
        if (sw.offseasonStart) setOffStart(sw.offseasonStart);
        if (sw.preseasonWeek1Mult != null && Number.isFinite(sw.preseasonWeek1Mult)) setPsWeek1Mult(Math.max(0.5, Math.min(3, sw.preseasonWeek1Mult)));
        if (sw.preseasonSessions === 3 || sw.preseasonSessions === 4 || sw.preseasonSessions === 5 || sw.preseasonSessions === 6) setPsSessions(sw.preseasonSessions);
        if (sw.stepPct != null && Number.isFinite(sw.stepPct)) setBlkStep(Math.max(0, Math.min(15, sw.stepPct)));
        if (sw.blockGoals && Object.keys(sw.blockGoals).length) setBlockGoals(sw.blockGoals);
        if (sw.blockWeeks && Object.keys(sw.blockWeeks).length) setBlockLenOv(sw.blockWeeks);
        if (sw.blockDeload && Object.keys(sw.blockDeload).length) setBlockDeloadOv(sw.blockDeload);
      }
      // The UPCOMING pre-season's saved overrides live in NEXT season's row — restore them into the separate
      // pre-season store so the Pre-season tab reads/writes that row (survives the rollover; no index clash).
      const swn = (j as { savedWindowNext?: { preseasonWeek1Mult?: number | null; preseasonSessions?: number | null; blockWeeks?: Record<string, number>; preMesoTail?: number[] | null } | null }).savedWindowNext;
      if (swn && !didPopulateNext.current) {
        didPopulateNext.current = true;
        if (swn.preseasonWeek1Mult != null && Number.isFinite(swn.preseasonWeek1Mult)) setPrePsWeek1Mult(Math.max(0.5, Math.min(3, swn.preseasonWeek1Mult)));
        if (swn.preseasonSessions === 3 || swn.preseasonSessions === 4 || swn.preseasonSessions === 5 || swn.preseasonSessions === 6) setPrePsSessions(swn.preseasonSessions);
        if (swn.blockWeeks && Object.keys(swn.blockWeeks).length) setPreBlockLenOv(swn.blockWeeks);
        if (Array.isArray(swn.preMesoTail) && swn.preMesoTail.length) setNextMesoTail(swn.preMesoTail.filter((n) => Number.isFinite(n)));
      }
      // Restore the coach's saved block length (cadence) so the meso reads back the block they set up.
      const savedCadence = Number((j as { deloadCadence?: number }).deloadCadence);
      if (savedCadence === 4 || savedCadence === 5 || savedCadence === 6) setCadence(savedCadence);
      // Read back the coach's saved day layout (week_plans) — the seed overlays it on the skeleton.
      const wp = (j as { weekPlans?: Array<{ day_date: string; day_type: string | null; focus: string | null }> }).weekPlans ?? [];
      const map: Record<string, { dayType: string; focus: string | null }> = {};
      for (const r of wp) if (r?.day_date) map[r.day_date] = { dayType: String(r.day_type ?? "").toUpperCase(), focus: r.focus ?? null };
      setSavedPlans(map);
      setSelId((prev) => prev || ((j.plan as Plan).players?.[0]?.playerId ?? ""));
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [authHeader]);

  React.useEffect(() => { load("", ""); }, [load]);

  // THE ONE FIXTURE WRITE PATH (client side) — every match add/move/remove on the planner goes through the
  // shared server route so match_schedule stays the single source of truth; then we refetch so Macro + Meso
  // re-derive. Delete is guarded: if the fixture has recorded minutes/stats the server returns 409 and we
  // ask the coach to confirm before forcing.
  const writeFixture = React.useCallback(async (date: string, op: "upsert" | "delete", opts?: { force?: boolean; opponent?: string; competition?: string; isFriendly?: boolean }): Promise<boolean> => {
    const res = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ fixture: { op, date, force: opts?.force ?? false, opponent: opts?.opponent, competition: opts?.competition, isFriendly: opts?.isFriendly } }) });
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

  // Declared team breaks (frí) — the SAME source Week Setup locks on; the macro reads them so a real
  // break becomes its own re-load block (and a break day is a rest day in the block map).
  const [teamBreaks, setTeamBreaks] = React.useState<Array<{ start_date: string; end_date: string }>>([]);

  // MACRO IS THE CONTROL — the meso blocks are recomputed from the season span + the chosen deload cadence
  // (= block length), so changing the cadence (or, via re-fetch, the anchors) re-flows the whole plan.
  const mesoBlocks: MesoBlock[] = React.useMemo(() => {
    if (!plan || plan.phases.length === 0) return (plan?.blocks as unknown as MesoBlock[]) ?? [];
    const s = plan.phases[0].start, e = plan.phases[plan.phases.length - 1].end;
    const curve = (plan.loadCurve ?? []).map((w) => ({ weekStart: w.weekStart, load: w.load, readiness: null }));
    // TMr divides the team-total weekly loadCurve by the team-total match load (same scale → ~2–5×).
    // competitiveStart lets the builder make each in-season block fixture-aware (compete vs re-load).
    const compStart = plan.phases.find((p) => p.key === "competitive")?.start ?? null;
    const offPhaseStart = plan.phases.find((p) => p.key === "offseason")?.start ?? null;
    return buildMesoBlocks(s, e, curve, cadence, plan.matchLoadTeam ?? plan.matchLoad, plan.fixtures ?? [], compStart, teamBreaks, offPhaseStart, offStart || null, { blockWeeks: blockLenOv, deloadByStart: blockDeloadOv });
  }, [plan, cadence, teamBreaks, offStart, blockLenOv, blockDeloadOv]);

  // The block the coach is editing (contains blkStart), and its EFFECTIVE goal = coach override for that
  // block ?? the engine's recommended goalKey. `deload` goalKey (holiday/unload blocks) maps to accum —
  // the coach never picks deload (it's a week, not a goal). This single value drives the computed block.
  const activeBlock = React.useMemo(() => mesoBlocks.find((b) => b.start <= blkStart && blkStart < b.end) ?? null, [mesoBlocks, blkStart]);
  const activeBlockStart = activeBlock?.start ?? mondayOf(blkStart);
  // Effective calendar length = the selected block's OWN length (clamped to the horizon), so the micro
  // view renders exactly the meso block and stops at its end — a competitive block halts at the season
  // boundary instead of bleeding the in-season ramp into the off-season. Falls back to the cadence.
  const blkWeeksEff = React.useMemo(() => {
    const blkMon = mondayOf(blkStart);
    const toEnd = activeBlock ? Math.round((Date.parse(`${activeBlock.end}T00:00:00Z`) - Date.parse(`${blkMon}T00:00:00Z`)) / (7 * 86_400_000)) : blkWeeks;
    return Math.max(1, Math.min(MESO_HORIZON, toEnd > 0 ? toEnd : blkWeeks));
  }, [activeBlock, blkStart, blkWeeks]);
  const engineGoal: "accum" | "transmute" | "realize" = activeBlock?.goalKey && activeBlock.goalKey !== "deload" ? activeBlock.goalKey : "accum";
  const effectiveGoal: "accum" | "transmute" | "realize" = blockGoals[activeBlockStart] ?? engineGoal;

  // The cadence is the DEFAULT block length; the calendar renders the SELECTED block's own length
  // (`blkWeeksEff`, clamped to the block end), so a competitive block stops at the season boundary and
  // the off-season is viewed as its own block — not one window split across the phase boundary.
  React.useEffect(() => { setBlkWeeks(cadence); }, [cadence]);

  // Open the planner on the CURRENT macro block — only when the plan (re)loads, never on a cadence
  // change. (mesoBlocks re-segments with the cadence for the season MAP, but the block the coach is
  // editing stays anchored on blkStart.)
  React.useEffect(() => {
    if (mesoBlocks.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const cur = mesoBlocks.find((b) => b.start <= today && today < b.end) ?? mesoBlocks[0];
    if (cur) setBlkStart(cur.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const overridesPayload = React.useCallback((c: number) => ({
    preseasonStart: preStart || undefined, seasonEnd: seasonEnd || undefined, deloadCadence: c,
    nextPreseasonStart: nextPreStart || undefined,
    offseasonStart: offStart || undefined,
    // Meso/pre-season tuning — persisted so the hub + the live Weekly Load "plan" target read the coach's values.
    preseasonWeek1Mult: psWeek1Mult, preseasonSessions: psSessions, stepPct: blkStep,
  }), [preStart, seasonEnd, nextPreStart, offStart, psWeek1Mult, psSessions, blkStep]);

  // Fire-and-forget (debounced) persist of a single overrides key — used by the meso/pre-season tuning
  // inputs so the coach's choice sticks across visits and reaches the server-side plan target.
  const tuningTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (tuningTimer.current) clearTimeout(tuningTimer.current); }, []);
  const persistOverridePatch = React.useCallback((patch: Record<string, number>, year?: number) => {
    if (!plan) return;
    const yr = year ?? plan.seasonYear;
    if (tuningTimer.current) clearTimeout(tuningTimer.current);
    tuningTimer.current = setTimeout(async () => {
      try {
        await fetch("/api/coach/periodization", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
          body: JSON.stringify({ seasonYear: yr, overrides: patch }),
        });
      } catch { /* best-effort persist */ }
    }, 600);
  }, [plan, authHeader]);

  // Change the block length AND persist it immediately, so it reads back next visit without
  // needing a manual Save. Fire-and-forget; the value is the source for the meso re-flow.
  const changeCadence = (c: 4 | 5 | 6) => {
    setCadence(c);
    if (!plan) return;
    (async () => {
      try {
        await fetch("/api/coach/periodization", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
          body: JSON.stringify({ seasonYear: plan.seasonYear, overrides: overridesPayload(c) }),
        });
      } catch { /* best-effort persist */ }
    })();
  };

  async function savePlan() {
    if (!plan) return;
    setSaved(false);
    const res = await fetch("/api/coach/periodization", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
      body: JSON.stringify({ seasonYear: plan.seasonYear, overrides: overridesPayload(cadence),
        blocks: mesoBlocks.map((b) => ({ block_index: b.index, phase: b.phase.en, goal: b.goal.en, start_date: b.start, end_date: b.end, is_deload: b.isDeload, targets: { acwr: b.acwr, volumeTargetPct: b.volumeTargetPct } })) }),
    });
    setSaved(res.ok);
  }

  async function addFriendly() {
    if (!friendly) return;
    // Tag a friendly (is_friendly) so detectSeasonPhases does NOT read it as the first competitive fixture.
    const ok = await writeFixture(friendly, "upsert", { isFriendly: friendlyKind === "friendly" });
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
    return buildMesoPlan({ startDate: blkStart, numWeeks: blkWeeks, sessionsPerWeek: blkSessions, baseline: blkPos.avg as unknown as TeamAverages, mdShape: plan.mdShape, fixtures: plan.fixtures ?? [], matchUnitLoad: blkMatchUnit, baseOverloadPct: blkBase, stepPct: blkStep, goal: BLK_GOALS[effectiveGoal] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkPos, blkStart, blkWeeks, blkSessions, blkBase, blkStep, effectiveGoal, blkMatchUnit]);

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

  // Team breaks are fetched here into the teamBreaks state (declared above the macro memo, which reads them).
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = (await supabase.auth.getSession()).data?.session?.access_token;
        if (!token || !alive) return;
        const res = await fetch(`/api/coach/team/breaks`, { headers: { Authorization: `Bearer ${token}` } });
        const json = res.ok ? await res.json() : null;
        if (alive && json?.ok) setTeamBreaks(((json.breaks ?? []) as Array<{ start_date: string; end_date: string }>).map((b) => ({ start_date: b.start_date, end_date: b.end_date })));
      } catch { /* breaks optional */ }
    })();
    return () => { alive = false; };
  }, [supabase]);

  // Seed a FULL 6-week skeleton (MESO_HORIZON) from the auto layout + the coach's saved day edits +
  // real fixtures whenever the block window or scope changes. Always seeding 6 weeks (regardless of the
  // current cadence) is what makes a cadence switch a pure trim: the grid renders only `blkWeeks` of
  // this skeleton, so 6→4→5 shows the same first weeks and never reshuffles. NB: NOT keyed on blkWeeks
  // — a cadence change must not re-seed (that would wipe unsaved edits); it only changes how many weeks
  // render.
  React.useEffect(() => {
    if (!plan) return;
    const start = mondayOf(blkStart);
    const auto = buildCalendarBlock({ unit: blkUnit, startDate: blkStart, numWeeks: MESO_HORIZON, scopeName: isPlayerScope ? player!.name : "__team__", baseOverloadPct: blkBase, stepPct: blkStep });
    const sk: Record<string, DayState> = {};
    const ov: Record<string, CalType> = {};
    // FIXTURES ARE THE ONLY SOURCE OF MATCHES. The auto layout seeds only session/off — it never
    // fabricates a Sat/Sun "match". A phantom match on a fixture-less week fights the coach (removing
    // it just re-appears on the next re-seed) and contradicts fixtures-as-source. Real fixtures below
    // are the ONLY thing that turns a day into a match; the coach adds one by clicking a day (which
    // writes a real fixture).
    auto.weeks.flatMap((w) => w.days).forEach((d, i) => { sk[isoAdd(start, i)] = d.type === "rest" ? "off" : "session"; });
    // READ BACK the coach's saved day layout (week_plans): a saved OFF stays off, a saved training day
    // keeps its stimulus type (focus). This is the "meso reads the day changes back too" ask — the block
    // the coach set up returns as they left it (not the raw auto layout) on the next visit.
    for (let k = 0; k < MESO_HORIZON * 7; k++) {
      const iso = isoAdd(start, k);
      const sp = savedPlans[iso];
      if (!sp) continue;
      if (sp.dayType === "OFF") sk[iso] = "off";
      else if (sp.dayType === "TRAIN" || sp.dayType === "RECOVERY") {
        sk[iso] = "session";
        const ct = sp.focus ? caltypeFromFocus(sp.focus) : undefined;
        if (ct) ov[iso] = ct;
      }
    }
    const startMs = Date.parse(start), endMs = startMs + MESO_HORIZON * 7 * 86_400_000;
    const fxInWin = (plan.fixtures ?? []).map((f) => Date.parse(f)).filter((ms) => ms >= startMs && ms < endMs);
    for (const ms of fxInWin) { const iso = isoAdd(start, Math.round((ms - startMs) / 86_400_000)); sk[iso] = "match"; delete ov[iso]; }
    // Declared team breaks own their days — force them OFF (frí), after fixtures so a break day
    // can't be left as a session. Same inclusive rule as Week Setup (start <= day <= end).
    if (teamBreaks.length) {
      for (let k = 0; k < MESO_HORIZON * 7; k++) {
        const iso = isoAdd(start, k);
        if (teamBreaks.some((b) => b.start_date <= iso && iso <= b.end_date)) { sk[iso] = "off"; delete ov[iso]; }
      }
    }
    setBlkSkeleton(sk); setTypeOverrides(ov); setDayModal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkStart, blkScope, selId, teamBreaks, savedPlans]);

  // The coach's skeleton, split into the sets buildCalendarBlock consumes — shared by the team block and
  // every per-player block (so the Players tab is literally "computed from the Meso Cycle").
  const skeletonSets = React.useMemo(() => {
    const matchDates: string[] = [], offDays: string[] = [], onDays: string[] = [];
    for (const [k, v] of Object.entries(blkSkeleton)) { if (v === "match") matchDates.push(k); else if (v === "off") offDays.push(k); else onDays.push(k); }
    return { matchDates, offDays, onDays };
  }, [blkSkeleton]);

  const calBlock = React.useMemo(() => {
    if (!plan || Object.keys(blkSkeleton).length === 0) return null;
    const offPhaseStart = plan.phases.find((p) => p.key === "offseason")?.start ?? null;
    return buildCalendarBlock({ unit: blkUnit, startDate: blkStart, numWeeks: blkWeeksEff, scopeName: isPlayerScope ? player!.name : "__team__", scopePos: isPlayerScope ? player!.position : null, phase: blkPhaseLabel, baseOverloadPct: blkBase, stepPct: blkStep, ...skeletonSets, typeOverrides, allFixtures: plan.fixtures ?? [], offseasonStart: offPhaseStart ?? undefined, goal: effectiveGoal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkSkeleton, skeletonSets, typeOverrides, blkStart, blkWeeksEff, blkBase, blkStep, blkScope, selId, blkUnit, effectiveGoal]);

  // ── WEAKNESS-STEERED BUILD-UP ─────────────────────────────────────────────────────────────────────
  // Read (never recompute) the selected player's Total Player Analysis — his ATHLETE-axis weaknesses +
  // the "how to improve" levers + the VALD training focus — so the pre-season build-up biases the ramp
  // toward the qualities he's behind on. Performance/planning only; never touches the readiness colour.
  type SteerData = { weaknesses: WeaknessInput[]; levers: Record<string, { en: string; is: string; cite?: string }>; valdPlan: ValdTrainingPlan | null; hasAthlete: boolean };
  const [steerData, setSteerData] = React.useState<SteerData | null>(null);
  // Part 2 — per-player PRE-SEASON strength emphasis (from his strength/power/body-comp/deficit data).
  type DsiTierClient = "ballistic" | "concurrent" | "max_strength" | "insufficient";
  type DsiEcho = { ratio: number; tier: DsiTierClient; recommendation: string } | null;
  type DsiReadClient = { dsi: DsiEcho; coverage: "full" | "cmj_only" | "imtp_only" | "none"; confidence: "high" | "moderate" | "low"; basis?: "squad" | "absolute"; reason: Bi };
  type PreEmphasisRead = { emphasis: string; why: Bi; secondary: string | null; confidence: "high" | "moderate" | "low"; needsBodyComp: boolean; cite: string; driver?: "dsi" | "percentile"; dsi?: DsiEcho; dsiRead?: DsiReadClient };
  const [preEmphasis, setPreEmphasis] = React.useState<PreEmphasisRead | null>(null);
  React.useEffect(() => {
    if (tab !== "players" || !selId) { setPreEmphasis(null); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/coach/strength-periodization?playerId=${encodeURIComponent(selId)}`, { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => ({}));
        if (alive) setPreEmphasis(res.ok && j.ok ? ({ ...(j.read as PreEmphasisRead), dsiRead: j.dsi as DsiReadClient | undefined }) : null);
      } catch { if (alive) setPreEmphasis(null); }
    })();
    return () => { alive = false; };
  }, [tab, selId, authHeader]);
  const [steerNeutral, setSteerNeutral] = React.useState(false);
  React.useEffect(() => {
    // The athlete-axis "Build Target" steer reads the footballer+athlete profile (StatsBomb/GPS/VALD) and
    // links to Total Player Analysis (hidden for basketball) — skip it entirely for a basketball team.
    if (tab !== "players" || !selId || isBasketball) { setSteerData(null); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/coach/total-player-analysis?playerId=${encodeURIComponent(selId)}&lang=${is ? "IS" : "EN"}`, { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => ({})) as { ok?: boolean; total?: { athlete?: { weaknesses?: QualityRead[]; coverage?: { qualitiesWithData: number } } | null }; development?: Array<{ axis: string; key: string; lever: { en: string; is: string; cite?: string } }>; vald?: ValdSlice | null };
        if (!alive || !res.ok || !j.ok) { if (alive) setSteerData(null); return; }
        const ath = j.total?.athlete ?? null;
        const weaknesses: WeaknessInput[] = (ath?.weaknesses ?? []).map((q) => ({ id: q.id, percentile: q.positionPercentile, confidence: q.confidence, benchmark: q.benchmark, poolSize: q.poolSize }));
        const levers: SteerData["levers"] = {};
        for (const d of j.development ?? []) if (d.axis === "athlete") levers[d.key] = d.lever;
        const valdPlan = valdHasData(j.vald) ? buildValdTrainingPlan(j.vald, is) : null;
        setSteerData({ weaknesses, levers, valdPlan, hasAthlete: (ath?.coverage?.qualitiesWithData ?? 0) > 0 });
      } catch { if (alive) setSteerData(null); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selId, is, isBasketball]);
  const steer: BuildUpSteer | null = React.useMemo(() => (steerData && steerData.weaknesses.length ? computeBuildUpSteer(steerData.weaknesses) : null), [steerData]);
  const steerActive = !!steer && !steerNeutral && steer.hasHard;
  // Translate the axis boosts → the build-up card's per-KPI weekly-rate emphasis (same LoadKpi keys the
  // progressive-overload engine ramps). hsr axis → running KPIs; mech axis → the Acc/Dec effort KPIs.
  const poEmphasis = React.useMemo(() => {
    if (!steerActive || !steer) return undefined;
    const e: Record<string, number> = {};
    if (steer.hsrBoost > 1) for (const k of ["hsr", "sprint", "ima"]) e[k] = steer.hsrBoost;
    if (steer.mechBoost > 1) for (const k of ["accel", "decel", "efforts", "imaAccel", "imaDecel", "imaCod"]) e[k] = steer.mechBoost;
    return Object.keys(e).length ? e : undefined;
  }, [steerActive, steer]);

  // Build ONE player's individualised block — his own match unit + position tilt + VALD ceiling + minutes
  // trim, plus the optional weakness-steer bias. Reused for the on-screen selected player AND every player
  // in the PDF export (so "computed from the Meso Cycle" holds for the whole squad).
  const computePlayerBlock = React.useCallback((pl: Player, steerArg: { active: boolean; steer: BuildUpSteer | null }) => {
    if (!plan || Object.keys(blkSkeleton).length === 0) return null;
    // Canonical per-player block builder — shared with the player app's read-only
    // "my build-up" view so the two can never drift (src/lib/.../playerBlock.ts).
    const offPhaseStart = plan.phases.find((p) => p.key === "offseason")?.start ?? undefined;
    return buildPlayerBlock(plan, pl, {
      blkStart, blkWeeks: blkWeeksEff, blkBase, blkStep, phaseLabel: blkPhaseLabel, skeletonSets, typeOverrides, steer: steerArg, offseasonStart: offPhaseStart, goal: effectiveGoal,
    });
  }, [plan, blkSkeleton, skeletonSets, typeOverrides, blkStart, blkWeeksEff, blkBase, blkStep, blkPhaseLabel, effectiveGoal]);

  // The SELECTED player's block (weakness-steer applied unless the coach picks a neutral ramp).
  const playerBlock = React.useMemo(
    () => (player ? computePlayerBlock(player, { active: steerActive, steer }) : null),
    [player, computePlayerBlock, steerActive, steer],
  );

  // Build-up TRACKING block — the CURRENT build-up (active Meso block, past→now)
  // on the steer-independent neutral ramp. Retrospective adherence asks "did
  // actual load follow the planned MAGNITUDE ramp?", so it tracks the block
  // that's underway (not the coach's forward-planning window) and ignores the
  // ±15% weakness-emphasis steer. This is byte-for-byte what the player app
  // computes (pickActiveBlock + non-steered buildPlayerBlock), so coach and
  // player see the identical read.
  const trackingBlock = React.useMemo(() => {
    if (!player || !plan) return null;
    const win = pickActiveBlock(plan, new Date().toISOString().slice(0, 10));
    if (!win) return null;
    // Match the coach's chosen goal for that block so the retrospective ramp the player is measured
    // against is the same one the coach planned (override ?? engine goalKey; deload → accum).
    const wb = mesoBlocks.find((b) => b.start === win.blkStart);
    const wGoal: "accum" | "transmute" | "realize" = blockGoals[win.blkStart] ?? (wb?.goalKey && wb.goalKey !== "deload" ? wb.goalKey : "accum");
    return buildPlayerBlock(plan, player, { blkStart: win.blkStart, blkWeeks: win.blkWeeks, phaseLabel: win.phaseLabel, matchDates: win.matchDates, goal: wGoal });
  }, [player, plan, mesoBlocks, blockGoals]);

  async function exportPlayerBlock() {
    if (!playerBlock || !plan) return;
    await downloadPeriodizationBlockPdf({ teamName: plan.teamName, block: playerBlock.block }, is ? "IS" : "EN");
  }

  // ── AUTO-SAVE the block skeleton to Week Setup on every edit ─────────────────────────────────────
  // Each day click persists to week_plans (the day-truth source) through the SAME server path as the
  // manual "Apply" button, debounced so rapid clicks coalesce into one write. A ref holds the latest
  // computed block so the debounced save sees the post-edit layout (calBlock recomputes after the click).
  const buildApplyPayload = React.useCallback((block: CalendarBlock) => block.weeks.map((w) => ({
    week_start: w.weekStart,
    system_key: w.isDeload ? "RECOVERY" : effectiveGoal === "accum" ? "STRENGTH" : "POWER",
    intensity_target: w.isDeload ? 3 : Math.max(3, Math.min(9, Math.round(5 + (w.mult - 1) * 12))),
    days: w.days.map((d, i) => ({
      day_index: i + 1, day_date: isoAdd(w.weekStart, i),
      day_type: d.type === "match" ? "GAME" : d.type === "rest" ? "OFF" : "TRAIN",
      // focus is free text → carry the MD tag (+ stimulus for training days), e.g. "MD-5 Mechanical".
      // Rest days still carry their MD tag ("MD+2") so an off day reads as MD+2, not a blank OFF.
      // Build Session reads the MD from here and the stimulus from the same string.
      focus: d.type === "match" ? null : d.type === "rest" ? (d.md || null) : [d.md, d.label.en].filter(Boolean).join(" "),
      // day_intent has a CHECK constraint (FORCE/NEURAL_VELOCITY/POLISH_CALM/ACTIVATION/GAME/OFF|null)
      // — it CANNOT hold an MD tag. Use the valid enum for match/off; null for training days.
      day_intent: d.type === "match" ? "GAME" : d.type === "rest" ? "OFF" : null,
    })),
  })), [effectiveGoal]);

  const calBlockRef = React.useRef(calBlock);
  React.useEffect(() => { calBlockRef.current = calBlock; }, [calBlock]);
  const autoSaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSave, setAutoSave] = React.useState<null | "saving" | "saved" | "err">(null);
  React.useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);
  const scheduleAutoSave = React.useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const block = calBlockRef.current;
      if (!block) return;
      setAutoSave("saving");
      try {
        const res = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ applyWeekSetup: buildApplyPayload(block) }) });
        setAutoSave(res.ok ? "saved" : "err");
      } catch { setAutoSave("err"); }
    }, 700);
  }, [authHeader, buildApplyPayload]);

  // Set the SELECTED block's goal (chips / dropdown / "Use recommended" / the roadmap card all call this).
  // Persists the per-block override to season_plans.overrides.blockGoals (the whole map is sent so the
  // server's shallow merge is safe) AND re-applies the recomputed block to week_plans via auto-save, so
  // Meso + Micro + PDF pick up the new goal. Navigating blocks does NOT auto-save — only an actual choice.
  // Set a specific block's goal (keyed by its start ISO) — used by the Macro season-map inline editor and
  // by the active-block picker. Re-flows Meso (auto-save) + persists the whole blockGoals map.
  const setBlockGoalFor = React.useCallback((blockStart: string, g: "accum" | "transmute" | "realize") => {
    const next = { ...blockGoals, [blockStart]: g };
    setBlockGoals(next);
    scheduleAutoSave();
    if (!plan) return;
    (async () => {
      try {
        await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ seasonYear: plan.seasonYear, overrides: { ...overridesPayload(cadence), blockGoals: next } }) });
      } catch { /* best-effort persist */ }
    })();
  }, [blockGoals, plan, cadence, overridesPayload, authHeader, scheduleAutoSave]);
  const setBlockGoal = React.useCallback((g: "accum" | "transmute" | "realize") => setBlockGoalFor(activeBlockStart, g), [setBlockGoalFor, activeBlockStart]);

  // Override a block's LENGTH (weeks) or pin its DELOAD week. Keyed by the block start ISO; the whole map
  // is sent so the server's shallow merge replaces it cleanly. Re-applies week_plans (auto-save) because
  // the block boundaries / deload move. null clears the override (back to auto).
  const persistBlockMap = React.useCallback((key: "blockWeeks" | "blockDeload", map: Record<string, number | string>, year?: number) => {
    scheduleAutoSave();
    if (!plan) return;
    const yr = year ?? plan.seasonYear;
    (async () => {
      try {
        await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ seasonYear: yr, overrides: { [key]: map } }) });
      } catch { /* best-effort persist */ }
    })();
  }, [plan, authHeader, scheduleAutoSave]);
  const setBlockLength = React.useCallback((blockStart: string, weeks: number | null) => {
    const next = { ...blockLenOv }; if (weeks == null) delete next[blockStart]; else next[blockStart] = weeks;
    setBlockLenOv(next); persistBlockMap("blockWeeks", next);
  }, [blockLenOv, persistBlockMap]);
  const setBlockDeload = React.useCallback((blockStart: string, weekMon: string | null) => {
    const next = { ...blockDeloadOv }; if (weekMon == null) delete next[blockStart]; else next[blockStart] = weekMon;
    setBlockDeloadOv(next); persistBlockMap("blockDeload", next);
  }, [blockDeloadOv, persistBlockMap]);

  // ── Upcoming-pre-season (next-season) scoping ──────────────────────────────────────────────────────
  // When a distinct NEXT season exists (the coach has entered next year's first competitive game), the
  // Pre-season tab + the off-season ramp plan THAT season and persist to its own row (plan.nextSeasonYear).
  // In-season (no distinct next year) `upcomingYear` is false and everything falls back to the current store.
  const upcomingYear = plan != null && plan.nextSeasonYear != null && plan.nextSeasonYear !== plan.seasonYear;
  const preYear = upcomingYear ? plan!.nextSeasonYear! : (plan?.seasonYear ?? 0);
  const psW1 = upcomingYear ? prePsWeek1Mult : psWeek1Mult;   // week-1 ×match for the upcoming pre-season
  const psSess = upcomingYear ? prePsSessions : psSessions;   // sessions/wk for the upcoming pre-season
  const lenOv = upcomingYear ? preBlockLenOv : blockLenOv;    // index-keyed block lengths for the upcoming pre-season
  const setPreLen = (idxKey: string, weeks: number | null) => {
    if (!upcomingYear) { setBlockLength(idxKey, weeks); return; } // in-season → current-year store (unchanged)
    const next = { ...preBlockLenOv }; if (weeks == null) delete next[idxKey]; else next[idxKey] = weeks;
    setPreBlockLenOv(next); persistBlockMap("blockWeeks", next, preYear);
  };
  const setPreW1 = (v: number) => {
    if (upcomingYear) { setPrePsWeek1Mult(v); persistOverridePatch({ preseasonWeek1Mult: v }, preYear); }
    else { setPsWeek1Mult(v); persistOverridePatch({ preseasonWeek1Mult: v }); }
  };
  const setPreSess = (v: number) => {
    if (upcomingYear) { setPrePsSessions(v); persistOverridePatch({ preseasonSessions: v }, preYear); }
    else { setPsSessions(v); persistOverridePatch({ preseasonSessions: v }); }
  };
  // Persist the upcoming pre-season's game-anchored meso tail (backwards editor). Derives the index-keyed
  // blockWeeks so the week-card grouping + the ramp read the same boundaries, and writes BOTH to the
  // next-year row (which holds pre-season blocks only, so the indices never collide with competitive ones).
  const persistNextMesoTail = React.useCallback((tail: number[], windowWeeks: number, cad: number, year: number) => {
    const { lens } = preseasonMeso(windowWeeks, tail, cad);
    const bw = lensToBlockWeeks(lens);
    setNextMesoTail(tail); setPreBlockLenOv(bw);
    (async () => { try { await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ seasonYear: year, overrides: { preMesoTail: tail, blockWeeks: bw } }) }); } catch { /* best-effort persist */ } })();
  }, [authHeader]);

  // Day-type editor: MATCHES ARE READ-ONLY HERE. A match belongs to Fixtures (match_schedule)
  // — the meso only reads it (isFixtureDay). Toggling a day changes the TRAINING type (Off /
  // session / stimulus); it never creates or deletes a match. So a fixture day stays a match and
  // is not editable here, and a non-fixture day can never be turned into a match (which used to
  // silently write a fixture + trigger a refetch). Manage games on the Fixtures page.
  const isFixtureDay = (iso: string) => (plan?.fixtures ?? []).includes(iso);
  const setDayType = (iso: string, t: CalType | "match") => {
    setWsApplied(null);
    if (t === "match" || isFixtureDay(iso)) return; // matches come from Fixtures only
    const local: DayState = t === "rest" ? "off" : "session";
    setBlkSkeleton((s) => ({ ...s, [iso]: local }));
    setTypeOverrides((o) => { const n = { ...o }; if (t === "rest") delete n[iso]; else n[iso] = t; return n; });
    scheduleAutoSave(); // persist the edit (debounced) — every click saves
  };

  const [wsApplied, setWsApplied] = React.useState<null | "ok" | "err">(null);
  const [wsBusy, setWsBusy] = React.useState(false);
  const cycleDay = (iso: string) => {
    setWsApplied(null);
    if (isFixtureDay(iso)) return; // a match day is owned by Fixtures — don't toggle it here
    const cur = blkSkeleton[iso] ?? "off";
    const next: DayState = cur === "off" ? "session" : "off"; // Off <-> Session only; never Match
    setBlkSkeleton((s) => ({ ...s, [iso]: next }));
    // Turning a day OFF must also clear any per-day stimulus override from the day editor —
    // otherwise the computed grid re-applies that override AFTER the off-forcing and the day
    // never drops out. (setDayType clears it the same way for an explicit "rest".)
    if (next === "off") setTypeOverrides((o) => { if (!(iso in o)) return o; const n = { ...o }; delete n[iso]; return n; });
    scheduleAutoSave(); // persist the edit (debounced) — every click saves
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
  // Clicks already auto-save (scheduleAutoSave); this button is the explicit "save now / force" path.
  async function applyToWeekSetup() {
    if (!calBlock) return;
    setWsBusy(true); setWsApplied(null);
    try {
      const res = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ applyWeekSetup: buildApplyPayload(calBlock) }) });
      setWsApplied(res.ok ? "ok" : "err");
    } catch { setWsApplied("err"); }
    setWsBusy(false);
  }

  // The whole hub → one PDF (all four tabs' data). This is the primary export at the top of the page.
  async function exportAll() {
    if (!plan) return;
    const baselines = [plan.teamBaseline, ...plan.positionBaselines].filter((b) => b && b.avg.sessions > 0).map((b) => ({ label: b.label, players: b.avg.players, distanceM: b.avg.distanceM, hsrM: b.avg.hsrM, maxKmh: b.avg.maxKmh, playerLoad: b.avg.playerLoad, accel: b.avg.accel, decel: b.avg.decel, isTeam: b.key === -1 }));
    // Per-player weekly PL target = that player's match unit (the TARGET/ceiling) × the in-season weekly
    // multiple — the planned weekly volume each player ramps TO from their current baseline (MAS = engine).
    const plWkMult = weeklyTrainingMultiple(standardTrainingDays(1));
    const players = plan.players.map((p) => ({ name: p.name, position: p.position, masKmh: p.masKmh, matchUnitLoad: p.matchUnit.load.typical, matchUnitHsr: p.matchUnit.hsr.typical, matchUnitDistance: p.matchUnit.distance.typical, weeklyPlTarget: p.matchUnit.load.typical != null ? Math.round(p.matchUnit.load.typical * plWkMult) : null, baselinePl: p.recentBaseline?.playerLoad ?? null, baselineHsr: p.recentBaseline?.hsrM ?? null, baselineSessions: p.recentBaseline?.sessions ?? 0, nNearFull: p.matchUnit.nNearFull, matchUnitConf: p.matchUnit.confidence, valdCap: p.vald.capPct, gaps: p.gaps.filter((g) => g.severity !== "ok").length }));
    const blocks = mesoBlocks.map((b) => ({ phase: b.phase, goal: b.goal, goalKey: b.goalKey, start: b.start, end: b.end, weeks: b.weeks, isDeload: b.isDeload, deloadWeekStart: b.deloadWeekStart, tmr: b.tmr, volumeTargetPct: b.volumeTargetPct, flag: b.flag }));
    // The individualised calendar block(s) — one clean page per player. The coach picks the set (Selected /
    // All / custom); eligible = has a match unit AND is not a GK (GKs use a separate model, kept in the
    // table). The note states the VALD adjustment DIRECTION unambiguously + the match-unit n & confidence.
    const isGk = (pos: string | null) => /GK|MARK|KEEP/i.test(pos ?? "");
    const eligible = plan.players.filter((p) => p.matchUnit.load.typical != null && !isGk(p.position));
    const chosen = pdfPlayerMode === "all" ? eligible
      : pdfPlayerMode === "custom" ? eligible.filter((p) => pdfCustom.has(p.playerId))
      : eligible.filter((p) => p.playerId === selId);
    const confIs = (c: string) => (c === "high" ? "há" : c === "medium" ? "miðlungs" : "lítil");
    const noteFor = (pb: NonNullable<ReturnType<typeof computePlayerBlock>>): Bi => {
      const valdEn = pb.maxMult >= 1.4 ? "no VALD restriction (ceiling ×1.40)" : pb.maxMult >= 1.15 ? "VALD-capped to ×1.15" : "VALD maintenance (×1.00)";
      const valdIs = pb.maxMult >= 1.4 ? "engin VALD-takmörkun (þak ×1,40)" : pb.maxMult >= 1.15 ? "VALD-þak ×1,15" : "VALD viðhald (×1,00)";
      const unitEn = pb.useOwn ? `own match unit (n=${pb.nNearFull}, ${pb.confidence} confidence)` : `squad baseline — too few full matches (n=${pb.nNearFull})`;
      const unitIs = pb.useOwn ? `eigið leikviðmið (n=${pb.nNearFull}, ${confIs(pb.confidence)} vissa)` : `liðs-grunnlína — of fáir heilir leikir (n=${pb.nNearFull})`;
      const minEn = pb.loadScale < 1 ? `minutes trim ×${pb.loadScale.toFixed(2)}${pb.avgMin != null ? ` (~${pb.avgMin}′/match)` : ""}` : "no minutes trim";
      const minIs = pb.loadScale < 1 ? `mínútu-trim ×${pb.loadScale.toFixed(2)}${pb.avgMin != null ? ` (~${pb.avgMin}′/leik)` : ""}` : "engin mínútu-trim";
      return { en: `${unitEn}; ${valdEn}; ${minEn}.`, is: `${unitIs}; ${valdIs}; ${minIs}.` };
    };
    const playerBlocks: Array<{ name: string; position: string | null; note: Bi; block: CalendarBlock }> = [];
    for (const pl of chosen) {
      const pb = computePlayerBlock(pl, { active: pl.playerId === selId ? steerActive : false, steer: pl.playerId === selId ? steer : null });
      if (pb) playerBlocks.push({ name: pl.name, position: pl.position, note: noteFor(pb), block: pb.block });
    }
    const tb = plan.teamBaseline?.avg;
    const teamUnit = tb ? { dist: tb.matchDistanceM, hsr: tb.matchHsrM, load: tb.matchPlayerLoad, accdec: ((tb.matchAccel ?? 0) + (tb.matchDecel ?? 0)) || null,
      accHiEff: tb.matchAccelHiEff, decHiEff: tb.matchDecelHiEff, stride: tb.matchStrideHi,
      dirFwd: tb.direction?.forward ?? null, dirBack: tb.direction?.backward ?? null, dirLat: tb.direction?.lateral ?? null,
      rhie: tb.rhieBouts, symmetry: tb.runSymmetry, metPower: tb.metabolicPower } : null;
    // Pre-season start + ramp (team) — the controlled re-entry the pack builds from. Uses the coach's
    // current week-1 multiple / sessions from the Players tab, so the PDF matches what they set.
    let preseasonStart: Parameters<typeof downloadPeriodizationHubPdf>[0]["preseasonStart"] = null;
    let preRamp: PreseasonWeekTarget[] = [];
    const upPre = upcomingPreseason(plan.phases, new Date().toISOString().slice(0, 10), plan.nextFirstFixture);
    const preStart = upPre?.start ?? null;
    if (upPre) {
      const preWeeks = upPre.weeks;
      const preAnchor: LoadAnchor = plan.matchLoad != null ? "match_this_season" : plan.tier.loadSource === "srpe" ? "srpe_only" : "normative";
      const preTka = teamKpiAvg(plan.players);
      preRamp = preseasonStartRamp({ matchTypicalLoad: preTka.totalPlayerLoad ?? plan.matchLoad, matchKpiAvg: preTka, matchSrpeAu: plan.matchSrpe, sessionsPerWeek: psSess, preseasonWeeks: preWeeks, week1MatchMultiple: psW1, anchor: preAnchor });
      if (preRamp.length) {
        const anchorLabel = preAnchor === "match_this_season" ? (is ? "leikir í ár" : "this season's matches") : preAnchor === "srpe_only" ? (is ? "sRPE eingöngu" : "sRPE only") : (is ? "stöðu-viðmið" : "positional norm");
        const conf = preRamp[0].confidence === "high" ? (is ? "há" : "high") : preRamp[0].confidence === "moderate" ? (is ? "miðlungs" : "moderate") : (is ? "lítil" : "low");
        preseasonStart = {
          anchor: anchorLabel, confidence: conf,
          weeks: preRamp.map((w) => ({ weekIndex: w.weekIndex, multiple: w.multipleOfMatch, weeklyLoad: w.weeklyLoadTarget, perSession: w.perSessionLoad, srpe: w.sRpeAuTarget })),
          week1Kpi: (Object.keys(preRamp[0].byKpi) as WeeklyLoadMetricKey[]).filter((k) => k !== "totalPlayerLoad").map((k) => { const mv = preTka[k]; return { label: { en: WEEKLY_LOAD_LABELS[k].en, is: WEEKLY_LOAD_LABELS[k].is }, value: preRamp[0].byKpi[k]!, unit: WEEKLY_LOAD_LABELS[k].unit, multiple: mv != null && mv > 0 ? Math.round((preRamp[0].byKpi[k]! / mv) * 100) / 100 : null }; }),
        };
      }
    }
    // MD-relative demand profile (whole squad) for the PDF — the same split the Demands tab shows, printed.
    const seasonPl = tb?.playerLoad ?? null;
    const mdRow = (bk: MdDemandBucket) => { const a = bk.avg; return {
      label: bk.label, sessions: a.sessions, distanceM: a.distanceM, hsrM: a.hsrM, playerLoad: a.playerLoad, accel: a.accel, decel: a.decel,
      relPl: a.playerLoad == null || seasonPl == null || seasonPl === 0 ? null : Math.round((a.playerLoad / seasonPl) * 100) - 100 }; };
    const mdDemand = plan.teamBaseline?.md && plan.teamBaseline.md.phases.length > 0
      ? { phases: plan.teamBaseline.md.phases.map(mdRow), days: plan.teamBaseline.md.days.map(mdRow) }
      : null;
    // Planned KPI volume (week + meso), match-anchored + per-KPI tapered — team scope, with head-KPI labels.
    // Per-week match count from fixtures → the meso's weekly TOTAL is congestion-aware week by week.
    const pvMatchesByWeek = matchesPerWeek(blkStart, blkWeeks, plan.fixtures ?? []);
    const pv = buildPlannedVolume({ matchKpiAvg: teamKpiAvg(plan.players), numWeeks: blkWeeks, stepPct: blkStep, deloadWeek: cadence, matchesByWeek: pvMatchesByWeek });
    const plannedVolume = pv ? {
      weekVolumeMultiple: pv.weekVolumeMultiple,
      matches: pv.matches, weekTotalMultiple: pv.weekTotalMultiple,
      weekKpis: pv.weekKpis.map((v) => ({ label: v.label, unit: v.unit, matchValue: v.matchValue, multiple: v.multiple, weeklyValue: v.weeklyValue })),
      headKpis: pv.headKpis.map((k) => ({ label: { en: WEEKLY_LOAD_LABELS[k].en, is: WEEKLY_LOAD_LABELS[k].is }, unit: WEEKLY_LOAD_LABELS[k].unit })),
      meso: pv.meso.map((w) => ({ weekIndex: w.weekIndex, isDeload: w.isDeload, volMultiple: w.volMultiple, matches: w.matches, totalMultiple: w.totalMultiple, kpi: w.kpi.map((c) => ({ multiple: c.multiple, value: c.value })) })),
      mesoTotal: { volMultiple: pv.mesoTotal.volMultiple, kpi: pv.mesoTotal.kpi.map((c) => ({ multiple: c.multiple, value: c.value })) },
    } : null;
    // Pre-season weekly-load ramp — starts the week off-season ends (no off-season), ramps toward the
    // build, with ALL KPI variables per week. Mirrors the on-screen "Pre-season weekly load — progression".
    let weeklyLoad: Parameters<typeof downloadPeriodizationHubPdf>[0]["weeklyLoad"] = null;
    if (preRamp.length) {
      const usesAu = preRamp.every((w) => w.weeklyLoadTarget == null);
      const wlTka = teamKpiAvg(plan.players); // match KPI avg → per-KPI ×match in the weekly table
      // PlayerLoad is the headline bar (weeklyLoadTarget) — drop it from the per-KPI rows so it isn't duplicated.
      const kpiKeys = (Object.keys(preRamp[0].byKpi) as WeeklyLoadMetricKey[]).filter((k) => k !== "totalPlayerLoad" && preRamp.some((w) => w.byKpi[k] != null));
      weeklyLoad = {
        startDate: preStart, unit: usesAu ? "AU" : "PL",
        weeks: preRamp.map((w) => ({ index: w.weekIndex, mult: w.multipleOfMatch, total: (usesAu ? w.sRpeAuTarget : w.weeklyLoadTarget) ?? null })),
        kpi: kpiKeys.map((k) => ({ label: { en: WEEKLY_LOAD_LABELS[k].en, is: WEEKLY_LOAD_LABELS[k].is }, unit: WEEKLY_LOAD_LABELS[k].unit, matchValue: wlTka[k] ?? null, values: preRamp.map((w) => w.byKpi[k] ?? null) })),
      };
    }
    await downloadPeriodizationHubPdf({
      teamName: plan.teamName, seasonYear: plan.seasonYear, generatedAt: new Date().toISOString(), teamUnit,
      tier: plan.tier ? { label: plan.tier.label, loadSource: plan.tier.loadSource, confidence: plan.tier.confidence } : null,
      phases: plan.phases.map((ph) => ({ label: ph.label, start: ph.start, end: ph.end, weeks: ph.weeks, matches: ph.matches, rationale: ph.rationale })),
      congested: plan.congested ?? [], baselines, mdDemand, teamAxes: plan.teamBaseline?.axes ?? null, blocks,
      block: calBlock, playerBlocks, mesoPlan, players, preseasonStart, plannedVolume, weeklyLoad,
    }, is ? "IS" : "EN");
  }

  // Per-tab "flow" line — makes the single-source propagation visible: what this tab reads, and where an
  // edit here flows (season_plans / week_plans / fixtures re-derive the other tabs). Explainability L1.
  const flowNote = (reads: string, flows: string) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-[11px] text-slate-500">
      <span className="font-mono text-[9px] uppercase tracking-wide text-slate-400">{is ? "flæði" : "flow"}</span>
      <span><b className="font-semibold text-slate-500">{is ? "Lesið frá" : "Reads"}:</b> {reads}</span>
      <span className="text-slate-300">·</span>
      <span><b className="font-semibold text-[#2740e6]">{is ? "Breytingar hér →" : "Edits here →"}</b> {flows}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{is ? "Tímabilsskipulag" : "Periodization Hub"}</h1>
        {plan && !loading && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Which players get an individualised block in the PDF. Default = the selected one (light export). */}
            <label className="text-[11px] text-slate-500">{is ? "Leikmenn í PDF" : "Players in PDF"}
              <select value={pdfPlayerMode} onChange={(e) => setPdfPlayerMode(e.target.value as typeof pdfPlayerMode)} className="ml-1 rounded-lg border border-slate-300 bg-white px-1.5 py-1 text-[11px]">
                <option value="selected">{is ? `Valinn (${player?.name ?? "—"})` : `Selected (${player?.name ?? "—"})`}</option>
                <option value="all">{is ? "Allir (með leikviðmið)" : "All (with a match unit)"}</option>
                <option value="custom">{is ? `Valið (${pdfCustom.size})` : `Custom (${pdfCustom.size})`}</option>
              </select>
            </label>
            {pdfPlayerMode === "custom" && <button onClick={() => setPdfPickerOpen((v) => !v)} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-[#2740e6] hover:bg-slate-50">{pdfPickerOpen ? (is ? "Loka lista" : "Close list") : (is ? "Velja leikmenn" : "Pick players")}</button>}
            <button onClick={exportAll} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1e34c0]">{is ? "Sækja PDF (öll gögn)" : "Export PDF (all data)"}</button>
          </div>
        )}
      </div>
      {plan && !loading && pdfPlayerMode === "custom" && pdfPickerOpen && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
            <span>{is ? "Veldu leikmenn í PDF (aðeins þeir með leikviðmið)" : "Pick players for the PDF (only those with a match unit)"}</span>
            <button onClick={() => setPdfCustom(new Set(plan.players.filter((p) => p.matchUnit.load.typical != null && !/GK|MARK|KEEP/i.test(p.position ?? "")).map((p) => p.playerId)))} className="text-[#2740e6]">{is ? "Velja alla" : "Select all"}</button>
            <button onClick={() => setPdfCustom(new Set())} className="text-slate-400">{is ? "Hreinsa" : "Clear"}</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plan.players.map((p) => {
              const gk = /GK|MARK|KEEP/i.test(p.position ?? ""); const noUnit = p.matchUnit.load.typical == null;
              const disabled = gk || noUnit; const on = pdfCustom.has(p.playerId);
              return (
                <button key={p.playerId} disabled={disabled} onClick={() => setPdfCustom((s) => { const n = new Set(s); if (n.has(p.playerId)) n.delete(p.playerId); else n.add(p.playerId); return n; })}
                  title={gk ? (is ? "Markmaður — sérlíkan" : "Goalkeeper — separate model") : noUnit ? (is ? "Ekkert leikviðmið enn" : "No match unit yet") : ""}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${disabled ? "border-slate-100 text-slate-300" : on ? "border-[#2740e6] bg-[#2740e6]/10 text-[#2740e6] font-semibold" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                  {on ? "✓ " : ""}{p.name}{gk ? " (GK)" : noUnit ? " –" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
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

          {/* TABS — grouped: the PLAN (the macro→meso→micro spine, in order) and the INPUTS that feed it.
              The grouping + the workflow strip below make the order and the single-source propagation legible. */}
          {(() => {
            const planTabs = [
              { key: "season", en: "Macro Cycle", is: "Makró-lota", subEn: "the season", subIs: "tímabilið" },
              { key: "preseason", en: "Pre-season", is: "Undirbúningur", subEn: "the whole pre-season", subIs: "allt undirbúningstímabilið" },
              { key: "plan", en: "Meso Cycle", is: "Mesó-lota", subEn: "the 4–6 week block", subIs: "4–6 vikna lotan" },
              { key: "micro", en: "Micro Cycle", is: "Míkró-lota", subEn: "the week", subIs: "vikan" },
            ] as const;
            const inputTabs = [
              { key: "demands", en: "Demands", is: "Kröfur", subEn: "baselines & match unit", subIs: "grunnlínur & leikviðmið" },
              { key: "players", en: "Players", is: "Leikmenn", subEn: "individualisation", subIs: "einstaklingsmiðun" },
              { key: "testing", en: "Testing", is: "Próf", subEn: "when to test", subIs: "hvenær á að mæla" },
            ] as const;
            const tabBtn = (t: { key: typeof tab; en: string; is: string; subEn: string; subIs: string }) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px rounded-t-lg border-b-2 px-3 py-1.5 text-left ${tab === t.key ? "border-[#2740e6]" : "border-transparent hover:bg-slate-50"}`}>
                <span className={`block text-[12px] font-semibold ${tab === t.key ? "text-[#2740e6]" : "text-slate-600"}`}>{is ? t.is : t.en}</span>
                <span className="block text-[9px] text-slate-400">{is ? t.subIs : t.subEn}</span>
              </button>
            );
            return (
              <div className="flex flex-wrap items-stretch gap-1 border-b border-slate-200">
                <span className="self-end pb-2 pr-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#2740e6]/70">{is ? "Áætlun" : "Plan"}</span>
                {planTabs.map(tabBtn)}
                <span className="mx-1.5 my-1 w-px self-stretch bg-slate-200" aria-hidden="true"></span>
                <span className="self-end pb-2 pr-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-400">{is ? "Inntak" : "Inputs"}</span>
                {inputTabs.map(tabBtn)}
              </div>
            );
          })()}

          {/* Workflow + propagation strip — the order the coach works in, and the promise that one edit flows. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[11.5px] leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-600">{is ? "Vinnuferli" : "Workflow"}:</span>{" "}
            <b className="text-[#2740e6]">1 {is ? "Kröfur" : "Demands"}</b> <span className="text-slate-400">({is ? "grunnur" : "foundation"})</span> → <b className="text-[#2740e6]">2 {is ? "Makró" : "Macro"}</b> → <b className="text-[#7a5cc4]">3 {is ? "Undirb. / Mesó" : "Pre-season / Meso"}</b> → <b className="text-[#1c7a4a]">4 {is ? "Míkró" : "Micro"}</b>
            <span className="text-slate-400"> · {is ? "Leikmenn + Próf næra öll þrepin." : "Players + Testing feed every step."}</span>
            <span className="mt-0.5 block text-[10.5px] text-slate-400">{is ? "Breyting á einum stað flæðir sjálfkrafa í hinar — ein heimild (season_plans · week_plans · leikir)." : "A change in one place flows to the others automatically — one source (season_plans · week_plans · fixtures)."}</span>
          </div>

          {/* SEASON tab */}
          {tab === "season" && (() => {
            // ── Shared derivations for the whole Macro tab ───────────────────────────────────────────
            const GC: Record<BlockGoalKey, string> = { accum: "#2740E6", transmute: "#7A5CC4", realize: "#1C7A4A", deload: "#DE9328" };
            const GT: Record<BlockGoalKey, { bg: string; ink: string }> = { accum: { bg: "#E6E9FC", ink: "#1B2DA8" }, transmute: { bg: "#EFEAF8", ink: "#55389E" }, realize: { bg: "#E3F1EA", ink: "#15603A" }, deload: { bg: "#FBEFDC", ink: "#7A4A06" } };
            // Fixture density uses its OWN teal ramp so it never reads as a block goal.
            const SUB_COLOR: Record<InSeasonSubPhaseKey, string> = { re_strength: "#A5D8E0", sharpen: "#3E9FAF", maintain_potentiate: "#0E5E6E", taper: "#F2C78A" };
            const DAY = 86_400_000;
            const utc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
            const blocks = mesoBlocks;
            const todayIso = new Date().toISOString().slice(0, 10);
            const fixtures = plan.fixtures ?? [];
            const compPhase = plan.phases.find((p) => p.key === "competitive") ?? null;
            const compStart = compPhase?.start ?? null;
            const offStartIso = plan.phases.find((p) => p.key === "offseason")?.start ?? null;
            const phaseOf = (bStart: string): "preseason" | "competitive" | "offseason" =>
              offStartIso && bStart >= offStartIso ? "offseason" : compStart && bStart < compStart ? "preseason" : "competitive";
            const preWeeks = plan.phases.find((p) => p.key === "preseason")?.weeks ?? null;
            const curPhaseIdx = plan.phases.findIndex((p) => p.start <= todayIso && todayIso < p.end);
            const curPhase = curPhaseIdx >= 0 ? plan.phases[curPhaseIdx] : plan.phases[plan.phases.length - 1] ?? null;
            const nextPhase = curPhaseIdx >= 0 ? plan.phases[curPhaseIdx + 1] ?? null : null;
            // Off-season week count starts at the RECONDITIONING build (the coach's off-season start),
            // not the phase start (= day after the last game). The weeks before it are the holiday/break,
            // counted separately — so "week N of M of Off-season" reflects the build, matching the summary.
            const offBuild = curPhase?.key === "offseason" && offStart && offStart > curPhase.start ? offStart : null;
            const phaseCountStart = offBuild ?? curPhase?.start ?? null;
            const phaseWeeksDisp = offBuild && curPhase ? Math.max(1, Math.round((utc(curPhase.end) - utc(offBuild)) / (7 * DAY))) : (curPhase?.weeks ?? null);
            const inHoliday = !!(offBuild && todayIso < offBuild);
            const weekInPhase = curPhase && phaseCountStart ? (inHoliday ? 0 : Math.max(1, Math.floor((utc(todayIso) - utc(phaseCountStart)) / (7 * DAY)) + 1)) : null;
            const thin = fixtures.length < 3 || (plan.loadCurve?.length ?? 0) < 4;
            const recLabel = goalRec ? (is ? BLOCK_GOAL_LABEL[goalRec.goal].is : BLOCK_GOAL_LABEL[goalRec.goal].en) : null;
            const hasOff = plan.phases.some((p) => p.key === "offseason");
            const offClauseIS = hasOff ? " Eftir sett tímabilslok tekur Undirbúningshlé við — umskipti/hvíld, svo uppbygging, fram að næsta undirbúningi." : "";
            const offClauseEN = hasOff ? " After the set season end, an Off-season takes over — transition/recovery, then a development build, until next pre-season." : "";
            const verdictLong = is
              ? `Tímabilið byrjar á ${preWeeks ?? "~"} vikna undirbúnings-Uppsöfnun → Umbreytingu. Á keppnistímabili er áherslan að mestu Framkvæmd (keppni + vikuleg niðurtröppun); leikjagluggar/hlé fá endur-uppsöfnunar-lotu, og hver lota endar á niðurtröppunar-viku.${offClauseIS}`
              : `Your season opens with a ${preWeeks ?? "~"}-week pre-season Accumulation → Transmutation build-up. In-season the emphasis is mostly Realization (compete + a weekly taper); fixture gaps / breaks get a re-accumulation block, and each block ends in a deload week.${offClauseEN}`;
            const verdict = !curPhase ? null
              : inHoliday
                ? (is ? `Þú ert í hléi — off-season uppbygging hefst ${shortDate(offBuild!, is)}${recLabel ? ` (næst: ${recLabel})` : ""}.` : `You're in the break — off-season build starts ${shortDate(offBuild!, is)}${recLabel ? ` (next up: ${recLabel})` : ""}.`)
                : weekInPhase
                  ? (is ? `Þú ert í viku ${weekInPhase} af ${phaseWeeksDisp} á ${curPhase.label.is}${recLabel ? ` — næst: ${recLabel}` : ""}.` : `You're in week ${weekInPhase} of ${phaseWeeksDisp} of ${curPhase.label.en}${recLabel ? ` — next up: ${recLabel}` : ""}.`)
                  : null;

            // ONE date axis for every lane (Monday of the first block → end of the last block). Everything
            // — blocks, phases, fixtures, tests, load, months, today — is positioned by its DATE on this axis,
            // so reading vertically always lands on the same week.
            const d0 = blocks.length ? utc(mondayOf(blocks[0].start)) : 0;
            const d1 = blocks.length ? Math.max(...blocks.map((b) => utc(b.end))) : 1;
            const spanDays = Math.max(1, Math.round((d1 - d0) / DAY));
            const pctOf = (iso: string) => Math.max(0, Math.min(100, ((utc(iso) - d0) / DAY / spanDays) * 100));
            const inSpan = (iso: string) => { const t = utc(iso); return t >= d0 && t < d1; };
            const weekPct = (7 / spanDays) * 100;
            const mondays: string[] = [];
            for (let t = d0; t < d1 && mondays.length < 120; t += 7 * DAY) mondays.push(new Date(t).toISOString().slice(0, 10));
            const monthMarks: Array<{ pct: number; label: string }> = [];
            if (blocks.length) {
              const s = new Date(d0);
              let cur = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + (s.getUTCDate() > 1 ? 1 : 0), 1);
              let prevYear: number | null = null;
              while (cur < d1) {
                const cd = new Date(cur), yr = cd.getUTCFullYear();
                const mon = cd.toLocaleDateString(is ? "is-IS" : "en-US", { month: "short", timeZone: "UTC" });
                monthMarks.push({ pct: ((cur - d0) / DAY / spanDays) * 100, label: yr !== prevYear ? `${mon} ’${String(yr).slice(2)}` : mon });
                prevYear = yr;
                cur = Date.UTC(yr, cd.getUTCMonth() + 1, 1);
              }
            }
            const todayPct = blocks.length && inSpan(todayIso) ? pctOf(todayIso) + (0.5 / spanDays) * 100 : null;
            const LABEL_W = 144; // 132px label column + 12px gap
            const overlayLeft = (pct: number) => `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${(pct / 100).toFixed(5)})`;

            // Status (today)
            const curBlock = blocks.find((b) => b.start <= todayIso && todayIso < b.end) ?? null;
            const curGoal: BlockGoalKey | null = curBlock ? ((blockGoals[curBlock.start] as BlockGoalKey | undefined) ?? curBlock.goalKey) : null;
            const weekInBlock = curBlock ? Math.max(1, Math.floor((utc(todayIso) - utc(curBlock.start)) / (7 * DAY)) + 1) : null;
            const thisMon = mondayOf(todayIso);
            const nextDl = blocks.filter((b) => b.deloadWeekStart && b.deloadWeekStart >= thisMon).sort((a, b) => (a.deloadWeekStart! < b.deloadWeekStart! ? -1 : 1))[0] ?? null;
            const dlDays = nextDl?.deloadWeekStart ? Math.round((utc(nextDl.deloadWeekStart) - utc(todayIso)) / DAY) : null;
            const blockEndIncl = (b: { end: string }) => isoAdd(b.end, -1);

            // Strength — the block scheme + the phase config + this week's fixture-density sub-phase
            const curScheme = curBlock ? strengthForBlockGoal(curBlock.goalKey, phaseOf(curBlock.start), coachStrengthRules?.block?.[`${curBlock.goalKey}:${phaseOf(curBlock.start)}`]) : null;
            const phaseKey = (curPhase?.key ?? "competitive") as SeasonPhaseKey;
            const onBreak = teamBreaks.some((b) => b.start_date <= todayIso && todayIso <= b.end_date);
            const congestedWeek = (plan.congested ?? []).some((c) => mondayOf(c.weekStart) === thisMon);
            const cfg = strengthConfigForPhase(phaseKey, { onBreak, congestedWeek }, coachStrengthRules?.phase?.[phaseKey]);
            const fxMs = fixtures.map((f) => utc(f)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
            const nextFx = fxMs.find((ms) => ms >= utc(todayIso));
            const weeksToOpener = phaseKey === "preseason" && nextFx ? Math.round((nextFx - utc(todayIso)) / (7 * DAY)) : null;
            const psBlock = phaseKey === "preseason" ? preseasonBlockForWeeksOut(weeksToOpener) : null;
            const PS_BLOCK_LABEL: Record<string, Bi> = {
              hypertrophy: { en: "Hypertrophy / strength-endurance", is: "Hypertrophy / styrktar-þol" },
              max_strength: { en: "Max strength", is: "Hámarksstyrkur" },
              power: { en: "Power / speed", is: "Afl / hraði" },
            };
            const compEnd = compPhase?.end ?? null;
            const nowSub = compStart && compEnd && todayIso >= compStart && todayIso <= compEnd
              ? classifyInSeasonSubPhase({ weekStart: todayIso, fixtures, breaks: teamBreaks, competitiveEnd: compEnd }) : null;

            // Weekly lanes
            const densityWeeks = mondays.map((w) => ({
              w,
              key: !compStart || !compEnd || w < compStart || w > compEnd || (offStartIso && w >= offStartIso) ? null
                : classifyInSeasonSubPhase({ weekStart: w, fixtures, breaks: teamBreaks, competitiveEnd: compEnd }).key,
            }));
            const fxPerWeek = new Map<string, number>();
            for (const f of fixtures) { const m = mondayOf(f); fxPerWeek.set(m, (fxPerWeek.get(m) ?? 0) + 1); }
            const fxInSpan = fixtures.filter(inSpan);
            const hasVald = plan.players.some((p) => p.vald.status != null);
            const hasGps = plan.tier.loadSource === "gps";
            const sched = new Map<string, TestKey[]>();
            for (const s of scheduledTests) { if (!inSpan(s.test_date)) continue; const arr = sched.get(s.test_date) ?? []; arr.push(s.test_key); sched.set(s.test_date, arr); }
            const schedMarks = [...sched.entries()].map(([date, keys]) => ({ date, keys, pct: pctOf(date) })).sort((a, b) => a.pct - b.pct);
            const schedClusters: Array<{ pct: number; days: typeof schedMarks; tests: number }> = [];
            for (const m of schedMarks) {
              const last = schedClusters[schedClusters.length - 1];
              if (last && m.pct - last.days[last.days.length - 1].pct <= 1.2) { last.days.push(m); last.tests += m.keys.length; last.pct = last.days.reduce((s, d) => s + d.pct, 0) / last.days.length; }
              else schedClusters.push({ pct: m.pct, days: [m], tests: m.keys.length });
            }
            const curveOpts = [{ key: -1, label: { en: "Team (whole squad)", is: "Lið (allt liðið)" } as Bi, curve: plan.loadCurve }, ...(plan.loadCurveByPos ?? [])];
            const selCurve = curveOpts.find((o) => o.key === loadCurveKey) ?? curveOpts[0];
            const loadMax = Math.max(1, ...selCurve.curve.map((w) => w.load ?? 0));

            const ANATOMY: Array<{ g: "accum" | "transmute" | "realize"; role: Bi }> = [
              { g: "accum", role: { en: "build the base", is: "byggja grunninn" } },
              { g: "transmute", role: { en: "sharpen to football", is: "sérhæfa í fótbolta" } },
              { g: "realize", role: { en: "peak for matches", is: "toppa fyrir leiki" } },
            ];
            const goalName = (g: BlockGoalKey) => (is ? BLOCK_GOAL_LABEL[g].is : BLOCK_GOAL_LABEL[g].en);
            const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
            const h2 = "text-[15px] font-bold text-slate-900";
            const lane = (label: string, sub: React.ReactNode, track: React.ReactNode, align: "center" | "end" = "center") => (
              <div className={`grid grid-cols-[132px_minmax(0,1fr)] gap-x-3 ${align === "end" ? "items-end" : "items-center"}`}>
                <div className={align === "end" ? "self-center" : ""}>
                  <div className="text-[12px] font-bold text-slate-900">{label}</div>
                  {sub && <div className="text-[11px] leading-tight text-slate-500">{sub}</div>}
                </div>
                {track}
              </div>
            );

            return (<div className="space-y-4">
          {flowNote(is ? "Leikir · Kröfur (leik-eining)" : "Fixtures · Demands (match unit)", is ? "Mesó · Míkró · Undirbúningur (gegnum season_plans)" : "Meso · Micro · Pre-season (via season_plans)")}

          {/* 1 — SEASON FRAME: the controls come first (Macro IS the control; everything below re-flows). */}
          <section className={card}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className={h2}>{is ? "Tímabilsrammi" : "Season frame"} <span className="font-normal text-slate-500">{plan.seasonYear}</span></h2>
              <span className="text-[12px] text-slate-500">{is ? "Stilltu þetta fyrst — kortið, Mesó og Míkró endurreiknast." : "Set these first — the map, Meso and Micro all re-flow from them."}</span>
            </div>
            {/* Four date anchors — equal grid columns so they align and never stretch to a helper's width. */}
            <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-slate-700">{is ? "Undirbúningur hefst" : "Pre-season starts"}
                <input type="date" value={preStart} onChange={(e) => setPreStart(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-2.5 text-[13px] font-medium text-slate-900" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-slate-700">{is ? "Tímabili lýkur" : "Season ends"}
                <input type="date" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-2.5 text-[13px] font-medium text-slate-900" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-slate-700" title={is ? "Þegar enduruppbygging byrjar. Tómt = strax við tímabilslok." : "When reconditioning begins. Empty = at the season end."}>{is ? "Off-season hefst (valfrjálst)" : "Off-season starts (optional)"}
                <input type="date" value={offStart} onChange={(e) => setOffStart(e.target.value)} placeholder={seasonEnd} className="h-10 w-full rounded-lg border border-slate-300 px-2.5 text-[13px] font-medium text-slate-900" />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-slate-700">{is ? "Off-season til (næsti undirb.)" : "Off-season to (next pre-season)"}
                <input type="date" value={nextPreStart} onChange={(e) => setNextPreStart(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-2.5 text-[13px] font-medium text-slate-900" />
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-400"><b className="font-semibold text-slate-500">{is ? "Tímabili lýkur" : "Season ends"}</b> {is ? "= lok keppninnar (→ off-season). Undirbúningur endar við fyrsta KEPPNISLEIK í Leikjaskrá — ekki hér (æfingaleikir teljast ekki með)." : "= end of competition (→ off-season). Pre-season ends at the first COMPETITIVE fixture in Fixtures — not here (friendlies don't count)."}</p>
            {/* Block length + Save/Apply on their own row. */}
            <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-slate-700">{is ? "Lotulengd (niðurtröppun hverja)" : "Block length (deload every)"}</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-300" role="group">
                  {([4, 5, 6] as const).map((c) => (
                    <button key={c} onClick={() => changeCadence(c)} aria-pressed={cadence === c} className={`h-10 min-w-16 px-3 text-[13px] font-semibold ${cadence === c ? "bg-[#2740e6] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{is ? `${c} vikur` : `${c} weeks`}</button>
                  ))}
                </div>
              </div>
              <span className="pb-2.5 text-[12px] text-slate-600">{is ? `${cadence - 1} uppbyggingarvikur + 1 niðurtröppun` : `${cadence - 1} build weeks + 1 deload`}</span>
              <div className="ml-auto flex gap-2">
                <button onClick={savePlan} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">{saved ? (is ? "✓ Vistað" : "✓ Saved") : (is ? "Vista" : "Save")}</button>
                <button onClick={() => load(preStart, seasonEnd)} className="h-10 rounded-lg bg-[#2740e6] px-4 text-[13px] font-semibold text-white">{is ? "Uppfæra" : "Apply"}</button>
              </div>
            </div>
            {(() => {
              const off = plan.phases.find((p) => p.key === "offseason");
              if (!off) return <p className="mt-2 text-[12px] text-slate-500">{is ? "Off-season: stilltu tímabilslok til að kveikja." : "Off-season: set a season end to enable."}</p>;
              const hasHoliday = !!offStart && offStart > off.start;
              return (
                <p className="mt-2 text-[12px] text-slate-600">
                  {hasHoliday && <span className="font-semibold text-amber-800">{is ? "Frí" : "Break"} {shortDate(off.start, is)}–{shortDate(offStart, is)} · </span>}
                  <span className="font-semibold text-[#2740e6]">Off-season {shortDate(hasHoliday ? offStart : off.start, is)} – {shortDate(off.end, is)}</span>
                </p>
              );
            })()}
          </section>
          {!plan.phases.some((p) => p.key === "preseason" && p.weeks > 0) && (
            <div className="rounded-lg border border-dashed border-[#7a5cc4]/40 bg-[#7a5cc4]/5 px-3 py-2 text-[12px] text-[#4a3a7a]">
              {is
                ? "Enginn undirbúningsgluggi fannst. Settu upphaf og lok undirbúnings hér að ofan til að skilgreina hann — það opnar byrjunar-álag + rampann og mælinga-áætlunina á réttum vikum (og lætur Week setup þekkja pre-season vikur sjálfkrafa)."
                : "No pre-season window found. Set the pre-season start & end above to define it — it unlocks the starting-load ramp and the testing schedule on the right weeks (and lets Week setup recognise pre-season weeks automatically)."}
            </div>
          )}

          {plan.phases.length === 0 || blocks.length === 0 ? (
            <section className={card}><p className="text-[13px] text-slate-600">{is ? "Engir leikir skráðir fyrir tímabilið." : "No fixtures on record for the season."}</p></section>
          ) : (<>

          {/* 2 — WHERE YOU ARE: Level 0 verdict + four plain facts */}
          <section className="space-y-3">
            {verdict && <p className="text-[15px] font-bold text-slate-900">{verdict}</p>}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Fasi" : "Phase"}</div>
                <div className="mt-0.5 text-[20px] font-bold text-slate-900">{curPhase ? (is ? curPhase.label.is : curPhase.label.en) : "—"}</div>
                <div className="text-[13px] text-slate-600">{inHoliday ? (is ? `Hlé — uppbygging ${shortDate(offBuild!, is)}` : `Break — build ${shortDate(offBuild!, is)}`) : curPhase && weekInPhase ? (is ? `Vika ${weekInPhase} af ${phaseWeeksDisp}` : `Week ${weekInPhase} of ${phaseWeeksDisp}`) : ""}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Lota núna" : "Current block"}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[20px] font-bold text-slate-900">{curGoal && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GC[curGoal] }} />}{curGoal ? goalName(curGoal) : "—"}</div>
                <div className="text-[13px] text-slate-600">{curBlock && weekInBlock ? `${is ? `Vika ${weekInBlock} af ${curBlock.weeks}` : `Week ${weekInBlock} of ${curBlock.weeks}`} · ${shortDate(curBlock.start, is)}–${shortDate(blockEndIncl(curBlock), is)}` : ""}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Næsta niðurtröppun" : "Next deload"}</div>
                <div className="mt-0.5 text-[20px] font-bold text-slate-900">{nextDl?.deloadWeekStart ? `${is ? "Vika" : "Week of"} ${shortDate(nextDl.deloadWeekStart, is)}` : "—"}</div>
                <div className="text-[13px] text-slate-600">{dlDays == null ? "" : dlDays <= 0 ? (is ? "Þessa viku" : "This week") : (is ? `Eftir ${dlDays} daga` : `In ${dlDays} days`)}{nextDl?.deloadNow ? (is ? " · færð framar (álag)" : " · pulled forward (load)") : ""}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Næst" : "Next up"}</div>
                <div className="mt-0.5 text-[20px] font-bold text-slate-900">{nextPhase ? `${is ? nextPhase.label.is : nextPhase.label.en} ${shortDate(nextPhase.start, is)}` : "—"}</div>
                <div className="text-[13px] text-slate-600">{nextPhase ? (is ? `${nextPhase.weeks} vikur` : `${nextPhase.weeks} weeks`) : ""}</div>
              </div>
            </div>
          </section>

          {/* 3 — THE SEASON MAP: one shared date axis, every lane lines up */}
          <section className={card}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className={h2}>{is ? "Tímabilskortið" : "The season map"}</h2>
              <span className="text-[12px] text-slate-500">{is ? "Allar línur deila sama tímaás — lestu lóðrétt til að sjá hvað gerist sömu vikuna." : "Every lane shares one time axis — read down a column to see what happens that week."}</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <div className="relative flex min-w-[1040px] flex-col gap-2 pt-1">
                {/* overlay — month gridlines + Today */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
                  {monthMarks.map((m, i) => <div key={i} className="absolute bottom-0 top-6 w-px bg-slate-900/[0.07]" style={{ left: overlayLeft(m.pct) }} />)}
                  {todayPct != null && (
                    <div className="absolute bottom-0 top-5 w-0.5 -translate-x-1/2 bg-[#a83e28]" style={{ left: overlayLeft(todayPct) }}>
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#a83e28] px-1.5 py-px text-[11px] font-bold text-white">{is ? "Í dag" : "Today"} · {shortDate(todayIso, is)}</span>
                    </div>
                  )}
                </div>

                {/* month axis */}
                <div className="grid h-5 grid-cols-[132px_minmax(0,1fr)] gap-x-3">
                  <div />
                  <div className="relative">
                    {monthMarks.map((m, i) => <span key={i} className="absolute top-0.5 whitespace-nowrap pl-1 text-[11px] font-semibold capitalize text-slate-500" style={{ left: `${m.pct}%` }}>{m.label}</span>)}
                  </div>
                </div>

                {/* phase — neutral, so colour only ever means block goal */}
                {lane(is ? "Fasi" : "Phase", null,
                  <div className="relative h-7">
                    {plan.phases.map((ph) => {
                      const l = pctOf(ph.start), r = pctOf(ph.end);
                      if (r <= l) return null;
                      return (
                        <div key={ph.key} title={`${shortDate(ph.start, is)} → ${shortDate(ph.end, is)} · ${ph.weeks} ${is ? "vikur" : "weeks"}`} className="absolute inset-y-0 px-px" style={{ left: `${l}%`, width: `${r - l}%` }}>
                          <div className="flex h-full items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border border-slate-200 bg-slate-100 px-2 text-[12px] font-semibold text-slate-700">
                            {is ? ph.label.is : ph.label.en}<span className="font-normal text-slate-500">{shortDate(ph.start, is)} – {shortDate(ph.end, is)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>)}

                {/* blocks — goal colour + the deload WEEK as an amber stripe at its position */}
                {lane(is ? "Lotur" : "Blocks", is ? "smelltu til að breyta markmiði + lengd" : "click to edit goal + length",
                  <div className="relative h-10">
                    {blocks.map((b) => {
                      const l = pctOf(b.start), r = pctOf(b.end);
                      const g = (blockGoals[b.start] as BlockGoalKey | undefined) ?? b.goalKey;
                      const dl = b.deloadWeekStart ? Math.max(0, Math.min(100, ((utc(b.deloadWeekStart) - utc(b.start)) / Math.max(DAY, utc(b.end) - utc(b.start))) * 100)) : null;
                      const dlW = Math.min(100, ((7 * DAY) / Math.max(DAY, utc(b.end) - utc(b.start))) * 100);
                      const selected = macroEditStart === b.start;
                      return (
                        <button key={b.index} type="button" onClick={() => setMacroEditStart(selected ? null : b.start)} aria-pressed={selected} className="absolute inset-y-0 cursor-pointer border-0 bg-transparent p-0 px-px" style={{ left: `${l}%`, width: `${r - l}%` }}
                          title={`${shortDate(b.start, is)}–${shortDate(blockEndIncl(b), is)} · ${goalName(g)} · ${is ? b.phase.is : b.phase.en} · ${is ? "niðurtröppunarvika" : "deload week"} ${b.deloadWeekStart ? shortDate(b.deloadWeekStart, is) : "—"}${b.deloadNow ? (is ? " (færð framar)" : " (pulled forward)") : ""} — ${is ? "smelltu til að breyta markmiði + lengd" : "click to edit goal + length"}`}>
                          <div className={`relative flex h-full items-center overflow-hidden rounded-md px-1.5 ${selected ? "ring-2 ring-[#14181c] ring-offset-1" : ""}`} style={{ background: GC[g] }}>
                            <span className={`relative z-[1] truncate text-[12px] font-semibold ${g === "deload" ? "text-[#5A3A06]" : "text-white"}`}>{goalName(g)}</span>
                            {dl != null && g !== "deload" && (
                              <div className="absolute inset-y-0 border-l-2 border-white" style={{ left: `${dl}%`, width: `${dlW}%`, background: b.deloadNow ? "repeating-linear-gradient(45deg,#DE9328,#DE9328 3px,#F6D29A 3px,#F6D29A 6px)" : "#DE9328" }} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>)}

                {/* strength — same blocks, read as the strength quality they train */}
                {lane(is ? "Styrkur" : "Strength", is ? "gæði sem lotan þjálfar" : "quality the block trains",
                  <div className="relative h-7">
                    {blocks.map((b) => {
                      const l = pctOf(b.start), r = pctOf(b.end);
                      const s = strengthForBlockGoal(b.goalKey, phaseOf(b.start), coachStrengthRules?.block?.[`${b.goalKey}:${phaseOf(b.start)}`]);
                      const t = GT[b.goalKey];
                      return (
                        <div key={b.index} className="absolute inset-y-0 px-px" style={{ left: `${l}%`, width: `${r - l}%` }} title={`${is ? b.phase.is : b.phase.en} → ${is ? s.quality.is : s.quality.en} · ${is ? s.pct1rm.is : s.pct1rm.en} · ${is ? s.scheme.is : s.scheme.en}`}>
                          <div className="flex h-full items-center overflow-hidden rounded-md px-1.5" style={{ background: t.bg }}>
                            <span className="truncate text-[11px] font-semibold" style={{ color: t.ink }}>{is ? s.quality.is : s.quality.en}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>)}

                {/* fixture density — in-season strength sub-phase, week by week */}
                {compPhase && lane(is ? "Leikjaþéttleiki" : "Fixture density", is ? "styrkur viku fyrir viku" : "strength week by week",
                  <div className="relative h-5">
                    {densityWeeks.map(({ w, key }) => (
                      <div key={w} className="absolute inset-y-0 px-px" style={{ left: `${pctOf(w)}%`, width: `${weekPct}%` }}
                        title={key ? `${shortDate(w, is)} · ${is ? subPhaseInfo(key).label.is : subPhaseInfo(key).label.en} — ${is ? subPhaseInfo(key).rationale.is : subPhaseInfo(key).rationale.en}` : `${shortDate(w, is)} · ${is ? "utan keppnistímabils" : "outside the competitive season"}`}>
                        <div className="h-full rounded-sm" style={{ background: key ? SUB_COLOR[key] : "#F1F5F9" }} />
                      </div>
                    ))}
                  </div>)}

                {/* matches — one dot per fixture on its day; congested weeks in red */}
                {lane(is ? "Leikir" : "Matches", is ? "einn punktur = einn leikur" : "one dot = one match",
                  <div className="relative h-5">
                    {fxInSpan.map((f, i) => {
                      const congested = (fxPerWeek.get(mondayOf(f)) ?? 0) >= 2;
                      return <span key={`${f}-${i}`} title={`${shortDate(f, is)}${congested ? (is ? " · þétt vika" : " · congested week") : ""}`} className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${pctOf(f) + (0.5 / spanDays) * 100}%`, background: congested ? "#a83e28" : "#334155" }} />;
                    })}
                  </div>)}

                {/* testing — outlined = recommended at block start, filled = the coach's scheduled dates */}
                {lane(is ? "Próf" : "Testing",
                  <a href="?tab=testing" onClick={(e) => { e.preventDefault(); setTab("testing"); }} className="font-semibold text-[#2740e6] hover:underline">{is ? "Skipuleggja →" : "Schedule →"}</a>,
                  <div className="relative h-6">
                    {blocks.map((b) => {
                      const bt = testsForBlock(b.goalKey, { hasVald, hasGps });
                      if (!bt.protocols.length) return null;
                      return <span key={`r${b.index}`} title={`${is ? "Ráðlagt" : "Recommended"} · ${shortDate(b.start, is)}\n${is ? bt.when.is : bt.when.en}\n${bt.protocols.map((p) => (is ? p.name.is : p.name.en)).join(", ")}`} className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border-2 border-[#1C7A4A] bg-white" style={{ left: `${pctOf(b.start) + (0.5 / spanDays) * 100}%` }} />;
                    })}
                    {schedClusters.map((c, ci) => (
                      <span key={`s${ci}`} title={c.days.map((d) => `${shortDate(d.date, is)}: ${d.keys.map((k) => (is ? TEST_SHORT[k].is : TEST_SHORT[k].en)).join(", ")}`).join("\n")} className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1" style={{ left: `${c.pct + (0.5 / spanDays) * 100}%` }}>
                        <span className="h-[10px] w-[10px] rotate-45 rounded-[1px] border-2 border-[#1C7A4A] bg-[#1C7A4A]" />
                        {c.tests > 1 && <span className="text-[11px] font-bold text-[#15603A]">×{c.tests}</span>}
                      </span>
                    ))}
                  </div>)}

                {/* weekly load — the real trend, on the same axis */}
                {selCurve.curve.length > 1 && lane(is ? "Vikulegt álag" : "Weekly load",
                  curveOpts.length > 1 ? (
                    <select value={selCurve.key} onChange={(e) => setLoadCurveKey(Number(e.target.value))} aria-label={is ? "Álagsferill — lið eða staða" : "Load curve — team or position"} className="mt-1 h-8 w-[124px] rounded-md border border-slate-300 bg-white px-1 text-[12px] text-slate-700">
                      {curveOpts.map((o) => <option key={o.key} value={o.key}>{is ? o.label.is : o.label.en}</option>)}
                    </select>
                  ) : (is ? "Player Load" : "Player Load"),
                  <div className="relative h-16 border-b border-slate-200">
                    {selCurve.curve.filter((w) => inSpan(w.weekStart) && w.load != null).map((w) => (
                      <div key={w.weekStart} className="absolute bottom-0 px-[2px]" style={{ left: `${pctOf(mondayOf(w.weekStart))}%`, width: `${weekPct}%`, height: `${((w.load ?? 0) / loadMax) * 100}%` }} title={`${shortDate(w.weekStart, is)}: ${Math.round(w.load ?? 0)}`}>
                        <div className="h-full rounded-t-[3px] bg-[#6B7FEE]" />
                      </div>
                    ))}
                  </div>, "end")}
              </div>
            </div>

            {/* legend */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-100 pt-3 text-[12px] text-slate-600">
              {ANATOMY.map((a) => <span key={a.g} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: GC[a.g] }} />{goalName(a.g)}</span>)}
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: "#DE9328" }} />{is ? "Niðurtröppunarvika" : "Deload week"}</span>
              {compPhase && <span className="h-4 w-px bg-slate-200" />}
              {compPhase && SUBPHASE_KEYS.map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: SUB_COLOR[k] }} />{is ? subPhaseInfo(k).label.is : subPhaseInfo(k).label.en}</span>)}
              <span className="h-4 w-px bg-slate-200" />
              <span className="inline-flex items-center gap-1.5"><span className="h-[9px] w-[9px] rotate-45 border-2 border-[#1C7A4A] bg-white" />{is ? "Ráðlagt próf" : "Recommended test"}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-[9px] w-[9px] rotate-45 border-2 border-[#1C7A4A] bg-[#1C7A4A]" />{is ? "Skráð próf" : "Scheduled test"}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full bg-[#a83e28]" />{is ? "Þétt vika (2+ leikir)" : "Congested week (2+ matches)"}</span>
            </div>
            {schedClusters.length === 0 && <p className="mt-2 text-[12px] text-slate-500">{is ? "Engin próf skráð enn — opnaðu „Próf“ til að festa dagsetningar." : "No tests scheduled yet — open \"Testing\" to pin dates."}</p>}
            {(plan.congested ?? []).length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{is ? `${plan.congested.length} þéttar vikur (2+ leikir) — Míkró fellur saman þær vikur: ` : `${plan.congested.length} congested weeks (2+ matches) — the micro collapses those weeks: `}{plan.congested.map((c) => `${shortDate(c.weekStart, is)} (${c.matches})`).join(", ")}</p>
            )}
            {thin && <p className="mt-2 text-[12px] text-amber-800">{is ? "Fá gögn enn (fáir leikir / lítil álags-saga) — lestu kortið sem vísbendingu." : "Thin data so far (few fixtures / little load history) — read the map as a hint."}</p>}
          </section>

          {/* 3b — INLINE BLOCK EDITOR: click a block on the map → edit its goal + length right here.
              Writes the same blockGoals / blockWeeks overrides, so Meso, Micro and the map all re-flow. */}
          {macroEditStart && (() => {
            const eb = blocks.find((b) => b.start === macroEditStart);
            if (!eb) return null;
            const g = (blockGoals[eb.start] as BlockGoalKey | undefined) ?? eb.goalKey;
            const curLenOv = blockLenOv[String(eb.index)] ?? blockLenOv[eb.start];
            // Weeks (Mondays) inside this block — the pinnable deload candidates. Current pin = blockDeloadOv.
            const blkMondays: string[] = [];
            for (let t = utc(mondayOf(eb.start)); t < utc(eb.end) && blkMondays.length < 12; t += 7 * DAY) blkMondays.push(new Date(t).toISOString().slice(0, 10));
            const curDeload = blockDeloadOv[eb.start] ?? "";
            return (
              <section className={`${card} border-[#14181c]/25`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className={h2}>{is ? "Breyta lotu" : "Edit block"} {eb.index + 1}</h2>
                  <span className="text-[12px] text-slate-500">{shortDate(eb.start, is)}–{shortDate(blockEndIncl(eb), is)} · {eb.weeks} {is ? "vikur" : "weeks"} · {is ? eb.phase.is : eb.phase.en}</span>
                  <button type="button" onClick={() => setMacroEditStart(null)} className="ml-auto rounded px-1.5 text-[13px] text-slate-400 hover:text-slate-600" aria-label={is ? "Loka" : "Close"}>✕</button>
                </div>
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Markmið" : "Goal"}</div>
                <div role="radiogroup" aria-label={is ? "Markmið lotu" : "Block goal"} className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {ANATOMY.map((a) => { const active = g === a.g; return (
                    <button key={a.g} type="button" role="radio" aria-checked={active} onClick={() => setBlockGoalFor(eb.start, a.g)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] ${active ? "border-transparent text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`} style={active ? { background: GC[a.g] } : undefined}>
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: active ? "#fff" : GC[a.g] }} />
                      <span className="font-semibold">{goalName(a.g)}</span>
                      <span className={`text-[11px] ${active ? "text-white/80" : "text-slate-400"}`}>{is ? a.role.is : a.role.en}</span>
                    </button>
                  ); })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">{is ? "Lengd" : "Length"}
                    <select value={curLenOv ?? ""} onChange={(e) => setBlockLength(String(eb.index), e.target.value === "" ? null : Number(e.target.value))} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[13px]">
                      <option value="">{is ? `Sjálfgefið (${cadence}v)` : `Auto (${cadence}w)`}</option>
                      {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} {is ? "vikur" : "weeks"}</option>)}
                    </select>
                  </label>
                  {curLenOv != null && <button type="button" onClick={() => setBlockLength(String(eb.index), null)} className="text-[12px] text-slate-500 hover:underline">{is ? "Núllstilla lengd" : "Reset length"}</button>}
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">{is ? "Niðurtröppun" : "Deload"}
                    <select value={curDeload} onChange={(e) => setBlockDeload(eb.start, e.target.value === "" ? null : e.target.value)} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[13px]">
                      <option value="">{is ? "Sjálfgefið (snjallt)" : "Auto (smart)"}</option>
                      {blkMondays.map((m, wi) => <option key={m} value={m}>{is ? `Vika ${wi + 1} · ${shortDate(m, is)}` : `Week ${wi + 1} · ${shortDate(m, is)}`}</option>)}
                    </select>
                  </label>
                  {curDeload !== "" && <button type="button" onClick={() => setBlockDeload(eb.start, null)} className="text-[12px] text-slate-500 hover:underline">{is ? "Núllstilla" : "Reset"}</button>}
                  <span className="text-[11px] text-slate-400">{is ? "Breyting endurflæðir Mesó, Míkró og kortið." : "Changes re-flow Meso, Micro and the map."}</span>
                </div>
              </section>
            );
          })()}

          {/* 4 — DECISIONS: block goal + strength, side by side */}
          <div className="flex flex-wrap gap-4">
            <section className={`${card} min-w-0 flex-[1_1_480px]`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={h2}>{is ? "Markmið virkrar lotu" : "Active block goal"}</h2>
                {blockGoals[activeBlockStart] && blockGoals[activeBlockStart] !== engineGoal && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900" title={is ? "Þjálfari valdi annað markmið en kerfið lagði til fyrir þessa blokk" : "Coach chose a different goal than the system suggested for this block"}>{is ? "Yfirtekið af þjálfara" : "Coach override"}</span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-slate-600">
                {activeBlock ? `${is ? "Lotan" : "Block"} ${shortDate(activeBlock.start, is)}–${shortDate(blockEndIncl(activeBlock), is)}. ` : ""}
                {is ? "Stýrir Mesó, Míkró og PDF — ákvörðunin er þjálfarans." : "Drives Meso, Micro and the PDF — the coach's call."}
              </p>
              <div role="radiogroup" aria-label={is ? "Markmið lotu" : "Block goal"} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {ANATOMY.map((a) => {
                  const active = effectiveGoal === a.g;
                  const rec = goalRec?.goal === a.g;
                  return (
                    <button key={a.g} type="button" role="radio" aria-checked={active} onClick={() => setBlockGoal(a.g)}
                      className={`flex min-h-[72px] flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition ${active ? "text-white shadow-sm" : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50"}`}
                      style={active ? { background: GC[a.g], border: `2px solid ${GC[a.g]}` } : undefined}>
                      <span className="flex items-center gap-1.5 text-[14px] font-bold">
                        {goalName(a.g)}
                        {rec && <span className={`rounded-full px-1.5 py-px text-[11px] font-bold ${active ? "bg-white/20 text-white" : "bg-[#2740e6]/10 text-[#1B2DA8]"}`}>{is ? "Ráðlagt" : "Recommended"}</span>}
                      </span>
                      <span className={`text-[12px] ${active ? "text-white/90" : "text-slate-500"}`}>{is ? a.role.is : a.role.en}</span>
                    </button>
                  );
                })}
              </div>
              {goalRec && effectiveGoal !== goalRec.goal && (
                <button type="button" onClick={() => setBlockGoal(goalRec.goal as "accum" | "transmute" | "realize")} className="mt-2.5 h-9 rounded-lg border border-[#2740e6] bg-white px-3 text-[12px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">
                  {is ? `Nota ráðlagt (${BLOCK_GOAL_LABEL[goalRec.goal].is})` : `Use recommended (${BLOCK_GOAL_LABEL[goalRec.goal].en})`}
                </button>
              )}
              <p className="mt-2 text-[12px] text-slate-500">{is ? "Ráðlagt = út frá stöðu í tímabili + álagi." : "Recommended = from season position + load."}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-slate-700">
                <li>{is ? "Uppsöfnun byggir grunninn, Umbreyting sérhæfir hann í fótbolta, Framkvæmd toppar þig fyrir leiki — í þeirri röð." : "Accumulation builds the base, Transmutation sharpens it to football-specific, Realization peaks you for matches — in that order."}</li>
                <li>{is ? "Á tímabilinu skiptistu milli Umbreyting ↔ Framkvæmd kringum leiki; þú safnar aftur eftir niðurtröppun eða pásu." : "In-season you cycle Transmutation ↔ Realization around fixtures; you re-accumulate after a deload or a break."}</li>
                <li>{is ? "Niðurtröppun er ekki fjórða lotan — hún er lokavika hverrar lotu (gula rákin), færð framar ef álag rýkur upp eða viðbragð lækkar." : "Deload isn't a fourth block — it's the last week of every block (the amber stripe), pulled forward if load spikes or readiness drifts."}</li>
              </ul>
            </section>

            <section className={`${card} min-w-0 flex-[1_1_420px]`}>
              <h2 className={h2}>{is ? "Styrkur núna" : "Strength right now"}</h2>
              <p className="mt-1 text-[13px] font-semibold text-slate-900">{is ? cfg.verdict.is : cfg.verdict.en}</p>
              <p className="mt-0.5 text-[13px] text-slate-600">{is ? cfg.intensity.is : cfg.intensity.en}</p>
              {psBlock && (
                <p className="mt-1.5 text-[13px] text-slate-700">
                  <span className="font-semibold">{is ? "Núverandi blokk" : "Current block"}:</span> {is ? PS_BLOCK_LABEL[psBlock].is : PS_BLOCK_LABEL[psBlock].en}
                  {weeksToOpener != null && <span className="text-slate-500"> · {is ? `${weeksToOpener} vikur í fyrsta leik` : `${weeksToOpener} weeks to the opener`}</span>}
                  <span className="text-slate-500"> · {is ? "per-leikmanns upphaf í Leikmenn-flipanum" : "per-player start in the Players tab"}</span>
                </p>
              )}
              {cfg.flags.map((f, i) => <p key={i} className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium text-amber-900">⚑ {is ? f.is : f.en}</p>)}
              <div className="mt-3 space-y-2">
                {nowSub && (
                  <div className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: `${SUB_COLOR[nowSub.key]}`, background: `${SUB_COLOR[nowSub.key]}22` }}>
                    <div className="text-[12px] font-semibold text-slate-600">{is ? "Leikjaþéttleiki · þessi vika" : "Fixture density · this week"}</div>
                    <div className="text-[14px] font-bold text-slate-900">{is ? nowSub.label.is : nowSub.label.en}</div>
                    <div className="text-[13px] text-slate-600">{is ? nowSub.rationale.is : nowSub.rationale.en}</div>
                    <div className="text-[13px] text-slate-600">{is ? nowSub.dose.is : nowSub.dose.en}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{nowSub.cite}</div>
                  </div>
                )}
                {curScheme && curBlock && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                    <div className="text-[12px] font-semibold text-slate-600">{is ? "Lota" : "Block"} · {goalName(curBlock.goalKey)}</div>
                    <div className="text-[14px] font-bold text-slate-900">{is ? curScheme.quality.is : curScheme.quality.en} <span className="font-medium text-slate-600">· {is ? curScheme.pct1rm.is : curScheme.pct1rm.en}</span></div>
                    <div className="text-[13px] text-slate-600">{is ? curScheme.scheme.is : curScheme.scheme.en}</div>
                    {curScheme.methods.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {curScheme.methods.map((k) => {
                          const m = STRENGTH_METHODS.find((x) => x.key === k);
                          if (!m) return null;
                          return <span key={k} title={is ? m.desc.is : m.desc.en} className="rounded bg-[#7a5cc4]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#55389E]">{is ? m.label.is : m.label.en}</span>;
                        })}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-slate-500">{curScheme.cite}</div>
                  </div>
                )}
              </div>
              {phaseKey === "competitive" && (
                <div className="mt-3">
                  <div className="text-[12px] font-semibold text-slate-700">{is ? "Dreifing styrks í leiktíð" : "In-season strength distribution"}</div>
                  <div className="mt-1.5 inline-flex overflow-hidden rounded-lg border border-slate-300" role="group">
                    {(["microdose", "traditional"] as const).map((m) => (
                      <button key={m} onClick={() => changeInSeasonMode(m)} aria-pressed={inSeasonMode === m} className={`h-10 px-3.5 text-[13px] font-semibold ${inSeasonMode === m ? "bg-[#2740e6] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>
                        {m === "microdose" ? (is ? "Microdose (dreift)" : "Microdose (spread)") : (is ? "Hefðbundið (1–2 dagar)" : "Traditional (1–2 days)")}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[12px] text-slate-500">{is ? "Bæði viðhalda styrk ef vikumagn er jafnt — jafngildur, gagnreyndur kostur, ekki einn „réttur\" (Cuthbert 2021). Microdose dreifir yfir vikuna; hefðbundið þjappar á 1–4 lyftidaga sem þú velur." : "Both maintain strength if weekly volume is equated — an equal, evidence-based choice, not one \"right\" way (Cuthbert 2021). Microdose spreads across the week; traditional concentrates onto the 1–4 lift days you pick."}</p>
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-500">{cfg.cite}. {is ? "Lýsandi / þjálfaramat — micro setur skammtinn á MD-dagana; hreyfir aldrei readiness-litinn." : "Descriptive / coach's call — micro places the dose on MD-days; never the readiness colour."}</p>
            </section>
          </div>
          </>)}

          {/* 5 — PHASES + THE MODEL (Level 2, collapsed) */}
          {plan.phases.length > 0 && (
            <section className={card}>
              <h2 className={h2}>{is ? "Fasar tímabilsins" : "Season phases"}</h2>
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
                {plan.phases.map((ph) => (
                  <div key={ph.key} className="rounded-xl border border-slate-200 px-3.5 py-3">
                    <div className="text-[14px] font-bold text-slate-900">{is ? ph.label.is : ph.label.en}</div>
                    <div className="text-[12px] text-slate-500">{shortDate(ph.start, is)} – {shortDate(ph.end, is)} · {ph.weeks} {is ? "vikur" : "weeks"}</div>
                    <p className="mt-1 text-[13px] text-slate-700">{is ? ph.rationale.is : ph.rationale.en}</p>
                  </div>
                ))}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer py-1 text-[13px] font-semibold text-[#2740e6]">{is ? "Hvernig lotan er byggð — líkanið og heimildir" : "How the cycle is built — the model & citations"}</summary>
                <p className="mt-1.5 text-[13px] text-slate-700">{verdictLong}</p>
                <p className="mt-1.5 text-[13px] text-slate-700">{is ? "MicroPulse setur loturnar á ÞÍNA leiki og álag — svo lengd og staðsetning eru liðsins eigin, ekki fast sniðmát. Röðin (Uppsöfnun → Umbreyting → Framkvæmd, niðurtröppun sem hvíld) er úr blokkar-periodisation; hún mælir með — val á lotu-markmiði er áfram þjálfarans." : "MicroPulse places the blocks on YOUR fixtures and load — so the lengths and positions are the team's own, not a fixed template. The order (Accumulation → Transmutation → Realization, deload as the unload) is block periodisation; it recommends — the block-goal choice stays the coach's call."}</p>
                <p className="mt-1.5 text-[13px] text-slate-700">{is ? "Próf: við upphaf hverrar lotu er endur-grunnmælt svo svæði/álög passi núverandi getu. Framkvæmd = aðeins vöktun (ekkert þreytandi inn í leiki). Niðurtröppun = besti glugginn." : "Testing: at each block start, re-baseline so zones/loads fit current capacity. Realization = monitoring only (nothing fatiguing into matches). Deload = the best window."}</p>
                <p className="mt-1.5 text-[12px] text-slate-500">Issurin 2010 (block periodisation) · Martín-García 2018 + Owen 2017 (taper/realization into fixtures) · Teixeira 2021 (deload on load-trend + readiness, not ACWR) · Oliveira 2019/2021 (pre-season = accumulation) · Buchheit; Mann/Weakley; Claudino; Bourne (testing). {is ? "Lýsandi — aldrei readiness-liturinn." : "Descriptive — never the readiness colour."}</p>
              </details>
            </section>
          )}

            </div>);
          })()}

          {/* PRE-SEASON tab — the whole pre-season, week by week (ramp · days · strength · testing/friendlies). */}
          {tab === "preseason" && (() => {
            const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
            const h2 = "text-[15px] font-bold text-slate-900";
            const todayIso = new Date().toISOString().slice(0, 10);
            const up = upcomingPreseason(plan.phases, todayIso, plan.nextFirstFixture);
            if (!up) return (
              <section className={card}>
                <h2 className={h2}>{is ? "Undirbúningur — heildarskipulag" : "Pre-season — whole plan"}</h2>
                <p className="mt-1 text-[13px] text-slate-600">{is ? "Stilltu undirbúnings-dagsetningar í Makró-lotu flipanum til að opna heildarskipulagið (viku-fyrir-viku ramp, dagar, styrkur og próf)." : "Set the pre-season dates in the Macro Cycle tab to unlock the whole-pre-season plan (week-by-week ramp, days, strength and testing)."}</p>
              </section>
            );
            const preStart = up.start, preWeeks = up.weeks;
            const preEndMs = Date.parse(`${preStart}T00:00:00Z`) + preWeeks * 7 * 86_400_000;
            const preAnchor: LoadAnchor = plan.matchLoad != null ? "match_this_season" : plan.tier.loadSource === "srpe" ? "srpe_only" : "normative";
            const tka = teamKpiAvg(plan.players);
            const ramp = preseasonStartRamp({ matchTypicalLoad: tka.totalPlayerLoad ?? plan.matchLoad, matchKpiAvg: tka, matchSrpeAu: plan.matchSrpe, sessionsPerWeek: psSess, preseasonWeeks: preWeeks, week1MatchMultiple: psW1, anchor: preAnchor });
            const usesAu = ramp.every((w) => w.weeklyLoadTarget == null);
            const unitLabel = usesAu ? "AU" : "PL";
            const primary = (w: PreseasonWeekTarget) => (usesAu ? w.sRpeAuTarget : w.weeklyLoadTarget) ?? 0;
            const fmtv = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
            // All pre-season fixtures are friendlies by definition (a competitive game ends pre-season).
            const preFixtures = (plan.fixtures ?? []).filter((d) => d >= preStart && Date.parse(`${d}T00:00:00Z`) < preEndMs).sort();
            // DRAFT-LEVEL day editing: overlay the coach's saved day layout (week_plans) on the auto pre-season
            // layout so a day toggled on the pre-season card persists and reads back here — the same day-truth
            // source Week Setup refines. A saved OFF forces rest; a saved TRAIN forces a session.
            const preOffDays: string[] = [], preOnDays: string[] = [], preTypeOv: Record<string, CalType> = {};
            for (const [iso, sp] of Object.entries(savedPlans)) {
              if (iso < preStart || Date.parse(`${iso}T00:00:00Z`) >= preEndMs) continue;
              if (sp.dayType === "OFF") preOffDays.push(iso);
              else if (sp.dayType === "TRAIN" || sp.dayType === "RECOVERY") {
                preOnDays.push(iso);
                const ct = sp.focus ? caltypeFromFocus(sp.focus) : undefined; // saved stimulus → force that type
                if (ct) preTypeOv[iso] = ct;
              }
            }
            const cal = buildCalendarBlock({ unit: blkUnit, startDate: preStart, numWeeks: preWeeks, scopeName: "__team__", phase: { en: "Pre-season", is: "Undirbúningur" }, baseOverloadPct: blkBase, stepPct: blkStep, matchDates: preFixtures, offDays: preOffDays, onDays: preOnDays, typeOverrides: preTypeOv, allFixtures: plan.fixtures ?? [], matchExposure: (wi) => preseasonMatchExposure(wi + 1, preWeeks) });
            // Set a pre-season day's day-type directly on the card (draft): Off or a training stimulus
            // (mechanical/locomotive/mixed/activation/top-up). Match days stay fixed to the fixture. Optimistic
            // overlay via savedPlans; persists the whole week to week_plans through the SAME applyWeekSetup path
            // the Meso tab uses, so Week Setup reads the draft (day-type AND stimulus) back. Load is recomputed.
            const setPreDay = (cw: typeof cal.weeks[number], di: number, target: CalType | "rest") => {
              const dsel = cw.days[di]; if (dsel.type === "match") return;
              const selIso = isoAdd(cw.weekStart, di); const off = target === "rest";
              const selFocus = off ? (dsel.md || null) : [dsel.md, CALTYPE_FOCUS_LABEL[target] ?? ""].filter(Boolean).join(" ");
              setSavedPlans((prev) => ({ ...prev, [selIso]: { dayType: off ? "OFF" : "TRAIN", focus: selFocus } }));
              const payload = [{
                week_start: cw.weekStart,
                system_key: cw.isDeload ? "RECOVERY" : "STRENGTH",
                intensity_target: cw.isDeload ? 3 : Math.max(3, Math.min(9, Math.round(5 + (cw.mult - 1) * 12))),
                days: cw.days.map((d, i) => {
                  const dd = isoAdd(cw.weekStart, i);
                  const isMatch = d.type === "match";
                  const isRest = i === di ? off : d.type === "rest";
                  // Selected training day carries the chosen stimulus; others keep their rendered label.
                  const trainFocus = i === di ? [d.md, CALTYPE_FOCUS_LABEL[target as CalType] ?? ""].filter(Boolean).join(" ") : [d.md, d.label.en].filter(Boolean).join(" ");
                  return { day_index: i + 1, day_date: dd,
                    day_type: isMatch ? "GAME" : isRest ? "OFF" : "TRAIN",
                    focus: isMatch ? null : isRest ? (d.md || null) : trainFocus,
                    day_intent: isMatch ? "GAME" : isRest ? "OFF" : null };
                }),
              }];
              setPreDaySave("saving"); setPreDayPick(null);
              (async () => { try { const r = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ applyWeekSetup: payload }) }); setPreDaySave(r.ok ? "saved" : "err"); } catch { setPreDaySave("err"); } })();
            };
            const matchLoadUnit = tka.totalPlayerLoad ?? plan.matchLoad; // PL match unit for the budget
            const hasVald = plan.players.some((p) => p.vald.status != null);
            const hasGps = plan.tier.loadSource === "gps";
            const tests = recommendTestingSchedule({ preseasonWeeks: preWeeks, hasGps, hasVald });
            const typeColor: Record<string, string> = { mechanical: "#A83E28", locomotive: "#15603A", mixed: "#1B2DA8", activation: "#475569", topup: "#55389E", match: "#7A4A06", rest: "#64748B" };
            const tint: Record<string, string> = { mechanical: "#F6E7E1", locomotive: "#E4F1EA", mixed: "#E7EAFB", activation: "#EFEFEF", topup: "#F0EAF7", match: "#FBEFDD", rest: "#F8FAFC" };
            const typeName = (t: string): string => t === "mechanical" ? (is ? "Mekanískt" : "Mechanical") : t === "locomotive" ? (is ? "Hlaup" : "Locomotive") : t === "mixed" ? (is ? "Blandað" : "Mixed") : t === "activation" ? (is ? "Virkjun" : "Activation") : t === "topup" ? (is ? "Áfylling" : "Top-up") : t === "match" ? (is ? "Leikur" : "Match") : (is ? "Frí" : "Off");
            const PS_LABEL: Record<string, string> = { hypertrophy: is ? "Ofvöxtur / styrktar-þol" : "Hypertrophy", max_strength: is ? "Hámarksstyrkur" : "Max strength", power: is ? "Afl / hraði" : "Power" };
            const dows = is ? ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const kpiKeys = ramp.length ? (Object.keys(ramp[0].byKpi) as WeeklyLoadMetricKey[]).filter((k) => k !== "totalPlayerLoad" && ramp.some((w) => w.byKpi[k] != null)) : [];
            // The pre-season MESO CYCLES (Macro owns the lengths; index-keyed so a resize never orphans a
            // later one). Slice the pre-season window with the coach's cadence + per-block length overrides.
            const preEndIso = up.end ?? new Date(preEndMs).toISOString().slice(0, 10);
            // Backwards periodization (upcoming pre-season): the coach's game-anchored tail blocks are exact
            // and the base block flexes. When no tail is set yet, seed it from the auto layout (all blocks
            // after the first) so the editor opens on the current sequence. In-season keeps the plain slice.
            const autoPre = sliceByLengths(preStart, preEndIso, cadence, {}, 0);
            const effTail = upcomingYear
              ? (nextMesoTail ?? autoPre.slice(1).map((b) => Math.max(2, Math.round((Date.parse(`${b.end}T00:00:00Z`) - Date.parse(`${b.start}T00:00:00Z`)) / (7 * 86_400_000)))))
              : [];
            const preMeso = upcomingYear ? preseasonMeso(preWeeks, effTail, cadence) : null;
            const preBlocks = upcomingYear
              ? sliceByLengths(preStart, preEndIso, cadence, lensToBlockWeeks(preMeso!.lens), 0)
              : sliceByLengths(preStart, preEndIso, cadence, lenOv, 0);
            const blockEndExcl = (b: { end: string }) => b.end; // exclusive
            const weeksBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (7 * 86_400_000)));
            const emphOfBlock = (b: { start: string }) => preseasonBlockForWeeksOut(weeksBetween(b.start, preEndIso));
            const seqTotal = preBlocks.reduce((s, b) => s + weeksBetween(b.start, blockEndExcl(b)), 0);
            return (<div className="space-y-4">
          {flowNote(is ? "Makró-fasar · leikir · Kröfur" : "Macro phases · fixtures · Demands", is ? "Vikuuppsetning (week_plans) · Mesó · PDF" : "Week Setup (week_plans) · Meso · PDF")}

          {/* Pre-season SETUP — one card: controls, the meso-cycle sequence (built backwards from the opener),
              and the research "why" behind a toggle (explainability: jargon off the primary view). */}
          {(() => {
            // Backwards editor state (upcoming pre-season only): the coach-controlled tail blocks nearest the
            // game; the base block flexes. Edits persist the derived blockWeeks + preMesoTail to the next row.
            const tailVals = preMeso?.tail ?? [];
            const baseLen = preMeso ? preMeso.base.reduce((s, n) => s + n, 0) : 0;
            const roomForMore = preMeso != null && (baseLen - 3) >= PRE_MIN_BLOCK; // adding a 3-wk block keeps base ≥ 2
            const setTailLen = (ti: number, v: number) => { const t = [...tailVals]; t[ti] = v; persistNextMesoTail(t, preWeeks, cadence, preYear); };
            const removeTail = (ti: number) => persistNextMesoTail(tailVals.filter((_, i) => i !== ti), preWeeks, cadence, preYear);
            const addTail = () => persistNextMesoTail([...tailVals, 3], preWeeks, cadence, preYear);
            const resetTail = () => { setNextMesoTail(null); setPreBlockLenOv({}); (async () => { try { await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ seasonYear: preYear, overrides: { preMesoTail: null, blockWeeks: {} } }) }); } catch { /* best-effort */ } })(); };
            const baseCount = preMeso?.base.length ?? 0;
            return (
          <section className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className={h2}>{is ? "Undirbúningur — uppsetning" : "Pre-season setup"}</h2>
              <span className="text-[12px] text-slate-500">{is ? "hefst" : "starts"} <b className="text-slate-700">{shortDate(preStart, is)}</b> · {preWeeks} {is ? "vikur" : "weeks"} · {is ? "endar á fyrsta keppnisleik" : "ends at the first competitive game"}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
              <label className="flex items-center gap-1.5 font-medium text-slate-600">{is ? "Vika 1 ×leik" : "Week 1 ×match"}
                <input type="number" step={0.1} min={0.5} max={3} value={psW1} onChange={(e) => { const v = Math.max(0.5, Math.min(3, Number(e.target.value) || 1.3)); setPreW1(v); }} className="w-16 rounded border border-slate-300 px-1.5 py-0.5 tabular-nums" />
              </label>
              <label className="flex items-center gap-1.5 font-medium text-slate-600">{is ? "Æfingar/viku" : "Sessions/wk"}
                <select value={psSess} onChange={(e) => { const v = Number(e.target.value); setPreSess(v); }} className="rounded border border-slate-300 px-1.5 py-0.5">{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select>
              </label>
              <span className="text-[11px] text-slate-400">{is ? "Stillist hér eða í Leikmenn — endurflæðir allar vikur." : "Edit here or in Players — re-flows every week."}</span>
              {preDaySave === "saving" && <span className="text-[11px] text-slate-400">{is ? "Vista…" : "Saving…"}</span>}
              {preDaySave === "saved" && <span className="text-[11px] font-medium text-emerald-700">{is ? "✓ Dagar vistaðir í Vikuuppsetningu" : "✓ Days saved to Week Setup"}</span>}
              {preDaySave === "err" && <span className="text-[11px] font-medium text-[#a83e28]">{is ? "Vistun mistókst" : "Save failed"}</span>}
            </div>

            {/* Meso-cycle sequence — planned BACKWARDS from the opener. */}
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-bold text-slate-800">{is ? "Meso-lotur" : "Meso cycles"}</h3>
              <span className="text-[12px] text-slate-500">{is ? "samtals" : "total"} <b className={`tabular-nums ${seqTotal === preWeeks ? "text-slate-900" : "text-[#de9328]"}`}>{seqTotal}</b> {is ? `af ${preWeeks} vikum` : `of ${preWeeks} weeks`}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-slate-500">{upcomingYear
              ? (is ? "Unnið aftur á bak: síðasta lotan endar á fyrsta leik (afl/peaking) og grunn-lotan gleypir afganginn. Bættu við lotum eða breyttu lengd þeirra sem eru næst leiknum." : "Planned backwards: the last block ends at the first game (power/peaking) and the base block absorbs the remainder. Add blocks or change the length of the ones nearest the game.")
              : (is ? "Settu lengd hverrar meso-lotu. Mesó-flipinn les þær — breyting hér endurflæðir dagatalið fram að fyrsta leik." : "Set each meso cycle's length. The Meso tab reads them — a change here re-flows the calendar up to the first game.")}</p>

            {upcomingYear ? (
              <div className="mt-3 space-y-1.5">
                {preBlocks.map((b, bi) => {
                  const bw = weeksBetween(b.start, blockEndExcl(b));
                  const emph = emphOfBlock(b);
                  const isBase = bi < baseCount;          // the flexible base block(s) — earliest
                  const ti = bi - baseCount;               // index into the coach-controlled tail
                  const endsAtGame = bi === preBlocks.length - 1;
                  return (
                    <div key={b.index} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 ${isBase ? "border-slate-200 bg-slate-50" : "border-[#2740e6]/20 bg-[#2740e6]/[0.03]"}`}>
                      <span className="text-[13px] font-semibold text-slate-800">{is ? "Lota" : "Block"} {b.index + 1}</span>
                      <span className="text-[12px] text-slate-500">{shortDate(b.start, is)}–{shortDate(isoAdd(b.end, -1), is)} · {bw} {is ? "v" : "wk"}</span>
                      {emph && <span className="rounded-full bg-[#7a5cc4]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7a5cc4]">{PS_LABEL[emph]}</span>}
                      {endsAtGame && <span className="rounded-full bg-[#1c7a4a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#1c7a4a]">{is ? "→ endar á leik" : "→ ends at game"}</span>}
                      {isBase ? (
                        <span className="ml-auto text-[11px] font-medium text-slate-400">{is ? "grunnur (sveigjanlegur)" : "base (flexes)"}</span>
                      ) : (
                        <div className="ml-auto flex items-center gap-1.5">
                          <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">{is ? "Lengd" : "Length"}
                            <select value={tailVals[ti] ?? ""} onChange={(e) => setTailLen(ti, Number(e.target.value))} className="rounded border border-slate-300 bg-white px-1.5 py-0.5">
                              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {is ? "v" : "wk"}</option>)}
                            </select>
                          </label>
                          <button type="button" onClick={() => removeTail(ti)} title={is ? "Fjarlægja lotu" : "Remove block"} aria-label={is ? "Fjarlægja lotu" : "Remove block"} className="rounded px-1.5 py-0.5 text-[13px] text-slate-400 hover:bg-[#a83e28]/10 hover:text-[#a83e28]">✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center gap-3 pt-0.5">
                  <button type="button" onClick={addTail} disabled={!roomForMore} className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${roomForMore ? "border-[#2740e6]/40 text-[#2740e6] hover:bg-[#2740e6]/5" : "cursor-not-allowed border-slate-200 text-slate-300"}`}>+ {is ? "Bæta við meso-lotu" : "Add meso cycle"}</button>
                  {nextMesoTail != null && <button type="button" onClick={resetTail} className="text-[12px] font-medium text-slate-500 hover:text-slate-700 hover:underline">{is ? "Núllstilla í sjálfgefið" : "Reset to auto"}</button>}
                  {!roomForMore && <span className="text-[11px] text-slate-400">{is ? "ekki pláss fyrir fleiri lotur" : "no room for more blocks"}</span>}
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {preBlocks.map((b) => {
                  const bw = weeksBetween(b.start, blockEndExcl(b));
                  const emph = emphOfBlock(b);
                  return (
                    <div key={b.index} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="text-[13px] font-semibold text-slate-800">{is ? "Lota" : "Block"} {b.index + 1}</span>
                      <span className="text-[12px] text-slate-500">{shortDate(b.start, is)}–{shortDate(isoAdd(b.end, -1), is)} · {bw} {is ? "v" : "wk"}</span>
                      {emph && <span className="rounded-full bg-[#7a5cc4]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7a5cc4]">{PS_LABEL[emph]}</span>}
                      <label className="ml-auto flex items-center gap-1.5 text-[12px] font-medium text-slate-600">{is ? "Lengd" : "Length"}
                        <select value={lenOv[String(b.index)] ?? lenOv[b.start] ?? ""} onChange={(e) => setPreLen(String(b.index), e.target.value === "" ? null : Number(e.target.value))} className="rounded border border-slate-300 bg-white px-1.5 py-0.5">
                          <option value="">{is ? `Sjálfgefið (${cadence}v)` : `Auto (${cadence}w)`}</option>
                          {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {is ? "vikur" : "weeks"}</option>)}
                        </select>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Research "why" — explainability L2 (jargon + citations behind a toggle, off the primary view). */}
            <details className="mt-3 text-[11.5px] text-slate-500">
              <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-700">{is ? "Af hverju breyturnar stigþyngjast ólíkt" : "Why the variables ramp differently"}</summary>
              <p className="mt-2 leading-relaxed">
                <i className="mr-1 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full align-middle" style={{ background: "#a83e28" }} />
                <b className="font-semibold text-slate-600">{is ? "Vélrænar breytur" : "Biomechanical"}</b> {is ? "(hemlun, sprettir, háhraðahlaup, stefnubreytingar) stigþyngjast varlegar" : "(decel, sprint, HSR, COD) ramp more conservatively"}
                <i className="mx-1 ml-3 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full align-middle" style={{ background: "#2740e6" }} />
                <b className="font-semibold text-slate-600">{is ? "efnaskipta-breytur" : "metabolic"}</b> {is ? "(hröðun, vegalengd) línulega — ólíkar aðlögunarleiðir vefja og efnaskipta" : "(accel, distance) linearly — tissue vs metabolic adapt differently"} (Vanrenterghem 2017, Harper &amp; McBurnie 2021, Duhig 2016).
              </p>
              <p className="mt-1.5 leading-relaxed">
                {is
                  ? "Hvert KPI er sýnt sem sitt eigið ×leik-margfeldi (vikuálag ÷ einn leikur af þeirri breytu) — svo háhraðahlaup, sem lítur út fyrir fáa metra, vegur álagslega nærri heildarvegalengd. Breyturnar hafa ekki sama gildi (training:match, PMC6747517). Músarbending sýnir rannsóknar-viðmiðssvið; gult = yfir sviði (eðlilegt í undirbúnings-uppbyggingu)."
                  : "Each KPI is shown as its own ×match multiple (weekly ÷ one match of that KPI) — so high-speed running, which looks like few metres, carries a load close to total distance. The variables don't share a value (training:match, PMC6747517). Hover for the research reference range; amber = above range (normal in a pre-season build)."}
              </p>
            </details>
          </section>
            );
          })()}

          {/* One card per pre-season week, grouped under its meso cycle. */}
          {ramp.map((w, i) => {
            const cw = cal.weeks[i];
            const weekMon = cw?.weekStart ?? isoAdd(preStart, i * 7);
            const emph = preseasonBlockForWeeksOut(preWeeks - i);
            const weekTests = tests.filter((tp) => tp.weeks.includes(i + 1));
            const weekFx = preFixtures.filter((d) => d >= weekMon && d < isoAdd(weekMon, 7));
            const pv = primary(w);
            const blk = preBlocks.find((b) => b.start === weekMon); // this week starts a new meso cycle?
            const blkEmph = blk ? emphOfBlock(blk) : null;
            // Friendly BUDGET: a pre-season friendly is partial minutes (match-fitness build-up), ramping
            // across pre-season. The partial friendly COUNTS toward the week's target; training fills the
            // remainder (target − friendly). Mirrors the coach's model: 22,000 target − 7,000 friendly = 15,000.
            const exposure = preseasonMatchExposure(i + 1, preWeeks);
            const friendlyFrac = Math.min(0.95, exposure * weekFx.length);
            const mins = Math.round(exposure * 90);
            const friendlyPL = weekFx.length > 0 && matchLoadUnit != null ? Math.round(friendlyFrac * matchLoadUnit) : null;
            const trainingPL = friendlyPL != null && w.weeklyLoadTarget != null ? Math.max(0, w.weeklyLoadTarget - friendlyPL) : null;
            const matchTD = tka.totalDistance ?? null, weeklyTD = w.byKpi.totalDistance ?? null;
            const friendlyTD = weekFx.length > 0 && matchTD != null ? Math.round(friendlyFrac * matchTD) : null;
            const trainingTD = friendlyTD != null && weeklyTD != null ? Math.max(0, weeklyTD - friendlyTD) : null;
            // Scale the displayed TRAINING days so they sum to the training remainder (match day is already partial).
            const trainDaySum = cw ? cw.days.filter((d) => d.type !== "match" && d.type !== "rest").reduce((s, d) => s + (d.load ?? 0), 0) : 0;
            const dayScale = trainingPL != null && trainDaySum > 0 ? trainingPL / trainDaySum : 1;
            const dayLoad = (d: CalDay) => d.load == null ? null : d.type === "match" ? d.load : Math.round(d.load * dayScale);
            // Open this week in Week Setup — the coach SEES the recommended day-by-day load there and can EDIT it.
            const openWeek = () => { setPreseasonJumpWeek(weekMon); setTab("micro"); };
            return (
              <React.Fragment key={i}>
              {blk && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[12px] font-semibold text-slate-500">
                  <span className="rounded-full bg-[#7a5cc4]/10 px-2 py-0.5 text-[#7a5cc4]">{is ? "Meso-lota" : "Meso cycle"} {blk.index + 1}</span>
                  <span>{weeksBetween(blk.start, blk.end)} {is ? "vikur" : "weeks"}</span>
                  {blkEmph && <span className="font-normal text-slate-400">· {PS_LABEL[blkEmph]}</span>}
                </div>
              )}
              <section className={`${card} min-w-0`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-[15px] font-bold text-slate-900">{is ? "Vika" : "Week"} {i + 1}</span>
                  <button type="button" onClick={openWeek} title={is ? "Opna í Vikuuppsetningu" : "Open in Week Setup"} className="rounded text-[12px] font-medium text-[#2740e6] underline decoration-dotted underline-offset-2 hover:decoration-solid">{shortDate(weekMon, is)}</button>
                  <span className="rounded-full bg-[#2740e6]/10 px-2 py-0.5 text-[11px] font-semibold text-[#2740e6]">×{w.multipleOfMatch} {is ? "leik" : "match"}</span>
                  {pv > 0 && <span className="text-[13px] font-semibold tabular-nums text-slate-900">{fmtv(pv)} {unitLabel}</span>}
                  {w.perSessionLoad != null && <span className="text-[12px] text-slate-500">≈ {w.perSessionLoad}/{is ? "æf" : "sess"}</span>}
                  {emph && <span className="rounded-full bg-[#7a5cc4]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7a5cc4]">{PS_LABEL[emph]}</span>}
                  <button type="button" onClick={openWeek} className="ml-auto text-[12px] font-semibold text-[#2740e6] hover:underline">{is ? "Opna / breyta í Vikuuppsetningu →" : "Open / edit in Week Setup →"}</button>
                </div>
                {cw && (
                  <>
                  <div className="mt-2.5 grid grid-cols-7 gap-1">
                    {cw.days.map((d, di) => { const dl = dayLoad(d); const isMatch = d.type === "match";
                      // A match day is fixed to its fixture — clicking opens Week Setup. Any other day opens a
                      // stimulus picker right here (the draft): Off or a training type, persisted to week_plans.
                      const open = preDayPick?.weekStart === cw.weekStart && preDayPick?.di === di;
                      const title = isMatch
                        ? `${dows[di]} · ${typeName(d.type)}${dl != null ? ` · ${dl} PL (~${mins} ${is ? "mín" : "min"})` : ""} — ${is ? "leikdagur (fastur við leikinn) — opnar vikuna" : "match day (fixed to the fixture) — opens the week"}`
                        : `${dows[di]} · ${typeName(d.type)}${dl != null && d.type !== "rest" ? ` · ${dl} PL` : ""} — ${is ? "smelltu til að velja áherslu eða frí" : "click to choose the stimulus or set off"}`;
                      return (
                      <button key={di} type="button" onClick={() => isMatch ? openWeek() : setPreDayPick(open ? null : { weekStart: cw.weekStart, di })} title={title} aria-label={title} aria-expanded={isMatch ? undefined : open} className={`min-w-0 cursor-pointer rounded-md border px-1 py-1.5 text-center transition-shadow hover:ring-2 hover:ring-[#2740e6]/30 focus:outline-none focus:ring-2 focus:ring-[#2740e6]/40 ${open ? "ring-2 ring-[#2740e6]/50" : ""}`} style={{ background: tint[d.type] ?? "#F8FAFC", borderColor: `${typeColor[d.type] ?? "#CBD5E1"}33` }}>
                        <div className="text-[9px] text-slate-400">{dows[di]}</div>
                        <div className="truncate text-[10px] font-semibold" style={{ color: typeColor[d.type] ?? "#64748B" }}>{d.type === "rest" ? "–" : typeName(d.type)}</div>
                        <div className="text-[10px] tabular-nums text-slate-600">{dl != null && d.type !== "rest" ? dl : ""}</div>
                      </button>
                    ); })}
                  </div>
                  {/* Inline stimulus picker for the day the coach clicked (draft edit, persists to week_plans). */}
                  {preDayPick?.weekStart === cw.weekStart && (() => {
                    const d = cw.days[preDayPick.di]; if (!d || d.type === "match") return null;
                    const picks: Array<{ k: CalType | "rest"; label: string }> = [
                      { k: "rest", label: is ? "Frí" : "Off" },
                      { k: "mechanical", label: is ? "Mekanískt" : "Mechanical" },
                      { k: "locomotive", label: is ? "Hlaup" : "Locomotive" },
                      { k: "mixed", label: is ? "Blandað" : "Mixed" },
                      { k: "activation", label: is ? "Virkjun" : "Activation" },
                      { k: "topup", label: is ? "Áfylling" : "Top-up" },
                    ];
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md border border-[#2740e6]/20 bg-[#2740e6]/[0.04] px-2 py-1.5">
                        <span className="mr-0.5 text-[11px] font-semibold text-slate-600">{dows[preDayPick.di]} {d.md ? `· ${d.md}` : ""} —</span>
                        {picks.map((p) => { const active = d.type === p.k; return (
                          <button key={p.k} type="button" onClick={() => setPreDay(cw, preDayPick.di, p.k)} className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${active ? "border-transparent text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`} style={active ? { background: typeColor[p.k as string] ?? "#64748B" } : undefined}>{p.label}</button>
                        ); })}
                        <button type="button" onClick={() => setPreDayPick(null)} className="ml-auto rounded px-1 text-[12px] text-slate-400 hover:text-slate-600" aria-label={is ? "Loka" : "Close"}>✕</button>
                      </div>
                    );
                  })()}
                  <p className="mt-1 text-[10.5px] text-slate-400">{is ? "Smelltu á dag til að velja áherslu (mekanískt/hlaup/blandað…) eða frí — uppkast sem vistast strax. Dagsetningin eða tengillinn opnar vikuna í Vikuuppsetningu til að fínstilla." : "Click a day to choose its stimulus (mechanical/locomotive/mixed…) or set it off — a draft that saves instantly. The date or the link opens the week in Week Setup to refine."}</p>
                  </>
                )}
                {/* Friendly budget — the partial match counts toward the week; training fills the remainder. */}
                {weekFx.length > 0 && (
                  <div className="mt-2 rounded-md border border-[#de9328]/30 bg-[#de9328]/5 px-2.5 py-1.5 text-[11.5px] text-slate-700">
                    <b className="font-semibold text-[#9a6514]">{is ? "Æfingaleikur" : "Friendly"}</b> ~{mins} {is ? "mín" : "min"} {is ? "telur inn í vikumarkið" : "counts toward the week"}
                    {friendlyPL != null && <> : <b className="tabular-nums">{friendlyPL.toLocaleString("en-US")}</b> PL</>}{friendlyTD != null && <> / <b className="tabular-nums">{friendlyTD.toLocaleString("en-US")}</b> m</>}
                    {" → "}{is ? "æfingar" : "training"} ≈ <b className="tabular-nums">{trainingPL != null ? trainingPL.toLocaleString("en-US") : "–"}</b> PL{trainingTD != null && <> / <b className="tabular-nums">{trainingTD.toLocaleString("en-US")}</b> m</>}
                    {trainingPL != null && <span className="text-slate-500"> ({Math.round(trainingPL / w.sessionCount)}/{is ? "æf" : "sess"})</span>}
                    <span className="mt-0.5 block text-[10.5px] text-slate-400">{is ? `Vikumark ${w.weeklyLoadTarget != null ? w.weeklyLoadTarget.toLocaleString("en-US") + " PL" : "–"}. Leikmenn spila hluta leiks í undirbúningi — hlutfallið rís yfir tímabilið (Buchheit/Gabbett).` : `Week target ${w.weeklyLoadTarget != null ? w.weeklyLoadTarget.toLocaleString("en-US") + " PL" : "–"}. Players play partial minutes in pre-season — the share ramps across pre-season (Buchheit/Gabbett).`}</span>
                  </div>
                )}
                {kpiKeys.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {kpiKeys.map((k) => { const lab = WEEKLY_LOAD_LABELS[k]; const val = w.byKpi[k]; if (val == null) return null; const pw = kpiPathway(k); const pwDot = pw === "biomechanical" ? "#a83e28" : pw === "physiological" ? "#2740e6" : "#94a3b8";
                      // Impact-weighted read: each KPI as its OWN ×match multiple (weekly ÷ one match of that KPI).
                      // Shows the variables don't share a value — HSR's small metres are a big ×match (T:M).
                      const mv = tka[k]; const xmatch = mv != null && mv > 0 ? Math.round((val / mv) * 100) / 100 : null;
                      const ref = kpiTmRefRange(k); const over = xmatch != null && ref != null && xmatch > ref[1];
                      const pwName = pw === "biomechanical" ? (is ? "vélræn" : "biomechanical") : pw === "physiological" ? (is ? "efnaskipti" : "physiological") : (is ? "rúmmál" : "volume");
                      const title = `${is ? lab.is : lab.en} — ${xmatch != null ? `×${xmatch} leik` : "—"}${ref ? ` · ${is ? "viðmið" : "ref"} ${ref[0]}–${ref[1]}×${over ? (is ? " (yfir — undirbúnings-uppbygging)" : " (above — pre-season build)") : ""}` : ""} · ${pwName}`;
                      return (
                      <span key={k} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] text-slate-600" title={title}><i className="h-1.5 w-1.5 rounded-full" style={{ background: pwDot }} />{xmatch != null && <span className={`font-semibold tabular-nums ${over ? "text-[#de9328]" : "text-slate-900"}`}>×{xmatch}</span>}<span className="text-slate-400">{is ? lab.is : lab.en}</span> <span className="tabular-nums text-slate-500">{val.toLocaleString("en-US")}{lab.unit}</span></span>
                    ); })}
                  </div>
                )}
                {(weekTests.length > 0 || weekFx.length > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {weekTests.map((tp) => <span key={tp.protocol.key} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700" title={is ? tp.protocol.name.is : tp.protocol.name.en}>{is ? TEST_SHORT[tp.protocol.key].is : TEST_SHORT[tp.protocol.key].en}</span>)}
                    {weekFx.map((d) => <span key={d} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">{is ? "Æfingaleikur" : "Friendly"} {shortDate(d, is)}</span>)}
                  </div>
                )}
              </section>
              </React.Fragment>
            );
          })}

            </div>);
          })()}

          {/* SQUAD DEMANDS tab */}
          {tab === "demands" && (() => {
            // ONE position picker drives the whole tab (verdict → three axes → week shape → raw baselines).
            const rows = [plan.teamBaseline, ...(plan.positionBaselines ?? [])].filter((b) => b && b.avg.sessions > 0);
            if (rows.length === 0) {
              return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><p className="text-[13px] text-slate-600">{is ? "Engin æfingagögn enn — kröfurnar birtast þegar GPS/álagsgögn eru komin inn." : "No training data yet — the demands appear once GPS/load data is in."}</p></section>;
            }
            const pos = rows.find((b) => b.key === mdPosKey) ?? rows[0];
            const posName = is ? pos.label.is : pos.label.en;
            const ax = pos.axes;
            const season = pos.avg;
            const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
            const h2 = "text-[15px] font-bold text-slate-900";
            const km = (m: number | null) => (m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
            const relPl = (pl: number | null) => (pl == null || season.playerLoad == null || season.playerLoad === 0 ? null : Math.round((pl / season.playerLoad) * 100) - 100);
            const AXIS_COLOR: Record<string, string> = { running: "#2740e6", mechanical: "#a83e28", internal: "#1c7a4a" };
            const WARN = { background: "rgba(168,62,40,0.1)", color: "#8a3220" }, NEUTRAL = { background: "#f1f5f9", color: "#334155" };
            const hasMatch = (a: { metrics: Array<{ matchValue: string }> }) => a.metrics.some((m) => m.matchValue !== "–");
            const axisBadge = (a: typeof ax.running): { t: Bi; s: React.CSSProperties } =>
              a.axis === "running" ? (!hasMatch(a) ? { t: { en: "No match data", is: "Engin leikgögn" }, s: NEUTRAL } : ax.hsrDeficit ? { t: { en: "Well under match", is: "Langt undir leik" }, s: WARN } : { t: { en: "Under match (normal)", is: "Undir leik (eðlilegt)" }, s: NEUTRAL })
              : a.axis === "mechanical" ? (!hasMatch(a) ? { t: { en: "No match data", is: "Engin leikgögn" }, s: NEUTRAL } : ax.mechNeglect ? { t: { en: "Lagging", is: "Dregst aftur úr" }, s: WARN } : { t: { en: "Over match (normal)", is: "Yfir leik (eðlilegt)" }, s: NEUTRAL })
              : { t: { en: "Gates the day", is: "Stýrir deginum" }, s: NEUTRAL };
            const axisList = [ax.running, ax.mechanical, ax.internal].filter((a) => a.axis !== "internal" || a.metrics.length > 0); // internal shows only when it carries metrics (as before)
            // Level 0 — one sentence from the engine's own flags (no new judgement).
            const verdict = ax.hsrDeficit && ax.mechNeglect
              ? (is ? `${posName}: hlaupaálag á æfingum er langt undir leik og vélræni ásinn dregst líka aftur úr.` : `${posName}: training running load is well under the match and the mechanical axis lags too.`)
              : ax.hsrDeficit
                ? (is ? `${posName}: hlaupaálag á æfingum er langt undir leik — háhraði er halla-ásinn.` : `${posName}: training running load is well under the match — HSR is the deficit axis.`)
                : ax.mechNeglect
                  ? (is ? `${posName}: hlaup er hlaðið en vélræni ásinn (hröðun/hemlun) dregst aftur úr.` : `${posName}: running is loaded but the mechanical axis (accel/decel) lags behind.`)
                  : (is ? `${posName}: æfingar fylgja venjulegu mynstri — undir leik í hlaupi, yfir leik í hröðun/hemlun.` : `${posName}: training follows the normal pattern — under the match on running, over it on accel/decel.`);
            // The week's shape — PL by MD-day relative to the position's season average.
            const mdOff = (label: string) => { const m = /MD([+-]\d+)/.exec(label); return m ? Number(m[1]) : 0; };
            const mdColor = (off: number) => (off === -4 || off === -3 ? "#a83e28" : off === -2 || off === -1 ? "#de9328" : off > 0 ? "#1c7a4a" : "#94a3b8");
            const days = (pos.md?.days ?? []).map((d) => ({ d, off: mdOff(d.label.en), rp: relPl(d.avg.playerLoad) }));
            const maxPct = Math.max(130, ...days.map((x) => (x.rp ?? 0) + 100));
            const PHASE_META: Record<string, { color: string; sub: Bi }> = {
              load: { color: "#a83e28", sub: { en: "MD-4 / MD-3 — the loading days", is: "MD-4 / MD-3 — álagsdagarnir" } },
              sharpen: { color: "#b8741a", sub: { en: "MD-2 / MD-1 — sharpen + primer", is: "MD-2 / MD-1 — skerpa + undirbúningur" } },
              recover: { color: "#1c7a4a", sub: { en: "MD+1 / MD+2 — recovery", is: "MD+1 / MD+2 — endurheimt" } },
            };
            const tableRows = [...(plan.teamBaseline && plan.teamBaseline.avg.sessions > 0 ? [plan.teamBaseline] : []), ...plan.positionBaselines.filter((b) => b.avg.sessions > 0)];

            return (<div className="space-y-4">
          {flowNote(is ? "Leikgögn · grunnlínur · próf" : "Match data · baselines · tests", is ? "leik-einingin sem ÖLL mörk skalast af (Makró/Mesó/Míkró/Leikmenn)" : "the match unit ALL targets scale from (Macro/Meso/Micro/Players)")}

          {/* 1 — POSITION PICKER */}
          <section className="flex flex-wrap items-center gap-x-4 gap-y-2.5" aria-label={is ? "Staða" : "Position"}>
            <span className="text-[12px] font-bold text-slate-700">{is ? "Sýna fyrir" : "Show for"}</span>
            <div role="radiogroup" className="flex flex-wrap gap-1.5">
              {rows.map((b) => {
                const on = b.key === pos.key;
                return (
                  <button key={b.key} type="button" role="radio" aria-checked={on} onClick={() => setMdPosKey(b.key)}
                    className={`h-10 rounded-full border px-3.5 text-[13px] font-semibold ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"}`}>
                    {is ? b.label.is : b.label.en} <span className={`font-normal ${on ? "text-white/75" : "text-slate-500"}`}>{b.avg.players}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2 — VERDICT (Level 0 + 1) */}
          <section className={card}>
            <p className="text-[17px] font-bold text-slate-900">{verdict}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-slate-700">
              {ax.hsrDeficit && <li>{is ? ax.hsrDeficit.is : ax.hsrDeficit.en}</li>}
              {ax.mechNeglect && <li>{is ? ax.mechNeglect.is : ax.mechNeglect.en}</li>}
              {ax.capabilities.map((c, i) => <li key={i}>{is ? c.is : c.en}</li>)}
              <li>{is ? "Það er ekkert eitt „%-af-leik“ — lestu ásana þrjá hver fyrir sig (Figueiredo o.fl.)." : "There is no single \"% of match\" — read the three axes separately (Figueiredo et al.)."}</li>
            </ul>
          </section>

          {/* 3 — THREE AXES vs THE MATCH */}
          <section>
            <h2 className={`${h2} mb-2.5`}>{is ? "Þrír ásar gagnvart leiknum" : "Three axes vs the match"}</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
              {axisList.map((a) => {
                const badge = axisBadge(a);
                return (
                  <div key={a.axis} className="rounded-xl border border-slate-200 bg-white p-4" style={{ borderTop: `4px solid ${AXIS_COLOR[a.axis]}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[15px] font-bold text-slate-900">{is ? a.label.is : a.label.en}</span>
                      <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={badge.s}>{is ? badge.t.is : badge.t.en}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-600">{is ? a.matchNote.is : a.matchNote.en}</p>
                    {a.metrics.length > 0 && (
                      <table className="mt-2.5 w-full text-[13px]">
                        <thead><tr className="text-left text-[11px] text-slate-500">
                          <th className="py-1 font-semibold">{is ? "Mæling" : "Metric"}</th>
                          <th className="py-1 text-right font-semibold">{is ? "Leikur" : "Match"}</th>
                          <th className="py-1 text-right font-semibold">{is ? "Æfingaþak" : "Training ceiling"}</th>
                          <th className="py-1 text-right font-semibold">{is ? "Bil" : "Band"}</th>
                        </tr></thead>
                        <tbody>
                          {a.metrics.map((m, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="py-1.5 text-slate-800">{is ? m.metric.is : m.metric.en}</td>
                              <td className="py-1.5 text-right tabular-nums text-slate-600">{m.matchValue}</td>
                              <td className="py-1.5 text-right font-bold tabular-nums text-slate-900">{m.trainingCeiling}</td>
                              <td className="py-1.5 text-right tabular-nums text-slate-600">{m.band}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {a.flag && <p className="mt-2 text-[12px] font-medium text-[#8a3220]">{is ? a.flag.is : a.flag.en}</p>}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4 — THE WEEK'S SHAPE: PL by MD-day + the three phases */}
          {(pos.md?.phases.length ?? 0) > 0 && (
            <section className={card}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className={h2}>{is ? "Lögun vikunnar — kröfur eftir MD-degi" : "The week's shape — demands by MD-day"}</h2>
                <span className="text-[12px] text-slate-500">{is ? "Ársmeðaltalið blandar öllum dögum saman — hér sést hvað hver dagur gagnvart leik krefst í raun." : "The season average blends every day together — this shows what each day relative to the match actually asks."}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-5">
                {days.length > 0 && (
                  <div className="min-w-0 flex-[1_1_420px]">
                    <div className="text-[12px] font-semibold text-slate-500">{is ? "Player Load per æfingu, % af ársmeðaltali stöðunnar" : "Player Load per session, % of the position's season average"}</div>
                    <div className="relative mt-2 h-[150px] border-b border-slate-300">
                      <div aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-slate-400" style={{ bottom: `${(100 / maxPct) * 100}%` }}>
                        <span className="absolute -top-4 right-0 text-[11px] text-slate-500">{is ? "ársmeðaltal" : "season avg"}</span>
                      </div>
                      <div className="grid h-full items-end gap-2.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                        {days.map(({ d, off, rp }) => (
                          <div key={d.key} className="flex h-full flex-col items-center justify-end" title={`${is ? d.label.is : d.label.en}: PL ${d.avg.playerLoad == null ? "–" : Math.round(d.avg.playerLoad)} · ${d.avg.sessions} ${is ? "æfingar" : "sessions"}`}>
                            <span className="text-[12px] font-bold tabular-nums" style={{ color: mdColor(off) }}>{rp == null ? "–" : `${rp > 0 ? "+" : ""}${rp}%`}</span>
                            <div className="w-full max-w-[44px] rounded-t" style={{ height: `${(((rp ?? -100) + 100) / maxPct) * 100}%`, background: mdColor(off) }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-1.5 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                      {days.map(({ d }) => <span key={d.key} className="text-center text-[12px] font-bold text-slate-800">{is ? d.label.is : d.label.en}</span>)}
                    </div>
                  </div>
                )}
                <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-2">
                  {pos.md.phases.map((ph) => {
                    const a = ph.avg, meta = PHASE_META[ph.key], rp = relPl(a.playerLoad);
                    return (
                      <div key={ph.key} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                        <span className="h-9 w-2.5 shrink-0 rounded-sm" style={{ background: meta?.color ?? "#94a3b8" }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-bold text-slate-900">{is ? ph.label.is : ph.label.en} <span className="font-normal text-slate-500">· {meta ? (is ? meta.sub.is : meta.sub.en) : ""} · {a.sessions} {is ? "æf." : "sess."}</span></span>
                          <span className="block text-[12px] text-slate-700">{is ? "Vegal." : "Dist"} {km(a.distanceM)} · HSR {a.hsrM == null ? "–" : `${Math.round(a.hsrM)} m`} · PL {a.playerLoad == null ? "–" : Math.round(a.playerLoad)} · Acc/Dec {a.accel ?? "–"}/{a.decel ?? "–"}</span>
                        </span>
                        {rp != null && <span className="shrink-0 text-[18px] font-bold tabular-nums" style={{ color: meta?.color }} title={is ? "PL á þessum dögum vs ársmeðaltal" : "PL on these days vs the season average"}>{rp > 0 ? "+" : ""}{rp}%</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              {days.length > 0 && (
                <details className="mt-4" open={mdDaysOpen} onToggle={(e) => setMdDaysOpen((e.target as HTMLDetailsElement).open)}>
                  <summary className="cursor-pointer py-1 text-[13px] font-semibold text-[#2740e6]">{is ? `MD-dag sundurliðun (${days.length})` : `MD-day detail (${days.length})`}</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-[13px]">
                      <thead><tr className="text-left text-[11px] text-slate-500">
                        <th className="py-1 pr-2 font-semibold">MD</th>
                        <th className="py-1 pr-2 text-right font-semibold">{is ? "Æfingar" : "Sessions"}</th>
                        <th className="py-1 pr-2 text-right font-semibold">{is ? "Vegal." : "Dist"}</th>
                        <th className="py-1 pr-2 text-right font-semibold">HSR</th>
                        <th className="py-1 pr-2 text-right font-semibold">PL</th>
                        <th className="py-1 pr-2 text-right font-semibold">% PL</th>
                        <th className="py-1 pl-2 text-right font-semibold">Acc/Dec</th>
                      </tr></thead>
                      <tbody>
                        {days.map(({ d, rp }) => (
                          <tr key={d.key} className="border-t border-slate-100">
                            <td className="py-1.5 pr-2 font-semibold text-slate-800">{is ? d.label.is : d.label.en}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{d.avg.sessions}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{km(d.avg.distanceM)}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{d.avg.hsrM == null ? "–" : `${Math.round(d.avg.hsrM)} m`}</td>
                            <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{d.avg.playerLoad == null ? "–" : Math.round(d.avg.playerLoad)}</td>
                            <td className={`py-1.5 pr-2 text-right tabular-nums ${rp == null ? "text-slate-400" : rp > 0 ? "text-[#a83e28]" : "text-[#15603a]"}`}>{rp == null ? "–" : `${rp > 0 ? "+" : ""}${rp}%`}</td>
                            <td className="py-1.5 pl-2 text-right tabular-nums">{d.avg.accel ?? "–"}/{d.avg.decel ?? "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[12px] text-slate-500">{is ? "MD-dagur = fjarlægð æfingar frá næsta leik (±dagar). Hver flokkur þarf ≥3 æfingar til að birtast. % PL = vs árs-meðaltal stöðunnar. Leikdagur ekki talinn (þetta er æfingakrafa)." : "MD-day = the session's distance from the nearest match (±days). Each bucket needs ≥3 sessions to show. % PL = vs the position's season average. The match day is excluded (this is training demand)."}</p>
                </details>
              )}
            </section>
          )}

          {/* 5 — RAW BASELINES (Level 2, folded) */}
          <details className={card}>
            <summary className="cursor-pointer py-1 text-[15px] font-bold text-slate-900">{is ? "Grunnlína allra staða (GPS + IMA)" : "Baseline for every position (GPS + IMA)"} <span className="text-[12px] font-medium text-slate-500">· {is ? "meðaltal per æfingu yfir tímabilið" : "mean per session over the season"}</span></summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead><tr className="text-left text-[11px] text-slate-500">
                  <th className="py-1.5 pr-2 font-semibold">{is ? "Staða" : "Position"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{is ? "Vegal." : "Dist"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">HSR</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{is ? "Hám. km/klst" : "Max km/h"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">PL</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Acc/Dec</th>
                  <th className="py-1.5 pl-2 font-semibold">{is ? "IMA fram · hlið · aftur" : "IMA fwd · lat · back"}</th>
                </tr></thead>
                <tbody>
                  {tableRows.map((b) => { const a = b.avg; const isTeam = b.key === -1; const on = b.key === pos.key; return (
                    <tr key={b.key} className={`border-t border-slate-100 ${on ? "bg-[#2740e6]/[0.06]" : isTeam ? "bg-slate-50" : ""}`}>
                      <td className={`py-1.5 pr-2 ${isTeam ? "font-bold" : "font-semibold"} text-slate-900`}>{is ? b.label.is : b.label.en} <span className="font-normal text-slate-500">({a.players})</span></td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{km(a.distanceM)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{a.hsrM == null ? "–" : `${Math.round(a.hsrM)} m`}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{a.maxKmh ?? "–"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{a.playerLoad == null ? "–" : Math.round(a.playerLoad)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{a.accel ?? "–"}/{a.decel ?? "–"}</td>
                      <td className="py-1.5 pl-2">
                        {a.direction ? (
                          <span className="inline-flex h-2 w-28 overflow-hidden rounded-full align-middle" title={`${Math.round(a.direction.forward * 100)} / ${Math.round(a.direction.lateral * 100)} / ${Math.round(a.direction.backward * 100)} %`}>
                            <span className="bg-[#2740e6]" style={{ width: `${a.direction.forward * 100}%` }} /><span className="bg-slate-400" style={{ width: `${a.direction.lateral * 100}%` }} /><span className="bg-amber-500" style={{ width: `${a.direction.backward * 100}%` }} />
                          </span>
                        ) : <span className="text-slate-400">–</span>}
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-slate-500">{is ? "IMA-slá: blátt = fram, grátt = hlið, gult = aftur. Sjálfgefið viðmið leikmanns er HANS staða, ekki allt liðið (Ju)." : "IMA bar: blue = forward, grey = lateral, amber = backward. A player's default falls back to HIS position, not the whole team (Ju)."}</p>
          </details>

          <p className="text-[12px] text-slate-500">{is ? "Tölurnar eru upphafspunktur, aldrei viðmið til að hlýða í blindni — leikmaðurinn, samhengið og viðbragðið stýra deginum (Little & Buchheit — „ekki þrælar GPS-viðmiða“). Figueiredo o.fl. (ás-sértæk æfing:leik hlutföll) · Buchheit & Simpson (vélrænt vs hlaup). Lýsandi — aldrei readiness-liturinn." : "These numbers are a starting point, never a norm to obey — the player, the context and readiness govern the day (Little & Buchheit — don't be \"slaves to GPS norms\"). Figueiredo et al. (dimension-specific training:match ratios) · Buchheit & Simpson (mechanical vs locomotor). Descriptive — never the readiness colour."}</p>

            </div>);
          })()}

          {/* THE PLAN tab — the block planner (primary) → the season meso map (context) → micro link */}
          {tab === "plan" && (() => {
            const GC: Record<BlockGoalKey, string> = { accum: "#2740E6", transmute: "#7A5CC4", realize: "#1C7A4A", deload: "#DE9328" };
            const DAY = 86_400_000;
            const utc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
            const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
            const h2 = "text-[15px] font-bold text-slate-900";
            const goalName = (g: BlockGoalKey) => (is ? BLOCK_GOAL_LABEL[g].is : BLOCK_GOAL_LABEL[g].en);
            const todayIso = new Date().toISOString().slice(0, 10);
            const endIncl = (b: { end: string }) => isoAdd(b.end, -1);
            const selIdx = mesoBlocks.findIndex((b) => b.start <= blkStart && blkStart < b.end);
            const sel = selIdx >= 0 ? mesoBlocks[selIdx] : null;
            const prevB = selIdx > 0 ? mesoBlocks[selIdx - 1] : null;
            const nextB = selIdx >= 0 && selIdx < mesoBlocks.length - 1 ? mesoBlocks[selIdx + 1] : null;
            const todayB = mesoBlocks.find((b) => b.start <= todayIso && todayIso < b.end) ?? null;
            const selGoal: BlockGoalKey = sel ? ((blockGoals[sel.start] as BlockGoalKey | undefined) ?? sel.goalKey) : effectiveGoal;
            // Block strip — every block positioned by DATE on one axis (same approach as the Macro map).
            const d0 = mesoBlocks.length ? utc(mondayOf(mesoBlocks[0].start)) : 0;
            const d1 = mesoBlocks.length ? Math.max(...mesoBlocks.map((b) => utc(b.end))) : 1;
            const spanDays = Math.max(1, Math.round((d1 - d0) / DAY));
            const pctOf = (iso: string) => Math.max(0, Math.min(100, ((utc(iso) - d0) / DAY / spanDays) * 100));
            const monthMarks: Array<{ pct: number; label: string }> = [];
            if (mesoBlocks.length) {
              const s = new Date(d0);
              let cur = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + (s.getUTCDate() > 1 ? 1 : 0), 1);
              let prevYear: number | null = null;
              while (cur < d1) {
                const cd = new Date(cur), yr = cd.getUTCFullYear(), mon = cd.toLocaleDateString(is ? "is-IS" : "en-US", { month: "short", timeZone: "UTC" });
                monthMarks.push({ pct: ((cur - d0) / DAY / spanDays) * 100, label: yr !== prevYear ? `${mon} ’${String(yr).slice(2)}` : mon });
                prevYear = yr; cur = Date.UTC(yr, cd.getUTCMonth() + 1, 1);
              }
            }
            const todayPct = mesoBlocks.length && utc(todayIso) >= d0 && utc(todayIso) < d1 ? pctOf(todayIso) : null;
            const trendWord = (t: MesoBlock["loadTrend"]) => t === "rising" ? (is ? "↗ hækkandi" : "↗ rising") : t === "falling" ? (is ? "↘ lækkandi" : "↘ falling") : t === "steady" ? (is ? "→ stöðugt" : "→ steady") : "—";
            const bt = sel ? testsForBlock(sel.goalKey, { hasVald: plan.players.some((p) => p.vald.status != null), hasGps: plan.tier.loadSource === "gps" }) : null;
            const blockScheduled = sel ? scheduledTests.filter((s) => s.test_date >= sel.start && s.test_date < sel.end).sort((a, c) => a.test_date.localeCompare(c.test_date)) : [];
            const offPhaseStart = plan.phases.find((p) => p.key === "offseason")?.start ?? null;

            // Calendar vocabulary
            const dows = is ? ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const stateBg: Record<DayState, string> = { match: "#1C7A4A", session: "#2740E6", off: "#F1F5F9" };
            const stateInk: Record<DayState, string> = { match: "#FFFFFF", session: "#FFFFFF", off: "#475569" };
            const stateLbl: Record<DayState, string> = { match: is ? "Leikur" : "Match", session: is ? "Æfing" : "Session", off: is ? "Frí" : "Off" };
            const typeColor: Record<string, string> = { mechanical: "#A83E28", locomotive: "#15603A", mixed: "#1B2DA8", activation: "#475569", topup: "#55389E", match: "#7A4A06", rest: "#64748B" };
            const tint: Record<string, string> = { mechanical: "#F6E7E1", locomotive: "#E4F1EA", mixed: "#E7EAFB", activation: "#EFEFEF", topup: "#F0EAF7", match: "#FBEFDD", rest: "#FFFFFF" };
            const typeName = (t: string): string => t === "mechanical" ? (is ? "Mekanískt" : "Mechanical") : t === "locomotive" ? (is ? "Hlaup" : "Locomotive") : t === "mixed" ? (is ? "Blandað" : "Mixed") : t === "activation" ? (is ? "Virkjun" : "Activation") : t === "topup" ? (is ? "Áfylling" : "Top-up") : t === "match" ? (is ? "Leikur" : "Match") : "";
            const dash = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));
            const calStart = mondayOf(blkStart);

            return (<div className="space-y-4">
          {flowNote(is ? "Makró-fasar · leikir · álagsferill" : "Macro phases · fixtures · load curve", is ? "Vikuuppsetning (week_plans) · Today · PDF" : "Week Setup (week_plans) · Today · PDF")}

          {/* 1 — WHICH BLOCK: navigator + the season strip (choose first, then plan) */}
          <section className={card}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="min-w-0 flex-[1_1_320px]">
                <div className="text-[12px] font-semibold text-slate-500">{sel ? (is ? `Lota ${selIdx + 1} af ${mesoBlocks.length}` : `Block ${selIdx + 1} of ${mesoBlocks.length}`) : (is ? "Lota" : "Block")}{sel ? ` · ${is ? sel.phase.is : sel.phase.en}` : ""}</div>
                <h2 className="mt-0.5 flex flex-wrap items-center gap-2 text-[20px] font-bold text-slate-900">
                  <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: GC[selGoal] }} />
                  {goalName(selGoal)}
                  {sel && <span className="text-[15px] font-medium text-slate-500">{shortDate(sel.start, is)} – {shortDate(endIncl(sel), is)} · {sel.weeks} {is ? "vikur" : "weeks"}</span>}
                  {sel && todayB && sel.start === todayB.start && <span className="rounded-full bg-[#a83e28]/10 px-2 py-0.5 text-[11px] font-bold text-[#a83e28]">{is ? "Núverandi" : "Current"}</span>}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => prevB && setBlkStart(prevB.start)} disabled={!prevB} aria-label={is ? "Fyrri lota" : "Previous block"} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">‹ {is ? "Fyrri" : "Prev"}</button>
                <button type="button" onClick={() => nextB && setBlkStart(nextB.start)} disabled={!nextB} aria-label={is ? "Næsta lota" : "Next block"} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">{is ? "Næsta" : "Next"} ›</button>
                {todayB && sel && sel.start !== todayB.start && <button type="button" onClick={() => setBlkStart(todayB.start)} className="h-10 rounded-lg px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">{is ? "Fara á núverandi" : "Go to current"}</button>}
                <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
                <button onClick={exportBlock} disabled={!calBlock} className="h-10 rounded-lg border border-[#2740e6] bg-white px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-40" title={is ? "Bara þessa lotu (heildar-PDF er efst á síðunni)" : "Just this block (the full-data PDF is at the top of the page)"}>{is ? "Sækja lotu (PDF)" : "Export block (PDF)"}</button>
                <button onClick={applyToWeekSetup} disabled={!calBlock || wsBusy} className="h-10 rounded-lg bg-[#2740e6] px-3 text-[13px] font-semibold text-white hover:bg-[#1e34c0] disabled:opacity-40" title={is ? "Dagarnir vistast sjálfkrafa við hverja breytingu — þetta vistar strax núna" : "Days auto-save on every change — this saves now immediately"}>{wsBusy ? (is ? "Vista…" : "Saving…") : wsApplied === "ok" ? (is ? "✓ Vistað" : "✓ Saved") : (is ? "Vista núna" : "Save now")}</button>
              </div>
            </div>
            {/* Per-block overrides — length + deload-week pin. Auto by default; the coach shapes a block
                where it matters (the server plan target reads the same overrides). */}
            {sel && sel.phase.en !== "Off-season break" && (
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">{is ? "Lotulengd" : "Block length"}
                  <select value={blockLenOv[String(sel.index)] ?? blockLenOv[sel.start] ?? ""} onChange={(e) => setBlockLength(String(sel.index), e.target.value === "" ? null : Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px]">
                    <option value="">{is ? `Sjálfgefið (${cadence}v)` : `Auto (${cadence}w)`}</option>
                    {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {is ? "vikur" : "weeks"}</option>)}
                  </select>
                  {sel.lengthPinned && <span className="rounded-full bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2740e6]">{is ? "stillt" : "set"}</span>}
                </label>
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">{is ? "Niðurtröppunarvika" : "Deload week"}
                  <select value={blockDeloadOv[sel.start] ?? ""} onChange={(e) => setBlockDeload(sel.start, e.target.value || null)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px]">
                    <option value="">{is ? `Sjálfgefið${sel.deloadWeekStart && !sel.deloadPinned ? ` (${shortDate(sel.deloadWeekStart, is)})` : ""}` : `Auto${sel.deloadWeekStart && !sel.deloadPinned ? ` (${shortDate(sel.deloadWeekStart, is)})` : ""}`}</option>
                    {Array.from({ length: sel.weeks }, (_, w) => isoAdd(sel.start, w * 7)).map((mon) => <option key={mon} value={mon}>{is ? "Vika" : "Week of"} {shortDate(mon, is)}</option>)}
                  </select>
                  {sel.deloadPinned && <span className="rounded-full bg-[#de9328]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#de9328]">{is ? "fest" : "pinned"}</span>}
                </label>
                <span className="text-[11px] text-slate-400">{is ? "Sjálfvirkt sjálfgefið — hnekktu þar sem þarf." : "Auto by default — override where it matters."}</span>
              </div>
            )}
            {wsApplied === "ok" && <p className="mt-2 text-[12px] font-medium text-emerald-700">{is ? "✓ Lotan er komin í Vikuuppsetningu — leikir/æfingar/frí og dagsgerðir skrifaðar á week_plans." : "✓ The block is in Week Setup — matches/sessions/off and day-types written to week_plans."}</p>}
            {wsApplied === "err" && <p className="mt-2 text-[12px] font-medium text-rose-700">{is ? "Ekki tókst að vista í Vikuuppsetningu." : "Couldn't save to Week Setup."}</p>}

            {mesoBlocks.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <div className="relative min-w-[720px]">
                  <div className="relative h-5">
                    {monthMarks.map((m, i) => <span key={i} className="absolute top-0 whitespace-nowrap pl-1 text-[11px] font-semibold capitalize text-slate-500" style={{ left: `${m.pct}%` }}>{m.label}</span>)}
                  </div>
                  <div className="relative h-11">
                    {mesoBlocks.map((b) => {
                      const g: BlockGoalKey = (blockGoals[b.start] as BlockGoalKey | undefined) ?? b.goalKey;
                      const on = sel?.start === b.start;
                      const l = pctOf(b.start), r = pctOf(b.end);
                      return (
                        <button key={b.index} type="button" onClick={() => setBlkStart(b.start)} aria-pressed={on}
                          title={`${shortDate(b.start, is)}–${shortDate(endIncl(b), is)} · ${goalName(g)} · ${is ? b.phase.is : b.phase.en}`}
                          className="absolute inset-y-0 px-px" style={{ left: `${l}%`, width: `${r - l}%` }}>
                          <span className={`flex h-full items-center justify-center overflow-hidden rounded-md px-1 text-[11px] font-semibold text-white transition ${on ? "ring-2 ring-slate-900 ring-offset-2" : "opacity-60 hover:opacity-90"}`} style={{ background: GC[g] }}>
                            <span className="truncate">{goalName(g)}</span>
                          </span>
                        </button>
                      );
                    })}
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                      {monthMarks.map((m, i) => <div key={i} className="absolute inset-y-0 w-px bg-white/50" style={{ left: `${m.pct}%` }} />)}
                      {todayPct != null && <div className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 bg-[#a83e28]" style={{ left: `${todayPct}%` }} />}
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[12px] text-slate-500">{is ? "Smelltu á lotu til að skipuleggja hana. Rauða línan er í dag. Lengd lotanna kemur úr Makró." : "Click a block to plan it. The red line is today. Block lengths come from Macro."}</p>
              </div>
            )}
          </section>

          {plan.phases.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900">{is ? "⚠ Engir leikir/akkeri í Makró enn — stilltu Makró-lotuna fyrst (undirbúningsdag, leikjaskrá, niðurtröppun). Lotan hér reiknast úr því." : "⚠ No Macro anchors/fixtures yet — set the Macro Cycle first (pre-season date, fixtures, deload cadence). This block is computed from it."}</p>}

          {blkPopulated.length > 0 && (
          <div className="flex flex-col gap-4">

            {/* 2 — THE CALENDAR: one grid, full width (single column so the whole week is visible). */}
            <section className={`${card} min-w-0`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className={h2}>{is ? "Dagatal lotunnar" : "Block calendar"}</h2>
                {autoSave && (
                  <span className={`ml-auto text-[12px] font-semibold ${autoSave === "err" ? "text-rose-700" : autoSave === "saving" ? "text-slate-500" : "text-emerald-700"}`}>
                    {autoSave === "saving" ? (is ? "Vista…" : "Saving…") : autoSave === "err" ? (is ? "⚠ Vistun mistókst" : "⚠ Save failed") : (is ? "✓ Vistað sjálfkrafa" : "✓ Saved automatically")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-slate-600">{is ? "Efri hluti dags: smelltu til að skipta Frí ↔ Æfing (vistast sjálfkrafa í Vikuuppsetningu; leikir koma úr Leikjaskrá). Neðri hluti: dagsgerð + Player Load sem kerfið reiknar — smelltu til að breyta deginum." : "Top of a day: click to toggle Off ↔ Session (auto-saves to Week Setup; matches come from Fixtures). Bottom: the day-type + Player Load the system computes — click to edit the day."}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-slate-600">
                {(["match", "session", "off"] as DayState[]).map((st) => <span key={st} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-slate-300" style={{ background: stateBg[st] }} />{stateLbl[st]}</span>)}
                <span className="h-4 w-px bg-slate-200" />
                {["mechanical", "locomotive", "mixed", "activation", "topup"].map((t) => <span key={t} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: tint[t], boxShadow: `inset 0 0 0 1.5px ${typeColor[t]}` }} />{typeName(t)}</span>)}
              </div>
              <div className="mt-3 overflow-x-auto">
                <div className="grid min-w-[620px] gap-1.5" style={{ gridTemplateColumns: "64px repeat(7, minmax(0, 1fr))" }}>
                  <div />
                  {dows.map((d) => <div key={d} className="pb-0.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{d}</div>)}
                  {Array.from({ length: blkWeeks }, (_, i) => {
                    const w = calBlock?.weeks[i] ?? null;
                    const wkOff = offPhaseStart != null && isoAdd(calStart, i * 7) >= offPhaseStart;
                    return (
                      <React.Fragment key={i}>
                        <div className="flex flex-col justify-center pr-1" title={wkOff ? (is ? "Off-season þróunarvika" : "Off-season development week") : w ? `${is ? w.intent.is : w.intent.en}${w.capNote ? ` — ${is ? w.capNote.is : w.capNote.en}` : ""}` : undefined}>
                          <span className="text-[13px] font-bold text-slate-900">{is ? "V" : "W"}{i + 1}</span>
                          {w && <span className={`text-[11px] font-bold ${w.isDeload ? "text-[#9A5B06]" : "text-[#1B2DA8]"}`}>{w.isDeload ? (is ? "niðurtr." : "deload") : `×${w.mult.toFixed(2)}`}</span>}
                          {wkOff && <span className="mt-0.5 w-fit rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-700">Off-s.</span>}
                          {!wkOff && w?.capNote && <span className="text-[11px] font-semibold text-amber-800">⚑ {is ? "þak" : "cap"}</span>}
                        </div>
                        {Array.from({ length: 7 }, (_, d) => {
                          const iso = isoAdd(calStart, i * 7 + d);
                          const st: DayState = blkSkeleton[iso] ?? "off";
                          const cd = w?.days[d] ?? null;
                          const isToday = iso === todayIso;
                          const ima = cd && cd.type !== "rest" ? imaLine(cd, is) : "";
                          return (
                            <div key={d} className={`flex min-w-0 flex-col overflow-hidden rounded-lg border ${isToday ? "border-[#a83e28] ring-1 ring-[#a83e28]" : "border-slate-200"} ${wkOff ? "opacity-90" : ""}`}>
                              <button type="button" onClick={() => cycleDay(iso)} title={`${shortDate(iso, is)} — ${stateLbl[st]}${st === "match" ? (is ? " (úr Leikjaskrá)" : " (from Fixtures)") : ""}`}
                                className="flex min-h-[30px] items-center justify-between gap-1 px-1.5 text-[12px] font-semibold" style={{ background: stateBg[st], color: stateInk[st] }}>
                                <span className="tabular-nums">{new Date(`${iso}T00:00:00Z`).getUTCDate()}</span>
                                <span className="truncate text-[11px]">{stateLbl[st]}</span>
                              </button>
                              <button type="button" onClick={() => setDayModal(iso)} className="flex min-h-[40px] flex-col items-start justify-center px-1.5 py-1 text-left hover:brightness-95"
                                style={{ background: cd ? tint[cd.type] : "#FFFFFF" }}
                                title={!cd || cd.type === "rest" ? (is ? "Smelltu til að breyta dagsgerð" : "Click to change the day-type") : `${is ? cd.label.is : cd.label.en} · PL ${dash(cd.load)}${ima ? ` · ${ima}` : ""}`}>
                                {cd && cd.type !== "rest" ? (<>
                                  <span className="w-full truncate text-[12px] font-bold" style={{ color: typeColor[cd.type] }}>{typeName(cd.type)}</span>
                                  <span className="text-[11px] tabular-nums text-slate-600">{dash(cd.load)}</span>
                                </>) : <span className="text-[11px] text-slate-500">—</span>}
                              </button>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
              <p className="mt-3 text-[12px] text-slate-500">{is ? "Talan = Player Load. Vikuálagið er stigvaxandi per mæligildi (magn hækkar hraðar en háhraði; hvert við leikþak — ⚑ sýnir hvað heldur vikunni). Lýsandi — upphafspunktur, ekki viðmið. Aldrei fleiri en 3 æfingar í röð. Malone 2017 · Gabbett 2016 · Figueiredo · Owen 2017 · Teixeira 2021." : "The number = Player Load. Weekly overload ramps per-KPI (volume climbs faster than HSR; each ceilings at match — ⚑ shows what held the week). Descriptive — a starting point, not a norm. Never more than 3 sessions in a row. Malone 2017 · Gabbett 2016 · Figueiredo · Owen 2017 · Teixeira 2021."}</p>
              <details className="mt-3">
                <summary className="cursor-pointer py-1 text-[13px] font-semibold text-[#2740e6]">{is ? "Hvað þýða dagsgerðirnar?" : "What the day-types mean"}</summary>
                <ul className="mt-1.5 space-y-1 text-[13px] text-slate-700">
                  <li><b style={{ color: typeColor.mechanical }}>{typeName("mechanical")}</b> — {is ? "þröngt rými, mikil accel/decel — ASD undirb. (lágt háhraðahlaup)." : "tight-space, high accel/decel — ASD prep (low HSR)."}</li>
                  <li><b style={{ color: typeColor.locomotive }}>{typeName("locomotive")}</b> — {is ? "opið rými, hæsti háhraði — hlaupageta." : "open-space, highest HSR — running capacity."}</li>
                  <li><b style={{ color: typeColor.mixed }}>{typeName("mixed")}</b> — {is ? "leiklíkt áreiti, hámarks heildarálag." : "match-like stimulus, peak overall load."}</li>
                  <li><b style={{ color: typeColor.activation }}>{typeName("activation")}</b> — {is ? "lágt lífeðlislegt álag (niðurtröppun fyrir leik)." : "low physiological load, a pre-match primer."}</li>
                  <li><b style={{ color: typeColor.topup }}>{typeName("topup")}</b> — {is ? "koma <60′ leikmönnum í vikumarkið; endurheimt fyrir byrjunarlið." : "bring <60′ players to the weekly target; recovery for starters."}</li>
                  <li><b style={{ color: typeColor.match }}>{typeName("match")}</b> — {is ? "leikkrafan sjálf (viðmiðunareiningin, 100%)." : "the match demand itself (the reference unit, 100%)."} · <b className="text-slate-600">{is ? "Frí" : "Off"}</b> — {is ? "heill frídagur." : "full rest day."}</li>
                </ul>
                <p className="mt-1.5 text-[12px] text-slate-500">Issurin 2010 (block periodisation) · Owen 2017 (positional mesocycle, MD taper) · Oliveira 2019 (congested-week variants) · Oliveira 2021 (ACWR/monotony on sRPE+HSR) · Teixeira 2021 (monitoring) · Martín-García 2018 (%-of-match-demand). {is ? "Lýsandi — aldrei readiness-liturinn." : "Descriptive — never the readiness colour."}</p>
              </details>
              {calBlock && (calBlock.unit.accHiEff != null || calBlock.unit.stride != null) && (
                <details className="mt-1">
                  <summary className="cursor-pointer py-1 text-[13px] font-semibold text-[#2740e6]">{is ? "Sýna vélrænt / IMA (Acc·Dec B2–3, skref, stefna)" : "Show mechanical/IMA detail (Acc·Dec B2–3, stride, direction)"}</summary>
                  <ul className="mt-1.5 space-y-0.5 text-[12px] text-slate-700">
                    {calBlock.weeks.flatMap((w) => w.days.map((d, i) => ({ d, i, wi: w.index })).filter(({ d }) => d.type !== "rest")).map(({ d, i, wi }) => (
                      <li key={`${wi}-${i}`} className="tabular-nums"><span className="text-slate-500">{is ? "V" : "W"}{wi + 1} {is ? d.dow.is : d.dow.en} {d.md}</span> · <b style={{ color: typeColor[d.type] }}>{typeName(d.type)}</b> — {imaLine(d, is) || (is ? "engin IMA-gögn" : "no IMA data")}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[12px] text-slate-500">{is ? "Mechanical-dagar hlaða Acc/Dec Band 2–3 + skref; Locomotive-dagar hlaða skref + háhraða — aldrei á sama degi (Buchheit; aftanlæris-vernd)." : "Mechanical days load Acc/Dec Band 2–3 + strides; Locomotive days load stride + HSR — never the same day (Buchheit; hamstring protection)."}</p>
                </details>
              )}
            </section>

            {/* 2b — PRE-SEASON WEEKLY LOAD RAMP: starts the week off-season ends (no off-season shown),
                 ramps week-by-week toward the pre-season build, with ALL KPI variables per week. */}
            {upcomingPreseason(plan.phases, todayIso, plan.nextFirstFixture) && (() => {
              const up = upcomingPreseason(plan.phases, todayIso, plan.nextFirstFixture)!;
              const preWeeks = up.weeks;
              const preStart = up.start;
              const preAnchor: LoadAnchor = plan.matchLoad != null ? "match_this_season" : plan.tier.loadSource === "srpe" ? "srpe_only" : "normative";
              const tka = teamKpiAvg(plan.players);
              const ramp = preseasonStartRamp({ matchTypicalLoad: tka.totalPlayerLoad ?? plan.matchLoad, matchKpiAvg: tka, matchSrpeAu: plan.matchSrpe, sessionsPerWeek: psSess, preseasonWeeks: preWeeks, week1MatchMultiple: psW1, anchor: preAnchor });
              if (!ramp.length) return null;
              const usesAu = ramp.every((w) => w.weeklyLoadTarget == null); // srpe-only / normative teams have no PL unit
              const primary = (w: PreseasonWeekTarget) => (usesAu ? w.sRpeAuTarget : w.weeklyLoadTarget) ?? 0;
              const unitLabel = usesAu ? "AU" : "PL";
              const maxW = Math.max(1, ...ramp.map((w) => primary(w)));
              const total = ramp.reduce((sm, w) => sm + primary(w), 0);
              const fmt = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
              // PlayerLoad is the headline bar — drop it from the per-KPI table so it isn't shown twice.
              const kpiKeys = (Object.keys(ramp[0].byKpi) as WeeklyLoadMetricKey[]).filter((k) => k !== "totalPlayerLoad" && ramp.some((w) => w.byKpi[k] != null));
              return (
                <section className={`${card} min-w-0`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className={h2}>{is ? "Vikuálag undirbúnings — progression" : "Pre-season weekly load — progression"}</h2>
                    <span className="text-[12px] text-slate-500">{preStart ? <>{is ? "hefst" : "starts"} <b className="text-slate-700">{shortDate(preStart, is)}</b> · </> : null}{preWeeks} {is ? "vikur" : "weeks"} · {is ? "alls" : "total"} <b className="tabular-nums text-slate-900">{fmt(total)} {unitLabel}</b></span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-slate-500">{is ? "Fyrsta vikan er þegar off-season endar — stýrð endurkoma — og álagið stigmagnast þaðan að undirbúnings-uppbyggingu. Hvert vikuálag er margfeldi af einu leikálagi; allar KPI-breytur skalast með. Lýsandi áætlun — aldrei readiness-liturinn." : "Week 1 is when off-season ends — a controlled re-entry — ramping from there toward the pre-season build. Each week's load is a multiple of one match; every KPI variable scales with it. Descriptive plan — never the readiness colour."}</p>
                  <div className="mt-4 flex items-end gap-2 sm:gap-3">
                    {ramp.map((w) => {
                      const v = primary(w);
                      const h = v > 0 ? Math.max(4, Math.round((v / maxW) * 108)) : 0;
                      return (
                        <div key={w.weekIndex} className="flex min-w-0 flex-1 flex-col items-center">
                          <span className="mb-1 text-[11px] font-semibold tabular-nums text-slate-700">{v ? fmt(v) : "–"}</span>
                          <div className="w-[72%] rounded-t" style={{ height: h, background: "#2740e6", opacity: v ? 1 : 0.12 }} title={`${is ? "Vika" : "Week"} ${w.weekIndex}: ${v} ${unitLabel} · ×${w.multipleOfMatch} ${is ? "leik" : "match"}`} />
                          <span className="mt-1.5 text-[11px] font-semibold text-slate-600">{is ? "V" : "W"}{w.weekIndex}</span>
                          <span className="text-[10px] tabular-nums text-slate-400">×{w.multipleOfMatch}</span>
                        </div>
                      );
                    })}
                  </div>
                  {kpiKeys.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[520px] border-collapse text-[12px]">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-slate-500">
                            <th className="py-1.5 pr-3 font-semibold">{is ? "KPI-breyta" : "KPI variable"}</th>
                            {ramp.map((w) => <th key={w.weekIndex} className="px-2 py-1.5 text-right font-semibold tabular-nums">{is ? "V" : "W"}{w.weekIndex}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {kpiKeys.map((k) => {
                            const lab = WEEKLY_LOAD_LABELS[k];
                            return (
                              <tr key={k} className="border-b border-slate-100">
                                <td className="py-1.5 pr-3 text-slate-700">{is ? lab.is : lab.en} <span className="text-slate-400">({lab.unit})</span></td>
                                {ramp.map((w) => <td key={w.weekIndex} className="px-2 py-1.5 text-right tabular-nums text-slate-800">{w.byKpi[k] != null ? w.byKpi[k]!.toLocaleString("en-US") : "–"}</td>)}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })()}

            {/* 3 — PANEL BELOW THE CALENDAR: goal → numbers → testing → settings, tiled in two columns. */}
            <aside className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
              <section className={card}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={h2}>{is ? "Markmið lotunnar" : "Block goal"}</h2>
                  {sel && blockGoals[sel.start] && blockGoals[sel.start] !== sel.goalKey && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{is ? "Yfirtekið af þjálfara" : "Coach override"}</span>}
                </div>
                {goalRec && (
                  <p className="mt-1 text-[13px] text-slate-700">
                    {is ? "Ráðlagt" : "Recommended"}: <b className="text-slate-900">{goalName(goalRec.goal)}</b>
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-semibold ${recTint(goalRec.confidence)}`}>{is ? "vissa" : "confidence"}: {goalRec.confidence}</span>
                  </p>
                )}
                <div role="radiogroup" aria-label={is ? "Markmið lotu" : "Block goal"} className="mt-3 grid grid-cols-3 gap-1.5">
                  {(["accum", "transmute", "realize"] as const).map((g) => {
                    const on = effectiveGoal === g;
                    return (
                      <button key={g} type="button" role="radio" aria-checked={on} onClick={() => setBlockGoal(g)}
                        className={`flex min-h-[48px] flex-col items-center justify-center rounded-lg px-1 text-center text-[12px] font-bold ${on ? "text-white" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
                        style={on ? { background: GC[g] } : undefined}>
                        {goalName(g)}
                        {goalRec?.goal === g && <span className={`text-[10px] font-semibold ${on ? "text-white/85" : "text-[#1B2DA8]"}`}>{is ? "ráðlagt" : "recommended"}</span>}
                      </button>
                    );
                  })}
                </div>
                {goalRec && effectiveGoal !== goalRec.goal && (
                  <button type="button" onClick={() => setBlockGoal(goalRec.goal as "accum" | "transmute" | "realize")} className="mt-2 h-9 rounded-lg border border-[#2740e6] bg-white px-3 text-[12px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">{is ? `Nota ráðlagt (${BLOCK_GOAL_LABEL[goalRec.goal].is})` : `Use recommended (${BLOCK_GOAL_LABEL[goalRec.goal].en})`}</button>
                )}
                {goalRec?.deloadNow && <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[12px] font-semibold text-amber-900"><span className="inline-block h-3 w-2 rounded-sm" style={{ background: "#DE9328" }} />{is ? "Þreytumerki — færðu niðurtröppunar-vikuna framar (markmiðið helst)." : "Fatigue signal — pull the deload week forward (the goal is unchanged)."}</p>}
                {goalRec && (<>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-slate-700">
                    {goalRec.reasons.slice(0, 3).map((r, i) => <li key={i}>{is ? r.is : r.en}</li>)}
                  </ul>
                  <p className="mt-1.5 text-[12px] text-slate-600">{is ? "Annar kostur" : "Alternative"}: <b>{goalName(goalRec.alternative.goal)}</b> — {is ? goalRec.alternative.when.is : goalRec.alternative.when.en}</p>
                  <p className="mt-1.5 text-[11px] text-slate-500">{is ? "Val á lotu-markmiði er þjálfaramat — þetta er grundaður sjálfgefinn kostur úr eigin leikjum + álagi liðsins, ekki fyrirmæli (Issurin 2010; Little & Buchheit). Ekki sjálfvirkt sett." : "Block-goal choice is a coaching judgment — a grounded default from the team's own fixtures + load, not a mandate (Issurin 2010; Little & Buchheit). Not auto-applied."}</p>
                </>)}
              </section>

              {sel && (
                <section className={card}>
                  <h2 className={h2}>{is ? "Álag lotunnar" : "Block load"}</h2>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div title={is ? "Vikuálag sem margfeldi af einu leikálagi (TMr)" : "Weekly load as a multiple of one match (TMr)"}>
                      <div className="text-[12px] font-semibold text-slate-500">{is ? "Vikuálag / leik (TMr)" : "Week ÷ match (TMr)"}</div>
                      <div className="text-[20px] font-bold text-slate-900">{sel.tmr != null ? `${sel.tmr}×` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-500">{is ? "Magn-mark" : "Volume target"}</div>
                      <div className="text-[20px] font-bold text-slate-900">{sel.volumeTargetPct != null ? `${sel.volumeTargetPct}%` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-500">{is ? "Bráðaálag" : "Acute load"}</div>
                      <div className="text-[15px] font-bold text-slate-900">{trendWord(sel.loadTrend)}</div>
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-500">{is ? "Niðurtröppunarvika" : "Deload week"}</div>
                      <div className="text-[15px] font-bold text-slate-900">{sel.deloadWeekStart ? shortDate(sel.deloadWeekStart, is) : "—"}{sel.deloadNow && <span className="ml-1 text-[12px] font-semibold text-amber-800">{is ? "· færð framar" : "· pulled fwd"}</span>}</div>
                    </div>
                  </div>
                  {sel.flag && <p className="mt-2 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[12px] font-semibold text-amber-900">{is ? sel.flag.is : sel.flag.en}</p>}
                  <p className="mt-2 text-[12px] text-slate-600">{is ? sel.goal.is : sel.goal.en}</p>
                  <p className="mt-1.5 text-[12px] text-slate-500">{is ? "Leikurinn er einingin: TMr = vikuálag ÷ eitt leikálag. Við röppum TMr skynsamlega og lesum bráðaálags-þróun + viðbragð — ekki ACWR-band." : "The match is the unit: TMr = weekly load ÷ one match's load. We ramp TMr sensibly and read the acute-load trend + readiness — not an ACWR band."}{plan.matchLoad != null && <> {is ? "Eitt leikálag" : "One match"} ≈ {plan.matchLoad} {plan.tier.loadSource === "srpe" ? "AU" : "PL"}.</>}</p>
                  {sel.acwr != null && (
                    <details className="mt-1">
                      <summary className="cursor-pointer py-1 text-[12px] text-slate-500 hover:text-slate-700">{is ? `ACWR ${sel.acwr} — umdeilt viðmið` : `ACWR ${sel.acwr} — contested view`}</summary>
                      <p className="mt-0.5 text-[12px] text-slate-500">{is ? sel.acwrNote.is : sel.acwrNote.en}</p>
                    </details>
                  )}
                </section>
              )}

              {sel && bt && (bt.protocols.length > 0 || blockScheduled.length > 0) && (
                <section className={card}>
                  <div className="flex items-center gap-2">
                    <h2 className={h2}>{is ? "Próf í lotunni" : "Testing in this block"}</h2>
                    <a href="?tab=testing" onClick={(e) => { e.preventDefault(); setTab("testing"); }} className="ml-auto text-[12px] font-semibold text-[#2740e6] hover:underline">{is ? "Skipuleggja →" : "Schedule →"}</a>
                  </div>
                  {blockScheduled.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {blockScheduled.map((s) => <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#1C7A4A] px-2 py-0.5 text-[12px] font-semibold text-white"><span className="h-2 w-2 rotate-45 bg-white" />{shortDate(s.test_date, is)} · {is ? TEST_SHORT[s.test_key].is : TEST_SHORT[s.test_key].en}</span>)}
                    </div>
                  ) : <p className="mt-1 text-[12px] text-slate-500">{is ? "Engin próf skráð í þessari lotu." : "No tests scheduled in this block."}</p>}
                  {bt.protocols.length > 0 && (<>
                    <p className="mt-2 text-[13px] font-medium text-slate-700">{is ? bt.when.is : bt.when.en}</p>
                    <ul className="mt-1 space-y-1">
                      {bt.protocols.map((p) => <li key={p.key} className="text-[12px] text-slate-600"><b className="text-slate-800">{is ? p.name.is : p.name.en}</b> — {is ? p.prescribes.is : p.prescribes.en} <span className="text-slate-500">({p.cite})</span></li>)}
                    </ul>
                  </>)}
                </section>
              )}

              <section className={card}>
                <h2 className={h2}>{is ? "Stillingar lotu" : "Block settings"}</h2>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-700">{is ? "Upphaf" : "Start"}<input type="date" value={blkStart} onChange={(e) => setBlkStart(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-2 text-[13px] font-medium" /></label>
                  <div className="flex flex-col gap-1 text-[12px] font-semibold text-slate-700">{is ? "Vikur (úr Makró)" : "Weeks (from Macro)"}<div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-[13px] font-medium text-slate-700">{blkWeeks} <span className="ml-1 text-[12px] font-normal text-slate-500">· {is ? "niðurtr. hverja" : "deload every"} {cadence}</span></div></div>
                  <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-700">{is ? "Grunn-álag %" : "Base overload %"}<input type="number" min={80} max={130} value={blkBase} onChange={(e) => setBlkBase(Number(e.target.value))} className="h-10 rounded-lg border border-slate-300 px-2 text-[13px] font-medium" /></label>
                  <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-700">{is ? "Stig/viku %" : "Step/wk %"}<input type="number" min={0} max={15} value={blkStep} onChange={(e) => { const v = Math.max(0, Math.min(15, Number(e.target.value) || 0)); setBlkStep(v); persistOverridePatch({ stepPct: v }); }} className="h-10 rounded-lg border border-slate-300 px-2 text-[13px] font-medium" /></label>
                  <label className="col-span-2 flex flex-col gap-1 text-[12px] font-semibold text-slate-700">{is ? "Umfang" : "Scope"}<select value={blkScope} onChange={(e) => setBlkScope(e.target.value as typeof blkScope)} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-[13px] font-medium"><option value="team">{is ? "Lið" : "Team"}</option><option value="player">{is ? `Leikmaður: ${player?.name ?? ""}` : `Player: ${player?.name ?? ""}`}</option></select></label>
                </div>
                {blkScope === "player" && <p className="mt-1.5 text-[12px] text-slate-500">{is ? `Leikviðmið úr leikmanni völdum í „Leikmenn“-flipanum${player ? ` (${player.name})` : ""}. Skiptu um leikmann þar.` : `Match unit from the player selected in the "Players" tab${player ? ` (${player.name})` : ""}. Change the player there.`}</p>}
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="text-[12px] font-semibold text-slate-700">{is ? "Bæta leik í leikjaskrá" : "Add a fixture to the schedule"}</div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <input type="date" value={friendly} onChange={(e) => setFriendly(e.target.value)} aria-label={is ? "Dagsetning leiks" : "Match date"} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-[13px]" />
                    <select value={friendlyKind} onChange={(e) => setFriendlyKind(e.target.value as "friendly" | "competitive")} aria-label={is ? "Tegund leiks" : "Fixture type"} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-[13px] font-medium">
                      <option value="friendly">{is ? "Æfingaleikur" : "Friendly"}</option>
                      <option value="competitive">{is ? "Keppnisleikur" : "Competitive"}</option>
                    </select>
                    <button onClick={addFriendly} disabled={!friendly} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-slate-50 disabled:opacity-40">{is ? "+ Bæta við" : "+ Add"}</button>
                  </div>
                  <p className="mt-1 text-[12px] text-slate-500">{is ? "Æfingaleikir teljast EKKI upphaf keppnistímabilsins — þeir eru hluti af undirbúningi. Fyrsti keppnisleikurinn endar undirbúninginn." : "Friendlies do NOT start the competitive season — they stay in pre-season. The first competitive fixture ends pre-season."}</p>
                </div>
              </section>
            </aside>
          </div>
          )}

          {/* 4 — MESO → MICRO handoff */}
          <section className={`${card} flex flex-wrap items-center gap-3`}>
            <div className="min-w-0 flex-[1_1_320px]">
              <h2 className={h2}>{is ? "Næst: vikan" : "Next: the week"}</h2>
              <p className="mt-0.5 text-[13px] text-slate-600">{is ? "Dagarnir hér vistast í Vikuuppsetningu — vikan birtist dag-fyrir-dag í Míkró-lotu flipanum." : "The days here save to Week Setup — the week appears day by day in the Micro Cycle tab."}</p>
            </div>
            <button onClick={() => setTab("micro")} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-slate-50">{is ? "Míkró-lota (vikan) →" : "Micro Cycle (the week) →"}</button>
            <a href="/coach/training-programme" className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-slate-50">{is ? "Æfingavika (per leikmann) →" : "Training Programme (per player) →"}</a>
          </section>

            </div>);
          })()}

          {/* MICRO CYCLE tab — the existing Week Setup, mounted in-place (one macro→meso→micro flow) */}
          {tab === "micro" && (
            <WeekSetupView
              embedded
              initialWeekStart={preseasonJumpWeek}
              onOpenTab={(t) => setTab(t)}
              rulesSlot={<PeriodizationModelPicker lang={lang} variant="card" />}
              spine={(ws) => {
                // Where the shown week sits: the Macro phase + the Meso block (effective goal, week n of N).
                const GCm: Record<BlockGoalKey, string> = { accum: "#2740E6", transmute: "#7A5CC4", realize: "#1C7A4A", deload: "#DE9328" };
                const ph = plan.phases.find((p) => p.start <= ws && ws < p.end) ?? null;
                const b = mesoBlocks.find((x) => x.start <= ws && ws < x.end) ?? null;
                const g: BlockGoalKey | null = b ? ((blockGoals[b.start] as BlockGoalKey | undefined) ?? b.goalKey) : null;
                return {
                  phase: ph ? ph.label : null,
                  block: b && g ? {
                    label: BLOCK_GOAL_LABEL[g], color: GCm[g],
                    week: Math.max(1, Math.floor((Date.parse(`${ws}T00:00:00Z`) - Date.parse(`${mondayOf(b.start)}T00:00:00Z`)) / (7 * 86_400_000)) + 1),
                    of: b.weeks, deload: b.deloadWeekStart === ws,
                  } : null,
                };
              }}
            />
          )}

          {/* TESTING tab — pin performance tests to real dates. Recommended windows (block boundaries)
              give one-click scheduling; the schedule is also editable here and in Week Setup. */}
          {tab === "testing" && (() => {
            const hasVald = plan.players.some((p) => p.vald.status != null);
            const hasGps = plan.tier.loadSource === "gps";
            const keys = Object.keys(TEST_SHORT) as TestKey[];
            const nameOf = (k: TestKey) => (is ? TEST_SHORT[k].is : TEST_SHORT[k].en);
            const GC: Record<BlockGoalKey, string> = { accum: "#2740E6", transmute: "#7A5CC4", realize: "#1C7A4A", deload: "#DE9328" };
            const DAY = 86_400_000;
            const utc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
            const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
            const h2 = "text-[15px] font-bold text-slate-900";
            const todayIso = new Date().toISOString().slice(0, 10);
            const endIncl = (b: { end: string }) => isoAdd(b.end, -1);
            const goalOf = (b: MesoBlock): BlockGoalKey => (blockGoals[b.start] as BlockGoalKey | undefined) ?? b.goalKey;
            const goalName = (g: BlockGoalKey) => (is ? BLOCK_GOAL_LABEL[g].is : BLOCK_GOAL_LABEL[g].en);
            const blockOf = (iso: string) => mesoBlocks.find((b) => b.start <= iso && iso < b.end) ?? null;
            const scheduledIn = (k: TestKey, b: MesoBlock) => scheduledTests.find((s) => s.test_key === k && s.test_date >= b.start && s.test_date < b.end) ?? null;
            const sorted = [...scheduledTests].sort((a, c) => a.test_date.localeCompare(c.test_date));
            const upcoming = sorted.filter((s) => s.test_date >= todayIso);
            const past = sorted.filter((s) => s.test_date < todayIso).reverse();
            const nowIdx = mesoBlocks.findIndex((b) => b.start <= todayIso && todayIso < b.end);
            const firstFuture = mesoBlocks.findIndex((b) => b.start >= todayIso);
            const baseIdx = nowIdx >= 0 ? nowIdx : firstFuture >= 0 ? firstFuture : Math.max(0, mesoBlocks.length - 1);
            const focusIdx = testFocus ? Math.max(0, mesoBlocks.findIndex((b) => b.start === testFocus)) : baseIdx;
            const visible = testShowAll ? mesoBlocks : mesoBlocks.slice(focusIdx, focusIdx + 3);
            const recFor = (b: MesoBlock) => testsForBlock(b.goalKey, { hasVald, hasGps });
            // "Missing" = recommended protocols in the current + next two blocks with no date yet.
            const gap = mesoBlocks.slice(baseIdx, baseIdx + 3).reduce((n, b) => n + recFor(b).protocols.filter((p) => !scheduledIn(p.key, b)).length, 0);
            const next = upcoming[0] ?? null;
            const last = past[0] ?? null;
            const daysTo = (iso: string) => Math.round((utc(iso) - utc(todayIso)) / DAY);
            const in8w = upcoming.filter((s) => utc(s.test_date) - utc(todayIso) <= 56 * DAY).length;
            const verdict = `${next ? (is ? `Næsta próf: ${nameOf(next.test_key)} ${shortDate(next.test_date, is)}.` : `Next test: ${nameOf(next.test_key)} on ${shortDate(next.test_date, is)}.`) : (is ? "Engin próf áætluð framundan." : "No tests scheduled ahead.")}`;
            const verdictTail = gap > 0
              ? (is ? ` ${gap} ráðlögð próf í næstu lotum eru ekki komin á dagsetningu.` : ` ${gap} recommended tests in the next blocks have no date yet.`)
              : (is ? " Öll ráðlögð próf næstu lotna eru áætluð." : " Every recommended test in the next blocks is scheduled.");
            // Season strip — same date axis as Macro/Meso.
            const d0 = mesoBlocks.length ? utc(mondayOf(mesoBlocks[0].start)) : 0;
            const d1 = mesoBlocks.length ? Math.max(...mesoBlocks.map((b) => utc(b.end))) : 1;
            const spanDays = Math.max(1, Math.round((d1 - d0) / DAY));
            const pctOf = (iso: string) => Math.max(0, Math.min(100, ((utc(iso) - d0) / DAY / spanDays) * 100));
            const monthMarks: Array<{ pct: number; label: string }> = [];
            if (mesoBlocks.length) {
              const s0 = new Date(d0);
              let cur = Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth() + (s0.getUTCDate() > 1 ? 1 : 0), 1);
              let prevYear: number | null = null;
              while (cur < d1) {
                const cd = new Date(cur), yr = cd.getUTCFullYear(), mon = cd.toLocaleDateString(is ? "is-IS" : "en-US", { month: "short", timeZone: "UTC" });
                monthMarks.push({ pct: ((cur - d0) / DAY / spanDays) * 100, label: yr !== prevYear ? `${mon} ’${String(yr).slice(2)}` : mon });
                prevYear = yr; cur = Date.UTC(yr, cd.getUTCMonth() + 1, 1);
              }
            }
            const todayPct = mesoBlocks.length && utc(todayIso) >= d0 && utc(todayIso) < d1 ? pctOf(todayIso) : null;
            const recMarks = mesoBlocks.filter((b) => recFor(b).protocols.some((p) => !scheduledIn(p.key, b))).map((b) => ({ b, missing: recFor(b).protocols.filter((p) => !scheduledIn(p.key, b)) }));
            const schedByDate = new Map<string, TestKey[]>();
            for (const s of sorted) { if (utc(s.test_date) < d0 || utc(s.test_date) >= d1) continue; schedByDate.set(s.test_date, [...(schedByDate.get(s.test_date) ?? []), s.test_key]); }
            // Every protocol the schedule can recommend (for the reference list).
            const allProtocols = (["accum", "transmute", "realize", "deload"] as const).flatMap((g) => testsForBlock(g, { hasVald, hasGps }).protocols)
              .filter((p, i, arr) => arr.findIndex((x) => x.key === p.key) === i);
            const moveTest = async (s: { id: string; test_key: TestKey; test_date: string }, v: string) => { if (v && v !== s.test_date) { await unscheduleTest(s.id); await scheduleTest(s.test_key, v); } };

            return (
              <div className="space-y-4">
                {flowNote(is ? "Undirbúningslengd · tæki (GPS/VALD)" : "Pre-season length · hardware (GPS/VALD)", is ? "prófadagskrá; úrslit → Kröfur / grunnlínur" : "test schedule; results → Demands / baselines")}

                {/* 1 — VERDICT + four facts */}
                <section className="space-y-3">
                  <p className="text-[15px] font-bold text-slate-900">{verdict}<span className={gap > 0 ? "text-amber-800" : "text-emerald-700"}>{verdictTail}</span></p>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[12px] font-semibold text-slate-500">{is ? "Næsta próf" : "Next test"}</div>
                      <div className="mt-0.5 text-[20px] font-bold text-slate-900">{next ? `${nameOf(next.test_key)} · ${shortDate(next.test_date, is)}` : "—"}</div>
                      <div className="text-[13px] text-slate-600">{next ? `${daysTo(next.test_date) === 0 ? (is ? "Í dag" : "Today") : (is ? `Eftir ${daysTo(next.test_date)} daga` : `In ${daysTo(next.test_date)} days`)}${blockOf(next.test_date) ? ` · ${goalName(goalOf(blockOf(next.test_date)!))}` : ""}` : ""}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[12px] font-semibold text-slate-500">{is ? "Áætluð framundan" : "Scheduled ahead"}</div>
                      <div className="mt-0.5 text-[20px] font-bold text-slate-900">{upcoming.length} {is ? "próf" : upcoming.length === 1 ? "test" : "tests"}</div>
                      <div className="text-[13px] text-slate-600">{is ? `${in8w} á næstu 8 vikum` : `${in8w} in the next 8 weeks`}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[12px] font-semibold text-slate-500">{is ? "Vantar í næstu lotum" : "Missing in the next blocks"}</div>
                      <div className={`mt-0.5 text-[20px] font-bold ${gap > 0 ? "text-amber-800" : "text-emerald-700"}`}>{gap} {is ? "ráðlögð" : "recommended"}</div>
                      <div className="text-[13px] text-slate-600">{is ? "Ekki komin á dagsetningu" : "No date yet"}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[12px] font-semibold text-slate-500">{is ? "Síðast mælt" : "Last tested"}</div>
                      <div className="mt-0.5 text-[20px] font-bold text-slate-900">{last ? `${nameOf(last.test_key)} · ${shortDate(last.test_date, is)}` : "—"}</div>
                      <div className="text-[13px] text-slate-600">{last ? (is ? `Fyrir ${-daysTo(last.test_date)} dögum` : `${-daysTo(last.test_date)} days ago`) : ""}</div>
                    </div>
                  </div>
                </section>

                {/* 2 — SEASON STRIP: blocks + tests on one date axis */}
                {mesoBlocks.length > 0 && (
                  <section className={card}>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className={h2}>{is ? "Prófin yfir tímabilið" : "Tests across the season"}</h2>
                      <span className="text-[12px] text-slate-500">{is ? "Fylltur tígull = áætlað, opinn = ráðlagt við lotuskil. Smelltu á lotu til að sjá hana hér fyrir neðan." : "Filled diamond = scheduled, open = recommended at a block boundary. Click a block to show it below."}</span>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <div className="relative min-w-[900px]">
                        <div className="relative h-5">
                          {monthMarks.map((m, i) => <span key={i} className="absolute top-0 whitespace-nowrap pl-1 text-[11px] font-semibold capitalize text-slate-500" style={{ left: `${m.pct}%` }}>{m.label}</span>)}
                        </div>
                        <div className="relative h-9">
                          {mesoBlocks.map((b) => {
                            const g = goalOf(b), l = pctOf(b.start), r = pctOf(b.end);
                            const isPast = b.end <= todayIso;
                            const on = visible.some((v) => v.start === b.start) && !testShowAll;
                            return (
                              <button key={b.index} type="button" onClick={() => { setTestShowAll(false); setTestFocus(b.start); }}
                                title={`${goalName(g)} · ${shortDate(b.start, is)}–${shortDate(endIncl(b), is)}`}
                                className="absolute inset-y-0 px-px" style={{ left: `${l}%`, width: `${r - l}%` }}>
                                <span className={`flex h-full items-center overflow-hidden rounded-md px-1.5 text-[11px] font-semibold ${g === "deload" ? "text-[#5A3A06]" : "text-white"} ${on ? "ring-2 ring-slate-900 ring-offset-1" : ""}`} style={{ background: GC[g], opacity: isPast ? 0.5 : 1 }}>
                                  <span className="truncate">{goalName(g)}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="relative mt-1 h-7 border-b border-slate-100">
                          {recMarks.map(({ b, missing }) => (
                            <span key={`r${b.index}`} title={`${is ? "Ráðlagt — ekki áætlað" : "Recommended — not scheduled"} · ${shortDate(b.start, is)}: ${missing.map((p) => nameOf(p.key)).join(", ")}`}
                              className="absolute top-2 h-[10px] w-[10px] -translate-x-1/2 rotate-45 rounded-[1px] border-2 border-[#1C7A4A] bg-white" style={{ left: `${pctOf(b.start) + (0.5 / spanDays) * 100}%` }} />
                          ))}
                          {[...schedByDate.entries()].map(([date, ks]) => (
                            <span key={`s${date}`} title={`${shortDate(date, is)}: ${ks.map(nameOf).join(", ")}`}
                              className="absolute top-2 h-[10px] w-[10px] -translate-x-1/2 rotate-45 rounded-[1px] border-2 border-[#1C7A4A] bg-[#1C7A4A]" style={{ left: `${pctOf(date) + (0.5 / spanDays) * 100}%` }} />
                          ))}
                        </div>
                        {todayPct != null && (
                          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-4 w-0.5 -translate-x-1/2 bg-[#a83e28]" style={{ left: `${todayPct}%` }}>
                            <span className="absolute -top-4 left-1.5 whitespace-nowrap text-[11px] font-bold text-[#a83e28]">{is ? "Í dag" : "Today"}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {/* 3 — RECOMMENDED (what to plan) | SCHEDULED (what's planned). Equal height: the scheduled
                    card stretches to the recommended list and pins "Add a test" to its bottom — no dead gap. */}
                <div className="flex flex-wrap items-stretch gap-4">
                  <section className={`${card} min-w-0 flex-[3_1_540px]`}>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className={h2}>{testShowAll ? (is ? "Ráðlögð próf — allar lotur" : "Recommended tests — all blocks") : (is ? "Ráðlögð próf — næstu lotur" : "Recommended tests — next blocks")}</h2>
                      <span className="text-[12px] text-slate-500">{is ? "Úr lotuskilum í Mesó. Áætla setur prófið á fyrsta dag lotunnar (eða í dag ef lotan er hafin) — færðu það til hægra megin." : "From the Meso block boundaries. Schedule puts the test on the block's first day (or today if the block has started) — move it on the right."}</span>
                    </div>
                    <div className="mt-3 space-y-2.5">
                      {visible.map((b) => {
                        const bt = recFor(b);
                        if (bt.protocols.length === 0) return null;
                        const g = goalOf(b);
                        const isNow = b.start <= todayIso && todayIso < b.end;
                        const isPast = b.end <= todayIso;
                        return (
                          <div key={b.index} className={`rounded-xl border px-3.5 py-3 ${isNow ? "border-slate-400" : "border-slate-200"} ${isPast ? "bg-slate-50" : ""}`}>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: GC[g] }} />
                              <span className="text-[14px] font-bold text-slate-900">{goalName(g)} <span className="font-medium text-slate-500">· {is ? b.phase.is : b.phase.en}</span></span>
                              <span className="text-[12px] text-slate-500">{shortDate(b.start, is)} – {shortDate(endIncl(b), is)}</span>
                              {isNow && <span className="rounded-full bg-[#a83e28]/10 px-2 py-0.5 text-[11px] font-bold text-[#a83e28]">{is ? "Núverandi" : "Current"}</span>}
                              {isPast && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">{is ? "Liðin" : "Past"}</span>}
                            </div>
                            <p className="mt-1 text-[13px] text-slate-700">{is ? bt.when.is : bt.when.en}</p>
                            <div className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                              {bt.protocols.map((p) => {
                                const done = scheduledIn(p.key, b);
                                return (
                                  <div key={p.key} className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50"}`}>
                                    <span className={`h-[9px] w-[9px] shrink-0 rotate-45 border-2 border-[#1C7A4A] ${done ? "bg-[#1C7A4A]" : "bg-white"}`} />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-[13px] font-bold text-slate-900">{is ? p.name.is : p.name.en}</span>
                                      <span className="block truncate text-[12px] text-slate-500" title={is ? p.prescribes.is : p.prescribes.en}>{done ? (is ? `Áætlað ${shortDate(done.test_date, is)}` : `Scheduled ${shortDate(done.test_date, is)}`) : (is ? p.prescribes.is : p.prescribes.en)}</span>
                                    </span>
                                    {!done && !isPast && (
                                      <button type="button" onClick={() => void scheduleTest(p.key, b.start >= todayIso ? b.start : todayIso)}
                                        className="h-9 shrink-0 rounded-lg border border-[#1C7A4A] bg-white px-2.5 text-[12px] font-bold text-[#15603A] hover:bg-emerald-50">{is ? "+ Áætla" : "+ Schedule"}</button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setTestShowAll((v) => !v)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
                        {testShowAll ? (is ? "Sýna bara næstu lotur" : "Show next blocks only") : (is ? `Sýna allar lotur (${mesoBlocks.length})` : `Show all blocks (${mesoBlocks.length})`)}
                      </button>
                      {!testShowAll && testFocus && focusIdx !== baseIdx && (
                        <button type="button" onClick={() => setTestFocus(null)} className="h-9 rounded-lg px-3 text-[12px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">{is ? "Fara á núverandi lotu" : "Back to the current block"}</button>
                      )}
                    </div>
                  </section>

                  <section className={`${card} flex min-w-0 flex-[2_1_380px] flex-col`}>
                    <h2 className={h2}>{is ? "Áætluð próf" : "Scheduled tests"}</h2>
                    <p className="mt-1 text-[12px] text-slate-500">{is ? "Birtast líka á réttum degi í Míkró-lotunni (vikunni)." : "They also show on the matching day in the Micro cycle (the week)."}</p>
                    <div className="mt-3 text-[12px] font-bold text-slate-700">{is ? "Framundan" : "Upcoming"}</div>
                    {upcoming.length === 0 ? (
                      <p className="mt-1 text-[13px] text-slate-500">{is ? "Engin próf áætluð framundan." : "No upcoming tests."}</p>
                    ) : (
                      <ul className="mt-1.5 space-y-1.5">
                        {upcoming.map((s) => {
                          const b = blockOf(s.test_date);
                          return (
                            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                              <span className="h-[9px] w-[9px] rotate-45 bg-[#1C7A4A]" />
                              <span className="min-w-[72px] text-[13px] font-bold text-slate-900">{nameOf(s.test_key)}</span>
                              {b && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{goalName(goalOf(b))}</span>}
                              <label className="ml-auto">
                                <span className="sr-only">{is ? "Dagsetning" : "Date"}</span>
                                <input type="date" value={s.test_date} onChange={(e) => void moveTest(s, e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-[13px]" />
                              </label>
                              <button type="button" onClick={() => void unscheduleTest(s.id)} aria-label={is ? `Fjarlægja ${nameOf(s.test_key)}` : `Remove ${nameOf(s.test_key)}`} title={is ? "Fjarlægja" : "Remove"}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#a83e28] hover:bg-[#a83e28]/5">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {past.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer py-1 text-[12px] font-bold text-slate-700">{is ? `Lokið · ${past.length} próf` : `Done · ${past.length} tests`}</summary>
                        <ul className="mt-1.5 space-y-1">
                          {past.map((s) => {
                            const b = blockOf(s.test_date);
                            return (
                              <li key={s.id} className="flex items-center gap-2 text-[13px] text-slate-700">
                                <span className="h-[7px] w-[7px] rotate-45 bg-slate-400" />
                                <span className="font-semibold">{nameOf(s.test_key)}</span> · {shortDate(s.test_date, is)}{b ? ` · ${goalName(goalOf(b))}` : ""}
                                <button type="button" onClick={() => void unscheduleTest(s.id)} className="ml-auto text-[12px] font-semibold text-[#a83e28] hover:underline">{is ? "Fjarlægja" : "Remove"}</button>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                    <div className="min-h-4 flex-1" aria-hidden="true" />
                    <div className="border-t border-slate-100 pt-3">
                      <div className="text-[12px] font-bold text-slate-700">{is ? "Bæta við prófi" : "Add a test"}</div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <select value={testAddKey} onChange={(e) => setTestAddKey(e.target.value as TestKey)} aria-label={is ? "Próf" : "Test"} className="h-10 min-w-0 flex-[1_1_120px] rounded-lg border border-slate-300 bg-white px-2 text-[13px]">
                          {keys.map((k) => <option key={k} value={k}>{nameOf(k)}</option>)}
                        </select>
                        <input type="date" value={testAddDate} onChange={(e) => setTestAddDate(e.target.value)} aria-label={is ? "Dagsetning" : "Date"} className="h-10 min-w-0 flex-[1_1_140px] rounded-lg border border-slate-300 px-2 text-[13px]" />
                        <button type="button" disabled={!testAddDate} onClick={() => { if (testAddDate) void scheduleTest(testAddKey, testAddDate); }} className="h-10 rounded-lg bg-[#2740e6] px-4 text-[13px] font-bold text-white disabled:opacity-40">{is ? "Áætla" : "Schedule"}</button>
                      </div>
                    </div>
                  </section>
                </div>

                {/* PRE-SEASON TESTING (moved from Players) — how to run each measure + when to repeat it. */}
                <details className={card}>
                  <summary className="cursor-pointer py-1 text-[15px] font-bold text-slate-900">{is ? "Mælingar í undirbúningi — hvernig + hvenær að endurtaka" : "Pre-season testing — how + when to repeat"}</summary>
            {/* PRE-SEASON TESTING — how to run each measure + when to repeat it across the block. */}
            {plan && (() => {
              const preWeeks = Math.max(1, plan.phases.find((p) => p.key === "preseason")?.weeks ?? 6);
              const hasVald = plan.players.some((p) => p.vald.status != null);
              const schedule = recommendTestingSchedule({ preseasonWeeks: preWeeks, hasGps: plan.tier.loadSource === "gps", hasVald });
              // "Due now" counts from current staleness (re-test the players who are missing/old).
              const STALE = 42; // days
              const dueBy: Partial<Record<TestKey, number>> = {
                aerobic: plan.players.filter((p) => p.masAgeDays == null || p.masAgeDays > STALE).length,
                maxStrength: plan.players.filter((p) => !p.vbt).length,
                cmj: plan.players.filter((p) => p.vald.status == null).length,
              };
              return (
                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Mælingar í undirbúningi — hvernig + hvenær að endurtaka" : "Pre-season testing — how & when to repeat"}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{is ? "Aðlögun er hröð í undirbúningi — endurtaktu prófin á lotuskilum svo MAS/hraðasvæði og styrktarálag fylgi núverandi getu leikmannsins." : "Adaptation is fast in pre-season — repeat the tests at block boundaries so MAS/speed zones + strength loads track each player's current capacity."}</p>
                  <div className="mt-2 space-y-2">
                    {schedule.map((tp) => {
                      const due = dueBy[tp.protocol.key];
                      return (
                        <details key={tp.protocol.key} className="rounded-lg bg-slate-50 p-2.5">
                          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[12px] font-semibold text-slate-900">
                            {is ? tp.protocol.name.is : tp.protocol.name.en}
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tp.priority === "core" ? "bg-[#2740e6]/10 text-[#2740e6]" : "bg-slate-200 text-slate-600"}`}>{tp.priority === "core" ? (is ? "kjarna" : "core") : (is ? "ráðlagt" : "recommended")}</span>
                            <span className="flex flex-wrap gap-1">
                              {tp.weeks.map((w) => <span key={w} className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 border border-slate-200">V{w}</span>)}
                            </span>
                            {due != null && due > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{due} {is ? "þarf núna" : "due now"}</span>}
                          </summary>
                          <p className="mt-1.5 text-[11px] text-slate-600"><span className="font-semibold">{is ? "Mælir" : "Measures"}:</span> {is ? tp.protocol.measures.is : tp.protocol.measures.en}</p>
                          <p className="text-[11px] text-slate-600"><span className="font-semibold">{is ? "Stillir" : "Sets"}:</span> {is ? tp.protocol.prescribes.is : tp.protocol.prescribes.en}</p>
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Framkvæmd" : "How"}</p>
                          <ul className="mt-0.5 space-y-0.5">
                            {tp.protocol.how.map((h, i) => <li key={i} className="text-[11px] text-slate-700">• {is ? h.is : h.en}</li>)}
                          </ul>
                          <p className="mt-1 text-[11px] text-slate-500">{is ? "Taktur" : "Cadence"}: {is ? tp.cadence.is : tp.cadence.en}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{tp.protocol.cite}</p>
                        </details>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">{is ? "Ráðlegging — þjálfari skipuleggur prófin. „Þarf núna\" = leikmenn með gamalt/vantandi próf. Buchheit · Bangsbo · Mann/Weakley · Claudino · Bourne. Lýsandi — engin readiness-lit." : "Advisory — the coach schedules the tests. \"Due now\" = players with a stale/missing test. Buchheit · Bangsbo · Mann/Weakley · Claudino · Bourne. Descriptive — no readiness colour."}</p>
                </div>
              );
            })()}
                </details>

                {/* 4 — REFERENCE: what each test measures and steers */}
                <details className={card}>
                  <summary className="cursor-pointer py-1 text-[15px] font-bold text-slate-900">{is ? "Prófin og hvað þau stýra" : "The tests and what they steer"}</summary>
                  <ul className="mt-2 space-y-2">
                    {allProtocols.map((p) => (
                      <li key={p.key} className="text-[13px] text-slate-700">
                        <b className="text-slate-900">{is ? p.name.is : p.name.en}</b> — {is ? p.measures.is : p.measures.en} <span className="text-slate-600">→ {is ? p.prescribes.is : p.prescribes.en}</span> <span className="text-slate-500">({p.cite})</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[12px] text-slate-500">{is ? "Lýsandi áætlun — þjálfari framkvæmir prófin; snertir aldrei readiness-litinn eða daglega ákvörðun." : "Descriptive plan — the coach runs the tests; never the readiness colour or the daily decision."}</p>
                </details>
              </div>
            );
          })()}

          {/* PLAYERS tab — individualisation + match unit + VALD + data readiness */}
          {tab === "players" && (() => {
            const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
            const h2c = "text-[15px] font-bold text-slate-900";
            const plist = plan.players;
            // Baseline → match target → week plan (per player), mirroring the PDF.
            const bvDays = standardTrainingDays(1);
            const bvWkMult = weeklyTrainingMultiple(bvDays);
            const fmtKv = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
            const pIdx = plist.findIndex((p) => p.playerId === selId);
            const prevP = pIdx > 0 ? plist[pIdx - 1] : null;
            const nextP = pIdx >= 0 && pIdx < plist.length - 1 ? plist[pIdx + 1] : null;
            const EMPH: Record<string, Bi> = {
              hypertrophy: { en: "Hypertrophy", is: "Hypertrophy" },
              max_strength: { en: "Max strength", is: "Hámarksstyrkur" },
              power: { en: "Power / speed", is: "Afl / hraði" },
              strength_endurance: { en: "Strength-endurance", is: "Styrktar-þol" },
              injury_prevention_priority: { en: "Injury prevention", is: "Meiðslavarnir" },
            };
            type Tone = "ok" | "warn" | "bad" | "none";
            const TONE: Record<Tone, { bg: string; c: string; dot: string }> = {
              ok: { bg: "rgba(28,122,74,0.08)", c: "#15603a", dot: "#1c7a4a" },
              warn: { bg: "rgba(222,147,40,0.14)", c: "#7a5210", dot: "#de9328" },
              bad: { bg: "rgba(168,62,40,0.08)", c: "#8a3220", dot: "#a83e28" },
              none: { bg: "#f1f5f9", c: "#475569", dot: "#94a3b8" },
            };
            const chips: Array<{ label: string; tone: Tone; title: string }> = player ? [
              { label: is ? "Leikviðmið" : "Match unit", tone: player.matchUnit.load.typical == null ? "bad" : player.matchUnit.confidence === "low" ? "warn" : "ok", title: is ? player.matchUnit.windowNote.is : player.matchUnit.windowNote.en },
              { label: "MAS", tone: player.masKmh == null ? "bad" : player.masAgeDays != null && player.masAgeDays > 42 ? "warn" : "ok", title: player.masKmh == null ? (is ? "Ekkert þolpróf" : "No endurance test") : `${player.masKmh} km/h${player.masAgeDays != null ? ` · ${player.masAgeDays} ${is ? "daga gamalt" : "days old"}` : ""}` },
              { label: "VBT", tone: player.vbt ? "ok" : player.strengthFallback ? "warn" : "bad", title: player.vbt ? player.vbt.exercise : player.strengthFallback ? (is ? "Rannsóknarviðmið í stað VBT" : "Research default instead of VBT") : (is ? "Enginn VBT-prófíll" : "No VBT profile") },
              { label: `VALD${player.vald.status ? ` · ${player.vald.status}` : ""}`, tone: player.vald.status === "green" ? "ok" : player.vald.status === "yellow" ? "warn" : player.vald.status === "red" ? "bad" : "none", title: is ? player.vald.note.is : player.vald.note.en },
            ] : [];
            const gapCount = player ? player.gaps.filter((g) => g.severity !== "ok").length : 0;
            const pb = playerBlock;
            const lighterTxt = !pb ? "" : pb.lighterPct > 0 ? (is ? `~${pb.lighterPct}% léttari en fullur rampur` : `~${pb.lighterPct}% lighter than the full ramp`) : pb.lighterPct < 0 ? (is ? `~${-pb.lighterPct}% þyngri en fullur rampur` : `~${-pb.lighterPct}% heavier than the full ramp`) : (is ? "á fullum rampi" : "on the full ramp");
            const tiltTxt = !pb ? "" : pb.hsrEmph > 1.02 ? (is ? ", með háhraða yfir liðinu á hlaupadögum" : ", with HSR above the team on Locomotive days") : pb.hsrEmph < 0.98 ? (is ? ", meira vélrænt en liðið" : ", more mechanical than the team") : "";
            const emphLabel = preEmphasis ? (is ? (EMPH[preEmphasis.emphasis]?.is ?? preEmphasis.emphasis) : (EMPH[preEmphasis.emphasis]?.en ?? preEmphasis.emphasis)) : null;
            const verdict = !player ? "" : `${player.name}: ${pb ? `${is ? "lotan hans er" : "his block is"} ${lighterTxt}${tiltTxt}.` : (is ? "lotan hans birtist þegar Mesó-lota er sett upp." : "his block appears once a Meso block is laid out.")}${emphLabel ? ` ${is ? "Styrktaráhersla" : "Strength emphasis"}: ${emphLabel}.` : ""}`;
            const mu = player?.matchUnit ?? null;
            const wt = player ? player.weekTargets[player.weekTargets.current] : null;
            const SUBS: Array<{ key: number; label: string }> = [
              { key: 0, label: is ? "Lotan hans" : "His block" },
              { key: 1, label: is ? "Uppbygging" : "Build-up" },
              { key: 2, label: is ? "Æfingagildi" : "Training values" },
              { key: 3, label: `${is ? "Gögn" : "Data"}${gapCount ? ` (${gapCount} ${is ? "vantar" : "missing"})` : ""}` },
            ];
            const squadLp = (p: typeof plist[number]) => {
              const cap = p.vald.capPct; const mm = cap == null ? 1.4 : cap >= 100 ? 1.4 : cap >= 85 ? 1.15 : 1.0;
              const am = p.recentMinutesAvg; const ls = am == null ? 1.0 : am >= 70 ? 0.9 : am >= 40 ? 0.95 : 1.0;
              const up = Math.min(1.4, (blkBase + blkStep * Math.max(0, blkWeeks - 2)) / 100);
              return up > 0 ? Math.round((1 - (Math.min(up, mm) * ls) / up) * 100) : 0;
            };

            return (<div className="space-y-4">
          {flowNote(is ? "Mesó-lota · leik-eining leikmanns" : "Meso block · player match unit", is ? "allar undirbúningsvikur (season_plans) · PDF" : "every pre-season week (season_plans) · PDF")}

          {/* 1 — PLAYER BAR: pick once, everything below follows */}
          <section className={`${card} flex flex-wrap items-center gap-x-5 gap-y-3`} aria-label={is ? "Leikmaður" : "Player"}>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => prevP && setSelId(prevP.playerId)} disabled={!prevP} aria-label={is ? "Fyrri leikmaður" : "Previous player"} className="h-10 w-10 rounded-lg border border-slate-300 bg-white text-[18px] text-slate-700 hover:bg-slate-50 disabled:opacity-40">‹</button>
              <label>
                <span className="sr-only">{is ? "Leikmaður" : "Player"}</span>
                <select value={selId} onChange={(e) => setSelId(e.target.value)} className="h-10 min-w-[220px] rounded-lg border border-slate-300 bg-white px-2.5 text-[16px] font-bold text-slate-900">
                  {plist.map((p) => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => nextP && setSelId(nextP.playerId)} disabled={!nextP} aria-label={is ? "Næsti leikmaður" : "Next player"} className="h-10 w-10 rounded-lg border border-slate-300 bg-white text-[18px] text-slate-700 hover:bg-slate-50 disabled:opacity-40">›</button>
            </div>
            {player?.position && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700">{player.position}</span>}
            <div className="flex min-w-0 flex-[1_1_320px] flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c.label} title={c.title} className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold" style={{ background: TONE[c.tone].bg, color: TONE[c.tone].c }}>
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: TONE[c.tone].dot }} />{c.label}
                </span>
              ))}
            </div>
            {playerBlock && <button type="button" onClick={exportPlayerBlock} className="h-10 rounded-lg border border-[#2740e6] bg-white px-3.5 text-[13px] font-bold text-[#2740e6] hover:bg-[#2740e6]/5">{is ? "Lota leikmanns (PDF)" : "Player block (PDF)"}</button>}
          </section>

          {player && (<>
          {/* 2 — VERDICT + four facts */}
          <section className="space-y-3">
            <p className="text-[17px] font-bold text-slate-900">{verdict}</p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Leikviðmið hans" : "His match unit"}</div>
                <div className="mt-0.5 text-[20px] font-bold text-slate-900">{mu && mu.load.typical != null ? `${mu.load.typical} PL${mu.hsr.typical != null ? ` · ${mu.hsr.typical} m HSR` : ""}` : "—"}</div>
                <div className="text-[13px] text-slate-600">{mu ? (mu.load.typical != null ? `${is ? "Miðgildi" : "Median of"} ${mu.nNearFull} ${is ? "heilla leikja" : "near-full matches"} · ${mu.confidence === "high" ? (is ? "há vissa" : "high confidence") : mu.confidence === "medium" ? (is ? "miðlungs vissa" : "medium confidence") : (is ? "lítil vissa" : "low confidence")}` : (is ? "Enginn heill leikur — stöðu-grunnlína" : "No near-full match — position baseline")) : ""}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Vikumark" : "Weekly target"}</div>
                <div className="mt-0.5 text-[20px] font-bold text-slate-900">{wt?.weeklyLoadTarget != null ? `≈ ${wt.weeklyLoadTarget} PL` : "—"}</div>
                <div className="text-[13px] text-slate-600">{wt ? `${wt.phase === "preseason" ? (is ? "Undirbúningur" : "Pre-season") : (is ? "Keppnistímabil" : "In-season")}${wt.matchMultiple != null ? ` · ${wt.matchMultiple}× ${is ? "leikur" : "match"}` : ""} · ${wt.sessionCount} ${is ? "æfingar" : "sessions"}` : ""}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Geta til að taka álag (VALD)" : "Readiness to load (VALD)"}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[20px] font-bold text-slate-900">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: player.vald.status === "green" ? "#1c7a4a" : player.vald.status === "yellow" ? "#de9328" : player.vald.status === "red" ? "#a83e28" : "#94a3b8" }} />
                  {player.vald.capPct != null ? `${is ? "Þak" : "Cap"} ${player.vald.capPct}%` : player.vald.status ? (is ? "Ekkert þak" : "No cap") : (is ? "Engin VALD-gögn" : "No VALD data")}
                </div>
                <div className="text-[13px] text-slate-600">{pb && pb.maxMult < 1.4 ? (is ? `Toppur takmarkaður við ×${pb.maxMult.toFixed(2)}` : `Peak capped at ×${pb.maxMult.toFixed(2)}`) : (is ? "Magnþak — ekki readiness-liturinn" : "Volume cap — not the readiness colour")}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Styrktaráhersla" : "Strength emphasis"}</div>
                <div className="mt-0.5 text-[20px] font-bold text-slate-900">{emphLabel ?? "—"}</div>
                <div className="text-[13px] text-slate-600">{preEmphasis ? (preEmphasis.driver === "dsi" && preEmphasis.dsi ? `DSI ${preEmphasis.dsi.ratio.toFixed(2)} · ${is ? "reglur, ekki gervigreind" : "rules, not AI"}` : `${is ? "vissa" : "confidence"}: ${preEmphasis.confidence}`) : (is ? "Á við í undirbúningi" : "Applies in pre-season")}</div>
              </div>
            </div>
          </section>

          {/* 3 — PLAYER SECTIONS: one at a time instead of nine stacked cards */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div role="tablist" aria-label={is ? "Hlutar" : "Sections"} className="flex gap-0.5 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3">
              {SUBS.map((s) => (
                <button key={s.key} type="button" role="tab" aria-selected={plSub === s.key} onClick={() => setPlSub(s.key)}
                  className={`h-12 shrink-0 px-3.5 text-[13px] font-bold ${plSub === s.key ? "text-[#2740e6] shadow-[inset_0_-2px_0_#2740e6]" : "text-slate-700 hover:text-slate-900"}`}>{s.label}</button>
              ))}
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              {plSub === 0 && (<>
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
                  <p className="text-[13px] font-semibold text-slate-900">{is ? `${player.name}: lotan er ${lighterTxt} en fullur rampur${!pb.useOwn ? " (liðs-grunnlína — fáir heilir leikir)" : ""}${tiltTxt}.` : `${player.name}'s block runs ${lighterTxt} than the full ramp${!pb.useOwn ? " (squad baseline — few full matches)" : ""}${tiltTxt}.`}{pb.steered && <span className="ml-1.5 rounded bg-[#7a5cc4]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#7a5cc4]">{is ? "veikleika-stýrt" : "weakness-steered"}</span>}</p>
                  {/* Level 1 — the drivers */}
                  <ul className="mt-1.5 space-y-0.5 text-[12px] text-slate-700">
                    <li>• {pb.useOwn ? (is ? `Eigið leikviðmið: ${pb.unit.load} PL · ${km(pb.unit.hsr)} háhraði (miðgildi ${pb.nNearFull} heilla leikja).` : `Own match unit: ${pb.unit.load} PL · ${km(pb.unit.hsr)} HSR (median of ${pb.nNearFull} full matches).`) : (is ? `Fáir heilir leikir (${pb.nNearFull}) — nota liðs-leikviðmið.` : `Few full matches (${pb.nNearFull}) — using the squad match unit.`)}</li>
                    <li>• {pb.posLabel ? (is ? `${pb.posLabel.is}: háhraði ×${pb.hsrEmph.toFixed(2)}, vélrænt ×${pb.mechEmph.toFixed(2)} (Figueiredo).` : `${pb.posLabel.en} tilt: HSR ×${pb.hsrEmph.toFixed(2)}, mechanical ×${pb.mechEmph.toFixed(2)} (Figueiredo).`) : (is ? "Staða óþekkt — liðshlutföll." : "Position unknown — team shares.")}</li>
                    <li>• {pb.maxMult < 1.4 ? (is ? `VALD ${player.vald.status ?? ""}: toppur takmarkaður við ×${pb.maxMult.toFixed(2)}. ` : `VALD ${player.vald.status ?? ""}: peak capped at ×${pb.maxMult.toFixed(2)}. `) : ""}{pb.loadScale < 1 ? (is ? `~${pb.avgMin}′ að meðaltali nýlega → æfingaálag trimmað ×${pb.loadScale.toFixed(2)}.` : `~${pb.avgMin}′ recent average → training load trimmed ×${pb.loadScale.toFixed(2)}.`) : (pb.avgMin != null && pb.avgMin < 40 ? (is ? `Fáar mínútur (~${pb.avgMin}′) → fullur rampur + áfyllingar.` : `Low minutes (~${pb.avgMin}′) → full ramp + top-ups.`) : (pb.maxMult >= 1.4 ? (is ? "Fullur rampur — ekkert þak/trim." : "Full ramp — no cap or trim.") : ""))}</li>
                  </ul>
                  <div className="mt-1.5"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${conf.c}`}>{is ? "vissa" : "confidence"}: {conf.t}</span></div>
                  {/* Level 2 — the individualised block (compact calendar) */}
                  <div className="mt-3 overflow-x-auto">
                    <div className="grid min-w-[520px] gap-1" style={{ gridTemplateColumns: "auto repeat(7, 1fr)" }}>
                      <div />
                      {dows.map((d) => <div key={d} className="text-center text-[11px] font-medium uppercase text-slate-500">{d}</div>)}
                      {b.weeks.map((w) => (
                        <React.Fragment key={w.index}>
                          <div className="flex flex-col justify-center pr-1"><span className="text-[11px] font-semibold text-slate-700">{is ? "V" : "W"}{w.index + 1}</span><span className={`text-[11px] font-bold ${w.isDeload ? "text-[#de9328]" : "text-[#2740e6]"}`}>{w.isDeload ? (is ? "niðurtr." : "deload") : `×${w.mult.toFixed(2)}`}</span></div>
                          {w.days.map((d, i) => (
                            <div key={i} className="rounded px-0.5 py-1 text-center leading-tight" style={{ background: tint[d.type] }} title={d.type === "rest" ? `${is ? d.dow.is : d.dow.en} ${d.md} — ${is ? "Frí" : "Rest"}` : `${is ? d.dow.is : d.dow.en} ${d.md} · ${is ? d.label.is : d.label.en} · ${is ? "Vegal" : "Dist"} ${km(d.dist)} · HSR ${km(d.hsr)} · PL ${d.load ?? "–"}${imaLine(d, is) ? ` · ${imaLine(d, is)}` : ""}`}>
                              <div className="text-[11px] font-semibold" style={{ color: typeColor[d.type] }}>{abbr(d.type)}</div>
                              <div className="text-[11px] tabular-nums text-slate-500">{d.type === "rest" ? "" : d.load ?? ""}</div>
                            </div>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">{is ? "Sama beinagrind og Mesó-lotan (vikur/leikir/dagsgerðir/niðurtröppun) — aðeins tölur og þök einstaklingsmiðuð. Upphafspunktur, ekki viðmið (Little & Buchheit). Aldrei readiness-liturinn." : "Same skeleton as the Meso Cycle (weeks/matches/day-types/deload) — only the numbers and caps individualise. A starting point, not a norm (Little & Buchheit). Never the readiness colour."}</p>
                  {(b.unit.accHiEff != null || b.unit.stride != null) && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-[#2740e6]">{is ? "Sýna vélrænt / IMA (Acc·Dec B2–3, skref, stefna)" : "Show mechanical/IMA detail (Acc·Dec B2–3, stride, direction)"}</summary>
                      <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">
                        {b.weeks.flatMap((w) => w.days.map((d, i) => ({ d, i, wi: w.index })).filter(({ d }) => d.type !== "rest")).map(({ d, i, wi }) => (
                          <li key={`${wi}-${i}`} className="tabular-nums"><span className="text-slate-500">{is ? "V" : "W"}{wi + 1} {is ? d.dow.is : d.dow.en} {d.md}</span> · <b style={{ color: typeColor[d.type] }}>{abbr(d.type)}</b> — {imaLine(d, is) || (is ? "engin IMA-gögn" : "no IMA data")}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[11px] text-slate-500">{is ? "Stefnu-halli einstaklingsmiðaður eftir stöðu; skref/átök skala frá eigin leikviðmiði. Buchheit (stefnu-bil)." : "Direction tilt individualised by position; stride/efforts scale from his own match unit. Buchheit (directional gap)."}</p>
                    </details>
                  )}

                </div>
              );
            })()}
              </>)}
              {plSub === 1 && (<>
          {/* BUILD-UP TRACKING — actual accrued weekly training load vs the planned ramp, phase-gated on
              chronic-baseline maturity (plan-relative at cold start → rolling/ACWR as the base matures).
              Closes the plan → do → compare loop. Reads load only, never the readiness colour. */}
          {player && trackingBlock && (
            <BuildUpTrackingCard
              playerId={selId}
              playerName={player.name}
              block={trackingBlock.block}
              planConfidence={trackingBlock.confidence}
              authHeader={authHeader}
              isEN={!is}
            />
          )}

          {/* WEAKNESS-STEERED BUILD-UP — reads Total Player Analysis (athlete-axis weaknesses + levers +
              VALD focus) and biases the per-player ramp toward the qualities he's behind on. Read, not rebuilt. */}
          {player && steerData?.hasAthlete && steer && steer.targets.length > 0 && (() => {
            const qName = (id: QualityRead["id"]) => (is ? QUALITY_BY_ID[id].is : QUALITY_BY_ID[id].en);
            const hard = steer.targets.filter((t) => !t.hint);
            const hints = steer.targets.filter((t) => t.hint);
            const top = hard.length ? hard : steer.targets; // if nothing confident, narrate the hints
            const names = top.slice(0, 2).map((t) => qName(t.id));
            const axisWord = (a: "hsr" | "mech") => (a === "hsr" ? (is ? "háhraða/hlaup" : "HSR/running") : (is ? "Acc/Dec (vélrænt)" : "Acc/Dec (mechanical)"));
            const emphAxes = Array.from(new Set(hard.map((t) => t.axis).filter((a): a is "hsr" | "mech" => a !== "strength"))).map(axisWord);
            const verdict = is
              ? `Uppbygging forgangsraðar ${names.join(" og ")}${names.length ? ` — ${player.name}s lægstu íþrótta-eiginleikar` : ""}${emphAxes.length && steerActive ? `, rampar ${emphAxes.join(" + ")} hraðast að leikviðmiðinu` : ""}.`
              : `Build-up prioritises ${names.join(" and ")}${names.length ? ` — ${player.name}'s lowest athlete qualities` : ""}${emphAxes.length && steerActive ? `, ramping ${emphAxes.join(" + ")} fastest toward the match unit` : ""}.`;
            return (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-bold text-slate-900">{is ? "Veikleika-stýrð uppbygging" : "Weakness-steered build-up"}</h2>
                <span className="rounded bg-[#7a5cc4]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#7a5cc4]">{is ? "úr Heildargreiningu" : "from Total Player Analysis"}</span>
                <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={steerNeutral} onChange={(e) => setSteerNeutral(e.target.checked)} />{is ? "Hlutlaus rampi (án halla)" : "Neutral ramp (no bias)"}</label>
              </div>
              {/* Level 0 — verdict */}
              <p className="mt-1 text-[13px] font-semibold text-slate-900">{steerActive ? verdict : (is ? `Hlutlaus rampi — engin veikleika-halli beittur.${hard.length ? " Kveiktu af til að forgangsraða veikleikum." : ""}` : `Neutral ramp — no weakness bias applied.${hard.length ? " Untick to prioritise the gaps." : ""}`)}</p>
              {/* Level 1 — the targeted gaps + KPIs + levers, each source-tagged */}
              <ul className="mt-1.5 space-y-1 text-[12px] text-slate-700">
                {top.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <span className="font-medium">{qName(t.id)}</span>
                    {t.percentile != null && <span className="text-slate-500"> ({t.percentile}th pctl)</span>}
                    {t.axis !== "strength" && <span className="text-slate-500"> → {is ? "áhersla" : "emphasise"} {is ? t.kpis.is : t.kpis.en}</span>}
                    {t.hint && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-700">{is ? "vísbending" : "hint"}</span>}
                    {steerData.levers[t.id] && <div className="text-[11px] text-slate-500">↳ {is ? steerData.levers[t.id].is : steerData.levers[t.id].en}{steerData.levers[t.id].cite ? ` (${steerData.levers[t.id].cite})` : ""}</div>}
                  </li>
                ))}
              </ul>
              {/* VALD strength focus (the force/VBT qualities the GPS ramp can't build) */}
              {steerData.valdPlan && steerData.valdPlan.priorities.length > 0 && (
                <p className="mt-1.5 text-[11px] text-slate-600"><span className="font-medium">{is ? "Kraftur (VALD)" : "Strength (VALD)"}:</span> {steerData.valdPlan.priorities.slice(0, 2).map((p) => `${p.quality} — ${p.lever}`).join(" · ")} <span className="rounded bg-[#7a5cc4]/10 px-1 text-[11px] font-semibold text-[#7a5cc4]">VALD</span></p>
              )}
              {hints.length > 0 && steerActive && <p className="mt-1 text-[11px] text-amber-700">{is ? `Vísbendingar (lítið úrtak / lítil vissa) eru sýndar en ekki notaðar til að halla rampanum: ${hints.map((t) => qName(t.id)).join(", ")}.` : `Hints (thin sample / low confidence) are shown but not used to bias the ramp: ${hints.map((t) => qName(t.id)).join(", ")}.`}</p>}
              <p className="mt-1.5 text-[11px] text-slate-500">{is ? "Íþrótta-ásinn stýrir líkamlegu uppbyggingunni (GPS/VALD/VBT). Innan öruggra þaka rampans (hraði / leikþak). Lýsandi — aldrei readiness-liturinn." : "The athlete axis steers the physical build-up (GPS/VALD/VBT). Within the ramp's safe caps (rate / match ceiling). Descriptive — never the readiness colour."} <a className="text-[#2740e6] hover:underline" href={`/coach/total-player-analysis?playerId=${encodeURIComponent(selId)}`}>{is ? "Opna prófílinn →" : "Open the profile →"}</a></p>
            </section>
            );
          })()}

          {/* BUILD-UP PLAN — the harvested Progressive Overload engine: ramp each player from current baseline
              TO his match unit (pre-season / return-to-play). Reuses ProgressiveOverloadCard (its own fetch). */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-[15px] font-bold text-slate-900">{is ? "Uppbyggingar-áætlun (undirbúningur / aftur í leik)" : "Build-up plan (pre-season / return-to-play)"}</h2>
            <p className="mt-1 mb-2 text-[11px] text-slate-500">{is ? `Örugg vikuleg þróun frá núverandi grunnlínu AÐ leikviðmiði${player ? ` ${player.name}s` : " leikmanns"} — magn hraðast, háhraði/sprettur hægast (aftanlæri).${steerActive ? " Áherslu-KPI (veikleika-stýrð) rampa hraðar, innan sömu þaka." : ""} Aðal-þakið er leikkrafan + bráðaálags-þróun; ACWR er umdeilt aukagildi. Lýsandi — aldrei readiness-liturinn.` : `A safe weekly ramp from current baseline TO ${player ? `${player.name}'s` : "the player's"} match unit — volume fastest, HSR/sprint slowest (hamstring).${steerActive ? " The emphasised KPIs (weakness-steered) ramp faster, within the same caps." : ""} The primary ceiling is match demand + acute-load trend; ACWR is a contested secondary readout. Descriptive — never the readiness colour.`}</p>
            <ProgressiveOverloadCard weeks={blkWeeks} playerId={selId || undefined} emphasis={poEmphasis} focusLabel={player?.name} />
          </section>
              </>)}
              {plSub === 2 && (<>
          {/* PRE-SEASON STARTING EMPHASIS (Part 2) — this player's own strength/power/body-comp/deficits */}
          {preEmphasis && (() => {
            const EMPH: Record<string, Bi> = {
              hypertrophy: { en: "Hypertrophy — build tissue first", is: "Hypertrophy — byggja vef fyrst" },
              max_strength: { en: "Max strength — raise the ceiling", is: "Hámarksstyrkur — hækka þakið" },
              power: { en: "Power / speed — convert strength to fast force", is: "Afl / hraði — breyta styrk í hraðan kraft" },
              strength_endurance: { en: "Strength-endurance / reconditioning", is: "Styrktar-þol / enduruppbygging" },
              injury_prevention_priority: { en: "Injury prevention", is: "Meiðslavarnir" },
            };
            const confTint = preEmphasis.confidence === "high" ? "bg-emerald-100 text-emerald-700" : preEmphasis.confidence === "moderate" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
            return (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#7a5cc4]/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#7a5cc4]">{is ? "styrkur" : "strength"}</span>
                  <h2 className="text-[15px] font-bold text-slate-900">{is ? "Undirbúnings-upphaf (styrkur)" : "Pre-season starting emphasis"}</h2>
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${confTint}`}>{is ? "vissa" : "conf"}: {preEmphasis.confidence}</span>
                </div>
                {/* Level 0 — the verdict */}
                <p className="mt-1 text-[13px] font-semibold text-slate-900">{is ? (EMPH[preEmphasis.emphasis]?.is ?? preEmphasis.emphasis) : (EMPH[preEmphasis.emphasis]?.en ?? preEmphasis.emphasis)}
                  {preEmphasis.secondary && <span className="ml-1.5 text-[11px] font-normal text-[#7a5cc4]">+ {is ? EMPH[preEmphasis.secondary]?.is : EMPH[preEmphasis.secondary]?.en}</span>}
                </p>
                {/* Level 1 — his numbers */}
                <p className="mt-1 text-[12px] text-slate-600">{is ? preEmphasis.why.is : preEmphasis.why.en}</p>
                {/* DSI provenance — the objective force-vs-power driver, or why we fell back to percentiles */}
                {(() => {
                  const dr = preEmphasis.dsiRead;
                  const TIER: Record<string, Bi> = {
                    ballistic: { en: "ballistic", is: "ballistic" },
                    concurrent: { en: "concurrent", is: "concurrent" },
                    max_strength: { en: "max-strength", is: "hámarksstyrkur" },
                    insufficient: { en: "insufficient", is: "ófullnægjandi" },
                  };
                  if (preEmphasis.driver === "dsi" && preEmphasis.dsi) {
                    const d = preEmphasis.dsi;
                    const conf = dr?.confidence ?? "low";
                    const ct = conf === "high" ? "bg-emerald-100 text-emerald-700" : conf === "moderate" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="rounded bg-[#7a5cc4]/12 px-1.5 py-0.5 font-semibold text-[#7a5cc4]">DSI {d.ratio.toFixed(2)} · {is ? TIER[d.tier]?.is : TIER[d.tier]?.en}</span>
                        <span className="rounded bg-[#eef0fb] px-1.5 py-0.5 font-semibold text-[#2740e6]">{is ? "reglur · ekki gervigreind" : "rules · not AI"}</span>
                        {dr?.basis === "squad" && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{is ? "m.v. liðið" : "vs squad"}</span>}
                        <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${ct}`}>{conf}</span>
                        <span className="w-full text-slate-500">{is ? "Drífur stefnuna — CMJ÷IMTP hámarkskraftur. " : "Drives the direction — CMJ÷IMTP peak force. "}{dr ? (is ? dr.reason.is : dr.reason.en) : ""}</span>
                      </div>
                    );
                  }
                  if (dr && dr.coverage !== "full") {
                    return <p className="mt-1.5 text-[11px] text-slate-500">↩ {is ? dr.reason.is : dr.reason.en}</p>;
                  }
                  if (dr && dr.coverage === "full" && dr.dsi) {
                    return <p className="mt-1.5 text-[11px] text-slate-500">{is ? `DSI ${dr.dsi.ratio.toFixed(2)} til staðar, en líkamsástand hefur forgang (byggja vef fyrst).` : `DSI ${dr.dsi.ratio.toFixed(2)} available, but body composition takes priority (build tissue first).`}</p>;
                  }
                  return null;
                })()}
                {preEmphasis.needsBodyComp && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">
                    ⚑ {is ? "Skráðu líkamsástand (fita %/vöðvamassi) til að greina byggja-vef frá hækka-þak." : "Record body composition (fat %/lean mass) to split build-tissue vs raise-the-ceiling."}
                    <a href={`/coach/transfer-report`} className="font-semibold text-[#2740e6] hover:underline">{is ? "Mæla" : "Record"} →</a>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-slate-500">{preEmphasis.cite}. {is ? "Ráðgefandi — allir fara í gegnum röðina; þetta setur upphafið. Aldrei readiness-liturinn." : "Advisory — everyone runs the sequence; this sets the start. Never the readiness colour."}</p>
              </section>
            );
          })()}

            {player && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {/* Endurance intervals from his MAS */}
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Þolþjálfun — interval-hraði (Type 1–5)" : "Endurance — interval speeds (Type 1–5)"}</div>
                  {player.masKmh != null ? (
                    <>
                      <p className="mt-1 text-[12px] text-slate-600">{is ? "MAS" : "MAS"}: <b>{player.masKmh} km/klst</b> <span className="text-slate-500">· {player.masSource}{player.masAgeDays != null ? ` · ${player.masAgeDays}d` : ""}</span></p>
                      <table className="mt-1 w-full text-[12px] text-slate-700">
                        <tbody>{player.intervals.map((z) => <tr key={z.type}><td className="py-0.5 pr-2 text-slate-500">T{z.type} · {is ? z.label.is : z.label.en}</td><td className="py-0.5 text-right font-semibold tabular-nums">{z.kmh} km/klst</td><td className="py-0.5 pl-2 text-right text-[11px] text-slate-500">{z.pctMas}% MAS</td></tr>)}</tbody>
                      </table>
                    </>
                  ) : <p className="mt-1 text-[12px] text-slate-500">{is ? "Ekkert þolpróf — sjá gögn-tilbúnaðar spjaldið." : "No endurance test — see the data-readiness panel."}</p>}
                </div>
                {/* Strength from his VBT */}
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Styrktarþjálfun — VBT" : "Strength — VBT"}</div>
                  {player.vbt ? (
                    <>
                      <p className="mt-1 text-[12px] text-slate-700">{player.vbt.exercise} · <b>{player.vbt.latestLoadKg ?? "–"} kg</b> @ {player.vbt.latestMeanV?.toFixed(2)} m/s → <span className="font-semibold">{is ? player.vbt.zone.is : player.vbt.zone.en}</span></p>
                      <p className="mt-1 text-[11px] text-slate-500">{is ? player.vbt.note.is : player.vbt.note.en}</p>
                    </>
                  ) : player.strengthFallback ? (
                    <>
                      <p className="mt-1 text-[12px] text-slate-700"><span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-violet-700">{is ? "rannsóknar-viðmið (enginn VBT)" : "research default (no VBT)"}</span> {is ? player.strengthFallback.quality.is : player.strengthFallback.quality.en}</p>
                      <p className="mt-1 text-[12px] text-slate-700"><b>{is ? player.strengthFallback.pct1rm.is : player.strengthFallback.pct1rm.en}</b> · {is ? player.strengthFallback.velocity.is : player.strengthFallback.velocity.en} · {is ? player.strengthFallback.intent.is : player.strengthFallback.intent.en}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{player.strengthFallback.cite}</p>
                    </>
                  ) : <p className="mt-1 text-[12px] text-slate-500">{is ? "Enginn VBT prófíll." : "No VBT profile."}</p>}
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
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Leikviðmið hans (leikurinn = einingin)" : "His match unit (the match = the unit)"}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${conf.c}`}>{conf.t}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{is ? mu.windowNote.is : mu.windowNote.en} {mu.minutesTypical != null && (is ? `Dæmigerðar ${mu.minutesTypical} mín.` : `Typical ${mu.minutesTypical} min.`)} {is ? "Dæmigert = miðgildi; ↑ = topp-leikur (p90)." : "Typical = median; ↑ = peak match (p90)."}</p>
                  {mu.load.typical != null ? (
                    <div className="mt-1.5 overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="py-0.5 pr-2 font-medium">{is ? "Ás" : "Axis"}</th><th className="py-0.5 pr-2 text-right font-medium">PL</th><th className="py-0.5 pr-2 text-right font-medium">HSR</th><th className="py-0.5 pr-2 text-right font-medium">{is ? "Sprettur" : "Sprint"}</th><th className="py-0.5 pr-2 text-right font-medium">Acc</th><th className="py-0.5 text-right font-medium">Dec</th></tr></thead>
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
                  ) : <p className="mt-1 text-[11px] text-slate-500">{is ? "Enginn næstum-heill leikur enn — vikumarkið fellur á stöðu-grunnlínu." : "No near-full match yet — the weekly target falls back to the position baseline."}</p>}
                  {/* The weekly target the unit implies — pre-season supra-match vs in-season match+headroom */}
                  <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: wt.phase === "preseason" ? "#7a5cc4" : "#2740e6" }}>{wt.phase === "preseason" ? (is ? "Undirbúningur" : "Pre-season") : (is ? "Keppni" : "In-season")}</span>
                      {wt.weeklyLoadTarget != null && <span className="text-[12px] font-semibold text-slate-900">{is ? "Vikumark" : "Weekly target"} ≈ {wt.weeklyLoadTarget} PL {wt.matchMultiple != null && <span className="font-normal text-slate-500">({wt.matchMultiple}× {is ? "leik" : "match"})</span>}</span>}
                      {wt.perSessionLoad != null && <span className="text-[11px] text-slate-500">≈ {wt.perSessionLoad}/{is ? "æfingu" : "session"} × {wt.sessionCount}</span>}
                      {wt.topUp != null && wt.topUp > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{is ? "Áfylling" : "Top-up"} +{wt.topUp}</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">{is ? wt.note.is : wt.note.en}</p>
                    {/* Match-compensation (Casamichana 2022): a low-/no-minute player accumulates less weekly
                        load — especially HSR/sprint — so prescribe a run-based top-up on MD/MD+1. Shown only
                        when the gap is material (> ~15% of a match). Descriptive — not the readiness colour. */}
                    {wt.phase === "inseason" && wt.topUp != null && player.matchUnit.load.typical != null && wt.topUp > 0.15 * player.matchUnit.load.typical && (
                      <div className="mt-1.5 rounded-md border border-[#7a5cc4]/25 bg-[#7a5cc4]/5 px-2 py-1.5 text-[11px] text-slate-700">
                        <span className="font-semibold text-[#55389E]">{is ? "Leik-bæting" : "Match-compensation"}</span>{" "}
                        {is
                          ? `≈ ${wt.topUp} PL hlaupa-áhersla á leikdag eða MD+1 — fáar/engar mínútur safna minna álagi (einkum háhraðahlaup/sprettum). Leik-eining leikmannsins er viðmiðið.`
                          : `≈ ${wt.topUp} PL run-based on matchday or MD+1 — a low-/no-minute player accumulates less load (especially HSR/sprint). Anchored to the player's own match unit.`}
                        <span className="text-slate-400"> (Casamichana 2022)</span>
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-slate-500">{wt.cite}</p>
                  </div>
                </div>
              );
            })()}
              </>)}
              {plSub === 3 && (<>
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
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Gögn tilbúin? — hvað vantar" : "Data readiness — what's missing"}</div>
                {player.gaps.length === 0 ? <p className="mt-1 text-[12px] text-emerald-700">{is ? "Öll gögn til staðar." : "All data present."}</p> : (
                  <ul className="mt-1 space-y-1">
                    {player.gaps.map((g) => <li key={g.key} className="flex items-start gap-2 text-[12px] text-slate-700"><span className={`mt-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${sevColor(g.severity)}`}>{g.severity}</span><span>{is ? g.message.is : g.message.en}</span></li>)}
                  </ul>
                )}
              </div>
            )}
              </>)}
            </div>
          </section>
          </>)}

          {/* 4 — THE SQUAD: team-level content, kept apart from the player; a row opens that player */}
          <section className={card}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className={h2c}>{is ? "Allur hópurinn" : "The whole squad"}</h2>
              <span className="text-[12px] text-slate-500">{is ? "Smelltu á leikmann til að opna hann hér að ofan." : "Click a player to open him above."}</span>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">{is ? "Grunnur (nýleg þjálfun, síð. 28 d — hvar leikmaðurinn er núna) → leik-mark (krafan per leik) → vikumark (áætlað vikuálag, leik-PL × vikumargfeldi ~2,35×)." : "Baseline (recent training, last 28d — where each player is now) → match target (per-match demand) → week target (planned weekly load, match PL × the weekly multiple ~2.35×)."}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1040px] text-[13px]">
                <thead><tr className="text-left text-[11px] text-slate-500">
                  <th className="py-1.5 pr-2 font-semibold">{is ? "Leikmaður" : "Player"}</th>
                  <th className="py-1.5 pr-2 font-semibold">{is ? "Staða" : "Position"}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{is ? "Grunnur /æf (%leik)" : "Baseline /sess (%match)"}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{is ? "Leik-mark" : "Match target"}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{is ? "Vika PL" : "Week PL"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold" title={is ? "Hversu miklu léttari (−) rampurinn er vs fullur rampur, eftir VALD-þaki + mínútu-trimmi" : "How much lighter (−) the ramp is vs the full ramp, after the VALD cap + minutes trim"}>{is ? "Lota vs fullur rampur" : "Block vs full ramp"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{is ? "VALD-þak" : "VALD cap"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{is ? "Mín./leik" : "Min/match"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">MAS</th>
                  <th className="py-1.5 pl-2 font-semibold">{is ? "Gögn" : "Data"}</th>
                </tr></thead>
                <tbody>
                  {plist.map((p) => {
                    const lp = squadLp(p); const cap = p.vald.capPct; const am = p.recentMinutesAvg;
                    const gk = /GK|MARK|KEEP/i.test(p.position ?? ""); const mu = p.matchUnit.load.typical; const bpl = p.recentBaseline?.playerLoad ?? null;
                    const pctM = bpl != null && mu != null && mu > 0 ? Math.round((bpl / mu) * 100) : null; const wk = mu != null ? Math.round(mu * bvWkMult) : null;
                    const pctColor = pctM == null ? "" : pctM >= 100 ? "text-[#15603a]" : pctM >= 60 ? "text-slate-600" : "text-[#7a5210]";
                    const gaps = p.gaps.filter((g) => g.severity !== "ok").length;
                    const on = p.playerId === selId;
                    return (
                      <tr key={p.playerId} onClick={() => setSelId(p.playerId)} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${on ? "bg-[#2740e6]/[0.06]" : ""}`}>
                        <td className="py-2 pr-2"><button type="button" onClick={(e) => { e.stopPropagation(); setSelId(p.playerId); }} aria-pressed={on} className="text-left font-semibold text-slate-900 hover:underline">{p.name}</button></td>
                        <td className="py-2 pr-2 text-slate-600">{p.position ?? "–"}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{bpl != null ? <>{fmtKv(bpl)} PL{pctM != null && <span className={`ml-1 font-semibold ${pctColor}`}>({pctM}%)</span>}</> : <span className="text-slate-500">{is ? "– engin GPS" : "– no GPS"}</span>}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-slate-600">{gk ? (is ? "sérlíkan" : "GK model") : mu != null ? <>{mu} PL{p.matchUnit.hsr.typical != null ? ` · ${Math.round(p.matchUnit.hsr.typical)}m` : ""}{p.matchUnit.distance.typical != null ? ` · ${(p.matchUnit.distance.typical / 1000).toFixed(1)}km` : ""} <span className="text-slate-500">n{p.matchUnit.nNearFull}{p.matchUnit.confidence !== "high" ? ` (${p.matchUnit.confidence})` : ""}</span></> : "–"}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-bold text-[#2740e6]">{gk ? "–" : wk != null ? fmtKv(wk) : "–"}</td>
                        <td className={`py-2 pr-2 text-right font-bold tabular-nums ${lp > 0 ? "text-emerald-700" : lp < 0 ? "text-[#8a3220]" : "text-slate-500"}`}>{lp > 0 ? `−${lp}%` : lp < 0 ? `+${-lp}%` : "—"}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{cap != null && cap < 100 ? <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${cap >= 85 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`}>{cap}%</span> : <span className="text-slate-500">–</span>}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-slate-600">{am == null ? "–" : `${am}′`}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-slate-600">{p.masKmh != null ? p.masKmh : "–"}</td>
                        <td className={`py-2 pl-2 ${gaps ? "text-amber-800" : "text-emerald-700"}`}>{gaps ? (is ? `${gaps} vantar` : `${gaps} missing`) : (is ? "Í lagi" : "OK")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-slate-500">{is ? "Grunnur = meðal-PL per þjálfunaræfingu síðustu 28 daga (grænt ≥100% af leik, gult <60%). Leik-mark = miðgildi næstum-heilla leikja. MAS = loftháða vélin. Lýsandi — aldrei readiness-liturinn." : "Baseline = mean PL per training session over the last 28 days (green ≥100% of a match, amber <60%). Match target = median of near-full matches. MAS = the aerobic engine. Descriptive — never the readiness colour."}</p>
            {/* PLANNED KPI VOLUME — in-season micro (week) + meso (block), anchored to match demand
                (Martín-García 2018: weekly load ≈ ×match per KPI; Buchheit 2024 MD-day shape; deload per block). */}
            {(() => {
              const matchKpis = blkScope === "player" && player ? kpiAvgFromUnit(player.matchUnit) : teamKpiAvg(plan.players);
              const days1 = standardTrainingDays(1);          // a standard 1-match week
              const wkMult = weeklyTrainingMultiple(days1);   // VOLUME multiple (e=1) — the headline ×match
              const vols = kpiVolumes(matchKpis, days1);      // per-KPI, each tapered by its own exponent
              const meso = mesoWeeklyMultiples({ numWeeks: blkWeeks, baseMultiple: wkMult, stepPct: blkStep, deloadWeek: cadence });
              const blockTotal = mesoTotalMultiple(meso);
              const headKeys = (Object.keys(matchKpis) as WeeklyLoadMetricKey[]).slice(0, 2); // 1-2 headline KPIs for the meso table
              const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
              // Per-KPI meso multiple: the KPI's OWN tapered weekly ×match, scaled by the week's ramp/deload
              // factor (w.multiple ÷ base). So HSR/sprint ramp from a lower base than distance across the block.
              const rampFactor = (w: { multiple: number }) => (wkMult > 0 ? w.multiple / wkMult : 0);
              const kpiWkMult = (k: WeeklyLoadMetricKey, w: { multiple: number }) => Math.round(weeklyKpiMultiple(days1, k) * rampFactor(w) * 100) / 100;
              const mesoKpi = (k: WeeklyLoadMetricKey, w: { multiple: number }) => { const mv = matchKpis[k]; return mv == null ? null : mv * weeklyKpiMultiple(days1, k) * rampFactor(w); };
              return (
                <details className="mt-4" open>
                  <summary className="cursor-pointer py-1 text-[13px] font-bold text-[#2740e6]">{is ? "Áætlað KPI-magn — vika + meso (keppnistímabil)" : "Planned KPI volume — week + meso (in-season)"}</summary>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-[15px] font-bold leading-snug text-slate-900">{is
                      ? `Vika ≈ ${wkMult}× leikur í æfingaálagi (+ 1× leikurinn = ${Math.round((wkMult + 1) * 10) / 10}× heildar).`
                      : `A week ≈ ${wkMult}× a match in training load (+ 1× the match = ${Math.round((wkMult + 1) * 10) / 10}× total).`}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">{is ? `${blkScope === "player" && player ? player.name : "Liðsmeðaltal"} · leik-miðað per KPI (Martín-García 2018; MD-dagar Buchheit 2024).` : `${blkScope === "player" && player ? player.name : "Team average"} · match-anchored per KPI (Martín-García 2018; MD-day shape Buchheit 2024).`}</p>

                    {vols.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Vikumark per KPI" : "Weekly target per KPI"}</div>
                        <div className="mt-1.5 overflow-x-auto">
                          <table className="w-full text-[12.5px]">
                            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                              <th className="py-1 pr-2 font-medium">KPI</th><th className="py-1 px-2 text-right font-medium">{is ? "Leikur" : "Match"}</th><th className="py-1 px-2 text-right font-medium">× {is ? "leik" : "match"}</th><th className="py-1 pl-2 text-right font-medium">{is ? "Vika" : "Week"}</th>
                            </tr></thead>
                            <tbody>
                              {vols.map((v) => (
                                <tr key={v.key} className="border-t border-slate-100">
                                  <td className="py-1.5 pr-2 text-slate-600">{is ? v.label.is : v.label.en}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">{fmtK(v.matchValue)}{v.unit}</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">{v.multiple}×</td>
                                  <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-slate-900">{fmtK(v.weeklyValue)}{v.unit}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : <p className="mt-2 text-[12px] text-amber-700">{is ? "Ekkert leikvið (GPS) enn — sýni sRPE-álag annars staðar." : "No GPS match unit yet — sRPE load is shown elsewhere."}</p>}

                    <div className="mt-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? `Meso — ${blkWeeks} vikur (× leikur per viku)` : `Meso — ${blkWeeks} weeks (×match per week)`}</div>
                      <div className="mt-1.5 overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                          <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                            <th className="py-1 pr-2 font-medium">{is ? "Vika" : "Week"}</th><th className="py-1 px-2 text-right font-medium" title={is ? "Rúmmál (vegalengd/PlayerLoad)" : "Volume (distance/PlayerLoad)"}>× {is ? "rúmmál" : "vol"}</th>
                            {headKeys.map((k) => <th key={k} className="py-1 px-2 text-right font-medium">{is ? WEEKLY_LOAD_LABELS[k].is : WEEKLY_LOAD_LABELS[k].en} <span className="normal-case text-slate-300">(× leik)</span></th>)}
                          </tr></thead>
                          <tbody>
                            {meso.map((w) => (
                              <tr key={w.weekIndex} className="border-t border-slate-100">
                                <td className="py-1.5 pr-2 text-slate-700">{is ? "Vika" : "Wk"} {w.weekIndex}{w.isDeload ? <span className="ml-1 rounded bg-[#de9328]/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-[#de9328]">{is ? "niður" : "deload"}</span> : null}</td>
                                <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-slate-900">{w.multiple}×</td>
                                {headKeys.map((k) => { const val = mesoKpi(k, w); return <td key={k} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{val == null ? "–" : <><span className="font-semibold text-slate-800">{kpiWkMult(k, w)}×</span> <span className="text-slate-400">{fmtK(val)}{WEEKLY_LOAD_LABELS[k].unit}</span></>}</td>; })}
                              </tr>
                            ))}
                            <tr className="border-t-2 border-slate-300 font-semibold">
                              <td className="py-1.5 pr-2">{is ? "Blokk alls" : "Block total"}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums text-slate-900">{blockTotal}×</td>
                              {headKeys.map((k) => { const mv = matchKpis[k]; const totMult = Math.round(meso.reduce((s, w) => s + kpiWkMult(k, w), 0) * 100) / 100; const tot = meso.reduce((s, w) => s + (mesoKpi(k, w) ?? 0), 0); return <td key={k} className="py-1.5 px-2 text-right tabular-nums text-slate-700">{mv == null ? "–" : <><span className="font-semibold text-slate-900">{totMult}×</span> <span className="text-slate-400">{fmtK(tot)}{WEEKLY_LOAD_LABELS[k].unit}</span></>}</td>; })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">{is ? "Leik-miðað: hver KPI = leikgildi × SITT vikumargfeldi — háhraði/sprettur safnast upp í lægra margfeldi en vegalengd (þeir trappast harðar fyrir leik; Martín-García 2018). Vikan bylgjast um MD (MD-3 þyngst), blokkin stigmagnast með niðurtröppun. Lýsandi áætlun — aldrei readiness-liturinn." : "Match-anchored: each KPI = match value × its OWN weekly multiple — HSR/sprint accumulate a lower multiple than distance (they taper harder before a match; Martín-García 2018). The week undulates around MD (MD-3 heaviest); the block ramps with a deload. Descriptive plan — never the readiness colour."}</p>
                  </div>
                </details>
              );
            })()}

            <details className="mt-4">
              <summary className="cursor-pointer py-1 text-[13px] font-bold text-[#2740e6]">{is ? "Undirbúningur — byrjunarálag viku 1 + stigmögnun (lið)" : "Pre-season — week-1 starting load + ramp (team)"}</summary>
            {/* PRE-SEASON WEEK-1 START — controlled re-entry + ramp to the pre-season build. Editable launch pad. */}
            {plan && (() => {
              const upPre = upcomingPreseason(plan.phases, new Date().toISOString().slice(0, 10), plan.nextFirstFixture);
              const preWeeks = upPre?.weeks ?? Math.max(1, plan.phases.find((p) => p.key === "preseason")?.weeks ?? 6);
              const wkSel = Math.min(preWeeks, Math.max(1, psWeekSel));
              const teamAnchor: LoadAnchor = plan.matchLoad != null ? "match_this_season" : plan.tier.loadSource === "srpe" ? "srpe_only" : "normative";
              const teamTka = teamKpiAvg(plan.players);
              const teamRamp = preseasonStartRamp({ matchTypicalLoad: teamTka.totalPlayerLoad ?? plan.matchLoad, matchKpiAvg: teamTka, matchSrpeAu: plan.matchSrpe, sessionsPerWeek: psSess, preseasonWeeks: preWeeks, week1MatchMultiple: psW1, anchor: teamAnchor });
              const playerAnchor: LoadAnchor | null = player ? (player.matchUnit.load.typical != null ? "match_this_season" : plan.tier.loadSource === "srpe" ? "srpe_only" : "normative") : null;
              const playerRamp = player && playerAnchor ? preseasonStartRamp({ matchTypicalLoad: player.matchUnit.load.typical, matchKpiAvg: kpiAvgFromUnit(player.matchUnit), matchSrpeAu: plan.matchSrpe, sessionsPerWeek: psSess, preseasonWeeks: preWeeks, week1MatchMultiple: psW1, anchor: playerAnchor }) : null;
              const teamRow = teamRamp[wkSel - 1];
              const playerRow = playerRamp?.[wkSel - 1] ?? null;
              const confChip = (c: "high" | "moderate" | "low") => c === "high" ? { c: "bg-emerald-100 text-emerald-700", t: is ? "há vissa" : "high confidence" } : c === "moderate" ? { c: "bg-amber-100 text-amber-700", t: is ? "miðlungs vissa" : "moderate confidence" } : { c: "bg-rose-100 text-rose-700", t: is ? "lítil vissa" : "low confidence" };
              const anchorLabel = (a: LoadAnchor) => a === "match_this_season" ? (is ? "leikir í ár" : "this season's matches") : a === "match_last_season" ? (is ? "leikir í fyrra" : "last season's matches") : a === "normative" ? (is ? "stöðu-viðmið" : "positional norm") : (is ? "sRPE eingöngu" : "sRPE only");
              const targetLine = (row: PreseasonWeekTarget) => (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[13px] font-bold text-slate-900">{row.multipleOfMatch}× {is ? "leik" : "match"}</span>
                  {row.weeklyLoadTarget != null ? <span className="text-[12px] text-slate-700">{is ? "vika" : "week"} ≈ {row.weeklyLoadTarget} PL</span> : <span className="text-[11px] text-slate-500">{is ? "ekkert GPS-leikvið" : "no GPS match unit"}</span>}
                  {row.perSessionLoad != null && <span className="text-[11px] text-slate-500">≈ {row.perSessionLoad}/{is ? "æf" : "sess"} × {row.sessionCount}</span>}
                  {row.sRpeAuTarget != null && <span className="rounded bg-[#7a5cc4]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#7a5cc4]">sRPE ≈ {row.sRpeAuTarget} AU</span>}
                </div>
              );
              const kpiChips = (row: PreseasonWeekTarget, matchAvg: Partial<Record<WeeklyLoadMetricKey, number>>) => {
                // PlayerLoad is the headline "week ≈ X PL" line — drop it from the chips so it isn't doubled.
                const keys = (Object.keys(row.byKpi) as WeeklyLoadMetricKey[]).filter((k) => k !== "totalPlayerLoad");
                if (keys.length === 0) return null;
                return (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {keys.map((k) => { const lbl = WEEKLY_LOAD_LABELS[k]; const val = row.byKpi[k]; if (val == null) return null;
                      // Impact-weighted ×match read (weekly ÷ one match of that KPI) + pathway dot + research range.
                      const pw = kpiPathway(k); const pwDot = pw === "biomechanical" ? "#a83e28" : pw === "physiological" ? "#2740e6" : "#94a3b8";
                      const mv = matchAvg[k]; const xm = mv != null && mv > 0 ? Math.round((val / mv) * 100) / 100 : null;
                      const ref = kpiTmRefRange(k); const over = xm != null && ref != null && xm > ref[1];
                      const title = `${is ? lbl.is : lbl.en} — ${xm != null ? `×${xm} leik` : "—"}${ref ? ` · ${is ? "viðmið" : "ref"} ${ref[0]}–${ref[1]}×${over ? (is ? " (yfir — undirbúnings-uppbygging)" : " (above — pre-season build)") : ""}` : ""}`;
                      return (
                      <span key={k} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600" title={title}><i className="h-1.5 w-1.5 rounded-full" style={{ background: pwDot }} />{xm != null && <span className={`font-semibold tabular-nums ${over ? "text-[#de9328]" : "text-slate-900"}`}>×{xm}</span>}<span className="text-slate-500">{is ? lbl.is : lbl.en}</span> <span className="tabular-nums text-slate-400">{val.toLocaleString("en-US")}{lbl.unit}</span></span>
                    ); })}
                  </div>
                );
              };
              return (
                <div className="mt-3 rounded-lg border-2 border-[#7a5cc4]/30 bg-[#7a5cc4]/5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#7a5cc4]">{is ? "Undirbúningur — byrjunar-álag viku 1 + stigmögnun" : "Pre-season — week-1 starting load + ramp"}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${confChip(teamRow.confidence).c}`}>{confChip(teamRow.confidence).t}</span>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{is ? "grunnur" : "anchor"}: {anchorLabel(teamRow.anchor)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{is ? "Vika 1 er stýrð endurkoma (brot úr leik) — ekki fullt leikálag. Byggðu upp héðan að undirbúnings-marki. Upphafspunktur; þú breytir." : "Week 1 is a controlled re-entry (a fraction of a match) — not full match load. Build from here to the pre-season target. A starting point; you edit it."}</p>

                  {/* Editable controls */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <label className="flex items-center gap-1 text-slate-600">{is ? "Vika 1 ×leik" : "Week 1 ×match"}
                      <input type="number" step={0.1} min={0.5} max={3} value={psW1} onChange={(e) => { const v = Math.max(0.5, Math.min(3, Number(e.target.value) || 1.3)); setPreW1(v); }} className="w-16 rounded border border-slate-300 px-1.5 py-0.5 tabular-nums" />
                    </label>
                    <label className="flex items-center gap-1 text-slate-600">{is ? "Æfingar/viku" : "Sessions/wk"}
                      <select value={psSess} onChange={(e) => { const v = Number(e.target.value); setPreSess(v); }} className="rounded border border-slate-300 px-1.5 py-0.5">{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                    </label>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-500">{is ? "Vika sýnd" : "Show week"}:</span>
                    <div className="inline-flex flex-wrap gap-1">
                      {teamRamp.map((r) => (
                        <button key={r.weekIndex} type="button" onClick={() => setPsWeekSel(r.weekIndex)}
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${r.weekIndex === wkSel ? "bg-[#7a5cc4] text-white" : "bg-white text-slate-600 border border-slate-200"}`}
                          title={`${r.multipleOfMatch}× ${is ? "leik" : "match"}`}>
                          {r.weekIndex}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Team card for the selected week */}
                  <div className="mt-2.5 rounded-lg bg-white p-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? `Lið — vika ${wkSel}` : `Team — week ${wkSel}`}</div>
                    <div className="mt-1">{targetLine(teamRow)}</div>
                    {kpiChips(teamRow, teamTka)}
                    <p className="mt-1.5 text-[11px] text-slate-500">{is ? teamRow.note.is : teamRow.note.en}</p>
                  </div>

                  {/* Selected player's own start for the week */}
                  {player && playerRow && (
                    <div className="mt-2 rounded-lg bg-white p-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{player.name} — {is ? `vika ${wkSel}` : `week ${wkSel}`}</div>
                      <div className="mt-1">{targetLine(playerRow)}</div>
                      {kpiChips(playerRow, kpiAvgFromUnit(player.matchUnit))}
                    </div>
                  )}

                  {/* Whole squad — the selected week's start per player (least-loaded units first) */}
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="py-0.5 pr-2 font-medium">{is ? "Leikmaður" : "Player"}</th><th className="py-0.5 pr-2 text-right font-medium">×{is ? "leik" : "match"}</th><th className="py-0.5 pr-2 text-right font-medium">{is ? "vika" : "week"} PL</th><th className="py-0.5 text-right font-medium">/{is ? "æf" : "sess"}</th></tr></thead>
                      <tbody>
                        {plan.players.map((pp) => {
                          const anc: LoadAnchor = pp.matchUnit.load.typical != null ? "match_this_season" : plan.tier.loadSource === "srpe" ? "srpe_only" : "normative";
                          const row = preseasonStartRamp({ matchTypicalLoad: pp.matchUnit.load.typical, sessionsPerWeek: psSess, preseasonWeeks: preWeeks, week1MatchMultiple: psW1, anchor: anc })[wkSel - 1];
                          return (
                            <tr key={pp.playerId} className={`border-t border-slate-100 ${pp.playerId === selId ? "bg-[#7a5cc4]/5" : ""}`}>
                              <td className="py-0.5 pr-2 text-slate-700">{pp.name}</td>
                              <td className="py-0.5 pr-2 text-right tabular-nums text-slate-600">{row.multipleOfMatch}×</td>
                              <td className="py-0.5 pr-2 text-right tabular-nums text-slate-800">{row.weeklyLoadTarget ?? "–"}</td>
                              <td className="py-0.5 text-right tabular-nums text-slate-500">{row.perSessionLoad ?? "–"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">{is ? "Grunnur: leikurinn = einingin. Ekkert GPS-leikvið → engin GPS-tala (aldrei skálduð); sRPE/AU er liðs-dæmigert leik-álag. Teixeira 2021 · Gabbett/Malone (ACWR, endurkoma) · Foster (sRPE). Lýsandi — breytir aldrei readiness-litnum." : "Anchor: the match = the unit. No GPS match unit → no GPS number (never fabricated); sRPE/AU is the team's typical match session. Teixeira 2021 · Gabbett/Malone (ACWR, re-entry) · Foster (sRPE). Descriptive — never changes the readiness colour."}</p>
                </div>
              );
            })()}
            </details>
          </section>

          {/* BRIDGE / OFF-WEEK maintenance plan — per-player running + strength from HIS own data, for a
              season-end / national-team window. Scoped to the selected player or the whole squad; sends to
              the players' app + squad PDF. Reuses the off-week engine (same as Week Setup OFF weeks). */}
          <section className={card}>
            <h2 className="text-[15px] font-bold text-slate-900">{is ? "Brú-plan (viðhald utan tímabils)" : "Bridge plan (off-season maintenance)"}</h2>
            <p className="mt-1 text-[12px] text-slate-500">{is ? "Hlaup + styrkur úr gögnum leikmannsins fram að verkefni (t.d. landsliðsgluggi). Veldu þennan leikmann eða allt liðið; sendu í appið eða prentaðu liðs-pakka." : "Running + strength from the player's own data up to an assignment (e.g. a national-team window). Scope to this player or the whole squad; send to the app or export the squad pack."}</p>
            <div className="mt-3">
              <OffWeekProgramButton focusPlayerId={selId} focusPlayerName={player?.name ?? null} players={plan.players.map((p) => ({ id: p.playerId, name: p.name }))} />
            </div>
          </section>

            </div>);
          })()}

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
        // No "Match" pick — matches belong to Fixtures (the source), never set from the meso.
        const picks: Array<{ k: CalType; label: Bi }> = [
          { k: "rest", label: { en: "Off", is: "Frí" } },
          { k: "mechanical", label: { en: "Mechanical", is: "Mechanical" } },
          { k: "locomotive", label: { en: "Locomotive", is: "Locomotive" } },
          { k: "mixed", label: { en: "Mixed", is: "Mixed" } },
          { k: "activation", label: { en: "Activation", is: "Virkjun" } },
          { k: "topup", label: { en: "Top-up", is: "Áfylling" } },
        ];
        const fixtureDay = isFixtureDay(dayModal);
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

              {/* Day-type picker — a fixture day is a MATCH owned by Fixtures; read-only here. */}
              <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Dagsgerð" : "Day-type"}</div>
              {fixtureDay ? (
                <div className="mt-1 rounded-lg border border-[#1c7a4a]/30 bg-[#1c7a4a]/5 px-2.5 py-2 text-[11px] text-slate-600">
                  <span className="font-semibold text-[#1c7a4a]">{is ? "Leikdagur" : "Match day"}</span> — {is ? "leikir eru skráðir í Leikjaskrá (Fixtures). Færðu eða eyddu leiknum þar; meso les hann þaðan." : "matches live in Fixtures. Move or delete the game there; the meso reads it from there."}
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {picks.map((p) => { const active = day.type === p.k; return (
                    <button key={p.k} onClick={() => setDayType(dayModal, p.k)} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${active ? "border-transparent text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`} style={active ? { background: typeColor[p.k as string] } : undefined}>{is ? p.label.is : p.label.en}</button>
                  ); })}
                </div>
              )}

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
