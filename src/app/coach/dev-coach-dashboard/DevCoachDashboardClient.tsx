"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
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
import {
  buildWorkflowEvent,
  loadSessionDraftRecordByPlayerDate,
  saveSessionDraftRecord,
  saveSessionWorkflowEvent,
  type SessionDraftRecord,
} from "@/lib/micropulse/sessionWorkflow";
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
import ExplainabilityDrawer from "@/components/performanceIntelligence/ExplainabilityDrawer";
import PerformanceIntelligencePanel from "@/components/performanceIntelligence/PerformanceIntelligencePanel";
import SessionDraftCard from "@/components/sessionBuilder/SessionDraftCard";
import SessionDraftDetails from "@/components/sessionBuilder/SessionDraftDetails";
import TeamSessionBuildSummaryCard from "@/components/sessionBuilder/TeamSessionBuildSummary";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SessionRpeMonitoringCard from "@/components/coach/SessionRpeMonitoringCard";
import DailyInternalLoadCard from "@/components/coach/DailyInternalLoadCard";
import LoadMetricsCard from "@/components/coach/LoadMetricsCard";
import { buildDevDailySessionAdapterResult } from "@/lib/micropulse/trainingGraph/devAdapter";

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

  _confidence_num?: number | null;
  _needs_review?: boolean;
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
};

/** -----------------------------
 * Helpers (safe parsing etc.)
 * ----------------------------- */
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

