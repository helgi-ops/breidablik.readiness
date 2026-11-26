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
import PeriodizationModelPicker from "@/components/coach/PeriodizationModelPicker";
import { VALD_TRIM_CITE, mondayOfIso, buildMesoPlan, buildCalendarBlock, inSeasonRange, teamMatchUnitNote, blockDeloadOf, deloadWeekIndex, holdsStandardWeek, recommendBlockGoal, positionGroup, BLOCK_GOAL_LABEL, CAL_SHARE, CAL_SHARE_IMA, CAL_SHARE_IMA_REF, compareImaNormToReference, type ValdTrimLift, type ImaNormStatus, type ImaShareCalibration, type ImaVar, type TeamAverages, type MesoPlan, type MesoBlock, type BlockGoalKey, type CalType, type CalDay, type CalendarBlock } from "@/lib/micropulse/periodization";
import { useMatchScheduleRealtime } from "@/lib/useMatchScheduleRealtime";
import { computeBuildUpSteer, type BuildUpSteer, type WeaknessInput, type ExposureInput, type ShapeDirInput } from "@/lib/micropulse/periodization/buildUpSteer";
import { exposuresFromTlyp, shapeDirsFromShape } from "@/lib/micropulse/trainingNeeds";
import { buildPlayerBlock, pickActiveBlock } from "@/lib/micropulse/periodization/playerBlock";
import KkiFixturesImport from "@/components/coach/KkiFixturesImport";
import { classifyInSeasonSubPhase, subPhaseInfo, SUBPHASE_KEYS, type InSeasonSubPhaseKey } from "@/lib/micropulse/periodization/inSeasonSubPhase";
import { strengthForBlockGoal, STRENGTH_METHODS } from "@/lib/micropulse/strengthProgramming/seasonPhaseStrength";
import { QUALITY_BY_ID, type QualityRead } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { buildValdTrainingPlan, valdHasData, type ValdTrainingPlan } from "@/lib/micropulse/vald/valdSummary";
import type { ValdSlice } from "@/components/coach/ValdAssessmentBlock";
import BuildUpTrackingCard from "@/components/coach/BuildUpTrackingCard";
import { downloadPeriodizationBlockPdf } from "@/components/coach/PeriodizationBlockPdf";
import OffWeekProgramButton from "@/components/coach/OffWeekProgramButton";
import { downloadPeriodizationHubPdf } from "@/components/coach/PeriodizationHubPdf";
import { strengthConfigForPhase, type SeasonPhaseKey, type CoachStrengthRules } from "@/lib/micropulse/strengthProgramming/seasonPhaseStrength";
import { preseasonStrengthWeeks, schemeHead } from "@/lib/micropulse/strengthProgramming/preseasonStrength";
import { STRUCTURE_LABEL, sanitizeMdStructures, type MdStructures, type NoMatchWeek } from "@/lib/micropulse/strengthProgramming/structures";
import { preseasonMatchExposure, NORMATIVE_MATCH_KPI, type LoadAnchor, type PreseasonWeekTarget } from "@/lib/micropulse/periodization/preseasonStart";
import { weeklyTargetFromMatch } from "@/lib/micropulse/periodization";
import { upcomingInternationalBreaks, intlBreakKey, type IntlBreak } from "@/lib/micropulse/internationalBreaks";
import { standardTrainingDays, weeklyTrainingMultiple, weeklyKpiMultiple, buildPlannedVolume, kpiPathway, matchesPerWeek, kpiTmRefRange } from "@/lib/micropulse/periodization/plannedVolume";
import { mdOffset } from "@/lib/micropulse/periodization/periodizationModel";
import { buildDayDrillSheet } from "@/lib/micropulse/dayDrillSheet";
import { fetchResearchDrills } from "@/lib/micropulse/dayDrillLibraryFetch";
import { recommendTestingSchedule, testsForBlock, TEST_SHORT, testShortName, AEROBIC_TESTS, DEFAULT_AEROBIC_TEST, isAerobicMode, type TestKey, type AerobicMode } from "@/lib/micropulse/periodization/testingSchedule";
import FitnessTestCard from "@/components/coach/FitnessTestCard";
import PlanIntentCard from "@/components/coach/PlanIntentCard";
import { CiteRefs } from "@/components/coach/CiteRefs";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";
import { kpiAvgFromUnit as kpiAvgFromUnitLib, teamKpiAvg as teamKpiAvgLib } from "@/lib/micropulse/periodization/preseasonKpiMap";
import { cleanAssumedGames, GAMES_FROM_NONE, upcomingPreseason, preseasonMeso, preseasonAnchor, preseasonRamp, PRE_MIN_BLOCK, PRESEASON_DEFAULT_WEEK1, PRESEASON_DEFAULT_TAPER_PCT, PRESEASON_TAPER_RESEARCH, clampTaperPct } from "@/lib/micropulse/periodization/preseasonWindow";
import { buildPreseasonProposal } from "@/lib/micropulse/periodization/preseasonProposal";
import { weekConfirmLabel, type WeekConfirmStatus } from "@/lib/micropulse/weekSetup/confirmation";
import { NO_PROGRAMME, programmeCovers, programmeTitle } from "@/lib/micropulse/strengthProgramming/deliveryView";
import { useStrengthDelivery } from "@/components/coach/useStrengthDelivery";
import StrengthDeliveryNote from "@/components/coach/StrengthDeliveryNote";
import { MESO_HORIZON, mesoSkeleton, planDayFromCal, planDaysFromCalWeek, CALTYPE_FOCUS_LABEL } from "@/lib/micropulse/periodization/mesoWeek";
import { mesoWeekFor as mesoWeekOf, preseasonInputFor, seasonMesoBlocks, teamCalendarUnit, assumedWeekMove } from "@/lib/micropulse/periodization/mesoSeed";
import PreseasonReadsFrom, { AddGame } from "@/components/coach/PreseasonReadsFrom";
import { THREE_IN_A_ROW_RULE } from "@/lib/micropulse/weekSetup/weekRules";
import { MacroSetupChecklist, MacroFixturesCard, MacroBreaksCard, MacroSetupGate, firstLeagueGame, type MacroFixture } from "@/components/coach/MacroSetupCards";
import PreseasonWeek1Table from "@/components/coach/PreseasonWeek1Table";
import InSeasonBlockSummary from "@/components/coach/meso/InSeasonBlockSummary";
import InSeasonVariableTable from "@/components/coach/meso/InSeasonVariableTable";
import { GOAL_BAR, BarSwatch, GameDotLegend, type MesoBar } from "@/components/coach/meso/MesoPrimitives";
import { blockVolumeView, inSeasonRuleBreaks, calWeekMultiple, sessionsInWeek, minMax, gamesInRange, gamesInWeek } from "@/lib/micropulse/periodization/inSeasonMesoView";
import { teamMatchReference } from "@/lib/micropulse/periodization/matchReference";
import type { MatchUnit as LibMatchUnit } from "@/lib/micropulse/periodization";

type Bi = { en: string; is: string };
const IN_SEASON_DELOAD_NOTE: Bi = {
  en: "In-season there's no automatic deload: the taper before each match already varies the load. A light week cuts volume about 20% and holds intensity (Fessi 2016, Moalla 2021; observational).",
  is: "Á keppnistímabili er engin sjálfvirk niðurtröppun: minnkunin fyrir hvern leik sveiflar álaginu nú þegar. Létt vika minnkar magn um 20% en heldur ákefð (Fessi 2016, Moalla 2021; athugunarrannsóknir).",
};
type Phase = { key: string; label: Bi; start: string; end: string; weeks: number; matches: number; rationale: Bi };
type Block = { index: number; phase: Bi; goal: Bi; start: string; end: string; weeks: number; isDeload: boolean; volumeTargetPct: number | null; flag: Bi | null; tmr: number | null; loadTrend: "rising" | "steady" | "falling" | null; acwr: number | null; acwrNote: Bi };
type WeekLoad = { weekStart: string; load: number | null };
type Interval = { type: number; label: Bi; pctMas: number; kmh: number | null };
type Vbt = { exercise: string; latestLoadKg: number | null; latestMeanV: number | null; zone: Bi; note: Bi } | null;
type Gap = { key: string; severity: "missing" | "stale" | "ok"; message: Bi };
type StrengthDefault = { quality: Bi; pct1rm: Bi; velocity: Bi | null; intent: Bi; cite: string };
type Vald = { status: "green" | "yellow" | "red" | null; capPct: number | null; note: Bi; lift?: ValdTrimLift | null };
type MatchUnitMetric = { typical: number | null; peak: number | null };
type MatchUnit = { nNearFull: number; nInWindow: number; fellBack: boolean; confidence: "high" | "medium" | "low"; windowNote: Bi; minutesTypical: number | null; load: MatchUnitMetric; hsr: MatchUnitMetric; sprint: MatchUnitMetric; distance: MatchUnitMetric; accel: MatchUnitMetric; decel: MatchUnitMetric; accHiEff: MatchUnitMetric; decHiEff: MatchUnitMetric; stride: MatchUnitMetric; rhie: MatchUnitMetric; symmetry: MatchUnitMetric; metPower: MatchUnitMetric; imaCod: MatchUnitMetric; imaFr: MatchUnitMetric };
type WeekTargetPlan = { phase: "preseason" | "inseason"; sessionCount: number; weeklyLoadTarget: number | null; perSessionLoad: number | null; matchMultiple: number | null; topUp: number | null; note: Bi; cite: string };
type RecentBaseline = { sessions: number; playerLoad: number | null; hsrM: number | null; distanceM: number | null; sprintM: number | null };
type LatestTest = { type: string; label: Bi; value: number; unit: string; date: string };
type Player = { playerId: string; name: string; position: string | null; masKmh: number | null; masSource: string | null; masSourceIs?: string | null; masEstimated?: boolean; masAgeDays: number | null; aerobicTestAgeDays?: number | null; latestTests?: LatestTest[]; intervals: Interval[]; vbt: Vbt; strengthFallback: StrengthDefault | null; vald: Vald; gaps: Gap[]; matchUnit: MatchUnit; weekTargets: { preseason: WeekTargetPlan; inseason: WeekTargetPlan; current: "preseason" | "inseason" }; recentMinutesAvg: number | null; recentBaseline: RecentBaseline | null };
type TeamAvg = { sessions: number; players: number; distanceM: number | null; hsrM: number | null; sprintM: number | null; maxKmh: number | null; playerLoad: number | null; plPerMin: number | null; accel: number | null; decel: number | null; direction: { forward: number; backward: number; lateral: number } | null; matchSessions: number; matchDistanceM: number | null; matchHsrM: number | null; matchPlayerLoad: number | null; matchSprintM: number | null; matchAccel: number | null; matchDecel: number | null; imaCod: number | null; matchImaCod: number | null; imaFrDist: number | null; matchImaFrDist: number | null; accelHiEff: number | null; decelHiEff: number | null; strideHi: number | null; matchAccelHiEff: number | null; matchDecelHiEff: number | null; matchStrideHi: number | null; rhieBouts: number | null; runSymmetry: number | null; metabolicPower: number | null };
type AxisMetric = { metric: Bi; matchValue: string; trainingCeiling: string; band: string };
type Axis = { axis: "running" | "mechanical" | "internal"; label: Bi; matchNote: Bi; metrics: AxisMetric[]; flag: Bi | null };
type MatchAxes = { running: Axis; mechanical: Axis; internal: Axis; hsrDeficit: Bi | null; mechNeglect: Bi | null; capabilities: Bi[] };
type MdDemandBucket = { key: string; label: Bi; offsets: number[]; avg: TeamAvg };
type MdDemandProfile = { phases: MdDemandBucket[]; days: MdDemandBucket[] };
type PositionBaseline = { key: number; label: Bi; avg: TeamAvg; axes: MatchAxes; md: MdDemandProfile };
type Tier = { tier: "pro" | "core" | "rpe" | "none"; loadSource: "gps" | "srpe" | "none"; label: Bi; confidence: "high" | "medium" | "low"; unlock: Bi | null };
type WeekType = "normal" | "two_game" | "three_game";
type Plan = { seasonYear: number; teamName: string; phases: Phase[]; blocks: Block[]; loadCurve: WeekLoad[]; loadCurveByPos: Array<{ key: number; label: Bi; curve: WeekLoad[] }>; positionBaselines: PositionBaseline[]; teamBaseline: PositionBaseline; tier: Tier; mdShape: Record<string, number>; nextWeekType: WeekType; matchLoad: number | null; matchLoadTeam: number | null; matchSrpe: number | null; congested: Array<{ weekStart: string; matches: number }>; players: Player[]; fixtures: string[]; upcomingFixtures?: string[]; fixtureList?: MacroFixture[]; upcomingFixtureList?: MacroFixture[]; nextFirstFixture?: string | null; nextSeasonYear?: number | null; fixturesEstimated?: boolean; estimatedOpener?: string | null; nextFirstFixtureEstimated?: boolean; imaCalibration?: ImaShareCalibration };

const shortDate = (iso: string, is: boolean) => { try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };
const isoAdd = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (iso: string) => { const dt = new Date(`${iso}T00:00:00Z`); const dow = (dt.getUTCDay() + 6) % 7; return new Date(dt.getTime() - dow * 86_400_000).toISOString().slice(0, 10); };

// Match unit → weekly-load KPI vocabulary (with the IMA KPIs). One definition, shared with Week Setup and
// Weekly Load (periodization/preseasonKpiMap), so the pre-season ramp reads the same numbers everywhere.
const kpiAvgFromUnit = (mu: MatchUnit): Partial<Record<WeeklyLoadMetricKey, number>> => kpiAvgFromUnitLib(mu as unknown as LibMatchUnit, { ima: true });
// Team KPI average across players who have a match unit (mean per KPI).
const teamKpiAvg = (players: Player[]): Partial<Record<WeeklyLoadMetricKey, number>> => teamKpiAvgLib(players.map((p) => p.matchUnit as unknown as LibMatchUnit), { ima: true });
// The pre-season load anchor (own match unit, else the normative reference) — the same call Week Setup makes.
const preAnchorOf = (plan: Plan) => preseasonAnchor({ matchUnits: plan.players.map((p) => p.matchUnit as unknown as LibMatchUnit), matchLoad: plan.matchLoad, matchSrpe: plan.matchSrpe, loadSource: plan.tier.loadSource });
type DayState = "match" | "session" | "off";

// The meso always seeds a full 6-week skeleton (MESO_HORIZON, periodization/mesoWeek); a smaller cadence (4/5) just
// RENDERS fewer weeks (the tail is trimmed, not reshuffled), so switching 6→4→5 shows the same block minus the last
// 1–2 weeks and keeps the coach's day edits.
// caltypeFromFocus / CALTYPE_FOCUS_LABEL (focus words ↔ CalType) live in periodization/mesoWeek with the skeleton.
// Backwards pre-season meso layout (preseasonMeso) + the window (upcomingPreseason) live in
// periodization/preseasonWindow so the proposal builder and Week Setup use the same split.
const lensToBlockWeeks = (lens: number[]): Record<string, number> => { const m: Record<string, number> = {}; lens.forEach((n, i) => { m[String(i)] = n; }); return m; };
// Migrate legacy INDEX-keyed length overrides ("0","1",…) to stable block-START (ISO) keys, using the
// current derived block list. Block-start is a stable identity the engine resolves positionally
// (blockWeeks[mon] fallback), so after a resize/split/merge an override never mis-applies to the WRONG
// block: a block that keeps its start keeps its length; one whose start moved simply reverts to auto (safe),
// never a silent wrong length. Index keys that no longer match a block are dropped (orphan cleanup).
function migrateLenToIso(map: Record<string, number>, blocks: Array<{ index: number; start: string }>): Record<string, number> {
  const byIndex = new Map(blocks.map((b) => [b.index, b.start]));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    if (/^\d+$/.test(k)) { const s = byIndex.get(Number(k)); if (s) out[s] = v; }
    else out[k] = v;
  }
  return out;
}

// The dominant IMA direction of a day's split, as a short localized label.
const domDir = (dir: { fwd: number; back: number; lat: number } | null, is: boolean): string | null => {
  if (!dir) return null;
  const m = Math.max(dir.fwd, dir.back, dir.lat);
  const key = m === dir.fwd ? (is ? "fram" : "fwd") : m === dir.lat ? (is ? "hlið" : "lat") : (is ? "aftur" : "back");
  return `${key} ${Math.round(m * 100)}%`;
};
// Compact "IMA Acc/Dec · Acc B2–3 · Dec B2–3 · Long-run strides · Long runs · CoD · dir" line for a day — only the
// metrics the feed carries. (IMA Free Running bands = bout-DURATION bands: "long runs" = continuous runs
// ≥18 s, NOT sprinting.) `imaPro`: accel/decel are IMA events on a Pro feed, plain GPS counts otherwise.
const imaLine = (d: CalDay, is: boolean, imaPro = false): string => {
  const p: string[] = [];
  if (d.accel != null || d.decel != null) p.push(`${imaPro ? "IMA " : ""}Acc/Dec ${d.accel ?? "–"}/${d.decel ?? "–"}`);
  if (d.accHiEff != null) p.push(`Acc B2–3 ${d.accHiEff}`);
  if (d.decHiEff != null) p.push(`Dec B2–3 ${d.decHiEff}`);
  if (d.stride != null) p.push(`${is ? "Langhl.-skref á leikhraða" : "Long-run strides at match pace"} ${d.stride}`);
  if (d.fr != null) p.push(`${is ? "Löng hlaup á leikhraða" : "Long runs at match pace"} ${d.fr} m`);
  if (d.cod != null) p.push(`${is ? "Stefnubr." : "CoD"} ${d.cod}`);
  const dd = domDir(d.dir, is); if (dd) p.push(`${is ? "stefna" : "dir"} → ${dd}`);
  return p.join(" · ");
};

/** The coach's say over this week's VALD trim: lifting it asks for a reason, which is logged. */
function ValdTrimControl({ is, lift, onLift, onUndo }: { is: boolean; lift: ValdTrimLift | null; onLift: (reason: string) => Promise<boolean>; onUndo: () => Promise<boolean> }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true); setFailed(false);
    const ok = await fn();
    setBusy(false); setFailed(!ok);
    if (ok) { setOpen(false); setReason(""); }
  };
  const btn = "mt-1.5 text-[12px] font-semibold text-[#2740e6] hover:underline disabled:opacity-50";
  const failedMsg = failed && <div className="mt-1 text-[12px] text-[#a83e28]">{is ? "Tókst ekki að vista." : "Couldn't save."}</div>;
  if (lift) return (
    <div className="mt-1.5 text-[12px] text-slate-600">
      {is ? "Ástæða þjálfara" : "Coach's reason"}: {lift.reason}
      <div><button type="button" disabled={busy} onClick={() => void run(onUndo)} className={btn}>{is ? "Setja lækkun aftur á" : "Restore the trim"}</button></div>
      {failedMsg}
    </div>
  );
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn}>{is ? "Hnekkja þessa viku" : "Lift for this week"}</button>;
  return (
    <div className="mt-1.5">
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} aria-label={is ? "Ástæða" : "Reason"} placeholder={is ? "Ástæða (skráð)" : "Reason (logged)"} className="h-9 w-full rounded-lg border border-slate-300 px-2 text-[13px]" />
      <div className="flex gap-3">
        <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void run(() => onLift(reason.trim()))} className={btn}>{is ? "Hnekkja" : "Lift"}</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="mt-1.5 text-[12px] font-semibold text-slate-500 hover:underline">{is ? "Hætta við" : "Cancel"}</button>
      </div>
      {failedMsg}
    </div>
  );
}

