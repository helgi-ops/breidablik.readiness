"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Download, FileText, ChevronDown } from "lucide-react";
import { useLang } from "@/lib/lang";
import { COACH_COPY } from "../coachCopy";
import { PlayerTrendTab } from "./PlayerTrendTab";
import ChatThread from "@/components/chat/ChatThread";
import BroadcastModal from "@/components/chat/BroadcastModal";
import { RtpTab } from "./RtpTab";
import { OnboardingChecklist } from "./OnboardingChecklist";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import computeTeamDecision from "@/lib/decision/engine";
import { classifyNeuralLoad } from "@/lib/neuralLoad/classify";
import { buildTeamNeuralLoadSummary } from "@/lib/neuralLoad/teamSummary";
import { runNeuralLoadValidationSuite } from "@/lib/neuralLoad/validation";
import type { NeuralLoadClassification } from "@/lib/neuralLoad/types";
import { buildExplainableReadinessDecision } from "@/lib/micropulse/readiness";
import { buildInjuryRiskDecision } from "@/lib/micropulse/injuryRisk";
import { buildAthleteDecision } from "@/lib/micropulse/domain/decision";
import { buildDailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot";
import { computeCompositeLoadConcern } from "@/lib/micropulse/compositeLoad";
import { computeRpeDiscrepancy } from "@/lib/micropulse/rpeDiscrepancy";
import {
  buildPerformanceIntelligenceDecision,
  buildTeamPerformanceIntelligenceSummary,
} from "@/lib/micropulse/performanceIntelligence";
import type { PerformanceIntelligenceDecision } from "@/lib/micropulse/performanceIntelligence";
import { buildTeamRiskMap } from "@/lib/micropulse/performanceIntelligence/teamRiskMap";
import { buildWeeklyRiskReport } from "@/lib/micropulse/performanceIntelligence/weeklyReport";
import { buildTeamOutlook } from "@/lib/micropulse/performanceIntelligence/teamOutlook";
import { resolveSessionMdContextFromSources } from "@/lib/micropulse/weekSetup/sessionSource";
import { computePlayerVolatilitySummary } from "@/lib/micropulse/volatility/compute";
import { summarizeDrivers, volatilityLevelLabel, volatilityLevelTone } from "@/lib/micropulse/volatility/format";
import type { VolatilityDailyPoint } from "@/lib/micropulse/volatility/types";
import {
  buildNeuralVolatilityIntelligenceDecision,
  buildTeamNeuralVolatilitySummary,
  type NeuralVolatilityIntelligenceDecision,
} from "@/lib/micropulse/neuralVolatilityIntelligence";
import {
  buildPrescriptionDecision,
  buildTeamPrescriptionSummary,
  type PrescriptionDecision,
} from "@/lib/micropulse/prescriptionEngine";
import {
  buildSessionDraft,
  buildTeamSessionBuildSummary,
  type SessionDraft,
} from "@/lib/micropulse/autoSessionBuilder";
// Session workflow imports removed (feature removed)
import {
  applyCoachRules,
  buildTeamRulesSummary,
  type FinalRecommendationDecision,
  type CoachRule,
} from "@/lib/micropulse/rulesEngine";
import {
  buildRuntimeRulesFromAdminConfig,
  createDefaultAdminConfigSnapshot,
  getProtectedPlayerTags,
  isPlayerProtectedByAdminConfig,
  loadAdminConfigSnapshotFromStorage,
  type AdminConfigSnapshot,
} from "@/lib/micropulse/adminConfig";
import {
  computeSprintExposure,
  type DailySprintExposure,
} from "@/lib/micropulse/sprintExposure";
import ExplainabilityDrawer from "@/components/performanceIntelligence/ExplainabilityDrawer";
import type { ImaSessionProfile, ImaPlayerDay } from "@/lib/micropulse/imaDayProfile";
import PerformanceIntelligencePanel from "@/components/performanceIntelligence/PerformanceIntelligencePanel";
import SessionDraftCard from "@/components/sessionBuilder/SessionDraftCard";
import SessionDraftDetails from "@/components/sessionBuilder/SessionDraftDetails";
import TeamSessionBuildSummaryCard from "@/components/sessionBuilder/TeamSessionBuildSummary";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SessionRpeMonitoringCard from "@/components/coach/SessionRpeMonitoringCard";
import PlayerHistoricalSnapshotCard from "@/components/coach/PlayerHistoricalSnapshotCard";
import DailyInternalLoadCard from "@/components/coach/DailyInternalLoadCard";
import LoadMetricsCard from "@/components/coach/LoadMetricsCard";
// MechanicalLoadIndexCard moved to /coach/load-intelligence (was on the GPS Data tab).
import InternalAcwrCard from "@/components/coach/InternalAcwrCard";
import DecisionSummaryCard from "@/components/coach/DecisionSummaryCard";
import { TeamIndoorBriefing } from "@/components/coach/TeamIndoorBriefing";
import WeeklyNarrativeCard from "@/components/coach/WeeklyNarrativeCard";
import DailyBriefingCard from "@/components/coach/DailyBriefingCard";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import UnfamiliarLoadCard from "@/components/coach/UnfamiliarLoadCard";
import CoachBreakBanner from "@/components/coach/CoachBreakBanner";
import OverrideHistoryCard from "@/components/coach/OverrideHistoryCard";
import WeeklyStoryCard from "@/components/coach/WeeklyStoryCard";
import PlannedSessionLoadCard from "@/components/coach/PlannedSessionLoadCard";
import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";
import { buildPlannedVsActual, PVA_KPIS, PVA_LABEL, type PlannedVsActual, type PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";
import { downloadLoadPlanPdf, type LoadPlanForPdf } from "@/components/coach/LoadPlanPdf";
import { readRestDayPref, writeRestDayPref } from "@/lib/coach/restDayPref";
// VerdictAccuracyCard moved to ReportingCenterPage (system-health metric, not a daily briefing concern).
import AddPlayerButton from "@/components/coach/AddPlayerButton";
import FatigueTypeChip from "@/components/micropulse/FatigueTypeChip";
// TeamMetabolicSummary moved to /coach/load-intelligence (was on the GPS Data tab).
import CoachGpsManualEntry from "@/components/coach/CoachGpsManualEntry";
// GpsLoadIntelligence moved to /coach/load-intelligence (was on the GPS Data tab).
import CoachDrillsTab from "@/components/coach/CoachDrillsTab";
import TrainerDashboard from "@/components/trainer/TrainerDashboard";
// (TeamSwitcher moved into CoachShell sidebar — coach can swap teams from
//  the sidebar header now, no longer rendered here.)

/* ── Error boundary for TrainerDashboard ──────────────── */
class TrainerErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[TrainerDashboard crash]", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <p className="text-red-600 font-medium mb-2">Villa kom upp</p>
          <p className="text-sm text-gray-500">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-4 py-2 bg-black text-white rounded-lg text-sm"
          >
            Reyna aftur
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import ValdAlertsPanel from "@/components/dashboard/ValdAlertsPanel";
import CoachStrengthVbtTab from "@/components/dashboard/CoachStrengthVbtTab";
import CoachMdComparisonCard from "@/components/dashboard/CoachMdComparisonCard";
import CoachWeeklyLoadCard from "@/components/dashboard/CoachWeeklyLoadCard";
import { buildDevDailySessionAdapterResult } from "@/lib/micropulse/trainingGraph/devAdapter";
import {
  buildCatapultReadinessContextFromRows,
  buildTeamExternalLoadSummary,
  computeHidTrend,
  normalizeCatapultDailyLoadRow,
  type CatapultExternalLoadBaseline,
  type CatapultDailyLoadRow,
  type CatapultExternalLoadSignals,
  type CatapultReadinessModifier,
  type TeamExternalLoadSummary,
} from "@/lib/micropulse/externalLoad";
import {
  computeCatapultMetricAverage,
  computeCatapultWeeklyMetricSnapshot,
  getCatapultMetricDefinition,
  getCatapultMetricValue,
  getDefaultCatapultTodayVsTeamMetricKeys,
  getDefaultCatapultWeeklyLoadMetricKeys,
  type CatapultMetricKey,
} from "@/lib/integrations/catapult/metricCatalog";
import { usePlan } from "@/lib/micropulse/product";
import UpgradeWall from "@/components/micropulse/UpgradeWall";

/** -----------------------------
 * Types
 * ----------------------------- */
type TrainingAction = "FULL" | "REDUCED" | "RECOVERY";
type FinalColor = "red" | "yellow" | "green";
type FinalFlag = "RED" | "YELLOW" | "GREEN";
type Filter = "all" | FinalColor;
type PlayerDetailSectionKey =
  | "readinessDecision"
  | "injuryRisk"
  | "readinessInputs"
  | "fatigueAdaptation"
  | "trainingSession"
  | "neuralLoad"
  | "coachMessage";

type PlanPreview = {
  team_id: string | null;
  md_day: string | null;
  source?: string | null;
  confidence?: number | string | null;
  readiness_level: "GREEN" | "YELLOW" | "RED" | null;
  is_locked: boolean | null;
  template_title: string | null;
  template_description: string | null;
  template_structure: any | null;
};

type TemplateLite = {
  id: string;
  title: string | null;
  code: string | null;
};

type TeamIntel = {
  team_id: string;
  entry_date: string;
  n_players: number | null;
  n_red: number | null;
  n_yellow: number | null;
  n_green: number | null;
  n_green_plus: number | null;
  pct_red: number | null;
  pct_yellow: number | null;
  pct_green: number | null;
  pct_green_plus: number | null;
  n_volatile: number | null;
  volatility_pct: number | null;
  n_low_baseline: number | null;
  baseline_low_pct: number | null;
  baseline_maturity: string | null;
  team_status: string | null;
  recommendation: string | null;
  narrative?: string | null;
  monitoring_notes?: string[] | string | null;
  session_recommendation?: string | null;
};

type TeamSignal = {
  n_players: number;
  n_full: number;
  n_reduced: number;
  n_recovery: number;
  avg_confidence?: number | null;
};

type ReminderStatus = {
  dateKey: string;
  totalPlayers: number;
  checkedIn: number;
  missing: number;
  lastManualSendAt: string | null;
};

type ExternalLoadDailyRow = {
  player_id: string;
  date: string;
  total_distance: number | null;
  high_speed_distance: number | null;
  sprint_distance: number | null;
  accelerations: number | null;
  decelerations: number | null;
  player_load: number | null;
  max_velocity: number | null;
  velocity_band5_total_distance?: number | null;
  velocity_band6_total_distance?: number | null;
  hir_dist?: number | null;
  max_vel?: number | null;
  accel_b2_3_tot_effs_gen2?: number | null;
  tot_as?: number | null;
  decel_b2_3_tot_effs_gen2?: number | null;
  tot_ds?: number | null;
  total_player_load?: number | null;
  player_load_per_minute?: number | null;
  source: string | null;
};

type ExternalLoadBaseline = {
  totalDistanceAvg: number | null;
  sprintDistanceAvg: number | null;
  accelerationsAvg: number | null;
  playerLoadAvg: number | null;
  maxVelocityAvg: number | null;
  velocityBand5Avg: number | null;
  velocityBand6Avg: number | null;
  hirDistAvg: number | null;
  accelB23Avg: number | null;
  totAsAvg: number | null;
  decelB23Avg: number | null;
  totDsAvg: number | null;
  totalPlayerLoadAvg: number | null;
  maxVelAvg: number | null;
};

type DayState = "NORMAL_DAY" | "OFF_DAY" | "NO_INPUT_EXPECTED" | "MISSING_INPUT";

type DayStateInput = {
  readinessCount: number;
  mdDay: string | null | undefined;
  plannedDayType: Array<string | null | undefined>;
  complianceCounts: {
    totalPlayers: number;
    missing: number | null;
  };
  teamContext: {
    intensity: string | null | undefined;
  };
};

type DecisionConfidence = {
  level: "HIGH" | "MEDIUM" | "LOW";
  inputsUsed: string[];
  missingInputs: string[];
  fallbackUsed: boolean;
};

type ReadinessRiskReportPlayer = {
  name: string;
  readinessStatus: "YELLOW" | "RED";
  score: number | null;
  confidence: number | null;
  why: string[];
  checkInScore: number | null;
  zScore: number | null;
  deltaZ: number | null;
  acwr: number | null;
  sleepScore: number | null;
  hrv: number | null;
  volatility: number | null;
  ateSessionMode: "full" | "modified" | "recovery";
  injuryRiskLevel: "LOW" | "MODERATE" | "HIGH";
  injuryConfidence: "low" | "medium" | "high";
  injuryWhy: string[];
  injuryRecommendation: string[];
  // Counterfactual "what-if" alternatives for this player today.
  // Empty when no single-lever flip improves the verdict (or when
  // the engine can't be run for this player). Surfaced in the
  // BriefingCard attention list as a 1-line italic hint and in the
  // PlayerClient self-service view.
  counterfactuals?: Array<{
    signal: string;
    currentValue: string;
    hypotheticalValue: string;
    hypotheticalState: "GREEN" | "YELLOW" | "RED" | "GRAY";
    impact: 1 | 2 | 3;
    descriptionEN: string;
    descriptionIS: string;
  }>;
};

type ReadinessRiskReportData = {
  teamName: string;
  date: string;
  flaggedPlayers: ReadinessRiskReportPlayer[];
  summary: {
    green: number;
    yellow: number;
    red: number;
  };
};

// ── Post-Training Report types ─────────────────────────────────
type PostTrainingReportPlayer = {
  name: string;
  position: string;
  readinessFlag: "GREEN" | "YELLOW" | "RED" | "—";
  totalDistance: number | null;
  totalDistancePct: number | null;   // % of 28D chronic avg
  hsd: number | null;                // High-speed distance (Vel B5+B6)
  hsdPct: number | null;
  playerLoad: number | null;
  playerLoadPct: number | null;
  playerLoadPerMin: number | null;
  accelB23: number | null;
  decelB23: number | null;
  maxVelocity: number | null;
  acwr: number | null;
  // Internal load (RPE)
  rpe: number | null;
  sessionLoad: number | null;        // RPE × duration
  durationMinutes: number | null;
  rpeSubmitted: boolean;
  attentionFlag: "OK" | "MONITOR" | "ALERT";
  attentionReason: string[];
};

type PostTrainingReportData = {
  teamName: string;
  sessionDate: string;
  mdDay: string;
  players: PostTrainingReportPlayer[];
  teamAvg: {
    totalDistance: number | null;
    hsd: number | null;
    playerLoad: number | null;
    accelB23: number | null;
    decelB23: number | null;
    maxVelocity: number | null;
  };
  rpeTeamAvg: number | null;
  rpeTotalLoad: number | null;
  rpeSubmissionCount: number;
  alertCount: number;
  monitorCount: number;
  /** Biomechanical (IMA / stride) view of the session — null if no IMA data. */
  ima: ImaSessionProfile | null;
  /** Load explainability — team metrics today vs the recent norm and the
   *  peak-load (≈ match) day, the player distribution, and per-player spikes. */
  loadSummary: {
    pl: LoadMetricSummary;
    dist: LoadMetricSummary;
    hsd: LoadMetricSummary;
    distribution: { total: number; above: number; elevated: number; inLine: number; below: number };
    teamSpike: boolean;
    spikePlayers: Array<{ name: string; plPct: number | null; distPct: number | null; acwr: number | null }>;
  };
  /** Planned (pre-session recommendation) vs actual session load — team + per player. */
  plannedVsActual?: PlannedVsActual | null;
};

type LoadMetricSummary = {
  today: number | null;
  avg: number | null;
  peak: number | null;
  pctAvg: number | null;
  pctMatch: number | null;
};

type Row = {
  readiness_entry_id: string | null;

  entry_date: string;
  created_at: string;

  player_id: string;
  full_name: string;
  team: string | null;
  team_id?: string | null;
  position: string | null;

  readiness: number | null;
  sleep: number | null;
  soreness: number | null;
  fatigue_energy?: number | null;
  sleep_quality?: number | null;
  sleep_duration?: number | null;
  stress_mood?: number | null;
  muscle_soreness?: number | null;
  total_score: number | null;
  notes: string | null;
  sore_areas?: string[] | null;

  planned_day_type?: string | null;
  planned_focus?: string | null;

  training_action: TrainingAction | null;
  coach_message: string | null;
  is_locked: boolean;

  final_color?: FinalColor | null;
  final_reason?: string | null;
  final_flag?: FinalFlag | null;

  md_day?: string | null;

  system_decision?: TrainingAction | null;
  coach_decision?: TrainingAction | null;
  final_decision?: TrainingAction | null;
  final_source?: string | null;
  stage4_updated_at?: string | null;

  ui_key?: string;

  // `_confidence_num` and `_needs_review` removed — the backing
  // `system_confidence` column was a hardcoded 0.95 placeholder with no
  // real computation and on the wrong scale, producing false review
  // flags. We rely on concrete signals (readiness colour, composite
  // load, PL spike, fatigue type) instead.
  _adaptation?: {
    reduceVolumePct?: number;
    reduceContactsPct?: number;
    extendRest?: boolean;
    simplifySession?: boolean;
    recoveryBias?: boolean;
    swapBallistic?: boolean;
    protectTissue?: "ACHILLES" | "HAMSTRING" | "PATELLAR" | null;
    addTendonReload?: boolean;
    addNeuralReset?: boolean;
    notes?: string[];
  } | null;
  _adaptation_summary?: string | null;
  _neural_load?: NeuralLoadClassification | null;
  _neural_bias_applied?: boolean;
  _neural_bias_reason_codes?: string[] | null;
  _performance_intelligence?: PerformanceIntelligenceDecision | null;
  _neural_volatility_intelligence?: NeuralVolatilityIntelligenceDecision | null;
  _prescription_decision?: PrescriptionDecision | null;
  _final_recommendation_decision?: FinalRecommendationDecision | null;
  _session_draft?: SessionDraft | null;

  training_modifier?: any | null;

  _z_today?: number | null;
  _yesterday_z?: number | null;
  _dz?: number | null;
  _spark?: string | null;

  _sten?: number | null;
  _baseline_n?: number | null;
  _external_load_today?: ExternalLoadDailyRow | null;
  _external_load_baseline?: ExternalLoadBaseline | null;
  _catapult_baseline?: CatapultExternalLoadBaseline | null;
  _catapult_signals?: CatapultExternalLoadSignals | null;
  _catapult_modifier?: CatapultReadinessModifier | null;
  _catapult_history?: CatapultDailyLoadRow[] | null;
};

/** -----------------------------
 * Helpers (safe parsing etc.)
 * ----------------------------- */

/** Small "i" info icon with hover/focus tooltip — used on Today Command Center
 *  tiles. Mirrors the pattern from /coach/decel-intelligence so coaches get a
 *  consistent way to learn what each metric means without needing a manual.
 *  Tooltip is anchored bottom-left so it doesn't get clipped by the right
 *  edge of the grid. */
function CommandTileInfo({ title, info }: { title: string; info: string }) {
  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        aria-label={`More info about ${title}`}
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] font-bold opacity-70 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-current"
      >
        i
      </button>
      <span
        role="tooltip"
        // opacity-100 here is a defence in depth — even if the tile/parent
        // applies opacity, this span starts a fresh stacking context via
        // `isolate` and stays fully opaque so the text is readable.
        className="invisible group-hover:visible group-focus-within:visible absolute left-0 top-5 z-50 w-72 rounded-md border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-700 shadow-lg normal-case tracking-normal font-normal opacity-100 isolate"
      >
        {info}
      </span>
    </span>
  );
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoMondayOfISO(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mapNoMatchIntentToGrid(intent: string | null | undefined): { dayTypeFinal: string; doseFinal: string } {
  const token = String(intent ?? "").trim().toUpperCase();
  if (token === "OFF") return { dayTypeFinal: "OFF", doseFinal: "OFF" };
  if (token === "GAME") return { dayTypeFinal: "GAME", doseFinal: "GAME" };
  if (token === "RECOVERY") return { dayTypeFinal: "RECOVERY", doseFinal: "RECOVERY" };
  if (token === "FORCE") return { dayTypeFinal: "TRAIN", doseFinal: "FORCE" };
  if (token === "VELOCITY") return { dayTypeFinal: "TRAIN", doseFinal: "VELOCITY" };
  if (token === "NEURAL_VELOCITY") return { dayTypeFinal: "TRAIN", doseFinal: "NEURAL / VELOCITY" };
  if (token === "POLISH_CALM") return { dayTypeFinal: "TRAIN", doseFinal: "POLISH / CALM" };
  if (token === "ACTIVATION") return { dayTypeFinal: "TRAIN", doseFinal: "ACTIVATION" };
  return { dayTypeFinal: "TRAIN", doseFinal: "TRAIN" };
}

function toNum(x: any): number | null {
  if (x == null) return null;
  const n = typeof x === "string" ? Number(x) : x;
  return Number.isFinite(n) ? n : null;
}

function normalizeTrainingModifier(tm: any): any | null {
  if (tm == null) return null;
  if (typeof tm === "string") {
    try {
      return JSON.parse(tm);
    } catch {
      return null;
    }
  }
  return tm;
}

function extractBaselineN(tmRaw: any): number | null {
  const tm = normalizeTrainingModifier(tmRaw);
  if (!tm) return null;
  const n1 = toNum(tm?.pi?.baseline_n);
  if (n1 != null) return n1;
  const n2 = toNum(tm?.pi?.["baseline_n"]);
  if (n2 != null) return n2;
  const n3 = toNum(tm?.baseline_n);
  if (n3 != null) return n3;
  return null;
}

// NOTE: your DB writes `pi.z` (from the trigger you posted). Some views may use other shapes.
// We support a few possible keys, without changing DB.
function extractZ(tmRaw: any): number | null {
  const tm = normalizeTrainingModifier(tmRaw);
  if (!tm) return null;

  // 1) preferred from hybrid PI: tm.pi.z
  const z0 = toNum(tm?.pi?.z);
  if (z0 != null) return z0;

  // 2) legacy keys (if any)
  const z1 = toNum(tm?.pi?.z_today);
  if (z1 != null) return z1;

  const z2 = toNum(tm?.baseline_z);
  if (z2 != null) return z2;

  const z3 = toNum(tm?.["baseline_z"]);
  if (z3 != null) return z3;

  return null;
}

function extractYesterdayZ(tmRaw: any): number | null {
  const tm = normalizeTrainingModifier(tmRaw);
  if (!tm) return null;

  // if you store yesterday z explicitly
  const yz = toNum(tm?.pi?.yesterday_z);
  if (yz != null) return yz;

  // if you store delta_z and today z, we could infer yesterday = today - delta, but only if both exist
  const z = toNum(tm?.pi?.z);
  const dz = toNum(tm?.pi?.delta_z);
  if (z != null && dz != null) return z - dz;

  return null;
}

function extractRecentZHistory(tmRaw: any, zToday: number | null, zPrev: number | null): number[] {
  const tm = normalizeTrainingModifier(tmRaw);
  const out: number[] = [];

  const fromPi = Array.isArray(tm?.pi?.z_history) ? tm.pi.z_history : [];
  for (const v of fromPi) {
    const n = toNum(v);
    if (n != null) out.push(n);
  }

  if (!out.length && zPrev != null) out.push(zPrev);
  if (zToday != null) out.push(zToday);

  return out.slice(-7);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fmt2(n: number | null | undefined) {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(2) : "—";
}

/**
 * STEN transform (client-side only)
 * STEN has mean ~5.5 and SD 2.0 -> sten = round(z*2 + 5.5), clamp 1..10
 */
function zToSten(z: number | null | undefined): number | null {
  if (typeof z !== "number" || !Number.isFinite(z)) return null;
  const sten = Math.round(z * 2 + 5.5);
  return Math.max(1, Math.min(10, sten));
}

// Sparkline from numeric series (fixed scale)
function sparkline(values: number[], opts?: { min?: number; max?: number }) {
  const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = opts?.min ?? -2.5;
  const max = opts?.max ?? 2.5;

  const clampV = (x: number) => Math.max(min, Math.min(max, x));
  const norm = (x: number) => (clampV(x) - min) / (max - min);

  return values
    .map((v) => {
      const t = norm(v);
      const idx = Math.max(0, Math.min(blocks.length - 1, Math.round(t * (blocks.length - 1))));
      return blocks[idx];
    })
    .join("");
}

function volatilityLinePoints(values: number[], width = 220, height = 44, padding = 4): string {
  if (!values.length) return "";
  if (values.length === 1) {
    const y = height / 2;
    return `${padding},${y} ${width - padding},${y}`;
  }

  const min = 0;
  const max = 100;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  const stepX = innerW / (values.length - 1);

  return values
    .map((raw, idx) => {
      const x = padding + idx * stepX;
      const clamped = Math.max(min, Math.min(max, raw));
      const t = (clamped - min) / (max - min);
      const y = padding + (1 - t) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function volatilitySeriesPoints(values: number[], width = 220, height = 44, padding = 4): Array<{ x: number; y: number; value: number }> {
  if (!values.length) return [];
  if (values.length === 1) {
    return [{ x: width / 2, y: height / 2, value: Math.max(0, Math.min(100, values[0])) }];
  }

  const min = 0;
  const max = 100;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  const stepX = innerW / (values.length - 1);

  return values.map((raw, idx) => {
    const x = padding + idx * stepX;
    const clamped = Math.max(min, Math.min(max, raw));
    const t = (clamped - min) / (max - min);
    const y = padding + (1 - t) * innerH;
    return { x, y, value: clamped };
  });
}

function prettyMd(md: string | null | undefined) {
  const v = (md ?? "").trim();
  if (!v) return { md: "—", label: "No MD set" };
  const U = v.toUpperCase();
  if (U === "MD") return { md: "MD", label: "GAME" };
  if (U === "MD+1") return { md: "MD+1", label: "POST" };
  return { md: v, label: v };
}

function mdFromPlannedFocus(focus: string | null | undefined) {
  const s = String(focus ?? "").toUpperCase();
  const m = s.match(/\bMD[+-]?\d*\b/);
  return m?.[0] ?? null;
}

function dateKey(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.slice(0, 10);
}

function isValidMdToken(x: string | null | undefined) {
  const s = String(x ?? "").trim().toUpperCase();
  if (!s) return false;
  return /^MD([+-]\d+)?$/.test(s);
}

function shortReason(reason?: string | null) {
  const s = String(reason ?? "").trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith("hybrid:")) return null;
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

function applySorenessDowngrade(input: {
  flag: FinalFlag | null;
  color: FinalColor | null;
  reason: string | null;
  soreness: number | null;
}) {
  const soreness = input.soreness ?? 0;

  if (soreness > 2 || !input.flag || !input.color) {
    return {
      final_flag: input.flag,
      final_color: input.color,
      final_reason: input.reason,
    };
  }

  const final_flag: FinalFlag = input.flag === "GREEN" ? "YELLOW" : input.flag === "YELLOW" ? "RED" : "RED";
  const final_color: FinalColor = input.color === "green" ? "yellow" : input.color === "yellow" ? "red" : "red";

  const final_reason =
    input.flag === "GREEN" ? "YELLOW: Low soreness reported. Adjust load." : "RED: Low soreness and risk signal. Recovery/very light day.";

  return { final_flag, final_color, final_reason };
}

function formatConfidence(v: PlanPreview["confidence"]) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (Number.isFinite(v)) {
    if (v <= 1) return `${Math.round(v * 100)}%`;
    if (v <= 100) return `${Math.round(v)}%`;
    return String(v);
  }
  return "—";
}

const colorMeta = (c?: string | null) => {
  const C = (c || "").toUpperCase();
  if (C === "RED") return { label: "RED", dot: "bg-red-500", pill: "bg-red-50 text-red-700 border-red-200" };
  if (C === "YELLOW")
    return { label: "YELLOW", dot: "bg-yellow-400", pill: "bg-yellow-50 text-yellow-800 border-yellow-200" };
  return { label: "GREEN", dot: "bg-green-500", pill: "bg-green-50 text-green-700 border-green-200" };
};

function v(n: number | null | undefined) {
  return typeof n === "number" ? n : "—";
}

// Check-in wellness scale is 1..5 where 1 is worst and 5 is best.
// Fatigue rules use risk-oriented direction (higher = worse), so invert 1<->5.
function toRiskLikertFromCheckin(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v >= 1 && v <= 5) return 6 - v;
  return v;
}

function teamStatusMeta(status: string | null | undefined) {
  const s = String(status ?? "").toUpperCase();
  if (s === "ALERT") return { label: "ALERT", border: "border-red-200", bg: "bg-red-50", text: "text-red-800" };
  if (s === "CAUTION")
    return { label: "CAUTION", border: "border-yellow-200", bg: "bg-yellow-50", text: "text-yellow-900" };
  return { label: "OK", border: "border-green-200", bg: "bg-green-50", text: "text-green-800" };
}

function isOffLikeToken(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "OFF" || v === "REST" || v === "DAY_OFF" || v === "DAY OFF";
}

function isNoInputExpectedToken(value: string | null | undefined) {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "OTHER" || v === "NO_INPUT" || v === "NO INPUT";
}

function dayStateMeta(state: DayState) {
  if (state === "OFF_DAY") {
    return {
      label: "OFF DAY",
      badge: "bg-slate-700 text-white",
      reason: "OFF/rest context detected. Input is generally not expected for readiness decisions.",
    };
  }
  if (state === "NO_INPUT_EXPECTED") {
    return {
      label: "NO INPUT EXPECTED",
      badge: "bg-slate-200 text-slate-800",
      reason: "No-input context detected (e.g. OTHER/maintenance context or no active players expected).",
    };
  }
  if (state === "MISSING_INPUT") {
    return {
      label: "MISSING INPUT",
      badge: "bg-amber-600 text-white",
      reason: "Readiness inputs are missing for expected players today.",
    };
  }
  return {
    label: "NORMAL DAY",
    badge: "bg-emerald-600 text-white",
    reason: "Normal readiness day: check-ins and decision inputs expected as usual.",
  };
}

function getDayState(input: DayStateInput): { state: DayState; reason: string } {
  const mdNorm = String(input.mdDay ?? "").trim().toUpperCase();
  const planDayTypes = (input.plannedDayType ?? []).map((x) => String(x ?? "").trim().toUpperCase()).filter(Boolean);

  const offByIntensity = String(input.teamContext.intensity ?? "").trim().toUpperCase() === "OFF";
  const offByMd = isOffLikeToken(mdNorm);
  const allPlanTypesOffLike = planDayTypes.length > 0 && planDayTypes.every((t) => isOffLikeToken(t));

  // Priority 1: explicit OFF context
  if (offByIntensity || offByMd || allPlanTypesOffLike) {
    return { state: "OFF_DAY", reason: "Explicit OFF/rest context detected from intensity/MD/day-type." };
  }

  // Priority 2: readiness rows exist => normal readiness day
  if ((input.readinessCount ?? 0) > 0) {
    return { state: "NORMAL_DAY", reason: "Readiness rows are present for today." };
  }

  const noInputByMd = isNoInputExpectedToken(mdNorm);
  const allPlanTypesNoInput = planDayTypes.length > 0 && planDayTypes.every((t) => isNoInputExpectedToken(t));
  const totalPlayers = Number(input.complianceCounts.totalPlayers ?? 0);

  // Priority 3: context suggests no input expected
  if (noInputByMd || allPlanTypesNoInput || totalPlayers === 0) {
    return { state: "NO_INPUT_EXPECTED", reason: "Day context indicates no player check-in input is expected." };
  }

  // Priority 4: default missing input
  return { state: "MISSING_INPUT", reason: "Expected readiness input is missing for today." };
}

// `confNum` and `needsReview` helpers removed — no remaining callers.
// Reinstate once the confidence pipeline is real and coach-facing.

const flagRank = (flag: any) => {
  const f = String(flag ?? "").toUpperCase();
  if (f === "RED") return 0;
  if (f === "YELLOW") return 1;
  return 2;
};

const flagToAction = (flag: string | null | undefined): TrainingAction => {
  const f = String(flag ?? "").toUpperCase();
  if (f === "RED") return "RECOVERY";
  if (f === "YELLOW") return "REDUCED";
  return "FULL";
};

function actionToSessionMode(action: TrainingAction | null | undefined): "full" | "modified" | "recovery" | "pending" {
  if (action === "RECOVERY") return "recovery";
  if (action === "REDUCED") return "modified";
  if (action === "FULL") return "full";
  return "pending";
}

function actionToPlannedIntensity(action: TrainingAction | null | undefined): "low" | "moderate" | "high" {
  if (action === "RECOVERY") return "low";
  if (action === "REDUCED") return "moderate";
  return "high";
}

const TEAM_RISK_COPY = {
  IS: {
    noDataWhy:   "Engin team-samantekt tiltæk fyrir daginn.",
    noDataRec:   "Refresh eða keyrðu Generate Today Decisions.",
    highRec:     "Breytðu æfingu: minnkaðu heildarálag (volume/intensity), forðastu mikla eccentrics/contacts, aukið recovery blocks. Haltu gæðum á lykilatriðum en skera niður magn.",
    cautionRec:  "Aðlaga daginn: halda gæðum en lækka magn (t.d. -20–30% sets/reps), velja minni árekstra, lengri hvíld, og fylgjast með þeim sem eru REDUCED/RECOVERY.",
    stableRec:   "Keyra plan að mestu: normal session, með sértækri áherslu á þá sem eru REDUCED/RECOVERY (individual mods).",
  },
  EN: {
    noDataWhy:   "No team summary available for today.",
    noDataRec:   "Refresh or run Generate Today Decisions.",
    highRec:     "Modify session: reduce total load (volume/intensity), avoid heavy eccentrics/contacts, increase recovery blocks. Maintain quality on key actions but cut volume.",
    cautionRec:  "Adjust the day: maintain quality but lower volume (e.g. -20–30% sets/reps), choose lower-contact options, extend rest periods, and monitor REDUCED/RECOVERY players.",
    stableRec:   "Run plan as normal: standard session, with individual focus on players flagged REDUCED/RECOVERY.",
  },
} as const;

function computeTeamRisk(signal: TeamSignal | null, lang: "IS" | "EN" = "IS") {
  const rc = TEAM_RISK_COPY[lang];

  if (!signal || !signal.n_players) {
    return {
      level: "UNKNOWN" as const,
      label: "No data",
      why: rc.noDataWhy,
      recommendation: rc.noDataRec,
    };
  }

  const n = signal.n_players;
  const reducedPct = (signal.n_reduced / n) * 100;
  const recoveryPct = (signal.n_recovery / n) * 100;
  const impactScore = recoveryPct * 1.5 + reducedPct * 1.0;

  if (impactScore > 30) {
    return {
      level: "HIGH" as const,
      label: "HIGH RISK",
      why: `Impact ${impactScore.toFixed(1)} (RECOVERY ${recoveryPct.toFixed(0)}%, REDUCED ${reducedPct.toFixed(0)}%).`,
      recommendation: rc.highRec,
    };
  }

  if (impactScore >= 15) {
    return {
      level: "CAUTION" as const,
      label: "CAUTION",
      why: `Impact ${impactScore.toFixed(1)} (RECOVERY ${recoveryPct.toFixed(0)}%, REDUCED ${reducedPct.toFixed(0)}%).`,
      recommendation: rc.cautionRec,
    };
  }

  return {
    level: "STABLE" as const,
    label: "STABLE",
    why: `Impact ${impactScore.toFixed(1)} (RECOVERY ${recoveryPct.toFixed(0)}%, REDUCED ${reducedPct.toFixed(0)}%).`,
    recommendation: rc.stableRec,
  };
}

function riskUi(level: "UNKNOWN" | "STABLE" | "CAUTION" | "HIGH") {
  switch (level) {
    case "HIGH":
      return { border: "border-red-200", bg: "bg-red-50", text: "text-red-800", pill: "bg-red-600 text-white" };
    case "CAUTION":
      return { border: "border-yellow-200", bg: "bg-yellow-50", text: "text-yellow-900", pill: "bg-yellow-600 text-white" };
    case "STABLE":
      return { border: "border-green-200", bg: "bg-green-50", text: "text-green-800", pill: "bg-green-600 text-white" };
    default:
      return { border: "border-gray-200", bg: "bg-gray-50", text: "text-gray-800", pill: "bg-gray-600 text-white" };
  }
}

function titleCaseToken(value: string | null | undefined): string {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return "—";
  return v
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function performanceRiskTone(
  band: "LOW" | "MODERATE" | "HIGH" | "CRITICAL"
): string {
  if (band === "LOW") return "text-emerald-700";
  if (band === "MODERATE") return "text-amber-700";
  if (band === "HIGH") return "text-orange-700";
  return "text-red-700";
}

function summaryLines(text: string | null | undefined, maxParts = 3): string[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/[.;]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length) return parts.slice(0, maxParts);
  return [raw];
}

function toMaybeFinite(x: unknown): number | null {
  const n = typeof x === "string" ? Number(x) : (x as number);
  return Number.isFinite(n) ? n : null;
}

function scoreFmt(x: number | null) {
  return x == null ? "—" : String(x);
}

function numFmt(x: number | null, digits = 2) {
  return x == null ? "—" : x.toFixed(digits);
}

function averageMetric(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function summarizeExternalLoad(rows: ExternalLoadDailyRow[], targetDate: string): {
  today: ExternalLoadDailyRow | null;
  baseline: ExternalLoadBaseline | null;
} {
  const exactToday = rows.find((row) => row.date === targetDate) ?? null;
  const previousRows = rows.filter((row) => row.date < targetDate);
  // When today has no GPS data yet (morning check-in before training),
  // fall back to the most recent previous day with data.
  const today = exactToday ?? (previousRows.length > 0 ? previousRows[previousRows.length - 1] : null);
  // Exclude fallback day from baseline to avoid double-counting
  const baselineRows = (today && !exactToday
    ? previousRows.filter((row) => row.date !== today.date)
    : previousRows
  ).slice(-7);

  if (!today && baselineRows.length === 0) {
    return { today: null, baseline: null };
  }

  return {
    today,
    baseline: {
      totalDistanceAvg: averageMetric(baselineRows.map((row) => row.total_distance)),
      sprintDistanceAvg: averageMetric(baselineRows.map((row) => row.sprint_distance)),
      accelerationsAvg: averageMetric(baselineRows.map((row) => row.accelerations)),
      playerLoadAvg: averageMetric(baselineRows.map((row) => row.player_load)),
      maxVelocityAvg: averageMetric(baselineRows.map((row) => row.max_velocity)),
      velocityBand5Avg: averageMetric(baselineRows.map((row) => row.velocity_band5_total_distance ?? null)),
      velocityBand6Avg: averageMetric(baselineRows.map((row) => row.velocity_band6_total_distance ?? null)),
      hirDistAvg: averageMetric(baselineRows.map((row) => row.hir_dist ?? null)),
      accelB23Avg: averageMetric(baselineRows.map((row) => row.accel_b2_3_tot_effs_gen2 ?? null)),
      totAsAvg: averageMetric(baselineRows.map((row) => row.tot_as ?? null)),
      decelB23Avg: averageMetric(baselineRows.map((row) => row.decel_b2_3_tot_effs_gen2 ?? null)),
      totDsAvg: averageMetric(baselineRows.map((row) => row.tot_ds ?? null)),
      totalPlayerLoadAvg: averageMetric(baselineRows.map((row) => row.total_player_load ?? null)),
      maxVelAvg: averageMetric(baselineRows.map((row) => row.max_vel ?? null)),
    },
  };
}

function externalLoadTone(value: number | null | undefined, baseline: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || typeof baseline !== "number" || !Number.isFinite(baseline) || baseline <= 0) {
    return {
      label: "No baseline",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  const ratio = value / baseline;
  if (ratio >= 1.5) {
    return { label: "Red", tone: "border-red-200 bg-red-50 text-red-700" };
  }
  if (ratio >= 1.2) {
    return { label: "Yellow", tone: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  return { label: "Green", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

function confidenceFmt(x: number | null) {
  if (x == null) return "—";
  return x <= 1 ? `${Math.round(x * 100)}%` : `${Math.round(x)}%`;
}

function acwrFmt(x: number | null) {
  return x == null ? "—" : x.toFixed(2);
}

const reportStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#111827", fontFamily: "Helvetica" },
  header: { marginBottom: 14, paddingBottom: 10, borderBottom: "2 solid #E5E7EB" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  headerMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  headerMetaText: { fontSize: 10, color: "#4B5563" },
  muted: { color: "#6B7280", fontSize: 9 },
  // Player card
  playerCard: { marginBottom: 14, border: "1 solid #D1D5DB", borderRadius: 6, overflow: "hidden" },
  playerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "8 10", backgroundColor: "#F9FAFB" },
  playerName: { fontSize: 13, fontWeight: 700 },
  badgeYellow: { fontSize: 11, fontWeight: 700, color: "#92400E", backgroundColor: "#FEF3C7", padding: "2 8", borderRadius: 4 },
  badgeRed: { fontSize: 11, fontWeight: 700, color: "#991B1B", backgroundColor: "#FEE2E2", padding: "2 8", borderRadius: 4 },
  // Coach action box
  actionBoxRecovery: { backgroundColor: "#FEE2E2", padding: "8 10", borderBottom: "1 solid #FECACA" },
  actionBoxModified: { backgroundColor: "#FEF3C7", padding: "8 10", borderBottom: "1 solid #FDE68A" },
  actionBoxFull: { backgroundColor: "#DCFCE7", padding: "8 10", borderBottom: "1 solid #BBF7D0" },
  actionLabel: { fontSize: 9, fontWeight: 700, color: "#6B7280", marginBottom: 2, textTransform: "uppercase" },
  actionTextRecovery: { fontSize: 12, fontWeight: 700, color: "#991B1B" },
  actionTextModified: { fontSize: 12, fontWeight: 700, color: "#92400E" },
  actionTextFull: { fontSize: 12, fontWeight: 700, color: "#166534" },
  actionNote: { fontSize: 9, color: "#4B5563", marginTop: 2 },
  // Body sections
  cardBody: { padding: "8 10" },
  sectionLabel: { fontSize: 9, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", marginBottom: 4, marginTop: 6 },
  reasonItem: { fontSize: 10, color: "#1F2937", marginBottom: 3, paddingLeft: 8 },
  // Injury risk
  injuryRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  injuryLabelLow: { fontSize: 10, fontWeight: 700, color: "#166534", backgroundColor: "#DCFCE7", padding: "1 6", borderRadius: 3 },
  injuryLabelModerate: { fontSize: 10, fontWeight: 700, color: "#92400E", backgroundColor: "#FEF3C7", padding: "1 6", borderRadius: 3 },
  injuryLabelHigh: { fontSize: 10, fontWeight: 700, color: "#991B1B", backgroundColor: "#FEE2E2", padding: "1 6", borderRadius: 3 },
  injuryRec: { fontSize: 9, color: "#374151", marginBottom: 2, paddingLeft: 8 },
  // Reference table
  refTableWrap: { marginTop: 8, borderTop: "1 solid #E5E7EB", paddingTop: 6 },
  refTableLabel: { fontSize: 8, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 },
  table: { border: "1 solid #E5E7EB", borderRadius: 3 },
  tHead: { flexDirection: "row", backgroundColor: "#F3F4F6" },
  tRow: { flexDirection: "row", borderTop: "1 solid #E5E7EB" },
  cellH: { flex: 1, padding: "3 4", fontSize: 8, fontWeight: 700, color: "#6B7280" },
  cell: { flex: 1, padding: "3 4", fontSize: 8, color: "#374151" },
  // Footer
  footerBar: { marginTop: 12, paddingTop: 8, borderTop: "1 solid #E5E7EB", flexDirection: "row", justifyContent: "space-between" },
  footerCount: { fontSize: 10 },
  footerGreen: { color: "#166534", fontWeight: 700 },
  footerYellow: { color: "#92400E", fontWeight: 700 },
  footerRed: { color: "#991B1B", fontWeight: 700 },
});

function coachAction(mode: "full" | "modified" | "recovery"): { boxStyle: any; textStyle: any; title: string; note: string } {
  if (mode === "recovery") return {
    boxStyle: reportStyles.actionBoxRecovery,
    textStyle: reportStyles.actionTextRecovery,
    title: "RECOVERY — Do not train today",
    note: "Athlete's body is under significant stress. Rest or light recovery work only.",
  };
  if (mode === "modified") return {
    boxStyle: reportStyles.actionBoxModified,
    textStyle: reportStyles.actionTextModified,
    title: "REDUCE LOAD — Modified session",
    note: "Reduce intensity or volume. Monitor closely during training.",
  };
  return {
    boxStyle: reportStyles.actionBoxFull,
    textStyle: reportStyles.actionTextFull,
    title: "FULL PARTICIPATION — Monitor closely",
    note: "Can train normally. Flag is precautionary — keep an eye on this player.",
  };
}

function injuryBadgeStyle(level: "LOW" | "MODERATE" | "HIGH") {
  if (level === "HIGH") return reportStyles.injuryLabelHigh;
  if (level === "MODERATE") return reportStyles.injuryLabelModerate;
  return reportStyles.injuryLabelLow;
}

function ReadinessRiskReportDocument({ data }: { data: ReadinessRiskReportData }) {
  const playersPerPage = 2;
  const flaggedPages: ReadinessRiskReportPlayer[][] = [];
  for (let i = 0; i < data.flaggedPlayers.length; i += playersPerPage) {
    flaggedPages.push(data.flaggedPlayers.slice(i, i + playersPerPage));
  }
  if (flaggedPages.length === 0) flaggedPages.push([]);

  return (
    <Document>
      {flaggedPages.map((pagePlayers, pageIdx) => (
        <Page key={`risk-report-page-${pageIdx}`} size="A4" style={reportStyles.page}>
          {/* Header — only on first page */}
          {pageIdx === 0 && (
            <View style={reportStyles.header}>
              <Text style={reportStyles.h1}>Daily Readiness Report</Text>
              <View style={reportStyles.headerMeta}>
                <Text style={reportStyles.headerMetaText}>{data.teamName || "—"}</Text>
                <Text style={reportStyles.headerMetaText}>{data.date}</Text>
              </View>
              <Text style={reportStyles.muted}>
                Players requiring attention: {data.flaggedPlayers.length} of {data.summary.green + data.summary.yellow + data.summary.red}
              </Text>
            </View>
          )}

          {/* Player cards */}
          {pagePlayers.length ? (
            pagePlayers.map((p, i) => {
              const action = coachAction(p.ateSessionMode);
              const reasons = p.why.length ? p.why : ["No specific reasons available."];
              const injRecs = p.injuryRecommendation.length ? p.injuryRecommendation : ["Continue with planned load and routine monitoring."];
              return (
                <View key={`${p.name}-${pageIdx}-${i}`} style={reportStyles.playerCard}>
                  {/* Player name + status */}
                  <View style={reportStyles.playerHeader}>
                    <Text style={reportStyles.playerName}>{p.name}</Text>
                    <Text style={p.readinessStatus === "RED" ? reportStyles.badgeRed : reportStyles.badgeYellow}>
                      {p.readinessStatus === "RED" ? "🔴 RED" : "🟡 YELLOW"}
                    </Text>
                  </View>

                  {/* Coach action — prominent */}
                  <View style={action.boxStyle}>
                    <Text style={reportStyles.actionLabel}>Today&apos;s recommendation</Text>
                    <Text style={action.textStyle}>{action.title}</Text>
                    <Text style={reportStyles.actionNote}>{action.note}</Text>
                  </View>

                  {/* Reasons */}
                  <View style={reportStyles.cardBody}>
                    <Text style={reportStyles.sectionLabel}>Why this player is flagged</Text>
                    {reasons.map((r, idx) => (
                      <Text key={`${p.name}-reason-${idx}`} style={reportStyles.reasonItem}>• {r}</Text>
                    ))}

                    {/* Injury risk */}
                    <Text style={reportStyles.sectionLabel}>Injury risk</Text>
                    <View style={reportStyles.injuryRow}>
                      <Text style={injuryBadgeStyle(p.injuryRiskLevel)}>{p.injuryRiskLevel}</Text>
                    </View>
                    {injRecs.map((r, idx) => (
                      <Text key={`${p.name}-injrec-${idx}`} style={reportStyles.injuryRec}>• {r}</Text>
                    ))}

                    {/* Reference numbers — compact, for staff use */}
                    <View style={reportStyles.refTableWrap}>
                      <Text style={reportStyles.refTableLabel}>Reference data</Text>
                      <View style={reportStyles.table}>
                        <View style={reportStyles.tHead}>
                          <Text style={reportStyles.cellH}>Wellness score</Text>
                          <Text style={reportStyles.cellH}>Sleep (1–5)</Text>
                          <Text style={reportStyles.cellH}>Load ratio</Text>
                          <Text style={reportStyles.cellH}>HRV</Text>
                          <Text style={reportStyles.cellH}>Load index</Text>
                          <Text style={reportStyles.cellH}>vs. baseline</Text>
                        </View>
                        <View style={reportStyles.tRow}>
                          <Text style={reportStyles.cell}>{scoreFmt(p.checkInScore)}</Text>
                          <Text style={reportStyles.cell}>{p.sleepScore != null ? `${p.sleepScore}/5` : "—"}</Text>
                          <Text style={reportStyles.cell}>{p.acwr != null ? numFmt(p.acwr) : "—"}</Text>
                          <Text style={reportStyles.cell}>{p.hrv != null ? numFmt(p.hrv) : "—"}</Text>
                          <Text style={reportStyles.cell}>{p.zScore != null ? numFmt(p.zScore) : "—"}</Text>
                          <Text style={reportStyles.cell}>{p.deltaZ != null ? numFmt(p.deltaZ) : "—"}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={reportStyles.muted}>No players requiring attention today.</Text>
          )}

          {/* Footer summary — last page only */}
          {pageIdx === flaggedPages.length - 1 && (
            <View style={reportStyles.footerBar}>
              <Text style={reportStyles.footerCount}>
                Team status:{"  "}
                <Text style={reportStyles.footerGreen}>● {data.summary.green} ready</Text>
                {"   "}
                <Text style={reportStyles.footerYellow}>● {data.summary.yellow} monitor</Text>
                {"   "}
                <Text style={reportStyles.footerRed}>● {data.summary.red} at risk</Text>
              </Text>
              <Text style={reportStyles.muted}>Page {pageIdx + 1} / {flaggedPages.length}</Text>
            </View>
          )}
        </Page>
      ))}
    </Document>
  );
}

// ── Post-Training GPS Report PDF ──────────────────────────────
const postStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#111827", fontFamily: "Helvetica" },
  h1: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#6B7280", marginBottom: 14 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, paddingBottom: 3, borderBottom: "1 solid #E5E7EB" },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  summaryBox: { flex: 1, border: "1 solid #E5E7EB", borderRadius: 4, padding: 6, alignItems: "center" },
  summaryVal: { fontSize: 13, fontWeight: 700 },
  summaryLabel: { fontSize: 8, color: "#6B7280", marginTop: 2 },
  table: { border: "1 solid #D1D5DB", borderRadius: 4, overflow: "hidden" },
  tHead: { flexDirection: "row", backgroundColor: "#F3F4F6" },
  tRow: { flexDirection: "row", borderTop: "1 solid #E5E7EB" },
  tRowAlt: { flexDirection: "row", borderTop: "1 solid #E5E7EB", backgroundColor: "#F9FAFB" },
  colName: { width: "18%", padding: 4, fontSize: 9 },
  colPos: { width: "8%", padding: 4, fontSize: 9, color: "#6B7280" },
  colFlag: { width: "8%", padding: 4, fontSize: 9, textAlign: "center" },
  colMetric: { width: "9%", padding: 4, fontSize: 9, textAlign: "right" },
  colPct: { width: "7%", padding: 4, fontSize: 9, textAlign: "right" },
  colAttn: { width: "9%", padding: 4, fontSize: 9, textAlign: "center" },
  // RPE-specific table columns
  colRpeName: { width: "19%", padding: 4, fontSize: 9 },
  colRpePos: { width: "7%", padding: 4, fontSize: 9, color: "#6B7280" },
  colRpeScore: { width: "9%", padding: 4, fontSize: 9, textAlign: "center" },
  colRpeDesc: { width: "12%", padding: 4, fontSize: 9 },
  colRpeDur: { width: "11%", padding: 4, fontSize: 9, textAlign: "right" },
  colRpeLoad: { width: "12%", padding: 4, fontSize: 9, textAlign: "right" },
  colRpeBand: { width: "18%", padding: 4, fontSize: 9 },
  hdr: { fontWeight: 700 },
  attnAlert: { color: "#DC2626", fontWeight: 700 },
  attnMonitor: { color: "#D97706", fontWeight: 700 },
  attnOk: { color: "#16A34A" },
  flagRed: { color: "#DC2626", fontWeight: 700 },
  flagYellow: { color: "#D97706", fontWeight: 700 },
  flagGreen: { color: "#16A34A" },
  alertBox: { marginBottom: 6, padding: 6, border: "1 solid #FCA5A5", borderRadius: 4, backgroundColor: "#FEF2F2" },
  alertName: { fontWeight: 700, marginBottom: 2 },
  alertLine: { color: "#7F1D1D", fontSize: 9 },
  monitorBox: { marginBottom: 6, padding: 6, border: "1 solid #FDE68A", borderRadius: 4, backgroundColor: "#FFFBEB" },
  monitorName: { fontWeight: 700, marginBottom: 2 },
  monitorLine: { color: "#78350F", fontSize: 9 },
});

function numFmt2(v: number | null, digits = 0): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

function pctFmt(v: number | null): string {
  if (v == null) return "—";
  const s = Math.round(v);
  return (s >= 0 ? "+" : "") + s + "%";
}

function rpeInterpretation(avgRpe: number | null, submittedCount: number, totalPlayers: number): string {
  if (avgRpe == null || submittedCount === 0) {
    return `Engir leikmenn hafa skilað inn RPE fyrir þessa æfingu (${submittedCount}/${totalPlayers}). Ekki er hægt að meta innri álag liðsins.`;
  }
  const score = avgRpe.toFixed(1);
  const sub = `${submittedCount}/${totalPlayers} leikmenn skildu inn`;
  if (avgRpe <= 2) {
    return `Upplifun liðsins á æfingunni var mjög létt (meðal RPE ${score}). Æfingin lítur út sem hlýjunar- eða endurhæfingarþáttur með lítið sem ekkert líkamlegt álag. (${sub})`;
  }
  if (avgRpe <= 4) {
    return `Upplifun liðsins á æfingunni var létt (meðal RPE ${score}). Liðið var vel á sig komið og þoldi æfinguna vel án mikillar fyrirhafnar. (${sub})`;
  }
  if (avgRpe <= 6) {
    return `Upplifun liðsins á æfingunni var í meðallagi (meðal RPE ${score}). Líkamlegt álag var hóflegt — góð jafnvægisæfing milli álags og hvíldar. (${sub})`;
  }
  if (avgRpe <= 7.9) {
    return `Upplifun liðsins á æfingunni var erfið (meðal RPE ${score}). Líkamlegt álag var hátt. Mikilvægt er að tryggja góða hvíld og næringaruppbót fyrir næstu æfingu. (${sub})`;
  }
  if (avgRpe <= 8.9) {
    return `Upplifun liðsins á æfingunni var mjög erfið (meðal RPE ${score}). Álagið var mjög hátt. Nauðsynlegt er að gefa liðinu tíma til að jafna sig og fylgjast vel með ástandi leikmanna næstu daga. (${sub})`;
  }
  return `Upplifun liðsins á æfingunni var á hámarki (meðal RPE ${score}). Þetta er mesta mögulega álag sem leikmenn upplifðu. Hvíld og endurhæfing eru sérstaklega mikilvægar næstu 48 klst. (${sub})`;
}

function rpeScoreLabel(rpe: number | null): string {
  if (rpe == null) return "—";
  if (rpe <= 2) return "Very easy";
  if (rpe <= 4) return "Easy";
  if (rpe <= 6) return "Moderate";
  if (rpe <= 8) return "Hard";
  if (rpe <= 9) return "Very hard";
  return "Maximal";
}

function rpeLoadBand(sessionLoad: number | null): string {
  if (sessionLoad == null) return "—";
  if (sessionLoad < 200) return "Very light  (<200)";
  if (sessionLoad < 400) return "Light  (200–399)";
  if (sessionLoad < 600) return "Moderate  (400–599)";
  if (sessionLoad < 800) return "Hard  (600–799)";
  return "Very hard  (≥800)";
}

function PostTrainingReportDocument({ data }: { data: PostTrainingReportData }) {
  const PLAYERS_PER_PAGE = 30;

  // GPS page only shows players who actually have GPS data
  const gpsPlayers = data.players.filter((p) => p.totalDistance != null);
  const pages: PostTrainingReportPlayer[][] = [];
  for (let i = 0; i < gpsPlayers.length; i += PLAYERS_PER_PAGE) {
    pages.push(gpsPlayers.slice(i, i + PLAYERS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const alerts = data.players.filter((p) => p.attentionFlag === "ALERT");
  const monitors = data.players.filter((p) => p.attentionFlag === "MONITOR");

  // RPE table: all players who submitted RPE, sorted highest first
  const rpeTablePlayers = data.players.filter((p) => p.rpeSubmitted).sort((a, b) => (b.rpe ?? -1) - (a.rpe ?? -1));
  const interpretText = rpeInterpretation(data.rpeTeamAvg, data.rpeSubmissionCount, data.players.length);

  // IMA / stride page — sorted by sprint-strides desc, paginated like GPS
  const ima = data.ima;
  const imaPlayers: ImaPlayerDay[] = ima
    ? [...ima.per_player].filter((p) => p.total_strides > 0).sort((a, b) => b.sprint_strides - a.sprint_strides)
    : [];
  const imaPages: ImaPlayerDay[][] = [];
  for (let i = 0; i < imaPlayers.length; i += PLAYERS_PER_PAGE) {
    imaPages.push(imaPlayers.slice(i, i + PLAYERS_PER_PAGE));
  }

  // Load explainability — verdict, colour and an interpretation paragraph.
  const ls = data.loadSummary;
  const plPct = ls.pl.pctAvg;
  const recentColor =
    plPct == null ? "#6B7280"
      : plPct <= 110 ? "#059669"
      : plPct <= 140 ? "#D97706"
      : "#DC2626";
  const recentBand =
    plPct == null ? null
      : plPct <= 90 ? "below the recent norm"
      : plPct <= 110 ? "in line with the recent norm"
      : plPct <= 140 ? "moderately above the recent norm"
      : "well above the recent norm";
  const loadVerdict =
    plPct == null
      ? "No GPS baseline available to compare today's load."
      : `Team Player Load today was ${plPct}% of the 4-week average (${recentBand})`
        + (ls.pl.pctMatch != null ? ` and ${ls.pl.pctMatch}% of a typical match` : "")
        + ". "
        + (ls.spikePlayers.length === 0
          ? "No player exceeded their usual load."
          : `${ls.spikePlayers.length} player${ls.spikePlayers.length === 1 ? "" : "s"} ran above their usual.`);
  // Detailed interpretation that walks through every number on the card.
  const fmtInt = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
  const loadInterpretation = (() => {
    if (plPct == null) return "";
    const parts: string[] = [];
    parts.push(
      `Player Load is the total accelerometer-derived mechanical work the squad absorbed today — the sum of every player's load. Today's team total of ${fmtInt(ls.pl.today)} is ${plPct}% of the ${fmtInt(ls.pl.avg)} the squad averages on a training day across the last 4 weeks, i.e. ${recentBand}.`,
    );
    if (ls.pl.pctMatch != null) {
      parts.push(
        `Measured against a typical match — the squad's single highest-load day in that window (≈ ${fmtInt(ls.pl.peak)}) — today reached ${ls.pl.pctMatch}% of match demand, so the session was ${ls.pl.pctMatch >= 90 ? "essentially match-level" : ls.pl.pctMatch >= 60 ? "a substantial fraction of a game" : "well below match intensity"}.`,
      );
    }
    const dParts: string[] = [];
    if (ls.dist.pctAvg != null) dParts.push(`total distance ${fmtInt(ls.dist.today)} m (${ls.dist.pctAvg}% of the 4-week average)`);
    if (ls.hsd.pctAvg != null) dParts.push(`high-speed distance ${fmtInt(ls.hsd.today)} m (${ls.hsd.pctAvg}% of average)`);
    if (dParts.length) {
      parts.push(
        `Breaking that down, the squad covered ${dParts.join(" and ")} — total distance reflects running volume while high-speed distance (the top sprint bands) reflects intensity, so you can see whether today's load came from doing more or from running faster.`,
      );
    }
    if (ls.distribution.total > 0) {
      parts.push(
        `Player-by-player against each athlete's own 4-week norm: ${ls.distribution.above} ran ≥30% above their usual, ${ls.distribution.elevated} were mildly elevated, ${ls.distribution.inLine} were in line and ${ls.distribution.below} below — so the team number ${ls.distribution.above > 0 ? "is not uniform; the spikes below are the ones carrying it" : "reflects a broadly even session"}.`,
      );
    }
    parts.push(
      plPct <= 110
        ? "Overall this was a routine day — standard recovery applies, and only the individuals flagged below need watching."
        : plPct <= 140
        ? "This is a manageable mid-week stimulus, but stack it carefully: avoid a second high day back-to-back and keep an eye on the flagged players."
        : "This is a clear team-level spike — prioritise recovery (sleep, nutrition, a lighter next session) and review the flagged players before the next hard day to avoid an acute:chronic overshoot.",
    );
    return parts.join(" ");
  })();

  return (
    <Document>
      {/* ══ Page 1: Internal Load — RPE ══ */}
      <Page size="A4" orientation="landscape" style={postStyles.page}>
        {/* Header */}
        <View style={postStyles.section}>
          <Text style={postStyles.h1}>Post-Training Report</Text>
          <Text style={postStyles.subtitle}>
            {data.teamName} · {data.sessionDate} · {data.mdDay} · {data.players.length} players
          </Text>
        </View>

        {/* ── Explainability — session load overview (top of report) ── */}
        <View style={[postStyles.section, { backgroundColor: "#F8FAFC", border: "1 solid #E2E8F0", borderRadius: 4, padding: 10 }]}>
          <Text style={postStyles.sectionTitle}>Session Load — Explainability</Text>
          <Text style={{ fontSize: 11, fontWeight: 700, color: recentColor, lineHeight: 1.4, marginBottom: 4 }}>
            {loadVerdict}
          </Text>
          {loadInterpretation ? (
            <Text style={{ fontSize: 9.5, color: "#334155", lineHeight: 1.5, marginBottom: 8 }}>{loadInterpretation}</Text>
          ) : null}

          {/* Metric breakdown — today vs 4-week average vs typical match */}
          <View style={postStyles.table}>
            <View style={postStyles.tHead}>
              <Text style={[{ width: "34%", padding: 4, fontSize: 9 }, postStyles.hdr]}>Metric</Text>
              <Text style={[{ width: "18%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Today</Text>
              <Text style={[{ width: "18%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>4-wk avg</Text>
              <Text style={[{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>% of avg</Text>
              <Text style={[{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>% of match</Text>
            </View>
            {([
              ["Team Player Load", ls.pl, 0],
              ["Total Distance (m)", ls.dist, 0],
              ["High-Speed Distance (m)", ls.hsd, 0],
            ] as Array<[string, typeof ls.pl, number]>).map(([label, m], i) => {
              const c = m.pctAvg == null ? "#111827" : m.pctAvg <= 110 ? "#059669" : m.pctAvg <= 140 ? "#D97706" : "#DC2626";
              return (
                <View key={label} style={i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt}>
                  <Text style={{ width: "34%", padding: 4, fontSize: 9, fontWeight: 700 }}>{label}</Text>
                  <Text style={{ width: "18%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(m.today, 0)}</Text>
                  <Text style={{ width: "18%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(m.avg, 0)}</Text>
                  <Text style={[{ width: "15%", padding: 4, fontSize: 9, textAlign: "right", fontWeight: 700 }, { color: c }]}>{m.pctAvg != null ? `${m.pctAvg}%` : "—"}</Text>
                  <Text style={{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }}>{m.pctMatch != null ? `${m.pctMatch}%` : "—"}</Text>
                </View>
              );
            })}
          </View>

          {/* Player distribution vs each player's own 4-week norm */}
          {ls.distribution.total > 0 && (
            <Text style={{ fontSize: 9, color: "#334155", marginTop: 6 }}>
              Players vs their own 4-week norm ({ls.distribution.total} with GPS):{" "}
              <Text style={{ color: "#DC2626", fontWeight: 700 }}>{ls.distribution.above} above (≥130%)</Text> ·{" "}
              <Text style={{ color: "#D97706" }}>{ls.distribution.elevated} elevated</Text> ·{" "}
              <Text style={{ color: "#059669" }}>{ls.distribution.inLine} in line</Text> ·{" "}
              {ls.distribution.below} below
            </Text>
          )}

          {/* Spiking players (named) */}
          {ls.spikePlayers.length > 0 && (
            <Text style={{ fontSize: 9, color: "#B91C1C", marginTop: 6, lineHeight: 1.4 }}>
              Spikes (above their usual): {ls.spikePlayers.slice(0, 10).map((p) => {
                const parts: string[] = [];
                if (p.plPct != null) parts.push(`+${Math.round(p.plPct)}% PL`);
                if (p.distPct != null && p.distPct >= 30) parts.push(`+${Math.round(p.distPct)}% dist`);
                if (p.acwr != null && p.acwr >= 1.5) parts.push(`ACWR ${p.acwr.toFixed(2)}`);
                return `${p.name}${parts.length ? ` (${parts.join(", ")})` : ""}`;
              }).join(" · ")}{ls.spikePlayers.length > 10 ? ` +${ls.spikePlayers.length - 10} more` : ""}
            </Text>
          )}

          <Text style={{ fontSize: 8, color: "#94A3B8", marginTop: 6, lineHeight: 1.4 }}>
            Baselines use the team total for each metric over the prior 4 weeks (catapult/manual GPS). &quot;4-wk avg&quot; = mean of prior session days; &quot;match&quot; = the highest team-load day in the window (matches are a team&apos;s peak-load days). A player spike = Player Load ≥30% above their own 4-week average, or ACWR ≥ 1.5 (Gabbett 2016 acute:chronic ceiling).
          </Text>
        </View>

        {/* ── Planned vs Actual — did the session hit the recommendation? ── */}
        {data.plannedVsActual && data.plannedVsActual.hasPlan && (() => {
          const pva = data.plannedVsActual;
          const pvaColor = (st: PvaStatus) =>
            st === "on" ? "#059669" : st === "over" || st === "under" ? "#D97706" : st === "well_over" || st === "well_under" ? "#DC2626" : "#94A3B8";
          return (
            <View style={[postStyles.section, { backgroundColor: "#F5F3FF", border: "1 solid #DDD6FE", borderRadius: 4, padding: 10 }]} wrap={false}>
              <Text style={postStyles.sectionTitle}>Planned vs Actual — did we hit the recommendation?</Text>
              <Text style={{ fontSize: 9, color: "#4C1D95", marginBottom: 2 }}>
                Plan: {pva.mode === "microcycle" && pva.mdLabel ? `${pva.mdLabel} · ${pva.loadType} · ${pva.matchPct}% of match` : "recent-load baseline (mixed)"}
                {pva.readinessAdjustPct !== 0 ? ` · readiness-adjusted ${pva.readinessAdjustPct}%` : ""}
              </Text>
              <Text style={{ fontSize: 9.5, color: "#334155", lineHeight: 1.5, marginBottom: 8 }}>{pva.summary}</Text>

              {/* Team-level: planned vs actual per KPI */}
              <View style={postStyles.table}>
                <View style={postStyles.tHead}>
                  <Text style={[{ width: "40%", padding: 4, fontSize: 9 }, postStyles.hdr]}>Metric (per player)</Text>
                  <Text style={[{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Planned</Text>
                  <Text style={[{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Actual</Text>
                  <Text style={[{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>% of plan</Text>
                </View>
                {pva.team.map((t, i) => (
                  <View key={t.kpi} style={i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt}>
                    <Text style={{ width: "40%", padding: 4, fontSize: 9, fontWeight: 700 }}>{PVA_LABEL[t.kpi]}</Text>
                    <Text style={{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(t.planned, 0)}</Text>
                    <Text style={{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(t.actual, 0)}</Text>
                    <Text style={[{ width: "20%", padding: 4, fontSize: 9, textAlign: "right", fontWeight: 700 }, { color: pvaColor(t.status) }]}>{t.pctOfPlan != null ? `${t.pctOfPlan}%` : "—"}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 8, color: "#94A3B8", marginTop: 5, lineHeight: 1.4 }}>
                Planned = the pre-session recommendation for this date (per player), readiness-adjusted. On plan = 85–115% (green); 116–140% or 60–84% = elevated/reduced (amber); &gt;140% or &lt;60% = well off plan (red).
              </Text>
            </View>
          );
        })()}

        {/* Per-player: planned vs actual adherence */}
        {data.plannedVsActual && data.plannedVsActual.hasPlan && data.plannedVsActual.players.length > 0 && (() => {
          const pva = data.plannedVsActual;
          const pvaColor = (st: PvaStatus) =>
            st === "on" ? "#059669" : st === "over" || st === "under" ? "#D97706" : st === "well_over" || st === "well_under" ? "#DC2626" : "#94A3B8";
          const pctCell = (kpi: typeof PVA_KPIS[number], pp: typeof pva.players[number]) => {
            const c = pp.byKpi[kpi];
            return <Text style={[{ width: "13%", padding: 3, fontSize: 8, textAlign: "right", fontWeight: 700 }, { color: pvaColor(c.status) }]}>{c.pctOfPlan != null ? `${c.pctOfPlan}%` : "—"}</Text>;
          };
          return (
            <View style={postStyles.section}>
              <Text style={postStyles.sectionTitle}>Planned vs Actual — per player (% of plan)</Text>
              <View style={postStyles.table}>
                <View style={postStyles.tHead}>
                  <Text style={[{ width: "22%", padding: 3, fontSize: 8 }, postStyles.hdr]}>Player</Text>
                  <Text style={[{ width: "13%", padding: 3, fontSize: 8, textAlign: "right" }, postStyles.hdr]}>P.Load</Text>
                  <Text style={[{ width: "13%", padding: 3, fontSize: 8, textAlign: "right" }, postStyles.hdr]}>Dist</Text>
                  <Text style={[{ width: "13%", padding: 3, fontSize: 8, textAlign: "right" }, postStyles.hdr]}>HSR</Text>
                  <Text style={[{ width: "13%", padding: 3, fontSize: 8, textAlign: "right" }, postStyles.hdr]}>Sprint</Text>
                  <Text style={[{ width: "13%", padding: 3, fontSize: 8, textAlign: "right" }, postStyles.hdr]}>Accel</Text>
                  <Text style={[{ width: "13%", padding: 3, fontSize: 8, textAlign: "right" }, postStyles.hdr]}>IMA</Text>
                </View>
                {pva.players.map((pp, i) => (
                  <View key={pp.player_id + i} style={i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt}>
                    <Text style={{ width: "22%", padding: 3, fontSize: 8, fontWeight: 700 }}>{pp.name}</Text>
                    {pctCell("playerLoad", pp)}
                    {pctCell("totalDistance", pp)}
                    {pctCell("hsr", pp)}
                    {pctCell("sprint", pp)}
                    {pctCell("accel", pp)}
                    {pctCell("ima", pp)}
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 8, color: "#94A3B8", marginTop: 5, lineHeight: 1.4 }}>
                Each cell = the player&apos;s actual for that metric as a % of their own readiness-adjusted target. Green 85–115% (on plan), amber 60–84% / 116–140%, red &lt;60% / &gt;140%. A dash means no target or no capture for that metric.
              </Text>
            </View>
          );
        })()}

        {/* RPE summary boxes */}
        <View style={postStyles.section}>
          <Text style={postStyles.sectionTitle}>Innri álag — Session RPE</Text>
          <View style={postStyles.summaryRow}>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{data.rpeTeamAvg != null ? numFmt2(data.rpeTeamAvg, 1) : "—"}</Text>
              <Text style={postStyles.summaryLabel}>Meðal RPE liðsins</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{data.rpeTotalLoad != null ? numFmt2(data.rpeTotalLoad, 0) : "—"}</Text>
              <Text style={postStyles.summaryLabel}>Heildar session load</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{data.rpeSubmissionCount} / {data.players.length}</Text>
              <Text style={postStyles.summaryLabel}>Leikmenn skildu inn</Text>
            </View>
          </View>
        </View>

        {/* Interpretation text */}
        <View style={[postStyles.section, { backgroundColor: "#F9FAFB", border: "1 solid #E5E7EB", borderRadius: 4, padding: 10 }]}>
          <Text style={{ fontSize: 10, color: "#111827", lineHeight: 1.5 }}>{interpretText}</Text>
          <Text style={{ fontSize: 8, color: "#9CA3AF", marginTop: 6 }}>
            Session Load = RPE x Mínútur (AU). Flokkur: &lt;200 Very light · 200-399 Light · 400-599 Moderate · 600-799 Hard · &gt;=800 Very hard
          </Text>
        </View>

        {/* Per-player RPE table (sorted by RPE desc) */}
        <View style={postStyles.section}>
          <Text style={postStyles.sectionTitle}>RPE eftir leikmann (raðað eftir RPE, hæst fyrst)</Text>
          <View style={postStyles.table}>
            <View style={postStyles.tHead}>
              <Text style={[postStyles.colRpeName, postStyles.hdr]}>Leikmaður</Text>
              <Text style={[postStyles.colRpePos, postStyles.hdr]}>Staða</Text>
              <Text style={[postStyles.colRpeScore, postStyles.hdr]}>RPE</Text>
              <Text style={[postStyles.colRpeDesc, postStyles.hdr]}>Lýsing</Text>
              <Text style={[postStyles.colRpeDur, postStyles.hdr]}>Tímalengd (mín)</Text>
              <Text style={[postStyles.colRpeLoad, postStyles.hdr]}>Session Load</Text>
              <Text style={[postStyles.colRpeBand, postStyles.hdr]}>Session Load flokkur</Text>
            </View>
            {rpeTablePlayers.map((p, i) => {
              const rowStyle = i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt;
              const rpeNumStyle = p.rpe != null && p.rpe >= 9 ? postStyles.attnAlert : p.rpe != null && p.rpe >= 7 ? postStyles.attnMonitor : postStyles.attnOk;
              return (
                <View key={p.name + "-rpe"} style={rowStyle}>
                  <Text style={postStyles.colRpeName}>{p.name}</Text>
                  <Text style={postStyles.colRpePos}>{p.position}</Text>
                  <Text style={[postStyles.colRpeScore, rpeNumStyle]}>{p.rpeSubmitted ? numFmt2(p.rpe, 1) : "—"}</Text>
                  <Text style={[postStyles.colRpeDesc, rpeNumStyle]}>{p.rpeSubmitted ? rpeScoreLabel(p.rpe) : "—"}</Text>
                  <Text style={postStyles.colRpeDur}>{p.rpeSubmitted ? numFmt2(p.durationMinutes, 0) : "—"}</Text>
                  <Text style={postStyles.colRpeLoad}>{p.rpeSubmitted ? numFmt2(p.sessionLoad, 0) : "—"}</Text>
                  <Text style={postStyles.colRpeBand}>{p.rpeSubmitted ? rpeLoadBand(p.sessionLoad) : "Ekki skilað"}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </Page>

      {/* ══ Page 2: External Load — GPS ══ */}
      <Page size="A4" orientation="landscape" style={postStyles.page}>
        <View style={postStyles.section}>
          <Text style={postStyles.h1}>Post-Training Report — GPS (Catapult)</Text>
          <Text style={postStyles.subtitle}>
            {data.teamName} · {data.sessionDate} · {data.mdDay} · {gpsPlayers.length} players with GPS data
          </Text>
        </View>

        {/* GPS team averages */}
        <View style={postStyles.section}>
          <Text style={postStyles.sectionTitle}>Ytra álag — liðsmeðaltal</Text>
          <View style={postStyles.summaryRow}>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.totalDistance, 0)}</Text>
              <Text style={postStyles.summaryLabel}>Total Dist (m)</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.hsd, 0)}</Text>
              <Text style={postStyles.summaryLabel}>HSD (m)</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.playerLoad, 1)}</Text>
              <Text style={postStyles.summaryLabel}>Player Load</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.accelB23, 0)}</Text>
              <Text style={postStyles.summaryLabel}>Accel B2-3</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.decelB23, 0)}</Text>
              <Text style={postStyles.summaryLabel}>Decel B2-3</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.maxVelocity, 1)}</Text>
              <Text style={postStyles.summaryLabel}>Max Vel (m/s)</Text>
            </View>
          </View>
        </View>

        {/* Attention flags */}
        {(alerts.length > 0 || monitors.length > 0) && (
          <View style={postStyles.section}>
            <Text style={postStyles.sectionTitle}>
              Attention — {alerts.length} ALERT · {monitors.length} MONITOR
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                {alerts.map((p) => (
                  <View key={p.name + "-alert"} style={postStyles.alertBox}>
                    <Text style={postStyles.alertName}>! {p.name} ({p.position})</Text>
                    {p.attentionReason.map((line, i) => (
                      <Text key={i} style={postStyles.alertLine}>· {line}</Text>
                    ))}
                  </View>
                ))}
              </View>
              <View style={{ flex: 1 }}>
                {monitors.map((p) => (
                  <View key={p.name + "-monitor"} style={postStyles.monitorBox}>
                    <Text style={postStyles.monitorName}>~ {p.name} ({p.position})</Text>
                    {p.attentionReason.map((line, i) => (
                      <Text key={i} style={postStyles.monitorLine}>· {line}</Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Player GPS table — first GPS page */}
        <View style={postStyles.section}>
          <Text style={postStyles.sectionTitle}>GPS gögn eftir leikmann (raðað eftir heildar vegalengd)</Text>
          <View style={postStyles.table}>
            <View style={postStyles.tHead}>
              <Text style={[postStyles.colName, postStyles.hdr]}>Leikmaður</Text>
              <Text style={[postStyles.colPos, postStyles.hdr]}>Staða</Text>
              <Text style={[postStyles.colFlag, postStyles.hdr]}>Pre</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>Dist</Text>
              <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>HSD</Text>
              <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>PL</Text>
              <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>PL/min</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>Ac B2-3</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>De B2-3</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>Vmax</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>ACWR</Text>
              <Text style={[postStyles.colAttn, postStyles.hdr]}>Signal</Text>
            </View>
            {(pages[0] ?? []).map((p, i) => {
              const rowStyle = i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt;
              const flagStyle = p.readinessFlag === "RED" ? postStyles.flagRed : p.readinessFlag === "YELLOW" ? postStyles.flagYellow : postStyles.flagGreen;
              const attnStyle = p.attentionFlag === "ALERT" ? postStyles.attnAlert : p.attentionFlag === "MONITOR" ? postStyles.attnMonitor : postStyles.attnOk;
              return (
                <View key={p.name} style={rowStyle}>
                  <Text style={postStyles.colName}>{p.name}</Text>
                  <Text style={postStyles.colPos}>{p.position}</Text>
                  <Text style={[postStyles.colFlag, flagStyle]}>{p.readinessFlag}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.totalDistance, 0)}</Text>
                  <Text style={postStyles.colPct}>{pctFmt(p.totalDistancePct)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.hsd, 0)}</Text>
                  <Text style={postStyles.colPct}>{pctFmt(p.hsdPct)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.playerLoad, 1)}</Text>
                  <Text style={postStyles.colPct}>{pctFmt(p.playerLoadPct)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.playerLoadPerMin, 2)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.accelB23, 0)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.decelB23, 0)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.maxVelocity, 1)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.acwr, 2)}</Text>
                  <Text style={[postStyles.colAttn, attnStyle]}>{p.attentionFlag}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </Page>

      {/* ── GPS overflow pages if many players ── */}
      {pages.slice(1).map((pagePlayers, pgIdx) => (
        <Page key={"pt-page-" + (pgIdx + 3)} size="A4" orientation="landscape" style={postStyles.page}>
          <Text style={postStyles.h1}>Post-Training Report — GPS (cont.) · {data.sessionDate}</Text>
          <View style={[postStyles.section, { marginTop: 8 }]}>
            <View style={postStyles.table}>
              <View style={postStyles.tHead}>
                <Text style={[postStyles.colName, postStyles.hdr]}>Leikmaður</Text>
                <Text style={[postStyles.colPos, postStyles.hdr]}>Staða</Text>
                <Text style={[postStyles.colFlag, postStyles.hdr]}>Pre</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>Dist</Text>
                <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>HSD</Text>
                <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>PL</Text>
                <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>PL/min</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>Ac B2-3</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>De B2-3</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>Vmax</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>ACWR</Text>
                <Text style={[postStyles.colAttn, postStyles.hdr]}>Signal</Text>
              </View>
              {pagePlayers.map((p, i) => {
                const rowStyle = i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt;
                const flagStyle = p.readinessFlag === "RED" ? postStyles.flagRed : p.readinessFlag === "YELLOW" ? postStyles.flagYellow : postStyles.flagGreen;
                const attnStyle = p.attentionFlag === "ALERT" ? postStyles.attnAlert : p.attentionFlag === "MONITOR" ? postStyles.attnMonitor : postStyles.attnOk;
                return (
                  <View key={p.name} style={rowStyle}>
                    <Text style={postStyles.colName}>{p.name}</Text>
                    <Text style={postStyles.colPos}>{p.position}</Text>
                    <Text style={[postStyles.colFlag, flagStyle]}>{p.readinessFlag}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.totalDistance, 0)}</Text>
                    <Text style={postStyles.colPct}>{pctFmt(p.totalDistancePct)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.hsd, 0)}</Text>
                    <Text style={postStyles.colPct}>{pctFmt(p.hsdPct)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.playerLoad, 1)}</Text>
                    <Text style={postStyles.colPct}>{pctFmt(p.playerLoadPct)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.playerLoadPerMin, 2)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.accelB23, 0)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.decelB23, 0)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.maxVelocity, 1)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.acwr, 2)}</Text>
                    <Text style={[postStyles.colAttn, attnStyle]}>{p.attentionFlag}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </Page>
      ))}

      {/* ══ Page: Biomechanical Load — IMA / Stride ══ */}
      {ima && imaPages.length > 0 && imaPages.map((pagePlayers, pgIdx) => (
        <Page key={"pt-ima-" + pgIdx} size="A4" orientation="landscape" style={postStyles.page}>
          <View style={postStyles.section}>
            <Text style={postStyles.h1}>
              Post-Training Report — IMA (Stride){pgIdx > 0 ? " (frh.)" : ""}
            </Text>
            <Text style={postStyles.subtitle}>
              {data.teamName} · {data.sessionDate} · {data.mdDay} · {ima.player_count} players captured · {ima.session_headline}
            </Text>
          </View>

          {/* Team summary boxes — only on the first IMA page */}
          {pgIdx === 0 && (
            <>
              <View style={postStyles.section}>
                <Text style={postStyles.sectionTitle}>Lífaflfræðilegt álag — liðsyfirlit</Text>
                <View style={postStyles.summaryRow}>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{numFmt2(ima.team_total_strides, 0)}</Text>
                    <Text style={postStyles.summaryLabel}>Total strides</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{numFmt2(ima.team_sprint_strides, 0)} ({Math.round(ima.pct_sprint)}%)</Text>
                    <Text style={postStyles.summaryLabel}>Sprint-strides (b5-8)</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>
                      {ima.team_cod_high_left} L / {ima.team_cod_high_right} R{ima.team_cod_asymmetry_pct != null ? ` · ${Math.round(ima.team_cod_asymmetry_pct)}%` : ""}
                    </Text>
                    <Text style={postStyles.summaryLabel}>L/R CoD balance (high)</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{ima.players_high_cod_flagged} / {ima.player_count}</Text>
                    <Text style={postStyles.summaryLabel}>High-CoD asym. flagged</Text>
                  </View>
                </View>
              </View>

              <View style={postStyles.section}>
                <Text style={postStyles.sectionTitle}>Band dreifing (lið)</Text>
                <View style={postStyles.summaryRow}>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{Math.round(ima.pct_low)}%</Text>
                    <Text style={postStyles.summaryLabel}>Low (b1-3)</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{Math.round(ima.pct_mid)}%</Text>
                    <Text style={postStyles.summaryLabel}>Mid (b4-6)</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{Math.round(ima.pct_high)}%</Text>
                    <Text style={postStyles.summaryLabel}>High (b7-8)</Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* Per-player IMA table */}
          <View style={postStyles.section}>
            <Text style={postStyles.sectionTitle}>IMA eftir leikmann (raðað eftir sprint-strides b5-8)</Text>
            <View style={postStyles.table}>
              <View style={postStyles.tHead}>
                <Text style={[{ width: "20%", padding: 4, fontSize: 9 }, postStyles.hdr]}>Leikmaður</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Total</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>b1-3</Text>
                <Text style={[{ width: "9%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>b4-6</Text>
                <Text style={[{ width: "9%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>b7-8</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Sprint b5-8</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>vs grunnl.</Text>
                <Text style={[{ width: "12%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>CoD L/R (há)</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>CoD ósamh.</Text>
              </View>
              {pagePlayers.map((p, i) => {
                const rowStyle = i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt;
                const vs = p.sprint_vs_baseline_pct;
                const vsStyle = vs == null ? {} : vs > 150 ? { color: "#DC2626", fontWeight: 700 } : vs > 120 ? { color: "#D97706" } : {};
                const asym = p.cod_asymmetry_pct;
                const asymStyle = asym != null && asym > 15 ? { color: "#DC2626", fontWeight: 700 } : {};
                return (
                  <View key={p.player_id} style={rowStyle}>
                    <Text style={{ width: "20%", padding: 4, fontSize: 9 }}>{p.full_name}</Text>
                    <Text style={{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(p.total_strides, 0)}</Text>
                    <Text style={{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(p.low_strides, 0)}</Text>
                    <Text style={{ width: "9%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(p.mid_strides, 0)}</Text>
                    <Text style={{ width: "9%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(p.high_strides, 0)}</Text>
                    <Text style={{ width: "10%", padding: 4, fontSize: 9, textAlign: "right", fontWeight: 700 }}>{numFmt2(p.sprint_strides, 0)}</Text>
                    <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, vsStyle]}>{vs == null ? "—" : `${Math.round(vs)}%`}</Text>
                    <Text style={{ width: "12%", padding: 4, fontSize: 9, textAlign: "right" }}>{p.cod_left_high} / {p.cod_right_high}</Text>
                    <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, asymStyle]}>{asym == null ? "—" : `${Math.round(asym)}%`}</Text>
                  </View>
                );
              })}
            </View>
            {pgIdx === imaPages.length - 1 && (
              <Text style={{ fontSize: 8, color: "#9CA3AF", marginTop: 6 }}>
                IMA Free Running: 8-banda stride dreifing (Low b1-3 · Mid b4-6 · High b7-8). Sprint = bönd 5-8 vs persónuleg 14-daga grunnlína. CoD ósamhverfa &gt; 15% á háa intensity = aukin meiðslahætta (Bishop 2020).
              </Text>
            )}
          </View>
        </Page>
      ))}
    </Document>
  );
}

function dominantTeamAction(signal: TeamSignal | null): TrainingAction | "—" {
  if (!signal) return "—";
  const pairs: Array<[TrainingAction, number]> = [
    ["FULL", signal.n_full ?? 0],
    ["REDUCED", signal.n_reduced ?? 0],
    ["RECOVERY", signal.n_recovery ?? 0],
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  return pairs[0]?.[0] ?? "—";
}

function graphAthleteStateFromFlag(flag: FinalFlag | null | undefined): "GREEN" | "YELLOW" | "RED" | null {
  const f = String(flag ?? "").toUpperCase();
  if (f === "RED") return "RED";
  if (f === "YELLOW") return "YELLOW";
  if (f === "GREEN") return "GREEN";
  return null;
}

function graphMdContextFromToken(md: string | null | undefined): "MD5" | "MD4" | "MD3" | "MD2" | "MD1" | "MD_PLUS_1" | "OFF" | "UNKNOWN" | null {
  const raw = String(md ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "OFF" || raw === "REST") return "OFF";
  if (raw === "UNKNOWN") return "UNKNOWN";
  if (raw === "MD" || raw === "MD-1" || raw === "MD1") return "MD1";
  if (raw === "MD+1") return "MD_PLUS_1";
  if (raw === "MD-2" || raw === "MD2") return "MD2";
  if (raw === "MD-3" || raw === "MD3") return "MD3";
  if (raw === "MD-4" || raw === "MD4") return "MD4";
  if (raw === "MD-5" || raw === "MD5") return "MD5";
  return null;
}

function graphNeuralFatigueBandFromState(
  neuralState: string | null | undefined
): "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | null {
  const s = String(neuralState ?? "").toUpperCase();
  if (!s) return null;
  if (s === "CRITICAL") return "VERY_HIGH";
  if (s === "HIGH") return "HIGH";
  if (s === "RISING") return "MODERATE";
  if (s === "STABLE") return "LOW";
  return null;
}

function buildDecisionConfidence(params: {
  readinessScore: number | null;
  mdContext: string | null;
  neuralFatigueBand: string | null;
  yesterdayLoadBand: string | null;
  fallbackUsed: boolean;
}): DecisionConfidence {
  const inputs: Array<{ label: string; present: boolean }> = [
    { label: "Readiness score", present: typeof params.readinessScore === "number" && Number.isFinite(params.readinessScore) },
    {
      label: "MD context",
      present: !!params.mdContext && params.mdContext !== "UNKNOWN",
    },
    { label: "Neural fatigue band", present: !!params.neuralFatigueBand },
    { label: "Yesterday load band", present: !!params.yesterdayLoadBand },
  ];

  const inputsUsed = inputs.filter((x) => x.present).map((x) => x.label);
  const missingInputs = inputs.filter((x) => !x.present).map((x) => x.label);
  const usedCount = inputsUsed.length;
  const fallbackUsed = params.fallbackUsed;

  let level: DecisionConfidence["level"] = "MEDIUM";
  if (usedCount === inputs.length && !fallbackUsed) level = "HIGH";
  else if (usedCount <= 1 || (fallbackUsed && usedCount <= 2)) level = "LOW";

  return {
    level,
    inputsUsed,
    missingInputs,
    fallbackUsed,
  };
}

/** -----------------------------
 * Small UI components
 * ----------------------------- */
function CoachHubCards({ weeklyOutlook }: { weeklyOutlook?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
      <Link
        href="/coach/week-setup"
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <span>Week setup</span>
        {weeklyOutlook ? (
          <span className="ml-1 text-xs font-normal text-slate-400">{weeklyOutlook}</span>
        ) : null}
      </Link>

      <div className="h-4 w-px bg-slate-200" />

      <Link
        href="/coach/match-minutes"
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
      >
        Match minutes
      </Link>

      <div className="h-4 w-px bg-slate-200" />

      <Link
        href="/coach/messages"
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
      >
        Messages
      </Link>

      <div className="h-4 w-px bg-slate-200" />

      <Link
        href="/coach/display?refresh=15"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
      >
        TV view ↗
      </Link>
    </div>
  );
}

/** -----------------------------
 * Main page
 * ----------------------------- */
export default function CoachPage() {
  const router = useRouter();
  const [lang, setLang] = useLang();
  const ct = COACH_COPY[lang];

  const PAGE_SIZE = 100;

  // Plan-based access control
  const { isAtLeastPro, loading: planLoading } = usePlan();

  type CoachTab = "today" | "squad" | "load" | "gps" | "md" | "drills" | "volatility" | "vald" | "strength" | "trend" | "rtp";
  const VALID_TABS: ReadonlySet<CoachTab> = new Set([
    "today", "squad", "load", "gps", "md", "drills", "volatility", "vald", "strength", "trend", "rtp",
  ]);
  // Tab is URL-driven so the workspace tab bar (lifted to CoachShell or
  // accessed from Planning dropdown) can deep-link to a specific view.
  //
  // We use Next.js's useSearchParams() so the dashTab re-syncs on EVERY
  // URL change — including client-side Link navigations from the sidebar
  // (e.g. "VALD / CMJ" → /coach?tab=vald). The earlier popstate-only
  // listener missed those because client-side navigation inside the
  // App Router doesn't fire popstate. The dashboard page (/coach) is
  // declared `force-dynamic` so the Suspense requirement that
  // useSearchParams() normally imposes does not block prerender here.
  const searchParams = useSearchParams();
  const [dashTab, setDashTabState] = useState<CoachTab>("today");

  useEffect(() => {
    const t = searchParams?.get("tab") ?? null;
    if (t && VALID_TABS.has(t as CoachTab)) {
      setDashTabState(t as CoachTab);
    } else {
      setDashTabState("today");
    }
  }, [searchParams]);

  // setDashTab also pushes to URL so deep-links + back-button work.
  const setDashTab = React.useCallback((next: CoachTab) => {
    setDashTabState(next);
    const url = next === "today" ? "/coach" : `/coach?tab=${next}`;
    router.replace(url, { scroll: false });
  }, [router]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // PWA detection
  const [isPwa, setIsPwa] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () => setIsPwa(mq.matches || !!(navigator as any).standalone);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [filter, setFilter] = useState<Filter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [draftAction, setDraftAction] = useState<Record<string, TrainingAction>>({});
  const [draftMessage, setDraftMessage] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [chatOpenPlayerId, setChatOpenPlayerId] = useState<string | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [detailSectionOpenByPlayer, setDetailSectionOpenByPlayer] = useState<Record<string, Partial<Record<PlayerDetailSectionKey, boolean>>>>({});

  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [weekGrid, setWeekGrid] = useState<any[]>([]);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);

  const [coachName, setCoachName] = useState<string>("");
  const [coachDisplayName, setCoachDisplayName] = useState<string>("—");
  const [coachVerified, setCoachVerified] = useState(false);
  const initialLoadDone = useRef(false);
  const loadTodayRunning = useRef(false);
  const [coachRole, setCoachRole] = useState<string>("coach");
  const [coachTeamId, setCoachTeamId] = useState<string | null>(null);
  // Declared team break covering today (drives the "On break" command-center
  // state). Null = not on a break today.
  const [breakToday, setBreakToday] = useState<{ label: string | null; day: number; total: number } | null>(null);
  const [teamSport, setTeamSport] = useState<string | null>(null);
  const [teamType, setTeamType] = useState<string>("club_team");
  const [gpsProvider, setGpsProvider] = useState<"catapult" | "statsport" | "none">("catapult");
  // Catapult data tier — drives Lite-Mode top-tab gating (mirrors the
  // sidebar filter in CoachShell/CoachSidebar). 'lite' hides Quadrant /
  // Indoor Load / Decel Intel from the EXTERNAL_TABS row. Defaults to
  // 'lite' (conservative — show fewer tabs while detecting).
  const [catapultDataTier, setCatapultDataTier] = useState<"full" | "lite">("lite");
  // Manual override of the indoor-vs-outdoor verdict pipeline. 'auto' lets
  // the per-player heuristic decide; 'indoor' forces the FMP pipeline (höll
  // mode); 'outdoor' forces the GPS pipeline. See teams.training_mode_default
  // — coaches typically set this once per season.
  const [trainingMode, setTrainingMode] = useState<"auto" | "indoor" | "outdoor">("auto");
  const [adminConfigSnapshot, setAdminConfigSnapshot] = useState<AdminConfigSnapshot>(createDefaultAdminConfigSnapshot());

  // Effective indoor/outdoor verdict for "auto" mode.
  //
  // KEY RULE (coach Helgi, Jun 2026): a session is "indoor" only when it has NO
  // GPS. The Catapult unit still records FMP / IMA inertial data OUTDOORS, so
  // FMP-presence is NOT a valid indoor signal — *absence of GPS* is. The old
  // gate keyed off indoor-data presence, which lit up the Indoor Briefing for a
  // squad that trains entirely outdoors (every recent Breiðablik session has
  // GPS). Here we infer the squad's mode from the recent window: any GPS in the
  // window → outdoor; GPS-less but inertial data present → indoor. Scanning the
  // whole window (not just today) keeps the verdict stable on rest / OFF days,
  // where no session — and therefore no GPS — exists for the current date.
  // A manual "indoor"/"outdoor" override always wins; "auto" defers to the data.
  const effectiveTrainingMode = useMemo<"indoor" | "outdoor">(() => {
    if (trainingMode === "indoor" || trainingMode === "outdoor") return trainingMode;
    let gpsDays = 0;
    let imaOnlyDays = 0;
    for (const r of rows) {
      for (const d of r._catapult_history ?? []) {
        const hasGps = typeof d.totalDistance === "number" && d.totalDistance > 0;
        const hasInertial = (d.fmpTotalDurationS ?? 0) > 0 || (d.imaTotal ?? 0) > 0;
        if (hasGps) gpsDays += 1;
        else if (hasInertial) imaOnlyDays += 1;
      }
    }
    if (gpsDays > 0) return "outdoor";
    if (imaOnlyDays > 0) return "indoor";
    return "outdoor"; // no inertial/GPS data → default outdoor (hide indoor surfaces)
  }, [trainingMode, rows]);

  // MD context
  const [mdContextToday, setMdContextToday] = useState<string | null>(null);
  // Microcycle anchors from v_training_day_context_team — used by
  // PlannedSessionLoadCard to compose an OFF-day paragraph (days since last
  // match, days to next match).
  const [daysSincePrevToday, setDaysSincePrevToday] = useState<number | null>(null);
  const [daysToNextToday, setDaysToNextToday] = useState<number | null>(null);
  // Yesterday's readiness snapshot per player. Powers the day-over-day
  // delta badges in the Daily Briefing attention rows — "fór úr grænu í
  // gult í dag", "óbreyttur", "betri en í gær". Coaches care about deltas
  // far more than absolute states; this turns the briefing from a
  // snapshot into a story.
  const [yesterdayDeltas, setYesterdayDeltas] = useState<Record<string, {
    color: "green" | "yellow" | "red" | null;
    score: number | null;
  }>>({});
  // Today Command Center — coach-facing toggle. Default = simple view
  // (narrative + the 4 tiles a head coach reads), opt-in = full S&C
  // dashboard (dominant fatigue, neural load, volatility, avg risk,
  // baseline maturity). The simple view answers "what's today?" in a
  // glance; the full view is for the S&C / sport-science role.
  const [showCommandCenterDetails, setShowCommandCenterDetails] = useState(false);

  // Team rollups
  const [teamIntel, setTeamIntel] = useState<TeamIntel | null>(null);
  const [teamSignal, setTeamSignal] = useState<TeamSignal | null>(null);
  const [unitAlerts, setUnitAlerts] = useState<any[]>([]);

  // Generator
  const [genLoading, setGenLoading] = useState(false);
  const [genToast, setGenToast] = useState("");

  // Save all dirty
  const [saveAllLoading, setSaveAllLoading] = useState(false);
  const [saveAllToast, setSaveAllToast] = useState("");

  // Auto-lock
  const [autoLockRan, setAutoLockRan] = useState(false);
  const isAdmin = useMemo(() => String(coachRole ?? "").toLowerCase() === "admin", [coachRole]);

  useEffect(() => {
    const load = () => setAdminConfigSnapshot(loadAdminConfigSnapshotFromStorage());
    load();

    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Z history
  const [zHistory, setZHistory] = useState<Record<string, number[]>>({});
  const [recentMonitoringByPlayer, setRecentMonitoringByPlayer] = useState<Record<string, VolatilityDailyPoint[]>>({});
  const [volatilityOpenByPlayer, setVolatilityOpenByPlayer] = useState<Record<string, boolean>>({});
  const [piDrawerPlayerName, setPiDrawerPlayerName] = useState<string | null>(null);
  const [piDrawerDecision, setPiDrawerDecision] = useState<PerformanceIntelligenceDecision | null>(null);

  // GPS tab — all players fetched independently of readiness rows
  const [gpsDate, setGpsDate] = useState<string>(() => todayISO()); // browsable date for GPS tab
  // Track whether the coach has explicitly picked a date this session. If
  // they have, we never auto-shift the date (their pick wins). If they
  // haven't, we auto-shift to the team's most-recent-data-date so teams
  // that upload irregularly (Þór, Afturelding, Grindavík) don't see an
  // empty Today-view by default. Reset to false on team switch so each
  // team gets its own latest-date default on first view.
  const [gpsDateManuallySet, setGpsDateManuallySet] = useState(false);
  // Latest date with data for the current team — surfaced as "Showing latest
  // data: X" hint so coaches know they're not on today.
  const [gpsLatestDataDate, setGpsLatestDataDate] = useState<string | null>(null);
  const [gpsAllPlayers, setGpsAllPlayers] = useState<Array<{
    id: string;
    name: string;
    position: string;
    history: Array<Record<string, unknown>>;
  }>>([]);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Yesterday load context
  const [ctxHsr, setCtxHsr] = useState<string>("");
  const [ctxAcc, setCtxAcc] = useState<string>("");
  const [ctxDec, setCtxDec] = useState<string>("");
  const [ctxDist, setCtxDist] = useState<string>("");
  const [ctxVmax, setCtxVmax] = useState<string>("");
  const [ctxDuration, setCtxDuration] = useState<string>("");
  const [ctxIntensity, setCtxIntensity] = useState<"LOW" | "MEDIUM" | "HIGH" | "OFF" | "">("");
  // GPS-specific yesterday metrics (from Catapult)
  const [ctxVelB5, setCtxVelB5] = useState<string>("");
  const [ctxVelB6, setCtxVelB6] = useState<string>("");
  const [ctxAccB23, setCtxAccB23] = useState<string>("");
  const [ctxDecB23, setCtxDecB23] = useState<string>("");
  const [ctxYesterdayLoaded, setCtxYesterdayLoaded] = useState(false);

  const [ctxSaving, setCtxSaving] = useState(false);
  const [localDecisionLoading, setLocalDecisionLoading] = useState(false);
  const [localDecision, setLocalDecision] = useState<any | null>(null);
  const [localDecisionError, setLocalDecisionError] = useState<string>("");
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null);
  const [reminderStatusLoading, setReminderStatusLoading] = useState(false);
  const [reminderStatusError, setReminderStatusError] = useState("");
  const [manualReminderSending, setManualReminderSending] = useState(false);
  const [catapultSyncing, setCatapultSyncing] = useState(false);
  const [catapultSyncMessage, setCatapultSyncMessage] = useState("");
  // Backfill date — the daily Sync button only sweeps a trailing window, so a
  // match whose vest data lands in OpenField late falls outside it. Backfill
  // re-syncs one chosen day. Empty by default; coach picks the date.
  const [backfillDate, setBackfillDate] = useState("");
  const [pdfDownloading, setPdfDownloading] = useState(false);
  // Compliance / imputation
  const [complianceSummary, setComplianceSummary] = useState<{
    checkin: { submitted: number; imputed: number; missing: number };
    rpe:     { submitted: number; imputed: number; missing: number };
  } | null>(null);
  const [complianceMissing, setComplianceMissing] = useState<Array<{
    player_id: string; full_name: string; missing_checkin: boolean; missing_rpe: boolean;
  }>>([]);
  const [pdfPostDownloading, setPdfPostDownloading] = useState(false);
  const [pdfPreDownloading, setPdfPreDownloading] = useState(false);
  // Rest-day choice for the Pre-Session report — shared (via localStorage) with
  // the /coach/load-plan page, keyed by the selected day.
  const [preRestDay, setPreRestDay] = useState(false);
  // Optional past-date selector for the Post-Training report (empty = latest session).
  const [postReportDate, setPostReportDate] = useState<string>("");

  // MLI + Metabolic Load per player (for Decision Summary enrichment)
  const [playerMli, setPlayerMli] = useState<Record<string, { mli: number | null; band: string | null }>>({});
  // Most recent match minutes per player — feeds the MD+1 hard-recovery
  // guardrail in DecisionSummaryCard. Carling 2018 / Nédélec 2012 / Helsen
  // 2018: 60+ minute match triggers 24-72h recovery debt.
  const [playerMatchMinutes, setPlayerMatchMinutes] = useState<
    Record<string, { minutes_played: number; match_date: string }>
  >({});
  // Team's planned day type from week_plans for `today`. When "OFF", the
  // Decision Summary modal shows a neutral "OFF day — no training scheduled"
  // verdict instead of asserting a load/wellness recommendation that would
  // be misleading on a non-training day.
  const [teamDayType, setTeamDayType] = useState<string | null>(null);
  // High-intensity L/R CoD asymmetry % per player over the last 14 days.
  // Bishop 2020: > 15% high-tier asymmetry is the strongest predictor of
  // non-contact lower-limb injury. Surfaced as a chronic-risk chip in the
  // Decision Summary modal — informational only, NOT a verdict modifier.
  const [playerCodHighAsym, setPlayerCodHighAsym] = useState<Record<string, number>>({});
  // Sprint Speed Drop per player (today vs personal top-3 mean over 28d).
  // Only stored when drop ≥ 3% AND the player has a HSR-meaningful session
  // today AND ≥ 4 reference sessions in the window. Sub-3% is normal noise
  // (Buchheit 2014). > 10% drop ≈ 3–4× hamstring injury risk (Edouard 2019,
  // Malone 2018). Surfaced as informational chip in DecisionSummaryCard —
  // does NOT modify today's verdict (verdict modulation deferred until
  // 2–3 coaches confirm the rule fits their workflow).
  const [playerSprintDrop, setPlayerSprintDrop] = useState<
    Record<string, { dropPct: number; todayKmh: number; refKmh: number }>
  >({});
  // Sprint Exposure per player (Malone 2018 — volume-side hamstring risk).
  // Weekly sum of IMA bands 5-8 strides vs the player's match-day demand
  // baseline (avg per match over last 28d). UNDERLOAD < 50% → 3× hamstring
  // injury risk; OVERLOAD > 150% → accumulated spike. Companion to Sprint
  // Speed Drop (quality side) — together they form full hamstring-injury
  // surveillance (Buchheit 2019: monitor both quality + volume).
  // Computed inline against the team-batched query for one round-trip.
  const [playerSprintExposure, setPlayerSprintExposure] = useState<
    Record<string, {
      band: "UNDERLOAD" | "WATCH" | "SAFE" | "OVERLOAD" | "INSUFFICIENT_DATA";
      ratio: number | null;
      matchDaysObserved: number;
      matchDaysMeasured: number;
      matchDaysEstimated: number;
      matchDaysScheduled: number;
    }>
  >({});
  // ELITE-tier "Ask Claude for deeper analysis" button on the Coach
  // Recommendation card. Clicking POSTs to /api/coach/team-analysis,
  // which gates on plan_tier=ELITE and runs Haiku on team facts.
  // Result is rendered inline below the deterministic narrative.
  const [aiTeamAnalysis, setAiTeamAnalysis] = useState<{
    paragraph_1: string; paragraph_2: string; generated_at: string;
  } | null>(null);
  const [aiTeamLoading, setAiTeamLoading] = useState(false);
  const [aiTeamError, setAiTeamError] = useState<string | null>(null);
  const [playerMetabolic, setPlayerMetabolic] = useState<Record<string, { score: number | null; band: string | null }>>({});
  // VBT fatigue flags per player
  const [playerVbtFatigue, setPlayerVbtFatigue] = useState<Record<string, Array<{
    exerciseName: string; loadKg: number; velocityDropPct: number;
    baselineVelocity: number; worstVelocity: number;
  }>>>({});

  // Indoor Load (FMP-driven höll-mode) per player — populates Decision Summary's Indoor block
  const [playerIndoorStatus, setPlayerIndoorStatus] = useState<Record<string, {
    latestDate: string | null;
    compositeScore: number | null;
    compositeBand: "light" | "below_average" | "typical" | "heavy" | "spike" | null;
    mcburnieRatio: number | null;
    mcburnieFlag: "green" | "yellow" | "red" | null;
    acwrValue: number | null;
    acwrFlag: "green" | "yellow" | "red" | null;
    sessions7d: number | null;
  }>>({});

  // Decel Intelligence (McBurnie 2022 4-dimension framework) per player —
  // feeds the verdict pipeline so a player flagged red on
  // /coach/decel-intelligence also shows red on the dashboard.
  const [playerDecelStatus, setPlayerDecelStatus] = useState<Record<string, {
    overallFlag: "green" | "yellow" | "red" | "unknown" | null;
    explanation: string | null;
  }>>({});

  // Active injuries per player — overrides load-based verdict in Decision Summary
  const [playerInjuryStatus, setPlayerInjuryStatus] = useState<Record<string, {
    status: "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;
    rtpStage: number | null;
    bodyPart: string | null;
    injuryType: string | null;
    estimatedReturn: string | null;
    severity: string | null;
  }>>({});

  // Per-player wellness baselines (Robertson 2017 / Rebelo 2026). Fed into
  // DailyBriefingCard so driver chips ("svefn 2/5", "soreness 2/5") flag
  // against each player's personal mean+SD instead of a global ≤2 cutoff.
  // Without this, players whose personal norm is itself ~2.5 trigger every
  // single day, while players whose norm is 4-5/5 never trigger when they
  // dip to 3/5 — both wrong directions for clinical decisions.
  // Shape: { player_id → { metric_key → AthleteMetricBaseline } }.
  const [playerBaselines, setPlayerBaselines] = useState<
    Record<string, Record<string, {
      player_id: string;
      metric_key: string;
      n_observations: number;
      mean: number;
      sd: number;
      cv: number | null;
      median: number | null;
      window_days: number;
      status: "insufficient_data" | "calibrating" | "active";
      computed_at: string;
    }>>
  >({});

  // Fetch MLI + Metabolic when rows change — try entry date first, fall back to yesterday
  useEffect(() => {
    if (!rows.length || !coachTeamId) return;
    const entryDate = rows[0]?.entry_date ?? today;
    const yd = new Date(entryDate);
    yd.setDate(yd.getDate() - 1);
    const yesterdayStr = yd.toISOString().slice(0, 10);
    const datesToTry = [entryDate, yesterdayStr];

    (async () => {
      let headers: Record<string, string>;
      try {
        headers = await getCoachAuthHeaders();
      } catch {
        return; // not authenticated
      }

      // MLI — try entry date first, if no rows fall back to yesterday
      for (const dateStr of datesToTry) {
        try {
          const res = await fetch(`/api/coach/player-load/mli?teamId=${coachTeamId}&date=${dateStr}`, { headers });
          if (!res.ok) continue;
          const data = await res.json();
          const validRows = (data?.rows ?? []).filter((r: any) => r.mli != null);
          if (validRows.length > 0) {
            const map: Record<string, { mli: number | null; band: string | null }> = {};
            for (const r of validRows) {
              map[r.player_id] = { mli: r.mli ?? null, band: r.mli_band ?? null };
            }
            setPlayerMli(map);
            break;
          }
        } catch { /* continue to next date */ }
      }

      // Metabolic — same pattern
      for (const dateStr of datesToTry) {
        try {
          const res = await fetch(`/api/coach/player-load/metabolic?teamId=${coachTeamId}&date=${dateStr}`, { headers });
          if (!res.ok) continue;
          const data = await res.json();
          const validRows = (data?.rows ?? []).filter((r: any) => r.metabolic_load_score != null);
          if (validRows.length > 0) {
            const map: Record<string, { score: number | null; band: string | null }> = {};
            for (const r of validRows) {
              map[r.player_id] = { score: r.metabolic_load_score ?? null, band: r.metabolic_load_band ?? null };
            }
            setPlayerMetabolic(map);
            break;
          }
        } catch { /* continue to next date */ }
      }

      // VBT fatigue — velocity loss from first 2 sets
      try {
        const res = await fetch(`/api/coach/vbt-fatigue?teamId=${coachTeamId}&date=${entryDate}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data?.players?.length) {
            const map: Record<string, Array<{
              exerciseName: string; loadKg: number; velocityDropPct: number;
              baselineVelocity: number; worstVelocity: number;
            }>> = {};
            for (const p of data.players) {
              if (p.hasFatigue && p.flags?.length) {
                map[p.playerId] = p.flags.map((f: any) => ({
                  exerciseName: f.exerciseName,
                  loadKg: f.loadKg,
                  velocityDropPct: f.velocityDropPct,
                  baselineVelocity: f.baselineVelocity,
                  worstVelocity: f.worstVelocity,
                }));
              }
            }
            setPlayerVbtFatigue(map);
          }
        }
      } catch { /* VBT fatigue is optional */ }

      // Indoor Load Intelligence — fetch per-player composite score + McBurnie status.
      // RPC handles 28d baseline + indoor session detection internally; we just collect.
      try {
        const playerIds = rows.map((r) => r.player_id).filter(Boolean);
        if (playerIds.length) {
          const indoorMap: typeof playerIndoorStatus = {};
          await Promise.all(
            playerIds.map(async (pid) => {
              try {
                const { data } = await supabase.rpc("get_indoor_load_status", {
                  p_player_id: pid,
                });
                const status = data as Record<string, unknown> | null;
                if (!status) return;
                const sessions7d = Number(
                  (status.recent_7d as Record<string, unknown> | null)?.sessions ?? 0,
                );
                if (sessions7d <= 0) return; // no recent indoor work — skip
                const latest = status.latest_session as Record<string, unknown> | null;
                const mc = status.indoor_mcburnie as Record<string, unknown> | null;
                const acwr = status.acwr as Record<string, unknown> | null;
                indoorMap[pid] = {
                  latestDate: typeof latest?.date === "string" ? latest.date : null,
                  compositeScore: typeof status.composite_score === "number" ? status.composite_score : null,
                  compositeBand: (status.composite_score_band as typeof playerIndoorStatus[string]["compositeBand"]) ?? null,
                  mcburnieRatio: typeof mc?.decel_per_dyn_high_min === "number" ? mc.decel_per_dyn_high_min : null,
                  mcburnieFlag: (mc?.flag as "green" | "yellow" | "red" | undefined) ?? null,
                  acwrValue: typeof acwr?.value === "number" ? acwr.value : null,
                  acwrFlag: (acwr?.flag as "green" | "yellow" | "red" | undefined) ?? null,
                  sessions7d,
                };
              } catch { /* per-player RPC failure — skip silently */ }
            }),
          );
          if (Object.keys(indoorMap).length) setPlayerIndoorStatus(indoorMap);
        }
      } catch { /* Indoor Load is optional */ }

      // Decel Intelligence (McBurnie 2022 4-dimension framework) per
      // player — feeds the verdict pipeline so a player flagged red on
      // /coach/decel-intelligence cannot show GREEN on the dashboard.
      // Same fetch pattern as Indoor Load: parallel per-player RPC,
      // skip silently when data is missing.
      try {
        const playerIds = rows.map((r) => r.player_id).filter(Boolean);
        if (playerIds.length) {
          const decelMap: typeof playerDecelStatus = {};
          await Promise.all(
            playerIds.map(async (pid) => {
              try {
                const { data } = await supabase.rpc("get_mcburnie_decel_status", {
                  p_player_id: pid,
                });
                const status = data as Record<string, unknown> | null;
                if (!status) return;
                const flag = status.overall_flag as "green" | "yellow" | "red" | "unknown" | undefined;
                if (!flag) return;
                decelMap[pid] = {
                  overallFlag: flag,
                  explanation: typeof status.explanation === "string" ? status.explanation : null,
                };
              } catch { /* per-player RPC failure — skip silently */ }
            }),
          );
          if (Object.keys(decelMap).length) setPlayerDecelStatus(decelMap);
        }
      } catch { /* Decel Intelligence is optional */ }

      // Wellness baselines — keyed by player+metric for personal-norm
      // flagging in DailyBriefingCard (deriveReadinessDrivers). One bulk
      // fetch covers the whole team — RLS scopes it to the coach's
      // players. Wellness keys only (sleep_quality, fatigue_energy,
      // stress_mood, muscle_soreness, sleep_duration, total) — load
      // metric baselines aren't needed by the briefing card.
      try {
        const playerIds = rows.map((r) => r.player_id).filter(Boolean);
        if (playerIds.length) {
          const { data: blRows } = await supabase
            .from("athlete_metric_baselines")
            .select(
              "player_id, metric_key, n_observations, mean, sd, cv, median, window_days, status, computed_at",
            )
            .in("player_id", playerIds)
            .like("metric_key", "wellness.%");
          const blMap: Record<string, Record<string, any>> = {};
          for (const row of (blRows ?? []) as any[]) {
            const pid = String(row.player_id);
            if (!blMap[pid]) blMap[pid] = {};
            blMap[pid][String(row.metric_key)] = row;
          }
          if (Object.keys(blMap).length) setPlayerBaselines(blMap);
        }
      } catch { /* baselines are optional — falls back to global ≤2 threshold */ }

      // Active injuries / illnesses — overrides Decision Summary verdict.
      // We read from BOTH player_injuries (RTP-stage workflow) and injury_events
      // (legacy + illness logging). player_injuries takes precedence when both have
      // a record for the same player. Without this dual fetch we miss illnesses
      // logged via the older /coach/injuries page (critical safety hole).
      //
      // ILLNESS AUTO-PROMOTE LOGIC:
      // injury_events.is_active never auto-clears. So when a player logs an illness
      // and then resumes training, the system would incorrectly keep showing 🤒 Veikur.
      // We detect resumed training via Catapult sessions after illness_date and:
      //   - 7+ days since logged + recent training → presume cleared (skip verdict)
      //   - Recent training (today/yesterday) → demote to "rehabilitation" (🫧 Að jafna sig)
      //   - No recent training → keep as 🤒 Veikur
      try {
        const playerIds = rows.map((r) => r.player_id).filter(Boolean);
        if (playerIds.length) {
          const todayStr = new Date().toISOString().slice(0, 10);
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

          const [piResp, ieResp, recentTrainingResp] = await Promise.all([
            supabase
              .from("player_injuries")
              .select("player_id, status, rtp_stage, body_part, injury_type, estimated_return_date, severity, injury_date, actual_return_date")
              .in("player_id", playerIds)
              .order("injury_date", { ascending: false }),
            supabase
              .from("injury_events")
              .select("player_id, injury_type, body_side, severity, is_active, return_date, injury_date")
              .in("player_id", playerIds)
              .eq("is_active", true)
              .order("injury_date", { ascending: false }),
            // Last 7 days of training sessions per player (for illness auto-promote)
            supabase
              .from("player_external_load_daily")
              .select("player_id, date, total_player_load")
              .in("player_id", playerIds)
              .eq("source", "catapult")
              .gte("date", sevenDaysAgoStr)
              .gt("total_player_load", 0)
              .order("date", { ascending: false }),
          ]);

          // Build per-player training history map: { playerId → [date, ...] sorted desc }
          const trainingDatesByPlayer = new Map<string, string[]>();
          for (const t of (recentTrainingResp.data ?? []) as Array<Record<string, unknown>>) {
            const pid = String(t.player_id);
            const date = String(t.date);
            const list = trainingDatesByPlayer.get(pid) ?? [];
            list.push(date);
            trainingDatesByPlayer.set(pid, list);
          }

          /** Apply illness auto-promote rules. Returns null if illness should be SKIPPED entirely. */
          function resolveIllnessStatus(
            pid: string,
            illnessDate: string | null,
          ): "injured" | "rehabilitation" | null {
            const trainingDates = trainingDatesByPlayer.get(pid) ?? [];
            const trainedAfterIllness = illnessDate
              ? trainingDates.some((d) => d > illnessDate)
              : false;
            const trainedRecently =
              trainingDates.length > 0 &&
              (trainingDates[0] === todayStr ||
                trainingDates[0] === new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
            const daysSinceLogged = illnessDate
              ? Math.floor((Date.now() - new Date(illnessDate).getTime()) / 86_400_000)
              : 0;
            // Stale illness (logged 7+ days ago) + back to training → presume cleared
            if (daysSinceLogged >= 7 && trainedAfterIllness) return null;
            // Recent training → demote to recovering
            if (trainedRecently || trainedAfterIllness) return "rehabilitation";
            // Still actively sick
            return "injured";
          }

          const injuryMap: typeof playerInjuryStatus = {};

          // First pass: injury_events (lower precedence — used as fallback)
          for (const ev of (ieResp.data ?? []) as Array<Record<string, unknown>>) {
            const pid = String(ev.player_id);
            if (injuryMap[pid]) continue; // already have more recent
            const evType = String(ev.injury_type ?? "");
            const isIllness = evType === "illness";
            const illnessDate = typeof ev.injury_date === "string" ? ev.injury_date : null;
            // For illness: apply auto-promote rule based on training history
            let effectiveStatus: typeof playerInjuryStatus[string]["status"] = "injured";
            if (isIllness) {
              const resolved = resolveIllnessStatus(pid, illnessDate);
              if (resolved == null) continue; // presumed cleared — skip
              effectiveStatus = resolved;
            }
            injuryMap[pid] = {
              status: effectiveStatus,
              rtpStage: null,
              bodyPart: isIllness ? "Illness" : evType.replace(/_/g, " "),
              injuryType: isIllness ? "Veikindi" : evType.replace(/_/g, " "),
              estimatedReturn: typeof ev.return_date === "string" ? ev.return_date : null,
              severity: typeof ev.severity === "string" ? ev.severity : null,
            };
          }

          // Second pass: player_injuries (HIGHER precedence — overwrites injury_events)
          for (const inj of (piResp.data ?? []) as Array<Record<string, unknown>>) {
            const pid = String(inj.player_id);
            const status = inj.status as typeof playerInjuryStatus[string]["status"];
            const isActive =
              status === "injured" ||
              status === "rehabilitation" ||
              status === "rtp_training";
            if (!isActive) continue;
            if (injuryMap[pid] && injuryMap[pid].rtpStage != null) continue;
            injuryMap[pid] = {
              status,
              rtpStage: typeof inj.rtp_stage === "number" ? inj.rtp_stage : null,
              bodyPart: typeof inj.body_part === "string" ? inj.body_part : null,
              injuryType: typeof inj.injury_type === "string" ? inj.injury_type : null,
              estimatedReturn: typeof inj.estimated_return_date === "string" ? inj.estimated_return_date : null,
              severity: typeof inj.severity === "string" ? inj.severity : null,
            };
          }
          setPlayerInjuryStatus(injuryMap);
        }
      } catch { /* Injury fetch is optional — no override if it fails */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, coachTeamId]);

  // Auto-fill zeros when OFF
  useEffect(() => {
    if (ctxIntensity !== "OFF") return;
    setCtxHsr("0");
    setCtxAcc("0");
    setCtxDec("0");
    setCtxDist("0");
    setCtxVmax("0");
    setCtxDuration("0");
  }, [ctxIntensity]);

  const today = useMemo(() => todayISO(), []);

  // Keep the Pre-Session "Rest day" checkbox in sync with the saved choice for
  // the selected day (shared with the /coach/load-plan page).
  useEffect(() => {
    setPreRestDay(readRestDayPref(postReportDate || today));
  }, [postReportDate, today]);

  // Header MD-day (team display)
  const mdDayToday = useMemo(() => {
    const t = dateKey(todayISO());
    const row = (weekGrid ?? []).find((x: any) => dateKey(x.day_date) === t) ?? null;
    const src = mdContextToday ?? row?.md_day ?? planPreview?.md_day ?? null;
    return prettyMd(src).md;
  }, [weekGrid, planPreview?.md_day, mdContextToday]);

  // Recent day types indexed by ISO date — used by DailyBriefingCard to
  // render the "after OFF" context badge when yesterday had no real data.
  // Keep the map stable across renders so the memo inside the card works.
  const recentDayTypes = useMemo<Record<string, string | null>>(() => {
    const map: Record<string, string | null> = {};
    for (const row of (weekGrid ?? []) as Array<{ day_date?: string | null; day_type_final?: string | null }>) {
      const key = dateKey(String(row.day_date ?? ""));
      if (!key) continue;
      map[key] = row.day_type_final ?? null;
    }
    return map;
  }, [weekGrid]);


  /** -----------------------------
   * Utilities
   * ----------------------------- */
  const AUTO_LOCK_MINUTES_BEFORE = 30;
  const DEFAULT_SESSION_START = { hour: 16, minute: 0 };

  function toIntOrNull(v: string): number | null {
    const n = Number(v);
    return Number.isFinite(n) && v.trim() !== "" ? Math.trunc(n) : null;
  }
  function toNumOrNull(v: string): number | null {
    const n = Number(v);
    return Number.isFinite(n) && v.trim() !== "" ? n : null;
  }
  function driverLabel(input: unknown): string {
    if (input && typeof input === "object") {
      const obj = input as { label?: unknown; code?: unknown; points?: unknown };
      if (typeof obj.label === "string" && obj.label.trim().length) {
        const pts = typeof obj.points === "number" && Number.isFinite(obj.points) ? `(+${obj.points})` : "";
        return `${obj.label}${pts}`;
      }
      if (typeof obj.code === "string" && obj.code.trim().length) {
        return String(obj.code)
          .toLowerCase()
          .replace(/_/g, " ")
          .replace(/\b\w/g, (m) => m.toUpperCase());
      }
    }
    return String(input ?? "")
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }
  function hasExplicitPainInNotes(note: string | null | undefined): boolean {
    const text = String(note ?? "").toLowerCase();
    if (!text) return false;
    return /(pain|injur|injury|meið|meid|verk|hamstring|groin|adductor|achilles|patellar|stíf)/i.test(text);
  }
  function deriveTissueProtectionSignal(input: {
    fatigueType: string;
    fatigueSeverity: string;
    sorenessScore: number | null;
    noteText: string | null | undefined;
    neuralFatigueBand: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | null;
    readinessScore: number | null;
    zScore: number | null;
    stenScore: number | null;
  }): {
    painProtection: boolean;
    tissueSignal: boolean;
    tissueSeverity: "LOW" | "MODERATE" | "HIGH" | null;
    explicitPainTextFlag: boolean;
  } {
    const tissueSignal = input.fatigueType === "TISSUE";
    const tissueSeverity: "LOW" | "MODERATE" | "HIGH" | null =
      input.fatigueSeverity === "LOW" || input.fatigueSeverity === "MODERATE" || input.fatigueSeverity === "HIGH"
        ? input.fatigueSeverity
        : null;
    const lowSoreness = typeof input.sorenessScore === "number" && input.sorenessScore <= 2;
    const goodSoreness = typeof input.sorenessScore === "number" && input.sorenessScore >= 4;
    const explicitPainTextFlag = hasExplicitPainInNotes(input.noteText);
    const tissueSeverityEscalates = tissueSeverity === "MODERATE" || tissueSeverity === "HIGH";
    const strongRedCompanion =
      input.neuralFatigueBand === "HIGH" ||
      input.neuralFatigueBand === "VERY_HIGH" ||
      (typeof input.readinessScore === "number" && input.readinessScore < 40) ||
      (typeof input.zScore === "number" && input.zScore <= -1);
    const strongPositiveGuardrail =
      typeof input.zScore === "number" &&
      input.zScore > 1.5 &&
      typeof input.stenScore === "number" &&
      input.stenScore >= 8 &&
      goodSoreness &&
      tissueSeverity === "LOW";
    const painProtection =
      tissueSignal &&
      !strongPositiveGuardrail &&
      (tissueSeverityEscalates || lowSoreness || explicitPainTextFlag || strongRedCompanion);

    return {
      painProtection,
      tissueSignal,
      tissueSeverity,
      explicitPainTextFlag,
    };
  }
  function formatAdaptationFallback(adaptation: Row["_adaptation"]): string {
    if (!adaptation) return "";
    const parts: string[] = [];
    if (typeof adaptation.reduceVolumePct === "number") parts.push(`-${adaptation.reduceVolumePct}% volume`);
    if (typeof adaptation.reduceContactsPct === "number") parts.push(`-${adaptation.reduceContactsPct}% contacts`);
    if (adaptation.extendRest) parts.push("extended rest");
    if (adaptation.simplifySession) parts.push("simplify session");
    if (adaptation.recoveryBias) parts.push("recovery bias");
    if (adaptation.swapBallistic) parts.push("swap ballistic");
    if (adaptation.protectTissue) parts.push(`protect ${String(adaptation.protectTissue).toLowerCase()}`);
    if (adaptation.addTendonReload) parts.push("add tendon reload");
    if (adaptation.addNeuralReset) parts.push("add neural reset");
    return parts.join(", ");
  }
  function adaptationDetailLines(adaptation: Row["_adaptation"]): string[] {
    if (!adaptation) return [];
    const lines: string[] = [];
    if (typeof adaptation.reduceVolumePct === "number") lines.push(`Reduce volume: ${adaptation.reduceVolumePct}%`);
    if (typeof adaptation.reduceContactsPct === "number") lines.push(`Reduce contacts: ${adaptation.reduceContactsPct}%`);
    if (adaptation.extendRest) lines.push("Extend rest intervals");
    if (adaptation.simplifySession) lines.push("Simplify session");
    if (adaptation.recoveryBias) lines.push("Recovery bias");
    if (adaptation.swapBallistic) lines.push("Swap ballistic elements");
    if (adaptation.protectTissue) lines.push(`Protect tissue: ${adaptation.protectTissue}`);
    if (adaptation.addTendonReload) lines.push("Add tendon reload");
    if (adaptation.addNeuralReset) lines.push("Add neural reset");
    if (adaptation.notes?.length) lines.push(`Notes: ${adaptation.notes.join(", ")}`);
    return lines;
  }
  function truncateLine(value: string | null | undefined, max = 92): string {
    const s = String(value ?? "").trim();
    if (!s) return "";
    if (s.length <= max) return s;
    return `${s.slice(0, Math.max(0, max - 1))}…`;
  }
  function neuralBiasReasonLabel(code: string): string {
    const c = String(code ?? "").toUpperCase();
    if (c === "TEAM_NEURAL_LOAD_RISING") return "Rising team neural load";
    if (c === "TEAM_NEURAL_LOAD_HIGH") return "High team neural load";
    if (c === "TEAM_NEURAL_LOAD_CRITICAL") return "Critical team neural load";
    if (c === "TEAM_NEXT_DAY_RISK_MODERATE") return "Moderate next-day risk";
    if (c === "TEAM_NEXT_DAY_RISK_HIGH") return "High next-day risk";
    if (c === "PLAYER_NEURAL_LOAD_RISING") return "Rising neural load";
    if (c === "PLAYER_NEURAL_LOAD_HIGH") return "High neural load";
    if (c === "PLAYER_NEURAL_LOAD_CRITICAL") return "Critical neural load";
    if (c === "PLAYER_NEXT_DAY_RISK_MODERATE") return "Moderate next-day risk";
    if (c === "PLAYER_NEXT_DAY_RISK_HIGH") return "High next-day risk";
    if (c === "PLAYER_TRAJECTORY_DECLINING") return "Declining trajectory";
    if (c === "PLAYER_NEURAL_BIAS_REDUCE") return "Bias nudged action to reduced volume";
    if (c === "PLAYER_NEURAL_BIAS_NO_SPRINT") return "Bias nudged action to no sprint";
    return driverLabel(c);
  }
  function formatNeuralBiasReasons(codes: string[] | null | undefined, limit = 3): string {
    const arr = (codes ?? []).filter(Boolean);
    if (!arr.length) return "";
    return arr
      .slice(0, limit)
      .map((c) => neuralBiasReasonLabel(c))
      .join(" + ");
  }

  function ydayOf(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  async function getCoachAuthHeaders() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    const accessToken = data?.session?.access_token;
    if (!accessToken) throw new Error("Missing auth token");
    return {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    };
  }

  async function loadReminderStatus(dateKey: string) {
    try {
      setReminderStatusLoading(true);
      setReminderStatusError("");
      const headers = await getCoachAuthHeaders();
      const res = await fetch(`/api/reminders/status?dateKey=${encodeURIComponent(dateKey)}`, {
        method: "GET",
        headers,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load reminder status.");
      setReminderStatus((json?.status ?? null) as ReminderStatus | null);
    } catch (e: any) {
      setReminderStatus(null);
      setReminderStatusError(e?.message ?? "Failed to load reminder status.");
    } finally {
      setReminderStatusLoading(false);
    }
  }

  async function sendManualReminder(dateKey: string) {
    try {
      setManualReminderSending(true);
      setReminderStatusError("");
      const headers = await getCoachAuthHeaders();
      const res = await fetch("/api/reminders/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ dateKey }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to send manual reminders.");
      await loadReminderStatus(dateKey);
    } catch (e: any) {
      setReminderStatusError(e?.message ?? "Failed to send manual reminders.");
    } finally {
      setManualReminderSending(false);
    }
  }

  async function syncCatapultForDate(entryDate: string) {
    try {
      setCatapultSyncing(true);
      setCatapultSyncMessage("");
      const headers = await getCoachAuthHeaders();
      // daysBack: 2 makes the Sync button sweep today + the previous 2
      // calendar days (3 in total). This catches matches/sessions that
      // were played yesterday but only uploaded from the vest dock the
      // morning after — a common workflow that the single-day default
      // would otherwise miss entirely.
      const res = await fetch("/api/integrations/catapult/daily-sync", {
        method: "POST",
        headers,
        body: JSON.stringify({ date: entryDate, daysBack: 2 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to sync Catapult.");
      const stored = Number(json?.result?.storedCount ?? 0);
      const unmatched = Number(json?.result?.unmatchedCount ?? 0);
      const datesSynced = Number(json?.result?.datesSynced ?? 1);
      const sweepNote = datesSynced > 1 ? ` (${datesSynced} days)` : "";
      setCatapultSyncMessage(`Catapult synced: ${stored} stored${sweepNote}${unmatched > 0 ? ` · ${unmatched} unmatched` : ""}`);
      await loadToday();
    } catch (e: any) {
      setCatapultSyncMessage(e?.message ?? "Failed to sync Catapult.");
    } finally {
      setCatapultSyncing(false);
    }
  }

  // Backfill a single past day via the Catapult backfill endpoint. Unlike the
  // daily Sync button (which only sweeps today + 2 prior days), this re-syncs
  // any chosen date — used to recover a match whose vest data reached Catapult
  // OpenField after the daily sweep window had already passed.
  async function backfillCatapultForDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setCatapultSyncMessage("Veldu gilda dagsetningu fyrir backfill.");
      return;
    }
    try {
      setCatapultSyncing(true);
      setCatapultSyncMessage("");
      const headers = await getCoachAuthHeaders();
      const res = await fetch(
        `/api/integrations/catapult/backfill?dateFrom=${date}&dateTo=${date}`,
        { method: "POST", headers },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Backfill mistókst.");
      const stored = Array.isArray(json?.results)
        ? (json.results as Array<{ stored?: number }>).reduce((s, r) => s + Number(r.stored ?? 0), 0)
        : 0;
      setCatapultSyncMessage(
        stored > 0
          ? `Backfill ${date}: ${stored} raðir vistaðar`
          : `Backfill ${date}: engin Catapult activity fannst fyrir daginn`,
      );
      await loadToday();
    } catch (e: unknown) {
      setCatapultSyncMessage(e instanceof Error ? e.message : "Backfill mistókst.");
    } finally {
      setCatapultSyncing(false);
    }
  }

  async function syncStatSportForDate(entryDate: string) {
    try {
      setCatapultSyncing(true);
      setCatapultSyncMessage("");
      const headers = await getCoachAuthHeaders();
      const res = await fetch("/api/integrations/statsport/daily-sync", {
        method: "POST",
        headers,
        body: JSON.stringify({ date: entryDate }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to sync STATSports.");
      const stored = Number(json?.result?.storedCount ?? 0);
      const unmatched = Number(json?.result?.unmatchedCount ?? 0);
      setCatapultSyncMessage(`STATSports synced: ${stored} stored${unmatched > 0 ? ` · ${unmatched} unmatched` : ""}`);
      await loadToday();
    } catch (e: any) {
      setCatapultSyncMessage(e?.message ?? "Failed to sync STATSports.");
    } finally {
      setCatapultSyncing(false);
    }
  }

  async function fetchCompliance(date?: string) {
    try {
      const headers = await getCoachAuthHeaders();
      const d = date ?? today;
      const res = await fetch(`/api/coach/impute?date=${d}`, { headers });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) {
        setComplianceSummary(json.summary ?? null);
        setComplianceMissing(json.missing ?? []);
      }
    } catch {
      // non-critical — ignore
    }
  }

  async function loadYesterdayContext(teamId: string, entryDate: string) {
    const yday = ydayOf(entryDate);

    // Auto-populate from Catapult team data — no manual input needed
    const { data, error } = await supabase
      .from("player_external_load_daily")
      .select("hir_dist, tot_as, tot_ds, total_distance, max_vel, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2")
      .eq("team_id", teamId)
      .eq("date", yday)
      .in("source", ["catapult", "manual"]);

    if (error) {
      console.warn("loadYesterdayContext (Catapult) error:", error.message);
      return;
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    setCtxYesterdayLoaded(true);
    if (!rows.length) return;

    function avgOf(key: string): number | null {
      const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number" && isFinite(v));
      return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    }
    function maxOf(key: string): number | null {
      const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === "number" && isFinite(v));
      return vals.length ? Math.max(...vals) : null;
    }

    const avgDist = avgOf("total_distance");
    const intensity: "OFF" | "LOW" | "MEDIUM" | "HIGH" =
      avgDist == null || avgDist === 0 ? "OFF"
      : avgDist > 7000 ? "HIGH"
      : avgDist > 4000 ? "MEDIUM"
      : "LOW";

    setCtxHsr(avgOf("hir_dist")?.toString() ?? "");
    setCtxAcc(avgOf("tot_as")?.toString() ?? "");
    setCtxDec(avgOf("tot_ds")?.toString() ?? "");
    setCtxDist(avgDist?.toString() ?? "");
    setCtxVmax(maxOf("max_vel")?.toString() ?? "");
    setCtxIntensity(intensity);
    setCtxDuration("");
    // GPS-specific metrics
    setCtxVelB5(avgOf("velocity_band5_total_distance")?.toString() ?? "");
    setCtxVelB6(avgOf("velocity_band6_total_distance")?.toString() ?? "");
    setCtxAccB23(avgOf("accel_b2_3_tot_effs_gen2")?.toString() ?? "");
    setCtxDecB23(avgOf("decel_b2_3_tot_effs_gen2")?.toString() ?? "");
  }

  async function saveYesterdayContext(teamId: string, entryDate: string) {
    setCtxSaving(true);
    try {
      const yday = ydayOf(entryDate);

      const intensity = ctxIntensity;
      const hsr_m = toIntOrNull(ctxHsr);
      const acc_total = toIntOrNull(ctxAcc);
      const dec_total = toIntOrNull(ctxDec);
      const total_distance_m = toIntOrNull(ctxDist);
      const max_velocity_pct = toNumOrNull(ctxVmax);
      const duration_min = toIntOrNull(ctxDuration);

      const normalized = {
        hsr_m: intensity === "OFF" ? 0 : hsr_m ?? null,
        acc_total: intensity === "OFF" ? 0 : acc_total ?? null,
        dec_total: intensity === "OFF" ? 0 : dec_total ?? null,
        total_distance_m: intensity === "OFF" ? 0 : total_distance_m ?? null,
        max_velocity_pct: intensity === "OFF" ? 0 : max_velocity_pct ?? null,
        duration_min: intensity === "OFF" ? 0 : duration_min ?? null,
        intensity: intensity || null,
      };

      const payload: any = {
        team_id: teamId,
        session_date: yday,
        ...normalized,
      };

      const { error } = await supabase.from("training_session_context").upsert(payload, { onConflict: "team_id,session_date" });
      if (error) throw error;
    } catch (e: any) {
      setError(e?.message ?? "Save yesterday load mistókst.");
    } finally {
      setCtxSaving(false);
    }
  }

  async function computeLocalTeamDecisionPreview() {
  setLocalDecisionLoading(true);
  setLocalDecisionError("");
  try {
    const intensity = ctxIntensity;
    
      const hsr_m = toIntOrNull(ctxHsr);
      const acc_total = toIntOrNull(ctxAcc);
      const dec_total = toIntOrNull(ctxDec);
      const total_distance_m = toIntOrNull(ctxDist);
      const max_velocity_pct = toNumOrNull(ctxVmax);

      const normalized = {
        hsr_m: intensity === "OFF" ? 0 : hsr_m ?? null,
        acc_total: intensity === "OFF" ? 0 : acc_total ?? null,
        dec_total: intensity === "OFF" ? 0 : dec_total ?? null,
        total_distance_m: intensity === "OFF" ? 0 : total_distance_m ?? null,
        max_velocity_pct: intensity === "OFF" ? 0 : max_velocity_pct ?? null,
        intensity: intensity || null,
      };

      const players = (rows ?? []).map((r) => ({
        player_id: String(r.player_id),
        z: typeof r._z_today === "number" ? r._z_today : null,
        z_prev: typeof r._yesterday_z === "number" ? r._yesterday_z : null,
      }));

      const accDecTotal = (normalized.acc_total ?? 0) + (normalized.dec_total ?? 0);

      const decision = computeTeamDecision(players as any, {
        hsr_m: normalized.hsr_m,
        acc_dec_total: accDecTotal,
        total_distance_m: normalized.total_distance_m,
        max_velocity_pct: normalized.max_velocity_pct,
        intensity: (normalized.intensity || null) as any,
      });

      console.log("MicroPulse preview result:", decision);

      if (!decision) {
        throw new Error("computeTeamDecision skilaði engu svari.");
      }

      setLocalDecision(decision);
    } catch (e: any) {
      console.error("computeLocalTeamDecisionPreview failed:", e);
      setLocalDecision(null);
      setLocalDecisionError(e?.message ?? "Preview computation failed.");
    } finally {
      setLocalDecisionLoading(false);
    }
  }

  async function ensureCoachAccess() {
    console.log("[ensureCoachAccess] start");
    setError("");

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error("auth.getUser error:", authErr.message);

    const uid = auth?.user?.id;
    if (!uid) {
      router.replace(`/login?next=${encodeURIComponent("/coach")}`);
      return null;
    }

    const { data: prof, error: profErr } = await supabase.from("profiles").select("role, display_name, team_id").eq("id", uid).maybeSingle();
    if (profErr) {
      console.error("profiles load error:", profErr.message);
      setError(profErr.message);
      return null;
    }

    const role = (prof as any)?.role ?? null;
    const name = (prof as any)?.display_name ?? auth?.user?.email ?? "";
    setCoachName(name);
    setCoachRole(String(role ?? "coach"));
    const resolvedTeamId = (prof as any)?.team_id ?? null;
    setCoachTeamId(resolvedTeamId);

    // Fetch sport type for the team (drives sport-aware UI e.g. GPS metrics)
    if (resolvedTeamId) {
      const { data: teamData } = await supabase.from("teams").select("sport, gps_provider, team_type, training_mode_default").eq("id", resolvedTeamId).maybeSingle();
      if (teamData) {
        setTeamSport(String((teamData as any)?.sport ?? "").toLowerCase() || null);
        setTeamType(String((teamData as any)?.team_type ?? "club_team"));
        const gp = String((teamData as any)?.gps_provider ?? "catapult").toLowerCase();
        if (gp === "statsport" || gp === "none") setGpsProvider(gp);
        else setGpsProvider("catapult");
        const tm = String((teamData as any)?.training_mode_default ?? "auto").toLowerCase();
        if (tm === "indoor" || tm === "outdoor" || tm === "auto") setTrainingMode(tm);
      }

      // Catapult data tier — same RPC the sidebar uses. Drives Lite-Mode
      // top-tab gating (hides Quadrant / Indoor / Decel Intel from the
      // EXTERNAL_TABS strip). See migration 20260502170000.
      try {
        const { data: tierData } = await supabase.rpc("get_catapult_data_tier", { p_team_id: resolvedTeamId });
        const tierStr = String(tierData ?? "").toLowerCase();
        setCatapultDataTier(tierStr === "full" ? "full" : "lite");
      } catch { /* keep default 'lite' on error — conservative */ }
    }

    const r = String(role ?? "").toLowerCase();
    console.log("[ensureCoachAccess] role=", r, "teamId=", resolvedTeamId);
    if (r !== "coach" && r !== "admin") {
      console.log("[ensureCoachAccess] rejected, redirecting");
      router.replace(`/login?next=${encodeURIComponent("/coach")}`);
      return null;
    }

    return resolvedTeamId;
  }

  // (handleTeamSwitch removed — team switching now happens via the sidebar
  //  TeamSwitcher in CoachShell, which persists profiles.team_id and reloads.)

  /** -----------------------------
   * Fetch helpers
   * ----------------------------- */
  async function loadPlanPreview(): Promise<PlanPreview | null> {
    try {
      const { data, error } = await supabase.from("v_coach_plan_preview_today").select("*").maybeSingle();
      if (error) {
        console.error("Plan preview error:", error.message);
        setPlanPreview(null);
        return null;
      }
      const row = (data as any) ?? null;
      setPlanPreview(row);
      return row;
    } catch (e) {
      console.error("Plan preview error (catch):", e);
      setPlanPreview(null);
      return null;
    }
  }

  async function loadWeekGrid(entryDate: string): Promise<any[]> {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return [];

      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id, id, user_id")
        .or(`id.eq.${uid},user_id.eq.${uid}`)
        .maybeSingle();

      const teamId =
        (prof as any)?.team_id ??
        (
          await supabase
            .from("coach_teams")
            .select("team_id,is_primary")
            .eq("coach_id", uid)
            .order("is_primary", { ascending: false })
            .limit(1)
        ).data?.[0]?.team_id ??
        null;
      if (!teamId) return [];

      // Primary source: saved Week Setup (coach_week_setup) for the current week.
      const weekStartDate = isoMondayOfISO(entryDate);
      const { data: coachWeekSetup } = await supabase
        .from("coach_week_setup")
        .select("week_start_date, no_match_intents")
        .eq("team_id", teamId)
        .eq("week_start_date", weekStartDate)
        .maybeSingle();

      const intents = Array.isArray((coachWeekSetup as any)?.no_match_intents) ? ((coachWeekSetup as any).no_match_intents as string[]) : null;
      if (intents && intents.length === 7) {
        const derivedGrid = intents.map((intent, idx) => {
          const mapped = mapNoMatchIntentToGrid(intent);
          return {
            day_date: addDaysISO(weekStartDate, idx),
            md_day: null,
            day_type_final: mapped.dayTypeFinal,
            dose_final: mapped.doseFinal,
          };
        });
        setWeekGrid(derivedGrid);
        return derivedGrid;
      }

      // Fallback: legacy week_setups/v_week_plan_grid path.
      const { data: ws } = await supabase
        .from("week_setups")
        .select("id")
        .eq("team_id", teamId)
        .order("week_start", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const weekSetupId = (ws as any)?.id;
      if (!weekSetupId) {
        setWeekGrid([]);
        return [];
      }

      const { data: grid, error } = await supabase
        .from("v_week_plan_grid")
        .select("day_date, md_day, day_type_final, dose_final")
        .eq("week_setup_id", weekSetupId)
        .order("day_date", { ascending: true });

      if (error) {
        console.error("Week grid error:", error.message);
        setWeekGrid([]);
        return [];
      }

      const rows = (grid as any[]) ?? [];
      setWeekGrid(rows);
      return rows;
    } catch (e) {
      console.error("Week grid error (catch):", e);
      setWeekGrid([]);
      return [];
    }
  }

  async function loadTeamIntelligenceToday(teamIdOverride?: string | null) {
    try {
      const effectiveTeamId = teamIdOverride ?? coachTeamId;
      if (!effectiveTeamId) {
        // Without a team_id filter the view returns multiple rows → maybeSingle fails.
        setTeamIntel(null);
        return;
      }
      const { data, error } = await supabase
        .from("v_coach_team_intelligence_today")
        .select("*")
        .eq("team_id", effectiveTeamId)
        .maybeSingle();
      if (error) {
        console.error("Team intel error:", error.message);
        setTeamIntel(null);
        return;
      }
      setTeamIntel((data as any) ?? null);
    } catch (e) {
      console.error("Team intel error (catch):", e);
      setTeamIntel(null);
    }
  }

  async function loadZHistoryForPlayers(entryDate: string, playerIds: string[]): Promise<Record<string, number[]>> {
    if (!playerIds.length) {
      setZHistory({});
      setRecentMonitoringByPlayer({});
      return {};
    }

    const start = new Date(entryDate);
    start.setDate(start.getDate() - 7);
    const startISO = start.toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });

    try {
      const { data, error } = await supabase
        .from("readiness_entries")
        .select(
          "player_id, entry_date, training_modifier, total_score, fatigue_energy, sleep_quality, stress_mood, muscle_soreness"
        )
        .in("player_id", playerIds)
        .gte("entry_date", startISO)
        .lte("entry_date", entryDate)
        .order("entry_date", { ascending: true });

      if (error) throw error;

      const map: Record<string, number[]> = {};
      const monitoringMap: Record<string, VolatilityDailyPoint[]> = {};
      for (const r of (data ?? []) as any[]) {
        const pid = String(r.player_id);
        const date = String(r.entry_date ?? "").slice(0, 10);
        const z = extractZ(r.training_modifier);
        const dz = extractYesterdayZ(r.training_modifier);
        if (z != null) {
          if (!map[pid]) map[pid] = [];
          map[pid].push(z);
        }

        if (!monitoringMap[pid]) monitoringMap[pid] = [];
        monitoringMap[pid].push({
          date,
          checkInScore: toNum(r.total_score),
          zScore: z,
          deltaZ: z != null && dz != null ? z - dz : null,
          soreness: toNum(r.muscle_soreness),
          sleepQuality: toNum(r.sleep_quality),
          mood: toNum(r.stress_mood),
          energy: toNum(r.fatigue_energy),
          stress: toNum(r.stress_mood),
        });
      }

      setZHistory(map);
      setRecentMonitoringByPlayer(monitoringMap);
      return map;
    } catch (e) {
      console.warn("loadZHistoryForPlayers failed:", e);
      setZHistory({});
      setRecentMonitoringByPlayer({});
      return {};
    }
  }

  async function hydrateTrainingModifiers(entryDate: string, list: Row[]): Promise<Row[]> {
    const playerIds = list.map((r) => String(r.player_id));
    if (!playerIds.length) return list;

    try {
      const { data, error } = await supabase
        .from("readiness_entries")
        .select("player_id, entry_date, training_modifier")
        .eq("entry_date", entryDate)
        .in("player_id", playerIds);

      if (error) throw error;

      const tmByPlayer: Record<string, any> = {};
      for (const r of (data ?? []) as any[]) {
        tmByPlayer[String(r.player_id)] = normalizeTrainingModifier(r.training_modifier);
      }

      return list.map((row) => {
        const tm = row.training_modifier ?? tmByPlayer[String(row.player_id)] ?? null;
        const zToday = extractZ(tm);
        const yZ = extractYesterdayZ(tm);
        const dz = zToday != null && yZ != null ? zToday - yZ : null;

        return {
          ...row,
          training_modifier: tm,
          _z_today: zToday,
          _yesterday_z: yZ,
          _dz: dz,
          _sten: zToSten(zToday),
          _baseline_n: extractBaselineN(tm),
        };
      });
    } catch (e) {
      console.warn("hydrateTrainingModifiers failed:", e);
      return list;
    }
  }

  async function hydrateExternalLoad(entryDate: string, list: Row[]): Promise<Row[]> {
    const playerIds = list.map((row) => String(row.player_id));
    if (!playerIds.length) return list;

    try {
      const startDate = addDaysISO(entryDate, -35); // 35 days to ensure full 28-day chronic window

      // Abort after 15 s so a slow RLS policy can't hang the whole page
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const { data, error } = await supabase
        .from("player_external_load_daily")
        .select("player_id, date, total_distance, high_speed_distance, sprint_distance, accelerations, decelerations, player_load, max_velocity, velocity_band5_total_distance, velocity_band6_total_distance, hir_dist, max_vel, accel_b2_3_tot_effs_gen2, tot_as, decel_b2_3_tot_effs_gen2, tot_ds, total_player_load, player_load_per_minute, source")
        .in("source", ["catapult", "manual"])
        .in("player_id", playerIds)
        .gte("date", startDate)
        .lte("date", entryDate)
        .order("date", { ascending: true })
        .abortSignal(controller.signal);

      clearTimeout(timeout);

      if (error) throw error;

      const byPlayer = new Map<string, ExternalLoadDailyRow[]>();
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const playerId = String(row.player_id);
        const listForPlayer = byPlayer.get(playerId) ?? [];
        listForPlayer.push({
          player_id: playerId,
          date: String(row.date),
          total_distance: toMaybeFinite(row.total_distance),
          high_speed_distance: toMaybeFinite(row.high_speed_distance),
          sprint_distance: toMaybeFinite(row.sprint_distance),
          accelerations: toMaybeFinite(row.accelerations),
          decelerations: toMaybeFinite(row.decelerations),
          player_load: toMaybeFinite(row.player_load),
          max_velocity: toMaybeFinite(row.max_velocity),
          velocity_band5_total_distance: toMaybeFinite(row.velocity_band5_total_distance),
          velocity_band6_total_distance: toMaybeFinite(row.velocity_band6_total_distance),
          hir_dist: toMaybeFinite(row.hir_dist),
          max_vel: toMaybeFinite(row.max_vel),
          accel_b2_3_tot_effs_gen2: toMaybeFinite(row.accel_b2_3_tot_effs_gen2),
          tot_as: toMaybeFinite(row.tot_as),
          decel_b2_3_tot_effs_gen2: toMaybeFinite(row.decel_b2_3_tot_effs_gen2),
          tot_ds: toMaybeFinite(row.tot_ds),
          total_player_load: toMaybeFinite(row.total_player_load),
          player_load_per_minute: toMaybeFinite(row.player_load_per_minute),
          source: (row.source as string | null) ?? null,
        });
        byPlayer.set(playerId, listForPlayer);
      }

      return list.map((row) => {
        const playerRows = byPlayer.get(String(row.player_id)) ?? [];
        const externalLoad = summarizeExternalLoad(playerRows, entryDate);
        const catapultRows = playerRows
          .map((item) => normalizeCatapultDailyLoadRow(item as unknown as Record<string, unknown>))
          .filter((item): item is NonNullable<typeof item> => item != null);
        const catapultContext = buildCatapultReadinessContextFromRows({
          rows: catapultRows,
          date: entryDate,
        });
        return {
          ...row,
          _external_load_today: externalLoad.today,
          _external_load_baseline: externalLoad.baseline,
          _catapult_baseline: catapultContext.baseline,
          _catapult_signals: catapultContext.signals,
          _catapult_modifier: catapultContext.modifier,
          _catapult_history: catapultRows,
        };
      });
    } catch (e) {
      console.warn("hydrateExternalLoad failed:", e);
      return list;
    }
  }

  /** -----------------------------
   * Auto-lock helpers
   * ----------------------------- */
  function parseSessionStartFromPlanPreview(pp: PlanPreview | null): { hour: number; minute: number } | null {
    try {
      const raw = (pp as any)?.template_structure?.session_start ?? null;
      if (!raw) return null;
      const s = String(raw).trim();
      const m = s.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      const hour = Math.max(0, Math.min(23, Number(m[1])));
      const minute = Math.max(0, Math.min(59, Number(m[2])));
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
      return { hour, minute };
    } catch {
      return null;
    }
  }

  function shouldAutoLockNow(entryDate: string, pp: PlanPreview | null): boolean {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" }) || todayISO();
    if (String(entryDate) !== String(today)) return false;

    const start = parseSessionStartFromPlanPreview(pp) ?? DEFAULT_SESSION_START;

    const now = new Date();
    const year = Number(entryDate.slice(0, 4));
    const month = Number(entryDate.slice(5, 7));
    const day = Number(entryDate.slice(8, 10));

    const sessionStart = new Date(year, month - 1, day, start.hour, start.minute, 0, 0);
    const lockTime = new Date(sessionStart.getTime() - AUTO_LOCK_MINUTES_BEFORE * 60 * 1000);

    return now.getTime() >= lockTime.getTime();
  }

  async function lockAllForTodayIfNeeded(entryDate: string, list: Row[]) {
    if (isAdmin) return;
    if (autoLockRan) return;
    if (!shouldAutoLockNow(entryDate, planPreview)) return;

    const unlocked = list.filter((r) => !r.is_locked).map((r) => String(r.player_id));
    if (unlocked.length === 0) {
      setAutoLockRan(true);
      return;
    }

    try {
      setError("");
      const { error } = await supabase.from("stage4_decisions").update({ locked: true }).eq("entry_date", entryDate).in("player_id", unlocked);
      if (error) throw new Error(error.message);

      setAutoLockRan(true);
      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Auto-lock mistókst.");
      setAutoLockRan(true);
    }
  }

  /** -----------------------------
   * Load Today (core)
   * ----------------------------- */
  async function loadToday(teamIdOverride?: string | null) {
    // Prevent concurrent loadToday calls — the second call would reset loading
    // to true while the first is still running, causing the page to get stuck.
    if (loadTodayRunning.current) {
      console.log("[loadToday] SKIPPED — already running");
      return;
    }
    loadTodayRunning.current = true;
    try {
      setError("");
      setLoading(true);

      const entryDate = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" }) || todayISO();

      console.log("[loadToday] start, entryDate=", entryDate, "teamIdOverride=", teamIdOverride);

      // Ensure Stage4 rows exist (best effort)
      try {
        console.log("[loadToday] stage4_bootstrap...");
        await supabase.rpc("stage4_bootstrap_for_date", { p_date: entryDate });
        console.log("[loadToday] stage4_bootstrap OK");
      } catch (e: any) {
        console.warn("stage4_bootstrap_for_date failed (loadToday, continuing):", e?.message ?? e);
      }

      // md_day context for today (per team). Also pull days_since_prev /
      // days_to_next so the Planned-session-load card can build a
      // microcycle-aware OFF-day paragraph instead of a blank "Day off" line.
      let ctxMd: string | null = null;
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
          const teamId = (prof as any)?.team_id ?? null;
          if (teamId) {
            const { data: ctxRow } = await supabase
              .from("v_training_day_context_team")
              .select("md_day, days_since_prev, days_to_next")
              .eq("team_id", teamId)
              .eq("date", entryDate)
              .maybeSingle();
            ctxMd = (ctxRow as any)?.md_day ?? null;
            setMdContextToday(ctxMd);
            setDaysSincePrevToday(((ctxRow as any)?.days_since_prev as number | null) ?? null);
            setDaysToNextToday(((ctxRow as any)?.days_to_next as number | null) ?? null);
          } else {
            setMdContextToday(null);
            setDaysSincePrevToday(null);
            setDaysToNextToday(null);
          }
        } else {
          setMdContextToday(null);
          setDaysSincePrevToday(null);
          setDaysToNextToday(null);
        }
      } catch {
        setMdContextToday(null);
        setDaysSincePrevToday(null);
        setDaysToNextToday(null);
      }

      // Yesterday's readiness snapshot for the same team. Used by the
      // Daily Briefing attention rows to show day-over-day deltas — coaches
      // care about WHAT CHANGED far more than absolute state. Small payload
      // (one row per player), fired in parallel with the other context
      // fetches above.
      try {
        const y = new Date(entryDate);
        y.setDate(y.getDate() - 1);
        const yesterdayISO = y.toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });

        const effectiveTeamIdForYday = teamIdOverride ?? coachTeamId;
        let yq = supabase
          .from("v_coach_readiness_today_v8")
          .select("player_id, final_color, total_score")
          .eq("entry_date", yesterdayISO);
        if (effectiveTeamIdForYday) yq = yq.eq("team_id", effectiveTeamIdForYday);

        const { data: yData } = await yq;
        const yMap: Record<string, { color: "green" | "yellow" | "red" | null; score: number | null }> = {};
        for (const r of (yData ?? []) as Array<{ player_id?: string; final_color?: string | null; total_score?: number | null }>) {
          const pid = String(r.player_id ?? "");
          if (!pid) continue;
          const c = String(r.final_color ?? "").toLowerCase();
          yMap[pid] = {
            color: c === "green" || c === "yellow" || c === "red" ? c : null,
            score: typeof r.total_score === "number" ? r.total_score : null,
          };
        }
        setYesterdayDeltas(yMap);
      } catch {
        setYesterdayDeltas({});
      }

      console.log("[loadToday] team intel...");
      // Team intelligence + plan preview + grid
      await loadTeamIntelligenceToday(teamIdOverride);
      console.log("[loadToday] plan preview...");
      const pp = await loadPlanPreview();
      console.log("[loadToday] week grid...");
      const grid = await loadWeekGrid(entryDate);
      console.log("[loadToday] grid done, querying readiness...");

      // Auto-set OFF for yesterday (UI only)
      try {
        const y = new Date(entryDate);
        y.setDate(y.getDate() - 1);
        const yesterdayISO = y.toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });
        const yRow = (grid ?? []).find((x: any) => dateKey(x.day_date) === dateKey(yesterdayISO)) ?? null;
        const yDose = String(yRow?.dose_final ?? yRow?.day_type_final ?? "").toUpperCase();
        if (yDose === "OFF") {
          setCtxIntensity("OFF");
          setCtxHsr("0");
          setCtxAcc("0");
          setCtxDec("0");
          setCtxDist("0");
          setCtxVmax("0");
          setCtxDuration("0");
        }
      } catch {
        // ignore
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("v_coach_readiness_today_v8")
        .select("*", { count: "exact" })
        .eq("entry_date", entryDate)
        .order("total_score", { ascending: true })
        .order("full_name", { ascending: true })
        .range(from, to);

      // Always filter by team — use coachTeamId (UUID) via team_id column
      const effectiveTeamId = teamIdOverride ?? coachTeamId;
      if (effectiveTeamId) q = q.eq("team_id", effectiveTeamId);
      else if (teamFilter && teamFilter !== "all") q = q.eq("team", teamFilter);
      if (filter !== "all") q = q.eq("final_color", filter);
      if (search.trim().length > 0) q = q.ilike("full_name", `%${search.trim()}%`);

      const { data, error, count } = await q;
      console.log("[loadToday] readiness query done, rows=", data?.length ?? 0, "error=", error?.message ?? "none");
      if (error) {
        setError(error.message);
        setRows([]);
        setTotal(0);
        return;
      }

      // Team readiness signal
      try {
        let teamIdForSignal: string | null = null;
        if (teamFilter && teamFilter !== "all") {
          teamIdForSignal = teamFilter;
        } else {
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth?.user?.id;
          if (uid) {
            const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
            teamIdForSignal = (prof as any)?.team_id ?? null;
          }
        }

        if (teamIdForSignal) {
          const { data: signal } = await supabase
            .from("v_team_readiness_today")
            .select("*")
            .eq("team_id", teamIdForSignal)
            .eq("entry_date", entryDate)
            .maybeSingle();
          setTeamSignal((signal as TeamSignal) ?? null);
        } else {
          setTeamSignal(null);
        }
      } catch {
        setTeamSignal(null);
      }

      // Unit alerts
      try {
        const teamId =
          teamFilter && teamFilter !== "all"
            ? teamFilter
            : (
                await supabase
                  .from("profiles")
                  .select("team_id")
                  .eq("id", (await supabase.auth.getUser()).data?.user?.id ?? "")
                  .maybeSingle()
              ).data?.team_id ?? null;

        if (teamId) {
          const { data: ua } = await supabase
            .from("v_team_unit_alerts_today")
            .select("*")
            .eq("team_id", teamId)
            .eq("entry_date", entryDate)
            .order("unit_order", { ascending: true });
          setUnitAlerts(ua ?? []);
        } else {
          setUnitAlerts([]);
        }
      } catch {
        setUnitAlerts([]);
      }

      const raw: any[] = (data ?? []) as any[];

      // Team-level MD truth
      const gridRowToday = (grid ?? []).find((x: any) => dateKey(x.day_date) === dateKey(entryDate)) ?? null;
      const weekSetupDoseToday = String(gridRowToday?.dose_final ?? "").trim() || null;
      const weekSetupDayTypeToday = String(gridRowToday?.day_type_final ?? "").trim() || null;
      const weekSetupMdDay = resolveSessionMdContextFromSources({
        weekSetupDay: gridRowToday,
      }).mdContext;
      const teamMdDay =
        (weekSetupMdDay !== "UNKNOWN" ? weekSetupMdDay : null) ??
        (isValidMdToken(ctxMd) ? String(ctxMd).toUpperCase() : null) ??
        (isValidMdToken(gridRowToday?.md_day) ? String(gridRowToday.md_day).toUpperCase() : null) ??
        (isValidMdToken(pp?.md_day) ? String(pp?.md_day).toUpperCase() : null) ??
        null;

      const list: Row[] = raw.map((r) => {
        const playerId = String(r.player_id);
        const entryId: string | null = (r.readiness_entry_id ?? null) as string | null;

        const baseColor = (String(r.final_color ?? "").toLowerCase() as FinalColor) || null;
        const baseFlag = (String(r.final_flag ?? "").toUpperCase() as FinalFlag) || null;
        const baseReason = (r.final_reason ?? null) as string | null;

        let finalColor: FinalColor = (baseColor ?? "green") as FinalColor;
        let finalFlag: FinalFlag = (baseFlag ?? "GREEN") as FinalFlag;
        let finalReason: string | null = baseReason ?? null;

        const hasDbFinal = !!baseFlag && !!baseColor;
        if (!hasDbFinal) {
          // applySorenessDowngrade expects the NEW scale (1=very sore, 5=fine)
          // and triggers downgrade at <=2. Previously was passed legacy
          // r.soreness (5=very sore, 1=fine) — INVERTED scale, so it
          // downgraded fresh players and ignored sore ones. Fixed 2026-04-29.
          const downgraded = applySorenessDowngrade({
            flag: baseFlag,
            color: baseColor,
            reason: baseReason,
            soreness: (r as any).muscle_soreness ?? null,
          });

          finalColor = (downgraded.final_color ?? finalColor) as FinalColor;
          finalFlag = (downgraded.final_flag ?? finalFlag) as FinalFlag;
          finalReason = downgraded.final_reason ?? finalReason;
        }

        const plannedFocus = r.planned_focus ?? weekSetupDoseToday ?? weekSetupDayTypeToday ?? null;
        const perPlayerMdRaw = mdFromPlannedFocus(plannedFocus);
        const perPlayerMd = isValidMdToken(perPlayerMdRaw) ? perPlayerMdRaw : null;

        const viewMdRaw = (r.md_day ?? null) as string | null;
        const viewMd = isValidMdToken(viewMdRaw) ? viewMdRaw : null;

        const tm = normalizeTrainingModifier((r as any).training_modifier ?? null);

        const zToday = extractZ(tm);
        const yZ = extractYesterdayZ(tm);
        const dz = zToday != null && yZ != null ? zToday - yZ : null;
        const sten = zToSten(zToday);

        return {
          readiness_entry_id: entryId,
          entry_date: String(r.entry_date ?? entryDate).trim() || entryDate,
          created_at: String(r.created_at),

          player_id: playerId,
          full_name: String(r.full_name ?? ""),
          team: r.team ?? null,
          position: r.position ?? null,
          team_id: (r as any).team_id ?? null,

          // LEGACY fields kept for back-compat with normSor / display code.
          // Legacy `soreness` is on a 1-5 scale where 5=very sore (high=bad),
          // matching what normSor expects ((5-v)/4*100 = badness%).
          // Legacy `readiness` is 1-10, `sleep` is 0-2. The DB trigger keeps
          // these populated from the modern 6-step columns, so display paths
          // continue to work. NEVER pass these into decision rules that expect
          // the new 1-5 (5=best) scale — see the buildPerformanceIntelligenceDecision
          // and applySorenessDowngrade fixes above for examples of correct flow.
          readiness: r.readiness ?? null,
          sleep: r.sleep ?? null,
          soreness: r.soreness ?? null,
          fatigue_energy: (r as any).fatigue_energy ?? null,
          sleep_quality: (r as any).sleep_quality ?? null,
          sleep_duration: (r as any).sleep_duration ?? null,
          stress_mood: (r as any).stress_mood ?? null,
          muscle_soreness: (r as any).muscle_soreness ?? null,
          total_score: r.total_score ?? null,
          notes: r.notes ?? null,
          sore_areas: Array.isArray((r as any).sore_areas) ? (r as any).sore_areas : null,

          planned_focus: plannedFocus,
          planned_day_type: r.planned_day_type ?? weekSetupDayTypeToday ?? null,

          training_action: (r.final_decision ?? "FULL") as TrainingAction,
          coach_message: (r.coach_note ?? null) as string | null,
          is_locked: !!(r.locked ?? false),

          final_color: finalColor,
          final_flag: finalFlag,
          final_reason: finalReason,

          md_day: viewMd ?? perPlayerMd ?? teamMdDay ?? "—",

          system_decision: (r.system_decision ?? null) as TrainingAction | null,
          coach_decision: (r.coach_decision ?? null) as TrainingAction | null,
          final_decision: (r.final_decision ?? null) as TrainingAction | null,
          final_source: (r.final_source ?? null) as string | null,
          stage4_updated_at: (r.stage4_updated_at ?? null) as string | null,

          ui_key: `${playerId}_${String(r.entry_date ?? entryDate)}`,

          training_modifier: tm,
          _z_today: zToday,
          _yesterday_z: yZ,
          _dz: dz,
          _sten: sten,
          _spark: null,
          _baseline_n: extractBaselineN(tm),
        };
      });

      list.sort((a: any, b: any) => {
        const as = a.total_score ?? 9999;
        const bs = b.total_score ?? 9999;
        if (as !== bs) return as - bs;

        const ar = flagRank(a.final_flag);
        const br = flagRank(b.final_flag);
        if (ar !== br) return ar - br;

        return String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""));
      });

      // hydrate training_modifier (z/sten)
      const hydrated = await hydrateTrainingModifiers(entryDate, list);

      // attach sparkline
      const playerIds = hydrated.map((x) => String(x.player_id));
      const hist = await loadZHistoryForPlayers(entryDate, playerIds);

      const withSpark: Row[] = hydrated.map((x) => {
        const series = hist[String(x.player_id)] ?? [];
        const last7 = series.slice(-7);
        return {
          ...x,
          _spark: last7.length >= 3 ? sparkline(last7) : null,
        };
      });

      // Set rows immediately WITHOUT external load so the dashboard renders fast.
      // External load data is hydrated in the background (non-blocking).
      setRows(withSpark);
      setTotal(count ?? 0);

      setDraftAction(() => {
        const next: Record<string, TrainingAction> = {};
        for (const r of withSpark) {
          const pid = String(r.player_id);
          next[pid] = (r.training_action ?? "FULL") as TrainingAction;
        }
        return next;
      });

      setDraftMessage(() => {
        const next: Record<string, string> = {};
        for (const r of withSpark) {
          const pid = String(r.player_id);
          next[pid] = r.coach_message ?? "";
        }
        return next;
      });

      setSaved({});
      await lockAllForTodayIfNeeded(entryDate, withSpark);

      // Fire-and-forget: hydrate external load in background, update rows when done.
      // Uses AbortController with 15 s timeout so a slow RLS policy can't hang forever.
      hydrateExternalLoad(entryDate, withSpark)
        .then((withExternalLoad) => {
          setRows(withExternalLoad);
        })
        .catch(() => {
          // already logged inside hydrateExternalLoad
        });
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
      loadTodayRunning.current = false;
    }
  }

  /** -----------------------------
   * Stage4 actions
   * ----------------------------- */
  async function saveConfirmed(r: Row) {
    if (r.is_locked && !isAdmin) return;

    const playerId = String(r.player_id);
    const action = draftAction[playerId] ?? r.training_action ?? "FULL";
    const message = (draftMessage[playerId] ?? r.coach_message ?? "").trim();
    const entryDate = r.entry_date && String(r.entry_date).trim().length > 0 ? String(r.entry_date).trim() : todayISO();
    const systemDecision = flagToAction(r.final_flag ?? (r.final_color ? String(r.final_color).toUpperCase() : null));

    setSaving((p) => ({ ...p, [playerId]: true }));
    setSaved((p) => ({ ...p, [playerId]: false }));
    setError("");

    try {
      const payload: any = {
        player_id: playerId,
        team_id: r.team_id ?? coachTeamId ?? null,
        entry_date: entryDate,
        system_decision: systemDecision,
        coach_decision: action,
        final_decision: action,
        final_source: action !== systemDecision ? "COACH_OVERRIDE" : "SYSTEM",
        coach_note: message.length ? message : null,
        locked: false,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from("stage4_decisions").upsert(payload, {
        onConflict: "player_id,entry_date",
      });
      if (upErr) throw new Error(`Save failed: ${upErr.message}`);

      // keep your existing behavior
      const { error: lockErr } = await supabase.rpc("coach_override_microdose_plan", {
        p_player_id: playerId,
        p_entry_date: entryDate,
        p_variant_id: null,
        p_source: "COACH",
      });
      if (lockErr) console.warn("coach_override_microdose_plan failed:", lockErr.message);

      setSaved((p) => ({ ...p, [playerId]: true }));
      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Save mistókst.");
    } finally {
      setSaving((p) => ({ ...p, [playerId]: false }));
    }
  }

  async function lockForDay(r: Row) {
    if (r.is_locked) return;

    const playerId = String(r.player_id);
    const action = draftAction[playerId] ?? r.training_action ?? "FULL";
    const message = (draftMessage[playerId] ?? r.coach_message ?? "").trim();
    const entryDate = r.entry_date && String(r.entry_date).trim().length > 0 ? String(r.entry_date).trim() : todayISO();
    const systemDecision = flagToAction(r.final_flag ?? (r.final_color ? String(r.final_color).toUpperCase() : null));

    setSaving((p) => ({ ...p, [playerId]: true }));
    setError("");

    try {
      const payload: any = {
        player_id: playerId,
        team_id: r.team_id ?? coachTeamId ?? null,
        entry_date: entryDate,
        system_decision: systemDecision,
        coach_decision: action,
        final_decision: action,
        final_source: action !== systemDecision ? "COACH_OVERRIDE" : "SYSTEM",
        coach_note: message.length ? message : null,
        locked: true,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from("stage4_decisions").upsert(payload, {
        onConflict: "player_id,entry_date",
      });
      if (upErr) throw new Error(`Lock failed: ${upErr.message}`);

      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Lock mistókst.");
    } finally {
      setSaving((p) => ({ ...p, [playerId]: false }));
    }
  }

  async function unlockForDay(r: Row) {
    if (!isAdmin) return;
    if (!r.is_locked) return;

    const playerId = String(r.player_id);
    const entryDate = r.entry_date && String(r.entry_date).trim().length > 0 ? String(r.entry_date).trim() : todayISO();

    setSaving((p) => ({ ...p, [playerId]: true }));
    setError("");

    try {
      const { error } = await supabase
        .from("stage4_decisions")
        .update({ locked: false, updated_at: new Date().toISOString() })
        .eq("player_id", playerId)
        .eq("entry_date", entryDate);

      if (error) throw new Error(`Unlock failed: ${error.message}`);
      await loadToday();
    } catch (e: any) {
      setError(e?.message ?? "Unlock mistókst.");
    } finally {
      setSaving((p) => ({ ...p, [playerId]: false }));
    }
  }

  async function generateTodayDecisionsForTeam() {
    try {
      setGenToast("");
      setError("");
      setGenLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Ekki innskráður.");

      const { data: prof, error: pErr } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      if (pErr) throw new Error(pErr.message);

      const teamId = (prof as any)?.team_id ?? null;
      if (!teamId) throw new Error("Vantar team_id á profile.");

      const day = todayISO();

      const { data, error } = await supabase.rpc("stage4_generate_today_decisions", {
        p_team_id: teamId,
        p_entry_date: day,
      });

      if (error) throw new Error(error.message);

      const row = Array.isArray(data) ? data[0] : data;
      const processed = row?.processed ?? "?";
      const inserted = row?.inserted ?? "?";
      const updated = row?.updated ?? "?";

      setGenToast(`✅ Decisions generated: processed ${processed} · inserted ${inserted} · updated ${updated}`);
      await loadToday();
    } catch (e: any) {
      setGenToast("");
      setError(e?.message ?? "Generate decisions mistókst.");
    } finally {
      setGenLoading(false);
    }
  }

  async function saveAllDirty() {
    setSaveAllToast("");
    setError("");
    setSaveAllLoading(true);

    // Find all unlocked rows where draftAction differs from the last saved value
    const dirty = rows.filter((r) => {
      if (r.is_locked && !isAdmin) return false;
      const pid = String(r.player_id);
      const draft = draftAction[pid];
      const saved = (r.training_action ?? "FULL") as TrainingAction;
      return draft != null && draft !== saved;
    });

    let successCount = 0;
    let failCount = 0;

    for (const r of dirty) {
      try {
        await saveConfirmed(r);
        successCount++;
      } catch {
        failCount++;
      }
    }

    setSaveAllLoading(false);
    if (failCount === 0) {
      setSaveAllToast(`✅ ${successCount} leikmann${successCount === 1 ? "ur" : "ar"} vistaðir`);
    } else {
      setSaveAllToast(`⚠️ ${successCount} vistuð, ${failCount} misheppnuð`);
    }
    setTimeout(() => setSaveAllToast(""), 4000);
  }

  async function assignTemplate(playerId: string, entryDate: string, templateId: string, teamId?: string | null) {
    const { error } = await supabase
      .from("player_template_assignments")
      .upsert(
        {
          player_id: playerId,
          entry_date: entryDate,
          template_id: templateId,
          team_id: teamId ?? null,
        },
        { onConflict: "player_id,entry_date" }
      );

    if (error) {
      console.error(error);
      alert("Tókst ekki að úthluta template.");
    }
  }

  /** -----------------------------
   * Effects
   * ----------------------------- */
  useEffect(() => {
    // Safety net: if loading is still true after 20 s, force it off so the
    // coach can at least see the (empty) dashboard shell and switch tabs.
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.error("[loadToday] SAFETY TIMEOUT — forcing loading=false after 20 s");
        return false;
      });
    }, 20_000);

    (async () => {
      try {
        setLoading(true);
        const teamId = await ensureCoachAccess();
        if (!teamId) return;
        // Mark BEFORE loadToday so the dependency effect (which fires when
        // coachVerified/coachTeamId change) knows the mount effect owns the
        // initial load and skips its own call.
        initialLoadDone.current = true;
        setCoachVerified(true);
        await loadToday(teamId);
      } finally {
        setLoading(false);
        clearTimeout(safetyTimer);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load yesterday context once teamId known
  useEffect(() => {
    if (!coachVerified) return;
    if (!coachTeamId) return;
    const entryDate = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" }) || todayISO();
    loadYesterdayContext(coachTeamId, entryDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachVerified, coachTeamId]);

  // Is the team on a declared break today? Drives the "On break" command-center
  // state so the coach Today reads coherently instead of "rest day · 28 ready".
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!coachTeamId) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/coach/team/breaks?team_id=${encodeURIComponent(coachTeamId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (!alive || !json.ok) return;
        const today = new Date().toISOString().slice(0, 10);
        const cur = ((json.breaks ?? []) as Array<{ start_date: string; end_date: string; label: string | null }>)
          .find((b) => b.start_date <= today && today <= b.end_date) ?? null;
        if (cur) {
          const total = Math.round((new Date(cur.end_date).getTime() - new Date(cur.start_date).getTime()) / 86_400_000) + 1;
          const day = Math.round((new Date(today).getTime() - new Date(cur.start_date).getTime()) / 86_400_000) + 1;
          setBreakToday({ label: cur.label, day, total });
        } else {
          setBreakToday(null);
        }
      } catch { /* soft */ }
    })();
    return () => { alive = false; };
  }, [coachTeamId]);

  useEffect(() => {
    if (!coachVerified) return;
    loadReminderStatus(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachVerified, today]);

  // ── Match minutes (last 3 days) per player ────────────────────────────
  // Powers the MD+1 hard-recovery guardrail in DecisionSummaryCard:
  // 60+ min played in yesterday's match → today's verdict force-mapped to
  // RECOVERY, regardless of how the load engine reads.
  useEffect(() => {
    if (!coachVerified) return;
    let alive = true;
    (async () => {
      try {
        const headers = await getCoachAuthHeaders();
        const res = await fetch(
          `/api/coach/team/match-minutes?date=${encodeURIComponent(today)}`,
          { headers },
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok: boolean;
          byPlayer: Record<string, { minutes_played: number; match_date: string }>;
        };
        if (alive && json?.byPlayer) setPlayerMatchMinutes(json.byPlayer);
      } catch {
        // Silently ignore — guardrail simply won't trigger when data is missing.
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachVerified, today]);

  // ── Team's planned day type for today (week_plans.day_type) ───────────
  // When OFF, the Decision Summary modal swaps its verdict to "OFF day"
  // instead of falsely asserting a load or wellness verdict for a day
  // where no session is scheduled. Wellness check-ins are still captured
  // and feed the trend; only the headline changes.
  useEffect(() => {
    if (!coachVerified || !coachTeamId) {
      setTeamDayType(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("week_plans")
          .select("day_type")
          .eq("team_id", coachTeamId)
          .eq("day_date", today)
          .maybeSingle();
        if (!alive) return;
        if (error) return;
        const dt = data?.day_type as string | null | undefined;
        setTeamDayType(dt ? String(dt).toUpperCase() : null);
      } catch {
        // Silently ignore — verdict simply won't switch to OFF_DAY.
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachVerified, coachTeamId, today]);

  // ── Bulk high-tier CoD asymmetry per player (last 14d) ────────────────
  // Single query returns Left/Right high-intensity CoD totals for every
  // player on the team. We compute the asymmetry % client-side and only
  // store ones ≥ 15% (Bishop 2020 concern threshold) — the chronic-risk
  // chip in DecisionSummaryCard renders only when this map has the player.
  useEffect(() => {
    if (!coachVerified || !coachTeamId) {
      setPlayerCodHighAsym({});
      return;
    }
    let alive = true;
    (async () => {
      try {
        const start = new Date();
        start.setDate(start.getDate() - 13);
        const startIso = start.toISOString().slice(0, 10);

        // Pull team players first (we filter the load table by player_id
        // explicitly — RLS may already do this but being explicit keeps
        // the result tight when the dashboard is in admin pilot-mode).
        const { data: pl } = await supabase
          .from("players")
          .select("id")
          .eq("team_id", coachTeamId)
          .eq("is_active", true);
        if (!alive) return;
        const playerIds = ((pl ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (playerIds.length === 0) {
          setPlayerCodHighAsym({});
          return;
        }

        const { data: rows } = await supabase
          .from("player_external_load_daily")
          .select("player_id, ima_cod_left_high, ima_cod_right_high")
          .in("player_id", playerIds)
          .eq("source", "catapult")
          .gte("date", startIso)
          .lte("date", today);
        if (!alive) return;

        const totals = new Map<string, { left: number; right: number }>();
        for (const r of (rows ?? []) as Array<{
          player_id: string;
          ima_cod_left_high: number | null;
          ima_cod_right_high: number | null;
        }>) {
          const cur = totals.get(r.player_id) ?? { left: 0, right: 0 };
          cur.left += Number(r.ima_cod_left_high ?? 0) || 0;
          cur.right += Number(r.ima_cod_right_high ?? 0) || 0;
          totals.set(r.player_id, cur);
        }

        const out: Record<string, number> = {};
        for (const [pid, { left, right }] of totals) {
          const max = Math.max(left, right);
          if (max <= 0) continue;
          const pct = (Math.abs(left - right) / max) * 100;
          // Only store ≥ 15% (concern + high zones) so the chip renders
          // only when actionable — keeps memory tidy and logic simple.
          if (pct >= 15) out[pid] = Number(pct.toFixed(1));
        }
        if (alive) setPlayerCodHighAsym(out);
      } catch {
        // Silently ignore — chronic-risk chip simply won't render.
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachVerified, coachTeamId, today]);

  // ── Bulk Sprint Speed Drop per player (today vs personal top-3 mean 28d) ──
  // Computes the same logic as src/lib/micropulse/sprintSpeedDrop/index.ts
  // but inline against the team-batched query, so we make one round-trip
  // for the whole squad. We coalesce max_velocity and max_vel (API sync vs
  // CSV upload write to different columns historically) and gate by HSR ≥
  // SPRINT_HSR_FLOOR — players who didn't sprint today aren't "suppressed".
  // Only stored when drop ≥ 3% (above session-to-session noise; Buchheit 2014).
  useEffect(() => {
    if (!coachVerified || !coachTeamId) {
      setPlayerSprintDrop({});
      return;
    }
    let alive = true;
    (async () => {
      try {
        const start = new Date(`${today}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() - 27);
        const startIso = start.toISOString().slice(0, 10);

        const { data: pl } = await supabase
          .from("players")
          .select("id")
          .eq("team_id", coachTeamId)
          .eq("is_active", true);
        if (!alive) return;
        const playerIds = ((pl ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (playerIds.length === 0) {
          setPlayerSprintDrop({});
          return;
        }

        const { data: rows } = await supabase
          .from("player_external_load_daily")
          .select("player_id, date, max_velocity, max_vel, high_speed_distance")
          .in("player_id", playerIds)
          .eq("source", "catapult")
          .gte("date", startIso)
          .lte("date", today);
        if (!alive) return;

        const HSR_FLOOR_M = 200;
        const MIN_REF = 4;
        const TOP_N = 3;

        const byPlayer = new Map<string, Array<{ date: string; mv: number; hsr: number }>>();
        for (const id of playerIds) byPlayer.set(id, []);
        for (const r of (rows ?? []) as Array<{
          player_id: string;
          date: string;
          max_velocity: number | null;
          max_vel: number | null;
          high_speed_distance: number | null;
        }>) {
          const a = typeof r.max_velocity === "number" && Number.isFinite(r.max_velocity) ? r.max_velocity : null;
          const b = typeof r.max_vel === "number" && Number.isFinite(r.max_vel) ? r.max_vel : null;
          const mv = a != null && b != null ? Math.max(a, b) : (a ?? b);
          const hsr = typeof r.high_speed_distance === "number" && Number.isFinite(r.high_speed_distance)
            ? r.high_speed_distance : null;
          if (mv == null || hsr == null) continue;
          if (mv <= 0 || hsr < HSR_FLOOR_M) continue;
          const arr = byPlayer.get(r.player_id);
          if (arr) arr.push({ date: r.date, mv, hsr });
        }

        const out: Record<string, { dropPct: number; todayKmh: number; refKmh: number }> = {};
        for (const [pid, sessions] of byPlayer) {
          const todayRow = sessions.find((s) => s.date === today);
          if (!todayRow) continue; // no HSR-meaningful session today → no drop to report
          const refCandidates = sessions
            .filter((s) => s.date !== today)
            .map((s) => s.mv)
            .sort((a, b) => b - a);
          if (refCandidates.length < MIN_REF) continue;
          const topN = refCandidates.slice(0, TOP_N);
          const ref = topN.reduce((s, x) => s + x, 0) / topN.length;
          const dropPct = ((ref - todayRow.mv) / ref) * 100;
          if (dropPct < 3) continue; // sub-3% is normal noise
          out[pid] = {
            dropPct: Number(dropPct.toFixed(1)),
            todayKmh: Number((todayRow.mv * 3.6).toFixed(1)),
            refKmh: Number((ref * 3.6).toFixed(1)),
          };
        }
        if (alive) setPlayerSprintDrop(out);
      } catch {
        // Silently ignore — sprint-drop chip simply won't render.
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachVerified, coachTeamId, today]);

  // ── Bulk Sprint Exposure per player (Malone 2018 — volume-side) ──────
  // Companion to Sprint Speed Drop above. Pulls last 28 days of IMA bands
  // 5-8 stride counts + a UNION of week_plans (GAME day_type) and
  // match_player_minutes (≥30 min) to flag match days, then runs the pure
  // computeSprintExposure() per player. Using week_plans as the primary
  // source catches matches that aren't fully logged in match_player_minutes
  // (the original ≥60-min filter was missing real games and creating the
  // "single-match low-confidence" spike for every player).
  useEffect(() => {
    if (!coachVerified || !coachTeamId) {
      setPlayerSprintExposure({});
      return;
    }
    let alive = true;
    (async () => {
      try {
        const start = new Date(`${today}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() - 27);
        const startIso = start.toISOString().slice(0, 10);

        const { data: pl } = await supabase
          .from("players")
          .select("id")
          .eq("team_id", coachTeamId)
          .eq("is_active", true);
        if (!alive) return;
        const playerIds = ((pl ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (playerIds.length === 0) {
          setPlayerSprintExposure({});
          return;
        }

        // Bands 5-8 daily stride counts + GPS V5/V6 sprint-effort counts.
        // GPS efforts serve as a fallback proxy on match days where IMA
        // Free Running wasn't captured (older Catapult activities before
        // they fixed the config). See loader.ts for full calibration logic.
        const { data: rows } = await supabase
          .from("player_external_load_daily")
          .select(
            "player_id, date, ima_fr_band5_stride_count, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, velocity_band5_total_efforts_gen2, velocity_band6_total_efforts_gen2"
          )
          .in("player_id", playerIds)
          .eq("source", "catapult")
          .gte("date", startIso)
          .lte("date", today);
        if (!alive) return;

        // Match days — UNION of (a) team week_plans GAME days and (b) per-
        // player match_player_minutes ≥30 min. week_plans is the authoritative
        // schedule source; minutes is a secondary signal for clubs that log
        // appearances. Both contribute to the same matchDaysByPlayer map.
        const matchDaysByPlayer = new Map<string, Set<string>>();

        // (a) Team-level GAME days from week_plans — apply to every player
        const teamGameDays = new Set<string>();
        try {
          const { data: wp } = await supabase
            .from("week_plans")
            .select("day_date, day_type")
            .eq("team_id", coachTeamId)
            .gte("day_date", startIso)
            .lte("day_date", today);
          for (const r of (wp ?? []) as Array<{ day_date: string; day_type: string | null }>) {
            const dt = String(r.day_type ?? "").toUpperCase();
            if (dt === "GAME" || dt === "MATCH") teamGameDays.add(r.day_date);
          }
        } catch {
          /* week_plans optional on some setups */
        }
        if (teamGameDays.size > 0) {
          for (const pid of playerIds) {
            matchDaysByPlayer.set(pid, new Set(teamGameDays));
          }
        }

        // (b) Per-player appearances (lowered to ≥30 min — partial games still
        // represent real sprint exposure)
        try {
          const { data: mm } = await supabase
            .from("match_player_minutes")
            .select("player_id, match_date, minutes_played")
            .in("player_id", playerIds)
            .gte("match_date", startIso)
            .lte("match_date", today)
            .gte("minutes_played", 30);
          for (const r of (mm ?? []) as Array<{
            player_id: string; match_date: string;
          }>) {
            if (!matchDaysByPlayer.has(r.player_id)) matchDaysByPlayer.set(r.player_id, new Set());
            matchDaysByPlayer.get(r.player_id)!.add(r.match_date);
          }
        } catch {
          /* table optional on some tiers — proceed without match-day data */
        }

        // Phase 1: shape raw per-player per-date facts (IMA strides + GPS
        // V5+V6 sprint-effort counts). We need both before we can compute
        // the per-player calibration ratio in Phase 2.
        type RawRow = {
          date: string;
          imaSum: number;
          v5v6Efforts: number;
          isMatchDay: boolean;
          isScheduledGame: boolean;
        };
        const rawByPlayer = new Map<string, Map<string, RawRow>>();
        for (const id of playerIds) rawByPlayer.set(id, new Map());
        for (const r of (rows ?? []) as Array<{
          player_id: string;
          date: string;
          ima_fr_band5_stride_count: number | null;
          ima_fr_band6_stride_count: number | null;
          ima_fr_band7_stride_count: number | null;
          ima_fr_band8_stride_count: number | null;
          velocity_band5_total_efforts_gen2: number | null;
          velocity_band6_total_efforts_gen2: number | null;
        }>) {
          const b5 = Number(r.ima_fr_band5_stride_count ?? 0) || 0;
          const b6 = Number(r.ima_fr_band6_stride_count ?? 0) || 0;
          const b7 = Number(r.ima_fr_band7_stride_count ?? 0) || 0;
          const b8 = Number(r.ima_fr_band8_stride_count ?? 0) || 0;
          const v5e = Number(r.velocity_band5_total_efforts_gen2 ?? 0) || 0;
          const v6e = Number(r.velocity_band6_total_efforts_gen2 ?? 0) || 0;
          const playerMatchDays = matchDaysByPlayer.get(r.player_id);
          const map = rawByPlayer.get(r.player_id);
          if (!map) continue;
          map.set(r.date, {
            date: r.date,
            imaSum: b5 + b6 + b7 + b8,
            v5v6Efforts: v5e + v6e,
            isMatchDay: playerMatchDays?.has(r.date) ?? false,
            isScheduledGame: teamGameDays.has(r.date),
          });
        }
        // Inject scheduled game days that produced no row at all
        for (const [, map] of rawByPlayer) {
          for (const d of teamGameDays) {
            if (!map.has(d)) {
              map.set(d, {
                date: d,
                imaSum: 0,
                v5v6Efforts: 0,
                isMatchDay: true,
                isScheduledGame: true,
              });
            }
          }
        }

        // Phase 2: per-player calibration + GPS-fallback estimation.
        // For each player, find match days where both IMA and GPS efforts
        // are present, derive their personal strides-per-effort ratio,
        // and estimate IMA on match days where only GPS is available.
        const out: Record<string, {
          band: "UNDERLOAD" | "WATCH" | "SAFE" | "OVERLOAD" | "INSUFFICIENT_DATA";
          ratio: number | null;
          matchDaysObserved: number;
          matchDaysMeasured: number;
          matchDaysEstimated: number;
          matchDaysScheduled: number;
        }> = {};
        for (const [pid, rawMap] of rawByPlayer) {
          if (rawMap.size === 0) continue;
          const rawArr = Array.from(rawMap.values());
          // Calibrate from this player's own IMA-complete match days
          const calDays = rawArr.filter(
            (r) => r.isMatchDay && r.imaSum > 0 && r.v5v6Efforts > 0,
          );
          let imaPerEffort: number | null = null;
          if (calDays.length > 0) {
            const totIma = calDays.reduce((s, r) => s + r.imaSum, 0);
            const totEff = calDays.reduce((s, r) => s + r.v5v6Efforts, 0);
            if (totEff > 0) imaPerEffort = totIma / totEff;
          }
          // Build final rows with GPS-derived match-day estimates
          const daily: DailySprintExposure[] = rawArr
            .map<DailySprintExposure>((r) => {
              if (r.imaSum > 0) {
                return {
                  date: r.date,
                  hiBandStrides: r.imaSum,
                  isMatchDay: r.isMatchDay,
                  isScheduledGame: r.isScheduledGame,
                  hiBandStridesEstimated: false,
                };
              }
              if (
                r.isMatchDay &&
                r.v5v6Efforts > 0 &&
                imaPerEffort != null &&
                imaPerEffort > 0
              ) {
                return {
                  date: r.date,
                  hiBandStrides: Math.round(r.v5v6Efforts * imaPerEffort),
                  isMatchDay: true,
                  isScheduledGame: r.isScheduledGame,
                  hiBandStridesEstimated: true,
                };
              }
              return {
                date: r.date,
                hiBandStrides: null,
                isMatchDay: r.isMatchDay,
                isScheduledGame: r.isScheduledGame,
                hiBandStridesEstimated: false,
              };
            })
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
          const payload = computeSprintExposure(daily, today);
          out[pid] = {
            band: payload.band,
            ratio: payload.exposureRatio,
            matchDaysObserved: payload.matchDaysObserved,
            matchDaysMeasured: payload.matchDaysMeasured,
            matchDaysEstimated: payload.matchDaysEstimated,
            matchDaysScheduled: payload.matchDaysScheduled,
          };
        }
        if (alive) setPlayerSprintExposure(out);
      } catch {
        // Silently ignore — exposure chip simply won't render.
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachVerified, coachTeamId, today]);

  // coach display name
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;

      const { data, error } = await supabase.from("coaches").select("display_name").eq("user_id", uid).maybeSingle();
      if (!alive) return;

      if (!error && data?.display_name) setCoachDisplayName(data.display_name);
      else if (coachName) setCoachDisplayName(coachName);
    })();

    return () => {
      alive = false;
    };
  }, [coachName]);

  // reload on filters/page/search (skip the very first trigger — mount effect already loaded)
  useEffect(() => {
    if (!coachVerified) return;
    if (!initialLoadDone.current) return; // mount effect handles the first load
    loadToday();
    fetchCompliance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, teamFilter, filter, search, coachVerified, coachTeamId]);

  // load templates
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("workout_templates").select("id, title, code").eq("is_active", true).order("title");
      setTemplates((data ?? []) as any);
    })();
  }, []);

  // reset drafts on filter changes
  useEffect(() => {
    if (!coachVerified) return;
    setPage(0);
    setDraftAction({});
    setDraftMessage({});
    setSaved({});
  }, [teamFilter, filter, search, coachVerified]);

  // Reset "manually-set" flag when team changes so each team gets its own
  // most-recent-data default on first view. Also clear stale data state.
  useEffect(() => {
    setGpsDateManuallySet(false);
    setGpsLatestDataDate(null);
  }, [coachTeamId]);

  // GPS tab — fetch CURRENT-TEAM players with Catapult data, independent of
  // readiness rows. team_id filter is critical: Helgi (admin) and other
  // multi-team coaches have RLS access to players across teams; without the
  // filter they see other clubs' players in the GPS table (eg. Breiðablik
  // names appearing on Afturelding's GPS tab — reported by user 2026-05-15).
  useEffect(() => {
    if (dashTab !== "gps" || !coachVerified) return;
    if (!coachTeamId) return; // wait for team to load — never query without scope
    let alive = true;
    (async () => {
      setGpsLoading(true);
      try {
        const refDate = gpsDate; // browsable reference date
        const startDate = addDaysISO(refDate, -35);
        const { data: playerData } = await supabase
          .from("players")
          .select("id, full_name, position")
          .eq("is_active", true)
          .eq("team_id", coachTeamId)
          .order("full_name");

        if (!playerData?.length || !alive) return;
        const playerIds = (playerData as Array<Record<string, unknown>>).map((p) => String(p.id));

        const { data: loadData } = await supabase
          .from("player_external_load_daily")
          .select("player_id, date, total_distance, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, tot_as, decel_b2_3_tot_effs_gen2, tot_ds, total_player_load, player_load_per_minute, max_vel, ima_accel, ima_decel, ima_cod, avg_heart_rate, max_heart_rate")
          .in("source", ["catapult", "manual"])
          .in("player_id", playerIds)
          .gte("date", startDate)
          .lte("date", refDate)
          .order("date");

        if (!alive) return;

        const byPlayer = new Map<string, Array<Record<string, unknown>>>();
        for (const row of ((loadData ?? []) as Array<Record<string, unknown>>)) {
          const pid = String(row.player_id);
          const list = byPlayer.get(pid) ?? [];
          list.push(row);
          byPlayer.set(pid, list);
        }

        const result = (playerData as Array<Record<string, unknown>>)
          .filter((p) => (byPlayer.get(String(p.id)) ?? []).length > 0)
          .map((p) => ({
            id: String(p.id),
            name: String(p.full_name ?? ""),
            position: String(p.position ?? "—"),
            history: byPlayer.get(String(p.id)) ?? [],
          }));

        if (alive) setGpsAllPlayers(result);

        // Auto-shift gpsDate to the team's most-recent-data-date when:
        //   (a) coach hasn't manually picked a date this session, AND
        //   (b) gpsDate is currently > most-recent date (today is empty).
        // For teams that upload irregularly (Þór, Afturelding, Grindavík)
        // this avoids the "blank Today view" bug where default-today shows
        // nothing because last CSV was days ago. Coaches who explicitly
        // pick a date keep their pick.
        if (alive && loadData && loadData.length > 0) {
          const dates = (loadData as Array<{ date?: string }>)
            .map((r) => String(r.date ?? "").slice(0, 10))
            .filter(Boolean);
          if (dates.length > 0) {
            const maxDate = dates.reduce((a, b) => (a > b ? a : b));
            setGpsLatestDataDate(maxDate);
            if (!gpsDateManuallySet && maxDate < refDate) {
              setGpsDate(maxDate);
              // Don't flip the manual flag — this is system-driven.
            }
          }
        }
      } finally {
        if (alive) setGpsLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashTab, coachVerified, gpsDate, coachTeamId]);

  /** -----------------------------
   * Derived UI data
   * ----------------------------- */
  const counts = useMemo(() => {
    const acc: Record<FinalColor, number> = { red: 0, yellow: 0, green: 0 };
    for (const r of rows) {
      const c = (String(r.final_color ?? "").toLowerCase() as FinalColor) || null;
      if (c === "red" || c === "yellow" || c === "green") acc[c] += 1;
    }
    return acc;
  }, [rows]);

  const teamSten = useMemo(() => {
    const stens = (rows ?? [])
      .map((r) => (typeof r._sten === "number" ? r._sten : null))
      .filter((x): x is number => typeof x === "number");

    const avg = stens.length ? stens.reduce((a, b) => a + b, 0) / stens.length : null;

    return {
      avg,
      coverage: `${stens.length}/${rows.length}`,
    };
  }, [rows]);

  const teamExternalLoadSummary = useMemo<TeamExternalLoadSummary | null>(() => {
    if (!rows.length) return null;
    const teamId = String(rows.find((row) => row.team_id)?.team_id ?? coachTeamId ?? "").trim();
    const entryDate = String(rows[0]?.entry_date ?? today).trim();
    if (!teamId || !entryDate) return null;

    return buildTeamExternalLoadSummary({
      date: entryDate,
      teamId,
      players: rows.map((row) => ({
        playerId: String(row.player_id),
        playerName: row.full_name,
        readinessState: row.final_flag ?? "GRAY",
        externalLoadState: row._catapult_signals?.externalLoadState ?? "unknown",
        dataQuality: row._catapult_signals?.dataQuality,
        todayRow: row._catapult_history?.find((item) => item.date === entryDate) ?? null,
        historyRows: row._catapult_history ?? [],
        playerLoadSpike: row._catapult_signals?.playerLoadSpike ?? null,
        hirSpike: row._catapult_signals?.hirSpike ?? null,
        decelSpike: row._catapult_signals?.decelSpike ?? null,
        accelSpike: row._catapult_signals?.accelSpike ?? null,
        densityStressRatio: row._catapult_signals?.densityStressRatio ?? null,
        maxVelocityExposureRatio: row._catapult_signals?.maxVelocityExposureRatio ?? null,
        band6ExposureRatio: row._catapult_signals?.band6ExposureRatio ?? null,
        neuromuscularBurdenScore: row._catapult_signals?.neuromuscularBurdenScore ?? null,
      })),
    });
  }, [coachTeamId, rows, today]);

  const fatigueSnapshot = useMemo(() => {
    try {
      const intensity = ctxIntensity;
      const hsr_m = toIntOrNull(ctxHsr);
      const acc_total = toIntOrNull(ctxAcc);
      const dec_total = toIntOrNull(ctxDec);
      const total_distance_m = toIntOrNull(ctxDist);
      const max_velocity_pct = toNumOrNull(ctxVmax);

      const normalized = {
        hsr_m: intensity === "OFF" ? 0 : hsr_m ?? null,
        acc_total: intensity === "OFF" ? 0 : acc_total ?? null,
        dec_total: intensity === "OFF" ? 0 : dec_total ?? null,
        total_distance_m: intensity === "OFF" ? 0 : total_distance_m ?? null,
        max_velocity_pct: intensity === "OFF" ? 0 : max_velocity_pct ?? null,
        intensity: intensity || null,
      };

      const players = (rows ?? []).map((r) => ({
        player_id: String(r.player_id),
        z: typeof r._z_today === "number" ? r._z_today : null,
        z_prev: typeof r._yesterday_z === "number" ? r._yesterday_z : null,
        energy: typeof r.fatigue_energy === "number" ? r.fatigue_energy : null,
        sleep_quality: typeof r.sleep_quality === "number" ? r.sleep_quality : null,
        sleep_duration: typeof r.sleep_duration === "number" ? r.sleep_duration : null,
        stress: toRiskLikertFromCheckin(r.stress_mood),
        soreness:
          typeof r.muscle_soreness === "number" ? toRiskLikertFromCheckin(r.muscle_soreness) : r.soreness ?? null,
        total_score: typeof r.total_score === "number" ? r.total_score : null,
      }));

      const accDecTotal = (normalized.acc_total ?? 0) + (normalized.dec_total ?? 0);

      return computeTeamDecision(players as any, {
        hsr_m: normalized.hsr_m,
        acc_dec_total: accDecTotal,
        total_distance_m: normalized.total_distance_m,
        max_velocity_pct: normalized.max_velocity_pct,
        intensity: (normalized.intensity || null) as any,
      });
    } catch {
      return null;
    }
  }, [rows, ctxIntensity, ctxHsr, ctxAcc, ctxDec, ctxDist, ctxVmax]);

  const fatigueByPlayer = useMemo(() => {
    const map = new Map<string, any>();
    const exceptions = (fatigueSnapshot as any)?.exceptions ?? [];
    for (const ex of exceptions) {
      const pid = String((ex as any)?.player_id ?? "");
      if (!pid) continue;
      map.set(pid, (ex as any)?.fatigue ?? null);
    }
    return map;
  }, [fatigueSnapshot]);

  const adaptationByPlayer = useMemo(() => {
    const map = new Map<string, { adaptation: Row["_adaptation"]; summary: string | null }>();
    const exceptions = (fatigueSnapshot as any)?.exceptions ?? [];
    for (const ex of exceptions) {
      const pid = String((ex as any)?.player_id ?? "");
      if (!pid) continue;
      const adaptation = ((ex as any)?.adaptation ?? null) as Row["_adaptation"];
      const summaryRaw = String((ex as any)?.adaptation_summary ?? "").trim();
      map.set(pid, { adaptation, summary: summaryRaw.length ? summaryRaw : null });
    }
    return map;
  }, [fatigueSnapshot]);

  const neuralBiasByPlayer = useMemo(() => {
    const map = new Map<string, { applied: boolean; reasonCodes: string[] }>();
    const exceptions = (fatigueSnapshot as any)?.exceptions ?? [];
    for (const ex of exceptions) {
      const pid = String((ex as any)?.player_id ?? "");
      if (!pid) continue;
      const applied = !!(ex as any)?.neural_bias_applied;
      const reasonCodes = Array.isArray((ex as any)?.neural_bias_reason_codes)
        ? ((ex as any).neural_bias_reason_codes as string[])
        : [];
      map.set(pid, { applied, reasonCodes });
    }
    return map;
  }, [fatigueSnapshot]);

  const neuralByPlayer = useMemo(() => {
    const map = new Map<string, NeuralLoadClassification>();

    const intensity = ctxIntensity;
    const hsr_m = toIntOrNull(ctxHsr);
    const max_velocity_pct = toNumOrNull(ctxVmax);
    const normalized = {
      hsr_m: intensity === "OFF" ? 0 : hsr_m ?? null,
      max_velocity_pct: intensity === "OFF" ? 0 : max_velocity_pct ?? null,
    };

    const teamVolHigh = (teamIntel?.volatility_pct ?? 0) >= 40;
    const scheduleCongestion = false;
    const travelFlag = false;
    const matchMinutesHigh = false;

    for (const r of rows ?? []) {
      const zToday = typeof r._z_today === "number" ? r._z_today : null;
      const zPrev = typeof r._yesterday_z === "number" ? r._yesterday_z : null;
      const dz = zToday != null && zPrev != null ? zToday - zPrev : null;
      const sten = typeof r._sten === "number" ? r._sten : null;
      const pid = String(r.player_id);
      const fatigue = fatigueByPlayer.get(pid) ?? null;

      const neural = classifyNeuralLoad({
        playerId: pid,
        z: zToday,
        zPrev,
        deltaZ: dz,
        sten,
        lowStenDays: sten != null && sten <= 4 ? 1 : 0,
        totalScore: typeof r.total_score === "number" ? r.total_score : null,
        energy: typeof r.fatigue_energy === "number" ? r.fatigue_energy : null,
        sleepQuality: typeof r.sleep_quality === "number" ? r.sleep_quality : null,
        sleepDuration: typeof r.sleep_duration === "number" ? r.sleep_duration : null,
        stress: toRiskLikertFromCheckin(r.stress_mood),
        soreness: typeof r.muscle_soreness === "number" ? toRiskLikertFromCheckin(r.muscle_soreness) : null,
        zHistory: extractRecentZHistory(r.training_modifier, zToday, zPrev),
        volatility: teamIntel?.volatility_pct ?? null,
        hsrHighYesterday: (normalized.hsr_m ?? 0) >= 800,
        maxVelocityHighYesterday: (normalized.max_velocity_pct ?? 0) >= 90,
        scheduleCongestion,
        travelFlag,
        matchMinutesHigh,
        teamVolatilityHigh: teamVolHigh,
        fatigue,
      });

      map.set(pid, neural);
    }

    return map;
  }, [rows, fatigueByPlayer, teamIntel?.volatility_pct, ctxIntensity, ctxHsr, ctxVmax]);

  const teamNeuralSummary = useMemo(() => {
    return buildTeamNeuralLoadSummary(Array.from(neuralByPlayer.values()));
  }, [neuralByPlayer]);

  const neuralValidation = useMemo(() => runNeuralLoadValidationSuite(), []);

  const rowsWithAdaptive = useMemo(
    () =>
      (rows ?? []).map((r) => {
        const pid = String(r.player_id);
        const a = adaptationByPlayer.get(pid);
        const n = neuralByPlayer.get(pid) ?? null;
        const nb = neuralBiasByPlayer.get(pid);
        return {
          ...r,
          _adaptation: a?.adaptation ?? null,
          _adaptation_summary: a?.summary ?? null,
          _neural_load: n,
          _neural_bias_applied: !!nb?.applied,
          _neural_bias_reason_codes: nb?.reasonCodes ?? null,
        };
      }),
    [rows, adaptationByPlayer, neuralByPlayer, neuralBiasByPlayer],
  );

  const performanceIntelligenceByPlayer = useMemo(() => {
    const out = new Map<string, PerformanceIntelligenceDecision>();
    const hsrValue = toIntOrNull(ctxHsr);
    const vMaxValue = toNumOrNull(ctxVmax);
    const durationValue = toNumOrNull(ctxDuration);
    const intensityToken = String(ctxIntensity ?? "").toUpperCase();
    const gpsSpike = intensityToken !== "OFF" && (hsrValue ?? 0) >= 1000;

    for (const r of rowsWithAdaptive) {
      const pid = String(r.player_id);
      const fatigue = fatigueByPlayer.get(pid) as Record<string, unknown> | undefined;
      const tm = normalizeTrainingModifier(r.training_modifier);
      const tmObj = tm && typeof tm === "object" ? (tm as Record<string, unknown>) : null;
      const tmLoad = tmObj?.load && typeof tmObj.load === "object" ? (tmObj.load as Record<string, unknown>) : null;
      const rawTotalScore = typeof r.total_score === "number" ? r.total_score : null;
      const normalizedReadinessScore =
        rawTotalScore == null ? null : Math.max(0, Math.min(100, ((rawTotalScore - 5) / 20) * 100));
      const selectedAction: TrainingAction = (r.final_decision as TrainingAction | null) ?? flagToAction(r.final_flag);
      const mdContextResolved = resolveSessionMdContextFromSources({
        weekSetupDay:
          (weekGrid ?? []).find((x: { day_date?: string | null }) => dateKey(x.day_date) === dateKey(String(r.entry_date ?? today))) ??
          null,
        rowMdContext: graphMdContextFromToken(r.md_day ?? null) ?? null,
        teamMdContext: graphMdContextFromToken(mdDayToday) ?? null,
        plannedFocusMdContext: graphMdContextFromToken(mdFromPlannedFocus(r.planned_focus ?? null)) ?? null,
        previewMdContext: graphMdContextFromToken(planPreview?.md_day ?? null) ?? null,
      });
      const mdToken = String(mdContextResolved.mdContext ?? "").toUpperCase();
      const neuralState = String(r._neural_load?.neuralLoadState ?? "").toUpperCase();
      const neuralMetrics =
        r._neural_load && typeof r._neural_load === "object" ? (r._neural_load as unknown as Record<string, unknown>) : null;
      const neuralScore = toMaybeFinite(neuralMetrics?.score) ?? null;
      const tmPi = tmObj?.pi && typeof tmObj.pi === "object" ? (tmObj.pi as Record<string, unknown>) : null;
      const acwrValue = toMaybeFinite(fatigue?.acwr) ?? toMaybeFinite(tmObj?.acwr) ?? toMaybeFinite(tmLoad?.acwr);
      const volatilityValue = toMaybeFinite(tmPi?.volatility) ?? (teamIntel?.volatility_pct ?? null);
      const recentPoints = recentMonitoringByPlayer[pid] ?? [];
      const volatilitySummary = computePlayerVolatilitySummary(recentPoints);
      const volatilityWindow = volatilitySummary.overallScore ?? volatilityValue;

      const decision = buildPerformanceIntelligenceDecision({
        playerId: pid,
        playerName: r.full_name,
        date: String(r.entry_date ?? today),
        readinessScore: normalizedReadinessScore,
        readinessState: graphAthleteStateFromFlag(r.final_flag),
        athleteState: graphAthleteStateFromFlag(r.final_flag),
        sessionMode: actionToSessionMode(selectedAction),
        neuralFatigueScore: neuralScore,
        neuralFatigueFlag: neuralState === "HIGH" || neuralState === "CRITICAL",
        sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : null,
        sleepScore: typeof r.sleep_quality === "number" ? r.sleep_quality : null,
        stressScore: typeof r.stress_mood === "number" ? r.stress_mood : null,
        energyScore: typeof r.fatigue_energy === "number" ? r.fatigue_energy : null,
        moodScore: typeof r.stress_mood === "number" ? r.stress_mood : null,
        rpe: toMaybeFinite(tmObj?.session_rpe),
        sessionLoad: toMaybeFinite(tmLoad?.session_load),
        acuteLoad: hsrValue,
        chronicLoad: toMaybeFinite(tmLoad?.chronic_load),
        acuteChronicRatio: acwrValue,
        zScore: typeof r._z_today === "number" ? r._z_today : null,
        deltaZ: typeof r._dz === "number" ? r._dz : null,
        volatility5d: volatilityWindow,
        volatility7d: volatilityWindow,
        matchCongestionScore: mdToken === "MD1" || mdToken === "MD2" ? 65 : mdToken === "MD3" ? 45 : 20,
        travelLoadScore: 0,
        upcomingMatchInDays: mdToken === "MD1" ? 1 : mdToken === "MD2" ? 2 : mdToken === "MD3" ? 3 : null,
        plannedSessionIntensity: actionToPlannedIntensity(selectedAction),
        dataConfidence: undefined,
        gpsSpike,
        maxVelocityPct: vMaxValue,
        durationMinutes: durationValue,
      });

      out.set(pid, decision);
    }

    return out;
  }, [
    rowsWithAdaptive,
    fatigueByPlayer,
    ctxHsr,
    ctxVmax,
    ctxDuration,
    ctxIntensity,
    weekGrid,
    mdDayToday,
    planPreview?.md_day,
    today,
    teamIntel?.volatility_pct,
    recentMonitoringByPlayer,
  ]);

  const rowsWithPerformanceIntelligence = useMemo(
    () =>
      rowsWithAdaptive.map((r) => ({
        ...r,
        _performance_intelligence: performanceIntelligenceByPlayer.get(String(r.player_id)) ?? null,
      })),
    [rowsWithAdaptive, performanceIntelligenceByPlayer],
  );

  const neuralVolatilityByPlayer = useMemo(() => {
    const out = new Map<string, NeuralVolatilityIntelligenceDecision>();

    for (const r of rowsWithPerformanceIntelligence) {
      const pid = String(r.player_id);
      const tm = normalizeTrainingModifier(r.training_modifier);
      const tmObj = tm && typeof tm === "object" ? (tm as Record<string, unknown>) : null;
      const tmLoad = tmObj?.load && typeof tmObj.load === "object" ? (tmObj.load as Record<string, unknown>) : null;
      const history = recentMonitoringByPlayer[pid] ?? [];
      const normalizedReadinessHistory = history
        .map((point) =>
          point.checkInScore == null ? null : Math.max(0, Math.min(100, ((point.checkInScore - 5) / 20) * 100)),
        )
        .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null));
      const readinessStateHistory = history.map((point) => {
        const raw = point.checkInScore;
        const norm = raw == null ? null : Math.max(0, Math.min(100, ((raw - 5) / 20) * 100));
        if (norm == null) return null;
        if (norm < 40) return "RED";
        if (norm < 60) return "YELLOW";
        return "GREEN";
      });
      const neuralFatigueHistory = history.map((point) => {
        if (typeof point.deltaZ === "number" && point.deltaZ <= -0.4) return 8;
        if (typeof point.deltaZ === "number" && point.deltaZ <= -0.2) return 6;
        if (typeof point.deltaZ === "number" && point.deltaZ >= 0.2) return 3;
        return 5;
      });
      const volatilitySummary = computePlayerVolatilitySummary(history);

      const decision = buildNeuralVolatilityIntelligenceDecision({
        playerId: pid,
        date: String(r.entry_date ?? today),
        readinessScore:
          typeof r.total_score === "number" ? Math.max(0, Math.min(100, ((r.total_score - 5) / 20) * 100)) : null,
        readinessState: graphAthleteStateFromFlag(r.final_flag),
        athleteState: graphAthleteStateFromFlag(r.final_flag),
        sessionMode: actionToSessionMode((r.final_decision as TrainingAction | null) ?? flagToAction(r.final_flag)),
        neuralFatigueScore: toMaybeFinite(r._neural_load?.neuralLoadScore) ?? null,
        neuralFatigueFlag: ["HIGH", "CRITICAL"].includes(String(r._neural_load?.neuralLoadState ?? "").toUpperCase()),
        sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : null,
        sleepScore: typeof r.sleep_quality === "number" ? r.sleep_quality : null,
        stressScore: typeof r.stress_mood === "number" ? r.stress_mood : null,
        energyScore: typeof r.fatigue_energy === "number" ? r.fatigue_energy : null,
        moodScore: typeof r.stress_mood === "number" ? r.stress_mood : null,
        acuteLoad: toIntOrNull(ctxHsr),
        chronicLoad: toMaybeFinite(tmLoad?.chronic_load),
        acuteChronicRatio: toMaybeFinite(tmObj?.acwr) ?? toMaybeFinite(tmLoad?.acwr),
        zScore: typeof r._z_today === "number" ? r._z_today : null,
        deltaZ: typeof r._dz === "number" ? r._dz : null,
        volatility5d: volatilitySummary.overallScore,
        volatility7d: volatilitySummary.overallScore,
        matchCongestionScore:
          String(r.md_day ?? "").toUpperCase() === "MD-1"
            ? 65
            : String(r.md_day ?? "").toUpperCase() === "MD-2"
              ? 55
              : 25,
        travelLoadScore: 0,
        upcomingMatchInDays: String(r.md_day ?? "").toUpperCase() === "MD-1" ? 1 : null,
        readinessHistory: normalizedReadinessHistory,
        neuralFatigueHistory,
        sorenessHistory: history.map((point) => (typeof point.soreness === "number" ? point.soreness : null)),
        sleepHistory: history.map((point) => (typeof point.sleepQuality === "number" ? point.sleepQuality : null)),
        stressHistory: history.map((point) => (typeof point.stress === "number" ? point.stress : null)),
        volatilityHistory: volatilitySummary.dailyComposite,
        riskHistory: history.map((point) => {
          const d = buildPerformanceIntelligenceDecision({
            readinessScore: point.checkInScore == null ? null : Math.max(0, Math.min(100, ((point.checkInScore - 5) / 20) * 100)),
            // injuryRisk rules.ts: sorenessScore <= 2 = sore (elevated risk),
            // >= 4 = fine. That's the NEW scale where 1=sore. point.soreness
            // was sourced from legacy column (5=sore) — INVERTED. Use new
            // muscle_soreness column directly. Fixed 2026-04-29.
            sorenessScore: (point as any).muscle_soreness ?? null,
            sleepScore: point.sleepQuality ?? null,
            stressScore: point.stress ?? null,
            energyScore: point.energy ?? null,
            zScore: point.zScore ?? null,
            deltaZ: point.deltaZ ?? null,
          });
          return d.injuryRisk.score;
        }),
        loadHistory: [],
        sessionModeHistory: [],
        athleteStateHistory: readinessStateHistory,
        dataConfidence: null,
      });

      out.set(pid, decision);
    }

    return out;
  }, [rowsWithPerformanceIntelligence, recentMonitoringByPlayer, ctxHsr, today]);

  const rowsWithNeuralVolatility = useMemo(
    () =>
      rowsWithPerformanceIntelligence.map((r) => ({
        ...r,
        _neural_volatility_intelligence: neuralVolatilityByPlayer.get(String(r.player_id)) ?? null,
      })),
    [rowsWithPerformanceIntelligence, neuralVolatilityByPlayer],
  );

  const teamNeuralVolatilitySummary = useMemo(() => {
    const decisions: Array<{ playerId?: string; playerName?: string; decision: NeuralVolatilityIntelligenceDecision }> = [];
    for (const r of rowsWithNeuralVolatility) {
      if (!r._neural_volatility_intelligence) continue;
      decisions.push({
        playerId: String(r.player_id),
        playerName: r.full_name,
        decision: r._neural_volatility_intelligence,
      });
    }
    return buildTeamNeuralVolatilitySummary(decisions);
  }, [rowsWithNeuralVolatility]);

  const prescriptionByPlayer = useMemo(() => {
    const out = new Map<string, PrescriptionDecision>();
    for (const r of rowsWithNeuralVolatility) {
      const pid = String(r.player_id);
      const pi = r._performance_intelligence ?? null;
      const nvi = r._neural_volatility_intelligence ?? null;
      const selectedAction: TrainingAction = (r.final_decision as TrainingAction | null) ?? flagToAction(r.final_flag);
      const rawTotalScore = typeof r.total_score === "number" ? r.total_score : null;
      const normalizedReadinessScore =
        rawTotalScore == null ? null : Math.max(0, Math.min(100, ((rawTotalScore - 5) / 20) * 100));
      const mdToken = String(r.md_day ?? "").toUpperCase();

      const decision = buildPrescriptionDecision({
        playerId: pid,
        date: String(r.entry_date ?? today),
        readinessScore: normalizedReadinessScore,
        readinessState: graphAthleteStateFromFlag(r.final_flag),
        athleteState: graphAthleteStateFromFlag(r.final_flag),
        sessionMode: actionToSessionMode(selectedAction),

        injuryRiskScore: pi?.injuryRisk.score ?? null,
        injuryRiskBand: pi?.injuryRisk.band ?? null,
        performanceScore: pi?.performanceForecast.score ?? null,
        performanceBand: pi?.performanceForecast.band ?? null,
        loadToleranceScore: pi?.loadForecast.score ?? null,
        loadToleranceBand: pi?.loadForecast.band ?? null,

        fatigueAccumulationScore: nvi?.fatigueAccumulation.score ?? null,
        fatigueAccumulationBand: nvi?.fatigueAccumulation.band ?? null,
        instabilityWindowScore: nvi?.instabilityWindow.score ?? null,
        instabilityWindowBand: nvi?.instabilityWindow.band ?? null,
        collapseRiskScore: nvi?.collapseRisk.score ?? null,
        collapseRiskBand: nvi?.collapseRisk.band ?? null,
        peakWindowScore: nvi?.peakWindow.score ?? null,
        peakWindowBand: nvi?.peakWindow.band ?? null,
        trendDirection: nvi?.trendState.direction ?? null,

        neuralFatigueScore: toMaybeFinite(r._neural_load?.neuralLoadScore) ?? null,
        sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : null,
        sleepScore: typeof r.sleep_quality === "number" ? r.sleep_quality : null,
        stressScore: typeof r.stress_mood === "number" ? r.stress_mood : null,
        energyScore: typeof r.fatigue_energy === "number" ? r.fatigue_energy : null,
        moodScore: typeof r.stress_mood === "number" ? r.stress_mood : null,
        acuteLoad: toIntOrNull(ctxHsr),
        chronicLoad: null,
        acuteChronicRatio: null,
        zScore: typeof r._z_today === "number" ? r._z_today : null,
        deltaZ: typeof r._dz === "number" ? r._dz : null,
        volatility5d: nvi?.instabilityWindow.score ?? null,
        volatility7d: nvi?.instabilityWindow.score ?? null,
        matchCongestionScore: mdToken === "MD-1" || mdToken === "MD1" ? 70 : mdToken === "MD-2" || mdToken === "MD2" ? 55 : 25,
        travelLoadScore: 0,
        upcomingMatchInDays: mdToken === "MD-1" || mdToken === "MD1" ? 1 : mdToken === "MD-2" || mdToken === "MD2" ? 2 : null,
        plannedSessionType: "mixed",
        plannedSessionIntensity:
          selectedAction === "RECOVERY" ? "low" : selectedAction === "REDUCED" ? "moderate" : "high",
        dayType:
          mdToken === "MD-1" || mdToken === "MD1"
            ? "md-1"
            : mdToken === "MD-2" || mdToken === "MD2"
            ? "md-2"
            : mdToken === "MD-3" || mdToken === "MD3"
            ? "md-3"
            : mdToken === "MD+1" || mdToken === "MD_PLUS_1"
            ? "md+1"
            : "training",
        weekDensity: (mdToken === "MD-1" || mdToken === "MD1") && (mdDayToday === "MD-2" || mdDayToday === "MD-1") ? "congested" : "normal",
      });

      out.set(pid, decision);
    }
    return out;
  }, [rowsWithNeuralVolatility, today, ctxHsr, mdDayToday]);

  const rowsWithPrescription = useMemo(
    () =>
      rowsWithNeuralVolatility.map((r) => ({
        ...r,
        _prescription_decision: prescriptionByPlayer.get(String(r.player_id)) ?? null,
      })),
    [rowsWithNeuralVolatility, prescriptionByPlayer],
  );

  const teamPrescriptionSummary = useMemo(() => {
    const decisions: Array<{ playerId?: string; playerName?: string; decision: PrescriptionDecision }> = [];
    for (const r of rowsWithPrescription) {
      if (!r._prescription_decision) continue;
      decisions.push({
        playerId: String(r.player_id),
        playerName: r.full_name,
        decision: r._prescription_decision,
      });
    }
    return buildTeamPrescriptionSummary(decisions);
  }, [rowsWithPrescription]);

  const customCoachRules = useMemo<CoachRule[]>(() => buildRuntimeRulesFromAdminConfig(adminConfigSnapshot), [adminConfigSnapshot]);

  const finalRecommendationByPlayer = useMemo(() => {
    const out = new Map<string, FinalRecommendationDecision>();

    for (const r of rowsWithPrescription) {
      const pid = String(r.player_id);
      const prescription = r._prescription_decision ?? null;
      if (!prescription) continue;

      const manualOverrideActionRaw = String(r.final_decision ?? "").toUpperCase();
      const manualOverrideAction: "FULL" | "MODIFIED" | "RECOVERY" | null =
        manualOverrideActionRaw === "REDUCED" ? "MODIFIED" : manualOverrideActionRaw === "FULL" || manualOverrideActionRaw === "RECOVERY" ? manualOverrideActionRaw : null;

      const manualOverride =
        String(r.final_source ?? "").toUpperCase() === "COACH_OVERRIDE" && r.final_decision
          ? {
              applied: true,
              overriddenBy: null,
              reason: r.coach_message ?? "Coach override",
              finalAction: manualOverrideAction,
              finalInstruction: r.coach_message ?? undefined,
            }
          : null;

      const runtimeProtected = isPlayerProtectedByAdminConfig(adminConfigSnapshot, pid);
      const configuredTags = getProtectedPlayerTags(adminConfigSnapshot, pid);
      const isProtectedPlayer =
        runtimeProtected ||
        !!normalizeTrainingModifier(r.training_modifier)?.protected_player ||
        (typeof r.notes === "string" && /return|protected|r2p|restricted/i.test(r.notes));

      const decision = applyCoachRules(
        {
          playerId: pid,
          playerName: r.full_name,
          teamId: r.team_id ?? undefined,
          dayType:
            String(r.md_day ?? "").toUpperCase() === "MD-1"
              ? "md-1"
              : String(r.md_day ?? "").toUpperCase() === "MD-2"
              ? "md-2"
              : String(r.md_day ?? "").toUpperCase() === "MD-3"
              ? "md-3"
              : String(r.md_day ?? "").toUpperCase() === "MD+1"
              ? "md+1"
              : "training",
          weekDensity: (teamIntel?.volatility_pct ?? 0) >= 45 ? "congested" : "normal",
          playerTags: isProtectedPlayer ? Array.from(new Set(["protected", ...configuredTags])) : [],
          isProtectedPlayer,
          readinessState: graphAthleteStateFromFlag(r.final_flag),
          athleteState: graphAthleteStateFromFlag(r.final_flag),
          injuryRiskBand: r._performance_intelligence?.injuryRisk.band ?? null,
          injuryRiskScore: r._performance_intelligence?.injuryRisk.score ?? null,
          performanceBand: r._performance_intelligence?.performanceForecast.band ?? null,
          loadToleranceBand: r._performance_intelligence?.loadForecast.band ?? null,
          fatigueAccumulationBand: r._neural_volatility_intelligence?.fatigueAccumulation.band ?? null,
          instabilityWindowBand: r._neural_volatility_intelligence?.instabilityWindow.band ?? null,
          collapseRiskBand: r._neural_volatility_intelligence?.collapseRisk.band ?? null,
          peakWindowBand: r._neural_volatility_intelligence?.peakWindow.band ?? null,
          trendDirection: r._neural_volatility_intelligence?.trendState.direction ?? null,
          prescriptionDecision: prescription,
          dataConfidence: prescription.confidence,
          plannedSessionType: "mixed",
          plannedSessionIntensity:
            prescription.action === "RECOVERY" || prescription.action === "HOLD"
              ? "low"
              : prescription.action === "MODIFIED"
              ? "moderate"
              : "high",
          sessionMode:
            prescription.action === "FULL"
              ? "full"
              : prescription.action === "MODIFIED"
              ? "modified"
              : "recovery",
        },
        customCoachRules,
        manualOverride,
      );

      out.set(pid, decision);
    }

    return out;
  }, [rowsWithPrescription, customCoachRules, teamIntel?.volatility_pct, adminConfigSnapshot]);

  const rowsWithFinalRecommendation = useMemo(
    () =>
      rowsWithPrescription.map((r) => ({
        ...r,
        _final_recommendation_decision: finalRecommendationByPlayer.get(String(r.player_id)) ?? null,
      })),
    [rowsWithPrescription, finalRecommendationByPlayer],
  );

  const sessionDraftByPlayer = useMemo(() => {
    const out = new Map<string, SessionDraft>();
    for (const r of rowsWithFinalRecommendation) {
      const pid = String(r.player_id);
      const finalRecommendationDecision = r._final_recommendation_decision ?? null;
      const prescriptionDecision = r._prescription_decision ?? null;
      if (!finalRecommendationDecision && !prescriptionDecision) continue;

      const selectedAction = (r.final_decision as TrainingAction | null) ?? flagToAction(r.final_flag);
      const mdToken = String(r.md_day ?? "").toUpperCase();
      const dayType: "matchday" | "md+1" | "md+2" | "md-3" | "md-2" | "md-1" | "training" | "off" =
        mdToken === "MD-1"
          ? "md-1"
          : mdToken === "MD-2"
          ? "md-2"
          : mdToken === "MD-3"
          ? "md-3"
          : mdToken === "MD+1"
          ? "md+1"
          : mdToken === "OFF"
          ? "off"
          : "training";

      const draft = buildSessionDraft({
        playerId: pid,
        playerName: r.full_name,
        teamId: r.team_id ?? undefined,
        date: r.entry_date,
        dayType,
        weekDensity: (teamIntel?.volatility_pct ?? 0) >= 45 ? "congested" : "normal",
        plannedSessionType:
          selectedAction === "RECOVERY" ? "recovery" : selectedAction === "FULL" ? "field" : "mixed",
        plannedSessionIntensity: actionToPlannedIntensity(selectedAction),
        prescriptionDecision,
        finalRecommendationDecision,
        dataConfidence: finalRecommendationDecision?.confidence ?? prescriptionDecision?.confidence ?? null,
        isProtectedPlayer: !!normalizeTrainingModifier(r.training_modifier)?.protected_player,
      });

      out.set(pid, draft);
    }
    return out;
  }, [rowsWithFinalRecommendation, teamIntel?.volatility_pct]);

  const rowsWithSessionDraft = useMemo(
    () =>
      rowsWithFinalRecommendation.map((r) => ({
        ...r,
        _session_draft: sessionDraftByPlayer.get(String(r.player_id)) ?? null,
      })),
    [rowsWithFinalRecommendation, sessionDraftByPlayer],
  );

  const teamSessionBuildSummary = useMemo(() => {
    const drafts: Array<{ playerId?: string; playerName?: string; draft: SessionDraft }> = [];
    for (const r of rowsWithSessionDraft) {
      if (!r._session_draft) continue;
      drafts.push({ playerId: String(r.player_id), playerName: r.full_name, draft: r._session_draft });
    }
    return buildTeamSessionBuildSummary(drafts);
  }, [rowsWithSessionDraft]);

  // Session workflow auto-save useEffect removed (feature removed)

  const teamRulesSummary = useMemo(
    () =>
      buildTeamRulesSummary(
        rowsWithSessionDraft
          .filter((r) => !!r._final_recommendation_decision)
          .map((r) => ({
            playerId: String(r.player_id),
            playerName: r.full_name,
            decision: r._final_recommendation_decision!,
            isProtectedPlayer: !!normalizeTrainingModifier(r.training_modifier)?.protected_player,
          })),
      ),
    [rowsWithSessionDraft],
  );

  const teamPerformanceIntelligence = useMemo(
    () => {
      const decisions: Array<{ playerId?: string; playerName?: string; decision: PerformanceIntelligenceDecision }> = [];
      for (const r of rowsWithNeuralVolatility) {
        if (!r._performance_intelligence) continue;
        decisions.push({
          playerId: String(r.player_id),
          playerName: r.full_name,
          decision: r._performance_intelligence,
        });
      }
      return buildTeamPerformanceIntelligenceSummary(decisions);
    },
    [rowsWithNeuralVolatility],
  );

  const teamPerformanceRiskGroups = useMemo(() => {
    const groups = {
      lowRiskPlayers: [] as Array<{ playerId: string; playerName: string }>,
      moderateRiskPlayers: [] as Array<{ playerId: string; playerName: string }>,
      highRiskPlayers: [] as Array<{ playerId: string; playerName: string }>,
      recoveryRecommendedPlayers: [] as Array<{ playerId: string; playerName: string }>,
    };

    for (const r of rowsWithNeuralVolatility) {
      const pi = r._performance_intelligence;
      if (!pi) continue;
      const item = { playerId: String(r.player_id), playerName: r.full_name };
      if (pi.injuryRisk.band === "LOW") groups.lowRiskPlayers.push(item);
      else if (pi.injuryRisk.band === "MODERATE") groups.moderateRiskPlayers.push(item);
      else groups.highRiskPlayers.push(item);
      if (pi.loadForecast.recommendedAction === "recovery") groups.recoveryRecommendedPlayers.push(item);
    }

    return groups;
  }, [rowsWithNeuralVolatility]);

  const teamRiskMap = useMemo(
    () =>
      buildTeamRiskMap(
        rowsWithNeuralVolatility
          .filter((r) => !!r._performance_intelligence)
          .map((r) => ({
            playerId: String(r.player_id),
            playerName: r.full_name,
            decision: r._performance_intelligence!,
          })),
      ),
    [rowsWithNeuralVolatility],
  );

  const weeklyRiskReport = useMemo(() => {
    const entries: Array<{
      playerId?: string;
      playerName?: string;
      date: string;
      decision: PerformanceIntelligenceDecision;
    }> = [];

    for (const r of rowsWithNeuralVolatility) {
      const current = r._performance_intelligence;
      if (current) {
        entries.push({
          playerId: String(r.player_id),
          playerName: r.full_name,
          date: dateKey(String(r.entry_date ?? today)),
          decision: current,
        });
      }

      const history = recentMonitoringByPlayer[String(r.player_id)] ?? [];
      for (const point of history.slice(-7)) {
        if (!point?.date) continue;
        entries.push({
          playerId: String(r.player_id),
          playerName: r.full_name,
          date: dateKey(point.date),
          decision: buildPerformanceIntelligenceDecision({
            playerId: String(r.player_id),
            playerName: r.full_name,
            date: point.date,
            readinessScore: point.checkInScore != null ? Math.max(0, Math.min(100, ((point.checkInScore - 5) / 20) * 100)) : null,
            readinessState:
              String(point.readinessState ?? "").toUpperCase() === "RED"
                ? "RED"
                : String(point.readinessState ?? "").toUpperCase() === "YELLOW"
                  ? "YELLOW"
                  : String(point.readinessState ?? "").toUpperCase() === "GREEN"
                    ? "GREEN"
                    : "GRAY",
            athleteState:
              String(point.readinessState ?? "").toUpperCase() === "RED"
                ? "RED"
                : String(point.readinessState ?? "").toUpperCase() === "YELLOW"
                  ? "YELLOW"
                  : String(point.readinessState ?? "").toUpperCase() === "GREEN"
                    ? "GREEN"
                    : "GRAY",
            sessionMode: "pending",
            // Use new muscle_soreness (1=sore) — see comment on the
            // injuryRisk call above for the scale rationale.
            sorenessScore: (point as any).muscle_soreness ?? null,
            sleepScore: point.sleepQuality ?? null,
            stressScore: point.stress ?? null,
            energyScore: point.energy ?? null,
            moodScore: point.mood ?? null,
            zScore: point.zScore ?? null,
            deltaZ: point.deltaZ ?? null,
            volatility5d: null,
            volatility7d: null,
          }),
        });
      }
    }
    return buildWeeklyRiskReport(entries);
  }, [rowsWithNeuralVolatility, recentMonitoringByPlayer, today]);

  const teamOutlook = useMemo(
    () =>
      buildTeamOutlook(
        rowsWithNeuralVolatility
          .map((r) => r._performance_intelligence)
          .filter((d): d is PerformanceIntelligenceDecision => !!d),
      ),
    [rowsWithNeuralVolatility],
  );

  const weeklyPerformanceOutlook = useMemo(() => {
    if (!weekGrid?.length) return null;
    const highCount = teamPerformanceRiskGroups.highRiskPlayers.length;
    const modCount = teamPerformanceRiskGroups.moderateRiskPlayers.length;
    const recCount = teamPerformanceRiskGroups.recoveryRecommendedPlayers.length;
    return `Weekly risk outlook: ${highCount} elevated, ${modCount} moderate, ${recCount} recovery recommended.`;
  }, [weekGrid, teamPerformanceRiskGroups]);

  const flaggedReviewStats = useMemo(() => {
    const highNeuralLoad = rowsWithAdaptive.filter((r) =>
      ["HIGH", "CRITICAL"].includes(String(r._neural_load?.neuralLoadState ?? "").toUpperCase())
    ).length;
    const lowReadiness = rowsWithAdaptive.filter((r) =>
      ["RED", "YELLOW"].includes(String(r.final_flag ?? "").toUpperCase())
    ).length;
    const painFlag = rowsWithAdaptive.filter((r) => {
      const pid = String(r.player_id);
      const fatigue = fatigueByPlayer.get(pid) as
        | { primaryFatigueType?: string; severity?: string; drivers?: unknown[]; reasonCodes?: unknown[] }
        | null
        | undefined;
      const fatigueType = String(fatigue?.primaryFatigueType ?? "").toUpperCase();
      const fatigueSeverity = String(fatigue?.severity ?? "").toUpperCase();
      const rawTotalScore = typeof r.total_score === "number" ? r.total_score : null;
      const normalizedReadinessScore =
        rawTotalScore == null ? null : Math.max(0, Math.min(100, ((rawTotalScore - 5) / 20) * 100));
      const signal = deriveTissueProtectionSignal({
        fatigueType,
        fatigueSeverity,
        sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : null,
        noteText: r.notes ?? null,
        neuralFatigueBand: graphNeuralFatigueBandFromState(r._neural_load?.neuralLoadState),
        readinessScore: normalizedReadinessScore,
        zScore: typeof r._z_today === "number" ? r._z_today : null,
        stenScore: typeof r._sten === "number" ? r._sten : null,
      });
      return signal.painProtection;
    }).length;
    const manualReview = rowsWithAdaptive.filter((r) =>
      String(r.final_source ?? "").toUpperCase().includes("COACH")
    ).length;

    return { highNeuralLoad, lowReadiness, painFlag, manualReview };
  }, [rowsWithAdaptive, fatigueByPlayer]);

  const reviewContextStats = useMemo(() => {
    const neuralBiasApplied = rowsWithAdaptive.filter((r) => !!r._neural_bias_applied).length;
    const highNextDayRisk = rowsWithAdaptive.filter(
      (r) => String(r._neural_load?.nextDayRisk ?? "").toUpperCase() === "HIGH"
    ).length;
    const lockedRows = rowsWithAdaptive.filter((r) => !!r.is_locked).length;
    return { neuralBiasApplied, highNextDayRisk, lockedRows };
  }, [rowsWithAdaptive]);

  // ── Per-player composite load (for Readiness × Load quadrant) ──
  // Keyed by player_id → { compositeScore (0–1), concernLevel, fatigueType }.
  // Computed once at team scope so the quadrant can render composite risk
  // on its x-axis instead of raw planned_pl.
  //
  // NBS fallback: the outdoor burden formula in signals.ts is weighted heavily
  // on HIR + band6 exposure. For teams/sessions where those signals are absent
  // (e.g. HIR baseline is 0 across the 28-day window, common for recreational
  // GPS coverage), the burden score collapses to 0 even when `player_load` is
  // populated. When that happens AND we have a real `playerLoadSpike`, derive
  // a synthetic burden from the PL spike so the composite reflects actual
  // training volume rather than reporting "no data".
  type PlayerCompositeEntry = {
    compositeScore: number;
    concernLevel: "none" | "low" | "moderate" | "high";
    fatigueType: string | null;
    /** Today PL ÷ 28d baseline PL, raw ratio. null when no PL data. */
    playerLoadSpike: number | null;
    /** loadRatio ∈ [0, 1] derived from spike: 0 = no training, 0.5 = on baseline, 1.0 = 2× baseline or more. */
    loadRatio: number | null;
    // Per-source spike ratios surfaced in the Today quadrant's breakdown panel.
    hirSpike: number | null;
    decelSpike: number | null;
    accelSpike: number | null;
    imaTotalSpike: number | null;
    fmpDynamicHighSpike: number | null;
    mode: "indoor" | "outdoor" | null;
  };
  const playerComposites = useMemo<Record<string, PlayerCompositeEntry>>(() => {
    const out: Record<string, PlayerCompositeEntry> = {};

    // Local clone of signals.ts normalizeRatio — keep weights consistent.
    const normalizePlSpike = (spike: number | null | undefined): number | null => {
      if (spike == null || !Number.isFinite(spike)) return null;
      const elevated = 1.15;
      const high = 1.6;
      if (spike <= elevated) return 0;
      if (spike >= high) return 1;
      return Math.max(0, Math.min(1, (spike - elevated) / (high - elevated)));
    };

    for (const r of rowsWithAdaptive) {
      const pid = String(r.player_id);
      const catapultSignals = (r._catapult_signals as Record<string, unknown> | null | undefined) ?? null;

      const rawNbs = catapultSignals?.neuromuscularBurdenScore;
      const nbs = typeof rawNbs === "number" && Number.isFinite(rawNbs) ? rawNbs : null;
      const rawPlSpike = catapultSignals?.playerLoadSpike;
      const plSpike = typeof rawPlSpike === "number" && Number.isFinite(rawPlSpike) ? rawPlSpike : null;
      const rawDataQuality = String(catapultSignals?.dataQuality ?? "");

      // If the main burden formula collapsed to ~0 but we DO have a PL spike
      // with usable baseline coverage, synthesize a burden score from it.
      let effectiveNbs: number | null = nbs;
      let synthesized = false;
      if (
        (nbs == null || nbs <= 0.05) &&
        plSpike != null &&
        rawDataQuality !== "insufficient"
      ) {
        const plBurden = normalizePlSpike(plSpike);
        if (plBurden != null && plBurden > 0) {
          effectiveNbs = plBurden;
          synthesized = true;
        }
      }

      // Recompute externalLoadState if we synthesized, otherwise trust the one
      // signals.ts already computed (it already factors PL into elevated/high counts).
      const reportedState = String(catapultSignals?.externalLoadState ?? "");
      let externalLoadState: "normal" | "elevated" | "high" | "unknown" =
        (["normal", "elevated", "high"].includes(reportedState)
          ? (reportedState as "normal" | "elevated" | "high")
          : "unknown");
      if (synthesized && effectiveNbs != null) {
        if (effectiveNbs >= 0.66) externalLoadState = "high";
        else if (effectiveNbs >= 0.34) externalLoadState = "elevated";
        else if (externalLoadState === "unknown") externalLoadState = "normal";
      }

      const result = computeCompositeLoadConcern({
        rpeAcwr: null,
        neuromuscularBurdenScore: effectiveNbs,
        externalLoadState,
      });
      // loadRatio: map playerLoadSpike (today/baseline, ~0..3) onto [0,1]
      // so that 1.0× baseline lands at x=0.5 and ≥2× lands at x=1.0.
      const loadRatio = plSpike != null
        ? Math.max(0, Math.min(1, plSpike / 2))
        : null;

      // Extract per-source spikes for the breakdown panel in the
      // detail view. All optional — `signals.ts` may not populate every
      // field on every team (indoor mode skips HIR, outdoor skips FMP).
      const numOrNull = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      const reportedMode = String(catapultSignals?.dataQuality ?? "");
      // Mode is inferred from which spike fields are populated in signals.ts —
      // FMP signals indicate indoor mode, HIR/decel indicate outdoor.
      const fmpHigh = numOrNull(catapultSignals?.fmpDynamicHighSpike);
      const hirSpike = numOrNull(catapultSignals?.hirSpike);
      const inferredMode: "indoor" | "outdoor" | null =
        fmpHigh != null && fmpHigh > 0 ? "indoor"
          : hirSpike != null && hirSpike > 0 ? "outdoor"
          : null;

      out[pid] = {
        compositeScore: result.compositeScore,
        concernLevel: result.concernLevel,
        fatigueType: result.fatigueType ?? null,
        playerLoadSpike: plSpike,
        loadRatio,
        // Per-source spikes for breakdown panel
        hirSpike,
        decelSpike: numOrNull(catapultSignals?.decelSpike),
        accelSpike: numOrNull(catapultSignals?.accelSpike),
        imaTotalSpike: numOrNull(catapultSignals?.imaTotalSpike),
        fmpDynamicHighSpike: fmpHigh,
        mode: inferredMode,
      };
      // reportedMode is captured in case we want to expose data quality later
      void reportedMode;
    }
    return out;
  }, [rowsWithAdaptive]);

  const readinessRiskReportData = useMemo<ReadinessRiskReportData>(() => {
    const flaggedRows = rowsWithAdaptive.filter((r) => {
      const flag = String(r.final_flag ?? "").toUpperCase();
      return flag === "YELLOW" || flag === "RED";
    });

    const hsrYesterday = toIntOrNull(ctxHsr);
    const yesterdayLoadBand: "LOW" | "MODERATE" | "HIGH" | null =
      String(ctxIntensity ?? "").toUpperCase() === "OFF"
        ? "LOW"
        : hsrYesterday == null
        ? null
        : hsrYesterday >= 800
        ? "HIGH"
        : hsrYesterday >= 500
        ? "MODERATE"
        : "LOW";

    const flaggedPlayers: ReadinessRiskReportPlayer[] = flaggedRows.map((r) => {
      const rawTotalScore = typeof r.total_score === "number" ? r.total_score : null;
      const normalizedReadinessScore =
        rawTotalScore == null ? null : Math.max(0, Math.min(100, ((rawTotalScore - 5) / 20) * 100));
      const weekSetupRowForEntry =
        (weekGrid ?? []).find((x: any) => dateKey(x.day_date) === dateKey(String(r.entry_date ?? today))) ?? null;
      const mdContextResolved = resolveSessionMdContextFromSources({
        weekSetupDay: weekSetupRowForEntry,
        rowMdContext: graphMdContextFromToken(r.md_day ?? null) ?? null,
        teamMdContext: graphMdContextFromToken(mdDayToday) ?? null,
        plannedFocusMdContext: graphMdContextFromToken(mdFromPlannedFocus(r.planned_focus ?? null)) ?? null,
        previewMdContext: graphMdContextFromToken(planPreview?.md_day ?? null) ?? null,
      });
      const mdContextInput = mdContextResolved.mdContext;
      const neuralFatigueBandInput = graphNeuralFatigueBandFromState(r._neural_load?.neuralLoadState);
      const externalLoadToday = r._external_load_today ?? null;
      const externalLoadBaseline = r._external_load_baseline ?? null;
      const graphSession = buildDevDailySessionAdapterResult({
        athleteState: graphAthleteStateFromFlag(r.final_flag),
        mdContext: mdContextInput,
        readinessScore: normalizedReadinessScore,
        neuralFatigueBand: neuralFatigueBandInput,
        yesterdayLoadBand,
        externalLoad: {
          playerLoad: externalLoadToday?.player_load ?? null,
          playerLoad7DayAverage: externalLoadBaseline?.playerLoadAvg ?? null,
          sprintDistance: externalLoadToday?.sprint_distance ?? null,
          sprintDistance7DayAverage: externalLoadBaseline?.sprintDistanceAvg ?? null,
        },
      });

      const ateState = String(graphSession.lightAteDecision?.athleteState ?? "").toUpperCase();
      const ateSessionMode: "full" | "modified" | "recovery" =
        ateState === "RED" ? "recovery" : ateState === "YELLOW" ? "modified" : "full";
      const reasons = graphSession.ateDecisionPanel?.reasonLines?.filter(Boolean) ?? [];
      const tm = normalizeTrainingModifier(r.training_modifier);
      const fatigue = fatigueByPlayer.get(String(r.player_id)) ?? null;
      const fatigueMetrics = fatigue && typeof fatigue === "object" ? (fatigue as Record<string, unknown>) : null;
      const fatigueType = String((fatigueMetrics?.primaryFatigueType as string | undefined) ?? "").toUpperCase();
      const fatigueSeverity = String((fatigueMetrics?.severity as string | undefined) ?? "").toUpperCase();
      const tissueSignal = deriveTissueProtectionSignal({
        fatigueType,
        fatigueSeverity,
        sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : null,
        noteText: r.notes ?? null,
        neuralFatigueBand: neuralFatigueBandInput,
        readinessScore: normalizedReadinessScore,
        zScore: typeof r._z_today === "number" ? r._z_today : null,
        stenScore: typeof r._sten === "number" ? r._sten : null,
      });
      const acwrValue = toMaybeFinite(fatigueMetrics?.acwr) ?? toMaybeFinite(tm?.acwr) ?? toMaybeFinite(tm?.load?.acwr);
      const hrvValue = toMaybeFinite(fatigueMetrics?.hrv) ?? toMaybeFinite(tm?.hrv);
      const hrvChangePctValue = toMaybeFinite(fatigueMetrics?.hrv_change_pct) ?? toMaybeFinite(tm?.hrv_change_pct);
      const volatilityValue = toMaybeFinite(tm?.pi?.volatility) ?? (teamIntel?.volatility_pct ?? null);
      const lightAteStateRaw = String(graphSession.lightAteDecision?.athleteState ?? "").toUpperCase();
      const lightAteState =
        lightAteStateRaw === "RED"
          ? "RED"
          : lightAteStateRaw === "YELLOW"
          ? "YELLOW"
          : lightAteStateRaw === "GREEN" || lightAteStateRaw === "GREEN_PLUS"
          ? "GREEN"
          : "GRAY";
      const snapshot = buildDailyAthleteSnapshot({
        athleteId: String(r.player_id),
        date: String(r.entry_date ?? today),
        manual: {
          id: r.readiness_entry_id ?? null,
          totalScore: rawTotalScore,
          soreness: typeof r.muscle_soreness === "number" ? r.muscle_soreness : null,
          stress: typeof r.stress_mood === "number" ? r.stress_mood : null,
          mood: typeof r.stress_mood === "number" ? r.stress_mood : null,
          sleepQuality: typeof r.sleep_quality === "number" ? r.sleep_quality : null,
          motivation: typeof r.fatigue_energy === "number" ? r.fatigue_energy : null,
          completed: rawTotalScore != null,
          sourceDate: String(r.entry_date ?? today),
        },
        load: {
          zScore: typeof r._z_today === "number" ? r._z_today : null,
          deltaZ: typeof r._dz === "number" ? r._dz : null,
          acuteLoad: toIntOrNull(ctxHsr) ?? null,
          acwr: acwrValue ?? null,
          sessionRpeLoad: toMaybeFinite(tm?.session_load) ?? null,
          volatility5d: volatilityValue ?? null,
          sourceDate: String(r.entry_date ?? today),
        },
        context: {
          weekSetupLabel: r.md_day ?? mdDayToday,
          expectedSessionType: graphSession.ateDecisionPanel?.sessionLabel ?? null,
          rehab: false,
          returnToPlay: false,
          sourceDate: String(r.entry_date ?? today),
        },
        externalLoad: {
          totalDistance: externalLoadToday?.total_distance ?? null,
          highSpeedDistance: externalLoadToday?.high_speed_distance ?? null,
          sprintDistance: externalLoadToday?.sprint_distance ?? null,
          accelerations: externalLoadToday?.accelerations ?? null,
          decelerations: externalLoadToday?.decelerations ?? null,
          playerLoad: externalLoadToday?.player_load ?? null,
          maxVelocity: externalLoadToday?.max_velocity ?? null,
          playerLoad7DayAverage: externalLoadBaseline?.playerLoadAvg ?? null,
          sprintDistance7DayAverage: externalLoadBaseline?.sprintDistanceAvg ?? null,
          source: externalLoadToday ? "catapult" : null,
          sourceDate: String(r.entry_date ?? today),
        },
      });
      const readinessDecision = buildExplainableReadinessDecision({
        playerId: String(r.player_id),
        playerName: r.full_name,
        date: r.entry_date,
        dailySnapshot: snapshot,
        readinessScore: normalizedReadinessScore ?? undefined,
        checkinScore: rawTotalScore ?? undefined,
        zScore: typeof r._z_today === "number" ? r._z_today : undefined,
        deltaZ: typeof r._dz === "number" ? r._dz : undefined,
        volatility: volatilityValue ?? undefined,
        sleepScore: typeof r.sleep_quality === "number" ? r.sleep_quality : undefined,
        hrvScore: hrvValue ?? undefined,
        hrvChangePct: hrvChangePctValue ?? undefined,
        acuteLoad: toIntOrNull(ctxHsr) ?? undefined,
        acwr: acwrValue ?? undefined,
        durationMinutes: toNumOrNull(ctxDuration) ?? undefined,
        neuralFatigueLevel:
          neuralFatigueBandInput === "VERY_HIGH" || neuralFatigueBandInput === "HIGH"
            ? "high"
            : neuralFatigueBandInput === "MODERATE"
            ? "moderate"
            : "low",
        neuralFatigueReason: r._neural_load?.summary ?? null,
        stenScore: typeof r._sten === "number" ? r._sten : undefined,
        tissueSignal: tissueSignal.tissueSignal,
        tissueSeverity: tissueSignal.tissueSeverity,
        explicitPainTextFlag: tissueSignal.explicitPainTextFlag,
        sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : undefined,
        sorenessFlag: typeof r.muscle_soreness === "number" ? r.muscle_soreness <= 2 : undefined,
        painFlag: tissueSignal.painProtection,
        highSpeedRunning: toIntOrNull(ctxHsr) ?? undefined,
        maxVelocityPct: toNumOrNull(ctxVmax) ?? undefined,
        gpsSpike: String(ctxIntensity ?? "").toUpperCase() !== "OFF" && (toIntOrNull(ctxHsr) ?? 0) >= 1000,
        recentYellowDays: toMaybeFinite(tm?.recent_yellow_days) ?? undefined,
        recentRedDays: toMaybeFinite(tm?.recent_red_days) ?? undefined,
        matchCongestion: undefined,
        travelLoad: undefined,
        dataCompleteness: undefined,
        lightAteState,
        catapultDailyLoad: r._catapult_baseline ? (r._catapult_signals ? (r._external_load_today ? normalizeCatapultDailyLoadRow(r._external_load_today as unknown as Record<string, unknown>) : null) : null) ?? undefined : undefined,
        catapultBaseline: r._catapult_baseline ?? undefined,
        catapultSignals: r._catapult_signals ?? undefined,
        externalLoadState: r._catapult_signals?.externalLoadState ?? undefined,
        catapultReadinessModifier: r._catapult_modifier ?? undefined,
      });
      const injuryRiskDecision = buildInjuryRiskDecision({
        acwr: acwrValue ?? undefined,
        zScore: typeof r._z_today === "number" ? r._z_today : undefined,
        deltaZ: typeof r._dz === "number" ? r._dz : undefined,
        volatility: volatilityValue ?? undefined,
        recentYellowDays: toMaybeFinite(tm?.recent_yellow_days) ?? undefined,
        recentRedDays: toMaybeFinite(tm?.recent_red_days) ?? undefined,
        highSpeedRunning: toIntOrNull(ctxHsr) ?? undefined,
        maxVelocityPct: toNumOrNull(ctxVmax) ?? undefined,
        sleepScore: typeof r.sleep_quality === "number" ? r.sleep_quality : undefined,
        hrvChangePct: hrvChangePctValue ?? undefined,
        sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : undefined,
        sorenessFlag: typeof r.muscle_soreness === "number" ? r.muscle_soreness <= 2 : undefined,
        painFlag: tissueSignal.painProtection,
        gpsSpike: String(ctxIntensity ?? "").toUpperCase() !== "OFF" && (toIntOrNull(ctxHsr) ?? 0) >= 1000,
        matchCongestion: undefined,
        travelLoad: undefined,
      }, readinessDecision);
      const neural = r._neural_load ?? null;
      const indoorIdx = playerIndoorStatus[String(r.player_id)];
      const decelIdx = playerDecelStatus[String(r.player_id)];
      const athleteDecision = buildAthleteDecision({
        snapshot,
        readinessDecision,
        injuryDecision: injuryRiskDecision,
        neural: neural
          ? {
              status:
                String(neural.neuralLoadState ?? "").toUpperCase() === "CRITICAL" || String(neural.neuralLoadState ?? "").toUpperCase() === "HIGH"
                  ? "suppressed"
                  : String(neural.neuralLoadState ?? "").toUpperCase() === "RISING"
                  ? "caution"
                  : "clear",
              confidence: 0.65,
              summary: neural.summary ?? null,
            }
          : null,
        // Indoor Load Intelligence — same wiring as the per-player
        // dashboard callsite below. Keeps the team aggregate in sync
        // with what the per-player view reports.
        indoorLoad: indoorIdx
          ? {
              compositeBand: indoorIdx.compositeBand ?? null,
              mcburnieFlag: indoorIdx.mcburnieFlag ?? null,
              acwrFlag: indoorIdx.acwrFlag ?? null,
            }
          : null,
        decelIntelligence: decelIdx
          ? { overallFlag: decelIdx.overallFlag, summary: decelIdx.explanation }
          : null,
        hardBlock: false,
      });

      return {
        name: r.full_name,
        readinessStatus: String(r.final_flag).toUpperCase() === "RED" ? "RED" : "YELLOW",
        // Always use rawTotalScore (5-25 modern). Legacy r.readiness was on
        // a 1-10 scale — mixing the two produced inconsistent score values
        // depending on which column was populated. Fixed 2026-04-29.
        score: rawTotalScore,
        confidence: athleteDecision.decisionConfidence,
        why: athleteDecision.explanationLines.length ? athleteDecision.explanationLines : reasons,
        checkInScore: rawTotalScore,
        zScore: typeof r._z_today === "number" ? r._z_today : null,
        deltaZ: typeof r._dz === "number" ? r._dz : null,
        acwr: acwrValue,
        sleepScore: typeof r.sleep_quality === "number" ? r.sleep_quality : null,
        hrv: hrvValue,
        volatility: volatilityValue,
        ateSessionMode: athleteDecision.sessionMode === "pending" ? ateSessionMode : athleteDecision.sessionMode,
        injuryRiskLevel: injuryRiskDecision.injuryRiskLevel,
        injuryConfidence: injuryRiskDecision.confidence,
        injuryWhy: injuryRiskDecision.why,
        injuryRecommendation: injuryRiskDecision.recommendation,
        // Counterfactuals — surfaced into the per-player snapshot so
        // downstream consumers (BriefingCard attention list, PlayerClient)
        // can render the "what would need to change" lever alongside the
        // existing reasons[]. Empty for GREEN/GRAY players (verdicts that
        // don't benefit from counterfactual explanation).
        counterfactuals: athleteDecision.counterfactuals ?? [],
      };
    });

    const green = rowsWithAdaptive.filter((r) => String(r.final_flag ?? "").toUpperCase() === "GREEN").length;
    const yellow = rowsWithAdaptive.filter((r) => String(r.final_flag ?? "").toUpperCase() === "YELLOW").length;
    const red = rowsWithAdaptive.filter((r) => String(r.final_flag ?? "").toUpperCase() === "RED").length;

    return {
      teamName: rowsWithAdaptive[0]?.team ?? "Team",
      date: today,
      flaggedPlayers,
      summary: { green, yellow, red },
    };
  }, [rowsWithAdaptive, ctxHsr, ctxIntensity, mdDayToday, planPreview?.md_day, weekGrid, teamIntel?.volatility_pct, fatigueByPlayer, today]);

  // ── Counterfactual lookup map keyed by player_id ─────────────────
  // Built from readinessRiskReportData (which already runs
  // buildAthleteDecision per flagged player) so we don't re-run the
  // engine. Used by DailyBriefingCard to render the top counterfactual
  // as a 1-line hint under driver chips, surfacing the "what would
  // need to change" lever directly in the morning view (where coaches
  // actually look) instead of behind 3 clicks of accordion drill-down.
  const playerCounterfactualsMap = useMemo<Record<string, Array<{
    signal: string;
    currentValue: string;
    hypotheticalValue: string;
    hypotheticalState: "GREEN" | "YELLOW" | "RED" | "GRAY";
    impact: 1 | 2 | 3;
    descriptionEN: string;
    descriptionIS: string;
  }>>>(() => {
    const out: Record<string, Array<{
      signal: string;
      currentValue: string;
      hypotheticalValue: string;
      hypotheticalState: "GREEN" | "YELLOW" | "RED" | "GRAY";
      impact: 1 | 2 | 3;
      descriptionEN: string;
      descriptionIS: string;
    }>> = {};
    // Map flaggedPlayers names back to player_ids by walking
    // rowsWithAdaptive in parallel — readinessRiskReportData uses the
    // same source order as flaggedRows.filter().
    const flaggedRowsLocal = rowsWithAdaptive.filter((r) => {
      const flag = String(r.final_flag ?? "").toUpperCase();
      return flag === "RED" || flag === "YELLOW";
    });
    readinessRiskReportData.flaggedPlayers.forEach((p, idx) => {
      const row = flaggedRowsLocal[idx];
      if (!row || !p.counterfactuals?.length) return;
      out[String(row.player_id)] = p.counterfactuals;
    });
    return out;
  }, [readinessRiskReportData, rowsWithAdaptive]);

  async function downloadReadinessRiskReport() {
    try {
      setPdfDownloading(true);
      const blob = await pdf(<ReadinessRiskReportDocument data={readinessRiskReportData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `readiness-risk-report-${readinessRiskReportData.date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("readiness risk report download failed:", e?.message ?? e);
      alert("Could not generate PDF report.");
    } finally {
      setPdfDownloading(false);
    }
  }

  // Pre-Session report — same engine as the /coach/load-plan page, downloaded
  // straight from Today so the coach gets both reports in one place.
  async function downloadPreSessionReport(dateArg?: string) {
    try {
      setPdfPreDownloading(true);
      // Authoritative rest-day flag for the resolved day (shared with the page).
      const restDay = readRestDayPref(dateArg || today);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { alert("Not signed in."); return; }
      const res = await fetch(`/api/coach/load-plan${dateArg ? `?date=${dateArg}` : ""}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(`Pre-session report failed: ${j.error ?? res.status}`); return; }
      const j = await res.json();
      await downloadLoadPlanPdf(
        j.plan as LoadPlanForPdf,
        (j.topAttention ?? []) as Parameters<typeof downloadLoadPlanPdf>[1],
        (j.readiness ?? null) as Parameters<typeof downloadLoadPlanPdf>[2],
        restDay,
      );
    } catch (e: unknown) {
      console.error("pre-session report download failed:", e);
      alert("Could not generate pre-session PDF report.");
    } finally {
      setPdfPreDownloading(false);
    }
  }

  async function downloadPostTrainingReport(dateArg?: string) {
    try {
      setPdfPostDownloading(true);

      // ── 1. Fetch CURRENT-TEAM active players ─────────────────
      // team_id filter is critical: admin coaches have RLS access to all
      // players globally; without scope, the PDF would include other clubs'
      // athletes. Same bug class as GPS tab (#310) and Catapult upload
      // (#313). Audit found this as the third instance — fixed 2026-05-15.
      if (!coachTeamId) {
        alert("Lið ekki tilgreint — endurhladdu síðuna.");
        return;
      }
      const { data: playerData } = await supabase
        .from("players")
        .select("id, full_name, position")
        .eq("is_active", true)
        .eq("team_id", coachTeamId)
        .order("full_name");

      if (!playerData?.length) {
        alert("Engir leikmenn fundust.");
        return;
      }

      const playerIds = (playerData as Array<Record<string, unknown>>).map((p) => String(p.id));

      // ── 2. Resolve the session date ──────────────────────────
      // Default: the most recent session. When a date is chosen in the picker,
      // use it as the upper bound so the coach can pull a PAST session — we land
      // on that day's session, or the most recent one before it (so picking a
      // rest day still yields the last real session rather than an empty report).
      const boundDate = dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg) ? dateArg : today;
      const { data: latestDateRows } = await supabase
        .from("player_external_load_daily")
        .select("date")
        .in("source", ["catapult", "manual"])
        .in("player_id", playerIds)
        .lte("date", boundDate)
        .order("date", { ascending: false })
        .limit(1);

      const sessionDate: string = (latestDateRows?.[0] as { date?: string } | undefined)?.date ?? boundDate;
      const chronicStart = addDaysISO(sessionDate, -27);

      // Fetch only columns that actually exist in player_external_load_daily
      const { data: loadRows, error: loadErr } = await supabase
        .from("player_external_load_daily")
        .select("player_id, date, total_distance, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, tot_as, decel_b2_3_tot_effs_gen2, tot_ds, total_player_load, player_load_per_minute, max_vel, ima_fr_band58_total_distance")
        .in("source", ["catapult", "manual"])
        .in("player_id", playerIds)
        .gte("date", chronicStart)
        .lte("date", sessionDate)
        .order("date");

      if (loadErr) {
        console.error("GPS load fetch error:", loadErr);
        alert(`GPS gögn villa: ${loadErr.message}`);
        return;
      }

      // ── 2b. Fetch RPE submissions for the session date ────────
      type RpeRow = {
        player_id: string;
        rpe: number | null;
        session_load: number | null;
        duration_minutes: number | null;
      };
      const { data: rpeRows } = await supabase
        .from("session_rpe_entries")
        .select("player_id, rpe, session_load, duration_minutes")
        .eq("session_date", sessionDate)
        .in("player_id", playerIds);

      // Sum up session load per player (a player may have submitted multiple sessions)
      const rpeByPlayer = new Map<string, { rpe: number; sessionLoad: number; durationMinutes: number }>();
      for (const row of ((rpeRows ?? []) as RpeRow[])) {
        const pid = String(row.player_id);
        const cur = rpeByPlayer.get(pid);
        const load = Number(row.session_load ?? 0);
        const dur = Number(row.duration_minutes ?? 0);
        const rpe = Number(row.rpe ?? 0);
        if (!cur) {
          rpeByPlayer.set(pid, { rpe, sessionLoad: load, durationMinutes: dur });
        } else {
          // Multiple sessions: use weighted avg RPE and sum load
          const totalDur = cur.durationMinutes + dur;
          const weightedRpe = totalDur > 0
            ? (cur.rpe * cur.durationMinutes + rpe * dur) / totalDur
            : rpe;
          rpeByPlayer.set(pid, {
            rpe: weightedRpe,
            sessionLoad: cur.sessionLoad + load,
            durationMinutes: totalDur,
          });
        }
      }

      // ── 3. Build readiness flag lookup from current rows ─────
      const flagByPlayerId = new Map<string, "GREEN" | "YELLOW" | "RED">();
      for (const r of rowsWithAdaptive) {
        const flag = String(r.final_flag ?? "").toUpperCase();
        if (flag === "GREEN" || flag === "YELLOW" || flag === "RED") {
          flagByPlayerId.set(String(r.player_id), flag as "GREEN" | "YELLOW" | "RED");
        }
      }

      // ── 4. Compute per-player metrics ─────────────────────────
      type LoadRow = {
        player_id: string; date: string;
        total_distance: number | null;
        velocity_band5_total_distance: number | null; velocity_band6_total_distance: number | null;
        accel_b2_3_tot_effs_gen2: number | null; tot_as: number | null;
        decel_b2_3_tot_effs_gen2: number | null; tot_ds: number | null;
        total_player_load: number | null; player_load_per_minute: number | null;
        max_vel: number | null;
      };

      const rows28 = ((loadRows ?? []) as unknown as LoadRow[]);
      const rowsToday = rows28.filter((r) => r.date === sessionDate);
      const byPlayer = new Map<string, LoadRow[]>();
      for (const r of rows28) {
        const list = byPlayer.get(r.player_id) ?? [];
        list.push(r);
        byPlayer.set(r.player_id, list);
      }

      function avgOf(vals: (number | null)[]): number | null {
        const nums = vals.filter((v): v is number => v != null && Number.isFinite(v));
        return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
      }
      function pctVsNorm(val: number | null, norm: number | null): number | null {
        if (val == null || norm == null || norm === 0) return null;
        return ((val - norm) / norm) * 100;
      }

      const reportPlayers: PostTrainingReportPlayer[] = [];
      const includedPids = new Set<string>();

      // ── Pass 1: players WITH GPS data ────────────────────────
      for (const player of playerData as Array<Record<string, unknown>>) {
        const pid = String(player.id);
        const todayRow = rowsToday.find((r) => r.player_id === pid) ?? null;
        if (!todayRow) continue; // handled in pass 2 if they have RPE

        includedPids.add(pid);

        const hist = byPlayer.get(pid) ?? [];
        const hist28 = hist.filter((r) => r.date >= chronicStart && r.date <= sessionDate);

        const hsdToday = (todayRow.velocity_band5_total_distance ?? 0) + (todayRow.velocity_band6_total_distance ?? 0);
        const hsd28Avg = avgOf(hist28.map((r) => (r.velocity_band5_total_distance ?? 0) + (r.velocity_band6_total_distance ?? 0)));
        const pl28Avg = avgOf(hist28.map((r) => r.total_player_load));
        const dist28Avg = avgOf(hist28.map((r) => r.total_distance));

        const acuteStart = addDaysISO(sessionDate, -6);
        const acuteRows = hist28.filter((r) => r.date >= acuteStart && r.date <= sessionDate);
        const acute7 = avgOf(acuteRows.map((r) => r.total_distance));
        const chronic28 = dist28Avg;
        const acwr = acute7 != null && chronic28 != null && chronic28 > 0 ? acute7 / chronic28 : null;

        const readinessFlag = flagByPlayerId.get(pid) ?? "—" as const;

        const reasons: string[] = [];
        let attentionFlag: "OK" | "MONITOR" | "ALERT" = "OK";

        if (acwr != null && acwr > 1.5) {
          reasons.push(`ACWR ${acwr.toFixed(2)} — klínískt hár álag (>1.5)`);
          attentionFlag = "ALERT";
        } else if (acwr != null && acwr > 1.3) {
          reasons.push(`ACWR ${acwr.toFixed(2)} — hár álag (>1.3)`);
          attentionFlag = "MONITOR";
        }

        if ((readinessFlag === "RED" || readinessFlag === "YELLOW") && acwr != null && acwr > 1.2) {
          reasons.push(`${readinessFlag} readiness + hár ACWR — hvíldarþörf`);
          attentionFlag = readinessFlag === "RED" ? "ALERT" : "MONITOR";
        }

        const distPct = pctVsNorm(todayRow.total_distance, dist28Avg);
        if (distPct != null && distPct > 30) {
          reasons.push(`Vegalengd ${Math.round(distPct)}% yfir 28D meðaltali`);
          if (attentionFlag !== "ALERT") attentionFlag = "MONITOR";
        }

        const plPct = pctVsNorm(todayRow.total_player_load, pl28Avg);
        if (plPct != null && plPct > 30) {
          reasons.push(`Player Load ${Math.round(plPct)}% yfir 28D meðaltali`);
          if (attentionFlag !== "ALERT") attentionFlag = "MONITOR";
        }

        if (readinessFlag === "RED" && attentionFlag === "OK") {
          reasons.push("RED readiness í dag — fylgjast með líðan á morgun");
          attentionFlag = "MONITOR";
        }

        const rpeEntry = rpeByPlayer.get(pid) ?? null;

        reportPlayers.push({
          name: String(player.full_name ?? ""),
          position: String(player.position ?? "—"),
          readinessFlag,
          totalDistance: todayRow.total_distance,
          totalDistancePct: pctVsNorm(todayRow.total_distance, dist28Avg),
          hsd: hsdToday > 0 ? hsdToday : null,
          hsdPct: pctVsNorm(hsdToday > 0 ? hsdToday : null, hsd28Avg),
          playerLoad: todayRow.total_player_load,
          playerLoadPct: plPct,
          playerLoadPerMin: todayRow.player_load_per_minute,
          accelB23: todayRow.accel_b2_3_tot_effs_gen2,
          decelB23: todayRow.decel_b2_3_tot_effs_gen2,
          maxVelocity: todayRow.max_vel,
          acwr,
          rpe: rpeEntry ? rpeEntry.rpe : null,
          sessionLoad: rpeEntry ? rpeEntry.sessionLoad : null,
          durationMinutes: rpeEntry ? rpeEntry.durationMinutes : null,
          rpeSubmitted: rpeEntry != null,
          attentionFlag,
          attentionReason: reasons,
        });
      }

      // ── Pass 2: players WITHOUT GPS but WITH RPE (e.g. goalkeepers) ──
      for (const player of playerData as Array<Record<string, unknown>>) {
        const pid = String(player.id);
        if (includedPids.has(pid)) continue; // already added in pass 1
        const rpeEntry = rpeByPlayer.get(pid) ?? null;
        if (!rpeEntry) continue; // no GPS, no RPE — skip entirely

        const readinessFlag = flagByPlayerId.get(pid) ?? "—" as const;
        const reasons: string[] = [];
        let attentionFlag: "OK" | "MONITOR" | "ALERT" = "OK";
        if (readinessFlag === "RED") {
          reasons.push("RED readiness í dag — fylgjast með líðan á morgun");
          attentionFlag = "MONITOR";
        }

        reportPlayers.push({
          name: String(player.full_name ?? ""),
          position: String(player.position ?? "—"),
          readinessFlag,
          totalDistance: null,
          totalDistancePct: null,
          hsd: null,
          hsdPct: null,
          playerLoad: null,
          playerLoadPct: null,
          playerLoadPerMin: null,
          accelB23: null,
          decelB23: null,
          maxVelocity: null,
          acwr: null,
          rpe: rpeEntry.rpe,
          sessionLoad: rpeEntry.sessionLoad,
          durationMinutes: rpeEntry.durationMinutes,
          rpeSubmitted: true,
          attentionFlag,
          attentionReason: reasons,
        });
      }

      // GPS players sorted by distance desc; RPE-only players sorted by name at the bottom
      const gpsPlayers = reportPlayers.filter((p) => p.totalDistance != null);
      const rpeOnlyPlayers = reportPlayers.filter((p) => p.totalDistance == null);
      gpsPlayers.sort((a, b) => (b.totalDistance ?? 0) - (a.totalDistance ?? 0));
      rpeOnlyPlayers.sort((a, b) => a.name.localeCompare(b.name));
      reportPlayers.length = 0;
      reportPlayers.push(...gpsPlayers, ...rpeOnlyPlayers);

      // ── 5. Team averages ─────────────────────────────────────
      const teamAvg = {
        totalDistance: avgOf(reportPlayers.map((p) => p.totalDistance)),
        hsd: avgOf(reportPlayers.map((p) => p.hsd)),
        playerLoad: avgOf(reportPlayers.map((p) => p.playerLoad)),
        accelB23: avgOf(reportPlayers.map((p) => p.accelB23)),
        decelB23: avgOf(reportPlayers.map((p) => p.decelB23)),
        maxVelocity: reportPlayers.reduce((max, p) => (p.maxVelocity != null && (max == null || p.maxVelocity > max) ? p.maxVelocity : max), null as number | null),
      };

      const rpeSubmitters = reportPlayers.filter((p) => p.rpeSubmitted);
      const rpeTeamAvg = rpeSubmitters.length
        ? rpeSubmitters.reduce((s, p) => s + (p.rpe ?? 0), 0) / rpeSubmitters.length
        : null;
      const rpeTotalLoad = rpeSubmitters.length
        ? rpeSubmitters.reduce((s, p) => s + (p.sessionLoad ?? 0), 0)
        : null;

      // ── 5a. Load explainability — today vs recent days vs match ───────
      // For each metric, build the team's daily total across the 28-day window.
      // The mean of prior days is the recent norm; the peak prior day is a
      // transparent "≈ a typical match" reference (matches are a team's
      // highest-load days).
      const teamMetricSeries = (getVal: (r: LoadRow) => number | null) => {
        const byDate = new Map<string, number>();
        for (const r of rows28) {
          const v = Number(getVal(r) ?? 0);
          if (Number.isFinite(v) && v > 0) byDate.set(r.date, (byDate.get(r.date) ?? 0) + v);
        }
        const today = byDate.get(sessionDate) ?? 0;
        const prior = Array.from(byDate.entries()).filter(([d, v]) => d < sessionDate && v > 0).map(([, v]) => v);
        const avg = prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : null;
        const peak = prior.length ? Math.max(...prior) : null;
        return {
          today: today > 0 ? today : null,
          avg,
          peak,
          pctAvg: avg && avg > 0 ? Math.round((today / avg) * 100) : null,
          pctMatch: peak && peak > 0 ? Math.round((today / peak) * 100) : null,
        };
      };
      const plSeries = teamMetricSeries((r) => r.total_player_load);
      const distSeries = teamMetricSeries((r) => r.total_distance);
      const hsdSeries = teamMetricSeries((r) =>
        Number(r.velocity_band5_total_distance ?? 0) + Number(r.velocity_band6_total_distance ?? 0));

      // Distribution of players by today's Player Load vs their own 28-day norm.
      const withPL = reportPlayers.filter((p) => p.totalDistance != null && p.playerLoadPct != null) as Array<{ playerLoadPct: number }>;
      const distribution = {
        total: withPL.length,
        above: withPL.filter((p) => p.playerLoadPct >= 30).length,        // ≥130% of norm
        elevated: withPL.filter((p) => p.playerLoadPct >= 10 && p.playerLoadPct < 30).length,
        inLine: withPL.filter((p) => p.playerLoadPct > -10 && p.playerLoadPct < 10).length,
        below: withPL.filter((p) => p.playerLoadPct <= -10).length,
      };

      // Per-player spikes: today's Player Load ≥30% above their own 28-day norm,
      // or ACWR ≥ 1.5 (Gabbett sweet-spot ceiling). Sorted by magnitude.
      const spikePlayers = reportPlayers
        .filter((p) => p.totalDistance != null && ((p.acwr != null && p.acwr >= 1.5) || (p.playerLoadPct != null && p.playerLoadPct >= 30)))
        .map((p) => ({ name: p.name, plPct: p.playerLoadPct, distPct: p.totalDistancePct, acwr: p.acwr }))
        .sort((a, b) => (b.plPct ?? 0) - (a.plPct ?? 0));
      const teamSpike = plSeries.pctAvg != null && plSeries.pctAvg >= 140;
      const loadSummary = { pl: plSeries, dist: distSeries, hsd: hsdSeries, distribution, teamSpike, spikePlayers };

      // ── 5b. IMA / stride profile for the same session date ───────
      // Re-uses the exact profile the /coach/ima-intelligence page shows so the
      // report carries the same biomechanical numbers (one source, one truth).
      let imaProfile: ImaSessionProfile | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const imaRes = await fetch(
            `/api/coach/team/ima-day-profile?date=${sessionDate}&lang=IS`,
            { headers: { Authorization: `Bearer ${session.access_token}` } },
          );
          if (imaRes.ok) {
            const imaJson = await imaRes.json();
            const p = imaJson?.profile as ImaSessionProfile | undefined;
            // Only attach when there is real captured data
            if (p && p.player_count > 0 && p.team_total_strides > 0) imaProfile = p;
          }
        }
      } catch (e) {
        console.warn("IMA profile fetch for report failed:", e);
      }

      // ── 5b. Planned vs Actual ────────────────────────────────
      // Pull the pre-session PLAN for this date and diff it against what was
      // actually captured, so the report shows where the squad / players ran
      // hotter or lighter than the system recommended.
      let plannedVsActual: PlannedVsActual | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const planRes = await fetch(`/api/coach/load-plan?date=${sessionDate}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (planRes.ok) {
            const planJson = await planRes.json();
            const plan = planJson?.plan ?? null;
            // Actual session KPIs per player (the session-date rows we already have).
            const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
            const actualById = new Map<string, {
              totalDistance: number | null; playerLoad: number | null; hsr: number | null;
              sprint: number | null; accel: number | null; decel: number | null; ima: number | null;
            }>();
            for (const r of (loadRows ?? []) as Array<Record<string, unknown>>) {
              if (String(r.date) !== sessionDate) continue;
              actualById.set(String(r.player_id), {
                totalDistance: num(r.total_distance), playerLoad: num(r.total_player_load),
                hsr: num(r.velocity_band5_total_distance), sprint: num(r.velocity_band6_total_distance),
                accel: num(r.accel_b2_3_tot_effs_gen2), decel: num(r.decel_b2_3_tot_effs_gen2),
                ima: num(r.ima_fr_band58_total_distance),
              });
            }
            // Team-mean actual across the players who trained.
            const mean = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x != null && x > 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
            const vals = Array.from(actualById.values());
            const teamActual = {
              totalDistance: mean(vals.map((v) => v.totalDistance)), playerLoad: mean(vals.map((v) => v.playerLoad)),
              hsr: mean(vals.map((v) => v.hsr)), sprint: mean(vals.map((v) => v.sprint)),
              accel: mean(vals.map((v) => v.accel)), decel: mean(vals.map((v) => v.decel)), ima: mean(vals.map((v) => v.ima)),
            };
            plannedVsActual = buildPlannedVsActual(plan, teamActual, actualById);
          }
        }
      } catch (e) {
        console.warn("Planned-vs-actual fetch for report failed:", e);
      }

      const reportData: PostTrainingReportData = {
        teamName: (rowsWithAdaptive[0] as any)?.team ?? "Team",
        sessionDate,
        mdDay: mdDayToday,
        players: reportPlayers,
        teamAvg,
        rpeTeamAvg,
        rpeTotalLoad,
        rpeSubmissionCount: rpeSubmitters.length,
        alertCount: reportPlayers.filter((p) => p.attentionFlag === "ALERT").length,
        monitorCount: reportPlayers.filter((p) => p.attentionFlag === "MONITOR").length,
        ima: imaProfile,
        loadSummary,
        plannedVsActual,
      };

      if (reportPlayers.length === 0) {
        alert("Engir leikmenn fundust með GPS eða RPE gögn í dag.");
        return;
      }

      // ── 6. Generate and download PDF ─────────────────────────
      const blob = await pdf(<PostTrainingReportDocument data={reportData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `post-training-report-${sessionDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("post-training report download failed:", e?.message ?? e);
      alert("Could not generate post-training PDF report.");
    } finally {
      setPdfPostDownloading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const tm = teamStatusMeta(teamIntel?.team_status);
  const dayStateInfo = useMemo(() => {
    const resolved = getDayState({
      readinessCount: rowsWithAdaptive.length,
      mdDay: mdDayToday,
      plannedDayType: rowsWithAdaptive.map((r) => r.planned_day_type ?? null),
      complianceCounts: {
        totalPlayers: reminderStatus?.totalPlayers ?? teamSignal?.n_players ?? 0,
        missing: reminderStatus?.missing ?? null,
      },
      teamContext: {
        intensity: ctxIntensity,
      },
    });

    return {
      state: resolved.state,
      ...dayStateMeta(resolved.state),
      reason: resolved.reason,
    };
  }, [mdDayToday, rowsWithAdaptive, ctxIntensity, reminderStatus, teamSignal?.n_players]);

  const teamIntelEmptyMessage =
    dayStateInfo.state === "OFF_DAY"
      ? (lang === "EN" ? "OFF day detected. Team intelligence input is intentionally de-emphasized." : "OFF dagur greinst. Team intelligence inntak er vísvitandi dregið saman.")
      : dayStateInfo.state === "NO_INPUT_EXPECTED"
      ? (lang === "EN" ? "No input expected for this day context. Team intelligence will populate when inputs are expected." : "Ekkert inntak gert ráð fyrir í þessum dagasamhengi. Team intelligence mun fylla upp þegar inntak er gert ráð fyrir.")
      : dayStateInfo.state === "MISSING_INPUT"
      ? (lang === "EN" ? "Missing readiness inputs for expected players today. Team intelligence may be incomplete." : "Vantar readiness gögn frá leikmönnum sem gert er ráð fyrir. Team intelligence gæti verið ófullkomið.")
      : (lang === "EN" ? "No team intelligence record found for today." : "Engin team intelligence færsla fannst í dag.");

  const queueEmptyMessage =
    dayStateInfo.state === "OFF_DAY"
      ? (lang === "EN" ? "OFF day: no player review queue expected." : "OFF dagur: ekkert gert ráð fyrir leikmannaendurskoðun.")
      : dayStateInfo.state === "NO_INPUT_EXPECTED"
      ? (lang === "EN" ? "No input expected today; player review queue is intentionally empty." : "Ekkert inntak gert ráð fyrir í dag; leikmannaröð er vísvitandi tóm.")
      : dayStateInfo.state === "MISSING_INPUT"
      ? (lang === "EN" ? "Expected player inputs are missing. Trigger reminders or wait for check-ins." : "Vantar inntak frá leikmönnum. Sendum áminningar eða biðum eftir check-ins.")
      : (lang === "EN" ? "No readiness data for today." : "Engin readiness gögn í dag.");

  const complianceMessage =
    dayStateInfo.state === "OFF_DAY"
      ? "OFF day detected. Missing check-ins may be acceptable depending on protocol."
      : dayStateInfo.state === "NO_INPUT_EXPECTED"
      ? "No input expected for this day context."
      : dayStateInfo.state === "MISSING_INPUT"
      ? "Check-in compliance is below expected level for today."
      : "Normal readiness day compliance monitoring.";

  /** -----------------------------
   * Render helpers
   * ----------------------------- */
  const renderActionPills = (
    pid: string,
    locked: boolean,
    savedAction: TrainingAction = "FULL",
  ) => {
    const current = draftAction[pid] ?? savedAction;
    const isDirty = draftAction[pid] != null && draftAction[pid] !== savedAction;

    const pill = (value: TrainingAction, label: string) => {
      const active = current === value;
      const disabled = locked && !isAdmin;
      const activeDirty = active && isDirty;
      return (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => setDraftAction((p) => ({ ...p, [pid]: value }))}
          className={[
            "inline-flex h-12 min-w-[108px] items-center justify-center rounded-xl border px-4 text-sm font-semibold tracking-wide transition-colors",
            disabled ? "cursor-not-allowed opacity-50" : "",
            active
              ? activeDirty
                ? "border-amber-500 bg-amber-500 text-white shadow-sm ring-2 ring-amber-300"
                : "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
          ].join(" ")}
          aria-pressed={active}
        >
          {label}
        </button>
      );
    };

    return (
      <div className="flex w-full flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pill("FULL", "FULL")}
          {pill("REDUCED", "REDUCED")}
          {pill("RECOVERY", "RECOVERY")}
        </div>
        {isDirty ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            {lang === "EN" ? "Unsaved — click Save below" : "Óvistað — smelltu Vista neðst"}
          </span>
        ) : null}
      </div>
    );
  };

  const renderRow = (r: Row) => {
    const pid = String(r.player_id);
    const isSaving = !!saving[pid];
    const isOpen = expandedPlayerId === pid;

    const score = typeof r.total_score === "number" ? r.total_score : null;
    const isGameDay = String(r.md_day ?? mdDayToday ?? "").trim().toUpperCase() === "MD";
    const noCheckinOnGameDay = isGameDay && score === null;
    const cm = noCheckinOnGameDay
      ? { label: "—", dot: "bg-slate-400", pill: "bg-slate-50 text-slate-600 border-slate-200" }
      : colorMeta(r.final_color ?? "green");
    const lockedForCoach = r.is_locked && !isAdmin;
    const isOverride = String(r.final_source ?? "").toUpperCase().includes("COACH");

    const scoreText = noCheckinOnGameDay ? "Leikdagur · —" : `${cm.label} · ${score ?? "—"}`;
    const mdText = prettyMd(r.md_day ?? mdDayToday).md;

    const zVal = typeof r._z_today === "number" ? r._z_today : null;
    const zText = zVal != null ? zVal.toFixed(2) : "—";
    const dzVal = typeof r._dz === "number" ? r._dz : null;
    const dzText = dzVal != null ? dzVal.toFixed(2) : "—";
    const stenVal = typeof r._sten === "number" ? r._sten : zToSten(zVal);
    const stenText = stenVal != null ? stenVal.toFixed(2) : "—";
    const fatigue = fatigueByPlayer.get(pid) ?? null;
    const fatigueType = String(fatigue?.primaryFatigueType ?? "NONE").toUpperCase();
    const fatigueSeverity = String(fatigue?.severity ?? "").toUpperCase();
    const fatigueDrivers = ((fatigue?.drivers ?? fatigue?.reasonCodes ?? []) as unknown[]).filter((v) => v != null);
    const adaptationSummaryRaw = r._adaptation_summary ?? formatAdaptationFallback(r._adaptation);
    const adaptationLinesRaw = adaptationDetailLines(r._adaptation);
    const neural = r._neural_load ?? null;
    const neuralBiasApplied = !!r._neural_bias_applied;
    const neuralBiasWhy = formatNeuralBiasReasons(r._neural_bias_reason_codes, 3);
    const hsrYesterday = toIntOrNull(ctxHsr);
    const yesterdayLoadBand: "LOW" | "MODERATE" | "HIGH" | null =
      String(ctxIntensity ?? "").toUpperCase() === "OFF"
        ? "LOW"
        : hsrYesterday == null
        ? null
        : hsrYesterday >= 800
        ? "HIGH"
        : hsrYesterday >= 500
        ? "MODERATE"
        : "LOW";
    const rawTotalScore = typeof r.total_score === "number" ? r.total_score : null;
    // readiness questionnaire total_score is stored as a 5–25 sum; normalize to 0–100 before Light ATE thresholds
    const normalizedReadinessScore =
      rawTotalScore == null ? null : Math.max(0, Math.min(100, ((rawTotalScore - 5) / 20) * 100));
    const weekSetupRowForEntry =
      (weekGrid ?? []).find((x: any) => dateKey(x.day_date) === dateKey(String(r.entry_date ?? today))) ?? null;
    const mdContextResolved = resolveSessionMdContextFromSources({
      weekSetupDay: weekSetupRowForEntry,
      rowMdContext: graphMdContextFromToken(r.md_day ?? null) ?? null,
      teamMdContext: graphMdContextFromToken(mdDayToday) ?? null,
      plannedFocusMdContext: graphMdContextFromToken(mdFromPlannedFocus(r.planned_focus ?? null)) ?? null,
      previewMdContext: graphMdContextFromToken(planPreview?.md_day ?? null) ?? null,
    });
    const mdContextInput = mdContextResolved.mdContext;
    const neuralFatigueBandInput = graphNeuralFatigueBandFromState(neural?.neuralLoadState);
    const externalLoadToday = r._external_load_today ?? null;
    const externalLoadBaseline = r._external_load_baseline ?? null;
    const graphSession = buildDevDailySessionAdapterResult({
      athleteState: graphAthleteStateFromFlag(r.final_flag),
      mdContext: mdContextInput,
      readinessScore: normalizedReadinessScore,
      neuralFatigueBand: neuralFatigueBandInput,
      yesterdayLoadBand,
      externalLoad: {
        playerLoad: externalLoadToday?.player_load ?? null,
        playerLoad7DayAverage: externalLoadBaseline?.playerLoadAvg ?? null,
        sprintDistance: externalLoadToday?.sprint_distance ?? null,
        sprintDistance7DayAverage: externalLoadBaseline?.sprintDistanceAvg ?? null,
      },
    });
    const decisionConfidence = buildDecisionConfidence({
      readinessScore: normalizedReadinessScore,
      mdContext: mdContextInput,
      neuralFatigueBand: neuralFatigueBandInput,
      yesterdayLoadBand,
      fallbackUsed: graphSession.mode !== "graph" || !!graphSession.fallbackReason,
    });
    const performanceIntelligence = r._performance_intelligence ?? null;
    const piRiskLabel = performanceIntelligence ? titleCaseToken(performanceIntelligence.injuryRisk.band) : null;
    const piLoadLabel = performanceIntelligence
      ? performanceIntelligence.loadForecast.band === "TOLERATES_HIGH"
        ? "High"
        : performanceIntelligence.loadForecast.band === "TOLERATES_MODERATE"
          ? "Moderate"
          : performanceIntelligence.loadForecast.band === "TOLERATES_LOW"
            ? "Low"
            : "Recovery only"
      : null;
    const piActionLabel = performanceIntelligence
      ? performanceIntelligence.loadForecast.recommendedAction === "full"
        ? "Full"
        : performanceIntelligence.loadForecast.recommendedAction === "modified"
          ? "Modified"
          : "Recovery"
      : null;
    const piMainDriver =
      performanceIntelligence?.injuryRisk.primaryDrivers?.[0]?.label ??
      performanceIntelligence?.loadForecast.primaryDrivers?.[0]?.label ??
      null;
    const piExplanationLine =
      performanceIntelligence?.explanationLines?.[0] ??
      performanceIntelligence?.coachSummary ??
      null;
    const prescription = r._prescription_decision ?? null;
    const prescriptionCompactLine = prescription
      ? `Action: ${titleCaseToken(prescription.action)} · Cap: ${titleCaseToken(
          prescription.intensityCap,
        )} · Volume: ${titleCaseToken(prescription.volumeAdjustment)}`
      : null;
    const prescriptionGuidanceLine = prescription
      ? `Exposure: ${prescription.exposureGuidance
          .slice(0, 2)
          .map((tag) => titleCaseToken(tag))
          .join(", ")}${prescription.exposureGuidance.length > 2 ? "…" : ""}`
      : null;
    const finalRecommendationDecision = r._final_recommendation_decision ?? null;
    const finalRecommendationLine = finalRecommendationDecision
      ? `Final action: ${titleCaseToken(finalRecommendationDecision.finalRecommendation.action)}${
          finalRecommendationDecision.manualOverride?.applied ? " · Override applied" : ""
        }${finalRecommendationDecision.requiresCoachReview ? " · Review required" : ""}`
      : null;
    const finalRecommendationSummary = finalRecommendationDecision?.overrideSummary ?? null;
    const sessionDraft = r._session_draft ?? null;
    const sessionDraftLine = sessionDraft ? `Draft ready: ${titleCaseToken(sessionDraft.draftAction)} ${sessionDraft.sessionType.toLowerCase()} session` : null;
    const neuralVolatility = r._neural_volatility_intelligence ?? null;
    const nvCompactLine = neuralVolatility
      ? `Fatigue build: ${titleCaseToken(neuralVolatility.fatigueAccumulation.band)} · Stability: ${titleCaseToken(
          neuralVolatility.instabilityWindow.band,
        )} · Collapse risk: ${titleCaseToken(neuralVolatility.collapseRisk.band)} · Peak window: ${titleCaseToken(
          neuralVolatility.peakWindow.band,
        )}`
      : null;
    const nvExplainLine = neuralVolatility?.explanationLines?.[0] ?? null;
    const fatigueMetrics = fatigue && typeof fatigue === "object" ? (fatigue as Record<string, unknown>) : null;
    const tm = normalizeTrainingModifier(r.training_modifier);
    const tissueSignal = deriveTissueProtectionSignal({
      fatigueType,
      fatigueSeverity,
      sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : null,
      noteText: r.notes ?? null,
      neuralFatigueBand: neuralFatigueBandInput,
      readinessScore: normalizedReadinessScore,
      zScore: typeof r._z_today === "number" ? r._z_today : null,
      stenScore: typeof r._sten === "number" ? r._sten : null,
    });
    const acwrValue = toMaybeFinite(fatigueMetrics?.acwr) ?? toMaybeFinite(tm?.acwr) ?? toMaybeFinite(tm?.load?.acwr);
    const hrvChangePctValue = toMaybeFinite(fatigueMetrics?.hrv_change_pct) ?? toMaybeFinite(tm?.hrv_change_pct);
    const volatilityValue = toMaybeFinite(tm?.pi?.volatility) ?? (teamIntel?.volatility_pct ?? null);
    const lightAteStateRaw = String(graphSession.lightAteDecision?.athleteState ?? "").toUpperCase();
    const lightAteState =
      lightAteStateRaw === "RED"
        ? "RED"
        : lightAteStateRaw === "YELLOW"
        ? "YELLOW"
        : lightAteStateRaw === "GREEN" || lightAteStateRaw === "GREEN_PLUS"
        ? "GREEN"
        : "GRAY";
    const snapshot = buildDailyAthleteSnapshot({
      athleteId: String(r.player_id),
      date: String(r.entry_date ?? today),
      manual: {
        id: r.readiness_entry_id ?? null,
        totalScore: rawTotalScore,
        soreness: typeof r.muscle_soreness === "number" ? r.muscle_soreness : null,
        stress: typeof r.stress_mood === "number" ? r.stress_mood : null,
        mood: typeof r.stress_mood === "number" ? r.stress_mood : null,
        sleepQuality: typeof r.sleep_quality === "number" ? r.sleep_quality : null,
        motivation: typeof r.fatigue_energy === "number" ? r.fatigue_energy : null,
        completed: rawTotalScore != null,
        sourceDate: String(r.entry_date ?? today),
      },
      load: {
        zScore: typeof r._z_today === "number" ? r._z_today : null,
        deltaZ: typeof r._dz === "number" ? r._dz : null,
        acuteLoad: toIntOrNull(ctxHsr) ?? null,
        acwr: acwrValue ?? null,
        sessionRpeLoad: toMaybeFinite(tm?.session_load) ?? null,
        volatility5d: volatilityValue ?? null,
        sourceDate: String(r.entry_date ?? today),
      },
      context: {
        weekSetupLabel: r.md_day ?? mdDayToday,
        expectedSessionType: graphSession.ateDecisionPanel?.sessionLabel ?? null,
        rehab: false,
        returnToPlay: false,
        sourceDate: String(r.entry_date ?? today),
      },
      externalLoad: {
        totalDistance: externalLoadToday?.total_distance ?? null,
        highSpeedDistance: externalLoadToday?.high_speed_distance ?? null,
        sprintDistance: externalLoadToday?.sprint_distance ?? null,
        accelerations: externalLoadToday?.accelerations ?? null,
        decelerations: externalLoadToday?.decelerations ?? null,
        playerLoad: externalLoadToday?.player_load ?? null,
        maxVelocity: externalLoadToday?.max_velocity ?? null,
        playerLoad7DayAverage: externalLoadBaseline?.playerLoadAvg ?? null,
        sprintDistance7DayAverage: externalLoadBaseline?.sprintDistanceAvg ?? null,
        source: externalLoadToday ? "catapult" : null,
        sourceDate: String(r.entry_date ?? today),
      },
    });

    const explainableDecision = buildExplainableReadinessDecision({
      playerId: String(r.player_id),
      playerName: r.full_name,
      date: r.entry_date,
      dailySnapshot: snapshot,
      readinessScore: normalizedReadinessScore ?? undefined,
      checkinScore: rawTotalScore ?? undefined,
      zScore: typeof r._z_today === "number" ? r._z_today : undefined,
      deltaZ: typeof r._dz === "number" ? r._dz : undefined,
      volatility: volatilityValue ?? undefined,
      sleepScore: typeof r.sleep_quality === "number" ? r.sleep_quality : undefined,
      hrvScore: toMaybeFinite(fatigueMetrics?.hrv) ?? toMaybeFinite(tm?.hrv) ?? undefined,
      hrvChangePct: hrvChangePctValue ?? undefined,
      acuteLoad: toIntOrNull(ctxHsr) ?? undefined,
      acwr: acwrValue ?? undefined,
      durationMinutes: toNumOrNull(ctxDuration) ?? undefined,
      neuralFatigueLevel:
        neuralFatigueBandInput === "VERY_HIGH" || neuralFatigueBandInput === "HIGH"
          ? "high"
          : neuralFatigueBandInput === "MODERATE"
          ? "moderate"
          : "low",
      neuralFatigueReason: neural?.summary ?? null,
      stenScore: typeof r._sten === "number" ? r._sten : undefined,
      tissueSignal: tissueSignal.tissueSignal,
      tissueSeverity: tissueSignal.tissueSeverity,
      explicitPainTextFlag: tissueSignal.explicitPainTextFlag,
      sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : undefined,
      sorenessFlag: typeof r.muscle_soreness === "number" ? r.muscle_soreness <= 2 : undefined,
      painFlag: tissueSignal.painProtection,
      highSpeedRunning: toIntOrNull(ctxHsr) ?? undefined,
      maxVelocityPct: toNumOrNull(ctxVmax) ?? undefined,
      gpsSpike: String(ctxIntensity ?? "").toUpperCase() !== "OFF" && (toIntOrNull(ctxHsr) ?? 0) >= 1000,
      recentYellowDays: toMaybeFinite(tm?.recent_yellow_days) ?? undefined,
      recentRedDays: toMaybeFinite(tm?.recent_red_days) ?? undefined,
      dataCompleteness: undefined,
      lightAteState,
      catapultDailyLoad: r._catapult_baseline ? (r._external_load_today ? normalizeCatapultDailyLoadRow(r._external_load_today as unknown as Record<string, unknown>) : null) ?? undefined : undefined,
      catapultBaseline: r._catapult_baseline ?? undefined,
      catapultSignals: r._catapult_signals ?? undefined,
      externalLoadState: r._catapult_signals?.externalLoadState ?? undefined,
      catapultReadinessModifier: r._catapult_modifier ?? undefined,
    });
    const injuryRiskDecision = buildInjuryRiskDecision({
      acwr: acwrValue ?? undefined,
      zScore: typeof r._z_today === "number" ? r._z_today : undefined,
      deltaZ: typeof r._dz === "number" ? r._dz : undefined,
      volatility: volatilityValue ?? undefined,
      recentYellowDays: toMaybeFinite(tm?.recent_yellow_days) ?? undefined,
      recentRedDays: toMaybeFinite(tm?.recent_red_days) ?? undefined,
      highSpeedRunning: toIntOrNull(ctxHsr) ?? undefined,
      maxVelocityPct: toNumOrNull(ctxVmax) ?? undefined,
      sleepScore: typeof r.sleep_quality === "number" ? r.sleep_quality : undefined,
      hrvChangePct: hrvChangePctValue ?? undefined,
      sorenessScore: typeof r.muscle_soreness === "number" ? r.muscle_soreness : undefined,
      sorenessFlag: typeof r.muscle_soreness === "number" ? r.muscle_soreness <= 2 : undefined,
      painFlag: tissueSignal.painProtection,
      gpsSpike: String(ctxIntensity ?? "").toUpperCase() !== "OFF" && (toIntOrNull(ctxHsr) ?? 0) >= 1000,
    }, explainableDecision);
    const _catapultSignals = r._catapult_signals as Record<string, unknown> | null | undefined;
    const _catapultExternalLoadState = (["normal", "elevated", "high"].includes(String(_catapultSignals?.externalLoadState ?? ""))
      ? _catapultSignals?.externalLoadState
      : "unknown") as "normal" | "elevated" | "high" | "unknown";
    const compositeLoad = computeCompositeLoadConcern({
      rpeAcwr: null, // RPE ACWR not available client-side; GPS carries signal
      neuromuscularBurdenScore: _catapultSignals?.neuromuscularBurdenScore as number | null ?? null,
      externalLoadState: _catapultExternalLoadState,
    });
    const playerRpeToday = toMaybeFinite((tm as Record<string, unknown> | null)?.session_rpe as number | undefined) ?? null;
    const teamRpeValues = rowsWithAdaptive
      .filter((row) => String(row.player_id) !== pid)
      .map((row) => toMaybeFinite(normalizeTrainingModifier(row.training_modifier)?.session_rpe as number | undefined))
      .filter((v): v is number => v != null);
    const rpeDiscrepancy = computeRpeDiscrepancy({
      playerRpe: playerRpeToday,
      teamRpeValues,
      neuromuscularBurdenScore: _catapultSignals?.neuromuscularBurdenScore as number | null ?? null,
      externalLoadState: _catapultExternalLoadState,
    });
    const athleteDecision = buildAthleteDecision({
      snapshot,
      readinessDecision: explainableDecision,
      injuryDecision: injuryRiskDecision,
      neural: neural
        ? {
            status:
              String(neural.neuralLoadState ?? "").toUpperCase() === "CRITICAL" || String(neural.neuralLoadState ?? "").toUpperCase() === "HIGH"
                ? "suppressed"
                : String(neural.neuralLoadState ?? "").toUpperCase() === "RISING"
                ? "caution"
                : "clear",
            confidence: 0.65,
            summary: neural.summary ?? null,
          }
        : null,
      load: compositeLoad.concernLevel !== "none"
        ? { concernLevel: compositeLoad.concernLevel, summary: compositeLoad.summary }
        : null,
      // Indoor Load Intelligence — feeds the verdict so a player flagged
      // red on /coach/indoor-load also shows red on the dashboard. Uses
      // the same playerIndoorStatus map populated earlier in the load
      // flow (line ~2030). Null when no recent indoor sessions.
      indoorLoad: (() => {
        const idx = playerIndoorStatus[String(r.player_id)];
        if (!idx) return null;
        return {
          compositeBand: idx.compositeBand ?? null,
          mcburnieFlag: idx.mcburnieFlag ?? null,
          acwrFlag: idx.acwrFlag ?? null,
        };
      })(),
      // Decel Intelligence (McBurnie 2022 4-dimension overall flag) —
      // closes the verdict gap with /coach/decel-intelligence. Same
      // pattern as indoorLoad, populated via parallel RPC fetch.
      decelIntelligence: (() => {
        const idx = playerDecelStatus[String(r.player_id)];
        if (!idx) return null;
        return { overallFlag: idx.overallFlag, summary: idx.explanation };
      })(),
      hardBlock: false,
    });
    const teamTodayRows = rows
      .map((row) => row._external_load_today)
      .filter((item): item is ExternalLoadDailyRow => item != null);
    const todayVsTeamMetrics = getDefaultCatapultTodayVsTeamMetricKeys().map((key) => {
      const definition = getCatapultMetricDefinition(key);
      const value = getCatapultMetricValue(externalLoadToday as unknown as Record<string, unknown> | null, key);
      const teamAverage = computeCatapultMetricAverage(
        teamTodayRows as unknown as Array<Record<string, unknown>>,
        key,
      );
      return {
        key,
        label: definition.label,
        digits: definition.digits ?? 0,
        value,
        teamAverage,
      };
    });
    const weeklyLoadMetrics = getDefaultCatapultWeeklyLoadMetricKeys().map((key) => {
      const definition = getCatapultMetricDefinition(key);
      const weekly = computeCatapultWeeklyMetricSnapshot({
        rows: (r._catapult_history ?? []) as unknown as Array<Record<string, unknown>>,
        key,
      });
      return {
        key,
        label: definition.label,
        digits: definition.digits ?? 0,
        acwrSupported: !!definition.acwrSupported,
        weekly,
      };
    });
    const volatilityPoints = recentMonitoringByPlayer[pid] ?? [];
    const volatilitySummary = computePlayerVolatilitySummary(volatilityPoints);
    const volatilityGraphLabels = volatilitySummary.dayLabels.slice(-volatilitySummary.dailyComposite.length);
    const volatilityGraphPoints = volatilitySeriesPoints(volatilitySummary.dailyComposite);
    const volatilityPanelId = `volatility-panel-${pid}`;
    const volatilityExpanded = !!volatilityOpenByPlayer[pid];
    const strongGreenGuardrail =
      explainableDecision.athleteState === "GREEN" &&
      typeof zVal === "number" &&
      zVal > 1.5 &&
      typeof stenVal === "number" &&
      stenVal >= 8 &&
      typeof r.muscle_soreness === "number" &&
      r.muscle_soreness >= 4 &&
      fatigueType === "TISSUE" &&
      fatigueSeverity === "LOW" &&
      injuryRiskDecision.injuryRiskLevel === "LOW" &&
      !["HIGH", "CRITICAL"].includes(String(neural?.neuralLoadState ?? "").toUpperCase());
    const legacyRecoveryOverreach =
      !!r._adaptation?.recoveryBias ||
      (typeof r._adaptation?.reduceVolumePct === "number" && r._adaptation.reduceVolumePct >= 40) ||
      /recovery bias|-40%\s*volume/i.test(String(adaptationSummaryRaw ?? ""));
    const adaptationSummary =
      strongGreenGuardrail && legacyRecoveryOverreach
        ? "Adaptive: monitoring only (strong readiness, no hard red flags)"
        : adaptationSummaryRaw;
    const adaptationLines =
      strongGreenGuardrail && legacyRecoveryOverreach
        ? ["Standard monitoring only."]
        : adaptationLinesRaw;

    const currentMessage = (draftMessage[pid] ?? r.coach_message ?? "").trim();
    const loggedTime = new Date(r.created_at).toLocaleTimeString("is-IS", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const readinessInputSummary = lang === "IS"
      ? `Skor ${rawTotalScore ?? "—"} · Skráð ${loggedTime}`
      : `Score ${rawTotalScore ?? "—"} · Logged ${loggedTime}`;
    const fatigueSummaryText =
      [fatigueType !== "NONE" ? fatigueType : null, fatigueSeverity || null, adaptationSummary || null].filter(Boolean).join(" · ")
      || (lang === "IS" ? "Engin þreytuflögg" : "No fatigue flags");
    const trainingSessionSummary =
      graphSession.mode === "graph"
        ? graphSession.ateDecisionPanel?.sessionLabel ?? (lang === "IS" ? "Æfing í dag" : "Training graph session")
        : (lang === "IS" ? "Eldra sniðmát" : "Legacy template rendering");
    const neuralSummaryText = neural
      ? `${neural.neuralLoadState} · ${neural.nextDayRisk}`
      : neuralBiasApplied
        ? (lang === "IS" ? "Þreytuvog beitt" : "Bias applied")
        : (lang === "IS" ? "Engin neural-gögn" : "No neural load data");
    const coachMessageSummary = currentMessage
      ? currentMessage
      : (lang === "IS" ? "Engin skilaboð" : "No coach message");

    // ── Section-header labels for the Show details accordion ──
    // Bilingual; falls back to EN. Single source of truth so we don't drift.
    const sectionHeaders = lang === "IS"
      ? {
          readinessDecision: "Ákvörðun um æfingar",
          injuryRisk: "Meiðslaáhætta",
          readinessInputs: "Inntak (wellness + ytra álag)",
          fatigueAdaptation: "Þreyta & aðlögun",
          trainingSession: "Æfingaplan",
          neuralLoad: "Neural-álag",
          coachMessage: "Skilaboð frá þjálfara",
        }
      : {
          readinessDecision: "Readiness decision",
          injuryRisk: "Injury risk",
          readinessInputs: "Readiness inputs",
          fatigueAdaptation: "Fatigue & adaptation",
          trainingSession: "Training session",
          neuralLoad: "Neural load",
          coachMessage: "Coach message",
        };
    const subHeaders = lang === "IS"
      ? { why: "Hvers vegna", action: "Aðgerð þjálfara", recommendation: "Tillaga", risk: "Áhætta", confidence: "Vissustig", inputs: "Inntak", missing: "Vantar", fallbacks: "Fallbacks", adjustments: "Aðlaganir", externalLoad: "Ytra álag", todayVsTeam: "Í dag vs lið", weeklyLoad: "Vikuálag" }
      : { why: "Why", action: "Coach action", recommendation: "Recommendation", risk: "Risk", confidence: "Decision confidence", inputs: "Inputs", missing: "Missing", fallbacks: "Fallbacks", adjustments: "Adjustments", externalLoad: "External load", todayVsTeam: "Today vs Team", weeklyLoad: "Weekly Load" };

    const isSectionOpen = (sectionKey: PlayerDetailSectionKey, defaultOpen = false) =>
      detailSectionOpenByPlayer[pid]?.[sectionKey] ?? defaultOpen;

    const toggleSection = (sectionKey: PlayerDetailSectionKey, defaultOpen = false) => {
      setDetailSectionOpenByPlayer((prev) => ({
        ...prev,
        [pid]: {
          ...(prev[pid] ?? {}),
          [sectionKey]: !(prev[pid]?.[sectionKey] ?? defaultOpen),
        },
      }));
    };

    const renderMetricTile = (
      label: string,
      value: string,
      valueClassName: string,
      tileClassName = "border-[#ece7de] bg-[#f7f4ee]",
      hint?: string,
    ) => (
      <div className={`min-w-[150px] flex-1 rounded-[20px] border px-4 py-3 ${tileClassName}`}>
        <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-700">{label}</div>
        <div className={`mt-2 text-[22px] font-semibold leading-none tabular-nums ${valueClassName}`}>{value}</div>
        {hint ? <div className="mt-1.5 text-[11px] leading-tight text-slate-500">{hint}</div> : null}
      </div>
    );

    const renderAccordionSection = (
      sectionKey: PlayerDetailSectionKey,
      title: string,
      summary: string,
      content: React.ReactNode,
      defaultOpen = false
    ) => {
      const open = isSectionOpen(sectionKey, defaultOpen);
      const panelId = `${pid}-${sectionKey}-panel`;

      return (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm" key={sectionKey}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => toggleSection(sectionKey, defaultOpen)}
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight text-slate-900">{title}</div>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="truncate text-right text-sm font-medium text-slate-600">{summary}</div>
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm text-slate-500 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              >
                ▾
              </span>
            </div>
          </button>
          {open ? (
            <div id={panelId} className="border-t border-slate-200 bg-slate-50/35 px-4 py-4">
              {content}
            </div>
          ) : null}
        </section>
      );
    };

    return (
      <React.Fragment key={r.ui_key ?? r.readiness_entry_id ?? pid}>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-xl font-semibold tracking-tight text-slate-950">{r.full_name}</div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${cm.pill}`}>
                  <span className={`h-2 w-2 rounded-full ${cm.dot}`} />
                  <span className="tabular-nums">{scoreText}</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {mdText}
                </span>
                {r.is_locked ? (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    Locked
                  </span>
                ) : null}
                {isOverride ? (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                    Override
                  </span>
                ) : null}
                {neuralBiasApplied ? (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                    Neural bias
                  </span>
                ) : null}
                {compositeLoad.concernLevel !== "none" ? (() => {
                  const tone =
                    compositeLoad.concernLevel === "high"
                      ? { cls: "border-red-200 bg-red-50 text-red-700 font-semibold", label: "⚠ Load há" }
                      : compositeLoad.concernLevel === "moderate"
                      ? { cls: "border-orange-200 bg-orange-50 text-orange-700 font-semibold", label: "↑ Load" }
                      : { cls: "border-slate-200 bg-slate-50 text-slate-600 font-medium", label: "Load monitor" };
                  const scoreStr = compositeLoad.compositeScore.toFixed(2);
                  const reasonLines =
                    compositeLoad.escalationReasons.length > 0
                      ? compositeLoad.escalationReasons
                      : ["Composite load signal is elevated."];
                  const tooltipText =
                    `composite ${scoreStr} → ${compositeLoad.concernLevel}\n` +
                    reasonLines.map((r) => `• ${r}`).join("\n");
                  return (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs cursor-help ${tone.cls}`}
                      title={tooltipText}
                      aria-label={tooltipText}
                    >
                      {tone.label}
                      <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-current/40 text-[9px] font-bold opacity-70">
                        i
                      </span>
                    </span>
                  );
                })() : null}
                {compositeLoad.fatigueType && compositeLoad.fatigueType !== "normal" ? (
                  <FatigueTypeChip type={compositeLoad.fatigueType} size="sm" />
                ) : null}
                {rpeDiscrepancy.level === "significant" ? (
                  <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                    {rpeDiscrepancy.flags.some((f) => f.includes("under")) ? "⚠ RPE ↓↓ vs lið" : "RPE ↑↑ vs lið"}
                  </span>
                ) : rpeDiscrepancy.level === "notable" ? (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                    {rpeDiscrepancy.flags.some((f) => f.includes("under")) ? "RPE ↓ vs lið" : "RPE ↑ vs lið"}
                  </span>
                ) : null}
                {r.notes && r.notes.trim().length ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5l-3 3V3a1 1 0 0 1 1-1z"/></svg>
                    Athugasemd
                  </span>
                ) : null}
                {r.sore_areas && r.sore_areas.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                    Sár svæði ({r.sore_areas.length})
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[360px] xl:items-end">
              {renderActionPills(pid, r.is_locked, (r.training_action ?? "FULL") as TrainingAction)}
            </div>
          </div>

          {r.notes && r.notes.trim().length ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <svg className="mt-0.5 shrink-0 text-blue-500" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5l-3 3V3a1 1 0 0 1 1-1z"/></svg>
              <div className="flex-1">
                <p className="text-sm text-blue-900 leading-snug">{r.notes.trim()}</p>
                <button
                  type="button"
                  className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2"
                  onClick={() => setChatOpenPlayerId((prev) => (prev === pid ? null : pid))}
                >
                  {chatOpenPlayerId === pid ? "Loka spjalli" : "Svara leikmann"}
                </button>
              </div>
            </div>
          ) : null}

          {/* Quick chat toggle (even without notes) */}
          {!(r.notes && r.notes.trim().length) ? (
            <div className="mt-3">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
                onClick={() => setChatOpenPlayerId((prev) => (prev === pid ? null : pid))}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5l-3 3V3a1 1 0 0 1 1-1z"/></svg>
                {chatOpenPlayerId === pid ? "Loka spjalli" : "Opna spjall"}
              </button>
            </div>
          ) : null}

          {/* Inline chat thread */}
          {chatOpenPlayerId === pid ? (
            <div className="mt-3">
              <ChatThread
                playerId={pid}
                playerName={String(r.full_name)}
                entryDate={String(r.entry_date)}
                compact
                checkinNotes={r.notes?.trim() || null}
                viewerRole="coach"
              />
            </div>
          ) : null}

          {r.sore_areas && r.sore_areas.length > 0 ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-red-500 mb-2">Sár / stíf svæði</div>
              <div className="flex flex-wrap gap-1.5">
                {r.sore_areas.map((area: string) => (
                  <span key={area} className="inline-flex rounded-full border border-red-200 bg-white px-2.5 py-0.5 text-xs font-medium text-red-700 capitalize">
                    {area.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-3">
              {/* Renamed Z-SCORE / DELTA Z / STEN to plain-language labels (May 2026).
                  Coaches don't think in z-scores — they think "is he above or below
                  his usual?" The actual numbers stay so power users still see the
                  precision; the labels + hints translate. */}
              {renderMetricTile(
                "Today",
                zText,
                zVal != null && zVal > 0 ? "text-[#3f6f1f]" : "text-slate-900",
                "border-[#ece7de] bg-[#f7f4ee]",
                zVal == null ? "vs his usual" :
                  zVal > 0.5 ? "above his usual" :
                  zVal < -0.5 ? "below his usual" :
                  "around his usual",
              )}
              {renderMetricTile(
                "vs yesterday",
                dzText,
                dzVal != null && dzVal > 0 ? "text-[#3f6f1f]" : dzVal != null && dzVal < 0 ? "text-rose-700" : "text-slate-900",
                "border-[#dce9c9] bg-[#eaf4da]",
                dzVal == null ? "change since last reading" :
                  dzVal > 0.3 ? "improving" :
                  dzVal < -0.3 ? "trending down" :
                  "stable",
              )}
              {renderMetricTile(
                "Rating",
                stenText === "—" ? "—" : `${stenText}/10`,
                "text-slate-900",
                "border-[#ece7de] bg-[#f7f4ee]",
                "0–10 scale (5 = squad average)",
              )}
            </div>

            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 self-end rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-expanded={isOpen}
              onClick={() => setExpandedPlayerId((prev) => (prev === pid ? null : pid))}
            >
              <span>{isOpen ? "Hide details" : "Show details"}</span>
              <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
                ▾
              </span>
            </button>
          </div>
        </div>

        {isOpen ? (
          <div className="mt-3 space-y-3">
            {/* ── Status strip — 2-second scannable summary of the four key signals.
                Coach can spot what's notable before deciding which section to open. */}
            {(() => {
              const stateTone = (s: string) =>
                s === "GREEN" ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : s === "YELLOW" ? "border-amber-300 bg-amber-50 text-amber-800"
                : s === "RED" ? "border-red-300 bg-red-50 text-red-800"
                : "border-slate-300 bg-white text-slate-600";
              const riskTone = (level: string) => {
                const up = String(level).toUpperCase();
                return up.startsWith("HIGH") ? "border-red-300 bg-red-50 text-red-800"
                  : up.startsWith("MOD") || up.startsWith("MEDIUM") ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800";
              };
              const neuralLabel = neural?.neuralLoadState ?? (neuralBiasApplied ? (lang === "IS" ? "Vog beitt" : "Bias") : "—");
              const neuralTone = neural?.neuralLoadState === "CRITICAL"
                ? "border-red-300 bg-red-50 text-red-800"
                : neural?.neuralLoadState === "RISING"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-300 bg-emerald-50 text-emerald-800";
              const volScore = typeof volatilitySummary?.overallScore === "number" ? volatilitySummary.overallScore : null;
              const volTone = volScore == null
                ? "border-slate-200 bg-slate-50 text-slate-600"
                : volScore >= 60
                ? "border-red-300 bg-red-50 text-red-800"
                : volScore >= 30
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-300 bg-emerald-50 text-emerald-800";
              const chipBase = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold";
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`${chipBase} ${stateTone(String(athleteDecision.athleteState))}`}>
                      <span className="text-[9px] uppercase tracking-wide opacity-70">{lang === "IS" ? "Ákvörðun" : "Decision"}</span>
                      {athleteDecision.athleteState}
                    </span>
                    <span className={`${chipBase} ${riskTone(String(injuryRiskDecision.injuryRiskLevel))}`}>
                      <span className="text-[9px] uppercase tracking-wide opacity-70">{lang === "IS" ? "Meiðsl." : "Injury"}</span>
                      {injuryRiskDecision.injuryRiskLevel}
                    </span>
                    <span className={`${chipBase} ${neuralTone}`}>
                      <span className="text-[9px] uppercase tracking-wide opacity-70">Neural</span>
                      {neuralLabel}
                    </span>
                    <span className={`${chipBase} ${volTone}`}>
                      <span className="text-[9px] uppercase tracking-wide opacity-70">{lang === "IS" ? "Sveifla" : "Volatility"}</span>
                      {volScore == null ? "—" : volScore.toFixed(1)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSection("coachMessage", false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5l-3 3V3a1 1 0 0 1 1-1z"/></svg>
                    {lang === "IS" ? "Skilaboð" : "Note"}
                    {currentMessage ? <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" /> : null}
                  </button>
                </div>
              );
            })()}
            {renderAccordionSection(
              "readinessDecision",
              sectionHeaders.readinessDecision,
              `${athleteDecision.athleteState} · ${lang === "IS" ? "Vissustig" : "Confidence"}: ${explainableDecision.confidence}${explainableDecision.confidenceHint ? ` · ${explainableDecision.confidenceHint}` : ""}`,
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.why}</div>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-800">
                      {athleteDecision.reasons.map((line) => (
                        <li key={`${pid}-exp-why-${line}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.action}</div>
                      {performanceIntelligence ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPiDrawerPlayerName(r.full_name);
                            setPiDrawerDecision(performanceIntelligence);
                          }}
                          className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Why?
                        </button>
                      ) : null}
                    </div>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-800">
                      {(athleteDecision.recommendations.length
                        ? athleteDecision.recommendations
                        : ["Monitor quality and adjust only if response drops."]).map((line) => (
                        <li key={`${pid}-exp-act-${line}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* ── Tomorrow's outlook (forecast) ─────────────────────
                    Rule-based projection of next-day verdict using
                    streak escalation gates + signal trajectory. Three
                    scenarios (improve/hold/decline) so coach can plan
                    tomorrow before signals come in. Hidden when GRAY
                    today (no signal to extrapolate) or low confidence. */}
                {athleteDecision.forecast ? (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                        {lang === "IS" ? "Á morgun" : "Tomorrow's outlook"}
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          athleteDecision.forecast.confidence === "high"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : athleteDecision.forecast.confidence === "medium"
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-slate-300 bg-white text-slate-600"
                        }`}
                      >
                        {athleteDecision.forecast.confidence}
                      </span>
                    </div>

                    {/* Three scenarios as a compact strip */}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {(["ifImprove", "ifHold", "ifDecline"] as const).map((key) => {
                        const state = athleteDecision.forecast!.scenarios[key];
                        const label = key === "ifImprove"
                          ? (lang === "IS" ? "Ef batnar" : "If improves")
                          : key === "ifHold"
                          ? (lang === "IS" ? "Ef stöðugt" : "If holds")
                          : (lang === "IS" ? "Ef versnar" : "If declines");
                        const isExpected = state === athleteDecision.forecast!.expectedState && key === "ifHold";
                        return (
                          <div
                            key={key}
                            className={`flex flex-col items-start gap-1 rounded-lg border bg-white px-3 py-2 ${
                              isExpected ? "border-violet-300 ring-1 ring-violet-200" : "border-slate-200"
                            }`}
                          >
                            <div className="text-[10px] uppercase tracking-wide text-slate-500">
                              {label}
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                state === "GREEN"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : state === "YELLOW"
                                  ? "border-amber-300 bg-amber-50 text-amber-800"
                                  : state === "RED"
                                  ? "border-red-300 bg-red-50 text-red-800"
                                  : "border-slate-300 bg-white text-slate-700"
                              }`}
                            >
                              {state}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bilingual rationale lines */}
                    {(lang === "IS"
                      ? athleteDecision.forecast.reasonsIS
                      : athleteDecision.forecast.reasonsEN
                    ).length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-700">
                        {(lang === "IS"
                          ? athleteDecision.forecast.reasonsIS
                          : athleteDecision.forecast.reasonsEN
                        ).map((line, idx) => (
                          <li
                            key={`${pid}-fc-${idx}`}
                            className="flex items-start gap-1.5"
                          >
                            <span className="mt-0.5 inline-block h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {/* ── What if (counterfactuals) ─────────────────────────
                    Single-lever flips that would have improved today's
                    verdict. Empty for GREEN players (engine returns []).
                    Shows the most impactful first. Coaches see the
                    actionable counterpart to "Why" — not just what
                    happened, but what would need to change to flip the
                    decision. */}
                {athleteDecision.counterfactuals && athleteDecision.counterfactuals.length > 0 ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                      {lang === "IS" ? "Hvað ef" : "What if"}
                    </div>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-800">
                      {athleteDecision.counterfactuals.map((cf, idx) => {
                        const text = lang === "IS" ? cf.descriptionIS : cf.descriptionEN;
                        const stateChipCls =
                          cf.hypotheticalState === "GREEN"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : cf.hypotheticalState === "YELLOW"
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-slate-300 bg-white text-slate-700";
                        return (
                          <li
                            key={`${pid}-cf-${idx}-${cf.signal}`}
                            className="flex items-start gap-2"
                          >
                            <span
                              className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${stateChipCls}`}
                            >
                              {cf.hypotheticalState}
                            </span>
                            <span>{text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {performanceIntelligence || prescription || neuralVolatility || finalRecommendationDecision ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-600">
                    {performanceIntelligence ? (
                      <div>
                        Risk: <span className={`font-semibold ${performanceRiskTone(performanceIntelligence.injuryRisk.band)}`}>{piRiskLabel}</span> ·
                        Load: <span className="font-semibold text-slate-700"> {piLoadLabel}</span> · Action:{" "}
                        <span className="font-semibold text-slate-700">{piActionLabel}</span>
                      </div>
                    ) : null}
                    {piMainDriver ? (
                      <div>
                        Main driver: <span className="font-medium text-slate-700">{piMainDriver}</span>
                      </div>
                    ) : null}
                    {piExplanationLine ? <div>{piExplanationLine}</div> : null}
                    {prescriptionCompactLine ? <div>{prescriptionCompactLine}</div> : null}
                    {prescriptionGuidanceLine ? <div>{prescriptionGuidanceLine}</div> : null}
                    {finalRecommendationLine ? <div>{finalRecommendationLine}</div> : null}
                    {finalRecommendationSummary ? <div>{finalRecommendationSummary}</div> : null}
                    {sessionDraftLine ? <div>{sessionDraftLine}</div> : null}
                    {nvCompactLine ? <div>{nvCompactLine}</div> : null}
                    {nvExplainLine ? <div>{nvExplainLine}</div> : null}
                  </div>
                ) : null}
              </div>,
              true
            )}

            {renderAccordionSection(
              "injuryRisk",
              sectionHeaders.injuryRisk,
              `${injuryRiskDecision.injuryRiskLevel} · ${subHeaders.confidence}: ${injuryRiskDecision.confidence}`,
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.why}</div>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-800">
                    {injuryRiskDecision.why.map((line) => (
                      <li key={`${pid}-inj-why-${line}`}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.recommendation}</div>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-800">
                    {injuryRiskDecision.recommendation.map((line) => (
                      <li key={`${pid}-inj-rec-${line}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {renderAccordionSection(
              "readinessInputs",
              sectionHeaders.readinessInputs,
              readinessInputSummary,
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Fatigue/Energy: <span className="font-semibold tabular-nums text-slate-900">{v(r.fatigue_energy)}</span></div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Sleep quality: <span className="font-semibold tabular-nums text-slate-900">{v(r.sleep_quality)}</span></div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Sleep duration: <span className="font-semibold tabular-nums text-slate-900">{v(r.sleep_duration)}</span></div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Stress/Mood: <span className="font-semibold tabular-nums text-slate-900">{v(r.stress_mood)}</span></div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Muscle soreness: <span className="font-semibold tabular-nums text-slate-900">{v(r.muscle_soreness)}</span></div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Baseline n: <span className="font-semibold tabular-nums text-slate-900">{r._baseline_n ?? "—"}</span></div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Recorded: <span className="font-semibold text-slate-900">{new Date(r.created_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}</span></div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Supporting metrics: <span className="font-semibold text-slate-900">z {numFmt(explainableDecision.supportingMetrics?.zScore ?? null)} · Δz {numFmt(explainableDecision.supportingMetrics?.deltaZ ?? null)}</span></div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  Notes: <span className="font-medium text-slate-900">{r.notes && r.notes.trim().length ? r.notes : "—"}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.externalLoad}</div>
                    <div className="text-xs text-slate-500">Catapult</div>
                  </div>
                  {externalLoadToday ? (
                    <div className="mt-3 space-y-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.todayVsTeam}</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {todayVsTeamMetrics.map((item) => {
                            const tone = externalLoadTone(item.value, item.teamAverage);
                            return (
                              <div key={`${pid}-external-team-${item.key}`} className={`rounded-2xl border px-3 py-3 ${tone.tone}`}>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em]">{item.label}</div>
                                <div className="mt-2 text-base font-semibold tabular-nums">
                                  {item.value == null ? "—" : numFmt(item.value, item.digits)}
                                </div>
                                <div className="mt-1 text-[11px]">
                                  Team {item.teamAverage == null ? "—" : numFmt(item.teamAverage, item.digits)} · {tone.label}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.weeklyLoad}</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {weeklyLoadMetrics.map((item) => {
                            const tone = externalLoadTone(item.weekly.acute7Avg, item.weekly.chronic28Avg);
                            return (
                              <div key={`${pid}-external-weekly-${item.key}`} className={`rounded-2xl border px-3 py-3 ${tone.tone}`}>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.14em]">{item.label}</div>
                                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                                  <div>
                                    <div className="uppercase tracking-wide opacity-70">7d</div>
                                    <div className="mt-1 text-sm font-semibold tabular-nums">
                                      {item.weekly.acute7Avg == null ? "—" : numFmt(item.weekly.acute7Avg, item.digits)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="uppercase tracking-wide opacity-70">28d</div>
                                    <div className="mt-1 text-sm font-semibold tabular-nums">
                                      {item.weekly.chronic28Avg == null ? "—" : numFmt(item.weekly.chronic28Avg, item.digits)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="uppercase tracking-wide opacity-70">ACWR</div>
                                    <div className="mt-1 text-sm font-semibold tabular-nums">
                                      {item.acwrSupported ? acwrFmt(item.weekly.acwr) : "—"}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {lang === "IS"
                        ? "Engin Catapult-gögn fyrir þennan leikmann í dag."
                        : "No Catapult external load synced for this player on this date."}
                    </div>
                  )}
                </div>
                {/* Supporting metrics duplicate-removed — same z/Δz already in the
                    Supporting metrics tile above; full chronic/sleep/HRV breakdown
                    surfaces in the Trends tab. Keeps Readiness inputs scannable. */}
              </div>
            )}

            {renderAccordionSection(
              "fatigueAdaptation",
              sectionHeaders.fatigueAdaptation,
              fatigueSummaryText,
              <div className="space-y-4">
                {fatigue ? (() => {
                  const sevTone =
                    fatigueSeverity === "HIGH" ? "border-red-300 bg-red-50 text-red-800"
                    : fatigueSeverity === "MODERATE" ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-white text-slate-700";
                  const typeTone = fatigueType === "NONE"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900";
                  const chipBase = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold";
                  return (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-3 text-sm text-slate-700">
                      <div className="font-semibold text-slate-900">
                        {lang === "IS" ? "Þreyta" : "Fatigue"}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`${chipBase} ${typeTone}`}>
                          <span className="text-[9px] uppercase tracking-wide opacity-70">{lang === "IS" ? "Tegund" : "Type"}</span>
                          {fatigueType}
                        </span>
                        {fatigueSeverity ? (
                          <span className={`${chipBase} ${sevTone}`}>
                            <span className="text-[9px] uppercase tracking-wide opacity-70">{lang === "IS" ? "Alvarl." : "Severity"}</span>
                            {fatigueSeverity}
                          </span>
                        ) : null}
                      </div>
                      {!!fatigueDrivers?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">
                            {lang === "IS" ? "Drifkraftar" : "Drivers"}:
                          </span>
                          {fatigueDrivers.slice(0, 6).map((d, idx) => (
                            <span key={`${pid}-fatigue-driver-${idx}`} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700">
                              {driverLabel(d)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {!!fatigue?.recommendedModifiers?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">
                            {lang === "IS" ? "Aðlaganir" : "Modifiers"}:
                          </span>
                          {fatigue.recommendedModifiers.map((m: string, idx: number) => (
                            <span key={`${pid}-fatigue-mod-${idx}`} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700">
                              {m}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })() : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {lang === "IS" ? "Engin þreytugögn tiltæk." : "No fatigue detail available."}
                  </div>
                )}

                {adaptationSummary || adaptationLines.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">
                      {lang === "IS" ? "Aðlögun" : "Adaptation"}
                    </div>
                    {adaptationSummary ? <div className="mt-2">{adaptationSummary}</div> : null}
                    {adaptationLines.length ? (
                      <ul className="mt-2 list-disc space-y-1.5 pl-5">
                        {adaptationLines.map((line) => (
                          <li key={`${pid}-ad-${line}`}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
                    aria-expanded={volatilityExpanded}
                    aria-controls={volatilityPanelId}
                    onClick={() =>
                      setVolatilityOpenByPlayer((prev) => ({
                        ...prev,
                        [pid]: !volatilityExpanded,
                      }))
                    }
                  >
                    <span className={`transition-transform ${volatilityExpanded ? "rotate-90" : ""}`} aria-hidden="true">▸</span>
                    <span>
                      {lang === "IS" ? "Sveiflur síðustu daga" : "Recent volatility"}
                      {typeof volatilitySummary.overallScore === "number" ? ` · ${volatilitySummary.overallScore.toFixed(1)}` : ""}
                    </span>
                  </button>

                  {volatilityExpanded ? (
                    <div id={volatilityPanelId} className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {lang === "IS" ? "Sveiflur síðustu daga" : "Recent volatility"}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold tabular-nums text-slate-700">
                            {lang === "IS" ? "Skor" : "Score"} {typeof volatilitySummary.overallScore === "number" ? `${volatilitySummary.overallScore.toFixed(1)}/100` : "—"}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${volatilityLevelTone(volatilitySummary.level)}`}>
                            {volatilityLevelLabel(volatilitySummary.level)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                        {lang === "IS"
                          ? `Síðustu ${volatilitySummary.windowDays || volatilitySummary.sampleSize || 0} dagar`
                          : `Last ${volatilitySummary.windowDays || volatilitySummary.sampleSize || 0} days`}
                      </div>
                      <div className="mt-2 text-sm text-slate-700">{volatilitySummary.interpretation}</div>
                      {volatilitySummary.drivers.length ? (
                        <div className="mt-2 text-xs text-slate-600">
                          <span className="font-medium text-slate-700">
                            {lang === "IS" ? "Helstu drifkraftar" : "Main drivers"}:
                          </span> {summarizeDrivers(volatilitySummary)}
                        </div>
                      ) : null}
                      {volatilitySummary.drivers.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {volatilitySummary.drivers.map((driver) => (
                            <span key={`${pid}-vol-driver-${driver.key}`} className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600">
                              {driver.label}: {driver.volatilityScore.toFixed(1)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {volatilitySummary.dailyComposite.length >= 2 ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-2 py-2">
                          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                            <span>{lang === "IS" ? "Sveiflu-stefna" : "Volatility trend"}</span>
                            <span className="tabular-nums">min {Math.min(...volatilitySummary.dailyComposite).toFixed(1)} · max {Math.max(...volatilitySummary.dailyComposite).toFixed(1)}</span>
                          </div>
                          <svg viewBox="0 0 220 44" className="h-11 w-full" role="img" aria-label="Recent volatility line graph">
                            <line x1="0" y1="43.5" x2="220" y2="43.5" stroke="#E5E7EB" strokeWidth="1" />
                            <line x1="0" y1="22" x2="220" y2="22" stroke="#F3F4F6" strokeWidth="1" />
                            <polyline fill="none" stroke="#374151" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" points={volatilityLinePoints(volatilitySummary.dailyComposite)} />
                            {volatilityGraphPoints.map((p, idx) => (
                              <g key={`${pid}-vol-point-${idx}`}>
                                <circle cx={p.x} cy={p.y} r="1.8" fill="#111827" />
                                <text x={p.x} y={Math.max(7, p.y - 3)} textAnchor="middle" fontSize="6" fill="#374151">
                                  {p.value.toFixed(1)}
                                </text>
                              </g>
                            ))}
                          </svg>
                          <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
                            {volatilitySummary.dailyComposite.map((value, idx) => (
                              <span key={`${pid}-vol-day-${idx}`} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 tabular-nums">
                                {volatilityGraphLabels[idx] ?? `D-${volatilitySummary.dailyComposite.length - 1 - idx}`}: {value.toFixed(1)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {volatilitySummary.currentVsTrendNote ? <div className="mt-2 text-[10px] text-slate-500">{volatilitySummary.currentVsTrendNote}</div> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {renderAccordionSection(
              "trainingSession",
              sectionHeaders.trainingSession,
              trainingSessionSummary,
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {lang === "IS" ? "Skipulagning æfingar" : "Session planning"}
                  </span>
                  <span
                    className={
                      graphSession.mode === "graph"
                        ? "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                        : "inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
                    }
                  >
                    {lang === "IS" ? "Heimild" : "Source"}: {graphSession.mode === "graph" ? "Training Graph" : (lang === "IS" ? "Eldra sniðmát" : "Legacy template")}
                  </span>
                </div>

                {graphSession.mode === "graph" && graphSession.ateDecisionPanel ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">{graphSession.ateDecisionPanel.title}</div>
                      {graphSession.ateDecisionPanel.sourceLabel ? <span className="text-[10px] uppercase tracking-wide text-slate-500">{graphSession.ateDecisionPanel.sourceLabel}</span> : null}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      {lang === "IS" ? "Æfing" : "Session"}: {graphSession.ateDecisionPanel.sessionLabel}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {lang === "IS" ? "Staða" : "State"}: {graphSession.ateDecisionPanel.athleteStateLabel}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      MD: {graphSession.ateDecisionPanel.mdContextLabel}
                    </div>
                    {graphSession.ateDecisionPanel.adjustmentLines.length ? <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.adjustments}</div> : null}
                    {graphSession.ateDecisionPanel.adjustmentLines.length ? (
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                        {graphSession.ateDecisionPanel.adjustmentLines.map((line) => (
                          <li key={`${pid}-ate-adjust-${line}`}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {graphSession.ateDecisionPanel.reasonLines.length ? <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.why}</div> : null}
                    {graphSession.ateDecisionPanel.reasonLines.length ? (
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
                        {graphSession.ateDecisionPanel.reasonLines.slice(0, 4).map((line) => (
                          <li key={`${pid}-ate-reason-${line}`}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {graphSession.ateDecisionPanel.riskFlagLines.length ? <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.risk}</div> : null}
                    {graphSession.ateDecisionPanel.riskFlagLines.length ? (
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-amber-700">
                        {graphSession.ateDecisionPanel.riskFlagLines.slice(0, 3).map((line) => (
                          <li key={`${pid}-ate-risk-${line}`}>{line}</li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{subHeaders.confidence}</div>
                        <span
                          className={
                            decisionConfidence.level === "HIGH"
                              ? "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                              : decisionConfidence.level === "MEDIUM"
                              ? "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                              : "inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700"
                          }
                        >
                          {decisionConfidence.level === "HIGH"
                            ? (lang === "IS" ? "Hár" : "High")
                            : decisionConfidence.level === "MEDIUM"
                              ? (lang === "IS" ? "Miðlungs" : "Medium")
                              : (lang === "IS" ? "Lágur" : "Low")}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">{subHeaders.inputs}: {decisionConfidence.inputsUsed.length ? decisionConfidence.inputsUsed.join(", ") : (lang === "IS" ? "Engir" : "None")}</div>
                      <div className="mt-1 text-xs text-slate-600">{subHeaders.missing}: {decisionConfidence.missingInputs.length ? decisionConfidence.missingInputs.join(", ") : (lang === "IS" ? "Engir" : "None")}</div>
                      <div className="mt-1 text-xs text-slate-600">{subHeaders.fallbacks}: {decisionConfidence.fallbackUsed ? (lang === "IS" ? "Hluti" : "Partial") : (lang === "IS" ? "Engir" : "None")}</div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Legacy template rendering retained.
                    {graphSession.fallbackReason ? <> Fallback reason: <span className="font-mono">{graphSession.fallbackReason}</span></> : null}
                  </div>
                )}

                {graphSession.mode === "graph" && graphSession.coachView ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">{graphSession.coachView.title}</div>
                      <div className="text-sm text-slate-500">{graphSession.coachView.subtitle}</div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {graphSession.coachView.nodes.map((node) => (
                        <div key={`${pid}-graph-${node.nodeId}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900">{node.title}</div>
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{node.status}</span>
                          </div>
                          {node.exercises.length ? <div className="mt-2 text-sm text-slate-700">{node.exercises.join(", ")}</div> : <div className="mt-2 text-sm text-slate-500">No exercise selected</div>}
                          {node.prescriptionLines.length ? (
                            <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                              {node.prescriptionLines.slice(0, 3).map((line) => (
                                <li key={`${pid}-${node.nodeId}-${line}`}>{line}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {sessionDraft ? (
                  <div className="space-y-3">
                    <SessionDraftCard draft={sessionDraft} />
                    <SessionDraftDetails draft={sessionDraft} />
                  </div>
                ) : null}

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <select
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                    defaultValue=""
                    onChange={(e) => {
                      const tid = e.target.value;
                      if (!tid) return;
                      assignTemplate(r.player_id, r.entry_date, tid, r.team_id ?? null);
                    }}
                    disabled={lockedForCoach || isSaving}
                  >
                    <option value="">Template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title ?? t.code}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={async () => saveConfirmed(r)}
                    disabled={isSaving || lockedForCoach}
                    className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50"
                    title={lockedForCoach ? "Locked fyrir daginn" : "Save (editable)"}
                  >
                    {lockedForCoach ? "Locked" : isSaving ? "Saving..." : saved[pid] ? "Saved" : "Save"}
                  </button>

                  {!r.is_locked ? (
                    <button
                      onClick={async () => lockForDay(r)}
                      disabled={isSaving}
                      className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50"
                      title="Lock (endanlegt fyrir daginn)"
                    >
                      Lock
                    </button>
                  ) : isAdmin ? (
                    <button
                      onClick={async () => unlockForDay(r)}
                      disabled={isSaving}
                      className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50"
                      title="Admin: Unlock"
                    >
                      Unlock
                    </button>
                  ) : null}
                </div>

                {/* Engine debug — admin-only. Was previously shown to every coach;
                    technical info (stage IDs, reason codes, raw timestamps) is
                    only useful for diagnosing pipeline issues. */}
                {isAdmin ? (
                  <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                    <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {lang === "IS" ? "Tæknilegar upplýsingar (admin)" : "Engine debug (admin)"}
                    </summary>
                    <div className="mt-2">Auto reason: <span className="font-mono">{r.final_reason ?? "—"}</span></div>
                    <div className="mt-1">Stage4: system=<span className="font-mono">{r.system_decision ?? "—"}</span> · coach=<span className="font-mono">{r.coach_decision ?? "—"}</span> · final=<span className="font-mono">{r.final_decision ?? "—"}</span> · source=<span className="font-mono">{r.final_source ?? "—"}</span></div>
                    <div className="mt-1">Readiness id: <span className="font-mono">{r.readiness_entry_id ?? "—"}</span> · Updated: <span className="font-mono">{r.stage4_updated_at ?? "—"}</span></div>
                  </details>
                ) : null}
              </div>
            )}

            {renderAccordionSection(
              "neuralLoad",
              sectionHeaders.neuralLoad,
              neuralSummaryText,
              <div className="space-y-4">
                {neural ? (() => {
                  const stateTone = neural.neuralLoadState === "CRITICAL"
                    ? "border-red-300 bg-red-50 text-red-800"
                    : neural.neuralLoadState === "RISING"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800";
                  const trajTone = neural.readinessTrajectory === "DECLINING"
                    ? "border-red-300 bg-red-50 text-red-800"
                    : neural.readinessTrajectory === "IMPROVING"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-300 bg-white text-slate-700";
                  const riskTone = neural.nextDayRisk === "HIGH"
                    ? "border-red-300 bg-red-50 text-red-800"
                    : neural.nextDayRisk === "MODERATE"
                      ? "border-amber-300 bg-amber-50 text-amber-800"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800";
                  const chipBase = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold";
                  return (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`${chipBase} ${stateTone}`}>
                          <span className="text-[9px] uppercase tracking-wide opacity-70">{lang === "IS" ? "Staða" : "State"}</span>
                          {neural.neuralLoadState}
                        </span>
                        <span className={`${chipBase} ${trajTone}`}>
                          <span className="text-[9px] uppercase tracking-wide opacity-70">{lang === "IS" ? "Stefna" : "Trajectory"}</span>
                          {neural.readinessTrajectory}
                        </span>
                        <span className={`${chipBase} ${riskTone}`}>
                          <span className="text-[9px] uppercase tracking-wide opacity-70">{lang === "IS" ? "Næsta dag" : "Next-day"}</span>
                          {neural.nextDayRisk}
                        </span>
                        <span className={`${chipBase} border-slate-300 bg-white text-slate-700`}>
                          <span className="text-[9px] uppercase tracking-wide opacity-70">{lang === "IS" ? "Skor" : "Score"}</span>
                          <span className="tabular-nums">{neural.neuralLoadScore}</span>
                        </span>
                      </div>
                      {neural.summary ? (
                        <div className="text-sm leading-6 text-slate-700">{neural.summary}</div>
                      ) : null}
                      {!!neural.drivers?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">
                            {lang === "IS" ? "Drifkraftar" : "Drivers"}:
                          </span>
                          {neural.drivers.slice(0, 6).map((d, idx) => (
                            <span
                              key={`${pid}-nl-driver-${idx}-${d.label}`}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700"
                            >
                              {d.label}
                              <span className="tabular-nums text-slate-500">+{d.points}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })() : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {lang === "IS" ? "Engin neural-gögn." : "No neural load data."}
                  </div>
                )}

                {neuralBiasApplied ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                      {lang === "IS" ? "Þreytuvog beitt" : "Bias applied"}
                    </div>
                    <div className="mt-2 leading-6">
                      {neuralBiasWhy || (lang === "IS"
                        ? "Neural-merki fóru yfir vog-mörk."
                        : "Neural risk signals crossed bias threshold.")}
                    </div>
                    {!!r._neural_bias_reason_codes?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r._neural_bias_reason_codes.map((code: string) => (
                          <span key={`${pid}-bias-${code}`} className="inline-flex items-center rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {renderAccordionSection(
              "coachMessage",
              sectionHeaders.coachMessage,
              coachMessageSummary,
              <div className="space-y-3">
                <textarea
                  className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                  rows={3}
                  value={draftMessage[pid] ?? ""}
                  onChange={(e) => setDraftMessage((p) => ({ ...p, [pid]: e.target.value }))}
                  disabled={isSaving || (r.is_locked && !isAdmin)}
                  placeholder={lang === "IS" ? "Skrifaðu skilaboð til leikmanns…" : "Write a message to the player…"}
                />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  {lang === "IS"
                    ? `Vista = staðfest (breytanlegt). Læsa = endanlegt fyrir daginn. Sjálfvirk læsing: ${AUTO_LOCK_MINUTES_BEFORE} mín fyrir æfingu.`
                    : `Save = confirmed (editable). Lock = final for the day. Auto-lock: ${AUTO_LOCK_MINUTES_BEFORE} min before session start.`}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </React.Fragment>
    );
  };

  /** -----------------------------
   * Early return
   * ----------------------------- */

  // ── Personal trainer: render trainer dashboard instead ──
  // Must be BEFORE the loading check — TrainerDashboard has its own loading state,
  // and the regular coach data-loading never calls setLoading(false) for PT teams.
  if (teamType === "personal_trainer" && coachTeamId) {
    return (
      <TrainerErrorBoundary>
        <TrainerDashboard teamId={coachTeamId} />
      </TrainerErrorBoundary>
    );
  }

  if (loading) return <div className="py-6 text-sm text-muted-foreground">Hleð...</div>;

  const sectionTitleClass = "text-base font-semibold tracking-tight text-slate-900";
  const sectionSubtitleClass = "text-xs text-slate-500";
  const statLabelClass = "text-[10px] uppercase tracking-wide text-slate-500";
  const statValueClass = "mt-1 text-lg font-semibold tabular-nums text-slate-900";
  const softSurfaceClass = "rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm";
  const summaryCardClass = "rounded-[24px] border border-slate-200 bg-white shadow-sm";
  const summaryTileClass = "rounded-2xl border border-slate-200 bg-white p-4";
  const compactTileClass = "rounded-xl border p-3";

  return (
    <div className="space-y-6">
      {/* ── Workspace tab navigation (monitoring tools) ───────────────────
          Tabs are coherent player-monitoring views. In-app tabs (today,
          squad, load, gps + More items) switch via setDashTab; standalone
          routes (Quadrant, Indoor, Decel, Injuries) are Next.js Links that
          navigate away from the dashboard. Hidden in PWA — bottom nav used
          instead. */}
      {!isPwa && (() => {
        const labels = ct.tabs as Record<string, string>;
        const proTabs = new Set(["squad", "load", "gps", "md", "drills", "volatility", "vald", "strength", "trend", "rtp"]);

        // Primary in-app tabs — daily monitoring workflow
        const PRIMARY_TABS: Array<typeof dashTab> = ["today", "squad", "load", "gps"];
        // Standalone routes for deeper monitoring analytics — render as Links.
        // Tier-aware filtering mirrors the sidebar:
        //   LITE: hides Indoor Load + Decel Intel (need B2-3/IMA bands),
        //         shows HSR Intelligence (Malone 2017 equivalent for Lite)
        //   FULL: hides HSR Intelligence (redundant with higher-fidelity
        //         Decel Intel on Full), shows Indoor + Decel.
        // Quadrant is shown on both — Gabbett 2016 (volume) on Lite,
        // Gabbett 2017 (volume + B2-3) on Full.
        const LITE_HIDDEN_HREFS = new Set<string>([
          "/coach/indoor-load", "/coach/decel-intelligence",
        ]);
        const FULL_HIDDEN_HREFS = new Set<string>([
          "/coach/hsr-intelligence",
        ]);
        const ALL_EXTERNAL_TABS: Array<{ href: string; label: { EN: string; IS: string } }> = [
          { href: "/coach/quadrant",           label: { EN: "Quadrant",         IS: "Quadrant" } },
          { href: "/coach/indoor-load",        label: { EN: "Indoor Load",      IS: "Indoor Load" } },
          { href: "/coach/decel-intelligence", label: { EN: "Decel Intel.",     IS: "Decel Intel." } },
          { href: "/coach/hsr-intelligence",   label: { EN: "HSR Intel.",       IS: "HSR Intel." } },
          { href: "/coach/injuries",           label: { EN: "Injury Patterns",  IS: "Meiðsla-munstur" } },
        ];
        const EXTERNAL_TABS = catapultDataTier === "full"
          ? ALL_EXTERNAL_TABS.filter((t) => !FULL_HIDDEN_HREFS.has(t.href))
          : ALL_EXTERNAL_TABS.filter((t) => !LITE_HIDDEN_HREFS.has(t.href));
        // Overflow tabs (volatility, vald, strength, trend, rtp) used to
        // sit behind a "More ▾" dropdown here — moved to the sidebar
        // Monitoring section as first-class links. The ?tab=… URLs still
        // route through this page so deep links land on the right view.

        const TabBtn = ({ tabId }: { tabId: typeof dashTab }) => {
          const isLocked = proTabs.has(tabId) && !isAtLeastPro && !planLoading;
          return (
            <button
              onClick={() => setDashTab(tabId)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                dashTab === tabId
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {labels[tabId]}
              {isLocked && (
                <svg className="h-3 w-3 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              )}
            </button>
          );
        };

        return (
          <div className="border-b border-slate-200">
            <nav className="-mb-px flex items-center justify-between">
              <div className="-mb-px flex items-center">
                {PRIMARY_TABS.map((tabId) => (
                  <TabBtn key={tabId} tabId={tabId} />
                ))}

                {/* Visual separator between in-app tabs and route-based tabs */}
                <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />

                {/* Standalone monitoring routes */}
                {EXTERNAL_TABS.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap"
                  >
                    {lang === "IS" ? t.label.IS : t.label.EN}
                  </Link>
                ))}

                {/* "More" dropdown removed — Volatility / VALD / Strength /
                    Trends / RTP now live as first-class links in the
                    Monitoring section of the sidebar. The underlying tab
                    rendering (?tab=volatility etc) still works so sidebar
                    links land directly on the right view. */}
              </div>

              {/* Language toggle */}
              <div className="flex items-center rounded-full border border-slate-200 bg-white p-0.5 text-xs font-semibold mb-px mr-1">
                <button
                  onClick={() => setLang("IS")}
                  className={`rounded-full px-2.5 py-1 transition-colors ${lang === "IS" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}
                >IS</button>
                <button
                  onClick={() => setLang("EN")}
                  className={`rounded-full px-2.5 py-1 transition-colors ${lang === "EN" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}
                >EN</button>
              </div>
            </nav>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          TODAY TAB
      ══════════════════════════════════════════ */}
      {dashTab === "today" && (
        <div className="space-y-6">
          {/* Reports — collapsed into a single right-aligned "Export" menu so the
              PDF actions don't eat the most valuable space at the top of Today.
              They're an action, not information; the popover keeps them one click
              away with the shared day picker, rest-day toggle and captions. */}
          <div className="flex justify-end">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {lang === "IS" ? "Sækja skýrslur" : "Export reports"}
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {lang === "IS" ? "Skýrslur" : "Reports"}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {lang === "IS" ? "sendanlegar PDF fyrir liðið" : "sendable PDF for the squad"}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadReadinessRiskReport}
                    disabled={pdfDownloading || loading}
                    title={lang === "IS" ? "Hverjir eru flaggaðir út frá innskráningum dagsins" : "Who is flagged from today's check-ins"}
                    className="w-full justify-start gap-1.5 border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {pdfDownloading ? "Generating…" : "Readiness Risk"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadPreSessionReport(postReportDate || undefined)}
                    disabled={pdfPreDownloading || loading}
                    title={lang === "IS" ? "Ráðlagt álag FYRIR æfingu — target, RPE, top attention" : "Recommended load BEFORE training — targets, RPE, top attention"}
                    className="w-full justify-start gap-1.5 border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {pdfPreDownloading ? "Generating…" : "Pre-Session"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadPostTrainingReport(postReportDate || undefined)}
                    disabled={pdfPostDownloading || loading}
                    title={lang === "IS" ? "Hvað liðið gerði EFTIR æfingu — raun vs plan" : "What the squad did AFTER training — actual vs plan"}
                    className="w-full justify-start gap-1.5 border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {pdfPostDownloading ? "Generating…" : "Post-Training"}
                  </Button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                  {/* Shared day selector — empty = today / latest session. */}
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    {lang === "IS" ? "Dagur" : "Day"}
                    <input
                      type="date"
                      value={postReportDate}
                      max={today}
                      onChange={(e) => setPostReportDate(e.target.value)}
                      title={lang === "IS" ? "Veldu dag (tómt = í dag / nýjasta)" : "Pick a day (empty = today / latest)"}
                      className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
                    />
                  </label>
                  {/* Rest-day toggle for the Pre-Session report — persists per day and
                      syncs with the /coach/load-plan page. */}
                  <label
                    className="flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-600"
                    title={lang === "IS" ? "Merkja daginn sem frídag — Pre-Session skýrslan sýnir þá ekkert target" : "Mark the day as a rest day — the Pre-Session report then shows no targets"}
                  >
                    <input
                      type="checkbox"
                      checked={preRestDay}
                      onChange={(e) => { setPreRestDay(e.target.checked); writeRestDayPref(postReportDate || today, e.target.checked); }}
                      className="h-3.5 w-3.5 accent-slate-700"
                    />
                    {lang === "IS" ? "Frídagur" : "Rest day"}
                  </label>
                </div>
                {/* Per-report captions so coaches know what each button produces. */}
                <p className="mt-2.5 text-[11px] leading-snug text-slate-500">
                  {lang === "IS" ? (
                    <>
                      <span className="font-medium text-slate-600">Readiness Risk</span>: hverjir eru flaggaðir út frá innskráningum dagsins ·{" "}
                      <span className="font-medium text-slate-600">Pre-Session</span>: ráðlagt álag <em>fyrir</em> æfingu (target, RPE, top attention) ·{" "}
                      <span className="font-medium text-slate-600">Post-Training</span>: hvað liðið gerði <em>eftir</em> æfingu — raun vs plan. Veldu dag eða skildu eftir tómt fyrir í dag / nýjustu æfingu.
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-slate-600">Readiness Risk</span>: who&apos;s flagged from today&apos;s check-ins ·{" "}
                      <span className="font-medium text-slate-600">Pre-Session</span>: the recommended load <em>before</em> training (targets, RPE, top attention) ·{" "}
                      <span className="font-medium text-slate-600">Post-Training</span>: what the squad actually did <em>after</em> training vs the plan. Pick a day, or leave empty for today / the latest session.
                    </>
                  )}
                </p>
              </PopoverContent>
            </Popover>
          </div>
          {/* Onboarding checklist — only shown to new clubs */}
          <OnboardingChecklist
            teamId={coachTeamId}
            lang={lang}
            playerCount={rows.length}
            hasCheckIn={rows.some((r) => r.total_score != null)}
            hasGpsData={gpsAllPlayers.length > 0}
            hasDecision={rows.some((r) => (r as Record<string, unknown>).training_action != null)}
            hasSport={teamSport != null && teamSport.length > 0}
          />
          {/* Team break / return-to-training banner (declared breaks). */}
          {coachTeamId && <CoachBreakBanner teamId={coachTeamId} lang={lang === "EN" ? "EN" : "IS"} />}
          {/* Daily briefing — Gabbett (2020) Communicate step */}
          <DailyBriefingCard
            today={today}
            lang={lang}
            rows={rows as any}
            playerComposites={playerComposites}
            complianceSummary={complianceSummary as any}
            mdDayToday={mdDayToday}
            teamSignal={teamSignal as any}
            dayStateLabel={dayStateInfo?.label ?? null}
            recentDayTypes={recentDayTypes}
            playerBaselines={playerBaselines}
            playerCounterfactuals={playerCounterfactualsMap}
            playerInjuries={playerInjuryStatus}
            playerDeltas={yesterdayDeltas}
          />
          {/* Unfamiliar Load — Driver-layer "what to look at" (signal-level attention) */}
          <UnfamiliarLoadCard lang={lang} date={today} />
          {/* Today Command Center */}
          <Card className={summaryCardClass}>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg font-semibold uppercase tracking-[0.18em] text-slate-900">{ct.header.commandCenter}</CardTitle>
                  <CardDescription className="mt-1 text-sm text-slate-500">{ct.header.decisionSummary}</CardDescription>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Auto-lock: {AUTO_LOCK_MINUTES_BEFORE} min before session start</span>
                    <span className="text-slate-400">·</span>
                    <span>Coach {coachDisplayName ?? "—"}</span>
                    {mdDayToday ? (
                      <>
                        <span className="text-slate-400">·</span>
                        <span>{String(mdDayToday).toUpperCase().startsWith("MD") ? String(mdDayToday) : `MD ${mdDayToday}`}</span>
                      </>
                    ) : null}
                  </div>
                  {catapultSyncMessage ? <div className="mt-1.5 text-xs text-slate-600">{catapultSyncMessage}</div> : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
                  {gpsProvider === "statsport" ? (
                    <Button
                      size="sm"
                      onClick={() => syncStatSportForDate(today)}
                      disabled={catapultSyncing || loading}
                      className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${catapultSyncing ? "animate-spin" : ""}`} />
                      {catapultSyncing ? ct.actions.syncingStatSport : ct.actions.syncStatSport}
                    </Button>
                  ) : gpsProvider !== "none" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => syncCatapultForDate(today)}
                        disabled={catapultSyncing || loading}
                        className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${catapultSyncing ? "animate-spin" : ""}`} />
                        {catapultSyncing ? ct.actions.syncingCatapult : ct.actions.syncCatapult}
                      </Button>
                      {/* Backfill a specific past day — for a match whose vest
                          data reached Catapult after the daily sweep window. */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={backfillDate}
                          onChange={(e) => setBackfillDate(e.target.value)}
                          className="h-8 rounded-md border border-slate-300 px-2 text-xs"
                          title="Veldu dag til að sækja aftur"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => backfillCatapultForDate(backfillDate)}
                          disabled={catapultSyncing || loading || !backfillDate}
                          className="gap-1.5"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${catapultSyncing ? "animate-spin" : ""}`} />
                          Backfill
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const risk = computeTeamRisk(teamSignal, lang);
                const ui = riskUi(risk.level);
                const fatigueSummary = (fatigueSnapshot as { teamFatigueSummary?: { dominantType?: string } } | null)
                  ?.teamFatigueSummary;
                const fatigueDominant = String(fatigueSummary?.dominantType ?? "—");
                const neuralState = String(teamNeuralSummary?.dominantState ?? "—");
                const nextDayRisk = String(teamNeuralSummary?.nextDayRiskSummary ?? "—");
                // OFF day detection — drives both the narrative builder
                // and which secondary lines we surface below.
                const isOffDay = teamDayType === "OFF" || dayStateInfo.state === "OFF_DAY";

                // ── Coach narrative builder ─────────────────────────────
                // Reads every tile in Today Command Center and stitches a
                // 1–2 sentence headline + per-signal detail + 1–3 action
                // bullets in plain coach language. Goal: coach can read
                // this in 5 seconds and know exactly what to do today
                // WITHOUT having to interpret the raw tile values.
                //
                // Build is deterministic (no LLM) so it's instant, never
                // hallucinates, and works offline. Inputs come from the
                // same state the tiles consume — single source of truth.
                const nFullN = teamSignal?.n_full ?? 0;
                const nReducedN = teamSignal?.n_reduced ?? 0;
                const nRecoveryN = teamSignal?.n_recovery ?? 0;
                const nTotal = nFullN + nReducedN + nRecoveryN;
                const volPct = typeof teamIntel?.volatility_pct === "number" ? teamIntel.volatility_pct : null;
                const volCount = teamIntel?.n_volatile ?? 0;
                const avgRisk = typeof teamPerformanceIntelligence?.averageRiskScore === "number"
                  ? teamPerformanceIntelligence.averageRiskScore : null;
                const protectedCount = teamRulesSummary?.protectedPlayersCount ?? 0;
                const adjustedCount = teamRulesSummary?.overriddenPlayersCount ?? 0;
                const baselineMaturity = String(teamIntel?.baseline_maturity ?? "—");
                const baselineCount = teamIntel?.n_players ?? 0;
                const fatigueLow = fatigueDominant === "normal" || fatigueDominant === "—" || fatigueDominant === "none" || fatigueDominant.toLowerCase() === "none";
                const neuralStable = /stable|normal|peaked/i.test(neuralState);
                const nextDayLow = /low|safe/i.test(nextDayRisk);
                const fatigueLabelLower = fatigueDominant.toLowerCase().replace(/_fatigue$/, "");

                const narrative: { headline: string; detail: string; bullets: string[] } = (() => {
                  // Declared break overrides everything — players are resting.
                  if (breakToday) {
                    return {
                      headline: lang === "IS"
                        ? `Liðið í fríi${breakToday.label ? ` — ${breakToday.label}` : ""} (dagur ${breakToday.day} af ${breakToday.total}).`
                        : `Team on break${breakToday.label ? ` — ${breakToday.label}` : ""} (day ${breakToday.day} of ${breakToday.total}).`,
                      detail: lang === "IS"
                        ? "Leikmenn fá fullt frí. Áminningar eru í pásu og þessir dagar telja ekki gegn streak eða compliance."
                        : "Players are getting a full rest. Reminders are paused and these days don't count against streak or compliance.",
                      bullets: [
                        lang === "IS"
                          ? "Engin æfing skipulögð — ekkert að fylgjast með í dag."
                          : "No session planned — nothing to monitor today.",
                        lang === "IS"
                          ? "Kerfið mildar álagið sjálfkrafa fyrstu dagana eftir fríið."
                          : "The system will ease the load back in over the first days after the break.",
                      ],
                    };
                  }
                  // OFF day path — different story entirely
                  if (isOffDay) {
                    const bullets: string[] = [];
                    // Microcycle context — pulled from the same Week-setup
                    // signal that drives the Planned Session Load card. On
                    // OFF days we fold it in here so the coach reads one
                    // coherent message instead of two cards saying "rest day".
                    const offPlan = planSessionLoad({
                      mdDay: mdDayToday,
                      dayType: teamDayType,
                      focus: (rows[0] as { planned_focus?: string | null } | undefined)?.planned_focus ?? null,
                      daysSincePrev: daysSincePrevToday,
                      daysToNext: daysToNextToday,
                    });
                    if (offPlan.reason === "off") {
                      bullets.push(lang === "IS" ? offPlan.rationaleIS : offPlan.rationaleEN);
                    }
                    if (volCount > 0) {
                      bullets.push(lang === "IS"
                        ? `${volCount} leikmaður er sveiflukenndur — sendu quick check-in í gegnum kerfið.`
                        : `${volCount} player is volatile — send a quick check-in via the system.`);
                    }
                    if (protectedCount > 0 || adjustedCount > 0) {
                      bullets.push(lang === "IS"
                        ? `Yfirfar Recovery Protocols fyrir ${protectedCount + adjustedCount} leikmenn sem eru í protected/adjusted stöðu.`
                        : `Review Recovery Protocols for the ${protectedCount + adjustedCount} player(s) currently protected/adjusted.`);
                    }
                    if (nReducedN === 0 && nRecoveryN === 0 && volCount === 0) {
                      bullets.push(lang === "IS"
                        ? "Ekkert að fylgjast með í dag — góður dagur til að skipuleggja næstu æfingu."
                        : "Nothing flagged today — good day to plan tomorrow's session.");
                    }
                    return {
                      headline: lang === "IS" ? "Frídagur — ekkert á dagskrá fyrir liðið." : "Rest day — no session for the squad.",
                      detail: lang === "IS"
                        ? `${nFullN} af ${nTotal} skiluðu wellness check-in og halda baseline-trendinu gangandi. Nýttu daginn í recovery og undirbúning.`
                        : `${nFullN} of ${nTotal} completed wellness check-in to keep the baseline trend running. Use the day for recovery and prep.`,
                      bullets,
                    };
                  }

                  // Training day path — risk-driven narrative
                  const headline: string = (() => {
                    if (risk.level === "HIGH") {
                      return lang === "IS"
                        ? `Áhættudagur — ${nReducedN + nRecoveryN} af ${nTotal} eru ekki klárir í fulla æfingu.`
                        : `Caution day — ${nReducedN + nRecoveryN} of ${nTotal} aren't ready for a full session.`;
                    }
                    if (risk.level === "CAUTION") {
                      return lang === "IS"
                        ? `Blandaður dagur — meirihluti tilbúinn en ${nReducedN + nRecoveryN} þurfa breytt eða styttra plan.`
                        : `Mixed day — most are ready but ${nReducedN + nRecoveryN} need a modified or shortened session.`;
                    }
                    if (nFullN === nTotal && fatigueLow && neuralStable && nextDayLow) {
                      return lang === "IS"
                        ? `Liðið er hresst og tilbúið — öruggur dagur til að keyra hörð plön.`
                        : `Squad is fresh and ready — safe day to run a hard session.`;
                    }
                    return lang === "IS"
                      ? `Liðið er nokkuð stöðugt — keyra plan eins og venjulega.`
                      : `Squad is broadly stable — run the plan as normal.`;
                  })();

                  const sentences: string[] = [];
                  // Sentence 1: availability
                  if (nReducedN === 0 && nRecoveryN === 0) {
                    sentences.push(lang === "IS"
                      ? `Allir ${nFullN} klárir í fulla æfingu.`
                      : `All ${nFullN} cleared for a full session.`);
                  } else {
                    const parts: string[] = [];
                    if (nFullN > 0) parts.push(lang === "IS" ? `${nFullN} klárir` : `${nFullN} ready`);
                    if (nReducedN > 0) parts.push(lang === "IS" ? `${nReducedN} skerðing` : `${nReducedN} reduced`);
                    if (nRecoveryN > 0) parts.push(lang === "IS" ? `${nRecoveryN} í recovery` : `${nRecoveryN} in recovery`);
                    sentences.push(parts.join(" · ") + ".");
                  }

                  // Sentence 2: fatigue / neural / next-day context
                  const ctx: string[] = [];
                  if (!fatigueLow) {
                    ctx.push(lang === "IS"
                      ? `ríkjandi þreyta er ${fatigueLabelLower}`
                      : `dominant fatigue is ${fatigueLabelLower}`);
                  }
                  if (!neuralStable) {
                    ctx.push(lang === "IS"
                      ? `taugaálag ${neuralState.toLowerCase()}`
                      : `neural load ${neuralState.toLowerCase()}`);
                  }
                  if (!nextDayLow) {
                    ctx.push(lang === "IS"
                      ? `morgundagsáhætta ${nextDayRisk.toLowerCase()}`
                      : `next-day risk ${nextDayRisk.toLowerCase()}`);
                  }
                  if (volPct != null && volPct >= 25) {
                    ctx.push(lang === "IS"
                      ? `${volPct.toFixed(0)}% sveiflukennt (${volCount} leikm.)`
                      : `${volPct.toFixed(0)}% volatile (${volCount} player${volCount === 1 ? "" : "s"})`);
                  }
                  if (avgRisk != null && avgRisk >= 60) {
                    ctx.push(lang === "IS"
                      ? `meðaláhætta liðsins ${avgRisk.toFixed(0)}/100`
                      : `team avg risk ${avgRisk.toFixed(0)}/100`);
                  }
                  if (ctx.length > 0) {
                    sentences.push((lang === "IS" ? "Sjáanlegt: " : "Notable: ") + ctx.join(", ") + ".");
                  } else if (fatigueLow && neuralStable && nextDayLow) {
                    sentences.push(lang === "IS"
                      ? `Engin þreytutilhneiging, taugaálag stöðugt og morgundagsáhætta lág.`
                      : `No fatigue dominance, nervous system stable, low next-day risk.`);
                  }

                  // Sentence 3: baseline confidence note (only if low)
                  if (baselineMaturity.toLowerCase() === "calibrating" || baselineMaturity.toLowerCase() === "building") {
                    sentences.push(lang === "IS"
                      ? `Athugaðu að baseline er enn að byggjast hjá ${baselineCount} leikmönnum — verdict-irnir geta hreyfst þegar fleiri dagar safnast saman.`
                      : `Note: baselines are still building for ${baselineCount} players — verdicts may shift as more sessions accrue.`);
                  }

                  // Action bullets
                  const bullets: string[] = [];
                  if (risk.level === "HIGH") {
                    bullets.push(lang === "IS"
                      ? `Lækka heildaráreynslu um ~30%, sleppa þungum eccentrics og lengja recovery-blokkir.`
                      : `Cut total load by ~30%, drop heavy eccentrics, extend recovery blocks.`);
                  } else if (risk.level === "CAUTION") {
                    bullets.push(lang === "IS"
                      ? `Halda gæðum á key actions en lækka volume (~20% færri sets) hjá þeim sem eru REDUCED.`
                      : `Keep quality on key actions but trim volume (~20% fewer sets) for the REDUCED group.`);
                  }
                  if (nRecoveryN > 0) {
                    bullets.push(lang === "IS"
                      ? `${nRecoveryN} leikmaður í recovery — pull úr hörðum blokkum, gefðu individual recovery plan.`
                      : `${nRecoveryN} player(s) in recovery — pull from hard blocks, assign individual recovery plan.`);
                  }
                  if (nReducedN > 0 && risk.level !== "HIGH") {
                    bullets.push(lang === "IS"
                      ? `Cap PL á ${nReducedN} REDUCED leikmönnum við ~60–80% af plani.`
                      : `Cap PL for the ${nReducedN} REDUCED player(s) at ~60–80% of plan.`);
                  }
                  if (volPct != null && volPct >= 30 && volCount > 0) {
                    bullets.push(lang === "IS"
                      ? `${volCount} leikmaður er sveiflukenndur — fyrsta 10 mín warm-up er gott eyrnaslag á dagsformi.`
                      : `${volCount} player(s) volatile — first 10 min of warm-up is your read on today's form.`);
                  }
                  if (bullets.length === 0) {
                    bullets.push(lang === "IS"
                      ? `Keyra plan eins og venjulega — ekkert sem þarf að breyta.`
                      : `Run the plan as designed — nothing needs to change.`);
                  }

                  return { headline, detail: sentences.join(" "), bullets };
                })();
                const externalLoadLine = isOffDay
                  ? null
                  : (teamExternalLoadSummary?.summaryLines[0] ?? null);
                const nFull = teamSignal?.n_full ?? 0;
                const nReduced = teamSignal?.n_reduced ?? 0;
                const nRecovery = teamSignal?.n_recovery ?? 0;
                // Primary tiles — the four counts a head coach reads every
                // morning to know who can train and how tomorrow looks.
                // Kept visible by default.
                const primaryTiles: Array<{ label: string; value: string; sub: string; tone: string; info: string }> = breakToday ? [] : [
                  {
                    label: "Ready",
                    value: String(nFull),
                    sub: "Cleared for a full session",
                    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
                    info: "Players cleared for full training today — no readiness or load concerns. Hard sessions are safe for these players.",
                  },
                  {
                    label: "Modified",
                    value: String(nReduced),
                    sub: "Lighter or adjusted plan",
                    tone: "border-amber-200 bg-amber-50 text-amber-800",
                    info: "Players who should still train but with adjustments — lower volume, skip the hardest blocks, or cap movement load around ~60–80% of plan.",
                  },
                  {
                    label: "Recovery",
                    value: String(nRecovery),
                    sub: "Needs a rest day",
                    tone: "border-rose-200 bg-rose-50 text-rose-800",
                    info: "Players who need a recovery day instead of training — high fatigue, illness, return-to-play, or 60+ match minutes yesterday.",
                  },
                  {
                    label: "Tomorrow",
                    // Friendlier capitalisation of the forecast band.
                    value: nextDayRisk === "—" ? "—" : nextDayRisk.charAt(0) + nextDayRisk.slice(1).toLowerCase(),
                    // Plain meaning instead of the bare word "Forecast".
                    sub: /low|safe/i.test(nextDayRisk)
                      ? "Hard session OK"
                      : /high|elevat|critical/i.test(nextDayRisk)
                        ? "Expect more tired players"
                        : nextDayRisk === "—"
                          ? "Forecast"
                          : "Plan a moderate day",
                    tone: "border-slate-200 bg-slate-50 text-slate-800",
                    info: "How the squad is likely to look tomorrow based on today's load and recent trajectory. Low = safe to plan a hard session tomorrow. Elevated = expect more players in the yellow / red bucket.",
                  },
                ];

                // Secondary tiles — S&C / sport-science detail. Hidden by
                // default behind the "Show team metrics" toggle so the
                // morning brief stays scannable for the head coach.
                const secondaryTiles: Array<{ label: string; value: string; sub: string; tone: string; info: string }> = [
                  {
                    label: "Dominant fatigue",
                    value: fatigueDominant,
                    sub: "Team signal",
                    tone: "border-slate-200 bg-slate-50 text-slate-800",
                    info: "The most common fatigue type across the squad today (neural, metabolic, mechanical, perceptual). Helps you decide what kind of session would hit hardest right now.",
                  },
                  {
                    label: "Neural load",
                    value: neuralState,
                    sub: "Current state",
                    tone: "border-slate-200 bg-slate-50 text-slate-800",
                    info: "Squad-level central nervous system state, read from VBT / jump tests and wellness trends. Stable = responding normally. Suppressed = needs recovery before another high-output day.",
                  },
                ];

                return (
                  <>
                    {/* Team outlook pill + Show-details toggle on the same row. */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        Team outlook: {teamOutlook.band}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCommandCenterDetails((v) => !v)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:underline"
                        aria-expanded={showCommandCenterDetails}
                      >
                        {showCommandCenterDetails ? "Hide team metrics" : "Show team metrics"}
                      </button>
                    </div>

                    {/* Coach narrative box — MOVED UP. This is the answer
                        to "what's today?". Tiles below are drill-down.
                        Previously sat at the bottom, forcing the coach
                        to scroll past 10 tiles to reach the verdict. */}
                    <div className={`rounded-2xl border p-4 text-sm ${ui.pill}`}>
                      <div className="text-[10px] uppercase tracking-wide opacity-80">
                        {isOffDay ? (lang === "IS" ? "Dagurinn í dag" : "Today") : (lang === "IS" ? "Túlkun MicroPulse" : "MicroPulse interpretation")}
                      </div>
                      <div className="mt-2 text-base font-semibold text-slate-900">{narrative.headline}</div>
                      <div className="mt-1.5 text-sm text-slate-700 leading-relaxed">{narrative.detail}</div>
                      {narrative.bullets.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm text-slate-700">
                          {narrative.bullets.map((b, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="mt-0.5 shrink-0 text-slate-500">→</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Primary tiles — 4 counts a head coach reads every
                        morning. Stays at 4 columns on wide screens so the
                        coach can scan the row in one glance. */}
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {primaryTiles.map((tile) => (
                        <div key={tile.label} className={`${compactTileClass} ${tile.tone}`}>
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                            <span className="opacity-80">{tile.label}</span>
                            <CommandTileInfo title={tile.label} info={tile.info} />
                          </div>
                          <div className="mt-1 text-lg font-semibold tabular-nums">{tile.value}</div>
                          <div className="mt-1 text-xs opacity-75">{tile.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Secondary tiles — S&C drill-down. Hidden by
                        default so the morning brief stays scannable.
                        Coach toggles "Show team metrics" to see them. */}
                    {showCommandCenterDetails ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                          {secondaryTiles.map((tile) => (
                            <div key={tile.label} className={`${compactTileClass} ${tile.tone}`}>
                              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                                <span className="opacity-80">{tile.label}</span>
                                <CommandTileInfo title={tile.label} info={tile.info} />
                              </div>
                              <div className="mt-1 text-lg font-semibold tabular-nums">{tile.value}</div>
                              <div className="mt-1 text-xs opacity-75">{tile.sub}</div>
                            </div>
                          ))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className={`${compactTileClass} border-violet-200 bg-violet-50 text-violet-800`}>
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                              <span className="opacity-80">Volatility</span>
                              <CommandTileInfo
                                title="Volatility"
                                info="% of the squad whose readiness or load is bouncing around outside their normal range. High volatility = unpredictable response — expect more variance in how players show up to the next session."
                              />
                            </div>
                            <div className="mt-1 text-lg font-semibold tabular-nums">{teamIntel?.volatility_pct != null ? `${teamIntel.volatility_pct}%` : "—"}</div>
                            <div className="mt-1 text-xs opacity-75">{teamIntel?.n_volatile ?? 0} volatile</div>
                          </div>
                          <div className={`${compactTileClass} border-blue-200 bg-blue-50 text-blue-800`}>
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                              <span className="opacity-80">Avg risk</span>
                              <CommandTileInfo
                                title="Avg risk"
                                info="Squad's average injury-risk score (0–100), driven by recent load spikes, asymmetries, prior injuries and acute flags. Watch the trend more than the absolute number — a steady rise across sessions matters more than today's value."
                              />
                            </div>
                            <div className="mt-1 text-lg font-semibold tabular-nums">{teamPerformanceIntelligence?.averageRiskScore != null ? teamPerformanceIntelligence.averageRiskScore.toFixed(1) : "—"}</div>
                            <div className="mt-1 text-xs opacity-75">Team average</div>
                          </div>
                          <div className={`${compactTileClass} border-slate-200 bg-slate-50 text-slate-800`}>
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                              <span className="opacity-80">Protected</span>
                              <CommandTileInfo
                                title="Protected"
                                info="Players currently protected by a hard rule (illness, injury, return-to-play, or post-match recovery). 'Adjusted' = players where the engine modified the verdict from what raw signals would otherwise say."
                              />
                            </div>
                            <div className="mt-1 text-lg font-semibold tabular-nums">{teamRulesSummary?.protectedPlayersCount ?? 0}</div>
                            <div className="mt-1 text-xs opacity-75">{teamRulesSummary?.overriddenPlayersCount ?? 0} adjusted</div>
                          </div>
                          <div className={`${compactTileClass} border-slate-200 bg-slate-50 text-slate-800`}>
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                              <span className="opacity-80">Baseline</span>
                              <CommandTileInfo
                                title="Baseline"
                                info="How mature each player's personal baseline is. Stable = enough history (~14+ days of check-ins / GPS) to flag deviations confidently. Building = still gathering data, so verdicts may shift as the baseline settles."
                              />
                            </div>
                            <div className="mt-1 text-lg font-semibold tabular-nums">{teamIntel?.baseline_maturity ?? "—"}</div>
                            <div className="mt-1 text-xs opacity-75">{teamIntel?.n_players ?? 0} players</div>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {/* AI deeper-analysis section — the headline narrative
                        now lives at the TOP of this card (moved 2026-05-27
                        so the coach reads the verdict before the tiles).
                        This wrapper kept for the ELITE AI button + result. */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                      {/* ELITE AI deeper-analysis button. Sends team facts to
                          Claude Haiku, which writes 2 paragraphs of context
                          and connections that the rule-based narrative can't
                          see (e.g. "the four reduced players all share the
                          midfield rotation, so the box-to-box workload is
                          concentrated"). Gated server-side; PRO/FREE see a
                          402 → renders the upgrade prompt inline. */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setAiTeamLoading(true);
                            setAiTeamError(null);
                            try {
                              const { data: sess } = await supabase.auth.getSession();
                              const token = sess?.session?.access_token;
                              if (!token) { setAiTeamError("Not signed in"); return; }
                              const res = await fetch("/api/coach/team-analysis", {
                                method: "POST",
                                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                                body: "{}",
                              });
                              const json = await res.json();
                              if (res.status === 402) {
                                setAiTeamError(lang === "IS"
                                  ? "Þessi greining er ELITE-eiginleiki. Uppfærðu áskrift til að nýta dýpri AI túlkun."
                                  : "Deeper analysis is an ELITE feature. Upgrade your plan to unlock AI interpretation.");
                                return;
                              }
                              if (!res.ok) {
                                setAiTeamError(typeof json?.error === "string" ? json.error : "AI generation failed");
                                return;
                              }
                              setAiTeamAnalysis({
                                paragraph_1: String(json.paragraph_1 ?? ""),
                                paragraph_2: String(json.paragraph_2 ?? ""),
                                generated_at: String(json.generated_at ?? new Date().toISOString()),
                              });
                            } catch (e) {
                              setAiTeamError(e instanceof Error ? e.message : "Network error");
                            } finally {
                              setAiTeamLoading(false);
                            }
                          }}
                          disabled={aiTeamLoading}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                            aiTeamLoading
                              ? "border-slate-300 bg-slate-100 text-slate-500 cursor-wait"
                              : "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100"
                          }`}
                          title={lang === "IS"
                            ? "Sendir samantekt á Claude (AI) sem skrifar 2 málsgreinar með dýpri samhengi en deterministic kerfið getur séð. ELITE-eiginleiki."
                            : "Sends today's squad facts to Claude (AI) for a 2-paragraph deeper interpretation with context the rule-based engine can't surface. ELITE feature."}
                        >
                          <span>✨</span>
                          {aiTeamLoading
                            ? (lang === "IS" ? "Greini…" : "Analysing…")
                            : aiTeamAnalysis
                              ? (lang === "IS" ? "Endurtaka greiningu" : "Re-run analysis")
                              : (lang === "IS" ? "Smelltu fyrir dýpri greiningu" : "Press for deeper analysis")
                          }
                          {!aiTeamAnalysis && (
                            <span className="rounded-full border border-violet-300 bg-white px-1.5 py-px text-[9px] uppercase tracking-wide text-violet-700">
                              ELITE
                            </span>
                          )}
                        </button>
                        {aiTeamError && (
                          <span className="text-xs text-rose-700">{aiTeamError}</span>
                        )}
                      </div>

                      {/* AI analysis result (2 paragraphs from Claude) */}
                      {aiTeamAnalysis && (
                        <div className="mt-3 rounded-md border border-violet-200 bg-violet-50/50 p-3">
                          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-violet-700">
                            <span>✨ {lang === "IS" ? "AI dýpri túlkun" : "AI deeper analysis"}</span>
                            <span className="opacity-70">{new Date(aiTeamAnalysis.generated_at).toLocaleTimeString()}</span>
                          </div>
                          {aiTeamAnalysis.paragraph_1 && (
                            <p className="text-sm text-slate-800 leading-relaxed">{aiTeamAnalysis.paragraph_1}</p>
                          )}
                          {aiTeamAnalysis.paragraph_2 && (
                            <p className="mt-2 text-sm text-slate-800 leading-relaxed">{aiTeamAnalysis.paragraph_2}</p>
                          )}
                        </div>
                      )}

                      {/* Weekly story — Friday-afternoon AI synthesis of the
                          last 7 days. Grouped with "Press for deeper analysis"
                          (which covers today) because both are ELITE AI
                          narrative outputs and belong in the same
                          AI-explanation area of Today Command Center.
                          Daily AI = "what does today's data say"; Weekly
                          story = "what was the story of the week". */}
                      <div className="mt-3">
                        <WeeklyStoryCard lang={lang} />
                      </div>

                      {/* Day-state context row.
                          Default: shows internal state code + reason (useful
                          for the engine-aware coach when verdicts feel off).
                          On OFF days the raw state code is jargon — show a
                          plain-language confirmation instead. */}
                      <div className="mt-3 border-t border-slate-200/70 pt-2 text-xs text-slate-600">
                        {isOffDay ? (
                          <>
                            {lang === "IS"
                              ? "Frídagur staðfestur úr week-plan. Engin æfing skráð fyrir liðið í dag."
                              : "Confirmed rest day from the week plan. No team session scheduled today."}
                          </>
                        ) : (
                          <>
                            <span className="opacity-70">{lang === "IS" ? "Bakgrunnur" : "Diagnostic"}: </span>
                            <span className="font-medium text-slate-700">{dayStateInfo.state}</span> · {dayStateInfo.reason}
                          </>
                        )}
                      </div>
                      {externalLoadLine ? <div className="mt-1 text-xs text-slate-600"><span className="opacity-70">{lang === "IS" ? "Ytra álag" : "External load"}: </span><span className="font-medium text-slate-700">{externalLoadLine}</span></div> : null}
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Decision Summary — per-player today */}
          {rows.length > 0 && (
            <DecisionSummaryCard rows={rows.map((r) => {
              // Match-minutes lookup (powers MD+1 hard-recovery guardrail)
              const matchMin = playerMatchMinutes[r.player_id] ?? null;
              const matchMinutesEnrichment = {
                _yesterday_match_minutes: matchMin?.minutes_played ?? null,
                _yesterday_match_date: matchMin?.match_date ?? null,
                // Team's planned day type for today (TRAIN/RECOVERY/GAME/OFF).
                // Drives the OFF_DAY verdict override in the modal.
                _team_day_type: teamDayType,
                // Bishop 2020 high-tier L/R CoD asymmetry % over 14d.
                // Only set when ≥ 15% (concern + high zones); informational
                // chip only — does NOT modify the verdict.
                _cod_high_asym_pct: playerCodHighAsym[r.player_id] ?? null,
                // Sprint Speed Drop today vs personal top-3 mean (28d).
                // Edouard 2019 / Malone 2018 — > 10% drop = elevated hamstring
                // injury risk. Only set when drop ≥ 3% AND HSR-meaningful
                // session today AND ≥ 4 reference sessions exist. Informational
                // chip only — does NOT modify the verdict (deferred until 2-3
                // coaches confirm rule fit).
                _sprint_drop_pct: playerSprintDrop[r.player_id]?.dropPct ?? null,
                _sprint_today_kmh: playerSprintDrop[r.player_id]?.todayKmh ?? null,
                _sprint_ref_kmh: playerSprintDrop[r.player_id]?.refKmh ?? null,
                // Sprint Exposure (Malone 2018 — volume-side hamstring risk).
                // Bands 5-8 weekly stride sum vs match-day demand baseline.
                // Surfaced as chip in DecisionSummaryCard + counts toward
                // "Needs attention" filter for UNDERLOAD / OVERLOAD bands.
                _sprint_exposure_band: playerSprintExposure[r.player_id]?.band ?? null,
                _sprint_exposure_ratio: playerSprintExposure[r.player_id]?.ratio ?? null,
                _sprint_exposure_match_days: playerSprintExposure[r.player_id]?.matchDaysObserved ?? null,
                _sprint_exposure_match_days_measured: playerSprintExposure[r.player_id]?.matchDaysMeasured ?? null,
                _sprint_exposure_match_days_estimated: playerSprintExposure[r.player_id]?.matchDaysEstimated ?? null,
                _sprint_exposure_match_days_scheduled: playerSprintExposure[r.player_id]?.matchDaysScheduled ?? null,
              };

              // Enrich with most recent GPS load from catapult history
              // Try entry date first (today), then yesterday
              const ed = r.entry_date ?? today;
              const yd = new Date(ed);
              yd.setDate(yd.getDate() - 1);
              const yesterdayStr = yd.toISOString().slice(0, 10);
              const history = ((r as any)._catapult_history ?? []) as Array<{ date: string; [k: string]: unknown }>;
              const yRow = history.find((h) => h.date === ed)
                ?? history.find((h) => h.date === yesterdayStr)
                ?? null;
              const mliData = playerMli[r.player_id];
              const metaData = playerMetabolic[r.player_id];

              // Align Load-signals block with the GPS load shown above:
              //
              // The "Yesterday's GPS load" block uses `yRow` — today's row if
              // present, otherwise yesterday's. The Load-signals block should
              // reflect the SAME date. We therefore recompute Catapult signals
              // + composite for that specific date when it differs from today,
              // so coaches see burden/composite that matches the raw numbers.
              const signalDate = yRow?.date ?? null;
              const todayCatapultSignals = (r as any)._catapult_signals as
                | CatapultExternalLoadSignals | null | undefined;
              const todayCompEntry = playerComposites[String(r.player_id)];

              type ResolvedSignals = {
                nbs: number | null;
                compositeScore: number | null;
                concernLevel: "none" | "low" | "moderate" | "high" | null;
                fatigueType: string | null;
                playerLoadSpike: number | null;
                // Deceleration-specific metrics
                decelBurden: number | null;
                decelBurdenBand: string | null;
                accelDecelRatio: number | null;
                loadProfile: string | null;
                hidPercentage: number | null;
                // HID% trend
                hidDeclinePct: number | null;
                hidFatigueFlag: boolean;
              };

              // Compute HID% trend from catapult history
              const catapultHistoryRows = (((r as any)._catapult_history ?? []) as CatapultDailyLoadRow[]);

              let resolved: ResolvedSignals;
              if (signalDate && signalDate === ed) {
                // Signals already computed for today — trust the memo.
                const recentHidRows = catapultHistoryRows.filter((row) => row.date < ed).slice(-7);
                const todayGpsRow = catapultHistoryRows.find((row) => row.date === ed) ?? null;
                const hidTrend = computeHidTrend(recentHidRows, todayGpsRow);
                resolved = {
                  nbs: typeof todayCatapultSignals?.neuromuscularBurdenScore === "number"
                    ? todayCatapultSignals.neuromuscularBurdenScore
                    : null,
                  compositeScore: todayCompEntry?.compositeScore ?? null,
                  concernLevel: todayCompEntry?.concernLevel ?? null,
                  fatigueType: todayCompEntry?.fatigueType ?? null,
                  playerLoadSpike: todayCompEntry?.playerLoadSpike ?? null,
                  decelBurden: typeof todayCatapultSignals?.decelBurdenScore === "number" ? todayCatapultSignals.decelBurdenScore : null,
                  decelBurdenBand: todayCatapultSignals?.decelBurdenBand ?? null,
                  accelDecelRatio: typeof todayCatapultSignals?.accelDecelRatio === "number" ? todayCatapultSignals.accelDecelRatio : null,
                  loadProfile: todayCatapultSignals?.loadProfile ?? null,
                  hidPercentage: typeof todayCatapultSignals?.hidPercentage === "number" ? todayCatapultSignals.hidPercentage : null,
                  hidDeclinePct: hidTrend.hidDeclinePct,
                  hidFatigueFlag: hidTrend.hidFatigueFlag,
                };
              } else if (signalDate) {
                // Recompute for the date of the shown GPS load (usually yesterday).
                const ctx = buildCatapultReadinessContextFromRows({
                  rows: catapultHistoryRows,
                  date: signalDate,
                });
                const sig = ctx.signals;
                const loadState = (["normal", "elevated", "high"].includes(String(sig?.externalLoadState ?? ""))
                  ? (sig?.externalLoadState as "normal" | "elevated" | "high")
                  : "unknown");
                // HID% trend for the signal date
                const recentHidRows = catapultHistoryRows.filter((row) => row.date < signalDate).slice(-7);
                const hidTrend = computeHidTrend(recentHidRows, ctx.today);
                const comp = computeCompositeLoadConcern({
                  rpeAcwr: null,
                  neuromuscularBurdenScore: sig?.neuromuscularBurdenScore ?? null,
                  externalLoadState: loadState,
                  decelBurdenScore: sig?.decelBurdenScore ?? null,
                  accelDecelRatio: sig?.accelDecelRatio ?? null,
                  hidFatigueFlag: hidTrend.hidFatigueFlag,
                  hidDeclinePct: hidTrend.hidDeclinePct,
                });
                resolved = {
                  nbs: typeof sig?.neuromuscularBurdenScore === "number"
                    ? sig.neuromuscularBurdenScore
                    : null,
                  compositeScore: comp.compositeScore,
                  concernLevel: comp.concernLevel,
                  fatigueType: comp.fatigueType ?? null,
                  playerLoadSpike: typeof sig?.playerLoadSpike === "number"
                    ? sig.playerLoadSpike
                    : null,
                  decelBurden: typeof sig?.decelBurdenScore === "number" ? sig.decelBurdenScore : null,
                  decelBurdenBand: sig?.decelBurdenBand ?? null,
                  accelDecelRatio: typeof sig?.accelDecelRatio === "number" ? sig.accelDecelRatio : null,
                  loadProfile: sig?.loadProfile ?? null,
                  hidPercentage: typeof sig?.hidPercentage === "number" ? sig.hidPercentage : null,
                  hidDeclinePct: hidTrend.hidDeclinePct,
                  hidFatigueFlag: hidTrend.hidFatigueFlag,
                };
              } else {
                // No GPS at all — leave everything null so chips hide.
                resolved = {
                  nbs: null,
                  compositeScore: null,
                  concernLevel: null,
                  fatigueType: null,
                  playerLoadSpike: null,
                  decelBurden: null,
                  decelBurdenBand: null,
                  accelDecelRatio: null,
                  loadProfile: null,
                  hidPercentage: null,
                  hidDeclinePct: null,
                  hidFatigueFlag: false,
                };
              }

              // ── Stage B: Indoor escalation rule ──────────────────────────
              // When indoor signal is concerning (spike score OR red McBurnie) AND
              // the latest indoor session is recent (today or yesterday), bump the
              // concern level up by one band. This feeds directly into Decision Engine
              // so coaches don't underestimate indoor-only sessions where outdoor metrics
              // (sprint efforts, vb6 distance) would naturally be near-zero.
              const indoor = playerIndoorStatus[r.player_id];
              let escalatedConcern = resolved.concernLevel;
              const indoorIsRecent = (() => {
                if (!indoor?.latestDate) return false;
                const latestTime = new Date(indoor.latestDate).getTime();
                const todayTime = new Date(ed).getTime();
                const dayDiff = Math.round((todayTime - latestTime) / (1000 * 60 * 60 * 24));
                return dayDiff >= 0 && dayDiff <= 1;
              })();
              const indoorIsConcerning =
                indoor?.compositeBand === "spike" ||
                indoor?.mcburnieFlag === "red" ||
                indoor?.acwrFlag === "red";
              if (indoorIsRecent && indoorIsConcerning && escalatedConcern !== "high") {
                const bumpMap: Record<string, "none" | "low" | "moderate" | "high"> = {
                  none: "low",
                  low: "moderate",
                  moderate: "high",
                };
                escalatedConcern = bumpMap[escalatedConcern ?? "none"] ?? escalatedConcern;
              }

              return {
                ...r,
                ...matchMinutesEnrichment,
                _yesterday_load: yRow ? {
                  totalDistance: yRow.totalDistance ?? null,
                  playerLoad: yRow.playerLoad ?? null,
                  velocityBand5TotalDistance: yRow.velocityBand5TotalDistance ?? null,
                  velocityBand6TotalDistance: yRow.velocityBand6TotalDistance ?? null,
                  accelBand2to3Efforts: yRow.accelBand2to3Efforts ?? null,
                  decelBand2to3Efforts: yRow.decelBand2to3Efforts ?? null,
                } : null,
                _yesterday_mli: mliData?.mli ?? null,
                _yesterday_mli_band: mliData?.band ?? null,
                _yesterday_metabolic_score: metaData?.score ?? null,
                _yesterday_metabolic_band: metaData?.band ?? null,
                _vbt_fatigue_flags: playerVbtFatigue[r.player_id] ?? null,
                _today_nbs: resolved.nbs,
                _today_composite_score: resolved.compositeScore,
                _today_composite_concern: escalatedConcern,
                _today_fatigue_type: resolved.fatigueType,
                _today_player_load_spike: resolved.playerLoadSpike,
                _load_signals_date: signalDate,
                // Deceleration-specific metrics
                _today_decel_burden: resolved.decelBurden,
                _today_decel_burden_band: resolved.decelBurdenBand,
                _today_accel_decel_ratio: resolved.accelDecelRatio,
                _today_load_profile: resolved.loadProfile,
                _today_hid_percentage: resolved.hidPercentage,
                // HID% trend
                _today_hid_decline_pct: resolved.hidDeclinePct,
                _today_hid_fatigue_flag: resolved.hidFatigueFlag,
                // Indoor Load Intelligence (höll-mode FMP-driven signal)
                _indoor_latest_date: playerIndoorStatus[r.player_id]?.latestDate ?? null,
                _indoor_composite_score: playerIndoorStatus[r.player_id]?.compositeScore ?? null,
                _indoor_composite_band: playerIndoorStatus[r.player_id]?.compositeBand ?? null,
                _indoor_mcburnie_ratio: playerIndoorStatus[r.player_id]?.mcburnieRatio ?? null,
                _indoor_mcburnie_flag: playerIndoorStatus[r.player_id]?.mcburnieFlag ?? null,
                _indoor_sessions_7d: playerIndoorStatus[r.player_id]?.sessions7d ?? null,
                _indoor_acwr_value: playerIndoorStatus[r.player_id]?.acwrValue ?? null,
                _indoor_acwr_flag: playerIndoorStatus[r.player_id]?.acwrFlag ?? null,
                // Active injury status — OVERRIDES load verdict in Decision Summary
                _injury_status: playerInjuryStatus[r.player_id]?.status ?? null,
                _injury_rtp_stage: playerInjuryStatus[r.player_id]?.rtpStage ?? null,
                _injury_body_part: playerInjuryStatus[r.player_id]?.bodyPart ?? null,
                _injury_type: playerInjuryStatus[r.player_id]?.injuryType ?? null,
                _injury_estimated_return: playerInjuryStatus[r.player_id]?.estimatedReturn ?? null,
                _injury_severity: playerInjuryStatus[r.player_id]?.severity ?? null,
              };
            }) as any} trainingMode={trainingMode} />
          )}

          {/* Indoor Briefing — team-level executive summary.
              Shown ONLY when the effective mode is indoor, i.e. the squad's
              recent sessions have no GPS (see effectiveTrainingMode). Previously
              this keyed off indoor-data *presence*, which lit up for outdoor
              squads because the Catapult unit records FMP/IMA inertial data
              outdoors too — confusingly showing "heavy indoor load" for what
              were really GPS sessions. Now: no GPS → indoor → show; GPS present
              → outdoor → hide. A manual outdoor/indoor override still wins. */}
          {rows.length > 0 &&
            effectiveTrainingMode === "indoor" &&
            (Object.keys(playerIndoorStatus).length > 0 || Object.keys(playerInjuryStatus).length > 0) && (
              <TeamIndoorBriefing
                players={rows.map((r) => {
                  const indoor = playerIndoorStatus[r.player_id];
                  const injury = playerInjuryStatus[r.player_id];
                  return {
                    player_id: r.player_id,
                    full_name: r.full_name ?? "—",
                    composite_score: indoor?.compositeScore ?? null,
                    composite_band: indoor?.compositeBand ?? null,
                    acwr_value: indoor?.acwrValue ?? null,
                    acwr_flag: indoor?.acwrFlag ?? null,
                    mcburnie_flag: indoor?.mcburnieFlag ?? null,
                    sessions_7d: indoor?.sessions7d ?? 0,
                    injury_status: injury?.status ?? null,
                    injury_body_part: injury?.bodyPart ?? null,
                    injury_rtp_stage: injury?.rtpStage ?? null,
                    injury_estimated_return: injury?.estimatedReturn ?? null,
                  };
                })}
              />
            )}
          {/* Planned session load — Week-setup MD context turned into a
              coach-facing load target (type / band / sRPE / % of match).
              On OFF days and match days the muted version was duplicating
              the green TODAY card's "rest day" / "match day" message, so
              we suppress it here — the OFF-day microcycle paragraph now
              lives as the first bullet inside the green TODAY card.
              On a manual / no-MD week we still show it ("set up the match
              week") because that prompt is genuinely unique info. */}
          {(() => {
            const todayPlannedDayType =
              (rows[0] as { planned_day_type?: string | null } | undefined)?.planned_day_type ?? null;
            const dt = String(todayPlannedDayType ?? "").trim().toUpperCase();
            if (dt === "OFF" || dt === "GAME") return null;
            return (
              <PlannedSessionLoadCard
                lang={lang}
                mdDay={mdDayToday}
                dayType={todayPlannedDayType}
                focus={(rows[0] as { planned_focus?: string | null } | undefined)?.planned_focus ?? null}
                daysSincePrev={daysSincePrevToday}
                daysToNext={daysToNextToday}
                redCount={(rows as Array<{ final_color?: string | null }>).filter((r) => r.final_color === "red").length}
                yellowCount={(rows as Array<{ final_color?: string | null }>).filter((r) => r.final_color === "yellow").length}
                totalPlayers={rows.length}
              />
            );
          })()}
          {/* Verdict-accuracy / calibration widget moved to the Reporting
              Center — coaches doing their morning briefing don't want
              system-health metrics in the way. See the System health
              section at the bottom of /coach/reporting-center. */}

          {/* Weekly Narrative — strategic 7-day overview between Today
              Command Center and the per-day briefings. Reads training-load
              data + verdict history across the squad and emits a one-line
              story + 2–3 supporting facts + forward-looking recommendation.
              Self-hides when there's not enough data yet (fresh teams). */}
          <WeeklyNarrativeCard teamId={coachTeamId} />

          {/* Readiness × Load quadrant intentionally removed from the Today
              surface. It's a scatter plot with S&C-only axes ("0.5 = normal ·
              1.0 = very high", baseline lines, dashed-dot fallbacks) — the least
              5-second-readable block on Today, and it duplicates the dedicated
              "Quadrant Intelligence" sidebar page. The plain-language Daily
              Briefing + attention list already carry the head-coach verdict;
              the scatter view lives on its own page for S&C drill-down. */}

        </div>
      )}

      {/* ══════════════════════════════════════════
          SQUAD TAB
      ══════════════════════════════════════════ */}
      {dashTab === "squad" && !isAtLeastPro && (
        <UpgradeWall
          requiredPlan="PRO"
          featureName="Squad overview"
          description="See all players, filter by readiness flag, and review the full squad table."
        />
      )}

      {dashTab === "squad" && isAtLeastPro && (
        <div className="space-y-6">

          {/* Squad actions — add player + broadcast */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AddPlayerButton
              teamId={coachTeamId}
              lang={lang as "IS" | "EN"}
              onPlayerAdded={() => {
                // Trigger a reload so the new player appears in the roster immediately.
                if (typeof window !== "undefined") window.location.reload();
              }}
            />
            <button
              onClick={() => setBroadcastOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              Hópskilaboð
            </button>
          </div>
          {coachTeamId && <BroadcastModal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} teamId={coachTeamId} />}

          {/* Squad status banner (compact). Replaced the previous giant
              8-tile KPI grid + duplicate sections (May 2026) that took up
              ~400px of vertical space showing zeros most of the time.
              Now: 1-line green summary when nothing flagged, compact
              chip-list when any flag exists — only non-zero items shown. */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-4">
            {(() => {
              // Aggregate every flag the coach might care about
              const flags: Array<{ label: string; count: number; tone: "red" | "amber" | "slate" }> = [
                { label: "Low readiness",       count: flaggedReviewStats.lowReadiness,    tone: "red" },
                { label: "Pain flag",           count: flaggedReviewStats.painFlag,        tone: "red" },
                { label: "High neural load",    count: flaggedReviewStats.highNeuralLoad,  tone: "amber" },
                { label: "Neural bias applied", count: reviewContextStats.neuralBiasApplied,  tone: "amber" },
                { label: "High next-day risk",  count: reviewContextStats.highNextDayRisk, tone: "amber" },
                { label: "Manual review",       count: flaggedReviewStats.manualReview,    tone: "slate" },
                { label: "Locked cards",        count: reviewContextStats.lockedRows,      tone: "slate" },
              ];
              const activeFlags = flags.filter(f => f.count > 0);
              const allClear = activeFlags.length === 0;
              const toneClasses: Record<typeof flags[0]["tone"], string> = {
                red: "bg-rose-50 text-rose-800 border-rose-200",
                amber: "bg-amber-50 text-amber-900 border-amber-200",
                slate: "bg-slate-50 text-slate-700 border-slate-200",
              };
              if (allClear) {
                return (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">✓</span>
                      <div>
                        <div className="text-sm font-semibold text-emerald-900">All players ready today</div>
                        <div className="text-xs text-emerald-700">
                          {counts.green} green · {counts.yellow} yellow · {counts.red} red — no flags require attention
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Today's flags ({activeFlags.reduce((s, f) => s + f.count, 0)})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeFlags.map(f => (
                      <span key={f.label} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${toneClasses[f.tone]}`}>
                        {f.label}
                        <span className="rounded-sm bg-white/60 px-1.5 text-[11px] font-bold tabular-nums">{f.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <div className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">Filters</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
                      All
                    </Button>
                    <Button variant={filter === "red" ? "default" : "outline"} onClick={() => setFilter("red")}>
                      Red ({counts.red})
                    </Button>
                    <Button variant={filter === "yellow" ? "default" : "outline"} onClick={() => setFilter("yellow")}>
                      Yellow ({counts.yellow})
                    </Button>
                    <Button variant={filter === "green" ? "default" : "outline"} onClick={() => setFilter("green")}>
                      Green ({counts.green})
                    </Button>
                  </div>
                </div>
                <div className="lg:col-span-5">
                  <div className="mb-2 text-[10px] uppercase tracking-wide text-gray-500">Actions</div>
                  <div className="flex flex-wrap gap-2 items-center justify-start lg:justify-end">
                    <Input placeholder="Leita að leikmanni…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px]" />
                    <Button variant="outline" onClick={() => loadToday()} disabled={loading || genLoading}>
                      {loading ? "Hleð..." : "Refresh"}
                    </Button>
                    <Button
                      onClick={generateTodayDecisionsForTeam}
                      disabled={genLoading || loading || saveAllLoading}
                      title={
                        lang === "EN"
                          ? "Re-runs the decision engine for every player. Overwrites any pending manual changes — save drafts first."
                          : "Endurkeyrir ákvörðunarvélina fyrir alla leikmenn. Yfirskrifar ósvistaðar handvirkar breytingar — vistaðu drög fyrst."
                      }
                    >
                      {genLoading ? ct.actions.generating : ct.actions.generateDecisions}
                    </Button>
                    {(() => {
                      const dirtyCount = rows.filter((r) => {
                        if (r.is_locked && !isAdmin) return false;
                        const pid = String(r.player_id);
                        const draft = draftAction[pid];
                        const current = (r.training_action ?? "FULL") as TrainingAction;
                        return draft != null && draft !== current;
                      }).length;
                      if (dirtyCount === 0) return null;
                      return (
                        <Button
                          onClick={saveAllDirty}
                          disabled={saveAllLoading || loading}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {saveAllLoading
                            ? (lang === "EN" ? "Saving…" : "Vistandi…")
                            : (lang === "EN" ? `Save all changes (${dirtyCount})` : `Vista allar breytingar (${dirtyCount})`)}
                        </Button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {genToast ? <div className="text-sm text-green-700">{genToast}</div> : null}
          {saveAllToast ? <div className="text-sm text-green-700">{saveAllToast}</div> : null}

          {rows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{queueEmptyMessage}</div>
          ) : (
            <div className="mt-3 rounded-xl border border-slate-200 bg-gray-50/40 p-3 md:p-4 space-y-4">{rowsWithSessionDraft.map((r) => renderRow(r))}</div>
          )}

          {/* Paging */}
          <div className="flex items-center justify-between pt-2 text-sm text-gray-600">
            <div>
              Page {page + 1} / {totalPages} · total {total}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Prev
              </Button>
              <Button variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>

          {/* Team Risk Map */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className={sectionTitleClass}>Team Risk Map</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Low Risk</div>
                  <div className="mt-1 space-y-0.5 text-emerald-900">
                    {teamRiskMap.lowRisk.slice(0, 8).map((p) => (
                      <div key={`low-${p.playerId ?? p.playerName}`}>{p.playerName ?? "Player"} – {titleCaseToken(p.recommendedAction)}</div>
                    ))}
                    {!teamRiskMap.lowRisk.length ? <div className="text-emerald-700/70">No players</div> : null}
                  </div>
                </div>
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700">Moderate Risk</div>
                  <div className="mt-1 space-y-0.5 text-yellow-900">
                    {teamRiskMap.moderateRisk.slice(0, 8).map((p) => (
                      <div key={`mod-${p.playerId ?? p.playerName}`}>{p.playerName ?? "Player"} – {titleCaseToken(p.recommendedAction)}</div>
                    ))}
                    {!teamRiskMap.moderateRisk.length ? <div className="text-yellow-700/70">No players</div> : null}
                  </div>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-700">High Risk</div>
                  <div className="mt-1 space-y-0.5 text-orange-900">
                    {teamRiskMap.highRisk.slice(0, 8).map((p) => (
                      <div key={`high-${p.playerId ?? p.playerName}`}>{p.playerName ?? "Player"} – {titleCaseToken(p.recommendedAction)}</div>
                    ))}
                    {!teamRiskMap.highRisk.length ? <div className="text-orange-700/70">No players</div> : null}
                  </div>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Critical</div>
                  <div className="mt-1 space-y-0.5 text-red-900">
                    {teamRiskMap.criticalRisk.slice(0, 8).map((p) => (
                      <div key={`crit-${p.playerId ?? p.playerName}`}>{p.playerName ?? "Player"} – {titleCaseToken(p.recommendedAction)}</div>
                    ))}
                    {!teamRiskMap.criticalRisk.length ? <div className="text-red-700/70">No players</div> : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Override history — coach's reflective audit trail.
              Sits in Squad tab under Team Risk Map (was Today tab); this
              is a weekly-cadence review tool, not a morning-brief tool.
              Silent when there are zero overrides in the last 30 days.
              Aligns with Explainability-First principle #6: overrides are
              an audited dialogue, not a black hole. */}
          <OverrideHistoryCard lang={lang} />

          {/* Weekly Performance Intelligence */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className={sectionTitleClass}>Weekly Performance Intelligence</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-slate-700">
                <div>
                  Team average risk: <span className="font-semibold tabular-nums">{weeklyRiskReport.avgRiskScore.toFixed(1)}</span>
                </div>
                <div>{weeklyRiskReport.teamTrend}</div>
                <div>{weeklyRiskReport.recommendation}</div>
                <div>
                  Highest risk:{" "}
                  {weeklyRiskReport.highestRiskPlayers.slice(0, 3).map((p) => p.playerName ?? "Player").join(", ") || "—"}
                </div>
                <div>
                  Improving: {weeklyRiskReport.mostImprovedPlayers.slice(0, 3).map((p) => p.playerName ?? "Player").join(", ") || "—"}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sticky bottom save bar — appears whenever the coach has unsaved draft action changes.
              Sits above content with a fixed position so the coach never has to scroll back to the
              top filter bar to commit changes. */}
          {(() => {
            const dirtyCount = rows.filter((r) => {
              if (r.is_locked && !isAdmin) return false;
              const pid = String(r.player_id);
              const draft = draftAction[pid];
              const current = (r.training_action ?? "FULL") as TrainingAction;
              return draft != null && draft !== current;
            }).length;
            if (dirtyCount === 0) return null;
            return (
              <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform">
                <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-white px-4 py-3 shadow-xl ring-1 ring-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="relative inline-flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                    </span>
                    <span className="text-sm font-semibold text-slate-800">
                      {lang === "EN"
                        ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`
                        : `${dirtyCount} óvistuð breyting${dirtyCount === 1 ? "" : "ar"}`}
                    </span>
                  </div>
                  <Button
                    onClick={() => {
                      // Discard all dirty drafts: reset draftAction back to saved value per row
                      setDraftAction(() => {
                        const next: Record<string, TrainingAction> = {};
                        for (const r of rows) {
                          const pid = String(r.player_id);
                          next[pid] = (r.training_action ?? "FULL") as TrainingAction;
                        }
                        return next;
                      });
                    }}
                    variant="outline"
                    disabled={saveAllLoading || loading}
                  >
                    {lang === "EN" ? "Discard" : "Henda"}
                  </Button>
                  <Button
                    onClick={saveAllDirty}
                    disabled={saveAllLoading || loading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {saveAllLoading
                      ? (lang === "EN" ? "Saving…" : "Vistandi…")
                      : (lang === "EN" ? `Save all (${dirtyCount})` : `Vista allt (${dirtyCount})`)}
                  </Button>
                </div>
              </div>
            );
          })()}

        </div>
      )}

      {/* Intelligence tab removed — unique metrics merged into today tab. See git history for original. */}


      {/* ══════════════════════════════════════════
          LOAD & RPE TAB
      ══════════════════════════════════════════ */}
      {dashTab === "load" && !isAtLeastPro && (
        <UpgradeWall
          requiredPlan="PRO"
          featureName="Load & RPE monitoring"
          description="Session RPE compliance, daily internal load, yesterday GPS load from Catapult, and load metrics."
        />
      )}

      {dashTab === "load" && isAtLeastPro && (
        <div className="space-y-8">

          {/* Weekly Load moved to GPS tab */}

          {/* ── Player lookup (historical snapshot) ─────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Leikmannafyrirspurn</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            <PlayerHistoricalSnapshotCard teamId={coachTeamId} />
          </section>

          {/* ── Session RPE ───────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Session RPE</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <SessionRpeMonitoringCard teamId={coachTeamId} />
              <DailyInternalLoadCard teamId={coachTeamId} />
            </div>
          </section>

          {/* ── ACWR Risk Overview ────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Risk Overview</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
            <InternalAcwrCard teamId={coachTeamId} />
          </section>

          {/* ── 7/28d Load Metrics ───────────────────────────── */}
          {/* ── External Load (GPS) ───────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">External Load · GPS</span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>

          {/* Yesterday Load — auto from Catapult GPS */}
          <Card className="shadow-sm border border-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Yesterday Load
                <span className="text-xs font-normal text-slate-400 ml-1">· Catapult team avg</span>
                {ctxIntensity && (
                  <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    ctxIntensity === "HIGH" ? "bg-red-100 text-red-700" :
                    ctxIntensity === "MEDIUM" ? "bg-amber-100 text-amber-700" :
                    ctxIntensity === "LOW" ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-500"
                  }`}>{ctxIntensity}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!ctxYesterdayLoaded ? (
                <div className="text-sm text-slate-400">Loading GPS data…</div>
              ) : !ctxDist && !ctxHsr && !ctxVelB5 ? (
                <div className="text-sm text-slate-400">No Catapult data found for yesterday.</div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3 text-sm">
                  {[
                    { label: "Total Dist", value: ctxDist ? `${ctxDist} m` : "—" },
                    { label: "Vel Band 5", value: ctxVelB5 ? `${ctxVelB5} m` : "—" },
                    { label: "Vel Band 6", value: ctxVelB6 ? `${ctxVelB6} m` : "—" },
                    { label: "HIR Dist", value: ctxHsr ? `${ctxHsr} m` : "—" },
                    { label: "Accel B2-3", value: ctxAccB23 || "—" },
                    { label: "Tot Accels", value: ctxAcc || "—" },
                    { label: "Decel B2-3", value: ctxDecB23 || "—" },
                    { label: "Tot Decels", value: ctxDec || "—" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-[11px] text-slate-400 uppercase tracking-wide">{item.label}</div>
                      <div className="mt-0.5 font-semibold text-slate-800">{item.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </section>

          {/* ── Dev diagnostics (collapsible) ─────────────────── */}
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-2 list-none select-none">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-300 group-open:text-slate-400">Dev diagnostics</span>
              <div className="flex-1 h-px bg-slate-100" />
              <svg className="w-3.5 h-3.5 text-slate-300 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </summary>
            <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 shadow-sm space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div className="text-sm font-semibold text-gray-700">Neural Load QA (dev)</div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Validation suite</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border bg-gray-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">Cases</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{neuralValidation.total}</div>
                </div>
                <div className="rounded-lg border bg-green-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-green-700">Pass</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-green-700">{neuralValidation.passed}</div>
                </div>
                <div className="rounded-lg border bg-red-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-red-700">Fail</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-red-700">{neuralValidation.failed}</div>
                </div>
              </div>
              <div className="space-y-2">
                {neuralValidation.cases.map((c) => (
                  <div key={c.id} className="rounded-md border p-2 text-xs">
                    <div className="font-semibold">
                      Case {c.id}: {c.title} · {c.pass ? "PASS" : "FAIL"}
                    </div>
                    <div className="mt-1">
                      {c.output.neuralLoadState} · {c.output.readinessTrajectory} · {c.output.nextDayRisk} · score {c.output.neuralLoadScore}
                    </div>
                    <div className="mt-1 text-gray-600">{c.output.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          </details>

        </div>
      )}

      {/* ══════════════════════════════════════════
          GPS DATA TAB
      ══════════════════════════════════════════ */}
      {dashTab === "gps" && !isAtLeastPro && (
        <UpgradeWall
          requiredPlan="PRO"
          featureName="GPS Data"
          description="Total distance, velocity bands, accelerations, decelerations, Player Load, IMA metrics, and 7D/28D/ACWR load monitoring for every player."
        />
      )}

      {dashTab === "gps" && isAtLeastPro && (() => {
        const isBasketball = teamSport === "basketball";

        const GPS_METRICS: Array<{
          key: string;
          label: string;
          shortLabel: string;
          aliases: string[];
          digits: number;
        }> = isBasketball ? [
          { key: "totalPlayerLoad",     label: "Player Load",          shortLabel: "Player Load", aliases: ["totalPlayerLoad", "total_player_load"],                          digits: 1 },
          { key: "playerLoadPerMinute", label: "Player Load / min",    shortLabel: "PL/min",      aliases: ["playerLoadPerMinute", "player_load_per_minute"],                 digits: 2 },
          { key: "imaCod",              label: "Changes of Direction", shortLabel: "IMA COD",     aliases: ["imaCod", "ima_cod", "cod_events"],                               digits: 0 },
          { key: "imaAccel",            label: "IMA Accelerations",    shortLabel: "IMA Accels",  aliases: ["imaAccel", "ima_accel"],                                         digits: 0 },
          { key: "imaDecel",            label: "IMA Decelerations",    shortLabel: "IMA Decels",  aliases: ["imaDecel", "ima_decel"],                                         digits: 0 },
          { key: "totalDistance",       label: "Total Distance (m)",   shortLabel: "Total Dist",  aliases: ["totalDistance", "total_distance"],                               digits: 0 },
          { key: "maxVel",              label: "Max Velocity (km/h)",  shortLabel: "Max Vel",     aliases: ["maxVel", "max_vel", "max_velocity"],                             digits: 1 },
        ] : [
          { key: "totalDistance",              label: "Total Distance (m)",            shortLabel: "Total Dist",  aliases: ["totalDistance", "total_distance"],                                                                    digits: 0 },
          { key: "velocityBand5TotalDistance", label: "Vel Band 5 Dist (m)",           shortLabel: "Vel B5 Dist", aliases: ["velocityBand5TotalDistance", "velocity_band5_total_distance"],                                         digits: 0 },
          { key: "velocityBand6TotalDistance", label: "Vel Band 6 Dist (m)",           shortLabel: "Vel B6 Dist", aliases: ["velocityBand6TotalDistance", "velocity_band6_total_distance"],                                         digits: 0 },
          { key: "accelBand2to3Efforts",       label: "Accel B2-3 Efforts (Gen 2)",    shortLabel: "Accel B2-3",  aliases: ["accelBand2to3Efforts", "accel_band2to3_efforts", "accel_b2_3_tot_effs_gen2", "accelB23TotEffsGen2"],  digits: 0 },
          { key: "totalAccelerations",         label: "Tot Accels (#)",                shortLabel: "Tot Accels",  aliases: ["totalAccelerations", "total_accelerations", "tot_as", "totAs"],                                       digits: 0 },
          { key: "decelBand2to3Efforts",       label: "Decel B2-3 Efforts (Gen 2)",    shortLabel: "Decel B2-3",  aliases: ["decelBand2to3Efforts", "decel_band2to3_efforts", "decel_b2_3_tot_effs_gen2", "decelB23TotEffsGen2"],  digits: 0 },
          { key: "totalDecelerations",         label: "Tot Decels (#)",                shortLabel: "Tot Decels",  aliases: ["totalDecelerations", "total_decelerations", "tot_ds", "totDs"],                                       digits: 0 },
        ];

        function getVal(row: Record<string, unknown>, aliases: string[]): number | null {
          for (const alias of aliases) {
            const v = row[alias];
            if (typeof v === "number" && Number.isFinite(v)) return v;
          }
          return null;
        }

        function avg(vals: number[]): number | null {
          if (!vals.length) return null;
          return vals.reduce((s, v) => s + v, 0) / vals.length;
        }

        function dateMinusDays(dateStr: string, days: number): string {
          const d = new Date(`${dateStr}T00:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() - days);
          return d.toISOString().slice(0, 10);
        }

        function computeSnapshot(history: Array<Record<string, unknown>>, aliases: string[], digits: number) {
          const refDate = gpsDate; // browsable reference date
          const acuteStart = dateMinusDays(refDate, 6);   // last 7 calendar days inclusive
          const chronicStart = dateMinusDays(refDate, 27); // last 28 calendar days inclusive

          const dated = history.filter((r) => typeof r.date === "string");

          const acuteVals = dated
            .filter((r) => String(r.date) >= acuteStart && String(r.date) <= refDate)
            .map((r) => getVal(r, aliases))
            .filter((v): v is number => v != null);

          const chronicVals = dated
            .filter((r) => String(r.date) >= chronicStart && String(r.date) <= refDate)
            .map((r) => getVal(r, aliases))
            .filter((v): v is number => v != null);

          const a7 = avg(acuteVals);
          const c28 = avg(chronicVals);
          const acwr = a7 != null && c28 != null && c28 > 0 ? a7 / c28 : null;
          const fmt = (n: number | null) => n == null ? "—" : n.toFixed(digits);
          return { a7: fmt(a7), c28: fmt(c28), acwr };
        }

        // acwrColor / acwrBg / gpsRows / noData / computeSnapshot used to
        // live here for the Squad Load 7d/28d/ACWR table — moved with the
        // table to /coach/quadrant via the SquadLoadTable component.

        // ── Today's session overview ──────────────────────────────────────
        const todayPlayerRows = gpsAllPlayers.map((p) => {
          const row = p.history.find((r) => String(r.date ?? "").slice(0, 10) === gpsDate);
          if (!row) return null;
          const vb5 = getVal(row, ["velocity_band5_total_distance", "velocityBand5TotalDistance"]) ?? 0;
          const vb6 = getVal(row, ["velocity_band6_total_distance", "velocityBand6TotalDistance"]) ?? 0;
          return {
            name: p.name,
            position: p.position,
            // Football fields
            totalDist:  getVal(row, ["total_distance", "totalDistance"]),
            hsDist:     vb5 + vb6,
            accelB23:   getVal(row, ["accel_b2_3_tot_effs_gen2", "accelBand2to3Efforts", "accelB23TotEffsGen2"]),
            decelB23:   getVal(row, ["decel_b2_3_tot_effs_gen2", "decelBand2to3Efforts", "decelB23TotEffsGen2"]),
            totAccels:  getVal(row, ["tot_as", "totalAccelerations", "totAs"]),
            totDecels:  getVal(row, ["tot_ds", "totalDecelerations", "totDs"]),
            // Basketball fields
            playerLoad:       getVal(row, ["total_player_load", "totalPlayerLoad"]),
            playerLoadPerMin: getVal(row, ["player_load_per_minute", "playerLoadPerMinute"]),
            imaCod:           getVal(row, ["ima_cod", "imaCod", "cod_events"]),
            imaAccel:         getVal(row, ["ima_accel", "imaAccel"]),
            imaDecel:         getVal(row, ["ima_decel", "imaDecel"]),
            maxVel:           getVal(row, ["max_vel", "maxVel", "max_velocity"]),
            avgHr:            getVal(row, ["avg_heart_rate", "avgHeartRate"]),
            maxHr:            getVal(row, ["max_heart_rate", "maxHeartRate"]),
          };
        }).filter(Boolean) as Array<{
          name: string; position: string;
          // football
          totalDist: number | null; hsDist: number;
          accelB23: number | null; decelB23: number | null;
          totAccels: number | null; totDecels: number | null;
          // basketball
          playerLoad: number | null; playerLoadPerMin: number | null;
          imaCod: number | null; imaAccel: number | null; imaDecel: number | null;
          maxVel: number | null;
          // heart rate (both sports)
          avgHr: number | null; maxHr: number | null;
        }>;

        function squadAvgToday(vals: (number | null)[]): number | null {
          const valid = vals.filter((v): v is number => v != null && Number.isFinite(v));
          return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
        }

        const tAvgDist       = squadAvgToday(todayPlayerRows.map((r) => r.totalDist));
        const tAvgHs         = squadAvgToday(todayPlayerRows.map((r) => r.hsDist));
        const tAvgAccB       = squadAvgToday(todayPlayerRows.map((r) => r.accelB23));
        const tAvgDecB       = squadAvgToday(todayPlayerRows.map((r) => r.decelB23));
        // Basketball KPI averages
        const tAvgPlayerLoad = squadAvgToday(todayPlayerRows.map((r) => r.playerLoad));
        const tAvgPlPerMin   = squadAvgToday(todayPlayerRows.map((r) => r.playerLoadPerMin));
        const tAvgImaCod     = squadAvgToday(todayPlayerRows.map((r) => r.imaCod));
        const tAvgImaAccel   = squadAvgToday(todayPlayerRows.map((r) => r.imaAccel));
        const todaySorted = [...todayPlayerRows].sort((a, b) =>
          isBasketball
            ? (b.playerLoad ?? 0) - (a.playerLoad ?? 0)
            : (b.totalDist ?? 0) - (a.totalDist ?? 0)
        );

        const fmtN = (v: number | null, d = 0) => v == null ? "—" : v.toFixed(d);

        const isViewingToday = gpsDate === today;
        const gpsDateLabel = (() => {
          const d = new Date(`${gpsDate}T00:00:00Z`);
          const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
          const weekdayIS = ["Sun", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau"][d.getUTCDay()];
          return `${lang === "IS" ? weekdayIS : weekday} ${gpsDate}`;
        })();

        return (
          <div className="space-y-4">

            {/* ── Date Navigator ────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  onClick={() => { setGpsDateManuallySet(true); setGpsDate(addDaysISO(gpsDate, -1)); }}
                  title={lang === "IS" ? "Dagur til baka" : "Previous day"}
                >
                  ←
                </button>
                <button
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  onClick={() => { setGpsDateManuallySet(true); setGpsDate(addDaysISO(gpsDate, 1)); }}
                  disabled={gpsDate >= today}
                  title={lang === "IS" ? "Dagur áfram" : "Next day"}
                  style={{ opacity: gpsDate >= today ? 0.4 : 1 }}
                >
                  →
                </button>
                <input
                  type="date"
                  value={gpsDate}
                  max={today}
                  onChange={(e) => { if (e.target.value) { setGpsDateManuallySet(true); setGpsDate(e.target.value); } }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:ring-2 focus:ring-slate-300 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-800">{gpsDateLabel}</span>
                {!isViewingToday && (
                  <button
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
                    onClick={() => { setGpsDateManuallySet(true); setGpsDate(today); }}
                  >
                    {lang === "IS" ? "Í dag" : "Today"}
                  </button>
                )}
              </div>
            </div>

            {/* "Showing latest data" hint — visible when system auto-shifted
                away from today because the team hasn't uploaded recently.
                Lets coach know the date isn't today and provides quick way
                to jump back. Hidden when looking at today (no shift) or when
                latest-data-date IS today (data is fresh). */}
            {gpsLatestDataDate && gpsLatestDataDate < today && gpsDate === gpsLatestDataDate && !gpsDateManuallySet && (
              <div className="-mt-2 mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <span className="flex-1">
                  {lang === "IS"
                    ? `Sýni nýjustu gögn: ${gpsLatestDataDate}. Engin uppfærsla síðan þá.`
                    : `Showing latest data: ${gpsLatestDataDate}. No upload since.`}
                </span>
                <button
                  type="button"
                  onClick={() => { setGpsDateManuallySet(true); setGpsDate(today); }}
                  className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                >
                  {lang === "IS" ? "Sjá í dag" : "Jump to today"}
                </button>
              </div>
            )}

            {/* ── Cumulative Weekly Load ────────────────────────── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{lang === "IS" ? "Vikuálag" : "Weekly Load"}</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>
              {coachTeamId && <CoachWeeklyLoadCard teamId={coachTeamId} lang={lang} date={gpsDate} />}
            </section>

            {/* ── Today's Training Overview ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-semibold uppercase tracking-widest text-slate-900">
                      {isViewingToday ? `Æfing Dagsins · ${gpsDate}` : `Æfing · ${gpsDate}`}
                    </CardTitle>
                    <CardDescription className="mt-1 text-sm text-slate-500">
                      {isBasketball ? "Player Load · Catapult" : "GPS gögn · Catapult"}
                    </CardDescription>
                  </div>
                  <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600">
                    {todayPlayerRows.length} / {gpsAllPlayers.length} leikmenn
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {gpsLoading ? (
                  <div className="py-6 text-center text-sm text-slate-400">Loading…</div>
                ) : todayPlayerRows.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-400">{lang === "EN" ? `No GPS data recorded for ${gpsDate}.` : `Engin GPS gögn skráð ${gpsDate}.`}</div>
                ) : (
                  <>
                    {/* Squad average KPI tiles */}
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {(isBasketball ? [
                        { label: "Player Load",      value: fmtN(tAvgPlayerLoad, 1), unit: "avg" },
                        { label: "PL / min",         value: fmtN(tAvgPlPerMin,   2), unit: "avg" },
                        { label: "IMA COD",          value: fmtN(tAvgImaCod,     0), unit: "avg" },
                        { label: "IMA Accelerations",value: fmtN(tAvgImaAccel,   0), unit: "avg" },
                      ] : [
                        { label: lang === "EN" ? "Total Distance" : "Heildarvegalengd", value: fmtN(tAvgDist),    unit: "m avg" },
                        { label: lang === "EN" ? "High-speed Dist" : "Háhraðavegalengd", value: fmtN(tAvgHs),      unit: "m avg (VB5+VB6)" },
                        { label: "Accel B2-3",       value: fmtN(tAvgAccB),    unit: lang === "EN" ? "count avg" : "efni avg" },
                        { label: "Decel B2-3",       value: fmtN(tAvgDecB),    unit: lang === "EN" ? "count avg" : "efni avg" },
                      ]).map(({ label, value, unit }) => (
                        <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
                          <div className="text-[11px] text-slate-400">{unit}</div>
                        </div>
                      ))}
                    </div>

                    {/* Per-player table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{lang === "EN" ? "Player" : "Leikmaður"}</th>
                            {isBasketball ? <>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Player Load</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">PL/min</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">IMA COD</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">IMA Accels</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">IMA Decels</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Max Vel</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-red-500 whitespace-nowrap">Avg HR</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-red-500 whitespace-nowrap">Max HR</th>
                            </> : <>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Tot Dist (m)</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">HS Dist (m)</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Accels (#)</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Decels (#)</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Acc B2-3</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">Dec B2-3</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-red-500 whitespace-nowrap">Avg HR</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-red-500 whitespace-nowrap">Max HR</th>
                            </>}
                          </tr>
                        </thead>
                        <tbody>
                          {/* Squad average row */}
                          <tr className="border-b-2 border-slate-300 bg-slate-100 font-semibold">
                            <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sveit avg</td>
                            {isBasketball ? <>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(tAvgPlayerLoad, 1)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(tAvgPlPerMin,   2)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(tAvgImaCod,     0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(tAvgImaAccel,   0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(squadAvgToday(todayPlayerRows.map(r => r.imaDecel)), 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(squadAvgToday(todayPlayerRows.map(r => r.maxVel)),   1)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(squadAvgToday(todayPlayerRows.map(r => r.avgHr)), 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(squadAvgToday(todayPlayerRows.map(r => r.maxHr)), 0)}</td>
                            </> : <>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(tAvgDist)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(tAvgHs)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(squadAvgToday(todayPlayerRows.map(r => r.totAccels)))}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(squadAvgToday(todayPlayerRows.map(r => r.totDecels)))}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(tAvgAccB)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(tAvgDecB)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(squadAvgToday(todayPlayerRows.map(r => r.avgHr)), 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(squadAvgToday(todayPlayerRows.map(r => r.maxHr)), 0)}</td>
                            </>}
                          </tr>
                          {todaySorted.map((p, i) => (
                            <tr key={p.name} className={`border-b border-slate-100 ${i % 2 === 0 ? "" : "bg-slate-50/40"} hover:bg-slate-100/60`}>
                              <td className="px-4 py-2 whitespace-nowrap">
                                <div className="font-medium text-slate-900">{p.name}</div>
                                <div className="text-[11px] text-slate-400">{p.position}</div>
                              </td>
                              {isBasketball ? <>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-800 font-medium">{fmtN(p.playerLoad, 1)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.playerLoadPerMin, 2)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.imaCod)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.imaAccel)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.imaDecel)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.maxVel, 1)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{p.avgHr != null ? <span className="text-red-600">{fmtN(p.avgHr, 0)}</span> : "—"}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{p.maxHr != null ? <span className="text-red-700 font-semibold">{fmtN(p.maxHr, 0)}</span> : "—"}</td>
                              </> : <>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-800 font-medium">{fmtN(p.totalDist)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.hsDist > 0 ? p.hsDist : null)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.totAccels)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.totDecels)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.accelB23)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtN(p.decelB23)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{p.avgHr != null ? <span className="text-red-600">{fmtN(p.avgHr, 0)}</span> : "—"}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{p.maxHr != null ? <span className="text-red-700 font-semibold">{fmtN(p.maxHr, 0)}</span> : "—"}</td>
                              </>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* GpsLoadIntelligence + Squad Load + MLI + MLS moved out:
                - Load Intelligence + MLI + MLS → /coach/load-intelligence
                  (Internal:External coupling story).
                - Squad Load 7d/28d/ACWR table → /coach/quadrant (Quadrant
                  IS the acute/chronic story so the table sits naturally
                  alongside the 2x2 chart).
                GPS Data tab now keeps just the daily snapshot table
                above plus the manual entry below — pure "what did each
                player do today" view. */}
            <CoachGpsManualEntry
              teamId={coachTeamId}
              date={today}
              getAuthHeaders={getCoachAuthHeaders}
            />
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          MD COMPARISON TAB
      ══════════════════════════════════════════ */}
      {dashTab === "md" && !isAtLeastPro && (
        <UpgradeWall
          requiredPlan="PRO"
          featureName="MD Comparison"
          description="Compare training session load against historical averages for the same match day designation using Z-scores and STEN."
        />
      )}
      {dashTab === "md" && isAtLeastPro && coachTeamId && (
        <div className="space-y-4">
          <CoachMdComparisonCard teamId={coachTeamId} date={today} lang={lang} />
        </div>
      )}

      {/* ══════════════════════════════════════════
          DRILLS TAB (team library + research templates)
      ══════════════════════════════════════════ */}
      {dashTab === "drills" && !isAtLeastPro && (
        <UpgradeWall
          requiredPlan="PRO"
          featureName="Drill Library"
          description="Team-scoped drill library með GPS load metrics og research-backed SSG templates (Rampinini, Fradua)."
        />
      )}
      {dashTab === "drills" && isAtLeastPro && coachTeamId && (
        <CoachDrillsTab teamId={coachTeamId} teamSport={teamSport} />
      )}

      {/* ══════════════════════════════════════════
          VOLATILITY TAB
      ══════════════════════════════════════════ */}
      {dashTab === "volatility" && !isAtLeastPro && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          🔒 Volatility tab requires PRO or higher.
        </div>
      )}
      {dashTab === "volatility" && isAtLeastPro && (() => {
        // Last 10 days window
        const DAYS = 10;
        const windowStart = addDaysISO(today, -(DAYS - 1));

        // Build player list with their 10-day monitoring history
        const playerEntries = Object.entries(recentMonitoringByPlayer)
          .map(([pid, points]) => {
            // Filter + sort to last 10 days
            const window = points
              .filter((p) => p.date >= windowStart && p.date <= today)
              .sort((a, b) => a.date.localeCompare(b.date));
            // Find player name from current rows
            const row = rowsWithAdaptive.find((r) => String(r.player_id) === pid);
            return { pid, name: row?.full_name ?? pid, window };
          })
          .filter((e) => e.window.length >= 2)
          .sort((a, b) => a.name.localeCompare(b.name));

        // Generate date labels for the window
        const dayLabels: string[] = [];
        for (let i = 0; i < DAYS; i++) {
          const d = new Date(`${windowStart}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + i);
          dayLabels.push(d.toISOString().slice(5, 10)); // MM-DD
        }

        // SVG multi-line chart helpers
        const W = 420, H = 130, PAD = { top: 10, right: 38, bottom: 22, left: 30 };
        const innerW = W - PAD.left - PAD.right;
        const innerH = H - PAD.top - PAD.bottom;

        function toX(idx: number, total: number) {
          if (total <= 1) return PAD.left + innerW / 2;
          return PAD.left + (idx / (total - 1)) * innerW;
        }
        function toY(val: number, min: number, max: number) {
          if (max === min) return PAD.top + innerH / 2;
          const t = (val - min) / (max - min);
          return PAD.top + (1 - t) * innerH;
        }
        function buildPath(pts: Array<{ x: number; y: number } | null>): string {
          let d = "";
          for (const pt of pts) {
            if (!pt) { d += " "; continue; }
            d += d ? ` L${pt.x.toFixed(1)},${pt.y.toFixed(1)}` : `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
          }
          return d.trim();
        }

        // Normalize z-score: -3..+3 → 0..100
        function normZ(z: number | null | undefined): number | null {
          if (z == null) return null;
          return Math.max(0, Math.min(100, ((z + 3) / 6) * 100));
        }
        // Normalize check-in: 0..25 → 0..100
        function normCI(v: number | null | undefined): number | null {
          if (v == null) return null;
          return Math.max(0, Math.min(100, (v / 25) * 100));
        }
        // Normalize soreness: 1..5 inverted → 0..100 (high soreness = low score)
        function normSor(v: number | null | undefined): number | null {
          if (v == null) return null;
          return Math.max(0, Math.min(100, ((5 - v) / 4) * 100));
        }
        // Normalize sleep: 1..5 → 0..100
        function normSleep(v: number | null | undefined): number | null {
          if (v == null) return null;
          return Math.max(0, Math.min(100, ((v - 1) / 4) * 100));
        }

        function flagColor(v: number | null): string {
          if (v == null) return "#94A3B8";
          if (v < 33) return "#EF4444";
          if (v < 60) return "#F59E0B";
          return "#22C55E";
        }

        const SERIES = [
          { key: "ci",    label: "Check-in",  color: "#3B82F6", fn: (p: VolatilityDailyPoint) => normCI(p.checkInScore) },
          { key: "z",     label: "Z-score",   color: "#8B5CF6", fn: (p: VolatilityDailyPoint) => normZ(p.zScore) },
          { key: "sor",   label: "Soreness",  color: "#F97316", fn: (p: VolatilityDailyPoint) => normSor(p.soreness) },
          { key: "sleep", label: "Sleep",     color: "#14B8A6", fn: (p: VolatilityDailyPoint) => normSleep(p.sleepQuality) },
        ] as const;

        // Y-axis labels
        const yLabels = [{ val: 100, label: "100" }, { val: 50, label: "50" }, { val: 0, label: "0" }];

        // X-axis tick positions (show at most 5)
        const xTickStep = Math.max(1, Math.ceil(DAYS / 5));
        const xTicks = dayLabels
          .map((lbl, i) => ({ lbl, x: toX(i, DAYS) }))
          .filter((_, i) => i % xTickStep === 0 || i === DAYS - 1);

        return (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold uppercase tracking-widest text-slate-900">
                  Readiness Volatility — Síðustu {DAYS} dagar
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Sveiflur per leikmann · Check-in · Z-score · Þreyta · Svefn · 0 = slæmt, 100 = frábært
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Legend */}
                <div className="mb-4 flex flex-wrap gap-4 text-xs">
                  {SERIES.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-6 rounded-full" style={{ background: s.color }} />
                      {s.label}
                    </span>
                  ))}
                  <span className="ml-2 text-slate-400">· Soreness er snúin: hærra = minni þreyta</span>
                </div>

                {playerEntries.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">
                    Engin readiness gögn fundust fyrir síðustu {DAYS} daga. Gakktu úr skugga um að leikmenn hafi gert check-in.
                  </div>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2">
                    {playerEntries.map(({ pid, name, window: pts }) => {
                      // Latest composite score (avg of available normalized metrics from latest point)
                      const last = pts[pts.length - 1];
                      const latestVals = [normCI(last?.checkInScore), normZ(last?.zScore), normSor(last?.soreness), normSleep(last?.sleepQuality)].filter((v): v is number => v != null);
                      const latestComposite = latestVals.length ? latestVals.reduce((s, v) => s + v, 0) / latestVals.length : null;

                      // Compute volatility = std dev of check-in scores over window
                      const ciVals = pts.map((p) => p.checkInScore).filter((v): v is number => v != null);
                      const ciMean = ciVals.length ? ciVals.reduce((s, v) => s + v, 0) / ciVals.length : null;
                      const ciStd = ciMean != null && ciVals.length > 1
                        ? Math.sqrt(ciVals.map((v) => (v - ciMean) ** 2).reduce((s, v) => s + v, 0) / ciVals.length)
                        : null;
                      const volLevel = ciStd == null ? null : ciStd > 5 ? "HIGH" : ciStd > 2.5 ? "MODERATE" : "LOW";

                      return (
                        <div key={pid} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          {/* Header */}
                          <div className="mb-2 flex items-center justify-between">
                            <div className="font-semibold text-slate-900 text-sm truncate">{name}</div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {volLevel && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${volLevel === "HIGH" ? "bg-red-100 text-red-700" : volLevel === "MODERATE" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                  {volLevel === "HIGH" ? "Há sveifla" : volLevel === "MODERATE" ? "Miðlungs" : "Stöðugur"}
                                </span>
                              )}
                              {latestComposite != null && (
                                <span className="text-xs font-bold" style={{ color: flagColor(latestComposite) }}>
                                  {Math.round(latestComposite)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* SVG Chart */}
                          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
                            {/* Grid lines */}
                            {yLabels.map(({ val }) => {
                              const y = toY(val, 0, 100);
                              return (
                                <line key={val} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                                  stroke="#E2E8F0" strokeWidth="1" strokeDasharray={val === 50 ? "3,3" : undefined} />
                              );
                            })}

                            {/* Y-axis labels */}
                            {yLabels.map(({ val, label }) => (
                              <text key={val} x={PAD.left - 4} y={toY(val, 0, 100) + 3.5}
                                textAnchor="end" fontSize="8" fill="#94A3B8">{label}</text>
                            ))}

                            {/* X-axis ticks */}
                            {xTicks.map(({ lbl, x }) => (
                              <text key={lbl} x={x} y={H - 4} textAnchor="middle" fontSize="8" fill="#94A3B8">{lbl}</text>
                            ))}

                            {/* Data lines per series */}
                            {SERIES.map((s) => {
                              // Map each point in the window to the chart x position
                              const pathPts = pts.map((p, i) => {
                                const val = s.fn(p);
                                if (val == null) return null;
                                return { x: toX(i, pts.length), y: toY(val, 0, 100), val };
                              });
                              // Find the last valid point for the label
                              const lastPt = [...pathPts].reverse().find(Boolean) ?? null;
                              return (
                                <g key={s.key}>
                                  <path
                                    d={buildPath(pathPts)}
                                    fill="none"
                                    stroke={s.color}
                                    strokeWidth="1.8"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    opacity="0.85"
                                  />
                                  {/* Dots on actual data points */}
                                  {pathPts.map((pt, i) =>
                                    pt ? (
                                      <circle key={i} cx={pt.x} cy={pt.y} r="2.5" fill={s.color} opacity="0.9" />
                                    ) : null
                                  )}
                                  {/* Score label at the last data point */}
                                  {lastPt && (
                                    <g>
                                      <rect
                                        x={lastPt.x + 4}
                                        y={lastPt.y - 7}
                                        width={22}
                                        height={11}
                                        rx={3}
                                        fill={s.color}
                                        opacity={0.15}
                                      />
                                      <text
                                        x={lastPt.x + 15}
                                        y={lastPt.y + 2.5}
                                        textAnchor="middle"
                                        fontSize="8"
                                        fontWeight="700"
                                        fill={s.color}
                                      >
                                        {Math.round(lastPt.val)}
                                      </text>
                                    </g>
                                  )}
                                </g>
                              );
                            })}

                            {/* Today marker */}
                            {pts.some((p) => p.date === today) && (() => {
                              const todayIdx = pts.findIndex((p) => p.date === today);
                              if (todayIdx < 0) return null;
                              const x = toX(todayIdx, pts.length);
                              return (
                                <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom}
                                  stroke="#1E293B" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
                              );
                            })()}
                          </svg>

                          {/* Latest values */}
                          <div className="mt-1.5 grid grid-cols-4 gap-1 text-[10px] text-slate-500">
                            <div>CI: <span className="font-medium text-slate-700">{last?.checkInScore != null ? Math.round(last.checkInScore) : "—"}</span></div>
                            <div>Z: <span className="font-medium text-slate-700">{last?.zScore != null ? last.zScore.toFixed(1) : "—"}</span></div>
                            <div>Sor: <span className="font-medium text-slate-700">{last?.soreness != null ? last.soreness : "—"}</span></div>
                            <div>Svefn: <span className="font-medium text-slate-700">{last?.sleepQuality != null ? last.sleepQuality : "—"}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          VALD / CMJ TAB
      ══════════════════════════════════════════ */}
      {dashTab === "vald" && !isAtLeastPro && (
        <UpgradeWall
          requiredPlan="PRO"
          featureName="VALD / CMJ testing"
          description="See which players need a CMJ test today, track neuromuscular flags, and monitor force plate data alongside readiness scores."
        />
      )}
      {dashTab === "vald" && isAtLeastPro && (
        <div className="space-y-4">
          <ValdAlertsPanel teamId={planPreview?.team_id ?? rows.find((row) => row.team_id)?.team_id ?? null} date={today} />
        </div>
      )}

      {/* ══════════════════════════════════════════
          STRENGTH / VBT TAB
      ══════════════════════════════════════════ */}
      {dashTab === "strength" && !isAtLeastPro && (
        <UpgradeWall
          requiredPlan="PRO"
          featureName="Strength / VBT"
          description="See each player's personal bests per exercise, today's performance vs PB, estimated 1RM, and VBT readiness signals."
        />
      )}
      {dashTab === "strength" && isAtLeastPro && (
        <CoachStrengthVbtTab teamId={coachTeamId} date={today} lang={lang} />
      )}

      {/* ══════════════════════════════════════════
          TREND TAB
      ══════════════════════════════════════════ */}
      {dashTab === "trend" && !isAtLeastPro && (
        <UpgradeWall
          requiredPlan="PRO"
          featureName="Player Trends"
          description="30, 60 and 90-day readiness, STEN, training action history and GPS load per player."
        />
      )}
      {dashTab === "trend" && isAtLeastPro && (
        <PlayerTrendTab
          coachTeamId={coachTeamId}
          today={today}
          teamSport={teamSport}
          lang={lang}
        />
      )}

      {/* ══════════════════════════════════════════
          INJURIES / RTP TAB
      ══════════════════════════════════════════ */}
      {dashTab === "rtp" && !isAtLeastPro && (
        <UpgradeWall
          requiredPlan="PRO"
          featureName="Injuries / Return-to-Play"
          description="Record injuries, track rehabilitation stages, and manage return-to-play progression per player."
        />
      )}
      {dashTab === "rtp" && isAtLeastPro && (
        <RtpTab coachTeamId={coachTeamId} lang={lang} />
      )}

      <ExplainabilityDrawer
        open={!!piDrawerDecision}
        onClose={() => {
          setPiDrawerDecision(null);
          setPiDrawerPlayerName(null);
        }}
        playerName={piDrawerPlayerName}
        decision={piDrawerDecision}
      />

      <Card className="shadow-sm">
        <CardContent className="p-4 text-sm">
          <span className="font-semibold">Workflow:</span> Byrja á 🔴/🟡 → staðfesta með GPS/CMJ → velja minnsta virka skammt.
        </CardContent>
      </Card>

      {/* PWA bottom padding */}
      {isPwa && <div style={{ height: "calc(68px + env(safe-area-inset-bottom))" }} />}

      {/* PWA bottom navigation */}
      {isPwa && <CoachPwaBottomNav activeTab={dashTab} onChange={setDashTab} lang={lang} />}
    </div>
  );
}

// ─── Coach PWA Bottom Navigation ────────────────────────────────────────────

function CoachPwaBottomNav({
  activeTab,
  onChange,
  lang,
}: {
  activeTab: string;
  onChange: (tab: "today" | "squad" | "load" | "gps" | "md" | "drills" | "volatility" | "vald" | "strength" | "trend" | "rtp") => void;
  lang: "IS" | "EN";
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  const PRIMARY: Array<{
    key: "today" | "squad" | "load" | "gps" | "md";
    labelIS: string;
    labelEN: string;
    icon: (active: boolean) => React.ReactNode;
  }> = [
    {
      key: "today", labelIS: "Í dag", labelEN: "Today",
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12L12 4l9 8" /><path d="M9 21V12h6v9" />
        </svg>
      ),
    },
    {
      key: "squad", labelIS: "Hópur", labelEN: "Squad",
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      key: "load", labelIS: "Álag", labelEN: "Load",
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      key: "gps", labelIS: "GPS", labelEN: "GPS",
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      ),
    },
    {
      key: "md", labelIS: "MD", labelEN: "MD",
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      ),
    },
  ];

  const MORE_TABS: Array<{
    key: "today" | "squad" | "load" | "gps" | "md" | "drills" | "volatility" | "vald" | "strength" | "trend" | "rtp";
    labelIS: string;
    labelEN: string;
  }> = [
    { key: "drills",     labelIS: "Session",        labelEN: "Session" },
    { key: "volatility", labelIS: "Sveiflur",       labelEN: "Volatility" },
    { key: "vald",       labelIS: "VALD / CMJ",     labelEN: "VALD / CMJ" },
    { key: "strength",   labelIS: "Styrkur / VBT",  labelEN: "Strength / VBT" },
    { key: "trend",      labelIS: "Þróun",          labelEN: "Trends" },
    { key: "rtp",        labelIS: "Meiðsli / RTP",  labelEN: "Injuries / RTP" },
  ];

  const isMoreActive = MORE_TABS.some((t) => t.key === activeTab);

  return (
    <>
      {/* More menu overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-[998] bg-black/30"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More menu panel */}
      {moreOpen && (
        <div className="fixed bottom-[calc(68px+env(safe-area-inset-bottom))] left-0 right-0 z-[999] mx-4 mb-1 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="grid grid-cols-2 gap-px p-2">
            {MORE_TABS.map((t) => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { onChange(t.key); setMoreOpen(false); }}
                  className={`rounded-lg px-4 py-3 text-sm font-medium transition-colors text-left ${
                    isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {lang === "IS" ? t.labelIS : t.labelEN}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[1000] flex items-stretch border-t border-slate-200 bg-white/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {PRIMARY.map(({ key, labelIS, labelEN, icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => { onChange(key); setMoreOpen(false); }}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? "text-slate-900" : "text-slate-400"
              }`}
            >
              {icon(isActive)}
              <span className={`text-[9px] font-semibold tracking-wide ${isActive ? "text-slate-900" : "text-slate-400"}`}>
                {(lang === "IS" ? labelIS : labelEN).toUpperCase()}
              </span>
            </button>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
            isMoreActive ? "text-slate-900" : "text-slate-400"
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isMoreActive ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="19" r="1.5" fill="currentColor" />
          </svg>
          <span className={`text-[9px] font-semibold tracking-wide ${isMoreActive ? "text-slate-900" : "text-slate-400"}`}>
            {lang === "IS" ? "MEIRA" : "MORE"}
          </span>
        </button>
      </nav>
    </>
  );
}