const confNum = (v: any) => {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

const needsReview = (confidence: any) => {
  const c = confNum(confidence);
  return c == null || c < 60;
};

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

function computeTeamRisk(signal: TeamSignal | null) {
  if (!signal || !signal.n_players) {
    return {
      level: "UNKNOWN" as const,
      label: "No data",
      why: "Engin team-samantekt tiltæk fyrir daginn.",
      recommendation: "Refresh eða keyrðu Generate Today Decisions.",
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
      recommendation:
        "Breytðu æfingu: minnkaðu heildarálag (volume/intensity), forðastu mikla eccentrics/contacts, aukið recovery blocks. Haltu gæðum á lykilatriðum en skera niður magn.",
    };
  }

  if (impactScore >= 15) {
    return {
      level: "CAUTION" as const,
      label: "CAUTION",
      why: `Impact ${impactScore.toFixed(1)} (RECOVERY ${recoveryPct.toFixed(0)}%, REDUCED ${reducedPct.toFixed(0)}%).`,
      recommendation:
        "Aðlaga daginn: halda gæðum en lækka magn (t.d. -20–30% sets/reps), velja minni árekstra, lengri hvíld, og fylgjast með þeim sem eru REDUCED/RECOVERY.",
    };
  }

  return {
    level: "STABLE" as const,
    label: "STABLE",
    why: `Impact ${impactScore.toFixed(1)} (RECOVERY ${recoveryPct.toFixed(0)}%, REDUCED ${reducedPct.toFixed(0)}%).`,
    recommendation: "Keyra plan að mestu: normal session, með sértækri áherslu á þá sem eru REDUCED/RECOVERY (individual mods).",
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

function confidenceFmt(x: number | null) {
  if (x == null) return "—";
  return x <= 1 ? `${Math.round(x * 100)}%` : `${Math.round(x)}%`;
}

const reportStyles = StyleSheet.create({
  page: { padding: 24, fontSize: 10, color: "#111827", fontFamily: "Helvetica" },
  h1: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  section: { marginBottom: 12, paddingBottom: 8, borderBottom: "1 solid #E5E7EB" },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  muted: { color: "#4B5563" },
  playerCard: { marginBottom: 10, padding: 8, border: "1 solid #E5E7EB", borderRadius: 6 },
  playerHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  badgeYellow: { color: "#92400E" },
  badgeRed: { color: "#991B1B" },
  whyList: { marginTop: 2, marginBottom: 6 },
  whyItem: { marginBottom: 2 },
  table: { border: "1 solid #D1D5DB", borderRadius: 4, overflow: "hidden", marginTop: 4 },
  tHead: { flexDirection: "row", backgroundColor: "#F3F4F6" },
  tRow: { flexDirection: "row", borderTop: "1 solid #E5E7EB" },
  cellH: { flex: 1, padding: 4, fontSize: 9, fontWeight: 700 },
  cell: { flex: 1, padding: 4, fontSize: 9 },
  footerSummary: { marginTop: 8, fontSize: 11, fontWeight: 700 },
});

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
          <View style={reportStyles.section}>
            <Text style={reportStyles.h1}>Readiness Risk Report</Text>
            <View style={reportStyles.row}>
              <Text>Team: {data.teamName || "—"}</Text>
              <Text>Date: {data.date}</Text>
            </View>
            <Text style={reportStyles.muted}>
              Flagged players (YELLOW/RED): {data.flaggedPlayers.length} · Page {pageIdx + 1}/{flaggedPages.length}
            </Text>
          </View>

          <View style={reportStyles.section}>
            <Text style={reportStyles.sectionTitle}>Flagged Players</Text>
            {pagePlayers.length ? (
              pagePlayers.map((p, i) => (
                <View key={`${p.name}-${pageIdx}-${i}`} style={reportStyles.playerCard}>
                  <View style={reportStyles.playerHeader}>
                    <Text>{p.name}</Text>
                    <Text style={p.readinessStatus === "RED" ? reportStyles.badgeRed : reportStyles.badgeYellow}>
                      {p.readinessStatus}
                    </Text>
                  </View>
                  <View style={reportStyles.row}>
                    <Text>Score: {scoreFmt(p.score)}</Text>
                    <Text>Confidence: {confidenceFmt(p.confidence)}</Text>
                  </View>
                  <Text style={reportStyles.sectionTitle}>WHY</Text>
                  <View style={reportStyles.whyList}>
                    {(p.why.length ? p.why : ["No ATE reasons available."]).map((reason, idx) => (
                      <Text key={`${p.name}-${pageIdx}-why-${idx}`} style={reportStyles.whyItem}>
                        - {reason}
                      </Text>
                    ))}
                  </View>

                  <Text style={reportStyles.sectionTitle}>Data Breakdown</Text>
                  <View style={reportStyles.table}>
                    <View style={reportStyles.tHead}>
                      <Text style={reportStyles.cellH}>Check-in</Text>
                      <Text style={reportStyles.cellH}>Z score</Text>
                      <Text style={reportStyles.cellH}>Delta Z</Text>
                      <Text style={reportStyles.cellH}>ACWR</Text>
                      <Text style={reportStyles.cellH}>Sleep</Text>
                      <Text style={reportStyles.cellH}>HRV</Text>
                      <Text style={reportStyles.cellH}>Volatility</Text>
                    </View>
                    <View style={reportStyles.tRow}>
                      <Text style={reportStyles.cell}>{scoreFmt(p.checkInScore)}</Text>
                      <Text style={reportStyles.cell}>{numFmt(p.zScore)}</Text>
                      <Text style={reportStyles.cell}>{numFmt(p.deltaZ)}</Text>
                      <Text style={reportStyles.cell}>{numFmt(p.acwr)}</Text>
                      <Text style={reportStyles.cell}>{scoreFmt(p.sleepScore)}</Text>
                      <Text style={reportStyles.cell}>{numFmt(p.hrv)}</Text>
                      <Text style={reportStyles.cell}>{numFmt(p.volatility)}</Text>
                    </View>
                  </View>

                  <View style={[reportStyles.row, { marginTop: 6 }]}>
                    <Text>ATE recommendation</Text>
                    <Text>{p.ateSessionMode}</Text>
                  </View>
                  <View style={[reportStyles.row, { marginTop: 4 }]}>
                    <Text>Injury risk</Text>
                    <Text>
                      {p.injuryRiskLevel} ({p.injuryConfidence})
                    </Text>
                  </View>
                  <View style={reportStyles.whyList}>
                    {(p.injuryWhy.length ? p.injuryWhy : ["No additional injury-risk pattern identified."]).map((line, idx) => (
                      <Text key={`${p.name}-${pageIdx}-inj-why-${idx}`} style={reportStyles.whyItem}>
                        - {line}
                      </Text>
                    ))}
                  </View>
                  <View style={reportStyles.whyList}>
                    {(p.injuryRecommendation.length ? p.injuryRecommendation : ["Maintain planned loading with routine monitoring."]).map(
                      (line, idx) => (
                        <Text key={`${p.name}-${pageIdx}-inj-rec-${idx}`} style={reportStyles.whyItem}>
                          - {line}
                        </Text>
                      )
                    )}
                  </View>
                </View>
              ))
            ) : (
              <Text style={reportStyles.muted}>No YELLOW/RED players on current data.</Text>
            )}
          </View>

          {pageIdx === flaggedPages.length - 1 ? (
            <View>
              <Text style={reportStyles.sectionTitle}>Team Summary</Text>
              <Text style={reportStyles.footerSummary}>
                GREEN: {data.summary.green} · YELLOW: {data.summary.yellow} · RED: {data.summary.red}
              </Text>
            </View>
          ) : null}
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
    <div className="grid gap-3 md:grid-cols-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Messages</CardTitle>
          <CardDescription>Stjórna coach skilaboðum og templates.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/coach/messages">Opna Messages</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Week setup</CardTitle>
          <CardDescription>Æfingavika, match-plan og álag.</CardDescription>
          {weeklyOutlook ? <div className="text-xs text-slate-600">{weeklyOutlook}</div> : null}
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/coach/week-setup">Opna Week setup</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Match minutes</CardTitle>
          <CardDescription>Mínútur, byrjun/varamaður og “load context”.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/coach/match-minutes">Opna Match minutes</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">TV view</CardTitle>
          <CardDescription>Sýnir 4 uppsetningar á skjá (fyrir sal/sjónvarp).</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/coach/display?refresh=15" target="_blank" rel="noreferrer">
              Opna TV view
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** -----------------------------
 * Main page
 * ----------------------------- */
export default function CoachPage() {
  const router = useRouter();

  const PAGE_SIZE = 15;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

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
  const [detailSectionOpenByPlayer, setDetailSectionOpenByPlayer] = useState<Record<string, Partial<Record<PlayerDetailSectionKey, boolean>>>>({});

  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [weekGrid, setWeekGrid] = useState<any[]>([]);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);

  const [coachName, setCoachName] = useState<string>("");
  const [coachDisplayName, setCoachDisplayName] = useState<string>("—");
  const [coachVerified, setCoachVerified] = useState(false);
  const [coachRole, setCoachRole] = useState<string>("coach");
  const [coachTeamId, setCoachTeamId] = useState<string | null>(null);
  const [adminConfigSnapshot, setAdminConfigSnapshot] = useState<AdminConfigSnapshot>(createDefaultAdminConfigSnapshot());

  // MD context
  const [mdContextToday, setMdContextToday] = useState<string | null>(null);

  // Team rollups
  const [teamIntel, setTeamIntel] = useState<TeamIntel | null>(null);
  const [teamSignal, setTeamSignal] = useState<TeamSignal | null>(null);
  const [unitAlerts, setUnitAlerts] = useState<any[]>([]);

  // Generator
  const [genLoading, setGenLoading] = useState(false);
  const [genToast, setGenToast] = useState("");

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

  // Yesterday load context
  const [ctxHsr, setCtxHsr] = useState<string>("");
  const [ctxAcc, setCtxAcc] = useState<string>("");
  const [ctxDec, setCtxDec] = useState<string>("");
  const [ctxDist, setCtxDist] = useState<string>("");
  const [ctxVmax, setCtxVmax] = useState<string>("");
  const [ctxDuration, setCtxDuration] = useState<string>("");
  const [ctxIntensity, setCtxIntensity] = useState<"LOW" | "MEDIUM" | "HIGH" | "OFF" | "">("");

  const [ctxSaving, setCtxSaving] = useState(false);
  const [localDecisionLoading, setLocalDecisionLoading] = useState(false);
  const [localDecision, setLocalDecision] = useState<any | null>(null);
  const [localDecisionError, setLocalDecisionError] = useState<string>("");
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null);
  const [reminderStatusLoading, setReminderStatusLoading] = useState(false);
  const [reminderStatusError, setReminderStatusError] = useState("");
  const [manualReminderSending, setManualReminderSending] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

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

  // Header MD-day (team display)
  const mdDayToday = useMemo(() => {
    const t = dateKey(todayISO());
    const row = (weekGrid ?? []).find((x: any) => dateKey(x.day_date) === t) ?? null;
    const src = mdContextToday ?? row?.md_day ?? planPreview?.md_day ?? null;
    return prettyMd(src).md;
  }, [weekGrid, planPreview?.md_day, mdContextToday]);


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

  async function loadYesterdayContext(teamId: string, entryDate: string) {
    const yday = ydayOf(entryDate);

    const { data, error } = await supabase
      .from("training_session_context")
      .select("hsr_m, acc_total, dec_total, total_distance_m, max_velocity_pct, intensity, duration_min")
      .eq("team_id", teamId)
      .eq("session_date", yday)
      .maybeSingle();

    if (error) {
      console.warn("loadYesterdayContext error:", error.message);
      return;
    }

    setCtxHsr(data?.hsr_m?.toString() ?? "");
    setCtxAcc(data?.acc_total?.toString() ?? "");
    setCtxDec(data?.dec_total?.toString() ?? "");
    setCtxDist(data?.total_distance_m?.toString() ?? "");
    setCtxVmax(data?.max_velocity_pct?.toString() ?? "");
    setCtxIntensity((data?.intensity as any) ?? "");
    setCtxDuration(data?.duration_min?.toString() ?? "");
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
    setError("");

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error("auth.getUser error:", authErr.message);

    const uid = auth?.user?.id;
    if (!uid) {
      router.replace(`/login?next=${encodeURIComponent("/coach")}`);
      return false;
    }

    const { data: prof, error: profErr } = await supabase.from("profiles").select("role, display_name, team_id").eq("id", uid).maybeSingle();
    if (profErr) {
      console.error("profiles load error:", profErr.message);
      setError(profErr.message);
      return false;
    }

    const role = (prof as any)?.role ?? null;
    const name = (prof as any)?.display_name ?? auth?.user?.email ?? "";
    setCoachName(name);
    setCoachRole(String(role ?? "coach"));
    setCoachTeamId((prof as any)?.team_id ?? null);

    const r = String(role ?? "").toLowerCase();
    if (r !== "coach" && r !== "admin") {
      router.replace(`/login?next=${encodeURIComponent("/coach")}`);
      return false;
    }

    return true;
  }

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

  async function loadTeamIntelligenceToday() {
    try {
      const { data, error } = await supabase.from("v_coach_team_intelligence_today").select("*").maybeSingle();
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
      const { error } = await supabase.from("stage4_decisions_final").update({ locked: true }).eq("entry_date", entryDate).in("player_id", unlocked);
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
  async function loadToday() {
    try {
      setError("");
      setLoading(true);

      const entryDate = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" }) || todayISO();

      // Ensure Stage4 rows exist (best effort)
      try {
        await supabase.rpc("stage4_bootstrap_for_date", { p_date: entryDate });
      } catch (e: any) {
        console.warn("stage4_bootstrap_for_date failed (loadToday, continuing):", e?.message ?? e);
      }

      // md_day context for today (per team)
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
              .select("md_day")
              .eq("team_id", teamId)
              .eq("date", entryDate)
              .maybeSingle();
            ctxMd = (ctxRow as any)?.md_day ?? null;
            setMdContextToday(ctxMd);
          } else {
            setMdContextToday(null);
          }
        } else {
          setMdContextToday(null);
        }
      } catch {
        setMdContextToday(null);
      }

      // Team intelligence + plan preview + grid
      await loadTeamIntelligenceToday();
      const pp = await loadPlanPreview();
      const grid = await loadWeekGrid(entryDate);

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

      if (teamFilter && teamFilter !== "all") q = q.eq("team", teamFilter);
      if (filter !== "all") q = q.eq("final_color", filter);
      if (search.trim().length > 0) q = q.ilike("full_name", `%${search.trim()}%`);

      const { data, error, count } = await q;
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

        const confidenceNum = confNum((r as any).system_confidence ?? null);
        const reviewNeeded = needsReview((r as any).system_confidence ?? null);

        const baseColor = (String(r.final_color ?? "").toLowerCase() as FinalColor) || null;
        const baseFlag = (String(r.final_flag ?? "").toUpperCase() as FinalFlag) || null;
        const baseReason = (r.final_reason ?? null) as string | null;

        let finalColor: FinalColor = (baseColor ?? "green") as FinalColor;
        let finalFlag: FinalFlag = (baseFlag ?? "GREEN") as FinalFlag;
        let finalReason: string | null = baseReason ?? null;

        const hasDbFinal = !!baseFlag && !!baseColor;
        if (!hasDbFinal) {
          const downgraded = applySorenessDowngrade({
            flag: baseFlag,
            color: baseColor,
            reason: baseReason,
            soreness: r.soreness ?? null,
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

          _confidence_num: confidenceNum,
          _needs_review: reviewNeeded,

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
        if (a._needs_review !== b._needs_review) return a._needs_review ? -1 : 1;

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
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
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
        entry_date: entryDate,
        system_decision: systemDecision,
        coach_decision: action,
        coach_note: message.length ? message : null,
        locked: false,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from("stage4_decisions_final").upsert(payload, {
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
        entry_date: entryDate,
        system_decision: systemDecision,
        coach_decision: action,
        coach_note: message.length ? message : null,
        locked: true,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from("stage4_decisions_final").upsert(payload, {
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
        .from("stage4_decisions_final")
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
    (async () => {
      try {
        setLoading(true);
        const ok = await ensureCoachAccess();
        if (!ok) return;
        setCoachVerified(true);
        await loadToday();
      } finally {
        setLoading(false);
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

  useEffect(() => {
    if (!coachVerified) return;
    loadReminderStatus(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachVerified, today]);

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

  // reload on filters/page/search
  useEffect(() => {
    if (!coachVerified) return;
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, teamFilter, filter, search, coachVerified]);

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
            sorenessScore: point.soreness ?? null,
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    for (const row of rowsWithSessionDraft) {
      const draft = row._session_draft ?? null;
      if (!draft) continue;

      const playerId = String(row.player_id);
      const date = row.entry_date || todayISO();
      const existing = loadSessionDraftRecordByPlayerDate(playerId, date);
      if (existing) continue;

      const createdAt = new Date().toISOString();
      const record: SessionDraftRecord = {
        id: `wf:${playerId}:${date}`,
        playerId,
        playerName: row.full_name,
        teamId: row.team_id ?? undefined,
        date,
        originalGeneratedDraft: structuredClone(draft),
        workingDraft: structuredClone(draft),
        approvedDraft: null,
        publishedDraft: null,
        status: "GENERATED",
        version: 1,
        createdAt,
        updatedAt: createdAt,
        createdBy: "system:auto-session-builder",
        lastEditedBy: null,
        approvedBy: null,
        approvedAt: null,
        publishedBy: null,
        publishedAt: null,
      };

      saveSessionDraftRecord(record);
      saveSessionWorkflowEvent(
        buildWorkflowEvent({
          workflowId: record.id,
          actionType: "GENERATED",
          actorId: "system",
          actorName: "Auto Session Builder",
          summary: "Session draft generated from recommendation stack.",
          metadata: {
            playerId,
            date,
            draftAction: draft.draftAction,
            sessionType: draft.sessionType,
          },
        }),
      );
    }
  }, [rowsWithSessionDraft]);

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
            sorenessScore: point.soreness ?? null,
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

  const needsReviewCount = useMemo(
    () => rowsWithAdaptive.filter((r) => r._needs_review).length,
    [rowsWithAdaptive]
  );

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
      const graphSession = buildDevDailySessionAdapterResult({
        athleteState: graphAthleteStateFromFlag(r.final_flag),
        mdContext: mdContextInput,
        readinessScore: normalizedReadinessScore,
        neuralFatigueBand: neuralFatigueBandInput,
        yesterdayLoadBand,
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
        hardBlock: false,
      });

      return {
        name: r.full_name,
        readinessStatus: String(r.final_flag).toUpperCase() === "RED" ? "RED" : "YELLOW",
        score: typeof r.readiness === "number" ? r.readiness : rawTotalScore,
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
      ? "OFF day detected. Team intelligence input is intentionally de-emphasized."
      : dayStateInfo.state === "NO_INPUT_EXPECTED"
      ? "No input expected for this day context. Team intelligence will populate when inputs are expected."
      : dayStateInfo.state === "MISSING_INPUT"
      ? "Missing readiness inputs for expected players today. Team intelligence may be incomplete."
      : "Engin team intelligence færsla fannst í dag.";

  const queueEmptyMessage =
    dayStateInfo.state === "OFF_DAY"
      ? "OFF day: no player review queue expected."
      : dayStateInfo.state === "NO_INPUT_EXPECTED"
      ? "No input expected today; player review queue is intentionally empty."
      : dayStateInfo.state === "MISSING_INPUT"
      ? "Expected player inputs are missing. Trigger reminders or wait for check-ins."
      : "Engin readiness gögn í dag.";

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
  const renderActionPills = (pid: string, locked: boolean) => {
    const current = draftAction[pid] ?? "FULL";

    const pill = (value: TrainingAction, label: string) => {
      const active = current === value;
      const disabled = locked && !isAdmin;
      return (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => setDraftAction((p) => ({ ...p, [pid]: value }))}
          className={[
            "inline-flex h-12 min-w-[108px] items-center justify-center rounded-xl border px-4 text-sm font-semibold tracking-wide transition-colors",
            disabled ? "cursor-not-allowed opacity-50" : "",
            active ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
          ].join(" ")}
          aria-pressed={active}
        >
          {label}
        </button>
      );
    };

    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pill("FULL", "FULL")}
        {pill("REDUCED", "REDUCED")}
        {pill("RECOVERY", "RECOVERY")}
      </div>
    );
  };

  const renderRow = (r: Row) => {
    const pid = String(r.player_id);
    const isSaving = !!saving[pid];
    const isOpen = expandedPlayerId === pid;

    const cm = colorMeta(r.final_color ?? "green");
    const lockedForCoach = r.is_locked && !isAdmin;
    const isOverride = String(r.final_source ?? "").toUpperCase().includes("COACH");

    const score = typeof r.total_score === "number" ? r.total_score : null;
    const scoreText = `${cm.label} · ${score ?? "—"}`;
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
    const graphSession = buildDevDailySessionAdapterResult({
      athleteState: graphAthleteStateFromFlag(r.final_flag),
      mdContext: mdContextInput,
      readinessScore: normalizedReadinessScore,
      neuralFatigueBand: neuralFatigueBandInput,
      yesterdayLoadBand,
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
      hardBlock: false,
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
    const readinessInputSummary = `Score ${rawTotalScore ?? "—"} · Logged ${new Date(r.created_at).toLocaleTimeString("is-IS", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const fatigueSummaryText = [fatigueType !== "NONE" ? fatigueType : null, fatigueSeverity || null, adaptationSummary || null].filter(Boolean).join(" · ") || "No fatigue flags";
    const trainingSessionSummary =
      graphSession.mode === "graph"
        ? graphSession.ateDecisionPanel?.sessionLabel ?? "Training graph session"
        : "Legacy template rendering";
    const neuralSummaryText = neural
      ? `${neural.neuralLoadState} · ${neural.nextDayRisk}`
      : neuralBiasApplied
      ? "Bias applied"
      : "No neural load data";
    const coachMessageSummary = currentMessage ? currentMessage : "No coach message";

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
      tileClassName = "border-[#ece7de] bg-[#f7f4ee]"
    ) => (
      <div className={`min-w-[150px] flex-1 rounded-[20px] border px-4 py-3 ${tileClassName}`}>
        <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-700">{label}</div>
        <div className={`mt-2 text-[22px] font-semibold leading-none tabular-nums ${valueClassName}`}>{value}</div>
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
                {r._needs_review ? (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                    Needs review
                  </span>
                ) : null}
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
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[360px] xl:items-end">
              {renderActionPills(pid, r.is_locked)}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-3">
              {renderMetricTile("Z-SCORE", zText, zVal != null && zVal > 0 ? "text-[#3f6f1f]" : "text-slate-900", "border-[#ece7de] bg-[#f7f4ee]")}
              {renderMetricTile("DELTA Z", dzText, dzVal != null ? "text-[#3f6f1f]" : "text-slate-900", "border-[#dce9c9] bg-[#eaf4da]")}
              {renderMetricTile("STEN", stenText, "text-slate-900", "border-[#ece7de] bg-[#f7f4ee]")}
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
            {renderAccordionSection(
              "readinessDecision",
              "Readiness decision",
              `${athleteDecision.athleteState} · Confidence: ${explainableDecision.confidence}`,
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Why</div>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-800">
                      {athleteDecision.reasons.map((line) => (
                        <li key={`${pid}-exp-why-${line}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Coach action</div>
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
              "Injury risk",
              `${injuryRiskDecision.injuryRiskLevel} · Confidence: ${injuryRiskDecision.confidence}`,
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Why</div>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-800">
                    {injuryRiskDecision.why.map((line) => (
                      <li key={`${pid}-inj-why-${line}`}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recommendation</div>
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
              "Readiness inputs",
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
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                  Supporting metrics: <span className="font-mono">z {numFmt(explainableDecision.supportingMetrics?.zScore ?? null)} · Δz {numFmt(explainableDecision.supportingMetrics?.deltaZ ?? null)} · acwr {numFmt(explainableDecision.supportingMetrics?.acwr ?? null)} · sleep {numFmt(explainableDecision.supportingMetrics?.sleepScore ?? null)} · hrvΔ {numFmt(explainableDecision.supportingMetrics?.hrvChangePct ?? null)} · vol {numFmt(explainableDecision.supportingMetrics?.volatility ?? null)}</span>
                </div>
              </div>
            )}

            {renderAccordionSection(
              "fatigueAdaptation",
              "Fatigue & adaptation",
              fatigueSummaryText,
              <div className="space-y-4">
                {fatigue ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Fatigue</div>
                    <div className="mt-2">
                      Type: <span className="font-mono">{fatigueType}</span>
                      {fatigueSeverity ? (
                        <>
                          {" "}
                          · Severity: <span className="font-mono">{fatigueSeverity}</span>
                        </>
                      ) : null}
                    </div>
                    {!!fatigueDrivers?.length ? (
                      <div className="mt-1">Drivers: <span className="font-mono">{fatigueDrivers.slice(0, 6).map(driverLabel).join(", ")}</span></div>
                    ) : null}
                    {!!fatigue?.recommendedModifiers?.length ? (
                      <div className="mt-1">Modifiers: <span className="font-mono">{fatigue.recommendedModifiers.join(", ")}</span></div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">No fatigue detail available.</div>
                )}

                {adaptationSummary || adaptationLines.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Adaptation</div>
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
                    <span>Recent volatility{typeof volatilitySummary.overallScore === "number" ? ` · ${volatilitySummary.overallScore.toFixed(1)}` : ""}</span>
                  </button>

                  {volatilityExpanded ? (
                    <div id={volatilityPanelId} className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">Recent volatility</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold tabular-nums text-slate-700">
                            Score {typeof volatilitySummary.overallScore === "number" ? `${volatilitySummary.overallScore.toFixed(1)}/100` : "—"}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${volatilityLevelTone(volatilitySummary.level)}`}>
                            {volatilityLevelLabel(volatilitySummary.level)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                        Last {volatilitySummary.windowDays || volatilitySummary.sampleSize || 0} days
                      </div>
                      <div className="mt-2 text-sm text-slate-700">{volatilitySummary.interpretation}</div>
                      {volatilitySummary.drivers.length ? (
                        <div className="mt-2 text-xs text-slate-600">
                          <span className="font-medium text-slate-700">Main drivers:</span> {summarizeDrivers(volatilitySummary)}
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
                            <span>Volatility trend</span>
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
              "Training session",
              trainingSessionSummary,
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">Session planning</span>
                  <span
                    className={
                      graphSession.mode === "graph"
                        ? "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                        : "inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
                    }
                  >
                    Session source: {graphSession.mode === "graph" ? "Training Graph" : "Legacy template"}
                  </span>
                </div>

                {graphSession.mode === "graph" && graphSession.ateDecisionPanel ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">{graphSession.ateDecisionPanel.title}</div>
                      {graphSession.ateDecisionPanel.sourceLabel ? <span className="text-[10px] uppercase tracking-wide text-slate-500">{graphSession.ateDecisionPanel.sourceLabel}</span> : null}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">Session: {graphSession.ateDecisionPanel.sessionLabel}</div>
                    <div className="mt-1 text-sm text-slate-500">State: {graphSession.ateDecisionPanel.athleteStateLabel}</div>
                    <div className="mt-1 text-sm text-slate-500">MD: {graphSession.ateDecisionPanel.mdContextLabel}</div>
                    {graphSession.ateDecisionPanel.adjustmentLines.length ? <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Adjustments</div> : null}
                    {graphSession.ateDecisionPanel.adjustmentLines.length ? (
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                        {graphSession.ateDecisionPanel.adjustmentLines.map((line) => (
                          <li key={`${pid}-ate-adjust-${line}`}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {graphSession.ateDecisionPanel.reasonLines.length ? <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Why</div> : null}
                    {graphSession.ateDecisionPanel.reasonLines.length ? (
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
                        {graphSession.ateDecisionPanel.reasonLines.slice(0, 4).map((line) => (
                          <li key={`${pid}-ate-reason-${line}`}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {graphSession.ateDecisionPanel.riskFlagLines.length ? <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Risk</div> : null}
                    {graphSession.ateDecisionPanel.riskFlagLines.length ? (
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-amber-700">
                        {graphSession.ateDecisionPanel.riskFlagLines.slice(0, 3).map((line) => (
                          <li key={`${pid}-ate-risk-${line}`}>{line}</li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Decision confidence</div>
                        <span
                          className={
                            decisionConfidence.level === "HIGH"
                              ? "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                              : decisionConfidence.level === "MEDIUM"
                              ? "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                              : "inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700"
                          }
                        >
                          {decisionConfidence.level === "HIGH" ? "High" : decisionConfidence.level === "MEDIUM" ? "Medium" : "Low"}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">Inputs: {decisionConfidence.inputsUsed.length ? decisionConfidence.inputsUsed.join(", ") : "None"}</div>
                      <div className="mt-1 text-xs text-slate-600">Missing: {decisionConfidence.missingInputs.length ? decisionConfidence.missingInputs.join(", ") : "None"}</div>
                      <div className="mt-1 text-xs text-slate-600">Fallbacks: {decisionConfidence.fallbackUsed ? "Partial" : "None"}</div>
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

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <div>Auto reason: <span className="font-mono">{r.final_reason ?? "—"}</span></div>
                  <div className="mt-1">Stage4: system=<span className="font-mono">{r.system_decision ?? "—"}</span> · coach=<span className="font-mono">{r.coach_decision ?? "—"}</span> · final=<span className="font-mono">{r.final_decision ?? "—"}</span> · source=<span className="font-mono">{r.final_source ?? "—"}</span></div>
                  <div className="mt-1">Readiness id: <span className="font-mono">{r.readiness_entry_id ?? "—"}</span> · Updated: <span className="font-mono">{r.stage4_updated_at ?? "—"}</span></div>
                </div>
              </div>
            )}

            {renderAccordionSection(
              "neuralLoad",
              "Neural load",
              neuralSummaryText,
              <div className="space-y-4">
                {neural ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <div>State: <span className="font-mono">{neural.neuralLoadState}</span> · Trajectory: <span className="font-mono">{neural.readinessTrajectory}</span> · Next-day risk: <span className="font-mono">{neural.nextDayRisk}</span> · Score: <span className="font-mono">{neural.neuralLoadScore}</span></div>
                    <div className="mt-2">Summary: <span className="font-mono">{neural.summary}</span></div>
                    {!!neural.drivers?.length ? (
                      <div className="mt-2">Drivers: <span className="font-mono">{neural.drivers.slice(0, 4).map((d) => `${d.label}(+${d.points})`).join(", ")}</span></div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">No neural load data.</div>
                )}

                {neuralBiasApplied ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <div>Applied: <span className="font-mono">yes</span></div>
                    <div className="mt-2">Why: <span className="font-mono">{neuralBiasWhy || "Neural risk signals crossed bias threshold."}</span></div>
                    {!!r._neural_bias_reason_codes?.length ? <div className="mt-2">Codes: <span className="font-mono">{r._neural_bias_reason_codes.join(", ")}</span></div> : null}
                  </div>
                ) : null}
              </div>
            )}

            {renderAccordionSection(
              "coachMessage",
              "Coach message",
              coachMessageSummary,
              <div className="space-y-3">
                <textarea
                  className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-800"
                  rows={3}
                  value={draftMessage[pid] ?? ""}
                  onChange={(e) => setDraftMessage((p) => ({ ...p, [pid]: e.target.value }))}
                  disabled={isSaving || (r.is_locked && !isAdmin)}
                  placeholder="Skrifaðu coach skilaboð…"
                />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  Save = confirmed (editable). Lock = endanlegt fyrir daginn. Auto-lock: {AUTO_LOCK_MINUTES_BEFORE} mín fyrir session start.
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
      <CoachHubCards weeklyOutlook={weeklyPerformanceOutlook} />

      {/* Today Command Center */}
      <Card className={summaryCardClass}>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold uppercase tracking-[0.18em] text-slate-900">Today Command Center</CardTitle>
              <CardDescription className="mt-1 text-sm text-slate-500">Today&apos;s coaching decision summary</CardDescription>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div className="font-medium text-slate-700">Auto-lock: {AUTO_LOCK_MINUTES_BEFORE} min before session start</div>
              <div>Coach {coachDisplayName ?? "—"} · MD {mdDayToday}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const risk = computeTeamRisk(teamSignal);
            const ui = riskUi(risk.level);
            const leadingAction = dominantTeamAction(teamSignal);
            const fatigueSummary = (fatigueSnapshot as { teamFatigueSummary?: { dominantType?: string } } | null)
              ?.teamFatigueSummary;
            const fatigueDominant = String(fatigueSummary?.dominantType ?? "—");
            const neuralState = String(teamNeuralSummary?.dominantState ?? "—");
            const nextDayRisk = String(teamNeuralSummary?.nextDayRiskSummary ?? "—");
            const rec = summaryLines(teamIntel?.recommendation ?? risk.recommendation, 1)[0] ?? "—";
            const totalPlayers = teamSignal?.n_players ?? 0;
            const nFull = teamSignal?.n_full ?? 0;
            const nReduced = teamSignal?.n_reduced ?? 0;
            const nRecovery = teamSignal?.n_recovery ?? 0;
            const commandTiles = [
              { label: "Risk level", value: risk.label, tone: "border-slate-200 bg-white" },
              { label: "Team action", value: leadingAction, tone: "border-slate-200 bg-white" },
              { label: "Needs review", value: String(needsReviewCount), tone: "border-slate-200 bg-white" },
              { label: "Total players", value: String(totalPlayers), tone: "border-slate-200 bg-white" },
            ];
            const statusTiles = [
              { label: "Full", value: String(nFull), sub: "Availability", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
              { label: "Reduced", value: String(nReduced), sub: "Modified", tone: "border-amber-200 bg-amber-50 text-amber-800" },
              { label: "Recovery", value: String(nRecovery), sub: "Protected", tone: "border-rose-200 bg-rose-50 text-rose-800" },
              { label: "Dominant fatigue", value: fatigueDominant, sub: "Team signal", tone: "border-slate-200 bg-slate-50 text-slate-800" },
              { label: "Neural load", value: neuralState, sub: "Current state", tone: "border-slate-200 bg-slate-50 text-slate-800" },
              { label: "Next-day risk", value: nextDayRisk, sub: "Forecast", tone: "border-slate-200 bg-slate-50 text-slate-800" },
            ];

            return (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${ui.pill}`}>{risk.label}</div>
                  <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${dayStateInfo.badge}`}>
                      Diagnostic: {dayStateInfo.label}
                  </div>
                  <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    Team outlook: {teamOutlook.band}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {commandTiles.map((tile) => (
                    <div key={tile.label} className={`${summaryTileClass} ${tile.tone}`}>
                      <div className={statLabelClass}>{tile.label}</div>
                      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{tile.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  {statusTiles.map((tile) => (
                    <div key={tile.label} className={`${compactTileClass} ${tile.tone}`}>
                      <div className="text-[10px] uppercase tracking-wide opacity-80">{tile.label}</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums">{tile.value}</div>
                      <div className="mt-1 text-xs opacity-75">{tile.sub}</div>
                    </div>
                  ))}
                </div>

                <div className={`rounded-2xl border p-4 text-sm ${ui.pill}`}>
                  <div className="text-[10px] uppercase tracking-wide opacity-80">Coach recommendation</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">{rec}</div>
                  <div className="mt-2 text-xs text-slate-600">
                    Day state diagnostic: <span className="font-medium text-slate-700">{dayStateInfo.state}</span> · {dayStateInfo.reason}
                  </div>
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      <Card className={`h-full border ${tm.border} shadow-sm`}>
        <CardHeader className={`${tm.bg}`}>
          <CardTitle className={`${sectionTitleClass} ${tm.text}`}>Performance Intelligence — Team</CardTitle>
          <CardDescription className={`${sectionSubtitleClass} ${tm.text}`}>
            Status: <span className="font-semibold">{teamIntel?.team_status ?? "—"}</span> · Baseline:{" "}
            <span className="font-semibold">{teamIntel?.baseline_maturity ?? "—"}</span> · Players:{" "}
            <span className="font-semibold">{teamIntel?.n_players ?? "—"}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!teamIntel ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{teamIntelEmptyMessage}</div>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-12">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm lg:col-span-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Volatility</div>
                  <div className="mt-3 text-3xl font-semibold tabular-nums text-emerald-950">{teamIntel.volatility_pct ?? 0}%</div>
                  <div className="mt-2 text-sm text-emerald-800">volatile players: <span className="font-semibold">{teamIntel.n_volatile ?? 0}</span></div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm lg:col-span-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700">Readiness mix</div>
                  <div className="mt-3 text-2xl font-semibold text-amber-950 tabular-nums">
                    {teamIntel.pct_red ?? 0}% / {teamIntel.pct_yellow ?? 0}% / {(teamIntel.pct_green ?? 0) + (teamIntel.pct_green_plus ?? 0)}%
                  </div>
                  <div className="mt-1 text-xs text-amber-700">RED / YELLOW / GREEN(+)</div>
                  <div className="mt-2 text-sm text-amber-800 tabular-nums">
                    n: {teamIntel.n_red ?? 0} / {teamIntel.n_yellow ?? 0} / {(teamIntel.n_green ?? 0) + (teamIntel.n_green_plus ?? 0)}
                  </div>
                </div>

                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm lg:col-span-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-rose-700">Status snapshot</div>
                  <div className="mt-3 text-2xl font-semibold text-rose-950">{teamIntel.team_status ?? "—"}</div>
                  <div className="mt-2 text-sm text-rose-800">
                    baseline: <span className="font-semibold">{teamIntel.baseline_maturity ?? "—"}</span> · players:{" "}
                    <span className="font-semibold">{teamIntel.n_players ?? "—"}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Team summary</div>
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <span className="text-slate-500">Avg risk</span>
                      <span className="font-semibold tabular-nums text-slate-900">{teamPerformanceIntelligence.averageRiskScore.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <span className="text-slate-500">Avg performance</span>
                      <span className="font-semibold tabular-nums text-slate-900">{teamPerformanceIntelligence.averagePerformanceScore.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">High / critical risk</span>
                      <span className="font-semibold text-slate-900">
                        {(teamPerformanceIntelligence.injuryRiskCounts.HIGH ?? 0) +
                          (teamPerformanceIntelligence.injuryRiskCounts.CRITICAL ?? 0)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {teamPerformanceIntelligence.teamSummaryText}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Monitoring pattern</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Risk bands</span>
                      <span className="text-right font-semibold text-slate-900">
                        Low {teamPerformanceIntelligence.injuryRiskCounts.LOW ?? 0} · Mod {teamPerformanceIntelligence.injuryRiskCounts.MODERATE ?? 0} · High {teamPerformanceIntelligence.injuryRiskCounts.HIGH ?? 0} · Critical {teamPerformanceIntelligence.injuryRiskCounts.CRITICAL ?? 0}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Recovery recommended</span>
                      <span className="font-semibold text-slate-900">{teamPerformanceIntelligence.loadToleranceCounts.RECOVERY_ONLY ?? 0}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Neural + volatility</span>
                      <span className="text-right font-semibold text-slate-900">
                        {teamNeuralVolatilitySummary.unstablePlayers.length} unstable · {teamNeuralVolatilitySummary.collapseWatchPlayers.length} collapse watch · {teamNeuralVolatilitySummary.peakWindowPlayers.length} peak window
                      </span>
                    </div>
                  </div>
                  <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                    <li>{teamNeuralVolatilitySummary.summaryText}</li>
                    <li>{teamPrescriptionSummary.summaryText}</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Session recommendation</div>
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                      <span className="text-slate-500">Prescription</span>
                      <span className="text-right font-semibold text-slate-900">
                        {teamPrescriptionSummary.fullCount} full · {teamPrescriptionSummary.modifiedCount} modified · {teamPrescriptionSummary.recoveryCount} recovery · {teamPrescriptionSummary.holdCount} hold
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Protect for match</span>
                      <span className="text-right font-semibold text-slate-900">
                        {teamPrescriptionSummary.protectForMatchCount} · Limited exposure {teamPrescriptionSummary.limitedExposureCount}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {summaryLines(teamIntel.recommendation, 3).length ? (
                      summaryLines(teamIntel.recommendation, 3).map((line, idx) => <div key={`perf-ti-rec-${idx}`}>{line}</div>)
                    ) : (
                      <div>—</div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Rules / overrides</div>
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <span className="text-slate-500">Adjusted players</span>
                      <span className="font-semibold text-slate-900">{teamRulesSummary.overriddenPlayersCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <span className="text-slate-500">Review required</span>
                      <span className="font-semibold text-slate-900">{teamRulesSummary.reviewRequiredCount}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Protected players</span>
                      <span className="font-semibold text-slate-900">{teamRulesSummary.protectedPlayersCount}</span>
                    </div>
                  </div>
                  <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                    <li>{teamRulesSummary.summaryText}</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Drafts / workflow</div>
                <div className="mt-4">
                  <TeamSessionBuildSummaryCard summary={teamSessionBuildSummary} />
                  <div className="mt-2 text-[11px]">
                    <Link href="/coach/session-workflow" className="font-medium text-slate-700 underline underline-offset-2">
                      Open Session Workflow
                    </Link>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className={`flex items-end justify-between gap-3 px-3 py-2 ${softSurfaceClass}`}>
          <div>
            <div className={sectionTitleClass}>Supporting team intelligence</div>
            <div className={sectionSubtitleClass}>Performance context and team-level monitoring beneath the command summary.</div>
            <div className="mt-1 text-xs text-slate-600">
              Team outlook: <span className="font-semibold text-slate-800">{teamOutlook.band}</span>
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Level 2</div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className={summaryCardClass}>
            <CardHeader className="pb-3">
              <CardTitle className={sectionTitleClass}>Team Intelligence</CardTitle>
              <CardDescription className={sectionSubtitleClass}>High-level team monitoring summary.</CardDescription>
            </CardHeader>
            <CardContent>
              {!teamIntel ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{teamIntelEmptyMessage}</div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white">
                  {[
                    ["Status", teamIntel.team_status ?? "—"],
                    ["Baseline maturity", teamIntel.baseline_maturity ?? "—"],
                    ["Players", String(teamIntel.n_players ?? "—")],
                    ["Volatility", `${teamIntel.volatility_pct ?? 0}%`],
                    ["Volatile players", String(teamIntel.n_volatile ?? 0)],
                    ["Low baseline", String(teamIntel.n_low_baseline ?? 0)],
                    ["Avg risk", teamPerformanceIntelligence.averageRiskScore.toFixed(1)],
                    ["Avg performance", teamPerformanceIntelligence.averagePerformanceScore.toFixed(1)],
                    ["Neural volatility", teamNeuralVolatilitySummary.summaryText],
                    ["Prescription", teamPrescriptionSummary.summaryText],
                    ["Rules / override", teamRulesSummary.summaryText],
                  ].map(([label, value], idx, rows) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between gap-4 px-4 py-3 ${idx < rows.length - 1 ? "border-b border-slate-200" : ""}`}
                    >
                      <div className="text-sm text-slate-500">{label}</div>
                      <div className="text-right text-sm font-semibold text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={summaryCardClass}>
            <CardHeader className="pb-3">
              <CardTitle className={sectionTitleClass}>Readiness Mix</CardTitle>
              <CardDescription className={sectionSubtitleClass}>Current team state distribution and risk map.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!teamIntel ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{queueEmptyMessage}</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-rose-700">Red</div>
                      <div className="mt-1 text-xl font-semibold tabular-nums text-rose-800">{teamIntel.pct_red ?? 0}%</div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-amber-700">Yellow</div>
                      <div className="mt-1 text-xl font-semibold tabular-nums text-amber-800">{teamIntel.pct_yellow ?? 0}%</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-emerald-700">Green</div>
                      <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-800">{(teamIntel.pct_green ?? 0) + (teamIntel.pct_green_plus ?? 0)}%</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="h-4 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                      <div className="flex h-full w-full">
                        <div className="bg-rose-400/70" style={{ width: `${teamIntel.pct_red ?? 0}%` }} />
                        <div className="bg-amber-400/70" style={{ width: `${teamIntel.pct_yellow ?? 0}%` }} />
                        <div className="bg-emerald-400/70" style={{ width: `${(teamIntel.pct_green ?? 0) + (teamIntel.pct_green_plus ?? 0)}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>n: {teamIntel.n_red ?? 0}</span>
                      <span>n: {teamIntel.n_yellow ?? 0}</span>
                      <span>n: {(teamIntel.n_green ?? 0) + (teamIntel.n_green_plus ?? 0)}</span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="text-sm font-semibold text-slate-900">Team Risk Map</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-emerald-700">Low Risk</div>
                        <div className="mt-1 text-xl font-semibold text-emerald-800">{teamPerformanceIntelligence.injuryRiskCounts.LOW ?? 0}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-amber-700">Moderate</div>
                        <div className="mt-1 text-xl font-semibold text-amber-800">{teamPerformanceIntelligence.injuryRiskCounts.MODERATE ?? 0}</div>
                      </div>
                      <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-orange-700">High Risk</div>
                        <div className="mt-1 text-xl font-semibold text-orange-800">{teamPerformanceIntelligence.injuryRiskCounts.HIGH ?? 0}</div>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-rose-700">Critical</div>
                        <div className="mt-1 text-xl font-semibold text-rose-800">{teamPerformanceIntelligence.injuryRiskCounts.CRITICAL ?? 0}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3">
          <SessionRpeMonitoringCard teamId={coachTeamId} />
          <DailyInternalLoadCard teamId={coachTeamId} />
          <LoadMetricsCard teamId={coachTeamId} />
        </div>

        <div>
          <Card className="h-full border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className={sectionTitleClass}>Check-in reminders</CardTitle>
              <CardDescription className={sectionSubtitleClass}>Status for today and manual reminder trigger for players missing check-in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className={statLabelClass}>Total players</div>
                  <div className={statValueClass}>{reminderStatus?.totalPlayers ?? "—"}</div>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-green-700">Checked in</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-green-700">{reminderStatus?.checkedIn ?? "—"}</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-amber-700">Missing check-ins</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-amber-700">{reminderStatus?.missing ?? "—"}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => sendManualReminder(today)} disabled={manualReminderSending || reminderStatusLoading}>
                  {manualReminderSending ? "Sending..." : "Send reminder to missing players"}
                </Button>
                <Button variant="outline" onClick={() => loadReminderStatus(today)} disabled={manualReminderSending || reminderStatusLoading}>
                  {reminderStatusLoading ? "Loading..." : "Refresh status"}
                </Button>
                <div className="text-xs text-gray-500">
                  Last manual send:{" "}
                  <span className="font-medium text-gray-700">
                    {reminderStatus?.lastManualSendAt ? new Date(reminderStatus.lastManualSendAt).toLocaleString() : "—"}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Compliance diagnostic:</span> {complianceMessage}
              </div>

              {reminderStatusError ? <div className="text-xs text-rose-700">{reminderStatusError}</div> : null}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Yesterday Load + local MicroPulse preview */}
      <Card className="shadow-sm border-2 border-black/5">
        <CardHeader>
          <CardTitle className="text-base">Yesterday Load (Coach input)</CardTitle>
          <CardDescription>
            Settu inn álag frá gær (lið) til að bæta context. Þetta breytir engu í Stage4 — þetta er bara input + local preview.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {!coachTeamId ? (
            <div className="text-sm text-muted-foreground">Vantar team_id (profile).</div>
          ) : (
            <>
              {(() => {
                const isOff = ctxIntensity === "OFF";
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-sm mb-1">HSR (m)</div>
                      <Input value={ctxHsr} onChange={(e) => setCtxHsr(e.target.value)} placeholder="t.d. 800" disabled={isOff} />
                    </div>
                    <div>
                      <div className="text-sm mb-1">Acc total</div>
                      <Input value={ctxAcc} onChange={(e) => setCtxAcc(e.target.value)} placeholder="t.d. 55" disabled={isOff} />
                    </div>
                    <div>
                      <div className="text-sm mb-1">Dec total</div>
                      <Input value={ctxDec} onChange={(e) => setCtxDec(e.target.value)} placeholder="t.d. 60" disabled={isOff} />
                    </div>
                    <div>
                      <div className="text-sm mb-1">Distance (m)</div>
                      <Input value={ctxDist} onChange={(e) => setCtxDist(e.target.value)} placeholder="t.d. 8400" disabled={isOff} />
                    </div>

                    <div>
                      <div className="text-sm mb-1">Max vel (%)</div>
                      <Input value={ctxVmax} onChange={(e) => setCtxVmax(e.target.value)} placeholder="t.d. 92" disabled={isOff} />
                    </div>
                    <div>
                      <div className="text-sm mb-1">Duration (min)</div>
                      <Input value={ctxDuration} onChange={(e) => setCtxDuration(e.target.value)} placeholder="t.d. 75" disabled={isOff} />
                    </div>
                    <div>
                      <div className="text-sm mb-1">Intensity (fallback)</div>
                      <select className="w-full h-10 border rounded-md px-3 text-sm" value={ctxIntensity} onChange={(e) => setCtxIntensity(e.target.value as any)}>
                        <option value="">—</option>
                        <option value="OFF">OFF</option>
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    </div>
                  </div>
                );
              })()}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    const entryDate = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" }) || todayISO();
                    saveYesterdayContext(coachTeamId, entryDate);
                  }}
                  disabled={ctxSaving}
                >
                  {ctxSaving ? "Saving..." : "Save yesterday load"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    const entryDate = new Date().toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" }) || todayISO();
                    loadYesterdayContext(coachTeamId, entryDate);
                  }}
                  disabled={ctxSaving}
                >
                  Reload
                </Button>

                <Button
                  onClick={async () => {
                    console.log("Compute clicked", {
                      localDecisionLoading,
                      rowsLength: rows.length,
                      ctxIntensity,
                      ctxHsr,
                      ctxAcc,
                      ctxDec,
                      ctxDist,
                      ctxVmax,
                      ctxDuration,
                      hasEngine: !!computeTeamDecision,
                      engineType: typeof computeTeamDecision,
                    });
                    await computeLocalTeamDecisionPreview();
                  }}
                  disabled={localDecisionLoading || rows.length === 0}
                  className="ml-auto"
                >
                  {localDecisionLoading ? "Computing…" : "Compute MicroPulse (preview)"}
                </Button>
              </div>

              {localDecisionError ? <div className="text-sm text-red-600">{localDecisionError}</div> : null}

              {localDecision ? (
                <div className="rounded-md border bg-white p-3 text-sm">
                  <div className="font-semibold">
                    MicroPulse preview: <span className="ml-2">{localDecision.team_action}</span>
                    <span className="ml-3 text-muted-foreground">(score: {localDecision.decision_score})</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">Reasons: {(localDecision.reasons ?? []).join(", ") || "—"}</div>
                  {!!localDecision?.neural_bias_applied ? (
                    <div className="mt-1 text-muted-foreground">
                      Neural bias applied: yes
                      {Array.isArray(localDecision?.neural_bias_reason_codes) && localDecision.neural_bias_reason_codes.length
                        ? ` · ${formatNeuralBiasReasons(localDecision.neural_bias_reason_codes, 3)}`
                        : ""}
                    </div>
                  ) : null}
                  <div className="mt-2 text-muted-foreground">Exceptions (preview): {(localDecision.exceptions ?? []).length}</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Tip: Fylltu inn load og ýttu á “Compute MicroPulse (preview)”. Þetta breytir engu í Stage4—bara preview.</div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Readiness Today */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Readiness Today</CardTitle>
          <CardDescription>
            Coach: <span className="font-medium">{coachDisplayName ?? coachName ?? "—"}</span> · Date: <span className="font-medium">{today}</span> · MD-day:{" "}
            <span className="font-medium">{mdDayToday}</span> · Source: <span className="font-medium">{planPreview?.source ?? "—"}</span> · Confidence:{" "}
            <span className="font-medium">{formatConfidence(planPreview?.confidence)}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {teamSignal
            ? (() => {
                const risk = computeTeamRisk(teamSignal);
                const ui = riskUi(risk.level);
                const recLines = summaryLines(risk.recommendation, 3);
                return (
                  <div className={`rounded-xl border ${ui.border} bg-white p-4 shadow-sm space-y-3`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${ui.pill}`}>{risk.label}</div>
                      <div className="text-xs text-gray-500">
                        Auto-lock: {AUTO_LOCK_MINUTES_BEFORE}m before session ({String(DEFAULT_SESSION_START.hour).padStart(2, "0")}:
                        {String(DEFAULT_SESSION_START.minute).padStart(2, "0")})
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6 text-sm">
                      <div className="rounded-lg border bg-gray-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">Total</div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">{teamSignal.n_players}</div>
                      </div>
                      <div className="rounded-lg border bg-green-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-green-700">Full</div>
                        <div className="mt-1 text-lg font-semibold tabular-nums text-green-700">{teamSignal.n_full}</div>
                      </div>
                      <div className="rounded-lg border bg-yellow-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-yellow-700">Reduced</div>
                        <div className="mt-1 text-lg font-semibold tabular-nums text-yellow-700">{teamSignal.n_reduced}</div>
                      </div>
                      <div className="rounded-lg border bg-red-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-red-700">Recovery</div>
                        <div className="mt-1 text-lg font-semibold tabular-nums text-red-700">{teamSignal.n_recovery}</div>
                      </div>
                      <div className="rounded-lg border bg-gray-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">Avg confidence</div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">{teamSignal.avg_confidence ?? "-"}</div>
                      </div>
                      <div className="rounded-lg border bg-gray-50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">Needs review</div>
                        <div className="mt-1 text-lg font-semibold tabular-nums">{needsReviewCount}</div>
                      </div>
                    </div>

                    <div className={`grid gap-2 md:grid-cols-2 text-xs ${ui.text}`}>
                      <div className="rounded-lg border bg-white p-3">
                        <div className="font-semibold text-gray-700">Why</div>
                        <div className="mt-1">{risk.why}</div>
                      </div>
                      <div className="rounded-lg border bg-white p-3">
                        <div className="font-semibold text-gray-700">Team plan</div>
                        <div className="mt-1 space-y-1">
                          {recLines.length ? (
                            recLines.map((line, idx) => (
                              <div key={`rec-${idx}`} className="leading-relaxed">
                                {line}
                              </div>
                            ))
                          ) : (
                            <div>{risk.recommendation}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            : null}

          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-3 rounded-xl border bg-gray-50/40 p-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="text-sm font-semibold">Team intelligence</div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Executive signals</div>
                </div>

                <div className="grid gap-3 lg:grid-cols-1">
                  {(fatigueSnapshot as any)?.teamFatigueSummary ? (
                    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-end justify-between gap-3">
                        <div className="text-sm font-semibold">Team Fatigue</div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">Executive summary</div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border bg-gray-50 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">Dominant pattern</div>
                          <div className="mt-1 text-lg font-semibold">
                            {String((fatigueSnapshot as any).teamFatigueSummary.dominantType ?? "—")}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-gray-50 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">High severity count</div>
                          <div className="mt-1 text-lg font-semibold tabular-nums">
                            {(fatigueSnapshot as any).teamFatigueSummary.highSeverityCount ??
                              (fatigueSnapshot as any).teamFatigueSummary.highCount ??
                              0}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600">
                        {(fatigueSnapshot as any).teamFatigueSummary.summaryText ?? "No dominant fatigue pattern today."}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
                      <div className="flex items-end justify-between gap-3">
                        <div className="text-sm font-semibold">Team Fatigue</div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">Diagnostic empty state</div>
                      </div>
                      <div className="text-xs text-gray-600">
                        {dayStateInfo.state === "MISSING_INPUT"
                          ? "Fatigue summary is limited because expected check-ins are missing."
                          : dayStateInfo.state === "OFF_DAY"
                          ? "OFF day detected; fatigue summary is intentionally low-priority."
                          : dayStateInfo.state === "NO_INPUT_EXPECTED"
                          ? "No input expected for this day context."
                          : "No team fatigue summary available yet."}
                      </div>
                    </div>
                  )}

                  {teamNeuralSummary ? (
                    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-end justify-between gap-3">
                        <div className="text-sm font-semibold">Team Neural Load</div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">Prediction summary</div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border bg-gray-50 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">Dominant state</div>
                          <div className="mt-1 text-lg font-semibold">{teamNeuralSummary.dominantState}</div>
                        </div>
                        <div className="rounded-lg border bg-gray-50 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">Trajectory</div>
                          <div className="mt-1 text-lg font-semibold">{teamNeuralSummary.trajectorySummary}</div>
                        </div>
                        <div className="rounded-lg border bg-gray-50 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">Next-day risk</div>
                          <div className="mt-1 text-lg font-semibold">{teamNeuralSummary.nextDayRiskSummary}</div>
                        </div>
                        <div className="rounded-lg border bg-gray-50 p-3">
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">High-risk count</div>
                          <div className="mt-1 text-lg font-semibold tabular-nums">{teamNeuralSummary.highRiskCount}</div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600">{teamNeuralSummary.summaryText}</div>
                      {!!(fatigueSnapshot as any)?.neural_bias_applied ? (
                        <div className="text-xs text-gray-700">
                          <span className="font-semibold">Neural bias applied.</span>{" "}
                          <span className="text-gray-600">
                            Why: {formatNeuralBiasReasons((fatigueSnapshot as any)?.neural_bias_reason_codes, 3) || "Neural load/risk threshold nudge."}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
                      <div className="flex items-end justify-between gap-3">
                        <div className="text-sm font-semibold">Team Neural Load</div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">Diagnostic empty state</div>
                      </div>
                      <div className="text-xs text-gray-600">
                        {dayStateInfo.state === "MISSING_INPUT"
                          ? "Neural load summary is incomplete because expected inputs are missing."
                          : dayStateInfo.state === "OFF_DAY"
                          ? "OFF day detected; neural load monitoring is informational only."
                          : dayStateInfo.state === "NO_INPUT_EXPECTED"
                          ? "No neural input expected for this day context."
                          : "No team neural summary available yet."}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {unitAlerts?.length > 0 && (
                <div className="rounded-xl border bg-white p-4">
                  <div className="text-sm font-semibold">Unit alerts</div>

                  <div className="mt-3 grid gap-2">
                    {unitAlerts
                      .filter((u) => u.unit !== "unknown")
                      .map((u) => (
                        <div key={`${u.unit}-${u.sport}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
                          <div className="font-medium">
                            {u.unit_label} <span className="text-slate-500">({u.sport})</span>
                          </div>

                          <div className="text-slate-700">
                            {u.n_recovery + u.n_reduced}/{u.n_players} affected ({u.affected_pct}%)
                          </div>

                          <div
                            className={[
                              "rounded-full border px-2 py-0.5 font-semibold",
                              u.alert_level === "HIGH"
                                ? "border-red-200 bg-red-50 text-red-800"
                                : u.alert_level === "CAUTION"
                                ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                                : "border-green-200 bg-green-50 text-green-800",
                            ].join(" ")}
                          >
                            {u.alert_level}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="pt-1">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Dev diagnostics · Level 3</div>
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 shadow-sm space-y-3">
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
            </div>

            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <div className={sectionTitleClass}>Players needing review today</div>
                    <div className={sectionSubtitleClass}>{needsReviewCount} players flagged by the system</div>
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Operational workspace · scan · decide · confirm</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500">Review context</div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-400">Today only</div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <div className={statLabelClass}>Needs review</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{needsReviewCount}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <div className={statLabelClass}>Neural bias</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{reviewContextStats.neuralBiasApplied}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <div className={statLabelClass}>High next-day risk</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{reviewContextStats.highNextDayRisk}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <div className={statLabelClass}>Locked cards</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{reviewContextStats.lockedRows}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-gray-50 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Players flagged today</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <div className={statLabelClass}>High neural load</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{flaggedReviewStats.highNeuralLoad}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <div className={statLabelClass}>Low readiness</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{flaggedReviewStats.lowReadiness}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <div className={statLabelClass}>Pain flag</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{flaggedReviewStats.painFlag}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-2">
                      <div className={statLabelClass}>Manual review</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums">{flaggedReviewStats.manualReview}</div>
                    </div>
                  </div>
                </div>

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

                        <Button onClick={generateTodayDecisionsForTeam} disabled={genLoading || loading}>
                          {genLoading ? "Generating…" : "Generate Today Decisions"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={downloadReadinessRiskReport}
                          disabled={pdfDownloading || loading}
                        >
                          {pdfDownloading ? "Generating PDF…" : "Download Readiness Risk Report"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {error ? <div className="text-sm text-red-600">{error}</div> : null}
              {genToast ? <div className="text-sm text-green-700">{genToast}</div> : null}

              {rows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">{queueEmptyMessage}</div>
              ) : (
                <div className="mt-3 rounded-xl border border-slate-200 bg-gray-50/40 p-3 md:p-4 space-y-4">{rowsWithSessionDraft.map((r) => renderRow(r))}</div>
              )}

              {/* Simple paging */}
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

              <details className="rounded-xl border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">Team Risk Map</summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
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
              </details>

              <details className="rounded-xl border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">Weekly Performance Intelligence</summary>
                <div className="mt-2 space-y-2 text-xs text-slate-700">
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
              </details>

              <PerformanceIntelligencePanel
                teamOutlook={teamOutlook}
                weeklyReport={weeklyRiskReport}
                riskMap={teamRiskMap}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