export default function PeriodizationHubPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [mapWide, setMapWide] = React.useState(false); // season map: break out to full viewport width
  const [err, setErr] = React.useState<string | null>(null);
  const [selId, setSelId] = React.useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("player") ?? ""; // deep-link from Train like you Play
  });
  const [preStart, setPreStart] = React.useState("");   // coach-set pre-season start (e.g. December)
  const [seasonEnd, setSeasonEnd] = React.useState("");  // coach-set season end (e.g. late October)
  const [nextPreStart, setNextPreStart] = React.useState(""); // coach-set NEXT pre-season start — bounds the off-season by date
  const [offStart, setOffStart] = React.useState("");         // coach-set off-season (reconditioning) START — the days between season end and this are a holiday (Frí)
  const [saved, setSaved] = React.useState(false);
  const [frameSaving, setFrameSaving] = React.useState(false);
  // The frame as last saved on the season row — the "unsaved changes" mark compares the inputs to it.
  const [savedFrame, setSavedFrame] = React.useState<{ preStart: string; seasonEnd: string; offStart: string; nextPreStart: string }>({ preStart: "", seasonEnd: "", offStart: "", nextPreStart: "" });
  // The "First league game" input; null = untouched (shows the entered first league game).
  const [leagueDraft, setLeagueDraft] = React.useState<string | null>(null);
  // Refs so `load` can read the latest off-season window without changing its identity (deps).
  const nextPreStartRef = React.useRef(nextPreStart); nextPreStartRef.current = nextPreStart;
  const didPopulateWindow = React.useRef(false);
  const didPopulateNext = React.useRef(false); // guard for the upcoming-pre-season (next-year) overrides restore
  // Which SEASON YEAR the hub is viewing/planning. null until the first load resolves it to the current year;
  // the coach can step to the next year (plan it — it begins where the off-season ends) or back to a past one.
  const [viewYear, setViewYear] = React.useState<number | null>(null);
  const viewYearRef = React.useRef<number | null>(null);
  const carrySeedRef = React.useRef<string>(""); // off-season end carried into a NEW next-season's pre-season start
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
  // UPCOMING pre-season (next season) overrides — a SEPARATE store persisted to `plan.nextSeasonYear`'s
  // season_plans row, so next year's planning survives the calendar rollover and never shares block indices
  // with the current season (the ártal-skörðun fix). Only used when `upcomingYear` (see below); in-season the
  // Pre-season tab falls back to the current-year store unchanged.
  // The upcoming pre-season's block lengths, goals and cadence (next season's row) — the strength delivery slices
  // that pre-season with them, so the Pre-season page shows the same blocks.
  const [preBlockLenOv, setPreBlockLenOv] = React.useState<Record<string, number>>({});
  const [preBlockGoals, setPreBlockGoals] = React.useState<Record<string, "accum" | "transmute" | "realize">>({});
  const [preCadence, setPreCadence] = React.useState<number | null>(null);
  const [prePsWeek1Mult, setPrePsWeek1Mult] = React.useState(1.3);
  const [prePsSessions, setPrePsSessions] = React.useState(4);
  // % cut of the light week before the opener (0 = none) — current / upcoming season rows, like week 1 above.
  const [psTaperPct, setPsTaperPct] = React.useState(PRESEASON_DEFAULT_TAPER_PCT);
  const [prePsTaperPct, setPrePsTaperPct] = React.useState(PRESEASON_DEFAULT_TAPER_PCT);
  // "Weekend games from": assumed weekend games only from this day (null = entered games only).
  const [psGamesFrom, setPsGamesFrom] = React.useState<string | null>(null);
  const [prePsGamesFrom, setPrePsGamesFrom] = React.useState<string | null>(null);
  // Per-week assumed game (week Monday → day 0–6, or null = no game that week); this season's + the upcoming one's.
  const [psAssumed, setPsAssumed] = React.useState<Record<string, number | null>>({});
  const [prePsAssumed, setPrePsAssumed] = React.useState<Record<string, number | null>>({});
  // Game-anchored pre-season meso-cycle tail (lengths of the blocks NEAREST the opener; the base block
  // absorbs the remainder — backwards periodization). null = not set → derive from the auto layout. Used
  // only when `upcomingYear`; the next-year row holds pre-season blocks only, so add/remove never shifts a
  // competitive-block index. Current-year pre-season keeps the per-block length dropdowns.
  const [nextMesoTail, setNextMesoTail] = React.useState<number[] | null>(null);
  // Same game-anchored tail but for the VIEWED season's OWN pre-season (not the upcoming/next-year one), so
  // the coach can add/remove meso cycles on any season, not only next year.
  const [curMesoTail, setCurMesoTail] = React.useState<number[] | null>(null);
  // Coach's WEEK-1 value per KPI (total distance, HSR, PlayerLoad, accel/decel…) — the ramp computes the rest
  // from week 1. Kept per the viewed year vs the upcoming (next-year) pre-season row. {} = all auto/seeded.
  const [curWeek1Kpi, setCurWeek1Kpi] = React.useState<Record<string, number>>({});
  const [nextWeek1Kpi, setNextWeek1Kpi] = React.useState<Record<string, number>>({});
  const [tab, setTab] = React.useState<"season" | "preseason" | "plan" | "micro" | "testing" | "demands" | "players">(() => {
    if (typeof window === "undefined") return "season";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "preseason" || t === "plan" || t === "micro" || t === "testing" || t === "demands" || t === "players" ? t : "season";
  });
  const [preseasonJumpWeek, setPreseasonJumpWeek] = React.useState<string | undefined>(undefined); // deep-link Pre-season week → Week Setup
  const [preDaySave, setPreDaySave] = React.useState<null | "saving" | "saved" | "err">(null); // pre-season draft day-toggle save status
  const [preDayPick, setPreDayPick] = React.useState<{ weekStart: string; di: number } | null>(null); // pre-season day open in the stimulus picker
  const [preOpenWeeks, setPreOpenWeeks] = React.useState<Record<string, boolean>>({}); // pre-season week cards open/closed (week Monday → open)
  const [blkSkeleton, setBlkSkeleton] = React.useState<Record<string, DayState>>({}); // coach's 6-week day grid
  const [typeOverrides, setTypeOverrides] = React.useState<Record<string, CalType>>({}); // per-day day-type picks
  const [savedPlans, setSavedPlans] = React.useState<Record<string, { dayType: string; focus: string | null }>>({}); // saved week_plans (read-back)
  const [dayModal, setDayModal] = React.useState<string | null>(null); // ISO of the day open in the editor popup
  // Scheduled performance tests (dates pinned to test types) — shared with Week Setup via the API.
  const [scheduledTests, setScheduledTests] = React.useState<{ id: string; test_key: TestKey; test_date: string; note: string | null }[]>([]);
  const [testAddKey, setTestAddKey] = React.useState<TestKey>("aerobic");
  // The team's aerobic test (one of the six Conditioning tests) — names every "Aerobic" chip + protocol.
  const [aerobicTest, setAerobicTest] = React.useState<AerobicMode>(DEFAULT_AEROBIC_TEST);
  const [showTestEntry, setShowTestEntry] = React.useState(false); // Players tab: record-a-test form open
  const [testAddDate, setTestAddDate] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [testShowAll, setTestShowAll] = React.useState(false); // Testing tab: show every block, not just the next three
  const [testFocus, setTestFocus] = React.useState<string | null>(null); // Testing tab: block (start ISO) clicked on the strip
  const [plSub, setPlSub] = React.useState(1); // Players tab: which player section is open (build-up / values / data). "His block" (0) removed — the player calendar lives on the Meso tab (player scope).
  // Players tab phase view: pre-season = the Build-up ramp, in-season = the typical-week Player Demands.
  // null = follow the player's own current phase; the toggle sets an explicit override.
  const [phaseOverride, setPhaseOverride] = React.useState<"preseason" | "inseason" | null>(null);

  const authHeader = React.useCallback(async () => `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`, [supabase]);

  // Sport — the athlete-axis "Build Target" card (StatsBomb/GPS/VALD) is hidden for basketball.
  const [isBasketball, setIsBasketball] = React.useState(false);
  const [teamSport, setTeamSport] = React.useState<string | null>(null);
  const [teamGender, setTeamGender] = React.useState<string | null>(null);
  // Kinexon = indoor LPS (not Catapult IMA): hide the directional-IMA / stride /
  // RHIE / symmetry reads (null there) and relabel "GPS + IMA" wording.
  const [isKinexon, setIsKinexon] = React.useState(false);
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/coach/player-stats/config", { headers: { Authorization: await authHeader() } });
        if (res.ok) { const j = await res.json(); setIsBasketball(String(j.sport ?? "").toLowerCase() === "basketball"); setTeamSport(j.sport ?? null); setTeamGender(j.gender ?? null); setIsKinexon(String(j.gpsProvider ?? "").toLowerCase() === "kinexon"); }
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
  // The team's method per MD day + weekday plan for weeks without a game (team_strength_palette) — what the strength
  // delivery builds the heavy days from; the Pre-season page shows them per week. null → the engine defaults.
  const [teamPalette, setTeamPalette] = React.useState<{ mdStructures: MdStructures; noMatchWeek: NoMatchWeek | null } | null>(null);
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/coach/team/strength-palette", { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => null);
        if (alive && res.ok && j?.ok) setTeamPalette({ mdStructures: sanitizeMdStructures(j.mdStructures), noMatchWeek: (j.noMatchWeek ?? null) as NoMatchWeek | null });
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

  const load = React.useCallback(async (preS: string, endS: string, opts?: { repopulate?: boolean }) => {
    setLoading(true); setErr(null);
    try {
      const qs = new URLSearchParams();
      if (viewYearRef.current) qs.set("year", String(viewYearRef.current));
      if (preS) qs.set("preStart", preS);
      if (endS) qs.set("seasonEnd", endS);
      if (nextPreStartRef.current) qs.set("nextPreStart", nextPreStartRef.current);
      const res = await fetch(`/api/coach/periodization?${qs}`, { headers: { Authorization: await authHeader() } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error ?? "Failed"); return; }
      setPlan(j.plan as Plan);
      if (isAerobicMode((j as { aerobicTest?: unknown }).aerobicTest)) setAerobicTest((j as { aerobicTest: AerobicMode }).aerobicTest);
      // Track the loaded season year (first load resolves `viewYear` to the current season).
      viewYearRef.current = (j.plan as Plan).seasonYear;
      setViewYear((j.plan as Plan).seasonYear);
      // Populate the season-window inputs from the saved overrides, once, so they reflect what's stored.
      const sw = (j as { savedWindow?: { preseasonStart?: string | null; seasonEnd?: string | null; nextPreseasonStart?: string | null; offseasonWeeks?: number | null; offseasonStart?: string | null; preseasonWeek1Mult?: number | null; preseasonSessions?: number | null; stepPct?: number | null; blockGoals?: Record<string, "accum" | "transmute" | "realize">; blockWeeks?: Record<string, number>; blockDeload?: Record<string, string>; preMesoTail?: number[] | null; preWeek1Kpi?: Record<string, number> | null; preTaperPct?: number | null; preGamesFrom?: string | null } }).savedWindow;
      if (sw && (!didPopulateWindow.current || opts?.repopulate)) {
        didPopulateWindow.current = true;
        setSavedFrame({ preStart: sw.preseasonStart ?? "", seasonEnd: sw.seasonEnd ?? "", offStart: sw.offseasonStart ?? "", nextPreStart: sw.nextPreseasonStart ?? "" });
        if (sw.preseasonStart) setPreStart(sw.preseasonStart);
        if (sw.seasonEnd) setSeasonEnd(sw.seasonEnd);
        if (sw.nextPreseasonStart) setNextPreStart(sw.nextPreseasonStart);
        if (sw.offseasonStart) setOffStart(sw.offseasonStart);
        if (sw.preseasonWeek1Mult != null && Number.isFinite(sw.preseasonWeek1Mult)) setPsWeek1Mult(Math.max(0.5, Math.min(3, sw.preseasonWeek1Mult)));
        if (sw.preseasonSessions === 3 || sw.preseasonSessions === 4 || sw.preseasonSessions === 5 || sw.preseasonSessions === 6) setPsSessions(sw.preseasonSessions);
        if (sw.preTaperPct != null && Number.isFinite(sw.preTaperPct)) setPsTaperPct(clampTaperPct(sw.preTaperPct));
        setPsGamesFrom(typeof sw.preGamesFrom === "string" ? sw.preGamesFrom : null);
        setPsAssumed(cleanAssumedGames((sw as { preAssumedGames?: unknown }).preAssumedGames));
        if (sw.stepPct != null && Number.isFinite(sw.stepPct)) setBlkStep(Math.max(0, Math.min(15, sw.stepPct)));
        if (sw.blockGoals && Object.keys(sw.blockGoals).length) setBlockGoals(sw.blockGoals);
        if (sw.blockWeeks && Object.keys(sw.blockWeeks).length) setBlockLenOv(sw.blockWeeks);
        if (sw.blockDeload && Object.keys(sw.blockDeload).length) setBlockDeloadOv(sw.blockDeload);
        if (Array.isArray(sw.preMesoTail) && sw.preMesoTail.length) setCurMesoTail(sw.preMesoTail.filter((n) => Number.isFinite(n)));
        if (sw.preWeek1Kpi && typeof sw.preWeek1Kpi === "object") setCurWeek1Kpi(sw.preWeek1Kpi);
      }
      // Starting a NEW next season with no saved pre-season start yet: suggest the off-season end (where the
      // new season begins). A local suggestion only — not persisted until the coach saves/applies.
      if (carrySeedRef.current) { if (!sw?.preseasonStart) setPreStart(carrySeedRef.current); carrySeedRef.current = ""; }
      // The UPCOMING pre-season's saved overrides live in NEXT season's row — restore them into the separate
      // pre-season store so the Pre-season tab reads/writes that row (survives the rollover; no index clash).
      const swn = (j as { savedWindowNext?: { preseasonWeek1Mult?: number | null; preseasonSessions?: number | null; blockWeeks?: Record<string, number>; blockGoals?: Record<string, "accum" | "transmute" | "realize">; deloadCadence?: number | null; preMesoTail?: number[] | null; preWeek1Kpi?: Record<string, number> | null; preTaperPct?: number | null; preGamesFrom?: string | null } | null }).savedWindowNext;
      if (swn && (!didPopulateNext.current || opts?.repopulate)) {
        didPopulateNext.current = true;
        if (swn.preseasonWeek1Mult != null && Number.isFinite(swn.preseasonWeek1Mult)) setPrePsWeek1Mult(Math.max(0.5, Math.min(3, swn.preseasonWeek1Mult)));
        if (swn.preseasonSessions === 3 || swn.preseasonSessions === 4 || swn.preseasonSessions === 5 || swn.preseasonSessions === 6) setPrePsSessions(swn.preseasonSessions);
        if (swn.preTaperPct != null && Number.isFinite(swn.preTaperPct)) setPrePsTaperPct(clampTaperPct(swn.preTaperPct));
        setPrePsGamesFrom(typeof swn.preGamesFrom === "string" ? swn.preGamesFrom : null);
        setPrePsAssumed(cleanAssumedGames((swn as { preAssumedGames?: unknown }).preAssumedGames));
        setPreBlockLenOv(swn.blockWeeks && typeof swn.blockWeeks === "object" ? swn.blockWeeks : {});
        setPreBlockGoals(swn.blockGoals && typeof swn.blockGoals === "object" ? swn.blockGoals : {});
        setPreCadence(swn.deloadCadence === 4 || swn.deloadCadence === 5 || swn.deloadCadence === 6 ? swn.deloadCadence : null);
        if (Array.isArray(swn.preMesoTail) && swn.preMesoTail.length) setNextMesoTail(swn.preMesoTail.filter((n) => Number.isFinite(n)));
        if (swn.preWeek1Kpi && typeof swn.preWeek1Kpi === "object") setNextWeek1Kpi(swn.preWeek1Kpi);
      }
      // Restore the coach's saved block length (cadence) so the meso reads back the block they set up.
      const savedCadence = Number((j as { deloadCadence?: number }).deloadCadence);
      if (savedCadence === 4 || savedCadence === 5 || savedCadence === 6) setCadence(savedCadence);
      // Read back the coach's saved day layout (week_plans) — the seed overlays it on the skeleton.
      const wp = (j as { weekPlans?: Array<{ day_date: string; day_type: string | null; focus: string | null }> }).weekPlans ?? [];
      const map: Record<string, { dayType: string; focus: string | null }> = {};
      for (const r of wp) if (r?.day_date) map[r.day_date] = { dayType: String(r.day_type ?? "").toUpperCase(), focus: r.focus ?? null };
      setSavedPlans(map);
      // Keep a valid deep-linked player (?player=) if it's in the roster, else default to the first.
      setSelId((prev) => (prev && (j.plan as Plan).players?.some((p) => p.playerId === prev) ? prev : ((j.plan as Plan).players?.[0]?.playerId ?? "")));
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [authHeader]);

  React.useEffect(() => { load("", ""); }, [load]);

  // Switch the whole hub to another SEASON YEAR (plan + fixtures + anchors load for that year). Stepping to a
  // LATER season carries the off-season end into its pre-season start (the off-season triggers the new season);
  // year-scoped inputs are cleared so a fresh year never inherits the previous season's structure.
  const switchYear = React.useCallback((yr: number) => {
    const curYr = plan?.seasonYear ?? new Date().getFullYear();
    carrySeedRef.current = yr > curYr ? (nextPreStart || offStart || "") : "";
    viewYearRef.current = yr; setViewYear(yr);
    didPopulateWindow.current = false; didPopulateNext.current = false;
    setPreStart(""); setSeasonEnd(""); setOffStart(""); setNextPreStart("");
    setSavedFrame({ preStart: "", seasonEnd: "", offStart: "", nextPreStart: "" }); setLeagueDraft(null);
    setBlockGoals({}); setBlockLenOv({}); setBlockDeloadOv({});
    setNextMesoTail(null); setPreBlockLenOv({}); setPreBlockGoals({}); setPreCadence(null); setCurMesoTail(null); setCurWeek1Kpi({}); setNextWeek1Kpi({});
    setCadence(4); setBlkStep(5); setPsWeek1Mult(1.3); setPsSessions(4); setPsTaperPct(PRESEASON_DEFAULT_TAPER_PCT); setPsGamesFrom(null); setPsAssumed({});
    nextPreStartRef.current = "";
    void load("", "");
  }, [plan, nextPreStart, offStart, load]);

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
  // A fitness test recorded on the Players tab → reload, so the new MAS + interval speeds show.
  const reloadAfterTest = React.useCallback(() => { void load(preStart, seasonEnd); }, [load, preStart, seasonEnd]);

  // Declared team breaks (frí) — the SAME source Week Setup locks on; the macro reads them so a real
  // break becomes its own re-load block (and a break day is a rest day in the block map).
  const [teamBreaks, setTeamBreaks] = React.useState<Array<{ start_date: string; end_date: string }>>([]);
  // Full break rows (id + label) for the breaks UI; `teamBreaks` above is the start/end slice the engine reads.
  const [teamBreaksFull, setTeamBreaksFull] = React.useState<Array<{ id: string; start_date: string; end_date: string; label: string | null }>>([]);
  // Per-window edited dates in the international-break card — the coach sets the break LENGTH before adding.
  const [breakEdits, setBreakEdits] = React.useState<Record<string, { start: string; end: string }>>({});
  // Training camps (æfingaferð) — concentrated-load periods. Full rows for the UI; `campRegions` (below) is
  // the start/end/loadPct/twoADay slice the calendar engine reads.
  const [camps, setCamps] = React.useState<Array<{ id: string; start_date: string; end_date: string; label: string | null; load_pct: number; two_a_day: boolean }>>([]);
  const [campDraft, setCampDraft] = React.useState<{ start: string; end: string; label: string; loadPct: number; twoADay: boolean }>(() => ({ start: "", end: "", label: "", loadPct: 15, twoADay: true }));
  const campRegions = React.useMemo(() => camps.map((c) => ({ start: c.start_date, end: c.end_date, loadPct: c.load_pct, twoADay: c.two_a_day })), [camps]);

  // MACRO IS THE CONTROL — the meso blocks are recomputed from the season span + the chosen deload cadence
  // (= block length), so changing the cadence (or, via re-fetch, the anchors) re-flows the whole plan.
  const mesoBlocks: MesoBlock[] = React.useMemo(() => {
    if (!plan || plan.phases.length === 0) return (plan?.blocks as unknown as MesoBlock[]) ?? [];
    // One slicing for the hub and the standalone Week Setup seed (periodization/mesoSeed): the season span by the
    // cadence + the coach's block maps; competitiveStart makes each in-season block fixture-aware.
    return seasonMesoBlocks(plan, { cadence, teamBreaks, offseasonStart: offStart || null, blockWeeks: blockLenOv, blockDeload: blockDeloadOv });
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
  // The block's unload week, the one the map shows: pre-season keeps its deload, in-season has none unless
  // the coach picked a light week. The calendar, player blocks and planned volume all read this.
  const blkDeload = React.useMemo(() => blockDeloadOf(activeBlock), [activeBlock]);
  // A competitive Realization block holds the standard week, every view reads the same flat week.
  const blkHold = holdsStandardWeek(activeBlock?.inSeason, effectiveGoal);
  const blkStepEff = blkHold ? 0 : blkStep;
  const blkMesoDeload = React.useMemo((): { deloadWeek: number | null; light?: boolean } => {
    if (!blkDeload) return { deloadWeek: cadence };
    const wi = deloadWeekIndex(mondayOf(blkStart), blkDeload.weekStart, blkWeeks);
    return { deloadWeek: wi == null ? null : wi + 1, light: blkDeload.light };
  }, [blkDeload, blkStart, blkWeeks, cadence]);

  // The cadence is the DEFAULT block length; the calendar renders the SELECTED block's own length
  // (`blkWeeksEff`, clamped to the block end), so a competitive block stops at the season boundary and
  // the off-season is viewed as its own block — not one window split across the phase boundary.
  React.useEffect(() => { setBlkWeeks(cadence); }, [cadence]);

  // Open the planner on the CURRENT macro block — only when the plan (re)loads, never on a cadence
  // change. (mesoBlocks re-segments with the cadence for the season MAP, but the block the coach is
  // editing stays anchored on blkStart.)
  // A jump asked for across a season switch ("Open the next season" → its first in-season block) wins once.
  const jumpBlkRef = React.useRef<string | null>(null);
  // The In-season page opens the next season by itself once, when the shown season is over (see below).
  const autoNextSeasonRef = React.useRef(false);
  const lastPlanRef = React.useRef<typeof plan>(null);
  React.useEffect(() => {
    if (!plan || mesoBlocks.length === 0) return;
    const planChanged = lastPlanRef.current !== plan;
    lastPlanRef.current = plan;
    const today = new Date().toISOString().slice(0, 10);
    const at = (d: string) => mesoBlocks.find((b) => b.start <= d && d < b.end) ?? null;
    const want = jumpBlkRef.current;
    const jump = want ? at(want) : null;
    if (jump) { jumpBlkRef.current = null; setBlkStart(jump.start); return; }
    const comp = plan.phases.find((p) => p.key === "competitive") ?? null;
    if (tab === "plan" && comp) {
      // The In-season page starts at the season's first game — never on a pre-season block (user, 2026-11-25):
      // in season → this week's block; season over and the next one has its opener → open that season once
      // (a coach who goes back stays there); otherwise → the block of the season's first game.
      const nextYr = plan.seasonYear + 1;
      const goNext = today >= comp.end && !!plan.nextFirstFixture && plan.nextFirstFixture >= today
        && nextYr <= new Date().getFullYear() + 1 && !autoNextSeasonRef.current;
      const sel = at(blkStart);
      if (!goNext && sel && sel.start >= comp.start && sel.start < comp.end) return; // already on an in-season block
      if (today >= comp.start && today < comp.end) { const b = at(today); if (b) { setBlkStart(b.start); return; } }
      if (goNext) {
        autoNextSeasonRef.current = true;
        jumpBlkRef.current = plan.nextFirstFixture ?? null;
        switchYear(nextYr);
        return;
      }
      const first = at(comp.start);
      if (first) { setBlkStart(first.start); return; }
    }
    if (!planChanged) return; // other tabs: re-anchor only when the plan (re)loads, as before
    const cur = at(today) ?? mesoBlocks[0];
    if (cur) setBlkStart(cur.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, tab]);

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
  const persistOverridePatch = React.useCallback((patch: Record<string, unknown>, year?: number) => {
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

  // Pick the team's aerobic test and persist it to this season's plan (Week setup reads the same choice).
  const changeAerobicTest = (k: AerobicMode) => {
    setAerobicTest(k);
    if (!plan) return;
    (async () => {
      try {
        await fetch("/api/coach/periodization", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
          body: JSON.stringify({ seasonYear: plan.seasonYear, overrides: { aerobicTest: k } }),
        });
      } catch { /* best-effort persist */ }
    })();
  };

  // Lift (or restore) this week's VALD trim for a player. The server stamps who + when and keeps the log.
  const sendValdTrimLift = async (playerId: string, action: { reason?: string; undo?: boolean }): Promise<boolean> => {
    if (!plan) return false;
    const res = await fetch("/api/coach/periodization", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
      body: JSON.stringify({ seasonYear: plan.seasonYear, valdTrimLift: { playerId, weekStart: mondayOfIso(new Date().toISOString().slice(0, 10)), ...action } }),
    }).catch(() => null);
    if (!res?.ok) return false;
    await load(preStart, seasonEnd); // the loader resolves the lift, so the block + the weekly target both follow
    return true;
  };

  // The season's first entered league game (never the estimate) — the frame's "First league game" field.
  const leagueGame = React.useMemo(() => firstLeagueGame(plan?.fixtureList ?? []), [plan]);
  const frameDirty = preStart !== savedFrame.preStart || seasonEnd !== savedFrame.seasonEnd || offStart !== savedFrame.offStart || nextPreStart !== savedFrame.nextPreStart
    || (leagueDraft != null && leagueDraft !== (leagueGame?.date ?? ""));

  // MACRO SAVE — the one button: persists the frame, writes a changed first league game into the fixture list
  // (moving the old one), then re-reads everything so Meso + Micro follow. There is no separate "Apply".
  async function saveFrame() {
    if (!plan) return;
    setSaved(false); setFrameSaving(true);
    try {
      const res = await fetch("/api/coach/periodization", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
        body: JSON.stringify({ seasonYear: plan.seasonYear, overrides: overridesPayload(cadence),
          blocks: mesoBlocks.map((b) => ({ block_index: b.index, phase: b.phase.en, goal: b.goal.en, start_date: b.start, end_date: b.end, is_deload: b.isDeload, targets: { acwr: b.acwr, volumeTargetPct: b.volumeTargetPct } })) }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})) as { error?: string }; setErr(j.error ?? "Save failed"); return; }
      setSavedFrame({ preStart, seasonEnd, offStart, nextPreStart });
      const newLeague = leagueDraft && leagueDraft !== (leagueGame?.date ?? "") ? leagueDraft : null;
      if (newLeague) {
        const moved = await writeFixture(newLeague, "upsert", { isFriendly: false, opponent: leagueGame?.opponent ?? undefined, competition: leagueGame?.competition ?? undefined });
        if (moved && leagueGame) await writeFixture(leagueGame.date, "delete");
        if (!moved) return;
      } else {
        await load(preStart, seasonEnd);
      }
      setLeagueDraft(null);
      setSaved(true);
    } finally { setFrameSaving(false); }
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
    return buildMesoPlan({ startDate: blkStart, numWeeks: blkWeeks, sessionsPerWeek: blkSessions, baseline: blkPos.avg as unknown as TeamAverages, mdShape: plan.mdShape, fixtures: plan.fixtures ?? [], matchUnitLoad: blkMatchUnit, baseOverloadPct: blkBase, stepPct: blkStep, goal: BLK_GOALS[effectiveGoal], inSeason: inSeasonRange(plan.phases) });
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
          accHiEff: mu.accHiEff.typical, decHiEff: mu.decHiEff.typical, stride: mu.stride.typical, ...dirFields, rhie: mu.rhie.typical, symmetry: mu.symmetry.typical, metPower: mu.metPower.typical, fr: mu.imaFr?.typical ?? ta?.matchImaFrDist ?? null, cod: mu.imaCod.typical ?? ta?.matchImaCod ?? null, accel: mu.accel.typical, decel: mu.decel.typical }
      : teamCalendarUnit(ta); // the squad's match unit — the same one the standalone Week Setup seed uses
  }, [isPlayerScope, player, plan]);
  // A full match in Player Load (the KPI tables' near-full unit), named beside the calendar's squad value. sRPE teams have no PL.
  const fullMatchPl = React.useMemo(() => (plan && plan.tier.loadSource !== "srpe" ? teamKpiAvg(plan.players).totalPlayerLoad ?? null : null), [plan]);
  const blkPhaseLabel = plan?.phases.find((ph) => ph.start <= blkStart && blkStart < ph.end)?.label ?? { en: "Season block", is: "Tímabils-lota" };
  // Pre-season matches are friendlies — they must not pull down His block's training-week alignment target.
  const blkIsPreseason = plan?.phases.find((ph) => ph.start <= blkStart && blkStart < ph.end)?.key === "preseason";

  // Team breaks → the teamBreaks state (the macro memo reads start/end) + teamBreaksFull (id/label for the UI).
  const loadBreaks = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/coach/team/breaks`, { headers: { Authorization: await authHeader() } });
      const json = res.ok ? await res.json() : null;
      if (json?.ok) {
        const rows = (json.breaks ?? []) as Array<{ id: string; start_date: string; end_date: string; label: string | null }>;
        setTeamBreaksFull(rows);
        setTeamBreaks(rows.map((b) => ({ start_date: b.start_date, end_date: b.end_date })));
      }
    } catch { /* breaks optional */ }
  }, [authHeader]);
  React.useEffect(() => { void loadBreaks(); }, [loadBreaks]);
  // Declare a break (coach-set dates) / remove one — then refetch so the macro/meso re-flow.
  const addBreak = React.useCallback(async (startDate: string, endDate: string, label: string) => {
    try { await fetch(`/api/coach/team/breaks`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ startDate, endDate, label }) }); } catch { /* best-effort */ }
    await loadBreaks();
  }, [authHeader, loadBreaks]);
  const removeBreak = React.useCallback(async (id: string) => {
    try { await fetch(`/api/coach/team/breaks?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: await authHeader() } }); } catch { /* best-effort */ }
    await loadBreaks();
  }, [authHeader, loadBreaks]);
  // Training camps — load + add/edit/remove, then refetch so the macro/meso calendars re-flow.
  const loadCamps = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/coach/team/camps`, { headers: { Authorization: await authHeader() } });
      const json = res.ok ? await res.json() : null;
      if (json?.ok) setCamps((json.camps ?? []) as typeof camps);
    } catch { /* camps optional */ }
  }, [authHeader]);
  React.useEffect(() => { void loadCamps(); }, [loadCamps]);
  const addCamp = React.useCallback(async (c: { start: string; end: string; label: string; loadPct: number; twoADay: boolean }) => {
    try { await fetch(`/api/coach/team/camps`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ startDate: c.start, endDate: c.end, label: c.label, loadPct: c.loadPct, twoADay: c.twoADay }) }); } catch { /* best-effort */ }
    await loadCamps();
  }, [authHeader, loadCamps]);
  const patchCamp = React.useCallback(async (id: string, patch: Record<string, unknown>) => {
    try { await fetch(`/api/coach/team/camps`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ id, ...patch }) }); } catch { /* best-effort */ }
    await loadCamps();
  }, [authHeader, loadCamps]);
  const removeCamp = React.useCallback(async (id: string) => {
    try { await fetch(`/api/coach/team/camps?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: await authHeader() } }); } catch { /* best-effort */ }
    await loadCamps();
  }, [authHeader, loadCamps]);

  // Seed a FULL 6-week skeleton (MESO_HORIZON) from the auto layout + the coach's saved day edits +
  // real fixtures whenever the block window or scope changes. Always seeding 6 weeks (regardless of the
  // current cadence) is what makes a cadence switch a pure trim: the grid renders only `blkWeeks` of
  // this skeleton, so 6→4→5 shows the same first weeks and never reshuffles. NB: NOT keyed on blkWeeks
  // — a cadence change must not re-seed (that would wipe unsaved edits); it only changes how many weeks
  // render.
  React.useEffect(() => {
    if (!plan) return;
    // The skeleton (lib mesoWeek.mesoSkeleton — the same one Micro seeds from): the auto layout (session/off only —
    // FIXTURES ARE THE ONLY SOURCE OF MATCHES, a phantom Sat/Sun match fights the coach), then the coach's saved days
    // (week_plans: a saved OFF stays off, a saved training day keeps its stimulus — "meso reads the day changes back"),
    // then the fixtures, then the declared team breaks (forced off, start <= day <= end, as Week Setup).
    const { days: sk, types: ov } = mesoSkeleton({ unit: blkUnit, startDate: blkStart, numWeeks: MESO_HORIZON, scopeName: isPlayerScope ? player!.name : "__team__", baseOverloadPct: blkBase, stepPct: blkStep, allFixtures: plan.fixtures ?? [], goal: effectiveGoal, deload: blkDeload, hold: blkHold, offseasonStart: plan.phases.find((p) => p.key === "offseason")?.start ?? undefined, inSeason: inSeasonRange(plan.phases), noAutoMatch: true, savedPlans, teamBreaks });
    setBlkSkeleton(sk); setTypeOverrides(ov); setDayModal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkStart, blkScope, selId, teamBreaks, savedPlans, effectiveGoal, blkHold, blkDeload]);

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
    return buildCalendarBlock({ unit: blkUnit, startDate: blkStart, numWeeks: blkWeeksEff, scopeName: isPlayerScope ? player!.name : "__team__", scopePos: isPlayerScope ? player!.position : null, phase: blkPhaseLabel, baseOverloadPct: blkBase, stepPct: blkStep, ...skeletonSets, typeOverrides, allFixtures: plan.fixtures ?? [], offseasonStart: offPhaseStart ?? undefined, inSeason: inSeasonRange(plan.phases), goal: effectiveGoal, deload: blkDeload, hold: blkHold, camps: campRegions, noAutoMatch: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, blkSkeleton, skeletonSets, typeOverrides, blkStart, blkWeeksEff, blkBase, blkStep, blkScope, selId, blkUnit, effectiveGoal, blkDeload, blkHold, campRegions]);

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
  // Phase 2 — Train-like-you-Play match-EXPOSURE gaps per player feed the SAME steer, so the ramp
  // also responds to what training under-does vs his own matches (not just TPA percentile weakness).
  // One squad fetch per season (not per player); indexed by playerId. Skipped for basketball (no GPS TLYP).
  const [tlypExposures, setTlypExposures] = React.useState<Map<string, ExposureInput[]>>(new Map());
  React.useEffect(() => {
    if (tab !== "players" || isBasketball) return;
    let alive = true;
    (async () => {
      try {
        const yr = new Date().getFullYear();
        const res = await fetch(`/api/coach/train-like-you-play?season=${yr}`, { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => ({}));
        if (!alive || !res.ok) return;
        const map = new Map<string, ExposureInput[]>();
        for (const p of (j.players ?? []) as Array<{ id: string; metrics: Record<string, { flag?: string; pct?: number | null }> }>) {
          const exps = exposuresFromTlyp(p.metrics); // shared assembler — one needs model
          if (exps.length) map.set(p.id, exps);
        }
        if (alive) setTlypExposures(map);
      } catch { /* leave empty — the steer falls back to TPA weaknesses only */ }
    })();
    return () => { alive = false; };
  }, [tab, isBasketball, authHeader]);
  const selExposures = React.useMemo(() => tlypExposures.get(selId) ?? [], [tlypExposures, selId]);


  // Phase 3 — the player's movement-SHAPE under-trained directions (IMA clock, training vs his own
  // matches) tilt the plan's fwd/back/lat split. Per-player fetch (season window); skipped for basketball.
  const [shapeDirs, setShapeDirs] = React.useState<ShapeDirInput[]>([]);
  React.useEffect(() => {
    if (tab !== "players" || !selId || isBasketball) { setShapeDirs([]); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/coach/player/${encodeURIComponent(selId)}/train-vs-play-shape`, { headers: { Authorization: await authHeader() } });
        const j = await res.json().catch(() => ({}));
        const under = j?.ok && j?.hasData ? (j.windows?.season?.underTrained ?? []) : [];
        if (alive) setShapeDirs(shapeDirsFromShape(under as Array<{ dir: string; delta: number }>)); // shared assembler
      } catch { if (alive) setShapeDirs([]); }
    })();
    return () => { alive = false; };
  }, [tab, selId, isBasketball, authHeader]);

  const steer: BuildUpSteer | null = React.useMemo(() => {
    const w = steerData?.weaknesses ?? [];
    if (!w.length && !selExposures.length && !shapeDirs.length) return null;
    return computeBuildUpSteer(w, selExposures, shapeDirs);
  }, [steerData, selExposures, shapeDirs]);
  const steerActive = !!steer && !steerNeutral && steer.hasHard;

  // Build ONE player's individualised block — his own match unit + position tilt + this week's VALD trim
  // plus the optional weakness-steer bias. Reused for the on-screen selected player AND every player
  // in the PDF export (so "computed from the Meso Cycle" holds for the whole squad).
  const computePlayerBlock = React.useCallback((pl: Player, steerArg: { active: boolean; steer: BuildUpSteer | null }) => {
    if (!plan || Object.keys(blkSkeleton).length === 0) return null;
    // Canonical per-player block builder — shared with the player app's read-only
    // "my build-up" view so the two can never drift (src/lib/.../playerBlock.ts).
    const offPhaseStart = plan.phases.find((p) => p.key === "offseason")?.start ?? undefined;
    return buildPlayerBlock(plan, pl, {
      blkStart, blkWeeks: blkWeeksEff, blkBase, blkStep, phaseLabel: blkPhaseLabel, skeletonSets, typeOverrides, steer: steerArg, offseasonStart: offPhaseStart, goal: effectiveGoal, deload: blkDeload, hold: blkHold, camps: campRegions, friendlyMatches: blkIsPreseason, asOf: new Date().toISOString().slice(0, 10), noAutoMatch: true,
    });
  }, [plan, blkSkeleton, skeletonSets, typeOverrides, blkStart, blkWeeksEff, blkBase, blkStep, blkPhaseLabel, blkIsPreseason, effectiveGoal, blkDeload, blkHold, campRegions]);

  // The SELECTED player's block (weakness-steer applied unless the coach picks a neutral ramp).
  const playerBlock = React.useMemo(
    () => (player ? computePlayerBlock(player, { active: steerActive, steer }) : null),
    [player, computePlayerBlock, steerActive, steer],
  );
  // The Block calendar is ONE calendar: team scope renders the editable team skeleton (calBlock); player
  // scope renders the SAME structure re-individualised (buildPlayerBlock — aligned/capped/steered), so the
  // player-scoped calendar is the player's individualised block (buildPlayerBlock) — one grid, no duplicate.
  // Player scope is read-only (day-type edits are a team concern); switch to Team scope to edit.
  const mesoCalBlock = React.useMemo(
    () => (isPlayerScope && playerBlock ? playerBlock.block : calBlock),
    [isPlayerScope, playerBlock, calBlock],
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
    const winIsPreseason = plan.phases.find((ph) => ph.start <= win.blkStart && win.blkStart < ph.end)?.key === "preseason";
    return buildPlayerBlock(plan, player, { blkStart: win.blkStart, blkWeeks: win.blkWeeks, phaseLabel: win.phaseLabel, matchDates: win.matchDates, goal: wGoal, deload: blockDeloadOf(wb), hold: holdsStandardWeek(wb?.inSeason, wGoal), camps: campRegions, friendlyMatches: winIsPreseason, asOf: new Date().toISOString().slice(0, 10) });
  }, [player, plan, mesoBlocks, blockGoals, campRegions]);

  // Drills by MD day for the PDFs (football): research drills paired to each training day type of the
  // block, beside the general ideas. Never the coach's own library (it follows him across teams). Read at
  // export time; an empty read leaves the ideas.
  async function dayDrillsFor(block: CalendarBlock) {
    if (isBasketball || (teamSport != null && teamSport.toLowerCase() !== "football")) return null;
    const mb = mesoBlocks.find((b) => b.start <= block.startDate && block.startDate < b.end);
    return buildDayDrillSheet({ days: block.weeks.flatMap((w) => w.days), rows: await fetchResearchDrills(await authHeader()), phase: mb && !mb.inSeason ? "preseason" : "inseason" });
  }

  async function exportPlayerBlock() {
    if (!playerBlock || !plan) return;
    await downloadPeriodizationBlockPdf({ teamName: plan.teamName, block: playerBlock.block, isKinexon, dayDrills: await dayDrillsFor(playerBlock.block) }, is ? "IS" : "EN");
  }

  // ── AUTO-SAVE the block skeleton to Week Setup on every edit ─────────────────────────────────────
  // Each day click persists to week_plans (the day-truth source) through the SAME server path as the
  // manual "Apply" button, debounced so rapid clicks coalesce into one write. A ref holds the latest
  // computed block so the debounced save sees the post-edit layout (calBlock recomputes after the click).
  const buildApplyPayload = React.useCallback((block: CalendarBlock) => block.weeks.map((w) => ({
    week_start: w.weekStart,
    system_key: w.isDeload && !w.isLight ? "RECOVERY" : effectiveGoal === "accum" ? "STRENGTH" : "POWER",
    intensity_target: w.isDeload && !w.isLight ? 3 : Math.max(3, Math.min(9, Math.round(5 + (w.mult - 1) * 12))),
    // focus = the MD tag (+ the stimulus on a training day, "MD-5 Mechanical"); day_intent GAME/OFF/null (CHECK
    // constraint). One mapping, shared with the pre-season edits and the Micro seed (periodization/mesoWeek).
    days: planDaysFromCalWeek(w),
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
  // All length edits write STABLE block-START (ISO) keys (migrating any legacy index keys first), so a
  // resize/split/merge never shifts another block's override onto the wrong block.
  const setBlockLength = React.useCallback((blockStart: string, weeks: number | null) => {
    const next = migrateLenToIso(blockLenOv, mesoBlocks);
    if (weeks == null) delete next[blockStart]; else next[blockStart] = weeks;
    setBlockLenOv(next); persistBlockMap("blockWeeks", next);
  }, [blockLenOv, mesoBlocks, persistBlockMap]);
  // SPLIT a block in two — SPAN-PRESERVING (a + b = the block's weeks), so every later block keeps its
  // start and thus its override. Both halves pinned by ISO start. ADD-a-block is a split.
  const splitBlock = React.useCallback((b: { start: string; weeks: number; index: number }) => {
    const a = Math.ceil(b.weeks / 2), b2 = b.weeks - a;
    if (b2 < 2 || a < 2) return;
    const newStart = isoAdd(mondayOf(b.start), a * 7);
    const next = migrateLenToIso(blockLenOv, mesoBlocks);
    next[b.start] = a; next[newStart] = b2;
    setBlockLenOv(next); persistBlockMap("blockWeeks", next);
  }, [blockLenOv, mesoBlocks, persistBlockMap]);
  // MERGE a block with the next — also SPAN-PRESERVING (the combined block ends exactly where `next` did),
  // so later blocks keep their starts. Removes `next`'s override; pins the combined length by ISO start.
  const mergeNextBlock = React.useCallback((b: { start: string; weeks: number }, nextB: { start: string; weeks: number; index: number }) => {
    const next = migrateLenToIso(blockLenOv, mesoBlocks);
    next[b.start] = b.weeks + nextB.weeks;
    delete next[nextB.start]; delete next[String(nextB.index)];
    setBlockLenOv(next); persistBlockMap("blockWeeks", next);
  }, [blockLenOv, mesoBlocks, persistBlockMap]);
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
  const psTaper = upcomingYear ? prePsTaperPct : psTaperPct;
  const psGames = upcomingYear ? prePsGamesFrom : psGamesFrom;  // weekend games assumed from this day  // % cut of the light week before the opener
  const mesoTail = upcomingYear ? nextMesoTail : curMesoTail; // the viewed/upcoming season's game-anchored tail
  const week1KpiOv = upcomingYear ? nextWeek1Kpi : curWeek1Kpi; // the viewed/upcoming season's per-KPI week-1 overrides
  const setPreW1 = (v: number) => {
    if (upcomingYear) { setPrePsWeek1Mult(v); persistOverridePatch({ preseasonWeek1Mult: v }, preYear); }
    else { setPsWeek1Mult(v); persistOverridePatch({ preseasonWeek1Mult: v }); }
  };
  const setPreTaper = (v: number) => {
    if (upcomingYear) { setPrePsTaperPct(v); persistOverridePatch({ preTaperPct: v }, preYear); }
    else { setPsTaperPct(v); persistOverridePatch({ preTaperPct: v }); }
  };
  const setPreGames = (v: string | null) => {
    if (upcomingYear) { setPrePsGamesFrom(v); persistOverridePatch({ preGamesFrom: v }, preYear); }
    else { setPsGamesFrom(v); persistOverridePatch({ preGamesFrom: v }); }
  };
  const psAssumedT = upcomingYear ? prePsAssumed : psAssumed;
  // The pre-season's block lengths / goals / cadence — the viewed row's, or next season's row when the pre-season
  // being planned belongs to it. The same values the strength delivery reads (resolveCurrentBlock).
  const preBlockWeeksT = upcomingYear ? preBlockLenOv : blockLenOv;
  const preBlockGoalsT = upcomingYear ? preBlockGoals : blockGoals;
  const preCadenceT = upcomingYear ? (preCadence ?? cadence) : cadence;
  // Set (or clear → the build-up order) one pre-season block's goal; saved at once to that row's blockGoals.
  const setPreseasonGoal = (blockStart: string, g: "accum" | "transmute" | "realize" | null) => {
    const next = { ...preBlockGoalsT }; if (g) next[blockStart] = g; else delete next[blockStart];
    if (upcomingYear) setPreBlockGoals(next); else setBlockGoals(next);
    (async () => { try { await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ seasonYear: preYear, overrides: { blockGoals: next } }) }); } catch { /* best-effort persist */ } })();
  };
  // Move / remove / restore the assumed game in a pre-season week (no game entered there). The week re-flows around
  // the new game day (its saved days are not read) and is saved whole to week_plans — the same write as a day edit —
  // so Week Setup shows the week the Pre-season page shows.
  const moveAssumedWeek = async (input: Parameters<typeof buildPreseasonProposal>[0], weekStart: string, val: number | null | undefined): Promise<void> => {
    const next = { ...psAssumedT }; if (val === undefined) delete next[weekStart]; else next[weekStart] = val;
    // Saved straight away (not through the debounced patch) — one click is one choice.
    if (upcomingYear) setPrePsAssumed(next); else setPsAssumed(next);
    setPreDayPick(null);
    if (plan) void (async () => { try { await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ seasonYear: upcomingYear ? preYear : plan.seasonYear, overrides: { preAssumedGames: next } }) }); } catch { /* best-effort */ } })();
    const mv = assumedWeekMove(input, weekStart, next); if (!mv) return;
    setSavedPlans((prev) => { const o = { ...prev }; for (const d of mv.week.days) o[d.day_date] = { dayType: d.day_type, focus: d.focus }; return o; });
    const payload = [mv.week];
    setPreDaySave("saving");
    // Awaited, so a caller (Micro's "No game this week") re-reads the week after it is written.
    try { const r = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ applyWeekSetup: payload }) }); setPreDaySave(r.ok ? "saved" : "err"); } catch { setPreDaySave("err"); }
  };
  const setPreSess = (v: number) => {
    if (upcomingYear) { setPrePsSessions(v); persistOverridePatch({ preseasonSessions: v }, preYear); }
    else { setPsSessions(v); persistOverridePatch({ preseasonSessions: v }); }
  };
  // Persist a pre-season game-anchored meso tail (backwards editor). Derives the index-keyed blockWeeks so the
  // week-card grouping + the ramp read the same boundaries. For the UPCOMING (next-year) row — which holds
  // pre-season blocks only — it replaces blockWeeks outright. For the VIEWED season's own row it MERGES: keeps
  // the competitive ISO-keyed length overrides and replaces only the numeric (pre-season) keys, so adding a
  // pre-season meso cycle never wipes competitive overrides.
  const persistMesoTail = React.useCallback((tail: number[], windowWeeks: number, cad: number, year: number, isUpcoming: boolean) => {
    const { lens } = preseasonMeso(windowWeeks, tail, cad);
    const tailBw = lensToBlockWeeks(lens);
    let bw: Record<string, number>;
    if (isUpcoming) { bw = tailBw; setNextMesoTail(tail); setPreBlockLenOv(bw); }
    else { const keepIso = Object.fromEntries(Object.entries(blockLenOv).filter(([k]) => !/^\d+$/.test(k))); bw = { ...keepIso, ...tailBw }; setCurMesoTail(tail); setBlockLenOv(bw); }
    (async () => { try { await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ seasonYear: year, overrides: { preMesoTail: tail, blockWeeks: bw } }) }); } catch { /* best-effort persist */ } })();
  }, [authHeader, blockLenOv]);
  // Persist the coach's per-KPI WEEK-1 overrides to the relevant pre-season row (viewed vs upcoming).
  const persistWeek1Kpi = React.useCallback((next: Record<string, number>, year: number, isUpcoming: boolean) => {
    if (isUpcoming) setNextWeek1Kpi(next); else setCurWeek1Kpi(next);
    (async () => { try { await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ seasonYear: year, overrides: { preWeek1Kpi: next } }) }); } catch { /* best-effort persist */ } })();
  }, [authHeader]);

  // The Pre-season tab reads straight from the Macro cycle, the fixtures and the coach's live settings (the user
  // removed "Build pre-season" / "Build meso" / "Build macro" 2026-11-25: one plan, no draft beside it). The *T names are the values it renders.
  const psW1T = psW1, psSessT = psSess, psTaperT = psTaper, psGamesT = psGames;
  const week1KpiT = week1KpiOv, mesoTailT = mesoTail, savedPlansT = savedPlans;
  const setPreW1T = setPreW1, setPreSessT = setPreSess, setPreTaperT = setPreTaper, setPreGamesT = setPreGames;
  // The whole pre-season comes from ONE pure builder (periodization/preseasonProposal), fed the coach's live settings
  // and saved days. Built here (not only inside the Pre-season tab) so the Micro tab seeds a week from the same plan.
  const preInput = React.useMemo((): Parameters<typeof buildPreseasonProposal>[0] | null => {
    if (!plan) return null;
    return preseasonInputFor(plan, {
      today: new Date().toISOString().slice(0, 10), unit: blkUnit, savedDays: savedPlansT, camps: campRegions, cadence: preCadenceT, blockWeeks: preBlockWeeksT, blockGoals: preBlockGoalsT, baseOverloadPct: blkBase, stepPct: blkStep, aerobicMode: aerobicTest,
      settings: { sessionsPerWeek: psSessT, week1MatchMultiple: psW1T, week1Kpi: week1KpiT, mesoTail: mesoTailT, taperPct: psTaperT, gamesFrom: psGamesT, assumedGames: psAssumedT },
    });
  }, [plan, psSessT, psW1T, week1KpiT, mesoTailT, psTaperT, psGamesT, psAssumedT, blkUnit, campRegions, savedPlansT, preCadenceT, preBlockWeeksT, preBlockGoalsT, blkBase, blkStep, aerobicTest]);
  const preProp = React.useMemo(() => (preInput ? buildPreseasonProposal(preInput) : null), [preInput]);

  // MESO → MICRO (season-setup lota 4): the week the Meso pages show, in the shape Meso saves it (week_plans days).
  // Pre-season: the pre-season plan's week (with its assumed game). In-season: the Meso block calendar the In-season
  // page builds for the team (block opened at its start, same goal / unload / hold / skeleton). Micro seeds an
  // unsaved week from it; null = the week is outside both (Micro falls back to its match-anchored grid).
  const mesoWeekFor = (ws: string) => (plan ? mesoWeekOf({ plan, preProp, mesoBlocks, blockGoals, cadence, unit: teamCalendarUnit(plan.teamBaseline?.avg), baseOverloadPct: blkBase, stepPct: blkStep, savedPlans, teamBreaks, camps: campRegions }, ws) : null);

  // Week confirmation status (Micro "Confirm week → players") — badges on the Meso week cards.
  const [weekConfirm, setWeekConfirm] = React.useState<Record<string, WeekConfirmStatus>>({});
  React.useEffect(() => {
    if (!plan || plan.phases.length === 0 || (tab !== "preseason" && tab !== "plan")) return;
    const from = mondayOf(plan.phases[0].start);
    const preEnd = preProp?.weeks.length ? preProp.weeks[preProp.weeks.length - 1].weekStart : from;
    const lastEnd = plan.phases[plan.phases.length - 1].end;
    const to = preEnd > lastEnd ? preEnd : lastEnd;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/coach/week-setup/confirmation?from=${from}&to=${to}`, { headers: { Authorization: await authHeader() } });
        const j = await r.json().catch(() => ({})) as { ok?: boolean; weeks?: WeekConfirmStatus[] };
        if (alive && r.ok && j.ok) setWeekConfirm(Object.fromEntries((j.weeks ?? []).map((w) => [w.weekStart, w])));
      } catch { /* badges are best-effort */ }
    })();
    return () => { alive = false; };
  }, [plan, tab, preProp, authHeader]);
  const confirmBadge = (ws: string) => {
    const s = weekConfirm[ws] ?? null;
    const tone = !s ? "border-slate-200 bg-white text-slate-500" : s.state === "confirmed" ? "border-[#1c7a4a]/30 bg-[#1c7a4a]/10 text-[#1c7a4a]" : "border-[#de9328]/40 bg-[#de9328]/10 text-[#8a5a12]";
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{weekConfirmLabel(s, is)}</span>;
  };
  // The same status, short, for the narrow week column of the In-season calendar (full words in the tooltip).
  const confirmMark = (ws: string) => {
    const s = weekConfirm[ws] ?? null;
    const [txt, cls] = !s ? [is ? "óstaðf." : "not conf.", "text-slate-400"] : s.state === "confirmed" ? [is ? "✓ staðf." : "✓ conf.", "text-[#1c7a4a]"] : [is ? "breytt" : "changed", "text-[#8a5a12]"];
    return <span title={weekConfirmLabel(s, is)} className={`text-[10px] font-semibold ${cls}`}>{txt}</span>;
  };
  // How the strength is delivered (the team's send mode; standard = the Custom Programme per week) for the weeks the
  // shown Meso page lists: the pre-season's weeks, or the In-season page's block (deliveryView.ts).
  const deliveryFrom = tab === "preseason" && preProp?.weeks.length ? preProp.weeks[0].weekStart : tab === "plan" ? mondayOf(blkStart) : null;
  const deliveryTo = tab === "preseason" && preProp?.weeks.length ? preProp.weeks[preProp.weeks.length - 1].weekStart : tab === "plan" ? isoAdd(mondayOf(blkStart), (MESO_HORIZON - 1) * 7) : null;
  const delivery = useStrengthDelivery(deliveryFrom, deliveryTo);
  const deliveryStd = delivery?.mode === "standard";
  const deliveryWeek = (ws: string) => delivery?.weeks.find((w) => w.weekStart === ws) ?? null;
  const w1SetCount = Object.keys(week1KpiT ?? {}).length + (psW1T !== PRESEASON_DEFAULT_WEEK1 ? 1 : 0);
  const persistWeek1KpiT = persistWeek1Kpi, persistMesoTailT = persistMesoTail;

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
      deloadNow: !!curBlock?.deloadNow, deloadReason: curBlock?.flag ?? null,
      prevGoal: prevBlock ? gk(prevBlock.phase.en) : null,
      fixturesLoaded: (plan.fixtures ?? []).length, loadHistoryWeeks: (plan.loadCurve ?? []).length,
    });
  }, [plan, mesoBlocks, blkStart, blkWeeks]);
  const recTint = (c: "high" | "medium" | "low") => (c === "high" ? "bg-emerald-100 text-emerald-700" : c === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500");

  async function exportBlock() {
    const blk = mesoCalBlock; // player scope exports HIS block; team scope the team block
    if (!blk || !plan) return;
    await downloadPeriodizationBlockPdf({ teamName: plan.teamName, block: blk, isKinexon, fullMatchPl, dayDrills: await dayDrillsFor(blk) }, is ? "IS" : "EN");
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
    const players = plan.players.map((p) => ({ name: p.name, position: p.position, masKmh: p.masKmh, matchUnitLoad: p.matchUnit.load.typical, matchUnitHsr: p.matchUnit.hsr.typical, matchUnitDistance: p.matchUnit.distance.typical, weeklyPlTarget: p.matchUnit.load.typical != null ? Math.round(p.matchUnit.load.typical * plWkMult) : null, baselinePl: p.recentBaseline?.playerLoad ?? null, baselineHsr: p.recentBaseline?.hsrM ?? null, baselineSessions: p.recentBaseline?.sessions ?? 0, nNearFull: p.matchUnit.nNearFull, matchUnitConf: p.matchUnit.confidence, valdCap: p.vald.lift ? null : p.vald.capPct, gaps: p.gaps.filter((g) => g.severity !== "ok").length }));
    const blocks = mesoBlocks.map((b) => ({ phase: b.phase, goal: b.goal, goalKey: b.goalKey, start: b.start, end: b.end, weeks: b.weeks, isDeload: b.isDeload, deloadWeekStart: b.deloadWeekStart, deloadNow: b.deloadNow, tmr: b.tmr, volumeTargetPct: b.volumeTargetPct, flag: b.flag }));
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
      const t = pb.valdTrim;
      const valdEn = !t ? "no VALD trim" : t.state === "applied" ? `VALD: training at ${t.capPct}% in the week of ${t.weekStart}, after a low jump test` : t.state === "lifted" ? `VALD trim lifted by the coach for the week of ${t.weekStart}` : "no VALD trim (already a deload week)";
      const valdIs = !t ? "engin VALD-lækkun" : t.state === "applied" ? `VALD: æfingar í ${t.capPct}% vikuna ${t.weekStart}, eftir lágt hoppróf` : t.state === "lifted" ? `VALD-lækkun hnekkt af þjálfara vikuna ${t.weekStart}` : "engin VALD-lækkun (vikan er þegar niðurtröppun)";
      const unitEn = pb.useOwn ? `own match unit (n=${pb.nNearFull}, ${pb.confidence} confidence)` : `squad baseline — too few full matches (n=${pb.nNearFull})`;
      const unitIs = pb.useOwn ? `eigið leikviðmið (n=${pb.nNearFull}, ${confIs(pb.confidence)} vissa)` : `liðs-grunnlína — of fáir heilir leikir (n=${pb.nNearFull})`;
      return { en: `${unitEn}; ${valdEn}.`, is: `${unitIs}; ${valdIs}.` };
    };
    const playerBlocks: Array<{ name: string; position: string | null; note: Bi; block: CalendarBlock }> = [];
    for (const pl of chosen) {
      const pb = computePlayerBlock(pl, { active: pl.playerId === selId ? steerActive : false, steer: pl.playerId === selId ? steer : null });
      if (pb) playerBlocks.push({ name: pl.name, position: pl.position, note: noteFor(pb), block: pb.block });
    }
    const tb = plan.teamBaseline?.avg;
    const teamUnit = tb ? { dist: tb.matchDistanceM, hsr: tb.matchHsrM, load: tb.matchPlayerLoad, accdec: ((tb.matchAccel ?? 0) + (tb.matchDecel ?? 0)) || null,
      accHiEff: tb.matchAccelHiEff, decHiEff: tb.matchDecelHiEff, stride: tb.matchStrideHi, fr: tb.matchImaFrDist, cod: tb.matchImaCod, accel: tb.matchAccel, decel: tb.matchDecel,
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
      const pa = preAnchorOf(plan);
      const preAnchor: LoadAnchor = pa.anchor;
      preRamp = preseasonRamp(pa, plan.matchSrpe, preWeeks, { sessionsPerWeek: psSess, week1MatchMultiple: psW1, week1Kpi: week1KpiOv, taperPct: psTaper });
      if (preRamp.length) {
        const anchorLabel = preAnchor === "match_this_season" ? (is ? "leikir í ár" : "this season's matches") : preAnchor === "srpe_only" ? (is ? "sRPE eingöngu" : "sRPE only") : (is ? "stöðu-viðmið" : "positional norm");
        const conf = preRamp[0].confidence === "high" ? (is ? "há" : "high") : preRamp[0].confidence === "moderate" ? (is ? "miðlungs" : "moderate") : (is ? "lítil" : "low");
        preseasonStart = {
          anchor: anchorLabel, confidence: conf,
          weeks: preRamp.map((w) => ({ weekIndex: w.weekIndex, multiple: w.multipleOfMatch, weeklyLoad: w.weeklyLoadTarget, perSession: w.perSessionLoad, srpe: w.sRpeAuTarget })),
          week1Kpi: (Object.keys(preRamp[0].byKpi) as WeeklyLoadMetricKey[]).filter((k) => k !== "totalPlayerLoad").map((k) => { const mv = pa.kpi[k]; return { label: { en: WEEKLY_LOAD_LABELS[k].en, is: WEEKLY_LOAD_LABELS[k].is }, value: preRamp[0].byKpi[k]!, unit: WEEKLY_LOAD_LABELS[k].unit, multiple: mv != null && mv > 0 ? Math.round((preRamp[0].byKpi[k]! / mv) * 100) / 100 : null }; }),
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
    const pv = buildPlannedVolume({ matchKpiAvg: teamKpiAvg(plan.players), numWeeks: blkWeeks, stepPct: blkStepEff, ...blkMesoDeload, matchesByWeek: pvMatchesByWeek });
    const plannedVolume = pv ? {
      weekVolumeMultiple: pv.weekVolumeMultiple,
      matches: pv.matches, weekTotalMultiple: pv.weekTotalMultiple,
      weekKpis: pv.weekKpis.map((v) => ({ label: v.label, unit: v.unit, matchValue: v.matchValue, multiple: v.multiple, weeklyValue: v.weeklyValue })),
      headKpis: pv.headKpis.map((k) => ({ label: { en: WEEKLY_LOAD_LABELS[k].en, is: WEEKLY_LOAD_LABELS[k].is }, unit: WEEKLY_LOAD_LABELS[k].unit })),
      meso: pv.meso.map((w) => ({ weekIndex: w.weekIndex, isDeload: w.isDeload, isLight: w.isLight, volMultiple: w.volMultiple, matches: w.matches, totalMultiple: w.totalMultiple, kpi: w.kpi.map((c) => ({ multiple: c.multiple, value: c.value })) })),
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
      teamName: plan.teamName, seasonYear: plan.seasonYear, generatedAt: new Date().toISOString(), isKinexon, teamUnit, fullMatchPl,
      tier: plan.tier ? { label: plan.tier.label, loadSource: plan.tier.loadSource, confidence: plan.tier.confidence } : null,
      phases: plan.phases.map((ph) => ({ label: ph.label, start: ph.start, end: ph.end, weeks: ph.weeks, matches: ph.matches, rationale: ph.rationale })),
      congested: plan.congested ?? [], baselines, mdDemand, teamAxes: plan.teamBaseline?.axes ?? null, blocks,
      block: calBlock, dayDrills: calBlock ? await dayDrillsFor(calBlock) : null, playerBlocks, mesoPlan, players, preseasonStart, plannedVolume, weeklyLoad,
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
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{is ? "Tímabilsskipulag" : "Periodization Hub"}</h1>
        {/* Data tier — every club gets a plan; hardware only adds detail + confidence (the unlock is on hover). */}
        {plan?.tier && !loading && (
          <span title={plan.tier.unlock ? `↑ ${is ? plan.tier.unlock.is : plan.tier.unlock.en}` : undefined} className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[#e2e0da] bg-white px-2.5 text-[12px] text-slate-600">
            <span className={`h-1.5 w-1.5 rounded-full ${String(plan.tier.confidence).toLowerCase() === "high" ? "bg-[#1c7a4a]" : String(plan.tier.confidence).toLowerCase() === "low" ? "bg-[#a83e28]" : "bg-[#de9328]"}`} />
            {is ? plan.tier.label.is : plan.tier.label.en} · {plan.tier.loadSource === "gps" ? "GPS" : plan.tier.loadSource === "srpe" ? "sRPE" : "—"} · {is ? "vissa" : "confidence"} {plan.tier.confidence}
          </span>
        )}
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

      {loading && <div className="mt-4 rounded-lg border bg-white p-6 text-center text-sm text-slate-500">{is ? "Set saman áætlun úr gögnum…" : "Assembling the plan from your data…"}</div>}
      {err && <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{err}</div>}

      {plan && !loading && (
        <div className="mt-4 space-y-4">
          {/* TABS — grouped: the PLAN (the macro→meso→micro spine, in order) and the INPUTS that feed it.
              The grouping + the workflow strip below make the order and the single-source propagation legible. */}
          {(() => {
            const planTabs = [
              { key: "season", en: "Macro Cycle", is: "Makró-lota", subEn: "the season", subIs: "tímabilið" },
              { key: "preseason", en: "Meso: Pre-season", is: "Mesó: Undirbúningur", subEn: "pre-season rules", subIs: "reglur undirbúnings" },
              { key: "plan", en: "Meso: In-season", is: "Mesó: Keppnistímabil", subEn: "in-season rules", subIs: "reglur keppnistímabils" },
              { key: "micro", en: "Micro Cycle", is: "Míkró-lota", subEn: "the week", subIs: "vikan" },
            ] as const;
            const inputTabs = [
              { key: "demands", en: "Team Demands", is: "Liðs-kröfur", subEn: "position baselines & team match unit", subIs: "stöðu-grunnlínur & liðs-leikviðmið" },
              { key: "players", en: "Players", is: "Leikmenn", subEn: "individualisation", subIs: "einstaklingsmiðun" },
              { key: "testing", en: "Testing", is: "Próf", subEn: "when to test", subIs: "hvenær á að mæla" },
            ] as const;
            const stepNo: Partial<Record<typeof tab, number>> = { season: 1, preseason: 2, plan: 2, micro: 3 };
            const tabBtn = (t: { key: typeof tab; en: string; is: string; subEn: string; subIs: string }) => {
              const on = tab === t.key; const no = stepNo[t.key];
              return (
                <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={on ? "page" : undefined} title={is ? t.subIs : t.subEn}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] ${on ? "bg-[#2740e6] font-semibold text-white" : "font-medium text-slate-600 hover:bg-slate-50"}`}>
                  {no != null && <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] ${on ? "bg-white/20 text-white" : "bg-[#f1f0ec] text-slate-600"}`}>{no}</span>}
                  {is ? t.is : t.en}
                </button>
              );
            };
            return (
              <nav aria-label={is ? "Hlutar tímabilsskipulags" : "Periodization sections"} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e2e0da] bg-white p-1.5">
                <div className="flex flex-wrap gap-1"
                  title={is ? "Vinnuferli: Makró → Mesó → Míkró. Breyting á einum stað flæðir sjálfkrafa í hinar." : "Workflow: Macro → Meso → Micro. A change in one place flows to the others automatically."}>
                  {planTabs.map(tabBtn)}
                </div>
                <div className="flex flex-wrap items-center gap-1 border-l border-[#e8e6e0] pl-3"
                  title={is ? "Inntak sem nærir öll þrepin. Liðs-kröfur eru grunnurinn." : "Inputs that feed every step. Team Demands is the foundation."}>
                  <span className="pr-1 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">{is ? "Inntak" : "Inputs"}</span>
                  {inputTabs.map(tabBtn)}
                </div>
              </nav>
            );
          })()}

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
              ? `Tímabilið byrjar á ${preWeeks ?? "~"} vikna undirbúnings-Uppsöfnun → Umbreytingu. Á keppnistímabili er áherslan að mestu Framkvæmd (keppni + vikuleg niðurtröppun); leikjagluggar/hlé fá endur-uppsöfnunar-lotu. Undirbúningslotur enda á niðurtröppunar-viku; á keppnistímabili er hún ekki föst, létt vika er val þjálfarans.${offClauseIS}`
              : `Your season opens with a ${preWeeks ?? "~"}-week pre-season Accumulation → Transmutation build-up. In-season the emphasis is mostly Realization (compete + a weekly taper); fixture gaps / breaks get a re-accumulation block. Pre-season blocks end in a deload week; in-season there's no fixed one, a light week is the coach's call.${offClauseEN}`;
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
            // In-season nothing is scheduled by default: say so instead of pointing at next year's pre-season.
            const seasonNoDl = !!curBlock?.inSeason && !nextDl?.inSeason;
            const dlDays = nextDl?.deloadWeekStart ? Math.round((utc(nextDl.deloadWeekStart) - utc(todayIso)) / DAY) : null;
            const blockEndIncl = (b: { end: string }) => isoAdd(b.end, -1);

            // Strength — the block scheme + the phase config + this week's fixture-density sub-phase
            const curScheme = curBlock ? strengthForBlockGoal(curBlock.goalKey, phaseOf(curBlock.start), coachStrengthRules?.block?.[`${curBlock.goalKey}:${phaseOf(curBlock.start)}`]) : null;
            const phaseKey = (curPhase?.key ?? "competitive") as SeasonPhaseKey;
            const onBreak = teamBreaks.some((b) => b.start_date <= todayIso && todayIso <= b.end_date);
            const congestedWeek = (plan.congested ?? []).some((c) => mondayOf(c.weekStart) === thisMon);
            const cfg = strengthConfigForPhase(phaseKey, { onBreak, congestedWeek }, coachStrengthRules?.phase?.[phaseKey]);
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
          {flowNote(is ? "Leikir · Kröfur (leik-eining)" : "Fixtures · Demands (match unit)", is ? "Mesó · Míkró · Undirbúningur" : "Meso · Micro · Pre-season")}

          {/* Estimated opener — KSÍ publishes late, so a season with no fixtures yet gets its first game
              estimated from last season (+1 year). Clearly flagged; replaced when real fixtures are added. */}
          {plan.fixturesEstimated && plan.estimatedOpener && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[#de9328]/40 bg-[#de9328]/10 px-3 py-2 text-[12px] text-[#7a5210]">
              <span className="rounded bg-[#de9328] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5a3a06]">{is ? "áætlað" : "estimated"}</span>
              <span>{is ? `Fyrsti leikur áætlaður ${shortDate(plan.estimatedOpener, is)} (út frá ${plan.seasonYear - 1}). KSÍ-plan ekki komið — leiðréttu með því að bæta við raunverulegum leikjum, þá hverfur áætlunin.` : `First game estimated ${shortDate(plan.estimatedOpener, is)} (from ${plan.seasonYear - 1}). KSÍ schedule not out yet — add the real fixtures to correct it and the estimate drops.`}</span>
            </div>
          )}

          {/* 0 — SETUP CHECKLIST: Macro is the one place a season is set up (frame → games → breaks). */}
          <MacroSetupChecklist is={is} frameSaved={!!savedFrame.preStart && !!savedFrame.seasonEnd} frameDirty={frameDirty}
            leagueGame={leagueGame?.date ?? null} estimatedOpener={plan.fixturesEstimated ? (plan.estimatedOpener ?? null) : null}
            friendlies={(plan.fixtureList ?? []).filter((f) => f.isFriendly && (!leagueGame || f.date < leagueGame.date)).length}
            breaks={teamBreaksFull.length} />

          {/* 1 — SEASON FRAME: the controls come first (Macro IS the control; everything below re-flows). */}
          <section className={card}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className={h2}>{is ? "Tímabilsrammi" : "Season frame"}</h2>
              {(() => {
                const nowY = new Date().getFullYear();
                const minY = nowY - 5, maxY = nowY + 1; // view up to five past seasons, or plan next year
                const vy = viewYear ?? plan.seasonYear;
                const btn = "flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-[15px] text-slate-600 hover:bg-slate-50 disabled:opacity-30";
                return (
                  <span className="inline-flex items-center gap-1.5" title={is ? "Veldu tímabil (ártal)" : "Choose the season (year)"}>
                    <button type="button" disabled={vy <= minY || loading} onClick={() => switchYear(vy - 1)} className={btn} aria-label={is ? "Fyrra tímabil" : "Previous season"}>‹</button>
                    <span className="min-w-[3ch] text-center text-[15px] font-bold tabular-nums text-slate-900">{vy}</span>
                    <button type="button" disabled={vy >= maxY || loading} onClick={() => switchYear(vy + 1)} className={btn} aria-label={is ? "Næsta tímabil" : "Next season"}>›</button>
                    {vy > nowY && <span className="rounded-full bg-[#7a5cc4]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7a5cc4]">{is ? "nýtt tímabil" : "new season"}</span>}
                  </span>
                );
              })()}
              <span className="text-[12px] text-slate-500">{is ? "Stilltu þetta fyrst — kortið, Mesó og Míkró endurreiknast." : "Set these first — the map, Meso and Micro all re-flow from them."}</span>
            </div>
            {/* Four date anchors — equal grid columns so they align and never stretch to a helper's width. */}
            <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-slate-700">{is ? "Undirbúningur hefst" : "Pre-season starts"}
                <input type="date" value={preStart} onChange={(e) => setPreStart(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-2.5 text-[13px] font-medium text-slate-900" />
              </label>
              {(() => {
                // The first league game ends the pre-season. Editable until it's played; saved with the frame
                // (written to the fixture list, the old date moved). "Estimated" when only last season's date is known.
                const played = !!leagueGame && leagueGame.date < new Date().toISOString().slice(0, 10);
                const est = !leagueGame && plan.fixturesEstimated ? plan.estimatedOpener ?? null : null;
                return (
                  <label className="flex min-w-0 flex-col gap-1 text-[12px] font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">{is ? "Fyrsti deildarleikur" : "First league game"}{est && leagueDraft == null && <span className="rounded bg-[#de9328]/15 px-1 text-[10px] font-bold uppercase text-[#7a5210]">{is ? "áætlað" : "estimated"}</span>}</span>
                    <input type="date" value={leagueDraft ?? leagueGame?.date ?? ""} disabled={played} onChange={(e) => setLeagueDraft(e.target.value)}
                      title={played ? (is ? "Leikinn — breyttu í leikjalistanum" : "Played — change it in the games list") : est ? (is ? `Áætlaður ${shortDate(est, is)} út frá síðasta tímabili` : `Estimated ${shortDate(est, is)} from last season`) : undefined}
                      className="h-10 w-full rounded-lg border border-slate-300 px-2.5 text-[13px] font-medium text-slate-900 disabled:bg-slate-50 disabled:text-slate-500" />
                  </label>
                );
              })()}
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
            <p className="mt-2 text-[11px] leading-snug text-slate-400"><b className="font-semibold text-slate-500">{is ? "Tímabili lýkur" : "Season ends"}</b> {is ? "= lok keppninnar (→ off-season). Undirbúningur endar við fyrsta deildarleikinn (æfingaleikir teljast ekki með)." : "= end of competition (→ off-season). Pre-season ends at the first league game (friendlies don't count)."}</p>
            {/* Block length + the one Save on their own row. */}
            <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-slate-700">{is ? "Lotulengd" : "Block length"}</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-300" role="group">
                  {([4, 5, 6] as const).map((c) => (
                    <button key={c} onClick={() => changeCadence(c)} aria-pressed={cadence === c} className={`h-10 min-w-16 px-3 text-[13px] font-semibold ${cadence === c ? "bg-[#2740e6] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{is ? `${c} vikur` : `${c} weeks`}</button>
                  ))}
                </div>
              </div>
              <span className="pb-2.5 text-[12px] text-slate-600">{is ? `Undirbúningur: ${cadence - 1} uppbyggingarvikur + 1 niðurtröppun · keppni: engin föst` : `Pre-season: ${cadence - 1} build weeks + 1 deload · in-season: none fixed`}</span>
              <div className="ml-auto flex items-center gap-2">
                {frameDirty && <span className="rounded-full bg-[#de9328]/15 px-2 py-0.5 text-[11px] font-semibold text-[#7a5210]">{is ? "Óvistaðar breytingar" : "Unsaved changes"}</span>}
                {!frameDirty && saved && <span className="text-[12px] font-semibold text-[#1c7a4a]">{is ? "✓ Vistað — Mesó og Míkró lesa þetta" : "✓ Saved — Meso and Micro read this"}</span>}
                <button onClick={() => void saveFrame()} disabled={frameSaving} className="h-10 rounded-lg bg-[#2740e6] px-4 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-60">{frameSaving ? (is ? "Vista…" : "Saving…") : (is ? "Vista" : "Save")}</button>
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

          {/* 2 — GAMES + BREAKS: the fixture list and the breaks live here (Meso + Micro only read them). */}
          <MacroFixturesCard is={is} seasonYear={plan.seasonYear} fixtures={plan.fixtureList ?? []} upcoming={plan.upcomingFixtureList ?? []}
            nextSeasonYear={plan.nextSeasonYear ?? null} todayIso={todayIso}
            onAdd={(date, kind, opponent) => writeFixture(date, "upsert", { isFriendly: kind === "friendly", opponent: opponent || undefined })}
            onRemove={(date) => writeFixture(date, "delete")}
            onOpenYear={switchYear}
            importSlot={isBasketball ? <KkiFixturesImport onImported={() => void load(preStart, seasonEnd)} /> : undefined} />
          <MacroBreaksCard is={is} breaks={teamBreaksFull} onAdd={addBreak} onRemove={removeBreak}
            hasWindows={["football", "basketball"].includes(String(teamSport ?? "").toLowerCase())} />

          {!plan.phases.some((p) => p.key === "preseason" && p.weeks > 0) && (
            <div className="rounded-lg border border-dashed border-[#7a5cc4]/40 bg-[#7a5cc4]/5 px-3 py-2 text-[12px] text-[#4a3a7a]">
              {is
                ? "Enginn undirbúningsgluggi fannst. Settu upphaf og lok undirbúnings hér að ofan til að skilgreina hann — það opnar byrjunar-álag + rampann og mælinga-áætlunina á réttum vikum (og lætur Week setup þekkja pre-season vikur sjálfkrafa)."
                : "No pre-season window found. Set the pre-season start & end above to define it — it unlocks the starting-load ramp and the testing schedule on the right weeks (and lets Week setup recognise pre-season weeks automatically)."}
            </div>
          )}

          {plan.phases.length === 0 || blocks.length === 0 ? (
            <section className={card}>
              <p className="text-[13px] font-semibold text-slate-800">{is ? `Ekkert tímabil enn fyrir ${viewYear ?? plan.seasonYear}.` : `No season yet for ${viewYear ?? plan.seasonYear}.`}</p>
              <p className="mt-1 text-[13px] text-slate-600">{is ? "Áætlunin er leikja-drifin: bættu við leikjum tímabilsins (fyrsti keppnisleikurinn ræður hvar undirbúningur endar og keppni hefst). Akkerin ein og sér búa ekki til fasa. Settu fyrsta deildarleikinn í rammann eða í „Leikir“ hér að ofan og vistaðu." : "The plan is fixtures-driven: add this season's fixtures (the first league game sets where pre-season ends and competition begins). The dates alone don't create phases. Set the first league game in the frame or under \"Games\" above, then save."}</p>
            </section>
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
                <div className="text-[12px] font-semibold text-slate-500">{curBlock?.inSeason ? (is ? "Næsta létta vika" : "Next light week") : (is ? "Næsta niðurtröppun" : "Next deload")}</div>
                <div className="mt-0.5 text-[20px] font-bold text-slate-900">{seasonNoDl ? (is ? "Engin föst" : "None set") : nextDl?.deloadWeekStart ? `${is ? "Vika" : "Week of"} ${shortDate(nextDl.deloadWeekStart, is)}` : "—"}</div>
                <div className="text-[13px] text-slate-600">{seasonNoDl ? (curBlock?.deloadNow ? (is ? "Þreytumerki: íhugaðu létta viku" : "Fatigue signal: consider a light week") : (is ? "Þú velur hana ef þarf" : "Your call, when needed")) : <>{dlDays == null ? "" : dlDays <= 0 ? (is ? "Þessa viku" : "This week") : (is ? `Eftir ${dlDays} daga` : `In ${dlDays} days`)}{nextDl?.deloadNow && !nextDl.inSeason ? (is ? " · færð framar (álag)" : " · pulled forward (load)") : ""}</>}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Næst" : "Next up"}</div>
                <div className="mt-0.5 text-[20px] font-bold text-slate-900">{nextPhase ? `${is ? nextPhase.label.is : nextPhase.label.en} ${shortDate(nextPhase.start, is)}` : "—"}</div>
                <div className="text-[13px] text-slate-600">{nextPhase ? (is ? `${nextPhase.weeks} vikur` : `${nextPhase.weeks} weeks`) : ""}</div>
              </div>
            </div>
          </section>

          {/* 3 — THE SEASON MAP: one shared date axis, every lane lines up. Expand = break out to the full
              viewport width (it's short on WIDTH, not height) so the lanes widen and read clearly. */}
          <section className={`${card} ${mapWide ? "relative left-1/2 w-[94vw] max-w-none -translate-x-1/2 shadow-xl" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className={h2}>{is ? "Tímabilskortið" : "The season map"}</h2>
              <span className="text-[12px] text-slate-500">{is ? "Allar línur deila sama tímaás — lestu lóðrétt til að sjá hvað gerist sömu vikuna." : "Every lane shares one time axis — read down a column to see what happens that week."}</span>
              <button type="button" onClick={() => setMapWide((v) => !v)} className="ml-auto rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-slate-50" aria-pressed={mapWide}>{mapWide ? (is ? "Minnka ↙" : "Collapse ↙") : (is ? "Stækka ↗" : "Expand ↗")}</button>
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
                          title={`${shortDate(b.start, is)}–${shortDate(blockEndIncl(b), is)} · ${goalName(g)} · ${is ? b.phase.is : b.phase.en} · ${b.inSeason ? (is ? "létt vika" : "light week") : (is ? "niðurtröppunarvika" : "deload week")} ${b.deloadWeekStart ? shortDate(b.deloadWeekStart, is) : "—"}${b.deloadNow ? (b.inSeason ? (is ? " (þreytumerki)" : " (fatigue signal)") : (is ? " (færð framar)" : " (pulled forward)")) : ""} — ${is ? "smelltu til að breyta markmiði + lengd" : "click to edit goal + length"}`}>
                          <div className={`relative flex h-full items-center overflow-hidden rounded-md px-1.5 ${selected ? "ring-2 ring-[#14181c] ring-offset-1" : ""}`} style={{ background: GC[g] }}>
                            <span className={`relative z-[1] truncate text-[12px] font-semibold ${g === "deload" ? "text-[#5A3A06]" : "text-white"}`}>{goalName(g)}</span>
                            {dl != null && g !== "deload" && (
                              <div className="absolute inset-y-0 border-l-2 border-white" style={{ left: `${dl}%`, width: `${dlW}%`, background: b.deloadNow && !b.inSeason ? "repeating-linear-gradient(45deg,#DE9328,#DE9328 3px,#F6D29A 3px,#F6D29A 6px)" : "#DE9328" }} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>)}

                {/* deload weeks — one amber week-band per block's deload on the shared axis (hatched when pulled
                    forward by fatigue). Mirrors the thin stripe inside the Blocks lane, but readable at a glance. */}
                {(() => {
                  const dls = blocks.filter((b) => b.deloadWeekStart && utc(b.deloadWeekStart!) >= d0 && utc(b.deloadWeekStart!) < d1);
                  if (!dls.length) return null;
                  return lane(is ? "Niðurtröppun" : "Deload", is ? "léttari vika" : "lighter week",
                    <div className="relative h-5">
                      {dls.map((b) => {
                        const l = Math.max(0, pctOf(b.deloadWeekStart!)), r = Math.min(100, pctOf(isoAdd(b.deloadWeekStart!, 7)));
                        if (r <= l) return null;
                        return (
                          <div key={`${b.start}-dl`} className="absolute inset-y-0 px-px" style={{ left: `${l}%`, width: `${r - l}%` }}
                            title={`${b.inSeason ? (is ? "Létt vika" : "Light week") : (is ? "Niðurtröppunarvika" : "Deload week")} ${shortDate(b.deloadWeekStart!, is)}${b.deloadNow && !b.inSeason ? (is ? " · færð framar (álag)" : " · pulled forward (load)") : ""}`}>
                            <div className="h-full rounded-md" style={{ background: b.deloadNow && !b.inSeason ? "repeating-linear-gradient(45deg,#DE9328,#DE9328 3px,#F6D29A 3px,#F6D29A 6px)" : "#DE9328" }} />
                          </div>
                        );
                      })}
                    </div>);
                })()}

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

                {/* team breaks (incl. international windows added as breaks) — a slate band on the timeline; each
                    becomes its own re-load block in the Blocks lane, so this shows WHERE that boundary comes from. */}
                {(() => {
                  const breaksInSpan = teamBreaksFull.filter((b) => utc(b.end_date) >= d0 && utc(b.start_date) < d1);
                  if (!breaksInSpan.length) return null;
                  return lane(is ? "Frí / hlé" : "Breaks", is ? "landsleikjahlé / hvíld" : "international / rest",
                    <div className="relative h-6">
                      {breaksInSpan.map((b) => {
                        const l = Math.max(0, pctOf(b.start_date)), r = Math.min(100, pctOf(isoAdd(b.end_date, 1)));
                        if (r <= l) return null;
                        return (
                          <div key={b.id} className="absolute inset-y-0 px-px" style={{ left: `${l}%`, width: `${r - l}%` }}
                            title={`${shortDate(b.start_date, is)}–${shortDate(b.end_date, is)}${b.label ? ` · ${b.label}` : ""} — ${is ? "frí / endurhleðslu-lota" : "break / re-load block"}`}>
                            <div className="flex h-full items-center overflow-hidden rounded-md px-1.5" style={{ background: "#94A3B8" }}>
                              <span className="truncate text-[11px] font-semibold text-white">{is ? "Frí" : "Break"}{b.label ? ` · ${b.label}` : ""}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>);
                })()}

                {/* training camps — concentrated-load periods as a labelled amber band (its own lane so it never
                    reads as a block's deload stripe) */}
                {(() => {
                  const campsInSpan = camps.filter((c) => utc(c.end_date) >= d0 && utc(c.start_date) < d1);
                  if (!campsInSpan.length) return null;
                  return lane(is ? "Æfingaferð" : "Camp", is ? "álagslota" : "loading block",
                    <div className="relative h-6">
                      {campsInSpan.map((c) => {
                        const l = Math.max(0, pctOf(c.start_date)), r = Math.min(100, pctOf(isoAdd(c.end_date, 1)));
                        if (r <= l) return null;
                        return (
                          <div key={c.id} className="absolute inset-y-0 px-px" style={{ left: `${l}%`, width: `${r - l}%` }}
                            title={`${shortDate(c.start_date, is)}–${shortDate(c.end_date, is)} · +${c.load_pct}%${c.two_a_day ? (is ? " · tvíæfingar" : " · two-a-days") : ""}${c.label ? ` · ${c.label}` : ""}`}>
                            <div className="flex h-full items-center overflow-hidden rounded-md px-1.5" style={{ background: "#DE9328" }}>
                              <span className="truncate text-[11px] font-semibold text-[#5A3A06]">✈ +{c.load_pct}%{c.two_a_day ? (is ? " 2æf" : " 2×") : ""}{c.label ? ` · ${c.label}` : ""}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>);
                })()}

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
                      const bt = testsForBlock(b.goalKey, { hasVald, hasGps, aerobicMode: aerobicTest });
                      if (!bt.protocols.length) return null;
                      return <span key={`r${b.index}`} title={`${is ? "Ráðlagt" : "Recommended"} · ${shortDate(b.start, is)}\n${is ? bt.when.is : bt.when.en}\n${bt.protocols.map((p) => (is ? p.name.is : p.name.en)).join(", ")}`} className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border-2 border-[#1C7A4A] bg-white" style={{ left: `${pctOf(b.start) + (0.5 / spanDays) * 100}%` }} />;
                    })}
                    {schedClusters.map((c, ci) => (
                      <span key={`s${ci}`} title={c.days.map((d) => `${shortDate(d.date, is)}: ${d.keys.map((k) => (is ? testShortName(k, aerobicTest).is : testShortName(k, aerobicTest).en)).join(", ")}`).join("\n")} className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1" style={{ left: `${c.pct + (0.5 / spanDays) * 100}%` }}>
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
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: "#DE9328" }} />{is ? "Niðurtröppun / létt vika" : "Deload / light week"}</span>
              {teamBreaksFull.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: "#94A3B8" }} />{is ? "Frí / hlé" : "Break"}</span>}
              {camps.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-3.5 items-center rounded-[3px] px-1 text-[9px] font-bold text-[#5A3A06]" style={{ background: "#DE9328" }}>✈</span>{is ? "Æfingaferð" : "Training camp"}</span>}
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
            // Next block in the SAME phase — the merge target (span-preserving, so later blocks don't move).
            const ebIdx = blocks.findIndex((b) => b.start === eb.start);
            const nextB = ebIdx >= 0 && blocks[ebIdx + 1] && phaseOf(blocks[ebIdx + 1].start) === phaseOf(eb.start) ? blocks[ebIdx + 1] : null;
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
                    <select value={curLenOv ?? ""} onChange={(e) => setBlockLength(eb.start, e.target.value === "" ? null : Number(e.target.value))} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[13px]">
                      <option value="">{is ? `Sjálfgefið (${cadence}v)` : `Auto (${cadence}w)`}</option>
                      {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} {is ? "vikur" : "weeks"}</option>)}
                    </select>
                  </label>
                  {curLenOv != null && <button type="button" onClick={() => setBlockLength(eb.start, null)} className="text-[12px] text-slate-500 hover:underline">{is ? "Núllstilla lengd" : "Reset length"}</button>}
                  <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">{eb.inSeason ? (is ? "Létt vika" : "Light week") : (is ? "Niðurtröppun" : "Deload")}
                    <select value={curDeload} onChange={(e) => setBlockDeload(eb.start, e.target.value === "" ? null : e.target.value)} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[13px]">
                      <option value="">{eb.inSeason ? (is ? "Engin (sjálfgefið)" : "None (default)") : (is ? "Sjálfgefið (snjallt)" : "Auto (smart)")}</option>
                      {blkMondays.map((m, wi) => <option key={m} value={m}>{is ? `Vika ${wi + 1} · ${shortDate(m, is)}` : `Week ${wi + 1} · ${shortDate(m, is)}`}</option>)}
                    </select>
                  </label>
                  {curDeload !== "" && <button type="button" onClick={() => setBlockDeload(eb.start, null)} className="text-[12px] text-slate-500 hover:underline">{is ? "Núllstilla" : "Reset"}</button>}
                  <span className="text-[11px] text-slate-400">{is ? "Breyting endurflæðir Mesó, Míkró og kortið." : "Changes re-flow Meso, Micro and the map."}</span>
                </div>
                {eb.inSeason && <p className="mt-1.5 text-[11px] text-slate-500">{is ? IN_SEASON_DELOAD_NOTE.is : IN_SEASON_DELOAD_NOTE.en}</p>}
                {/* Structure — SPLIT (add a block) / MERGE (remove one). Both span-preserving: the edited span's
                    total weeks are unchanged, so no later block moves → no other override shifts or orphans. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Uppbygging" : "Structure"}</span>
                  <button type="button" disabled={eb.weeks < 4} onClick={() => splitBlock(eb)} className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${eb.weeks < 4 ? "cursor-not-allowed border-slate-200 text-slate-300" : "border-[#2740e6]/40 text-[#2740e6] hover:bg-[#2740e6]/5"}`}>{is ? "Skipta í tvennt" : "Split in two"}</button>
                  <button type="button" disabled={!nextB} onClick={() => nextB && mergeNextBlock(eb, nextB)} className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold ${!nextB ? "cursor-not-allowed border-slate-200 text-slate-300" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>{is ? "Sameina við næstu" : "Merge with next"}</button>
                  <span className="text-[11px] text-slate-400">{is ? "skipta = bæta við lotu · sameina = fjarlægja lotu" : "split = add a block · merge = remove a block"}</span>
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
                <li>{is ? "Niðurtröppun er ekki fjórða lotan — í undirbúningi er hún lokavika lotunnar (gula rákin), færð framar ef álag rýkur upp eða viðbragð lækkar. Á keppnistímabili er hún ekki föst: minnkunin fyrir hvern leik sveiflar álaginu og létt vika (20% minna magn, sama ákefð) er þitt val." : "Deload isn't a fourth block — in pre-season it's the block's last week (the amber stripe), pulled forward if load spikes or readiness drifts. In-season it isn't fixed: the taper before each match varies the load, and a light week (20% less volume, same intensity) is your call."}</li>
              </ul>
            </section>

            <section className={`${card} min-w-0 flex-[1_1_420px]`}>
              <h2 className={h2}>{is ? "Styrkur núna" : "Strength right now"}</h2>
              <p className="mt-1 text-[13px] font-semibold text-slate-900">{is ? cfg.verdict.is : cfg.verdict.en}</p>
              <p className="mt-0.5 text-[13px] text-slate-600">{is ? cfg.intensity.is : cfg.intensity.en}</p>
              {cfg.flags.map((f, i) => <p key={i} className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium text-amber-900">⚑ {is ? f.is : f.en}</p>)}
              <div className="mt-3 space-y-2">
                {nowSub && (
                  <div className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: `${SUB_COLOR[nowSub.key]}`, background: `${SUB_COLOR[nowSub.key]}22` }}>
                    <div className="text-[12px] font-semibold text-slate-600">{is ? "Leikjaþéttleiki · þessi vika" : "Fixture density · this week"}</div>
                    <div className="text-[14px] font-bold text-slate-900">{is ? nowSub.label.is : nowSub.label.en}</div>
                    <div className="text-[13px] text-slate-600">{is ? nowSub.rationale.is : nowSub.rationale.en}</div>
                    <div className="text-[13px] text-slate-600">{is ? nowSub.dose.is : nowSub.dose.en}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500"><CiteRefs text={nowSub.cite} is={is} /></div>
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
                    <div className="mt-0.5 text-[11px] text-slate-500"><CiteRefs text={curScheme.cite} is={is} /></div>
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
              <p className="mt-2 text-[11px] text-slate-500"><CiteRefs text={cfg.cite} is={is} />. {is ? "Lýsandi / þjálfaramat — micro setur skammtinn á MD-dagana; hreyfir aldrei readiness-litinn." : "Descriptive / coach's call — micro places the dose on MD-days; never the readiness colour."}</p>
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
                <p className="mt-1.5 text-[12px] text-slate-500">Issurin 2010 (block periodisation) · Martín-García 2018 + Owen 2017 (taper/realization into fixtures) · Teixeira 2021 (weekly load monitoring; the deload rule is MicroPulse’s) · Impellizzeri 2020 (ACWR disputed) · Malone 2015 + Fessi 2016 + Moalla 2021 (in-season: small between-block change, ~20% taper weeks; observational) · Oliveira 2019/2021 (in-season weekly load; pre-season = accumulation is MicroPulse’s block choice) · Buchheit; Mann/Weakley; Claudino; Bourne (testing). {is ? "Lýsandi — aldrei readiness-liturinn." : "Descriptive — never the readiness colour."}</p>
              </details>
            </section>
          )}

          {/* PERIOD INPUTS — below the season map (the map is the main view). International breaks + training
              camps are added here and show on the map's Breaks / Camp lanes. Always available (outside the
              empty/non-empty branch), so they can be set even for a season with no fixtures yet. */}
          {/* LANDSLEIKJAHLÉ — the FIFA/FIBA international windows for this team's sport+gender. The coach sets
              the ACTUAL break length (breaks vary by team) and adds it → a real team_break the macro/meso read. */}
          {(() => {
            const s = String(teamSport ?? "").toLowerCase();
            if (s !== "football" && s !== "basketball") return null; // wait for config; skip general/PT teams
            const windows = upcomingInternationalBreaks({ sport: teamSport, gender: teamGender, fromIso: todayIso });
            if (!windows.length) return null;
            const shown = windows.slice(0, 8);
            const overlaps = (b: { start_date: string; end_date: string }, w: IntlBreak) => b.start_date <= w.end && b.end_date >= w.start;
            const bodyColor = (body: string) => (body === "FIBA" ? "#7a5cc4" : "#2740e6");
            return (
              <section className={card}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className={h2}>{is ? "Landsleikjahlé" : "International breaks"}</h2>
                  <span className="text-[12px] text-slate-500">{is ? "A-landsliðsgluggar (FIFA/FIBA) — þú ákveður lengd fríssins" : "A-team windows (FIFA/FIBA) — you set the break length"}</span>
                </div>
                <p className="mt-1 text-[12px] text-slate-500">{is ? "Hlé er mislangt milli liða (sumir fara til landsliðs, aðrir æfa). Stilltu dagsetningarnar og bættu við — þá verður frí í áætluninni (Mesó fær endurhleðslu-lotu, dagarnir merktir frí)." : "Breaks vary by team (some leave for national duty, others train). Set the dates and add it — it becomes a break in the plan (Meso gets a re-load block, the days are marked off)."}</p>
                <div className="mt-3 space-y-1.5">
                  {shown.map((w) => {
                    const key = intlBreakKey(w);
                    const covered = teamBreaksFull.find((b) => overlaps(b, w));
                    const draft = breakEdits[key] ?? { start: w.start, end: w.end };
                    const invalid = draft.end < draft.start;
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: bodyColor(w.body) }}>{w.body}</span>
                        <span className="text-[12px] text-slate-600">{shortDate(w.start, is)}–{shortDate(w.end, is)} · {w.days} {is ? "d" : "d"}{w.kind === "tournament" ? ` · ${is ? w.label.is : w.label.en}` : ""}</span>
                        {covered ? (
                          <div className="ml-auto flex items-center gap-2">
                            <span className="rounded-full bg-[#1c7a4a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#1c7a4a]">{is ? "Frí" : "Break"} {shortDate(covered.start_date, is)}–{shortDate(covered.end_date, is)}</span>
                            <button type="button" onClick={() => removeBreak(covered.id)} title={is ? "Fjarlægja frí" : "Remove break"} aria-label={is ? "Fjarlægja frí" : "Remove break"} className="rounded px-1.5 text-[13px] text-slate-400 hover:bg-[#a83e28]/10 hover:text-[#a83e28]">✕</button>
                          </div>
                        ) : (
                          <div className="ml-auto flex flex-wrap items-center gap-1.5">
                            <input type="date" value={draft.start} onChange={(e) => setBreakEdits((p) => ({ ...p, [key]: { ...draft, start: e.target.value } }))} className="h-8 rounded border border-slate-300 px-1.5 text-[12px]" />
                            <span className="text-slate-400">–</span>
                            <input type="date" value={draft.end} onChange={(e) => setBreakEdits((p) => ({ ...p, [key]: { ...draft, end: e.target.value } }))} className="h-8 rounded border border-slate-300 px-1.5 text-[12px]" />
                            <button type="button" disabled={invalid} onClick={() => addBreak(draft.start, draft.end, is ? w.label.is : w.label.en)} className={`h-8 rounded-lg px-2.5 text-[12px] font-semibold ${invalid ? "cursor-not-allowed bg-slate-200 text-slate-400" : "bg-[#2740e6] text-white hover:brightness-110"}`}>{is ? "Bæta við sem frí" : "Add as break"}</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{is ? "A-landsliðsgluggar, ekki staðfest deildarhlé — athugaðu hjá KSÍ/deildinni. Eigin hlé má líka bæta við handvirkt." : "A-team windows, not confirmed league pauses — check with the federation/league. Custom breaks can be added manually too."}</p>
              </section>
            );
          })()}

          {/* ÆFINGAFERÐ — training camps: concentrated-load periods. Add dates + a load bump + 2-a-days; the
              calendar bumps those training days and (on 2-a-days) turns rest days into extra sessions. */}
          <section className={card}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className={h2}>{is ? "Æfingaferð" : "Training camp"}</h2>
              <span className="text-[12px] text-slate-500">{is ? "álagslota — hækkar álagið + aukaæfingar þá daga" : "a loading block — bumps load + adds sessions those days"}</span>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">{is ? "Merkir dagana sem æfingar, hækkar álagið um valið hlutfall, og (með tvíæfingum) breytir hvíldardögum ferðarinnar í aukaæfingar. Mesó/Míkró og dagatalið endurspegla það." : "Marks the days as training, bumps the load by the chosen %, and (with two-a-days) turns the camp's rest days into extra sessions. Meso/Micro and the calendar reflect it."}</p>
            {camps.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {camps.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[#de9328]/30 bg-[#de9328]/5 px-3 py-2">
                    <span className="text-[13px] font-semibold text-slate-800">{shortDate(c.start_date, is)}–{shortDate(c.end_date, is)}</span>
                    {c.label && <span className="text-[12px] text-slate-500">{c.label}</span>}
                    <label className="flex items-center gap-1 text-[12px] font-medium text-slate-600">+{is ? "álag" : "load"}
                      <select value={c.load_pct} onChange={(e) => patchCamp(c.id, { loadPct: Number(e.target.value) })} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 tabular-nums">
                        {[0, 5, 10, 15, 20, 25, 30, 40].map((n) => <option key={n} value={n}>{n}%</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
                      <input type="checkbox" checked={c.two_a_day} onChange={(e) => patchCamp(c.id, { twoADay: e.target.checked })} /> {is ? "tvíæfingar" : "two-a-days"}
                    </label>
                    <button type="button" onClick={() => removeCamp(c.id)} title={is ? "Fjarlægja ferð" : "Remove camp"} aria-label={is ? "Fjarlægja ferð" : "Remove camp"} className="ml-auto rounded px-1.5 text-[13px] text-slate-400 hover:bg-[#a83e28]/10 hover:text-[#a83e28]">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">{is ? "Frá" : "From"}
                <input type="date" value={campDraft.start} onChange={(e) => setCampDraft((p) => ({ ...p, start: e.target.value }))} className="h-9 rounded border border-slate-300 px-2 text-[13px]" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">{is ? "Til" : "To"}
                <input type="date" value={campDraft.end} onChange={(e) => setCampDraft((p) => ({ ...p, end: e.target.value }))} className="h-9 rounded border border-slate-300 px-2 text-[13px]" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">{is ? "Heiti (valfrj.)" : "Label (opt.)"}
                <input type="text" value={campDraft.label} placeholder={is ? "t.d. Spánn" : "e.g. Spain"} onChange={(e) => setCampDraft((p) => ({ ...p, label: e.target.value }))} className="h-9 w-36 rounded border border-slate-300 px-2 text-[13px]" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">+{is ? "álag" : "load"}
                <select value={campDraft.loadPct} onChange={(e) => setCampDraft((p) => ({ ...p, loadPct: Number(e.target.value) }))} className="h-9 rounded border border-slate-300 bg-white px-1.5 text-[13px] tabular-nums">
                  {[0, 5, 10, 15, 20, 25, 30, 40].map((n) => <option key={n} value={n}>{n}%</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-[12px] font-medium text-slate-600">
                <input type="checkbox" checked={campDraft.twoADay} onChange={(e) => setCampDraft((p) => ({ ...p, twoADay: e.target.checked }))} /> {is ? "tvíæfingar" : "two-a-days"}
              </label>
              <button type="button" disabled={!campDraft.start || !campDraft.end || campDraft.end < campDraft.start}
                onClick={() => { addCamp(campDraft); setCampDraft({ start: "", end: "", label: "", loadPct: 15, twoADay: true }); }}
                className={`h-9 rounded-lg px-3 text-[13px] font-semibold ${!campDraft.start || !campDraft.end || campDraft.end < campDraft.start ? "cursor-not-allowed bg-slate-200 text-slate-400" : "bg-[#2740e6] text-white hover:brightness-110"}`}>{is ? "Bæta við ferð" : "Add camp"}</button>
            </div>
          </section>

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
            // The whole pre-season comes from ONE pure builder (periodization/preseasonProposal) — the same
            // function the server-side builders use — fed the coach's live settings and saved days.
            // Built at component level (preInput / preProp) — the Micro tab seeds its week from the same plan.
            const propInput = preInput!;
            const prop = preProp!;
            const tka = prop.engine.anchor.kpi, hasOwnKpi = prop.engine.anchor.hasOwnKpi;
            const ramp = prop.engine.ramp;
            const usesAu = ramp.every((w) => w.weeklyLoadTarget == null);
            const unitLabel = usesAu ? "AU" : "PL";
            const primary = (w: PreseasonWeekTarget) => (usesAu ? w.sRpeAuTarget : w.weeklyLoadTarget) ?? 0;
            const fmtv = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
            // All pre-season fixtures are friendlies by definition (a competitive game ends pre-season).
            const preFixtures = prop.engine.fixtures;
            // The coach's saved days (week_plans) are already overlaid: a saved OFF forces rest, a saved TRAIN a session.
            const cal = prop.engine.cal;
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
                // Selected day carries the chosen stimulus (or off); the others keep their rendered label.
                days: cw.days.map((d, i) => planDayFromCal(d, cw.weekStart, i, i === di ? { rest: off, label: CALTYPE_FOCUS_LABEL[target as CalType] ?? "" } : undefined)),
              }];
              setPreDaySave("saving"); setPreDayPick(null);
              (async () => { try { const r = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ applyWeekSetup: payload }) }); setPreDaySave(r.ok ? "saved" : "err"); } catch { setPreDaySave("err"); } })();
            };
            // Move / remove / restore the assumed game in a week (no game entered there). The week re-flows around
            // the new game day (its saved days are not read) and is saved whole to week_plans — the same write as a
            // day edit — so Week Setup shows the week the page shows.
            const moveAssumed = (cw: typeof cal.weeks[number], val: number | null | undefined) => moveAssumedWeek(propInput, cw.weekStart, val);
            const matchLoadUnit = tka.totalPlayerLoad ?? plan.matchLoad; // PL match unit for the budget
            const tests = prop.engine.tests;
            const typeColor: Record<string, string> = { mechanical: "#A83E28", locomotive: "#15603A", mixed: "#1B2DA8", activation: "#475569", topup: "#0E5E6E", match: "#7A4A06", rest: "#64748B" };
            const tint: Record<string, string> = { mechanical: "#F6E7E1", locomotive: "#E4F1EA", mixed: "#E7EAFB", activation: "#EFEFEF", topup: "#E2F0F2", match: "#FBEFDD", rest: "#F8FAFC" };
            const typeName = (t: string): string => t === "mechanical" ? (is ? "Mekanískt" : "Mechanical") : t === "locomotive" ? (is ? "Hlaup" : "Locomotive") : t === "mixed" ? (is ? "Blandað" : "Mixed") : t === "activation" ? (is ? "Virkjun" : "Activation") : t === "topup" ? (is ? "Áfylling" : "Top-up") : t === "match" ? (is ? "Leikur" : "Match") : (is ? "Frí" : "Off");
            const goalWord = (g: BlockGoalKey) => (is ? BLOCK_GOAL_LABEL[g].is : BLOCK_GOAL_LABEL[g].en);
            const dows = is ? ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const kpiKeys = ramp.length ? (Object.keys(ramp[0].byKpi) as WeeklyLoadMetricKey[]).filter((k) => k !== "totalPlayerLoad" && ramp.some((w) => w.byKpi[k] != null)) : [];
            // The pre-season MESO CYCLES: the same slicing the strength delivery reads (the row's cadence + per-block
            // lengths, index-keyed so a resize never orphans a later one). The first block is the base (it flexes);
            // the coach edits the ones after it.
            const preMeso = prop.engine.meso;
            const preBlocks = prop.engine.blocks;
            const blockEndExcl = (b: { end: string }) => b.end; // exclusive
            const weeksBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / (7 * 86_400_000)));
            // The strength each week is sent with: the block's goal → scheme, heavy reps a day, the method (lota 3).
            const strengthWeeks = preseasonStrengthWeeks({ weeks: prop.weeks, blocks: prop.blocks, coachRules: coachStrengthRules, mdStructures: teamPalette?.mdStructures ?? null, noMatchWeek: teamPalette?.noMatchWeek ?? null });
            const seqTotal = preBlocks.reduce((s, b) => s + weeksBetween(b.start, blockEndExcl(b)), 0);
            return (<div className="space-y-4">
          {/* The pre-season at a glance: verdict → 4 facts → week-by-week load + meso cycles (its own provenance chip). */}
          <PreseasonReadsFrom is={is} prop={prop} opener={plan.nextFirstFixture ?? null} openerEstimated={!!plan.nextFirstFixtureEstimated}
            onOpenMacro={() => setTab("season")} baseBlocks={prop.engine.meso.base.length} />

          {/* Pre-season SETUP — one card: controls, the meso-cycle sequence (built backwards from the opener),
              and the research "why" behind a toggle (explainability: jargon off the primary view). */}
          {(() => {
            // Backwards editor state (upcoming pre-season only): the coach-controlled tail blocks nearest the
            // game; the base block flexes. Edits persist the derived blockWeeks + preMesoTail to the next row.
            const tailVals = preMeso.tail;
            const baseLen = preMeso.base.reduce((s, n) => s + n, 0);
            const roomForMore = (baseLen - 3) >= PRE_MIN_BLOCK; // adding a 3-wk block keeps base ≥ 2
            const setTailLen = (ti: number, v: number) => { const t = [...tailVals]; t[ti] = v; persistMesoTailT(t, preWeeks, preCadenceT, preYear, upcomingYear); };
            const removeTail = (ti: number) => persistMesoTailT(tailVals.filter((_, i) => i !== ti), preWeeks, preCadenceT, preYear, upcomingYear);
            const addTail = () => persistMesoTailT([...tailVals, 3], preWeeks, preCadenceT, preYear, upcomingYear);
            const resetTail = () => {
              const keptBw = upcomingYear ? {} : Object.fromEntries(Object.entries(blockLenOv).filter(([k]) => !/^\d+$/.test(k)));
              if (upcomingYear) { setNextMesoTail(null); setPreBlockLenOv({}); } else { setCurMesoTail(null); setBlockLenOv(keptBw); }
              (async () => { try { await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ seasonYear: preYear, overrides: { preMesoTail: null, blockWeeks: keptBw } }) }); } catch { /* best-effort */ } })();
            };
            const baseCount = preMeso.base.length;
            const mesoTailSet = mesoTailT != null || Object.keys(preBlockWeeksT).length > 0;
            return (
          <section className="flex flex-col gap-4 rounded-2xl border border-[#e3e0d8] bg-white px-5 pb-6 pt-5 sm:px-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{is ? "Uppsetning" : "Setup"}</h2>
              <span className="flex flex-wrap items-center gap-3 text-[12px] text-slate-600">
                {preDaySave === "saving" && <span>{is ? "Vista…" : "Saving…"}</span>}
                {preDaySave === "saved" && <span className="font-medium text-emerald-700">{is ? "✓ Dagar vistaðir í Vikuuppsetningu" : "✓ Days saved to Week Setup"}</span>}
                {preDaySave === "err" && <span className="font-medium text-[#a83e28]">{is ? "Vistun mistókst" : "Save failed"}</span>}
                <span>{is ? `Hver breyting endurflæðir allar ${preWeeks} vikurnar · líka í Leikmönnum` : `Every change re-flows all ${preWeeks} weeks · also editable in Players`}</span>
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex min-w-0 flex-col gap-1.5" title={is ? "Ræður fjölda æfingadaga í hverri viku (3–6). Í leikviku raðast þeir í kringum leikinn og aldrei á tvo daga eftir leik; áfylling fyrir <60 mín leikmenn telst ekki með. Æfingabúðir halda sínum dögum." : "Sets the training days in every week (3–6). In a game week they fall around the game and never in the two days after it; the top-up for <60-min players isn't counted. A training camp keeps its days."}>
                <label htmlFor="ps-sessions" className="text-[12px] font-medium text-slate-700">{is ? "Æfingar á viku" : "Sessions per week"}</label>
                <select id="ps-sessions" value={psSessT} onChange={(e) => { const v = Number(e.target.value); setPreSessT(v); }} className="h-11 rounded-lg border border-[#d6d3cc] bg-white px-3 text-[14px]">{[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                <span className="text-[11px] text-slate-600">{is ? "Aldrei á tveimur dögum eftir leik" : "Never in the two days after a game"}</span>
              </div>
              {preWeeks >= 3 ? (
                <div className="flex min-w-0 flex-col gap-1.5" title={is ? `Síðasta vika fyrir fyrsta leik = toppvikan mínus þetta hlutfall. 0 = engin létt vika. Rannsóknir: ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% (Bosquet 2007); sjálfgefið ${PRESEASON_DEFAULT_TAPER_PCT}% er val þjálfarans, rétt undir bilinu.` : `The last week before the opener = the peak week minus this share. 0 = no light week. Research: ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% (Bosquet 2007); the default ${PRESEASON_DEFAULT_TAPER_PCT}% is the coach's choice, just below that range.`}>
                  <label htmlFor="ps-taper" className="text-[12px] font-medium text-slate-700">{is ? "Létt lokavika" : "Light last week"}</label>
                  <div className="flex h-11 items-center gap-1.5 rounded-lg border border-[#d6d3cc] bg-white px-3 focus-within:border-[#2740e6]">
                    <span className="text-[14px] text-slate-500">−</span>
                    <input id="ps-taper" type="number" step={5} min={0} max={PRESEASON_TAPER_RESEARCH[1]} value={psTaperT} onChange={(e) => setPreTaperT(clampTaperPct(Number(e.target.value)))} className="min-w-0 flex-1 border-0 bg-transparent text-[14px] tabular-nums outline-none" />
                    <span className="text-[14px] text-slate-500">%</span>
                  </div>
                  <span className="text-[11px] text-slate-600">{is ? `Rannsóknir ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% (Bosquet 2007) · sjálfgefið ${PRESEASON_DEFAULT_TAPER_PCT}%` : `Research ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% (Bosquet 2007) · default ${PRESEASON_DEFAULT_TAPER_PCT}%`}</span>
                </div>
              ) : <div className="hidden lg:block" />}
              <div className="flex min-w-0 flex-col gap-1.5" title={is ? "Vika án skráðs leiks fær áætlaðan laugardagsleik frá þessum degi. Óstillt = frá fyrsta skráða æfingaleik. „Engir“ = aðeins leikir úr leikjaskránni." : "A week with no entered game gets an assumed Saturday game from this day. Not set = from the first entered friendly. \"None\" = only the games in the fixture list."}>
                <label htmlFor="ps-weekend" className="text-[12px] font-medium text-slate-700">{is ? "Helgarleikir frá" : "Weekend games from"}</label>
                <input id="ps-weekend" type="date" value={psGamesT && psGamesT !== GAMES_FROM_NONE ? psGamesT : ""} min={preStart} onChange={(e) => setPreGamesT(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : null)} className="h-11 rounded-lg border border-[#d6d3cc] bg-white px-3 text-[14px] tabular-nums" />
                <span className="flex flex-wrap gap-x-2 text-[11px] text-slate-600">
                  {psGamesT === GAMES_FROM_NONE
                    ? <><span>{is ? "Engir — aðeins skráðir leikir" : "None — entered games only"}</span><button type="button" onClick={() => setPreGamesT(null)} className="font-semibold text-[#2740e6] hover:underline">{is ? "frá fyrsta æfingaleik" : "from the first friendly"}</button></>
                    : <>
                      {psGamesT
                        ? <button type="button" onClick={() => setPreGamesT(null)} className="font-semibold text-[#2740e6] hover:underline">{is ? "Hreinsa (frá fyrsta æfingaleik)" : "Clear (from the first friendly)"}</button>
                        : <span>{prop.weekendGames.from ? (is ? `Frá fyrsta æfingaleik · ${shortDate(prop.weekendGames.from, is)}` : `From the first friendly · ${shortDate(prop.weekendGames.from, is)}`) : (is ? "Enginn æfingaleikur skráður" : "No friendly entered")}</span>}
                      <button type="button" onClick={() => setPreGamesT(GAMES_FROM_NONE)} className="font-semibold text-[#2740e6] hover:underline">{is ? "Engir helgarleikir" : "No weekend games"}</button>
                    </>}
                </span>
              </div>
              <AddGame is={is} addGame={(date, kind) => writeFixture(date, "upsert", { isFriendly: kind === "friendly" })} />
            </div>

            {/* Week 1 → peak → light week, every variable as × a match beside the research range. The system
                proposes week 1; the coach changes any variable (× a match) and every week re-flows from it. */}
            {ramp.length > 0 && (
              <PreseasonWeek1Table is={is} ramp={ramp} kpiKeys={kpiKeys}
                proposal={preseasonRamp(prop.engine.anchor, plan.matchSrpe, preWeeks, { sessionsPerWeek: psSessT, week1MatchMultiple: psW1T, week1Kpi: {}, taperPct: psTaperT })[0]}
                matchKpi={tka as Record<string, number | undefined>} week1Kpi={week1KpiT} week1Mult={psW1T} taperPct={psTaperT} setCount={w1SetCount}
                onKpi={(k, v) => { const next = { ...week1KpiT }; if (v == null || !Number.isFinite(v) || v <= 0) delete next[k]; else next[k] = Math.round(v); persistWeek1KpiT(next, preYear, upcomingYear); }}
                onWeek1Mult={(v) => setPreW1T(v)}
                onResetAll={() => persistWeek1KpiT({}, preYear, upcomingYear)} />
            )}

            {/* Meso-cycle sequence — planned BACKWARDS from the opener. */}
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-bold text-slate-800">{is ? "Meso-lotur" : "Meso cycles"}</h3>
              <span className="text-[12px] text-slate-500">{is ? "samtals" : "total"} <b className={`tabular-nums ${seqTotal === preWeeks ? "text-slate-900" : "text-[#de9328]"}`}>{seqTotal}</b> {is ? `af ${preWeeks} vikum` : `of ${preWeeks} weeks`}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-slate-500">{is ? "Sömu lotur og styrktaræfingarnar eru sendar eftir. Fyrsta lotan tekur vikurnar sem eftir eru; breyttu lengd hinna, bættu við lotu eða veldu markmið lotu." : "The same blocks the strength sessions are sent from. The first block takes the remaining weeks; change the length of the others, add a block, or pick a block's goal."}</p>

            {(
              <div className="mt-3 space-y-1.5">
                {preBlocks.map((b, bi) => {
                  const bw = weeksBetween(b.start, blockEndExcl(b));
                  const pb = prop.blocks[bi];
                  const isBase = bi < baseCount;          // the flexible base block(s) — earliest
                  const ti = bi - baseCount;               // index into the coach-controlled tail
                  const endsAtGame = bi === preBlocks.length - 1;
                  return (
                    <div key={b.index} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 ${isBase ? "border-slate-200 bg-slate-50" : "border-[#2740e6]/20 bg-[#2740e6]/[0.03]"}`}>
                      <span className="text-[13px] font-semibold text-slate-800">{is ? "Lota" : "Block"} {b.index + 1}</span>
                      <span className="text-[12px] text-slate-500">{shortDate(b.start, is)}–{shortDate(isoAdd(b.end, -1), is)} · {bw} {is ? "v" : "wk"}</span>
                      {pb && (
                        <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500" title={is ? "Markmið lotunnar — það sem styrktaræfingarnar eru sendar eftir. Sjálfgefið: Uppsöfnun, svo Umbreyting og Framkvæmd til skiptis (Issurin 2010)." : "The block's goal — what the strength sessions are sent as. Default: Accumulation, then Transmutation and Realization in turn (Issurin 2010)."}>
                          <select value={pb.goalKey} onChange={(e) => setPreseasonGoal(b.start, e.target.value as "accum" | "transmute" | "realize")} aria-label={is ? "Markmið lotu" : "Block goal"} className="rounded-full border border-[#7a5cc4]/30 bg-[#7a5cc4]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7a5cc4]">
                            {(["accum", "transmute", "realize"] as const).map((g) => <option key={g} value={g}>{goalWord(g)}</option>)}
                          </select>
                          {pb.goalByCoach
                            ? <button type="button" onClick={() => setPreseasonGoal(b.start, null)} className="font-normal text-slate-400 underline hover:text-slate-600">{is ? "þitt val · fylgja röðinni" : "your choice · follow the order"}</button>
                            : <span className="font-normal text-slate-400">{is ? "röðin" : "the order"}</span>}
                        </label>
                      )}
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
                  {mesoTailSet && <button type="button" onClick={resetTail} className="text-[12px] font-medium text-slate-500 hover:text-slate-700 hover:underline">{is ? "Núllstilla í sjálfgefið" : "Reset to auto"}</button>}
                  {!roomForMore && <span className="text-[11px] text-slate-400">{is ? "ekki pláss fyrir fleiri lotur" : "no room for more blocks"}</span>}
                </div>
              </div>
            )}

            {/* Research "why" — explainability L2 (jargon + citations behind a toggle, off the primary view). */}
            <details className="mt-3 text-[11.5px] text-slate-500">
              <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-700">{is ? "Af hverju breyturnar stigþyngjast ólíkt" : "Why the variables ramp differently"}</summary>
              <p className="mt-2 leading-relaxed">
                <i className="mr-1 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full align-middle" style={{ background: "#a83e28" }} />
                <b className="font-semibold text-slate-600">{is ? "Vélrænar breytur" : "Biomechanical"}</b> {is ? "(hemlun, sprettir, háhraðahlaup, stefnubreytingar) stigþyngjast varlegar" : "(decel, sprint, HSR, COD) ramp more conservatively"}
                <i className="mx-1 ml-3 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full align-middle" style={{ background: "#2740e6" }} />
                <b className="font-semibold text-slate-600">{is ? "efnaskipta-breytur" : "metabolic"}</b> {is ? "(hröðun, vegalengd) línulega — ólíkar aðlögunarleiðir vefja og efnaskipta" : "(accel, distance) linearly — tissue vs metabolic adapt differently"} (Vanrenterghem 2017, McBurnie 2022, Duhig 2016).
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

          {/* How the strength reaches the players (the team's send mode): the week cards below follow it. */}
          {!isBasketball && <StrengthDeliveryNote delivery={delivery} season="build" is={is} />}

          {/* WEEK BY WEEK — one row per week, grouped under its meso cycle; a row opens into the full week card.
              Default open: the week holding today (else week 1). Layered read: the row is the glance, the card the
              detail, the per-variable chips sit behind their own toggle (they are in the table above too). */}
          {(() => {
            const allMons = ramp.map((_, k) => cal.weeks[k]?.weekStart ?? isoAdd(preStart, k * 7));
            const curIdx = Math.max(0, allMons.findIndex((m) => m <= todayIso && todayIso < isoAdd(m, 7)));
            const isOpen = (m: string, k: number) => preOpenWeeks[m] ?? k === curIdx;
            const anyClosed = allMons.some((m, k) => !isOpen(m, k));
            const legend: Array<[string, string]> = [["mechanical", typeName("mechanical")], ["locomotive", typeName("locomotive")], ["mixed", typeName("mixed")], ["activation", typeName("activation")], ["topup", typeName("topup")], ["match", is ? "Leikur" : "Game"]];
            return (
              <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-[22px] font-bold tracking-[-0.01em] text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{is ? "Vika fyrir viku" : "Week by week"}</h2>
                  <p className="text-[13px] text-slate-600">{is ? "Smelltu á dag til að velja áherslu eða frí — vistast sem uppkast í Vikuuppsetningu. Smelltu á viku til að opna hana." : "Click a day to set its stimulus or take it off — saves as a draft to Week Setup. Click a week to open it."}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-600">
                  {legend.map(([k, lab]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: k === "match" ? "#de9328" : typeColor[k] }} />{lab}</span>)}
                  <button type="button" onClick={() => setPreOpenWeeks(Object.fromEntries(allMons.map((m) => [m, anyClosed])))} className="h-9 rounded-lg border border-[#d9d5cc] bg-white px-3 text-[13px] font-medium text-[#14181c] hover:bg-slate-50">{anyClosed ? (is ? "Opna allar" : "Expand all") : (is ? "Loka öllum" : "Collapse all")}</button>
                </div>
              </div>
            );
          })()}
          {ramp.map((w, i) => {
            const cw = cal.weeks[i];
            const weekMon = cw?.weekStart ?? isoAdd(preStart, i * 7);
            // Standard: the players get the Custom Programme, not the block's scheme — the card shows the programme.
            const sw = deliveryStd ? undefined : strengthWeeks[i];
            const dw = deliveryStd ? deliveryWeek(weekMon) : null;
            const heavyByDate = new Map((sw?.days ?? []).map((d) => [d.date, d] as const));
            const weekTests = tests.filter((tp) => tp.weeks.includes(i + 1));
            const weekFx = preFixtures.filter((d) => d >= weekMon && d < isoAdd(weekMon, 7));
            const pv = primary(w);
            const blk = preBlocks.find((b) => b.start === weekMon); // this week starts a new meso cycle?
            const blkGoal = blk ? prop.blocks.find((x) => x.start === blk.start)?.goalKey ?? null : null;
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
            const curIdx = Math.max(0, ramp.findIndex((_, k) => { const m = cal.weeks[k]?.weekStart ?? isoAdd(preStart, k * 7); return m <= todayIso && todayIso < isoAdd(m, 7); }));
            const weekOpen = preOpenWeeks[weekMon] ?? i === curIdx;
            const toggleWeek = () => setPreOpenWeeks((o) => ({ ...o, [weekMon]: !weekOpen }));
            return (
              <React.Fragment key={i}>
              {blk && (
                <div className="flex flex-wrap items-center gap-2.5 px-1 pt-3">
                  <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${blkGoal === "realize" ? "border border-[#b9dcc8] bg-[#e4f1ea] text-[#15603a]" : blk.index < prop.engine.meso.base.length ? "border border-dashed border-[#9aa8f2] bg-[#eef0fd] text-[#1b2da8]" : "border border-[#c3cbf6] bg-[#eef0fd] text-[#1b2da8]"}`}>{is ? "Lota" : "Block"} {blk.index + 1}{blk.index < prop.engine.meso.base.length ? (is ? " · grunnur" : " · base") : ""}</span>
                  {blkGoal && <span className="text-[13px] font-semibold text-[#14181c]">{goalWord(blkGoal)}</span>}
                  <span className="text-[13px] text-slate-600">{shortDate(blk.start, is)} – {shortDate(isoAdd(blk.end, -1), is)} · {weeksBetween(blk.start, blk.end)} {is ? "vikur" : "weeks"}</span>
                  <span className="h-px min-w-[40px] flex-1 bg-[#e3e0d8]" />
                </div>
              )}
              {!weekOpen ? (
              <section className="min-w-0 overflow-hidden rounded-[14px] border border-[#e3e0d8] bg-white">
                <button type="button" onClick={toggleWeek} aria-expanded={false} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 text-left hover:bg-[#faf9f6] md:grid-cols-[120px_170px_minmax(200px,1fr)_auto_20px]">
                  <span className="flex flex-col"><span className="text-[16px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{is ? "Vika" : "Week"} {i + 1}</span><span className="text-[12px] text-slate-600">{shortDate(weekMon, is)}{w.taper ? (is ? " · létt vika" : " · light week") : ""}</span></span>
                  <span className="flex flex-col">
                    {w.multipleOfMatch != null && <span className="text-[15px] font-bold tabular-nums text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{w.multipleOfMatch}× <span className="font-sans text-[12px] font-medium text-slate-600">{is ? "leikur" : "a match"}</span></span>}
                    <span className="text-[12px] text-slate-600">{pv > 0 ? `${fmtv(pv)} ${unitLabel}` : ""}{w.perSessionLoad != null ? ` · ${w.perSessionLoad}/${is ? "æfingu" : "session"}` : ""}</span>
                  </span>
                  <span className="hidden grid-cols-7 gap-1 md:grid">
                    {(cw?.days ?? []).map((d, di) => { const off = d.type === "rest"; const isM = d.type === "match"; const dl = dayLoad(d);
                      return <span key={di} title={`${dows[di]} · ${typeName(d.type)}${dl != null && !off ? ` · ${dl} PL` : ""}`} className="flex h-[22px] items-center justify-center rounded-[5px] font-mono text-[10px] font-semibold" style={off ? { background: "#f4f2ec", color: "#8a919c" } : { background: isM ? "#de9328" : typeColor[d.type] ?? "#64748B", color: "#fff" }}>{off ? "" : typeName(d.type).slice(0, 1)}</span>; })}
                  </span>
                  <span className="justify-self-end">{confirmBadge(weekMon)}</span>
                  <svg className="hidden md:block" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f5661" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </section>
              ) : (
              <section className="min-w-0 overflow-hidden rounded-[14px] border border-[#e3e0d8] bg-white px-5 pb-4 pt-4">
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                  <button type="button" onClick={toggleWeek} aria-expanded={true} className="inline-flex items-center gap-1.5 text-[20px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{is ? "Vika" : "Week"} {i + 1}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f5661" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg></button>
                  <button type="button" onClick={openWeek} title={is ? "Opna í Vikuuppsetningu" : "Open in Week Setup"} className="text-[13px] text-slate-600 underline decoration-dotted underline-offset-2 hover:text-[#2740e6]">{shortDate(weekMon, is)}</button>
                  {w.multipleOfMatch != null && <span className="text-[16px] font-bold tabular-nums text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{w.multipleOfMatch}× <span className="font-sans text-[12px] font-medium text-slate-600">{is ? "leikur" : "a match"}</span></span>}
                  {w.taper && <span title={is ? "Létt vika fyrir fyrsta leik: toppvikan lækkuð, öll vikan um sama hlutfall og ákefð haldið. Bosquet 2007." : "Light week before the opener: the peak week cut, the whole week by one share, intensity kept. Bosquet 2007."} className="rounded-full bg-[#1c7a4a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#1c7a4a]">{is ? "Létt vika" : "Taper"}</span>}
                  {(pv > 0 || w.perSessionLoad != null) && <span className="text-[13px] text-slate-600">{pv > 0 && <b className="font-semibold tabular-nums text-[#14181c]">{fmtv(pv)} {unitLabel}</b>}{w.perSessionLoad != null && <> · ≈ {w.perSessionLoad} {is ? "á æfingu" : "per session"}</>}</span>}
                  {confirmBadge(weekMon)}
                  <button type="button" onClick={openWeek} className="ml-auto text-[13px] font-semibold text-[#2740e6] hover:underline">{is ? "Opna í Vikuuppsetningu →" : "Open in Week Setup →"}</button>
                </div>
                {cw && (
                  <>
                  <div className="mt-3 grid grid-cols-7 gap-1.5">
                    {cw.days.map((d, di) => { const dl = dayLoad(d); const isMatch = d.type === "match";
                      // An ENTERED game is fixed to its fixture — clicking opens Week Setup. An assumed game and every
                      // other day open the picker right here: move/remove the assumed game, or Off / a training type.
                      const entered = isMatch && weekFx.includes(isoAdd(cw.weekStart, di));
                      const open = preDayPick?.weekStart === cw.weekStart && preDayPick?.di === di;
                      const title = entered
                        ? `${dows[di]} · ${typeName(d.type)}${dl != null ? ` · ${dl} PL (~${mins} ${is ? "mín" : "min"})` : ""} — ${is ? "leikdagur (fastur við leikinn) — opnar vikuna" : "match day (fixed to the fixture) — opens the week"}`
                        : isMatch
                          ? `${dows[di]} · ${is ? "áætlaður leikur (ekki í leikjaskrá)" : "assumed game (not in the fixture list)"} — ${is ? "smelltu til að færa eða taka út" : "click to move or remove it"}`
                          : `${dows[di]} · ${typeName(d.type)}${dl != null && d.type !== "rest" ? ` · ${dl} PL` : ""} — ${is ? "smelltu til að velja áherslu eða frí" : "click to choose the stimulus or set off"}`;
                      return (
                      <button key={di} type="button" onClick={() => entered ? openWeek() : setPreDayPick(open ? null : { weekStart: cw.weekStart, di })} title={title} aria-label={title} aria-expanded={isMatch ? undefined : open} className={`relative flex min-h-[92px] min-w-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded-[10px] px-2.5 pb-2.5 pt-3 text-left transition-shadow hover:ring-2 hover:ring-[#2740e6]/30 focus:outline-none focus:ring-2 focus:ring-[#2740e6]/40 ${d.type === "rest" ? "border border-dashed border-[#d9d5cc] bg-white" : "border border-transparent"} ${open ? "ring-2 ring-[#2740e6]/50" : ""}`} style={d.type === "rest" ? undefined : { background: tint[d.type] ?? "#F8FAFC", boxShadow: isMatch ? "inset 0 0 0 1px #de9328" : undefined }}>
                        {d.type !== "rest" && <span className="absolute inset-x-0 top-0 h-1" style={{ background: isMatch ? "#de9328" : typeColor[d.type] ?? "#64748B" }} />}
                        <span className="text-[11px] text-slate-500">{dows[di]}</span>
                        <span className="max-w-full truncate text-[12px] font-semibold" style={{ color: typeColor[d.type] ?? "#64748B" }}>{d.type === "rest" ? (is ? "Frí" : "Off") : typeName(d.type)}{isMatch && !entered ? "?" : ""}</span>
                        <span className="text-[15px] font-bold tabular-nums text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{dl != null && d.type !== "rest" ? dl : "–"}</span>
                        {heavyByDate.get(isoAdd(cw.weekStart, di)) && <span className="max-w-full truncate rounded-full bg-[#2740e6]/[0.08] px-1.5 py-px text-[10px] font-semibold text-[#2740e6]">{is ? "Lyftingar" : "Gym"} {heavyByDate.get(isoAdd(cw.weekStart, di))!.heavyReps}</span>}
                        {dw && d.type !== "rest" && programmeTitle(dw, d.md) && <span className="max-w-full truncate rounded-full bg-[#2740e6]/[0.08] px-1.5 py-px text-[10px] font-semibold text-[#2740e6]" title={programmeTitle(dw, d.md)!}>{programmeTitle(dw, d.md)}</span>}
                      </button>
                    ); })}
                  </div>
                  {/* Inline stimulus picker for the day the coach clicked (draft edit, persists to week_plans). */}
                  {preDayPick?.weekStart === cw.weekStart && (() => {
                    const d = cw.days[preDayPick.di]; if (!d) return null;
                    const pw = prop.weeks[i];
                    // The assumed game's own picker: take it out of the week, or (if the coach moved it) back to the rule.
                    if (d.type === "match") return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md border border-[#de9328]/30 bg-[#de9328]/[0.06] px-2 py-1.5">
                        <span className="mr-0.5 text-[11px] font-semibold text-slate-600">{dows[preDayPick.di]} · {is ? (pw?.assumedGame?.coachSet ? "leikur sem þú settir" : "áætlaður laugardagsleikur") : (pw?.assumedGame?.coachSet ? "a game you placed" : "assumed Saturday game")} —</span>
                        <button type="button" onClick={() => moveAssumed(cw, null)} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{is ? "Enginn leikur þessa viku" : "No game this week"}</button>
                        {pw?.assumedGame?.coachSet && <button type="button" onClick={() => moveAssumed(cw, undefined)} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{is ? "Fylgja reglunni" : "Follow the rule"}</button>}
                        <span className="text-[10.5px] text-slate-500">{is ? "Til að færa leikinn: smelltu á annan dag og veldu „Leikur þennan dag“." : "To move it: click another day and pick “Game this day”."}</span>
                        <button type="button" onClick={() => setPreDayPick(null)} className="ml-auto rounded px-1 text-[12px] text-slate-400 hover:text-slate-600" aria-label={is ? "Loka" : "Close"}>✕</button>
                      </div>
                    );
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
                        {weekFx.length === 0 && <button type="button" onClick={() => moveAssumed(cw, preDayPick.di)} title={is ? "Áætlaður leikur þennan dag (ekki í leikjaskrá). Skráðu hann í Makró þegar hann er staðfestur." : "An assumed game this day (not in the fixture list). Enter it in Macro once it's confirmed."} className="rounded-md border border-[#de9328]/50 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#7a4a06] hover:bg-[#de9328]/10">{is ? "Leikur þennan dag" : "Game this day"}</button>}
                        <button type="button" onClick={() => setPreDayPick(null)} className="ml-auto rounded px-1 text-[12px] text-slate-400 hover:text-slate-600" aria-label={is ? "Loka" : "Close"}>✕</button>
                      </div>
                    );
                  })()}
                  {prop.weeks[i]?.noGameByCoach && (
                    <p className="mt-1.5 text-[11.5px] text-slate-600">{is ? "Enginn leikur þessa viku (þitt val)." : "No game this week (your choice)."} <button type="button" onClick={() => moveAssumed(cw, undefined)} className="font-semibold text-[#2740e6] hover:underline">{is ? "Fylgja reglunni aftur" : "Follow the rule again"}</button></p>
                  )}
                  {deliveryStd && !isBasketball && dw && (() => {
                    const shown = cw.days.map((d) => ({ md: d.md, title: d.type === "rest" ? null : programmeTitle(dw, d.md) })).filter((d) => d.title);
                    return (
                      <div className="mt-3 rounded-[10px] bg-[#f8f7f3] px-3.5 py-2.5 text-[13px] text-slate-600">
                        <b className="font-semibold text-[#14181c]">{is ? "Styrkur · Staðlað" : "Strength · Standard"}</b>
                        {programmeCovers(dw)
                          ? <> · {dw!.programme!.setName}{shown.length > 0 && <> · {shown.map((d) => `${d.md || (is ? "dagur" : "day")} ${d.title}`).join(" · ")}</>}</>
                          : <> · <span className="text-[#8a5a12]">{is ? NO_PROGRAMME.is : NO_PROGRAMME.en}</span></>}
                      </div>
                    );
                  })()}
                  {sw && (
                    <div className="mt-3 rounded-[10px] bg-[#f8f7f3] px-3.5 py-2.5 text-[13px] text-slate-600">
                      <div>
                        <b className="font-semibold text-[#14181c]">{is ? "Styrkur" : "Strength"}</b> · {is ? sw.scheme.quality.is : sw.scheme.quality.en} · {is ? sw.scheme.pct1rm.is : sw.scheme.pct1rm.en} · {schemeHead(is ? sw.scheme.scheme.is : sw.scheme.scheme.en)}
                        {" · "}{sw.days.length
                          ? <>{is ? "þungar endurtekningar" : "heavy reps"} {sw.days.map((d) => `${d.md} ${d.heavyReps}`).join(" · ")} (<b className="tabular-nums">{sw.weekHeavyReps}</b> {is ? "á viku" : "a week"})</>
                          : <>{sw.weekHeavyReps} {is ? "þungar endurtekningar á viku" : "heavy reps a week"}</>}
                      </div>
                      <details className="mt-1 text-[12px] text-slate-600">
                        <summary className="cursor-pointer select-none font-semibold text-[#2740e6] hover:underline">{is ? "Sýna æfinguna" : "Show the session"}</summary>
                        <p className="mt-1">{is ? sw.scheme.scheme.is : sw.scheme.scheme.en}</p>
                        {sw.days.length > 0 && <p className="mt-0.5">{sw.days.map((d) => `${d.md}: ${d.heavyReps} ${is ? "endurt." : "reps"}${d.structure ? ` · ${is ? STRUCTURE_LABEL[d.structure].is : STRUCTURE_LABEL[d.structure].en}` : ""}`).join(" — ")}</p>}
                        <p className="mt-0.5">{sw.hasGame
                          ? (is ? "Leikvika: þungu dagarnir eru MD-4 og MD-3 (og MD-5 ef enginn leikur var helgina á undan)." : "Game week: the heavy days are MD-4 and MD-3 (and MD-5 with no game the weekend before).")
                          : (is ? `Vika án leiks: allt að 3 þungir dagar, aldrei tveir í röð, eftir dagaskipulagi liðsins${sw.defaultPlan ? " (sjálfgefið skipulag — ekkert vistað)" : ""}.` : `Week without a game: up to 3 heavy days, never two in a row, from the team's weekday plan${sw.defaultPlan ? " (the default plan — none saved)" : ""}.`)}
                          {" "}{is ? `Lotan: ${goalWord(sw.goalKey)}${sw.goalByCoach ? " (þitt val)" : ""}. Sama og sent er til leikmanna.` : `Block: ${goalWord(sw.goalKey)}${sw.goalByCoach ? " (your choice)" : ""}. The same as is sent to the players.`}</p>
                        <div className="mt-0.5 text-[10.5px]"><CiteRefs text={sw.cite} is={is} /></div>
                      </details>
                    </div>
                  )}
                  </>
                )}
                {/* Friendly budget — the partial match counts toward the week; training fills the remainder. */}
                {weekFx.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2 rounded-[10px] bg-[#fbf6ec] px-3.5 py-3 text-[13px] text-slate-600">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span><b className="font-semibold text-[#14181c]">{is ? "Æfingaleikur" : "Friendly"} {weekFx.map((d) => shortDate(d, is)).join(", ")} · ~{mins} {is ? "mín" : "min"}</b> {is ? "telur inn í vikumarkið" : "counts toward the week"}</span>
                      {w.weeklyLoadTarget != null && <span>{is ? "Vikumark" : "Week target"} <b className="font-semibold tabular-nums text-[#14181c]">{w.weeklyLoadTarget.toLocaleString("en-US")} PL</b></span>}
                    </div>
                    {friendlyPL != null && trainingPL != null && w.weeklyLoadTarget != null && w.weeklyLoadTarget > 0 && (
                      <div className="flex h-3 overflow-hidden rounded-full bg-[#ece9e2]" role="img" aria-label={`${is ? "Æfingaleikur" : "Friendly"} ${friendlyPL} PL, ${is ? "æfingar" : "training"} ${trainingPL} PL ${is ? "af" : "of"} ${w.weeklyLoadTarget} PL`}>
                        <span className="h-full bg-[#de9328]" style={{ width: `${Math.min(100, (friendlyPL / w.weeklyLoadTarget) * 100)}%` }} />
                        <span className="h-full bg-[#2740e6]" style={{ width: `${Math.min(100, (trainingPL / w.weeklyLoadTarget) * 100)}%` }} />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-4 text-[12px]">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#de9328]" />{is ? "Leikur" : "Friendly"} {friendlyPL != null ? friendlyPL.toLocaleString("en-US") : "–"} PL{friendlyTD != null && <> · {friendlyTD.toLocaleString("en-US")} m</>}</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#2740e6]" />{is ? "Æfingar" : "Training"} {trainingPL != null ? trainingPL.toLocaleString("en-US") : "–"} PL{trainingTD != null && <> · {trainingTD.toLocaleString("en-US")} m</>}{trainingPL != null && <> ({Math.round(trainingPL / w.sessionCount)}/{is ? "æfingu" : "session"})</>}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">{is ? "Leikmenn spila hluta leiks í undirbúningi — hlutfallið rís yfir tímabilið (Buchheit/Gabbett)." : "Players play partial minutes in pre-season — the share ramps across pre-season (Buchheit/Gabbett)."}</span>
                  </div>
                )}
                {kpiKeys.length > 0 && (
                  <details className="mt-3 text-[12px]">
                  <summary className="cursor-pointer select-none font-semibold text-[#2740e6] hover:underline">{is ? "Sýna álag á hverja breytu" : "Show load per variable"}</summary>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {kpiKeys.map((k) => { const lab = WEEKLY_LOAD_LABELS[k]; const val = w.byKpi[k]; if (val == null) return null; const pw = kpiPathway(k); const pwDot = pw === "biomechanical" ? "#a83e28" : pw === "physiological" ? "#2740e6" : "#94a3b8";
                      // Impact-weighted read: each KPI as its OWN ×match multiple (weekly ÷ one match of that KPI).
                      // Shows the variables don't share a value — HSR's small metres are a big ×match (T:M).
                      const mv = tka[k]; const xmatch = mv != null && mv > 0 ? Math.round((val / mv) * 100) / 100 : null;
                      const ref = kpiTmRefRange(k); const over = xmatch != null && ref != null && xmatch > ref[1];
                      const pwName = pw === "biomechanical" ? (is ? "vélræn" : "biomechanical") : pw === "physiological" ? (is ? "efnaskipti" : "physiological") : (is ? "rúmmál" : "volume");
                      const title = `${is ? lab.is : lab.en} — ${xmatch != null ? `×${xmatch} leik` : "—"}${ref ? ` · ${is ? "viðmið" : "ref"} ${ref[0]}–${ref[1]}×${over ? (is ? " (yfir — undirbúnings-uppbygging)" : " (above — pre-season build)") : ""}` : ""} · ${pwName}`;
                      return (
                      <span key={k} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10.5px] text-slate-600" title={title}><i className="h-1.5 w-1.5 rounded-full" style={{ background: pwDot }} />{xmatch != null && <span className={`font-semibold tabular-nums ${over ? "text-[#de9328]" : "text-slate-900"}`}>×{xmatch}</span>}<span className="text-slate-400">{is ? lab.is : lab.en}</span> <span className="tabular-nums text-slate-500">{val.toLocaleString("en-US")}{lab.unit}</span>{ref && <span className="tabular-nums text-slate-400">· {is ? "rannsóknir" : "research"} {ref[0]}–{ref[1]}×</span>}</span>
                    ); })}
                  </div>
                  </details>
                )}
                {w.taper && ramp[i - 1] && (() => {
                  // The light week before the opener: the research behind it, visible (not only in a tooltip).
                  const pk = ramp[i - 1];
                  const cut = Math.round((1 - (w.multipleOfMatch ?? 0) / Math.max(0.01, pk.multipleOfMatch ?? 1)) * 100);
                  return (
                    <div className="mt-2 rounded-md border border-[#1c7a4a]/25 bg-[#1c7a4a]/[0.05] px-2.5 py-2 text-[11.5px] text-slate-700">
                      <div><b className="font-semibold text-[#1c7a4a]">{is ? "Létt vika fyrir fyrsta leik" : "Light week before the opener"}</b> — {is ? `vika ${pk.weekIndex} (toppurinn) −${cut}%. Hver breyta lækkar jafnt og heldur sínu hlutfalli.` : `week ${pk.weekIndex} (the peak) −${cut}%. Every variable drops by the same share and keeps its own weight.`}</div>
                      <div className="mt-0.5 text-slate-600">{is ? `Rannsóknir: besta létta vikan sker magn um ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% og heldur ákefð; sjálfgefna ${PRESEASON_DEFAULT_TAPER_PCT}% er val þjálfarans, rétt undir bilinu. Breyttu hlutfallinu í „Létt lokavika −%“ hér að ofan (0 = engin létt vika).` : `Research: the best taper cuts volume ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% and keeps intensity; the default ${PRESEASON_DEFAULT_TAPER_PCT}% is the coach's choice, just below that range. Change the share in "Light last week −%" above (0 = no light week).`}</div>
                      <div className="mt-0.5 text-slate-600">{is ? "Tölurnar fyrir hverja breytu eru í töflunni „Vika 1 → toppur → létt vika“ efst á síðunni." : "The numbers for each variable are in the \"Week 1 → peak → light week\" table at the top."}</div>
                      <div className="mt-1 text-[10.5px] text-slate-500"><CiteRefs text="Bosquet 2007; Mujika & Padilla 2003; Clemente 2019c; Gualtieri 2023" is={is} /></div>
                    </div>
                  );
                })()}
                {(weekTests.length > 0 || weekFx.length > 0) && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                    {weekTests.length > 0 && <span className="mr-0.5 text-slate-600">{is ? "Próf þessa viku:" : "Test this week:"}</span>}
                    {weekTests.map((tp) => <span key={tp.protocol.key} className="rounded-full bg-[#1c7a4a]/10 px-2.5 py-0.5 font-semibold text-[#15603a]" title={is ? tp.protocol.name.is : tp.protocol.name.en}>{is ? testShortName(tp.protocol.key, aerobicTest).is : testShortName(tp.protocol.key, aerobicTest).en}</span>)}
                    {weekFx.map((d) => <span key={d} className="rounded-full bg-[#de9328]/15 px-2.5 py-0.5 font-semibold text-[#7a4a06]">{is ? "Æfingaleikur" : "Friendly"} {shortDate(d, is)}</span>)}
                  </div>
                )}
              </section>
              )}
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
            <summary className="cursor-pointer py-1 text-[15px] font-bold text-slate-900">{is ? (isKinexon ? "Grunnlína allra staða (Kinexon)" : "Grunnlína allra staða (GPS + IMA)") : (isKinexon ? "Baseline for every position (Kinexon)" : "Baseline for every position (GPS + IMA)")} <span className="text-[12px] font-medium text-slate-500">· {is ? "meðaltal per æfingu yfir tímabilið" : "mean per session over the season"}</span></summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead><tr className="text-left text-[11px] text-slate-500">
                  <th className="py-1.5 pr-2 font-semibold">{is ? "Staða" : "Position"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{is ? "Vegal." : "Dist"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">HSR</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{is ? "Hám. km/klst" : "Max km/h"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">PL</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Acc/Dec</th>
                  {!isKinexon && <th className="py-1.5 pl-2 font-semibold">{is ? "IMA fram · hlið · aftur" : "IMA fwd · lat · back"}</th>}
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
                      {!isKinexon && (
                        <td className="py-1.5 pl-2">
                          {a.direction ? (
                            <span className="inline-flex h-2 w-28 overflow-hidden rounded-full align-middle" title={`${Math.round(a.direction.forward * 100)} / ${Math.round(a.direction.lateral * 100)} / ${Math.round(a.direction.backward * 100)} %`}>
                              <span className="bg-[#2740e6]" style={{ width: `${a.direction.forward * 100}%` }} /><span className="bg-slate-400" style={{ width: `${a.direction.lateral * 100}%` }} /><span className="bg-amber-500" style={{ width: `${a.direction.backward * 100}%` }} />
                            </span>
                          ) : <span className="text-slate-400">–</span>}
                        </td>
                      )}
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            {!isKinexon && <p className="mt-2 text-[12px] text-slate-500">{is ? "IMA-slá: blátt = fram, grátt = hlið, gult = aftur. Sjálfgefið viðmið leikmanns er HANS staða, ekki allt liðið (Ju)." : "IMA bar: blue = forward, grey = lateral, amber = backward. A player's default falls back to HIS position, not the whole team (Ju)."}</p>}
          </details>

          <p className="text-[12px] text-slate-500">{is ? "Tölurnar eru upphafspunktur, aldrei viðmið til að hlýða í blindni — leikmaðurinn, samhengið og viðbragðið stýra deginum (Little & Buchheit — „ekki þrælar GPS-viðmiða“). Figueiredo o.fl. (ás-sértæk æfing:leik hlutföll) · Buchheit & Simpson (vélrænt vs hlaup). Lýsandi — aldrei readiness-liturinn." : "These numbers are a starting point, never a norm to obey — the player, the context and readiness govern the day (Little & Buchheit — don't be \"slaves to GPS norms\"). Figueiredo et al. (dimension-specific training:match ratios) · Buchheit & Simpson (mechanical vs locomotor). Descriptive — never the readiness colour."}</p>

            </div>);
          })()}

          {/* THE PLAN tab — the block planner (primary) → the season meso map (context) → micro link */}
          {(tab === "plan" || tab === "micro") && plan.phases.length === 0 && <MacroSetupGate is={is} seasonYear={plan.seasonYear} onOpenMacro={() => setTab("season")} />}
          {/* In-season page, the season is over → the next one: its first block starts at its first league game. */}
          {tab === "plan" && plan.phases.length > 0 && !isPlayerScope && plan.nextFirstFixture
            && plan.nextFirstFixture >= new Date().toISOString().slice(0, 10)
            && (plan.phases.find((p) => p.key === "competitive")?.end ?? "9999-12-31") <= new Date().toISOString().slice(0, 10)
            && plan.seasonYear + 1 <= new Date().getFullYear() + 1 && (
            <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <p className="text-[15px] font-bold text-slate-900">{is ? `Næsta keppnistímabil (${plan.seasonYear + 1}): fyrsta lotan hefst ${shortDate(plan.nextFirstFixture, is)}` : `Next season (${plan.seasonYear + 1}): the first block starts ${shortDate(plan.nextFirstFixture, is)}`}{plan.nextFirstFixtureEstimated ? (is ? " (áætlað)" : " (estimated)") : ""}</p>
              <p className="mt-1 text-[13px] text-slate-600">{is ? "Lotan byrjar á fyrsta deildarleiknum. Hún fullmótast þegar leikjaplanið er komið og leikirnir skráðir í Makró." : "The block starts at the first league game. It firms up once the fixture list is out and the games are entered in Macro."}</p>
              <button type="button" onClick={() => { jumpBlkRef.current = plan.nextFirstFixture!; switchYear(plan.seasonYear + 1); }} className="mt-3 h-9 rounded-lg bg-[#2740e6] px-3 text-[13px] font-semibold text-white hover:brightness-110">{is ? `Opna tímabilið ${plan.seasonYear + 1} →` : `Open the ${plan.seasonYear + 1} season →`}</button>
            </section>
          )}
          {tab === "plan" && plan.phases.length > 0 && (() => {
            const GC: Record<BlockGoalKey, string> = { accum: "#2740E6", transmute: "#7A5CC4", realize: "#1C7A4A", deload: "#DE9328" };
            const DAY = 86_400_000;
            const utc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
            const card = "rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
            const h2 = "text-[15px] font-bold text-slate-900";
            const goalName = (g: BlockGoalKey) => (is ? BLOCK_GOAL_LABEL[g].is : BLOCK_GOAL_LABEL[g].en);
            const todayIso = new Date().toISOString().slice(0, 10);
            const endIncl = (b: { end: string }) => isoAdd(b.end, -1);
            // This page is the IN-SEASON meso: competitive + off-season blocks. Pre-season blocks live on
            // "Meso: Pre-season" (the same blocks, planned with the pre-season rules).
            const compStartM = plan.phases.find((p) => p.key === "competitive")?.start ?? null;
            const isPreBlock = (b: { start: string }) => !!compStartM && b.start < compStartM;
            const seasonBlocks = mesoBlocks.filter((b) => !isPreBlock(b));
            const selAll = mesoBlocks.find((b) => b.start <= blkStart && blkStart < b.end) ?? null;
            const selIsPre = !!selAll && isPreBlock(selAll);
            const selIdx = seasonBlocks.findIndex((b) => b.start <= blkStart && blkStart < b.end);
            const sel = selIdx >= 0 ? seasonBlocks[selIdx] : null;
            const prevB = selIdx > 0 ? seasonBlocks[selIdx - 1] : null;
            const nextB = selIdx >= 0 && selIdx < seasonBlocks.length - 1 ? seasonBlocks[selIdx + 1] : null;
            const todayB = seasonBlocks.find((b) => b.start <= todayIso && todayIso < b.end) ?? null;
            // In-season rules on the shown block: a training day the coach set against them keeps (their call)
            // but is marked. MD+2 = a session two days after a match; three in a row = INSEASON_THREE_IN_A_ROW.
            const inS = inSeasonRange(plan.phases);
            const ruleBreaks = calBlock && !isPlayerScope && inS ? inSeasonRuleBreaks(calBlock.weeks, plan.fixtures ?? [], inS) : new Map<string, Bi>();
            const selGoal: BlockGoalKey = sel ? ((blockGoals[sel.start] as BlockGoalKey | undefined) ?? sel.goalKey) : effectiveGoal;
            // Block strip — every block positioned by DATE on one axis (same approach as the Macro map).
            const d0 = seasonBlocks.length ? utc(mondayOf(seasonBlocks[0].start)) : 0;
            const d1 = seasonBlocks.length ? Math.max(...seasonBlocks.map((b) => utc(b.end))) : 1;
            const spanDays = Math.max(1, Math.round((d1 - d0) / DAY));
            const pctOf = (iso: string) => Math.max(0, Math.min(100, ((utc(iso) - d0) / DAY / spanDays) * 100));
            const monthMarks: Array<{ pct: number; label: string }> = [];
            if (seasonBlocks.length) {
              const s = new Date(d0);
              let cur = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + (s.getUTCDate() > 1 ? 1 : 0), 1);
              let prevYear: number | null = null;
              while (cur < d1) {
                const cd = new Date(cur), yr = cd.getUTCFullYear(), mon = cd.toLocaleDateString(is ? "is-IS" : "en-US", { month: "short", timeZone: "UTC" });
                monthMarks.push({ pct: ((cur - d0) / DAY / spanDays) * 100, label: yr !== prevYear ? `${mon} ’${String(yr).slice(2)}` : mon });
                prevYear = yr; cur = Date.UTC(yr, cd.getUTCMonth() + 1, 1);
              }
            }
            const todayPct = seasonBlocks.length && utc(todayIso) >= d0 && utc(todayIso) < d1 ? pctOf(todayIso) : null;
            const trendWord = (t: MesoBlock["loadTrend"]) => t === "rising" ? (is ? "↗ hækkandi" : "↗ rising") : t === "falling" ? (is ? "↘ lækkandi" : "↘ falling") : t === "steady" ? (is ? "→ stöðugt" : "→ steady") : "—";
            const bt = sel ? testsForBlock(sel.goalKey, { hasVald: plan.players.some((p) => p.vald.status != null), hasGps: plan.tier.loadSource === "gps", aerobicMode: aerobicTest }) : null;
            const blockScheduled = sel ? scheduledTests.filter((s) => s.test_date >= sel.start && s.test_date < sel.end).sort((a, c) => a.test_date.localeCompare(c.test_date)) : [];
            const offPhaseStart = plan.phases.find((p) => p.key === "offseason")?.start ?? null;

            // Calendar vocabulary
            const dows = is ? ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const stateBg: Record<DayState, string> = { match: "#1C7A4A", session: "#2740E6", off: "#F1F5F9" };
            const stateInk: Record<DayState, string> = { match: "#FFFFFF", session: "#FFFFFF", off: "#475569" };
            const stateLbl: Record<DayState, string> = { match: is ? "Leikur" : "Match", session: is ? "Æfing" : "Session", off: is ? "Frí" : "Off" };
            const typeColor: Record<string, string> = { mechanical: "#A83E28", locomotive: "#15603A", mixed: "#1B2DA8", activation: "#475569", topup: "#0E5E6E", match: "#7A4A06", rest: "#64748B" };
            const tint: Record<string, string> = { mechanical: "#F6E7E1", locomotive: "#E4F1EA", mixed: "#E7EAFB", activation: "#EFEFEF", topup: "#E2F0F2", match: "#FBEFDD", rest: "#FFFFFF" };
            const typeName = (t: string): string => t === "mechanical" ? (is ? "Mekanískt" : "Mechanical") : t === "locomotive" ? (is ? "Hlaup" : "Locomotive") : t === "mixed" ? (is ? "Blandað" : "Mixed") : t === "activation" ? (is ? "Virkjun" : "Activation") : t === "topup" ? (is ? "Áfylling" : "Top-up") : t === "match" ? (is ? "Leikur" : "Match") : "";
            const dash = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));
            const calStart = mondayOf(blkStart);

            // ── The mirror of Meso: Pre-season (summary → Setup → week by week). Every number below comes from the
            // reads this tab always used (blockVolumeView = the old inline maths; the calendar block's own week sums).
            const view = blockVolumeView({
              matchKpis: blkScope === "player" && player ? kpiAvgFromUnit(player.matchUnit) : teamKpiAvg(plan.players),
              numWeeks: blkWeeks, stepPct: blkStepEff, deloadWeek: blkMesoDeload.deloadWeek, light: blkMesoDeload.light,
            });
            const oneMatchNote: Bi = blkScope === "player" && player
              ? { en: `One match = ${player.name}'s typical full match. ${player.matchUnit.windowNote.en}`, is: `Einn leikur = dæmigerður heill leikur ${player.name}. ${player.matchUnit.windowNote.is}` }
              : teamMatchReference(plan.players.map((p) => p.matchUnit)).note;
            const fxN = (n: number) => (is ? String(n).replace(".", ",") : String(n));
            const calWeeks = Array.from({ length: blkWeeks }, (_, i) => mesoCalBlock?.weeks[i] ?? null);
            const weekMults = calWeeks.map((w) => calWeekMultiple(w));
            const sessMM = minMax(calWeeks.map((w) => (w ? sessionsInWeek(w) : null)));
            const loadMM = minMax(weekMults);
            const allFx = plan.fixtures ?? [];
            const blockGames = sel ? gamesInRange(allFx, sel.start, sel.end) : [];
            const lightWeekNo = sel?.deloadWeekStart ? Math.round((utc(sel.deloadWeekStart) - utc(calStart)) / (7 * DAY)) + 1 : null;
            const btn = "h-9 rounded-lg border border-[#d9d5cc] bg-white px-3 text-[13px] font-medium text-[#14181c] hover:bg-slate-50 disabled:opacity-40";
            const h3 = "text-[13px] font-bold text-slate-800";

            return (<div className="space-y-4">
          {selIsPre && (
            <section className="rounded-2xl border border-[#e3e0d8] bg-white px-5 py-5 sm:px-7">
              <p className="text-[16px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{is ? "Þessi lota er á undirbúningstímabilinu." : "This block is in the pre-season."}</p>
              <p className="mt-1 text-[13px] text-slate-600">{is ? "Undirbúningurinn er skipulagður á síðunni Mesó: Undirbúningur, með reglum undirbúnings (leikdagar, álagsstignun, laugardagsleikir)." : "The pre-season is planned on Meso: Pre-season, with the pre-season rules (game days, load ramp, Saturday games)."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setTab("preseason")} className="h-9 rounded-lg bg-[#2740e6] px-3 text-[13px] font-semibold text-white hover:brightness-110">{is ? "Opna Mesó: Undirbúningur →" : "Open Meso: Pre-season →"}</button>
                {seasonBlocks[0] && <button type="button" onClick={() => setBlkStart((todayB ?? seasonBlocks[0]).start)} className={btn}>{is ? `Fara á fyrstu keppnislotu (${shortDate(seasonBlocks[0].start, is)})` : `Go to the first in-season block (${shortDate(seasonBlocks[0].start, is)})`}</button>}
              </div>
            </section>
          )}

          {/* 1 — THE BLOCK AT A GLANCE: verdict → four facts → the block's weeks → the season to pick another block. */}
          {!selIsPre && (
          <InSeasonBlockSummary
            eyebrow={`${sel ? (is ? sel.phase.is : sel.phase.en) : (is ? "Keppnistímabil" : "In-season")} ${plan.seasonYear}${sel ? ` · ${is ? `Lota ${selIdx + 1} af ${seasonBlocks.length}` : `Block ${selIdx + 1} of ${seasonBlocks.length}`}` : ""}`}
            title={sel ? (is ? `${sel.weeks} vikna lota — ${goalName(selGoal)}` : `${sel.weeks}-week block — ${goalName(selGoal)}`) : (is ? "Veldu lotu" : "Pick a block")}
            subLine={sel && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-slate-600">
                <span>{shortDate(sel.start, is)} → {shortDate(endIncl(sel), is)}</span>
                {todayB && sel.start === todayB.start && <span className="rounded-full bg-[#a83e28]/10 px-2 py-0.5 text-[11px] font-bold text-[#a83e28]">{is ? "Núverandi" : "Current"}</span>}
                {sel.provisional && <span title={is ? "Leikjaplanið er ekki skráð fyrir þessa lotu — hún fullmótast þegar leikirnir eru skráðir." : "The fixture list isn't entered for this block — it firms up once the games are entered."} className="rounded-full border border-dashed border-[#de9328] px-2 py-0.5 text-[11px] font-bold text-[#7a4a06]">{is ? "Bráðabirgða" : "Provisional"}</span>}
                {isPlayerScope && <span className="rounded-full bg-[#2740e6]/[0.08] px-2 py-0.5 text-[11px] font-semibold text-[#2740e6]">{is ? `Leikmaður: ${player?.name} · aðeins til sýnis` : `Player: ${player?.name} · read-only`}</span>}
                <span className="w-full text-[13px]">{is ? sel.goal.is : sel.goal.en}</span>
              </p>
            )}
            actions={<>
              <button type="button" onClick={() => prevB && setBlkStart(prevB.start)} disabled={!prevB} aria-label={is ? "Fyrri lota" : "Previous block"} className={btn}>‹ {is ? "Fyrri" : "Prev"}</button>
              <button type="button" onClick={() => nextB && setBlkStart(nextB.start)} disabled={!nextB} aria-label={is ? "Næsta lota" : "Next block"} className={btn}>{is ? "Næsta" : "Next"} ›</button>
              {todayB && sel && sel.start !== todayB.start && <button type="button" onClick={() => setBlkStart(todayB.start)} className="h-9 rounded-lg px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">{is ? "Fara á núverandi" : "Go to current"}</button>}
              <button onClick={exportBlock} disabled={!mesoCalBlock} className="h-9 rounded-lg border border-[#2740e6] bg-white px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-40" title={isPlayerScope ? (is ? `Lotan hans ${player?.name ?? ""} (heildar-PDF er efst á síðunni)` : `${player?.name ?? "His"} block (the full-data PDF is at the top of the page)`) : (is ? "Bara þessa lotu (heildar-PDF er efst á síðunni)" : "Just this block (the full-data PDF is at the top of the page)")}>{is ? "Sækja lotu (PDF)" : "Export block (PDF)"}</button>
              {!isPlayerScope && <button onClick={applyToWeekSetup} disabled={!calBlock || wsBusy} className="h-9 rounded-lg bg-[#2740e6] px-3 text-[13px] font-semibold text-white hover:bg-[#1e34c0] disabled:opacity-40" title={is ? "Dagarnir vistast sjálfkrafa við hverja breytingu — þetta vistar strax núna" : "Days auto-save on every change — this saves now immediately"}>{wsBusy ? (is ? "Vista…" : "Saving…") : wsApplied === "ok" ? (is ? "✓ Vistað" : "✓ Saved") : (is ? "Vista núna" : "Save now")}</button>}
            </>}
            status={<>
              {wsApplied === "ok" && <p className="text-[12px] font-medium text-emerald-700">{is ? "✓ Lotan er komin í Vikuuppsetningu — leikir, æfingar, frí og dagsgerðir." : "✓ The block is in Week Setup — games, sessions, days off and day types."}</p>}
              {wsApplied === "err" && <p className="text-[12px] font-medium text-rose-700">{is ? "Ekki tókst að vista í Vikuuppsetningu." : "Couldn't save to Week Setup."}</p>}
            </>}
            flow={{ readsLabel: is ? "Les" : "Reads", reads: is ? "Makró-fasa · leiki · álagsferil" : "Macro phases · fixtures · load curve", flowsLabel: is ? "Flæðir í" : "Flows to", flows: is ? "Vikuuppsetningu · Today · PDF" : "Week Setup · Today · PDF" }}
            tiles={sel ? [
              { label: is ? "Æfingar / viku" : "Sessions / week", value: sessMM ? (sessMM[0] === sessMM[1] ? sessMM[0] : `${sessMM[0]}–${sessMM[1]}`) : "—", sub: is ? "aldrei 3 í röð · frí á MD+2" : "never 3 in a row · off on MD+2" },
              { label: is ? "Vikuálag (× leikur)" : "Week load (× a match)", value: loadMM ? (loadMM[0] === loadMM[1] ? `${fxN(loadMM[0])}×` : `${fxN(loadMM[0])}–${fxN(loadMM[1])}×`) : "—", sub: is ? `dagarnir lagðir saman · staðalvika ${fxN(view.weekMultiple)}×` : `the days added up · standard week ${fxN(view.weekMultiple)}×` },
              { label: sel.inSeason ? (is ? "Létt vika" : "Light week") : (is ? "Niðurtröppunarvika" : "Deload week"), value: lightWeekNo != null ? `${is ? "Vika" : "Week"} ${lightWeekNo}` : (is ? "Engin" : "None"), sub: sel.deloadWeekStart ? `${shortDate(sel.deloadWeekStart, is)}${sel.inSeason ? (is ? " · magn ~−20%, ákefð haldið" : " · volume ~−20%, intensity kept") : ""}` : (is ? "veldu í Uppsetningu ef þarf" : "pick one in Setup if needed"), warn: !!goalRec?.deloadNow },
              { label: is ? "Leikir" : "Games", value: blockGames.length, sub: blockGames.length ? blockGames.map((d) => shortDate(d, is)).join(" · ") : (is ? "enginn skráður" : "none entered"), warn: !!sel.provisional || blockGames.length === 0 },
            ] : []}
            barsTitle={is ? "Vikuálag lotunnar" : "The block's weekly load"}
            legend={<>
              <BarSwatch color={GOAL_BAR[selGoal]} label={goalName(selGoal)} />
              {calWeeks.some((w) => w?.isDeload) && <BarSwatch color={GOAL_BAR.deload} label={sel?.inSeason ? (is ? "Létt vika" : "Light week") : (is ? "Niðurtröppun" : "Deload")} />}
              <GameDotLegend label={is ? "Leikur" : "Game"} />
            </>}
            bars={sel && weekMults.some((x) => x != null) ? calWeeks.map((w, i): MesoBar => {
              const mon = w?.weekStart ?? isoAdd(calStart, i * 7);
              const g = gamesInWeek(allFx, mon);
              const x = weekMults[i];
              return {
                key: mon, value: x ?? 0, color: w?.isDeload ? GOAL_BAR.deload : GOAL_BAR[selGoal], label: x != null ? `${fxN(x)}×` : "",
                title: `${is ? "Vika" : "Week"} ${i + 1} · ${shortDate(mon, is)}${x != null ? ` · ${fxN(x)}×` : ""}${w ? ` · ${is ? w.intent.is : w.intent.en}` : ""}`,
                weekNo: i + 1, game: g.length ? "entered" : null, gameTitle: g.length ? `${is ? "Leikur" : "Game"} · ${g.map((d) => shortDate(d, is)).join(", ")}` : "",
              };
            }) : []}
            barsNote={is ? "Súla = það sem æfingadagar vikunnar leggja saman, sem margfeldi af einum leik (leikurinn sjálfur ekki talinn)." : "A bar = what the week's training days add up to, as a multiple of one match (the match itself not counted)."}
            strip={seasonBlocks.length > 0 && (
              <div className="mt-2 border-t border-[#ece9e2] pt-4">
                <h3 className="text-[14px] font-semibold text-[#14181c]">{is ? "Lotur tímabilsins" : "The season's blocks"}</h3>
                <div className="mt-2 overflow-x-auto">
                  <div className="relative min-w-[720px]">
                    <div className="relative h-5">
                      {monthMarks.map((m, i) => <span key={i} className="absolute top-0 whitespace-nowrap pl-1 text-[11px] font-semibold capitalize text-slate-500" style={{ left: `${m.pct}%` }}>{m.label}</span>)}
                    </div>
                    <div className="relative h-11">
                      {seasonBlocks.map((b) => {
                        const g: BlockGoalKey = (blockGoals[b.start] as BlockGoalKey | undefined) ?? b.goalKey;
                        const on = sel?.start === b.start;
                        const l = pctOf(b.start), r = pctOf(b.end);
                        return (
                          <button key={b.index} type="button" onClick={() => setBlkStart(b.start)} aria-pressed={on}
                            title={`${shortDate(b.start, is)}–${shortDate(endIncl(b), is)} · ${goalName(g)} · ${is ? b.phase.is : b.phase.en}${b.provisional ? (is ? " · bráðabirgða (leikjaplan ekki skráð)" : " · provisional (fixture list not entered)") : ""}`}
                            className="absolute inset-y-0 px-px" style={{ left: `${l}%`, width: `${r - l}%` }}>
                            <span className={`flex h-full items-center justify-center overflow-hidden rounded-md px-1 text-[11px] font-semibold text-white transition ${b.provisional ? "border-2 border-dashed border-white/80" : ""} ${on ? "ring-2 ring-slate-900 ring-offset-2" : "opacity-60 hover:opacity-90"}`} style={{ background: GC[g] }}>
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
                </div>
                <p className="mt-2 text-[12px] text-slate-600">{is ? "Smelltu á lotu til að skipuleggja hana. Rauða línan er í dag. Lengd lotanna kemur úr Makró." : "Click a block to plan it. The red line is today. Block lengths come from Macro."}{" "}<button type="button" onClick={() => setTab("season")} className="font-medium text-[#2740e6] hover:underline">{is ? "breyta í Makró" : "change in Macro"}</button>{compStartM && mesoBlocks.some(isPreBlock) && <> · {is ? "Undirbúningslotur eru á síðunni" : "Pre-season blocks are on"} <button type="button" onClick={() => setTab("preseason")} className="font-semibold text-[#2740e6] hover:underline">{is ? "Mesó: Undirbúningur →" : "Meso: Pre-season →"}</button></>}</p>
              </div>
            )}
            warnings={[
              ...(() => {
                // FIXTURES_PENDING: the fixture list isn't entered past the last game → the blocks from there are provisional.
                if (!seasonBlocks.some((b) => b.provisional) || !compStartM) return [];
                const comp = allFx.filter((d) => d >= compStartM).sort();
                const last = comp.length ? comp[comp.length - 1] : null;
                const from = last ? isoAdd(mondayOf(last), 7) : mondayOf(compStartM);
                const body = isBasketball ? "KKÍ" : "KSÍ";
                return [<span key="fx"><b>{is ? `Leikjaplan ${body} ekki komið.` : `The ${body} fixture list isn't in yet.`}</b>{" "}
                  <span className="font-normal">{is
                    ? `${comp.length} ${comp.length === 1 ? "leikur skráður" : "leikir skráðir"}${last ? ` (síðast ${shortDate(last, is)})` : ""}. Frá viku ${shortDate(from, is)} er enginn leikur skráður, svo lotur sem ná þangað eru bráðabirgða: ${cadence} vikna lotur í keppnistakti (Framkvæmd), án leikja. Þær fullmótast þegar leikirnir eru skráðir.`
                    : `${comp.length} ${comp.length === 1 ? "game entered" : "games entered"}${last ? ` (last ${shortDate(last, is)})` : ""}. From the week of ${shortDate(from, is)} no game is entered, so the blocks reaching there are provisional: ${cadence}-week blocks in compete mode (Realization), with no games. They firm up once the games are entered.`}</span>{" "}
                  <button type="button" onClick={() => setTab("season")} className="font-semibold text-[#2740e6] hover:underline">{is ? "Skrá leiki í Makró →" : "Enter games in Macro →"}</button></span>];
              })(),
              ...(sel?.flag ? [<span key="flag">{is ? sel.flag.is : sel.flag.en}</span>] : []),
              ...(goalRec?.deloadNow ? [<span key="fatigue">{activeBlock?.inSeason ? (is ? "Þreytumerki — íhugaðu létta viku (markmiðið helst)." : "Fatigue signal — consider a light week (the goal is unchanged).") : (is ? "Þreytumerki — færðu niðurtröppunar-vikuna framar (markmiðið helst)." : "Fatigue signal — pull the deload week forward (the goal is unchanged).")}</span>] : []),
            ]}
          />
          )}

          {/* What the coach wants from this block, in their own words → rule-based advice (planIntent/). Football, team scope. */}
          {sel && !isPlayerScope && !isBasketball && selGoal !== "deload" && (
            <PlanIntentCard scope="block" start={mondayOf(sel.start)} weeks={sel.weeks} blockGoal={selGoal}
              phaseHint={offPhaseStart && sel.start >= offPhaseStart ? "offseason" : sel.inSeason ? "inseason" : "preseason"} />
          )}

          {plan.phases.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900">{is ? "⚠ Engir leikir/akkeri í Makró enn — stilltu Makró-lotuna fyrst (undirbúningsdag, leikjaskrá, niðurtröppun). Lotan hér reiknast úr því." : "⚠ No Macro anchors/fixtures yet — set the Macro Cycle first (pre-season date, fixtures, deload cadence). This block is computed from it."}</p>}

          {/* 2 — SETUP: the block's controls → the standard week per variable → the goal and tests → the measured
              load behind a toggle (jargon — TMr, ACWR — off the primary view). */}
          {!selIsPre && (
          <section className="flex flex-col gap-4 rounded-2xl border border-[#e3e0d8] bg-white px-5 pb-6 pt-5 sm:px-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{is ? "Uppsetning" : "Setup"}</h2>
              <span className="flex flex-wrap items-center gap-3 text-[12px] text-slate-600">
                {autoSave && <span className={`font-medium ${autoSave === "err" ? "text-[#a83e28]" : autoSave === "saving" ? "text-slate-500" : "text-emerald-700"}`}>{autoSave === "saving" ? (is ? "Vista…" : "Saving…") : autoSave === "err" ? (is ? "⚠ Vistun mistókst" : "⚠ Save failed") : (is ? "✓ Vistað sjálfkrafa" : "✓ Saved automatically")}</span>}
                <span>{is ? "Hver breyting endurreiknar vikur lotunnar" : "Every change re-plans the block's weeks"}</span>
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {sel && sel.phase.en !== "Off-season break" ? (<>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="is-length" className="text-[12px] font-medium text-slate-700">{is ? "Lotulengd" : "Block length"}{sel.lengthPinned && <span className="ml-1.5 rounded-full bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2740e6]">{is ? "stillt" : "set"}</span>}</label>
                  <select id="is-length" value={blockLenOv[String(sel.index)] ?? blockLenOv[sel.start] ?? ""} onChange={(e) => setBlockLength(sel.start, e.target.value === "" ? null : Number(e.target.value))} className="h-11 rounded-lg border border-[#d6d3cc] bg-white px-3 text-[14px]">
                    <option value="">{is ? `Sjálfgefið (${cadence}v)` : `Auto (${cadence}w)`}</option>
                    {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {is ? "vikur" : "weeks"}</option>)}
                  </select>
                  <span className="text-[11px] text-slate-600">{is ? "Sjálfgefið úr Makró — hnekktu þar sem þarf" : "Auto from Macro — override where it matters"}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="is-light" className="text-[12px] font-medium text-slate-700">{sel.inSeason ? (is ? "Létt vika" : "Light week") : (is ? "Niðurtröppunarvika" : "Deload week")}{sel.deloadPinned && <span className="ml-1.5 rounded-full bg-[#de9328]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#8a5a10]">{is ? "fest" : "pinned"}</span>}</label>
                  <select id="is-light" value={blockDeloadOv[sel.start] ?? ""} onChange={(e) => setBlockDeload(sel.start, e.target.value || null)} className="h-11 rounded-lg border border-[#d6d3cc] bg-white px-3 text-[14px]">
                    <option value="">{sel.inSeason ? (is ? "Engin (sjálfgefið)" : "None (default)") : is ? `Sjálfgefið${sel.deloadWeekStart && !sel.deloadPinned ? ` (${shortDate(sel.deloadWeekStart, is)})` : ""}` : `Auto${sel.deloadWeekStart && !sel.deloadPinned ? ` (${shortDate(sel.deloadWeekStart, is)})` : ""}`}</option>
                    {Array.from({ length: sel.weeks }, (_, w) => isoAdd(sel.start, w * 7)).map((mon) => <option key={mon} value={mon}>{is ? "Vika" : "Week of"} {shortDate(mon, is)}</option>)}
                  </select>
                  <span className="text-[11px] text-slate-600">{sel.inSeason ? (is ? "Engin sjálfvirk — magn ~−20%, ákefð haldið" : "None automatic — volume ~−20%, intensity kept") : (is ? "Magn ~−40% í niðurtröppun" : "Volume ~−40% in a deload")}</span>
                </div>
              </>) : <div className="hidden sm:block lg:col-span-2" />}
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="is-step" className="text-[12px] font-medium text-slate-700">{is ? "Stig/viku %" : "Step/wk %"}</label>
                <input id="is-step" type="number" min={0} max={15} value={blkStep} onChange={(e) => { const v = Math.max(0, Math.min(15, Number(e.target.value) || 0)); setBlkStep(v); persistOverridePatch({ stepPct: v }); }} className="h-11 rounded-lg border border-[#d6d3cc] bg-white px-3 text-[14px] tabular-nums" />
                <span className="text-[11px] text-slate-600">{blkHold ? (is ? "Haldið: keppnislota heldur staðalvikunni" : "Held: a competitive block keeps the standard week") : (is ? "Bara í uppbyggingarlotum" : "Build-up blocks only")}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="is-scope" className="text-[12px] font-medium text-slate-700">{is ? "Umfang" : "Scope"}</label>
                <select id="is-scope" value={blkScope} onChange={(e) => setBlkScope(e.target.value as typeof blkScope)} className="h-11 rounded-lg border border-[#d6d3cc] bg-white px-3 text-[14px]"><option value="team">{is ? "Lið" : "Team"}</option><option value="player">{is ? `Leikmaður: ${player?.name ?? ""}` : `Player: ${player?.name ?? ""}`}</option></select>
                <span className="text-[11px] text-slate-600">{is ? "Leikmaður valinn í Leikmenn-flipanum" : "The player picked in the Players tab"}</span>
              </div>
            </div>
            {(sel?.inSeason || blkHold || blkScope === "player") && (
              <ul className="space-y-0.5 text-[12px] text-slate-600">
                {sel?.inSeason && <li>{is ? IN_SEASON_DELOAD_NOTE.is : IN_SEASON_DELOAD_NOTE.en}</li>}
                {blkHold && <li>{is ? "Þessi keppnislota heldur staðalvikunni allar vikur: lítil breyting milli lota á keppnistímabili (Malone 2015; Oliveira 2019; athugunarrannsóknir). Stig/viku gildir bara í uppbyggingarlotum (Uppsöfnun, Umbreyting)." : "This competitive block holds the standard week every week: little change between in-season blocks (Malone 2015; Oliveira 2019; observational). Step/wk only applies to build-up blocks (Accumulation, Transmutation)."}</li>}
                {blkScope === "player" && <li>{is ? `Einstaklingsmiðuð lota (leik-miðuð, þök/trim/áhersla) fyrir leikmann valinn í „Leikmenn“-flipanum${player ? ` (${player.name})` : ""} — les-only (breyttu dagsgerðum í Liðs-umfangi). Skiptu um leikmann í Leikmenn-flipanum.` : `The individualised block (match-anchored, caps/trim/steer) for the player selected in the "Players" tab${player ? ` (${player.name})` : ""} — read-only (edit day-types in Team scope). Change the player in the Players tab.`}</li>}
              </ul>
            )}
            <details className="text-[12px] text-slate-600">
              <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-800">{is ? "Fleiri stillingar (upphaf, vikur, grunn-álag)" : "More block settings (start, weeks, base load)"}</summary>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="flex min-w-0 flex-col gap-1.5 text-[12px] font-medium text-slate-700">{is ? "Upphaf" : "Start"}<input type="date" value={blkStart} onChange={(e) => setBlkStart(e.target.value)} className="h-11 rounded-lg border border-[#d6d3cc] bg-white px-3 text-[14px] font-normal tabular-nums" /></label>
                <div className="flex min-w-0 flex-col gap-1.5 text-[12px] font-medium text-slate-700">{is ? "Vikur (úr Makró)" : "Weeks (from Macro)"}<div className="flex h-11 items-center rounded-lg border border-[#e3e0d8] bg-[#f8f7f3] px-3 text-[14px] font-normal text-slate-700">{blkWeeks}{!activeBlock?.inSeason && <span className="ml-1 text-[12px] text-slate-500">· {is ? "niðurtr. hverja" : "deload every"} {cadence}</span>}</div></div>
                <label className="flex min-w-0 flex-col gap-1.5 text-[12px] font-medium text-slate-700">{is ? "Grunn-álag %" : "Base overload %"}<input type="number" min={80} max={130} value={blkBase} onChange={(e) => setBlkBase(Number(e.target.value))} className="h-11 rounded-lg border border-[#d6d3cc] bg-white px-3 text-[14px] font-normal tabular-nums" /></label>
              </div>
              <p className="mt-2">{is ? "Leikir og frí eru sett í Makró-lotu." : "Games and breaks are set in the Macro cycle."}{" "}<button type="button" onClick={() => setTab("season")} className="font-semibold text-[#2740e6] hover:underline">{is ? "Opna Makró →" : "Open Macro →"}</button></p>
            </details>

            {/* The standard week, every variable as × a match beside the research range (read-only mirror of the
                pre-season "Load per variable" table). */}
            <InSeasonVariableTable is={is} view={view} oneMatchNote={oneMatchNote} hold={blkHold} numWeeks={blkWeeks} playerName={isPlayerScope ? player?.name ?? null : null} />

            {/* The block's goal (coach's call; the system recommends) and the tests that fit it. */}
            <div className="mt-2 grid min-w-0 items-start gap-6 lg:grid-cols-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={h3}>{is ? "Markmið lotunnar" : "Block goal"}</h3>
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
                        className={`flex min-h-[48px] flex-col items-center justify-center rounded-lg px-1 text-center text-[12px] font-bold ${on ? "text-white" : "border border-[#d9d5cc] bg-white text-slate-800 hover:bg-slate-50"}`}
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
                {goalRec && (<>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-slate-700">
                    {goalRec.reasons.slice(0, 3).map((r, i) => <li key={i}>{is ? r.is : r.en}</li>)}
                  </ul>
                  <p className="mt-1.5 text-[12px] text-slate-600">{is ? "Annar kostur" : "Alternative"}: <b>{goalName(goalRec.alternative.goal)}</b> — {is ? goalRec.alternative.when.is : goalRec.alternative.when.en}</p>
                  <p className="mt-1.5 text-[11px] text-slate-500">{is ? "Val á lotu-markmiði er þjálfaramat — þetta er grundaður sjálfgefinn kostur úr eigin leikjum + álagi liðsins, ekki fyrirmæli (Issurin 2010; Little & Buchheit). Ekki sjálfvirkt sett." : "Block-goal choice is a coaching judgment — a grounded default from the team's own fixtures + load, not a mandate (Issurin 2010; Little & Buchheit). Not auto-applied."}</p>
                </>)}
              </div>

              {sel && bt && (bt.protocols.length > 0 || blockScheduled.length > 0) && (
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={h3}>{is ? "Próf í lotunni" : "Testing in this block"}</h3>
                    <a href="?tab=testing" onClick={(e) => { e.preventDefault(); setTab("testing"); }} className="ml-auto text-[12px] font-semibold text-[#2740e6] hover:underline">{is ? "Skipuleggja →" : "Schedule →"}</a>
                  </div>
                  {blockScheduled.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {blockScheduled.map((s) => <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#1C7A4A] px-2 py-0.5 text-[12px] font-semibold text-white"><span className="h-2 w-2 rotate-45 bg-white" />{shortDate(s.test_date, is)} · {is ? testShortName(s.test_key, aerobicTest).is : testShortName(s.test_key, aerobicTest).en}</span>)}
                    </div>
                  ) : <p className="mt-1 text-[12px] text-slate-500">{is ? "Engin próf skráð í þessari lotu." : "No tests scheduled in this block."}</p>}
                  {bt.protocols.length > 0 && (<>
                    <p className="mt-2 text-[13px] font-medium text-slate-700">{is ? bt.when.is : bt.when.en}</p>
                    <ul className="mt-1 space-y-1">
                      {bt.protocols.map((p) => <li key={p.key} className="text-[12px] text-slate-600"><b className="text-slate-800">{is ? p.name.is : p.name.en}</b> — {is ? p.prescribes.is : p.prescribes.en} <span className="text-slate-500">(<CiteRefs text={p.cite} is={is} />)</span></li>)}
                    </ul>
                  </>)}
                </div>
              )}
            </div>

            {/* Measured load (TMr, acute trend, ACWR) — sport-science terms, so behind a toggle. */}
            {sel && (
              <details className="text-[12px] text-slate-600">
                <summary className="cursor-pointer select-none font-semibold text-[#2740e6] hover:underline">{is ? "Sýna mælt álag lotunnar (TMr, bráðaálag)" : "Show the block's measured load (TMr, acute load)"}</summary>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div title={is ? "Vikuálag sem margfeldi af einu leikálagi (TMr)" : "Weekly load as a multiple of one match (TMr)"}>
                    <div className="text-[12px] font-semibold text-slate-500">{is ? "Vikuálag / leik (TMr)" : "Week ÷ match (TMr)"}</div>
                    <div className="text-[20px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{sel.tmr != null ? `${sel.tmr}×` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-slate-500">{is ? "Magn-mark" : "Volume target"}</div>
                    <div className="text-[20px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{sel.volumeTargetPct != null ? `${sel.volumeTargetPct}%` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-slate-500">{is ? "Bráðaálag" : "Acute load"}</div>
                    <div className="text-[15px] font-bold text-[#14181c]">{trendWord(sel.loadTrend)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-slate-500">{sel.inSeason ? (is ? "Létt vika" : "Light week") : (is ? "Niðurtröppunarvika" : "Deload week")}</div>
                    <div className="text-[15px] font-bold text-[#14181c]">{sel.deloadWeekStart ? shortDate(sel.deloadWeekStart, is) : sel.inSeason ? (is ? "Engin" : "None") : "—"}{sel.deloadNow && !sel.inSeason && <span className="ml-1 text-[12px] font-semibold text-amber-800">{is ? "· færð framar" : "· pulled fwd"}</span>}</div>
                  </div>
                </div>
                <p className="mt-2 text-[12px] text-slate-500">{blkHold
                  ? (is ? "Leikurinn er einingin: TMr = vikuálag ÷ eitt leikálag. Keppnislota heldur staðalvikunni; við lesum bráðaálags-þróun + viðbragð — ekki ACWR-band." : "The match is the unit: TMr = weekly load ÷ one match's load. A competitive block holds the standard week; we read the acute-load trend + readiness — not an ACWR band.")
                  : (is ? "Leikurinn er einingin: TMr = vikuálag ÷ eitt leikálag. Við röppum TMr skynsamlega og lesum bráðaálags-þróun + viðbragð — ekki ACWR-band." : "The match is the unit: TMr = weekly load ÷ one match's load. We ramp TMr sensibly and read the acute-load trend + readiness — not an ACWR band.")}{(() => { const n = teamMatchUnitNote(plan.matchLoad, fullMatchPl, plan.tier.loadSource === "srpe" ? "AU" : "PL"); return n && <> {is ? n.is : n.en}</>; })()}</p>
                {sel.acwr != null && (
                  <details className="mt-1">
                    <summary className="cursor-pointer py-1 text-[12px] text-slate-500 hover:text-slate-700">{is ? `ACWR ${sel.acwr} — umdeilt viðmið` : `ACWR ${sel.acwr} — contested view`}</summary>
                    <p className="mt-0.5 text-[12px] text-slate-500">{is ? sel.acwrNote.is : sel.acwrNote.en}</p>
                  </details>
                )}
              </details>
            )}
          </section>
          )}
          {blkPopulated.length > 0 && !selIsPre && (
          <div className="flex flex-col gap-4">
          {/* The in-season rules this page follows (the calendar enforces both; a day you set against them stays, marked ⚠). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[#1c7a4a]/30 bg-[#1c7a4a]/[0.05] px-3 py-2 text-[12.5px] text-slate-700">
            <b className="text-slate-900">{is ? "Reglur keppnistímabils:" : "In-season rules:"}</b>
            <span>{is ? "Aldrei þrjár æfingar í röð" : "Never three sessions in a row"}</span>
            <span className="text-slate-400">·</span>
            <span>{is ? "Alltaf frí á MD+2" : "Always off on MD+2"}</span>
            <span className="text-slate-400">·</span>
            <span>{is ? "Aðeins skráðir leikir (úr Makró)" : "Only entered games (from Macro)"}</span>
            <span className="w-full text-[11px] text-slate-500">{is ? "Dagur sem þú setur gegn reglu helst og fær ⚠." : "A day you set against a rule stays and gets ⚠."} <span className="font-mono">{THREE_IN_A_ROW_RULE} · INSEASON_MD2_OFF</span> · {is ? "MicroPulse-regla" : "MicroPulse rule"}; Buchheit 2023b</span>
          </div>

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
              {isPlayerScope && (
                <p className="mt-1.5 rounded-lg bg-[#2740e6]/[0.06] px-2.5 py-1.5 text-[12px] text-[#2740e6]">{is ? `Leikmanns-umfang (${player?.name}) — þetta er lotan HANS, einstaklingsmiðuð (leik-miðuð, þök/trim/áhersla). Les-only: skiptu í Liðs-umfang til að breyta dagsgerðum.` : `Player scope (${player?.name}) — this is HIS block, individualised (match-anchored, caps/trim/steer). Read-only: switch to Team scope to edit day-types.`}</p>
              )}
              {!isPlayerScope && !isBasketball && (
                <StrengthDeliveryNote delivery={delivery} season={offPhaseStart != null && calStart >= offPhaseStart ? "build" : "maintain"} is={is} className="mt-2" />
              )}
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
                    const w = mesoCalBlock?.weeks[i] ?? null;
                    const wkOff = offPhaseStart != null && isoAdd(calStart, i * 7) >= offPhaseStart;
                    return (
                      <React.Fragment key={i}>
                        <div className="flex flex-col justify-center pr-1" title={wkOff ? (is ? "Off-season þróunarvika" : "Off-season development week") : w ? `${is ? w.intent.is : w.intent.en}${w.capNote ? ` — ${is ? w.capNote.is : w.capNote.en}` : ""}` : undefined}>
                          <span className="text-[13px] font-bold text-slate-900">{is ? "V" : "W"}{i + 1}</span>
                          {w && <span className={`text-[11px] font-bold ${w.isDeload ? "text-[#9A5B06]" : "text-[#1B2DA8]"}`}>{w.isLight ? (is ? "létt" : "light") : w.isDeload ? (is ? "niðurtr." : "deload") : `×${w.mult.toFixed(2)}`}</span>}
                          {wkOff && <span className="mt-0.5 w-fit rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-700">Off-s.</span>}
                          {!wkOff && w?.capNote && <span className="text-[11px] font-semibold text-amber-800">⚑ {is ? "þak" : "cap"}</span>}
                          {confirmMark(isoAdd(calStart, i * 7))}
                          {deliveryStd && !isPlayerScope && !isBasketball && (() => { const dwk = deliveryWeek(isoAdd(calStart, i * 7)); return dwk && !programmeCovers(dwk) && <span className="text-[10px] font-semibold text-[#8a5a12]" title={is ? NO_PROGRAMME.is : NO_PROGRAMME.en}>⚠ {is ? "ekkert kerfi" : "no programme"}</span>; })()}
                        </div>
                        {Array.from({ length: 7 }, (_, d) => {
                          const iso = isoAdd(calStart, i * 7 + d);
                          const st: DayState = blkSkeleton[iso] ?? "off";
                          const cd = w?.days[d] ?? null;
                          const isToday = iso === todayIso;
                          const ima = cd && cd.type !== "rest" ? imaLine(cd, is, plan?.tier?.tier === "pro") : "";
                          const ro = isPlayerScope; // player scope is read-only (edit the structure in Team scope)
                          return (
                            <div key={d} className={`flex min-w-0 flex-col overflow-hidden rounded-lg border ${isToday ? "border-[#a83e28] ring-1 ring-[#a83e28]" : "border-slate-200"} ${wkOff ? "opacity-90" : ""}`}>
                              <button type="button" onClick={ro ? undefined : () => cycleDay(iso)} disabled={ro} title={`${shortDate(iso, is)} — ${stateLbl[st]}${st === "match" ? (is ? " (úr Leikjaskrá)" : " (from Fixtures)") : ""}${ro ? (is ? " · les-only (breyttu í Liðs-umfangi)" : " · read-only (edit in Team scope)") : ""}`}
                                className={`flex min-h-[30px] items-center justify-between gap-1 px-1.5 text-[12px] font-semibold ${ro ? "cursor-default" : ""}`} style={{ background: stateBg[st], color: stateInk[st] }}>
                                <span className="tabular-nums">{new Date(`${iso}T00:00:00Z`).getUTCDate()}</span>
                                <span className="truncate text-[11px]">{stateLbl[st]}</span>
                              </button>
                              <button type="button" onClick={ro ? undefined : () => setDayModal(iso)} disabled={ro} className={`flex min-h-[40px] flex-col items-start justify-center px-1.5 py-1 text-left ${ro ? "cursor-default" : "hover:brightness-95"}`}
                                style={{ background: cd ? tint[cd.type] : "#FFFFFF" }}
                                title={!cd || cd.type === "rest" ? (ro ? (is ? "Les-only — breyttu dagsgerð í Liðs-umfangi" : "Read-only — change the day-type in Team scope") : (is ? "Smelltu til að breyta dagsgerð" : "Click to change the day-type")) : `${is ? cd.label.is : cd.label.en} · PL ${dash(cd.load)}${ima ? ` · ${ima}` : ""}`}>
                                {cd && cd.type !== "rest" ? (<>
                                  {ruleBreaks.has(iso) && <span className="w-full truncate rounded bg-[#de9328]/20 px-1 text-[10px] font-bold text-[#7a4a06]" title={is ? ruleBreaks.get(iso)!.is : ruleBreaks.get(iso)!.en}>⚠ {is ? "gegn reglu" : "against rule"}</span>}
                                  <span className="w-full truncate text-[12px] font-bold" style={{ color: typeColor[cd.type] }}>{typeName(cd.type)}</span>
                                  <span className="text-[11px] tabular-nums text-slate-600">{dash(cd.load)}</span>
                                  {(cd.accel != null || cd.decel != null) && <span className="text-[10px] tabular-nums text-slate-500" title={plan?.tier?.tier === "pro" ? (is ? "IMA hröðun / hemlun, fjöldi" : "IMA accelerations / decelerations, count") : (is ? "Hröðun / hemlun (GPS), fjöldi" : "Accelerations / decelerations (GPS), count")}>Acc/Dec {cd.accel ?? "–"}/{cd.decel ?? "–"}</span>}
                                  {cd.fr != null && <span className="text-[10px] tabular-nums text-slate-500" title={is ? "Vegalengd í löngum samfelldum hlaupum á leikhraða (≥18 sek, 11 km/klst+; IMA Free Running), metrar. Skokk telst ekki með. Ekki sprettir" : "Distance in long continuous runs at match pace (≥18 s, 11 km/h+; IMA Free Running), metres. Jogs do not count. Not sprinting"}>FR {cd.fr} m</span>}
                                  {cd.stride != null && <span className="text-[10px] tabular-nums text-slate-500" title={is ? "Skref í löngum samfelldum hlaupum á leikhraða (≥18 sek, 11 km/klst+; IMA Free Running), fjöldi. Skokk telst ekki með" : "Strides in long continuous runs at match pace (≥18 s, 11 km/h+; IMA Free Running), count. Jogs do not count"}>{is ? "Skref" : "Stride"} {cd.stride}</span>}
                                  {cd.cod != null && <span className="text-[10px] tabular-nums text-slate-500" title={is ? "IMA stefnubreytingar, fjöldi" : "IMA CoD (change of direction), count"}>CoD {cd.cod}</span>}
                                  {deliveryStd && !isPlayerScope && !isBasketball && (() => { const pt = programmeTitle(deliveryWeek(isoAdd(calStart, i * 7)), cd.md); return pt && <span className="w-full truncate text-[10px] font-semibold text-[#55389e]" title={`${is ? "Styrkur (Custom Programme)" : "Strength (Custom Programme)"}: ${pt}`}>{pt}</span>; })()}
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
              {!isPlayerScope && (() => { const n = teamMatchUnitNote(blkUnit.load, fullMatchPl); return n && <p className="mt-3 text-[12px] font-medium text-slate-700">{is ? `Leikreiturinn: ${n.is} Æfingadagarnir skalast frá fyrri tölunni.` : `The Match cell: ${n.en} Training days scale from the first number.`}</p>; })()}
              <p className="mt-3 text-[12px] text-slate-500">{is ? "Talan = Player Load; „FR“ = vegalengd í löngum samfelldum hlaupum (≥18 sek, IMA Free Running, metrar) og „Skref“ = skref í löngum hlaupum (≥18 sek, IMA Free Running) fylgja hlaupa-ásnum — ekki sprettir (sprettir = GPS); „CoD“ = IMA stefnubreytingar og „Acc/Dec“ = hröðun/hemlun (IMA á Pro) fylgja vélræna ásnum — þar sem gögnin eru til. " + (blkHold ? "Keppnislota heldur staðalvikunni, ekkert þrep milli vikna; hvert mæligildi við leikþak (⚑ sýnir hvað heldur vikunni)." : "Vikuálagið er stigvaxandi per mæligildi (magn hækkar hraðar en háhraði; hvert við leikþak — ⚑ sýnir hvað heldur vikunni).") + " Lýsandi — upphafspunktur, ekki viðmið. Á keppnistímabili mest 2 æfingar í röð og frí á MD+2; utan þess aldrei fleiri en 3 í röð. Malone 2017 · Gabbett 2016 · Figueiredo · Owen 2017 · Teixeira 2021." : "The number = Player Load; \"FR\" = distance in long continuous runs (≥18 s, IMA Free Running, metres) and \"Stride\" = strides in long runs (≥18 s, IMA Free Running) follow the running axis — not sprinting (sprint = GPS); \"CoD\" = IMA change of direction and \"Acc/Dec\" = accelerations/decelerations (IMA on Pro) follow the mechanical axis — where the feed carries them. " + (blkHold ? "A competitive block holds the standard week, no step between weeks; each KPI ceilings at match (⚑ shows what held the week)." : "Weekly overload ramps per-KPI (volume climbs faster than HSR; each ceilings at match — ⚑ shows what held the week).") + " Descriptive — a starting point, not a norm. In season at most 2 sessions in a row and off on MD+2; outside it never more than 3 in a row. Malone 2017 · Gabbett 2016 · Figueiredo · Owen 2017 · Teixeira 2021."}</p>
              {(() => {
                const pct = (x: number) => Math.round(x * 100);
                const std = CAL_SHARE_IMA;
                const cal = plan.imaCalibration;
                const own = cal?.ownVars ?? [];
                const [lo, hi] = CAL_SHARE_IMA_REF.mechanical.range;
                const name: Record<ImaVar, string> = { accel: "Acc", decel: "Dec", cod: "CoD" };
                const cmp = cal ? compareImaNormToReference(cal).mechanical : {};
                const list = (s: ImaNormStatus) => own.filter((k) => cmp[k] === s).map((k) => name[k]).join(", ");
                const above = list("above"), below = list("below");
                const rangeTxt = `${pct(lo)}–${pct(hi)}%`;
                const verdict = is
                  ? (!above && !below ? `innan birta bilsins ${rangeTxt}` : `${[above && `${above} yfir`, below && `${below} undir`].filter(Boolean).join(" og ")} birta bilinu ${rangeTxt}`)
                  : (!above && !below ? `inside the published ${rangeTxt}` : `${[above && `${above} above`, below && `${below} below`].filter(Boolean).join(" and ")} the published ${rangeTxt}`);
                return (
                  <div className="mt-1 space-y-0.5 text-[12px] text-slate-500">
                    <p>{is
                      ? `Acc/Dec/CoD-markmið fylgja birtum rannsóknum: stærsti dagur um ${pct(std.mechanical.accel)}% af leik, miðja vikunnar um ${pct(std.mixed.accel)}%, hlaupadagur um ${pct(std.locomotive.accel)}%, dagurinn fyrir leik um ${pct(std.activation.accel)}%. Vikustigun bætist ofan á.`
                      : `Acc/Dec/CoD targets follow published research: biggest day about ${pct(std.mechanical.accel)}% of a match, mid-week about ${pct(std.mixed.accel)}%, running day about ${pct(std.locomotive.accel)}%, day before about ${pct(std.activation.accel)}%. Weekly progression comes on top.`}</p>
                    {cal && own.length > 0 && (
                      <p>{is
                        ? `Stærstu dagar liðsins ykkar ná ${own.map((k) => `${pct(cal.shares.mechanical[k])}%`).join(" / ")} af leik (${own.map((k) => name[k]).join("/")}): ${verdict}. Byggt á ${cal.nDays} æfingadögum og ${cal.nMatchRows} heilum leikframmistöðum.`
                        : `Your team's biggest days reach ${own.map((k) => `${pct(cal.shares.mechanical[k])}%`).join(" / ")} of a match (${own.map((k) => name[k]).join("/")}): ${verdict}. Based on ${cal.nDays} training days and ${cal.nMatchRows} near-full match appearances.`}</p>
                    )}
                  </div>
                );
              })()}
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
                <p className="mt-1.5 text-[12px] text-slate-500">{is
                  ? "Acc/Dec/CoD-viðmiðin: rannsóknirnar lýsa því hvað úrvalslið gera, þær sanna ekki hvað er best. Þess vegna eru markmiðin miðgildi innan bils, hlutfall af leik liðsins sjálfs, því tölur milli mælitækja eru ekki sambærilegar. Hlaupadagurinn byggir á ráðleggingum Buchheit fyrir fagfólk, ekki mælingum, og engin rannsókn mælir IMA CoD beint, svo það fylgir sama hlutfalli. Stevens 2017 · Martín-García 2018 · Clemente 2019 · Silva 2022."
                  : "The Acc/Dec/CoD reference: these studies describe what elite teams do, they do not prove what is best. So each target is a midpoint inside a range, as a share of your own match, because counts from different devices are not comparable. The running day rests on Buchheit's practitioner guidance rather than measurement, and no study measures IMA CoD directly, so it follows the same share. Stevens 2017 · Martín-García 2018 · Clemente 2019 · Silva 2022."}</p>
                <p className="mt-1.5 text-[12px] text-slate-500">{is
                  ? "Háhraðahlaup og kröftugar hraðaaukningar og hemlanir byggja á sömu hugsun. Hlaupadagurinn er settur á um 45% af leik í háhraða, viðmið MicroPulse nálægt stærstu æfingadögum sem hafa verið mældir, en engin rannsókn einangrar hreinan hlaupadag, svo lið sem vill meira getur farið hærra. Sprettmarkmiðin eru óvissust, aðeins stærsti dagurinn er mældur. Stevens 2017 · Martín-García 2018 · Dalen 2019 · Gualtieri 2023."
                  : "High-speed running and the hard accelerations and braking follow the same idea. The running day is set at about 45% of a match at high speed, MicroPulse's line near the biggest training days measured, but no study isolates a pure running day, so a team that wants more can go higher. Sprint targets are the least certain, only the biggest day is measured. Stevens 2017 · Martín-García 2018 · Dalen 2019 · Gualtieri 2023."}</p>
                <p className="mt-1.5 text-[12px] text-slate-500">Issurin 2010 (block periodisation) · Owen 2017 (positional mesocycle, MD taper) · Oliveira 2019 (congested-week variants) · Oliveira 2021 (ACWR/monotony on sRPE+HSR) · Teixeira 2021 (monitoring) · Martín-García 2018 (%-of-match-demand). {is ? "Lýsandi — aldrei readiness-liturinn." : "Descriptive — never the readiness colour."}</p>
              </details>
              {mesoCalBlock && (mesoCalBlock.unit.accHiEff != null || mesoCalBlock.unit.stride != null || mesoCalBlock.unit.fr != null || mesoCalBlock.unit.cod != null || mesoCalBlock.unit.accel != null) && (
                <details className="mt-1">
                  <summary className="cursor-pointer py-1 text-[13px] font-semibold text-[#2740e6]">{is ? "Sýna vélrænt / IMA (Acc/Dec, Acc·Dec B2–3, skref og vegal. í löngum hlaupum, stefnubr., stefna)" : "Show mechanical/IMA detail (Acc/Dec, Acc·Dec B2–3, long-run strides + distance, CoD, direction)"}</summary>
                  <ul className="mt-1.5 space-y-0.5 text-[12px] text-slate-700">
                    {mesoCalBlock.weeks.flatMap((w) => w.days.map((d, i) => ({ d, i, wi: w.index })).filter(({ d }) => d.type !== "rest")).map(({ d, i, wi }) => (
                      <li key={`${wi}-${i}`} className="tabular-nums"><span className="text-slate-500">{is ? "V" : "W"}{wi + 1} {is ? d.dow.is : d.dow.en} {d.md}</span> · <b style={{ color: typeColor[d.type] }}>{typeName(d.type)}</b> — {imaLine(d, is, plan?.tier?.tier === "pro") || (is ? "engin IMA-gögn" : "no IMA data")}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[12px] text-slate-500">{is ? "Mechanical-dagar hlaða Acc/Dec Band 2–3; Locomotive-dagar hlaða háhraða (GPS) + löng samfelld hlaup — aldrei á sama degi (Buchheit; aftanlæris-vernd)." : "Mechanical days load Acc/Dec Band 2–3; Locomotive days load HSR (GPS) + long continuous runs — never the same day (Buchheit; hamstring protection)."}</p>
                </details>
              )}
            </section>
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
          {tab === "micro" && plan.phases.length > 0 && (
            <WeekSetupView
              embedded
              initialWeekStart={preseasonJumpWeek}
              onOpenTab={(t) => setTab(t)}
              mesoWeek={mesoWeekFor}
              onAssumedGame={async (ws, date, action) => {
                // "Enter as a friendly" writes the fixture (it then wins over the assumption everywhere); "No game this
                // week" is the Pre-season page's own choice for the week (re-flowed + saved to week_plans).
                if (action === "friendly") { await writeFixture(date, "upsert", { isFriendly: true }); return; }
                if (preInput) await moveAssumedWeek(preInput, ws, null);
              }}
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
                    of: b.weeks, deload: b.deloadWeekStart === ws, light: !!b.inSeason,
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
            const nameOf = (k: TestKey) => (is ? testShortName(k, aerobicTest).is : testShortName(k, aerobicTest).en);
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
            const recFor = (b: MesoBlock) => testsForBlock(b.goalKey, { hasVald, hasGps, aerobicMode: aerobicTest });
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
            const allProtocols = (["accum", "transmute", "realize", "deload"] as const).flatMap((g) => testsForBlock(g, { hasVald, hasGps, aerobicMode: aerobicTest }).protocols)
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

                {/* 1b — WHICH AEROBIC TEST: the same six tests Conditioning records. The choice names the
                    "Aerobic" chips + protocol here and in Week setup; results of ANY test still count. */}
                {(() => {
                  const opt = AEROBIC_TESTS.find((o) => o.key === aerobicTest) ?? AEROBIC_TESTS[0];
                  const tested = plan.players.filter((p) => (p.latestTests ?? []).some((t) => t.type === aerobicTest)).length;
                  return (
                    <section className={card}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <h2 className={h2}>{is ? "Þolpróf liðsins" : "The team's aerobic test"}</h2>
                        <select value={aerobicTest} onChange={(e) => { if (isAerobicMode(e.target.value)) changeAerobicTest(e.target.value); }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[13px] font-semibold text-slate-900">
                          {AEROBIC_TESTS.map((o) => <option key={o.key} value={o.key}>{is ? o.label.is : o.label.en}</option>)}
                        </select>
                        <span className="text-[12px] text-slate-500">{is ? `${tested} af ${plan.players.length} leikmönnum með niðurstöðu` : `${tested} of ${plan.players.length} players have a result`}</span>
                      </div>
                      <p className="mt-2 text-[13px] text-slate-700">{is ? opt.note.is : opt.note.en}</p>
                      <p className="mt-1 text-[12px] text-slate-500">{is
                        ? "Sömu sex þolpróf og á Conditioning. Hraðinn (MAS) hvers leikmanns kemur úr nýjasta hraðaprófi hans, hvaða prófi sem er; mælt MAS gengur fyrir áætlun úr 30-15. Niðurstöður eru skráðar á Conditioning eða á Players-flipanum hér."
                        : "The same six aerobic tests as Conditioning. Each player's speed (MAS) comes from his latest speed test of any kind; a measured MAS beats a 30-15 estimate. Record results on Conditioning or on the Players tab here."}
                        <span className="text-slate-400"> · <CiteRefs text={opt.cite} is={is} /></span></p>
                    </section>
                  );
                })()}

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
              const schedule = recommendTestingSchedule({ preseasonWeeks: preWeeks, hasGps: plan.tier.loadSource === "gps", hasVald, aerobicMode: aerobicTest });
              // "Due now" counts from current staleness (re-test the players who are missing/old).
              const STALE = 42; // days
              const dueBy: Partial<Record<TestKey, number>> = {
                // Any aerobic test counts (a recent Yo-Yo means he WAS tested, though it gives no MAS).
                aerobic: plan.players.filter((p) => { const a = p.aerobicTestAgeDays ?? p.masAgeDays; return a == null || a > STALE; }).length,
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
                          <p className="mt-0.5 text-[11px] text-slate-500"><CiteRefs text={tp.protocol.cite} is={is} /></p>
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
                        <b className="text-slate-900">{is ? p.name.is : p.name.en}</b> — {is ? p.measures.is : p.measures.en} <span className="text-slate-600">→ {is ? p.prescribes.is : p.prescribes.en}</span> <span className="text-slate-500">(<CiteRefs text={p.cite} is={is} />)</span>
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
            const plist = plan.players;
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
              { label: "MAS", tone: player.masKmh == null ? "bad" : player.masAgeDays != null && player.masAgeDays > 42 ? "warn" : "ok", title: player.masKmh == null ? (is ? "Ekkert hraðapróf (MAS)" : "No speed test (MAS)") : `${player.masKmh} km/h · ${is ? (player.masSourceIs ?? player.masSource ?? "") : (player.masSource ?? "")}${player.masEstimated ? (is ? " (áætlun)" : " (estimate)") : ""}${player.masAgeDays != null ? ` · ${player.masAgeDays} ${is ? "daga gamalt" : "days old"}` : ""}` },
              { label: "VBT", tone: player.vbt ? "ok" : player.strengthFallback ? "warn" : "bad", title: player.vbt ? player.vbt.exercise : player.strengthFallback ? (is ? "Rannsóknarviðmið í stað VBT" : "Research default instead of VBT") : (is ? "Enginn VBT-prófíll" : "No VBT profile") },
              { label: `VALD${player.vald.status ? ` · ${player.vald.status}` : ""}`, tone: player.vald.status === "green" ? "ok" : player.vald.status === "yellow" ? "warn" : player.vald.status === "red" ? "bad" : "none", title: is ? player.vald.note.is : player.vald.note.en },
            ] : [];
            const gapCount = player ? player.gaps.filter((g) => g.severity !== "ok").length : 0;
            const pb = playerBlock;
            const trimTxt = !pb ? "" : pb.valdTrim?.state === "applied" ? (is ? `æfingar lækkaðar í ${pb.valdTrim.capPct}% þessa viku eftir lágt hoppróf, restin af lotunni óbreytt` : `training is trimmed to ${pb.valdTrim.capPct}% this week after a low jump test, the rest of the block is unchanged`) : pb.valdTrim?.state === "lifted" ? (is ? "þjálfari hnekkti lækkun þessarar viku" : "the coach lifted this week's trim") : pb.valdTrim?.state === "deload" ? (is ? "vikan er þegar niðurtröppun, svo hoppprófið lækkar hana ekki meira" : "this week is already a deload, so the jump test takes nothing more off") : (is ? "lotan hans fylgir vikuviðmiði liðsins" : "his block follows the team's weekly level");
            const tiltTxt = !pb ? "" : pb.hsrEmph > 1.02 ? (is ? ", með háhraða yfir liðinu á hlaupadögum" : ", with HSR above the team on Locomotive days") : pb.hsrEmph < 0.98 ? (is ? ", meira vélrænt en liðið" : ", more mechanical than the team") : "";
            const emphLabel = preEmphasis ? (is ? (EMPH[preEmphasis.emphasis]?.is ?? preEmphasis.emphasis) : (EMPH[preEmphasis.emphasis]?.en ?? preEmphasis.emphasis)) : null;
            const verdict = !player ? "" : `${player.name}: ${pb ? `${trimTxt}${pb.valdTrim ? "" : tiltTxt}.` : (is ? "lotan hans birtist þegar Mesó-lota er sett upp." : "his block appears once a Meso block is laid out.")}${emphLabel ? ` ${is ? "Styrktaráhersla" : "Strength emphasis"}: ${emphLabel}.` : ""}`;
            const mu = player?.matchUnit ?? null;
            const effPhase: "preseason" | "inseason" = phaseOverride ?? (player?.weekTargets.current ?? "inseason");
            // Pre-season recomputed with the coach's OWN session count (psSess) so the card matches the
            // Build-up ramp (the server bakes a fixed 5; the coach may run 4). In-season uses the server value.
            const wt = !player ? null : (effPhase === "preseason" && player.matchUnit.load.typical != null
              ? weeklyTargetFromMatch(player.matchUnit.load.typical, { phase: "preseason", sessionCount: psSess, readinessCapPct: player.vald.capPct ?? undefined, minutesTypical: player.matchUnit.minutesTypical })
              : player.weekTargets[effPhase]);
            const SUBS: Array<{ key: number; label: string }> = [
              { key: 1, label: is ? "Uppbygging" : "Build-up" },
              { key: 2, label: is ? "Æfingagildi" : "Training values" },
              { key: 3, label: `${is ? "Gögn" : "Data"}${gapCount ? ` (${gapCount} ${is ? "vantar" : "missing"})` : ""}` },
            ];

            return (<div className="space-y-4">
          {flowNote(is ? "Mesó-lota · leik-eining leikmanns" : "Meso block · player match unit", is ? "allar undirbúningsvikur · PDF" : "every pre-season week · PDF")}

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
            {/* Back to the analysis that says what to plan toward. */}
            <a href="/coach/train-like-you-play" className="text-[12px] font-semibold text-[#2740e6] hover:underline" title={is ? "Sjá exposure-göt og hreyfi-lögun" : "See exposure gaps & movement shape"}>{is ? "Train like you Play →" : "Train like you Play →"}</a>
            <div className="flex min-w-0 flex-[1_1_320px] flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c.label} title={c.title} className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold" style={{ background: TONE[c.tone].bg, color: TONE[c.tone].c }}>
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: TONE[c.tone].dot }} />{c.label}
                </span>
              ))}
            </div>
            {playerBlock && <button type="button" onClick={exportPlayerBlock} className="h-10 rounded-lg border border-[#2740e6] bg-white px-3.5 text-[13px] font-bold text-[#2740e6] hover:bg-[#2740e6]/5">{is ? "Lota leikmanns (PDF)" : "Player block (PDF)"}</button>}
          </section>

          {/* THE WHOLE SQUAD — compare players side by side and pick one (moved here from Meso: In-season 2026-11-26). */}
          {(() => {
            const h2c = "text-[15px] font-bold text-slate-900";
            const bvDays = standardTrainingDays(1);
            const bvWkMult = weeklyTrainingMultiple(bvDays);
            const fmtKv = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
            return (
          <details className={card}>
            <summary className="cursor-pointer">
              <span className={h2c}>{is ? `Allur hópurinn (${plist.length} leikmenn) — bera saman og velja` : `The whole squad (${plist.length} players) — compare and pick`}</span>
              <span className="ml-2 text-[12px] text-slate-500">{is ? "Smelltu á leikmann til að velja hann." : "Click a player to select."}</span>
            </summary>
            <p className="mt-1 text-[12px] text-slate-500">{is ? "Grunnur (nýleg þjálfun, síð. 28 d — hvar leikmaðurinn er núna) → leik-mark (krafan per leik) → vikumark (áætlað vikuálag, leik-PL × vikumargfeldi ~2,35×)." : "Baseline (recent training, last 28d — where each player is now) → match target (per-match demand) → week target (planned weekly load, match PL × the weekly multiple ~2.35×)."}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[1040px] text-[13px]">
                <thead><tr className="text-left text-[11px] text-slate-500">
                  <th className="py-1.5 pr-2 font-semibold">{is ? "Leikmaður" : "Player"}</th>
                  <th className="py-1.5 pr-2 font-semibold">{is ? "Staða" : "Position"}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{is ? "Grunnur /æf (%leik)" : "Baseline /sess (%match)"}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{is ? "Leik-mark" : "Match target"}</th>
                  <th className="py-1.5 px-2 text-right font-semibold">{is ? "Vika PL" : "Week PL"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold" title={is ? "Hversu mikið æfingar eru lækkaðar þessa viku eftir lágt hoppróf síðustu 7 daga. Aðrar vikur og leikir breytast ekki." : "How much training is trimmed this week after a low jump test in the last 7 days. Other weeks and matches don't change."}>{is ? "VALD þessa viku" : "VALD this week"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">{is ? "Mín./leik" : "Min/match"}</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">MAS</th>
                  <th className="py-1.5 pl-2 font-semibold">{is ? "Gögn" : "Data"}</th>
                </tr></thead>
                <tbody>
                  {plist.map((p) => {
                    const cap = p.vald.capPct; const am = p.recentMinutesAvg;
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
                        <td className="py-2 pr-2 text-right tabular-nums" title={is ? p.vald.note.is : p.vald.note.en}>{cap != null && cap < 100 ? (p.vald.lift ? <span className="text-slate-500">{is ? "hnekkt" : "lifted"}</span> : <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${cap >= 85 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`}>−{100 - cap}%</span>) : <span className="text-slate-500">–</span>}</td>
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
            </details>
            );
          })()}
          {player && (<>
          {/* 2 — VERDICT + four facts */}
          <section className="space-y-3">
            <p className="text-[17px] font-bold text-slate-900">{verdict}</p>
            {/* Phase view toggle — pre-season shows the Build-up ramp; in-season shows the typical-week
                Player Demands. Defaults to the player's own current phase; the targets below follow it. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-slate-500">{is ? "Áætlun fyrir" : "Planning for"}:</span>
              <div className="flex rounded-lg border border-slate-300 p-0.5 text-[12px]">
                {(["preseason", "inseason"] as const).map((ph) => (
                  <button key={ph} type="button" onClick={() => setPhaseOverride(ph)}
                    className={`rounded-md px-2.5 py-1 font-semibold ${effPhase === ph ? "bg-[#2740e6] text-white" : "text-slate-600 hover:text-slate-900"}`}>
                    {ph === "preseason" ? (is ? "Undirbúningur" : "Pre-season") : (is ? "Keppnistímabil" : "In-season")}
                  </button>
                ))}
              </div>
              {phaseOverride && phaseOverride !== (player?.weekTargets.current ?? "inseason") && (
                <span className="text-[11px] text-slate-400">{is ? `(sjálfgefið fyrir hann: ${player?.weekTargets.current === "preseason" ? "undirbúningur" : "keppnistímabil"})` : `(his default: ${player?.weekTargets.current === "preseason" ? "pre-season" : "in-season"})`}</span>
              )}
            </div>
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
                <div className="text-[12px] font-semibold text-slate-500" title={`${is ? VALD_TRIM_CITE.is : VALD_TRIM_CITE.en} ${is ? "Ekki readiness-liturinn." : "Not the readiness colour."}`}>{is ? "Geta til að taka álag (VALD)" : "Readiness to load (VALD)"}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[20px] font-bold text-slate-900">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: player.vald.status === "green" ? "#1c7a4a" : player.vald.status === "yellow" ? "#de9328" : player.vald.status === "red" ? "#a83e28" : "#94a3b8" }} />
                  {player.vald.capPct != null && player.vald.capPct < 100 ? (player.vald.lift ? (is ? "Lækkun hnekkt" : "Trim lifted") : (is ? `Æfingar í ${player.vald.capPct}%` : `Training at ${player.vald.capPct}%`)) : (is ? "Engin lækkun" : "No trim")}
                </div>
                <div className="text-[13px] text-slate-600">{is ? player.vald.note.is : player.vald.note.en}</div>
                {player.vald.capPct != null && player.vald.capPct < 100 && <ValdTrimControl key={player.playerId} is={is} lift={player.vald.lift ?? null} onLift={(reason) => sendValdTrimLift(player.playerId, { reason })} onUndo={() => sendValdTrimLift(player.playerId, { undo: true })} />}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[12px] font-semibold text-slate-500">{is ? "Styrktaráhersla" : "Strength emphasis"}</div>
                <div className="mt-0.5 text-[20px] font-bold text-slate-900">{emphLabel ?? "—"}</div>
                <div className="text-[13px] text-slate-600">{preEmphasis ? (preEmphasis.driver === "dsi" && preEmphasis.dsi ? `DSI ${preEmphasis.dsi.ratio.toFixed(2)} · ${is ? "reglur, ekki gervigreind" : "rules, not AI"}` : `${is ? "vissa" : "confidence"}: ${preEmphasis.confidence}`) : (is ? "Á við í undirbúningi" : "Applies in pre-season")}</div>
              </div>
            </div>
          </section>

          {/* PLAYER DEMANDS — his own match unit split across the typical week (MD-day shape). The
              per-player analogue of the Team Demands tab; answers "how does his match demand distribute
              across MD-4…MD-1?". Steady-state reference (no ramp); the His-block grid shows the planned block. */}
          {!isBasketball && player && effPhase === "preseason" && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-[12px] text-slate-500">
              {is ? "Undirbúnings-sýn — dæmigerða æfingavikan (Leikmanns-kröfur) er keppnistímabils-sýn. Uppbyggingar-rampinn er hér að neðan í „Uppbygging“ flipanum." : "Pre-season view — the typical training week (Player Demands) is an in-season view. The Build-up ramp is below in the “Build-up” tab."}{" "}
              <button type="button" onClick={() => setPlSub(1)} className="font-semibold text-[#2740e6] hover:underline">{is ? "Opna Uppbygging →" : "Open Build-up →"}</button>
            </div>
          )}

          {!isBasketball && player && effPhase === "inseason" && player.matchUnit.load.typical != null && (() => {
            const mu = player.matchUnit;
            const fmt = (v: number | null) => (v == null ? "–" : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

            // ── MD-DAY DEMAND PROFILE (the per-player analogue of Team Demands) ──
            // The actual MD-day training shape (what the squad/position really does on MD+1…MD-1, incl. the
            // recovery days + a real MD-2), INDIVIDUALISED: each day's %-of-match (from the Team-Demands data)
            // applied to HIS own match unit. Prefer his position's profile; fall back to the team's.
            const posKey = positionGroup(player.position).key;
            const mdBase = (plan.positionBaselines ?? []).find((b) => b.key === posKey && (b.md?.days?.length ?? 0) > 0)
              ?? (((plan.teamBaseline?.md?.days?.length ?? 0) > 0) ? plan.teamBaseline : null);
            const mdOffL = (label: string) => { const m = /MD([+-]\d+)/.exec(label); return m ? Number(m[1]) : 0; };
            const playsMatches = (mu.minutesTypical ?? player.recentMinutesAvg ?? 0) >= 20 || mu.nNearFull > 0;
            // Accel/decel are Catapult IMA events on a Pro feed (loader coalesces ima_accel ?? accelerations),
            // plain GPS effort-counts otherwise — so the row labels follow the tier. IMA CoD = the six left/right CoD buckets (imaCodTotal).
            const imaSrc = plan.tier.tier === "pro";
            type Tf = "playerLoad" | "distanceM" | "hsrM" | "sprintM" | "accel" | "decel" | "imaCod" | "imaFrDist" | "strideHi";
            type Mf = "matchPlayerLoad" | "matchDistanceM" | "matchHsrM" | "matchSprintM" | "matchAccel" | "matchDecel" | "matchImaCod" | "matchImaFrDist" | "matchStrideHi";
            const KROWS: Array<{ en: string; is: string; u: string; tf: Tf; mf: Mf; pm: number | null }> = ([
              { en: "Player Load", is: "Player Load", u: "", tf: "playerLoad", mf: "matchPlayerLoad", pm: mu.load.typical },
              { en: "Total distance", is: "Heildar-vegalengd", u: "m", tf: "distanceM", mf: "matchDistanceM", pm: mu.distance.typical },
              { en: "High-speed running", is: "Háhraðahlaup", u: "m", tf: "hsrM", mf: "matchHsrM", pm: mu.hsr.typical },
              { en: "Sprint distance", is: "Sprett-vegalengd", u: "m", tf: "sprintM", mf: "matchSprintM", pm: mu.sprint.typical },
              { en: imaSrc ? "Accelerations (IMA)" : "Accelerations (B2–3)", is: imaSrc ? "Hröðun (IMA)" : "Hröðun (B2–3)", u: "#", tf: "accel", mf: "matchAccel", pm: mu.accel.typical },
              { en: imaSrc ? "Decelerations (IMA)" : "Decelerations (B2–3)", is: imaSrc ? "Hemlun (IMA)" : "Hemlun (B2–3)", u: "#", tf: "decel", mf: "matchDecel", pm: mu.decel.typical },
              { en: "IMA CoD (change of direction)", is: "IMA stefnubreytingar", u: "#", tf: "imaCod", mf: "matchImaCod", pm: mu.imaCod.typical },
              { en: "Long runs at match pace (runs ≥18 s, 11 km/h+)", is: "Löng hlaup á leikhraða (≥18 sek, 11 km/klst+)", u: "m", tf: "imaFrDist", mf: "matchImaFrDist", pm: mu.imaFr?.typical ?? null },
              { en: "Long-run strides at match pace (runs ≥18 s, 11 km/h+)", is: "Skref í löngum hlaupum á leikhraða (≥18 sek, 11 km/klst+)", u: "#", tf: "strideHi", mf: "matchStrideHi", pm: mu.stride?.typical ?? null },
            ] as const).filter((r) => r.pm != null);
            // ONE representative 7-day microcycle (recovery MD+1/+2 + build MD-4…MD-1). The profile holds a
            // bucket for EVERY MD-offset the season ever saw (incl. long-gap MD-5/MD-6 and MD+3), but those
            // belong to different week LENGTHS — summing them all double-counts into a ~2× too-big week.
            const STD_MICRO = new Set([1, 2, -4, -3, -2, -1]);
            const mdCols = (mdBase?.md?.days ?? [])
              .map((d) => ({ d, off: mdOffL(d.label.en) }))
              .filter((x) => STD_MICRO.has(x.off) && (x.off < 0 || playsMatches)) // drop recovery days for a non-playing week
              .sort((a, b) => ((a.off > 0 ? a.off : a.off + 100) - (b.off > 0 ? b.off : b.off + 100))); // MD+1,+2, MD-4…MD-1
            if (mdBase && mdCols.length) {
              const denom = mdBase.avg; // season avg carries the match* references (the per-day denominator)
              const subOf = (off: number): string => off > 0 ? (is ? "endurheimt" : "recovery") : off <= -3 ? (is ? "álag" : "load") : off === -2 ? (is ? "léttur" : "light") : (is ? "virkjun" : "prime");
              const cellVal = (d: typeof mdCols[number]["d"], r: typeof KROWS[number]): number | null => {
                const train = d.avg[r.tf]; if (train == null) return null;
                const dn = denom[r.mf];
                return (dn != null && dn > 0 && r.pm != null) ? train * ((r.pm as number) / dn) : train;
              };
              const srcLabel = mdBase.key === -1 ? (is ? "liðs-mynstur (engin stöðu-gögn)" : "team shape (no position data)") : (is ? `${mdBase.label.is}-mynstur` : `${mdBase.label.en} shape`);
              return (
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-[15px] font-bold text-slate-900">{is ? "Leikmanns-kröfur — dæmigerð vika" : "Player Demands — the typical week"}</h2>
                    <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#2740e6]">{player.name}</span>
                    <span className="text-[12px] text-slate-500">{is ? `Raunverulegt MD-dags mynstur (${srcLabel}) × leikeiningin hans — heill míkróhringur.` : `Actual MD-day shape (${srcLabel}) × his match unit — the full microcycle.`}</span>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                        <th className="py-1 pr-2 font-medium">KPI</th>
                        {mdCols.map(({ d, off }) => <th key={d.key} className="py-1 px-2 text-right font-medium"><div>{is ? d.label.is : d.label.en}</div><div className="text-[9px] font-normal normal-case text-slate-400">{subOf(off)}</div></th>)}
                        <th className="py-1 px-2 text-right font-medium">{is ? "Vika" : "Week"}</th>
                        <th className="py-1 pl-2 text-right font-medium">{is ? "Leikur" : "Match"}</th>
                      </tr></thead>
                      <tbody>
                        {KROWS.map((r) => {
                          const per = mdCols.map(({ d }) => cellVal(d, r));
                          const wk = per.reduce<number>((s, x) => s + (x ?? 0), 0);
                          return (
                            <tr key={r.en} className="border-t border-slate-100">
                              <td className="py-1.5 pr-2 text-slate-700">{is ? r.is : r.en}</td>
                              {per.map((x, i) => <td key={i} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmt(x)}{r.u}</td>)}
                              <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-slate-900">{fmt(wk)}{r.u}</td>
                              <td className="py-1.5 pl-2 text-right tabular-nums text-slate-400">{fmt(r.pm)}{r.u}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">{is
                    ? `Hver MD-dagur = raunverulegt hlutfall þess dags af leik (úr sömu gögnum og Liðs-kröfur), sett á LEIKINN hans (miðgildi ${mu.nNearFull} ~90-mín leikja). Sýndur er einn dæmigerður 7-daga míkróhringur: endurheimt (MD+1/MD+2, aðeins þegar hann spilar) + uppbygging (MD-4…MD-1); lengri-hlés dagar (MD+3, MD-5…) tilheyra öðrum vikulengdum. Vika = summa æfingadaga (leikdagur ekki talinn) — MÆLT dreifing, en „Vikumark“-spjaldið er ÁÆTLUN (leikur + viðbót), svo þau mega vera ólík. Lýsandi — aldrei readiness-liturinn.`
                    : `Each MD-day = that day's actual % of a match (from the same data as Team Demands), applied to HIS match (median of ${mu.nNearFull} ~90-min games). One representative 7-day microcycle is shown: recovery (MD+1/MD+2, only when he plays) + build (MD-4…MD-1); longer-gap days (MD+3, MD-5…) belong to other week lengths. Week = the training days summed (the match day is excluded) — the OBSERVED distribution, while the "Weekly target" card is a PLANNING target (match + increment), so the two can differ. Descriptive — never the readiness colour.`}</p>
                </section>
              );
            }

            // Fallback (no MD-day training data yet): the engine microcycle, anchored to the weekly target.
            // Day-types come from the ENGINE's own microcycle (buildCalendarBlock), not a hand map — so this
            // matches "His block" exactly, including that MD-2 is a recovery/rest day (never the heaviest).
            const microUnit = { dist: mu.distance.typical, hsr: mu.hsr.typical, load: mu.load.typical,
              accdec: ((mu.accel.typical ?? 0) + (mu.decel.typical ?? 0)) || null, accHiEff: mu.accHiEff.typical,
              decHiEff: mu.decHiEff.typical, stride: mu.stride.typical, dirFwd: null, dirBack: null, dirLat: null,
              rhie: mu.rhie.typical, symmetry: mu.symmetry.typical, metPower: mu.metPower.typical, fr: mu.imaFr?.typical ?? null, cod: mu.imaCod.typical ?? null, accel: mu.accel.typical, decel: mu.decel.typical };
            const microMon = (() => { const d = new Date(blkStart + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
            const microWk = (() => { const mb = buildCalendarBlock({ unit: microUnit, startDate: microMon, numWeeks: 2, scopeName: player.name, scopePos: player.position, baseOverloadPct: 100 }); return mb.weeks[1] ?? mb.weeks[0]; })();
            const microDays = (microWk?.days ?? []).map((d) => ({ md: d.md, type: d.type, o: mdOffset(d.md) ?? 99 })).filter((d) => d.o >= -4 && d.o <= -1).sort((a, b) => a.o - b.o);
            const days: Array<{ md: string; type: CalType }> = microDays.length ? microDays.map((d) => ({ md: d.md, type: d.type })) : standardTrainingDays(1).map((md) => ({ md, type: "mixed" as CalType }));
            const TYPE_LABEL: Partial<Record<CalType, { en: string; is: string }>> = { mechanical: { en: "mech", is: "vélrænt" }, locomotive: { en: "loco", is: "hlaup" }, mixed: { en: "mixed", is: "blandað" }, activation: { en: "prime", is: "virkjun" }, rest: { en: "rest", is: "hvíld" }, topup: { en: "top-up", is: "áfylling" } };
            // These are TRAINING days (the match is a separate column). In-season the official weekly target
            // (the "Weekly target" card) = the match itself + a readiness-gated TRAINING increment, so the
            // training-only week = matchMultiple − 1 game (= 0.6×readiness cap). Pre-season has no competitive
            // match in the week, so the whole supra-match multiple is training. Anchoring here means
            // Σ(training days) + the match === the card's weekly target exactly, and a session sits well under
            // a match (the earlier version summed the whole week onto the training days — nearly 2× a match).
            const weekMult = wt?.phase === "preseason" ? (wt?.matchMultiple ?? 2.2) : Math.max(0.3, (wt?.matchMultiple ?? 1.5) - 1);
            const rows = ([
              { en: "Player Load", is: "Player Load", v: mu.load.typical, u: "", ax: "load" },
              { en: "Total distance", is: "Heildar-vegalengd", v: mu.distance.typical, u: "m", ax: "dist" },
              { en: "High-speed running", is: "Háhraðahlaup", v: mu.hsr.typical, u: "m", ax: "hsr" },
              { en: "Sprint distance", is: "Sprett-vegalengd", v: mu.sprint.typical, u: "m", ax: "sprint" },
              { en: "Accelerations (B2–3)", is: "Hröðun (B2–3)", v: mu.accel.typical, u: "#", ax: "accdec" },
              { en: "Decelerations (B2–3)", is: "Hemlun (B2–3)", v: mu.decel.typical, u: "#", ax: "accdec" },
            ] as const).filter((r) => r.v != null);
            return (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-[15px] font-bold text-slate-900">{is ? "Leikmanns-kröfur — dæmigerð vika" : "Player Demands — the typical week"}</h2>
                  <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#2740e6]">{player.name}</span>
                  <span className="text-[12px] text-slate-500">{is ? "Leikeiningin hans × dag-gerðar hlutfall (hver eiginleiki toppar á sínum degi)." : "His match unit × the day-type share (each quality peaks on its stimulus day)."}</span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="py-1 pr-2 font-medium">KPI</th>
                      {days.map((d) => <th key={d.md} className="py-1 px-2 text-right font-medium"><div>{d.md}</div><div className="text-[9px] font-normal normal-case text-slate-400">{TYPE_LABEL[d.type] ? (is ? TYPE_LABEL[d.type]!.is : TYPE_LABEL[d.type]!.en) : d.type}</div></th>)}
                      <th className="py-1 px-2 text-right font-medium">{is ? "Vika" : "Week"}</th>
                      <th className="py-1 pl-2 text-right font-medium">{is ? "Leikur" : "Match"}</th>
                    </tr></thead>
                    <tbody>
                      {rows.map((r) => {
                        // WEEK = his match × the official weekly multiple; distribute across the engine's days
                        // by their CAL_SHARE weight (rest days weigh 0 → read 0). Σ(perDay) === wk by construction.
                        const wk = (r.v as number) * weekMult;
                        const wSum = days.reduce((s, d) => s + CAL_SHARE[d.type][r.ax], 0) || 1;
                        const perDay = days.map((d) => (wk * CAL_SHARE[d.type][r.ax]) / wSum);
                        return (
                          <tr key={r.en} className="border-t border-slate-100">
                            <td className="py-1.5 pr-2 text-slate-700">{is ? r.is : r.en}</td>
                            {perDay.map((x, i) => <td key={i} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmt(x)}{r.u}</td>)}
                            <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-slate-900">{fmt(wk)}{r.u}</td>
                            <td className="py-1.5 pl-2 text-right tabular-nums text-slate-400">{fmt(r.v)}{r.u}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{is
                  ? `Þetta eru ÆFINGADAGAR (leikurinn er sér dálkur). ${wt?.phase === "preseason" ? "Í undirbúningi er öll vikan æfing (yfir-leik)." : "Á keppnistímabili er vikumarkið = leikurinn sjálfur + æfingaviðbót, svo æfingavikan er ~"+weekMult.toFixed(2)+"× leik."} Vikunni er dreift á dagana eftir dag-gerð úr sömu vél og dagatal lotunnar (mixed = stóri dagurinn; MD-2 er hvíldardagur og les 0). Æfingadagar (${fmt((mu.load.typical ?? 0) * weekMult)} PL) + leikurinn (${fmt(mu.load.typical)} PL) ≈ vikumarkið (${wt?.weeklyLoadTarget ?? "—"} PL á spjaldinu). Grunnur = LEIKUR hans (miðgildi ${mu.nNearFull} ~90-mín leikja). Lýsandi — aldrei readiness-liturinn.`
                  : `These are TRAINING days (the match is its own column). ${wt?.phase === "preseason" ? "In pre-season the whole week is training (supra-match)." : `In-season the weekly target = the match itself + a training increment, so the training week is ~${weekMult.toFixed(2)}× a match.`} The week is spread across the days by day-type from the same engine as the block calendar (mixed = the big day; MD-2 is a recovery/rest day and reads 0). Training days (${fmt((mu.load.typical ?? 0) * weekMult)} PL) + the match (${fmt(mu.load.typical)} PL) ≈ the weekly target (${wt?.weeklyLoadTarget ?? "—"} PL on the card). Base = his MATCH (median of ${mu.nNearFull} ~90-min games). Descriptive — never the readiness colour.`}</p>
              </section>
            );
          })()}

          {/* 3 — PLAYER SECTIONS: one at a time instead of nine stacked cards */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div role="tablist" aria-label={is ? "Hlutar" : "Sections"} className="flex gap-0.5 overflow-x-auto border-b border-slate-200 bg-slate-50 px-3">
              {SUBS.map((s) => (
                <button key={s.key} type="button" role="tab" aria-selected={plSub === s.key} onClick={() => setPlSub(s.key)}
                  className={`h-12 shrink-0 px-3.5 text-[13px] font-bold ${plSub === s.key ? "text-[#2740e6] shadow-[inset_0_-2px_0_#2740e6]" : "text-slate-700 hover:text-slate-900"}`}>{s.label}</button>
              ))}
            </div>
            <div className="space-y-4 p-4 sm:p-5">
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
          {effPhase === "preseason" && player && steer && (steer.targets.length > 0 || steer.exposureTargets.length > 0 || steer.dirTargets.length > 0) && (() => {
            const qName = (id: QualityRead["id"]) => (is ? QUALITY_BY_ID[id].is : QUALITY_BY_ID[id].en);
            const axisWord = (a: "hsr" | "mech") => (a === "hsr" ? (is ? "háhraða/hlaup" : "HSR/running") : (is ? "Acc/Dec (vélrænt)" : "Acc/Dec (mechanical)"));
            const dirWord = (f: "fwd" | "back" | "lat") => (f === "fwd" ? (is ? "fram" : "forward") : f === "back" ? (is ? "aftur" : "backward") : (is ? "til hliðar" : "lateral"));
            const hard = steer.targets.filter((t) => !t.hint);
            const hints = steer.targets.filter((t) => t.hint);
            const top = hard.length ? hard : steer.targets; // if nothing confident, narrate the hints
            const hardExp = steer.exposureTargets.filter((e) => !e.hint);
            const topExp = hardExp.length ? hardExp : steer.exposureTargets;
            const hardDir = steer.dirTargets.filter((d) => !d.hint);
            const lbl = (e: typeof steer.exposureTargets[number]) => (is ? e.label.is : e.label.en);
            const emphAxes = Array.from(new Set([...hard.map((t) => t.axis), ...hardExp.map((e) => e.axis)].filter((a): a is "hsr" | "mech" => a !== "strength"))).map(axisWord);
            // Verdict composes whichever drivers exist (weakness / exposure / movement direction).
            const drivers: string[] = [];
            if (steer.targets.length) drivers.push(`${is ? "lægstu eiginleikar" : "lowest qualities"}: ${top.slice(0, 2).map((t) => qName(t.id)).join(is ? " og " : " and ")}`);
            if (steer.exposureTargets.length) drivers.push(`${is ? "vanþjálfað vs leikur" : "under-trained vs matches"}: ${topExp.slice(0, 2).map(lbl).join(is ? " og " : " and ")}`);
            if (hardDir.length) drivers.push(`${is ? "hreyfi-stefna" : "movement direction"}: ${hardDir.slice(0, 2).map((d) => dirWord(d.family)).join(is ? " og " : " and ")}`);
            const verdict = is
              ? `Uppbygging ${player.name}s forgangsraðar — ${drivers.join("; ")}${emphAxes.length && steerActive ? `, leggðu áherslu á ${emphAxes.join(" + ")} í uppbyggingunni` : ""}.`
              : `${player.name}'s build-up prioritises — ${drivers.join("; ")}${emphAxes.length && steerActive ? `, emphasise ${emphAxes.join(" + ")} in the build-up` : ""}.`;
            return (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-bold text-slate-900">{is ? "Einstaklingsmiðuð uppbygging" : "Individualised build-up"}</h2>
                {steer.targets.length > 0 && <span className="rounded bg-[#7a5cc4]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#7a5cc4]">{is ? "Heildargreining" : "Total Player Analysis"}</span>}
                {(steer.exposureTargets.length > 0 || steer.dirTargets.length > 0) && <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#2740e6]">{is ? "Train like you Play" : "Train like you Play"}</span>}
                <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={steerNeutral} onChange={(e) => setSteerNeutral(e.target.checked)} />{is ? "Hlutlaus rampi (án halla)" : "Neutral ramp (no bias)"}</label>
              </div>
              {/* Level 0 — verdict */}
              <p className="mt-1 text-[13px] font-semibold text-slate-900">{steerActive ? verdict : (is ? "Hlutlaus rampi — enginn halli beittur. Kveiktu af til að forgangsraða götunum." : "Neutral ramp — no bias applied. Untick to prioritise the gaps.")}</p>
              {/* Level 1a — athlete-axis weaknesses (percentiles) */}
              {steer.targets.length > 0 && (
                <ul className="mt-1.5 space-y-1 text-[12px] text-slate-700">
                  {top.slice(0, 3).map((t) => (
                    <li key={t.id}>
                      <span className="font-medium">{qName(t.id)}</span>
                      {t.percentile != null && <span className="text-slate-500"> ({t.percentile}th pctl)</span>}
                      {t.axis !== "strength" && <span className="text-slate-500"> → {is ? "áhersla" : "emphasise"} {is ? t.kpis.is : t.kpis.en}</span>}
                      {t.hint && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-700">{is ? "vísbending" : "hint"}</span>}
                      {steerData?.levers?.[t.id] && <div className="text-[11px] text-slate-500">↳ {is ? steerData.levers[t.id].is : steerData.levers[t.id].en}{steerData.levers[t.id].cite ? ` (${steerData.levers[t.id].cite})` : ""}</div>}
                    </li>
                  ))}
                </ul>
              )}
              {/* Level 1b — Train-like-you-Play match-exposure gaps (training vs his own matches) */}
              {steer.exposureTargets.length > 0 && (
                <>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Vanþjálfað vs eigin leikir" : "Under-trained vs his own matches"}</p>
                  <ul className="mt-0.5 space-y-1 text-[12px] text-slate-700">
                    {topExp.slice(0, 3).map((e) => (
                      <li key={e.key}>
                        <span className="font-medium">{lbl(e)}</span>
                        {e.pct != null && <span className="text-slate-500"> ({e.pct}% {is ? "af leik" : "of match"})</span>}
                        <span className="text-slate-500"> → {is ? "áhersla" : "emphasise"} {axisWord(e.axis as "hsr" | "mech")}</span>
                        {e.hint && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-700">{is ? "vísbending" : "hint"}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {/* Level 1c — movement-shape direction: which family he under-does vs his matches, tilting
                  the plan's fwd/back/lat split (the day grid + block PDF show each day's dominant direction). */}
              {steer.dirTargets.length > 0 && (
                <p className="mt-2 text-[12px] text-slate-700">
                  <span className="font-semibold">{is ? "Hreyfi-stefna vs leikur" : "Movement direction vs matches"}:</span>{" "}
                  {steer.dirTargets.slice(0, 3).map((d, i) => (
                    <span key={d.family}>
                      {i > 0 ? ", " : ""}<b>{dirWord(d.family)}</b> <span className="text-slate-500">(+{d.deltaPts}{is ? " stig vanþjálfað" : "pts under"})</span>
                      {d.hint && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-700">{is ? "vísbending" : "hint"}</span>}
                    </span>
                  ))}
                  {hardDir.length > 0 && <span className="text-slate-500"> → {is ? "blokkin hallar stefnu-skiptingu þangað" : "the block tilts its direction split there"}</span>}.
                </p>
              )}
              {/* VALD strength focus (the force/VBT qualities the GPS ramp can't build) */}
              {steerData?.valdPlan && steerData.valdPlan.priorities.length > 0 && (
                <p className="mt-1.5 text-[11px] text-slate-600"><span className="font-medium">{is ? "Kraftur (VALD)" : "Strength (VALD)"}:</span> {steerData.valdPlan.priorities.slice(0, 2).map((p) => `${p.quality} — ${p.lever}`).join(" · ")} <span className="rounded bg-[#7a5cc4]/10 px-1 text-[11px] font-semibold text-[#7a5cc4]">VALD</span></p>
              )}
              {hints.length > 0 && steerActive && <p className="mt-1 text-[11px] text-amber-700">{is ? `Vísbendingar (lítið úrtak / lítil vissa) eru sýndar en ekki notaðar til að halla rampanum: ${hints.map((t) => qName(t.id)).join(", ")}.` : `Hints (thin sample / low confidence) are shown but not used to bias the ramp: ${hints.map((t) => qName(t.id)).join(", ")}.`}</p>}
              <p className="mt-1.5 text-[11px] text-slate-500">{is ? "Tvær heimildir halla líkamlegu uppbyggingunni: íþrótta-veikleikar (percentílur) og vanþjálfun vs leikur (Train like you Play). Innan öruggra þaka rampans (hraði / leikþak); +20% hámark. Lýsandi — aldrei readiness-liturinn." : "Two sources steer the physical build-up: athlete weaknesses (percentiles) and under-exposure vs matches (Train like you Play). Within the ramp's safe caps (rate / match ceiling); +20% max. Descriptive — never the readiness colour."} <a className="text-[#2740e6] hover:underline" href={`/coach/total-player-analysis?playerId=${encodeURIComponent(selId)}`}>{is ? "Prófíll →" : "Profile →"}</a> · <a className="text-[#2740e6] hover:underline" href="/coach/train-like-you-play">{is ? "Train like you Play →" : "Train like you Play →"}</a></p>
            </section>
            );
          })()}

          {/* BUILD-UP PLAN — MATCH-ANCHORED pre-season ramp (same engine as the Pre-season tab: preseasonStartRamp).
              Week 1 = controlled re-entry (~1.3× a match), ramping to the pre-season build. GPS-free: it reads
              his own match unit, else the squad's match average, else a positional norm — never a GPS baseline. */}
          {effPhase === "preseason" ? (() => {
            const hasOwn = player.matchUnit.load.typical != null;
            const teamKpi = teamKpiAvg(plan.players);
            const teamHasOwn = teamKpi.totalPlayerLoad != null && Number.isFinite(teamKpi.totalPlayerLoad);
            const matchKpiAvg = hasOwn ? kpiAvgFromUnit(player.matchUnit) : (teamHasOwn ? teamKpi : (NORMATIVE_MATCH_KPI as Partial<Record<WeeklyLoadMetricKey, number>>));
            const preWeeksN = plan.phases.find((p) => p.key === "preseason")?.weeks ?? blkWeeks;
            const fmt = (v: number | null | undefined) => (v == null ? "–" : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
            // Follow the TEAM's weekly ×match multiple PER VARIABLE (plannedVolume — the same model the Meso
            // tab uses), individualised by HIS match unit: each KPI's peak = his match × the team's weekly
            // ×match for that KPI; the week ramps from a controlled re-entry (psW1×) up to that peak.
            const preDays = standardTrainingDays(0); // the team's pre-season (no-match) training week
            const teamMult = (k: WeeklyLoadMetricKey) => weeklyKpiMultiple(preDays, k);
            const volPeak = teamMult("totalPlayerLoad");
            const reentryFrac = Math.min(1, Math.max(0.2, (psW1 || 1.3) / Math.max(1, volPeak)));
            const weeks = Array.from({ length: preWeeksN }, (_, idx) => {
              const scale = reentryFrac + (1 - reentryFrac) * (preWeeksN > 1 ? idx / (preWeeksN - 1) : 0);
              return { i: idx + 1, scale, mult: Math.round(volPeak * scale * 100) / 100 };
            });
            const peakMult = Math.round(volPeak * 100) / 100;
            const srcLabel = hasOwn
              ? (is ? `Leikeining ${player.name}s — miðgildi ${player.matchUnit.nNearFull} ~90-mín leikja` : `${player.name}'s match unit — median of ${player.matchUnit.nNearFull} ~90-min matches`)
              : teamHasOwn ? (is ? "Meðaltal úr leikjum liðsins (fáir heilir leikir hjá honum)" : "Team match average (few full matches of his own)")
              : (is ? "Stöðuviðmið (engin leikgögn enn)" : "Positional norm (no match data yet)");
            // Accel/decel are Catapult IMA events on a Pro feed (ima_accel ?? accelerations), plain GPS
            // effort-counts otherwise — so the labels follow the tier. IMA CoD = his summed match clock.
            const imaSrc = plan.tier.tier === "pro";
            const KPIS: Array<{ k: WeeklyLoadMetricKey; en: string; is: string; u: string }> = ([
              { k: "totalPlayerLoad", en: "Player Load", is: "Player Load", u: "" },
              { k: "totalDistance", en: "Total distance", is: "Heildar-vegalengd", u: "m" },
              { k: "velocityBand5", en: "High-speed running", is: "Háhraðahlaup", u: "m" },
              { k: "velocityBand6", en: "Sprint distance", is: "Sprett-vegalengd", u: "m" },
              { k: "accelB23", en: imaSrc ? "Accelerations (IMA)" : "Accelerations (B2–3)", is: imaSrc ? "Hröðun (IMA)" : "Hröðun (B2–3)", u: "#" },
              { k: "decelB23", en: imaSrc ? "Decelerations (IMA)" : "Decelerations (B2–3)", is: imaSrc ? "Hemlun (IMA)" : "Hemlun (B2–3)", u: "#" },
              { k: "imaCod", en: "IMA CoD (change of direction)", is: "IMA stefnubreytingar", u: "#" },
              { k: "imaFrDistance", en: "Long runs at match pace (runs ≥18 s, 11 km/h+)", is: "Löng hlaup á leikhraða (≥18 sek, 11 km/klst+)", u: "m" },
              { k: "imaStrideHi", en: "Long-run strides at match pace (runs ≥18 s, 11 km/h+)", is: "Skref í löngum hlaupum á leikhraða (≥18 sek, 11 km/klst+)", u: "#" },
            ] as const).filter((r) => (matchKpiAvg as Partial<Record<string, number>>)[r.k] != null);
            // Weakness-steer (the "Individualised build-up" card) biases the ramp: the axes he's behind on
            // ramp to a HIGHER peak. "Neutral ramp (no bias)" (steerNeutral) switches it off → a uniform ramp.
            const biasOn = steerActive && !!steer;
            const boostOf = (k: string): number => {
              if (!biasOn || !steer) return 1;
              if (k === "velocityBand5" || k === "velocityBand6" || k === "imaFrDistance" || k === "imaStrideHi") return steer.hsrBoost ?? 1;   // running axis (incl. IMA long-continuous-run distance / strides — sustained running, not sprint)
              if (k === "accelB23" || k === "decelB23" || k === "imaCod") return steer.mechBoost ?? 1; // mechanical / CoD axis
              return 1;
            };
            const emphWords: string[] = [];
            if (biasOn && steer) { if ((steer.hsrBoost ?? 1) > 1) emphWords.push(is ? "háhraði/sprettur" : "HSR/sprint"); if ((steer.mechBoost ?? 1) > 1) emphWords.push("Acc/Dec"); }
            const cellVal = (r: typeof KPIS[number], w: typeof weeks[number]): number | null => {
              const base = (matchKpiAvg as Partial<Record<string, number>>)[r.k];
              return base == null ? null : base * teamMult(r.k) * boostOf(r.k) * w.scale;
            };
            return (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-[15px] font-bold text-slate-900">{is ? "Uppbyggingar-áætlun (undirbúningur)" : "Build-up plan (pre-season)"}</h2>
                <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#2740e6]">{player.name}</span>
                {biasOn && emphWords.length > 0 && <span className="rounded bg-[#7a5cc4]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#7a5cc4]" title={is ? `Áherslu-ásar rampa hærra: ${emphWords.join(" + ")}` : `Emphasised axes ramp higher: ${emphWords.join(" + ")}`}>{is ? "veikleika-stýrt" : "weakness-steered"}</span>}
                <span className="text-[12px] text-slate-500">{is ? `Vika 1 = stýrð endurkoma (${psW1}× leik) → ${peakMult != null ? `${peakMult}× leik` : "uppbygging"} yfir ${psSess} æfingar/viku.` : `Week 1 = controlled re-entry (${psW1}× match) → ${peakMult != null ? `${peakMult}× match` : "the build"} across ${psSess} sessions/wk.`}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{is ? `Fest á LEIK (ekki GPS-grunnlínu): ${srcLabel}. Toppur hverrar breytu = leikur hans × vikulegur ×leik-margfaldari liðsins fyrir þá breytu (sama líkan og Mesó/Liðs-kröfur). Lýsandi — aldrei readiness-liturinn.` : `Anchored on the MATCH (not a GPS baseline): ${srcLabel}. Each variable's peak = his match × the TEAM's weekly ×match multiple for that variable (the same model as Meso / Team Demands). Descriptive — never the readiness colour.`}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-2 font-medium">{is ? "KPI (vika)" : "KPI (per week)"}</th>
                    {weeks.map((w) => <th key={w.i} className="py-1 px-2 text-right font-medium"><div>{is ? "V" : "Wk"}{w.i}</div><div className="text-[9px] font-normal normal-case text-slate-400">×{w.mult}</div></th>)}
                    <th className="py-1 pl-2 text-right font-medium">{is ? "Leikur" : "Match"}</th>
                  </tr></thead>
                  <tbody>
                    {KPIS.map((r) => (
                      <tr key={r.k} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-700">{is ? r.is : r.en}</td>
                        {weeks.map((w) => { const b = boostOf(r.k); return <td key={w.i} className={`py-1.5 px-2 text-right tabular-nums ${b > 1 ? "font-semibold text-[#7a5cc4]" : "text-slate-600"}`}>{fmt(cellVal(r, w))}{r.u}</td>; })}
                        <td className="py-1.5 pl-2 text-right tabular-nums text-slate-400">{fmt((matchKpiAvg as Partial<Record<string, number>>)[r.k])}{r.u}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">{is
                ? `Vikuleg heildarmörk (≈ ÷${psSess} ≈ per æfingu). Hver breyta stiglar frá endurkomu (${psW1}× leik) að toppi = liðs-margfaldarinn fyrir þá breytu; háhraði/sprettur safna minna (taper).${biasOn && emphWords.length ? ` Veikleika-stýrt: ${emphWords.join(" + ")} rampa hærra (fjólubláir dálkar) — hakaðu „Hlutlaus rampi“ til að slökkva.` : ""} Fest á leik, engin GPS-saga þarf. Upphafspunktur, ekki viðmið (Little & Buchheit). Lýsandi — aldrei readiness-liturinn.`
                : `Weekly totals (≈ ÷${psSess} ≈ per session). Each variable ramps from re-entry (${psW1}× match) to its peak = the team's ×match multiple for that variable; HSR/sprint accumulate less (taper).${biasOn && emphWords.length ? ` Weakness-steered: ${emphWords.join(" + ")} ramp higher (purple cells) — tick "Neutral ramp" to switch it off.` : ""} Anchored on the match, no GPS history needed. A starting point, not a norm (Little & Buchheit). Descriptive — never the readiness colour.`}</p>
            </section>
            );
          })() : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-[12px] text-slate-500">
            {is ? `Keppnistímabil — Uppbyggingar-rampinn er undirbúnings-verkfæri. Skiptu í „Undirbúningur“ efst til að sjá HANS eigin ramp-tölur (vika fyrir viku, úr leikeiningunni${player ? ` ${player.name}s` : ""}) — ekki bara liðsins (Pre-season flipinn). Dæmigerða keppnistímabils-vikan er „Leikmanns-kröfur“ að ofan.` : `In-season — the Build-up ramp is a pre-season tool. Switch to “Pre-season” at the top to see HIS own ramped numbers (week by week, from ${player ? `${player.name}'s` : "his"} match unit) — not just the team's (that's the Pre-season tab). The typical in-season week is the “Player Demands” card above.`}{" "}
            <button type="button" onClick={() => setPhaseOverride("preseason")} className="font-semibold text-[#2740e6] hover:underline">{is ? "Skipta í undirbúning →" : "Switch to Pre-season →"}</button>
          </div>
          )}
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
                <p className="mt-2 text-[11px] text-slate-500"><CiteRefs text={preEmphasis.cite} is={is} />.{is ? "Ráðgefandi — allir fara í gegnum röðina; þetta setur upphafið. Aldrei readiness-liturinn." : "Advisory — everyone runs the sequence; this sets the start. Never the readiness colour."}</p>
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
                      <p className="mt-1 text-[12px] text-slate-600">MAS: <b>{player.masKmh} {is ? "km/klst" : "km/h"}</b> <span className="text-slate-500">· {is ? (player.masSourceIs ?? player.masSource) : player.masSource}{player.masAgeDays != null ? ` · ${is ? `${player.masAgeDays} daga gamalt` : `${player.masAgeDays} days old`}` : ""}</span>
                        {player.masEstimated && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900" title={is ? "MAS reiknað úr 30-15 IFT (VIFT × 0,86 — nálgun MicroPulse; 30-15 IFT: Buchheit 2008) — ekki mælt beint." : "MAS worked out from the 30-15 IFT (VIFT × 0.86 — MicroPulse's approximation; 30-15 IFT: Buchheit 2008), not measured directly."}>{is ? "áætlun" : "estimate"}</span>}</p>
                      <table className="mt-1 w-full text-[12px] text-slate-700">
                        <tbody>{player.intervals.map((z) => <tr key={z.type}><td className="py-0.5 pr-2 text-slate-500">T{z.type} · {is ? z.label.is : z.label.en}</td><td className="py-0.5 text-right font-semibold tabular-nums">{z.kmh} km/klst</td><td className="py-0.5 pl-2 text-right text-[11px] text-slate-500">{z.pctMas}% MAS</td></tr>)}</tbody>
                      </table>
                    </>
                  ) : <p className="mt-1 text-[12px] text-slate-500">{(player.latestTests ?? []).length
                    ? (is ? "Ekkert hraðapróf (MAS) — interval fellur á sjálfgefið liðsgildi. Yo-Yo gefur vegalengd, ekki hraða." : "No speed test (MAS) — intervals fall back to the squad default. A Yo-Yo gives a distance, not a speed.")
                    : (is ? "Ekkert þolpróf — sjá gögn-tilbúnaðar spjaldið." : "No endurance test — see the data-readiness panel.")}</p>}
                  {(player.latestTests ?? []).length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-600"><span className="font-semibold text-slate-500">{is ? "Nýjustu próf" : "Latest tests"}:</span>{" "}
                      {(player.latestTests ?? []).map((t) => `${is ? t.label.is : t.label.en} ${is ? String(t.value).replace(".", ",") : t.value} ${t.unit} (${shortDate(t.date, is)})`).join(" · ")}</p>
                  )}
                  <button type="button" onClick={() => setShowTestEntry((v) => !v)} className="mt-2 text-[12px] font-semibold text-[#2740e6] hover:underline">
                    {showTestEntry ? (is ? "Loka skráningu" : "Close") : (is ? "Skrá þolpróf" : "Record a fitness test")} {showTestEntry ? "▴" : "▾"}
                  </button>
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
                      <p className="mt-1 text-[12px] text-slate-700"><b>{is ? player.strengthFallback.pct1rm.is : player.strengthFallback.pct1rm.en}</b>{player.strengthFallback.velocity ? <> · {is ? player.strengthFallback.velocity.is : player.strengthFallback.velocity.en}</> : null} · {is ? player.strengthFallback.intent.is : player.strengthFallback.intent.en}</p>
                      <p className="mt-1 text-[11px] text-slate-500"><CiteRefs text={player.strengthFallback.cite} is={is} /></p>
                    </>
                  ) : <p className="mt-1 text-[12px] text-slate-500">{is ? "Enginn VBT prófíll." : "No VBT profile."}</p>}
                </div>
                {/* Record a result without leaving the hub — the same form + store as Conditioning. Saving
                    reloads the plan, so the new MAS / interval speeds show straight away. */}
                {showTestEntry && (
                  <div className="sm:col-span-2">
                    <FitnessTestCard
                      key={player.playerId}
                      players={plan.players.map((p) => ({ id: p.playerId, name: p.name }))}
                      playerId={player.playerId}
                      defaultType={aerobicTest}
                      onSaved={reloadAfterTest}
                    />
                  </div>
                )}
              </div>
            )}

            {/* THE MATCH UNIT — his own near-full match (typical + peak) → the weekly target it implies */}
            {player && (() => {
              const mu = player.matchUnit;
              const wt = (effPhase === "preseason" && player.matchUnit.load.typical != null)
                ? weeklyTargetFromMatch(player.matchUnit.load.typical, { phase: "preseason", sessionCount: psSess, readinessCapPct: player.vald.capPct ?? undefined, minutesTypical: player.matchUnit.minutesTypical })
                : player.weekTargets[effPhase];
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
                    <p className="mt-1 text-[11px] text-slate-500"><CiteRefs text={wt.cite} is={is} /></p>
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

          {/* The team plan lives on its tabs — this stays per-player (the whole-squad table is at the top of this tab). */}
          <p className="text-[12px] text-slate-500">{is ? "Liðs-ramminn sem þessi blokk situr inni í er á " : "The team plan this block sits inside is on the "}<a href="?tab=plan" onClick={(e) => { e.preventDefault(); setTab("plan"); }} className="font-semibold text-[#2740e6] hover:underline">{is ? "Meso-lota" : "Meso tab"}</a> · <a href="?tab=preseason" onClick={(e) => { e.preventDefault(); setTab("preseason"); }} className="font-semibold text-[#2740e6] hover:underline">{is ? "Undirbúningur" : "Pre-season"}</a></p>

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

          <p className="text-[10px] text-slate-400">{is ? "Reglur mæla með — þjálfari ákveður og hnekkir. Tímabilsskipulag setur áætlunina; readiness stýrir deginum. Það breytir aldrei readiness-litnum. Martín-García 2018 (niðurtröppun) · Buchheit & Laursen 2013 (interval) · Mann/Weakley (VBT-svæði)." : "Rules recommend — the coach decides and overrides. Periodization sets the plan; readiness modulates the day. It never changes the readiness colour. Martín-García 2018 (taper) · Buchheit & Laursen 2013 (intervals) · Mann/Weakley (VBT zones)."}</p>
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
                    {(day.accHiEff != null || day.decHiEff != null || day.stride != null || day.fr != null || day.cod != null || day.accel != null || day.dir) && (
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                        {(day.accel != null || day.decel != null) && <span>{plan.tier.tier === "pro" ? "IMA " : ""}Acc/Dec: <b className="tabular-nums">{day.accel ?? "–"}/{day.decel ?? "–"}</b></span>}
                        {day.accHiEff != null && <span>Acc B2–3: <b className="tabular-nums">{day.accHiEff}</b></span>}
                        {day.decHiEff != null && <span>Dec B2–3: <b className="tabular-nums">{day.decHiEff}</b></span>}
                        {day.stride != null && <span>{is ? "Langhl.-skref á leikhraða" : "Long-run strides at match pace"}: <b className="tabular-nums">{day.stride}</b></span>}
                        {day.fr != null && <span>{is ? "Löng hlaup á leikhraða" : "Long runs at match pace"}: <b className="tabular-nums">{day.fr} m</b></span>}
                        {day.cod != null && <span>{is ? "Stefnubr." : "CoD"}: <b className="tabular-nums">{day.cod}</b></span>}
                        {day.dir && <span>{is ? "stefna" : "dir"} → <b>{domDir(day.dir, is)}</b></span>}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Team average on the training variables (GPS + IMA) — the baseline the targets scale from */}
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{(is ? baseline.label.is : baseline.label.en)} — {is ? (isKinexon ? "meðaltal á æfingu (Kinexon)" : "meðaltal á æfingu (GPS + IMA)") : (isKinexon ? "average per session (Kinexon)" : "average per session (GPS + IMA)")}</div>
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
                  {a.strideHi != null && <span title={is ? "Skref í löngum samfelldum hlaupum á leikhraða (≥18 sek, 11 km/klst+). Skokk telst ekki með. Ekki sprettir" : "Strides in long continuous runs at match pace (≥18 s, 11 km/h+). Jogs do not count. Not sprinting"}>{is ? "Langhl.-skref á leikhraða" : "Long-run strides at match pace"}: <b className="tabular-nums">{a.strideHi}</b></span>}
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
