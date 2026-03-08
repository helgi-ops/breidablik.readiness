"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import computeTeamDecision from "@/lib/decision/engine";
import { classifyNeuralLoad } from "@/lib/neuralLoad/classify";
import { buildTeamNeuralLoadSummary } from "@/lib/neuralLoad/teamSummary";
import { runNeuralLoadValidationSuite } from "@/lib/neuralLoad/validation";
import type { NeuralLoadClassification } from "@/lib/neuralLoad/types";

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SessionRpeMonitoringCard from "@/components/coach/SessionRpeMonitoringCard";
import DailyInternalLoadCard from "@/components/coach/DailyInternalLoadCard";
import LoadMetricsCard from "@/components/coach/LoadMetricsCard";

/** -----------------------------
 * Types
 * ----------------------------- */
type TrainingAction = "FULL" | "REDUCED" | "RECOVERY";
type FinalColor = "red" | "yellow" | "green";
type FinalFlag = "RED" | "YELLOW" | "GREEN";
type Filter = "all" | FinalColor;

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

  if (soreness < 4 || !input.flag || !input.color) {
    return {
      final_flag: input.flag,
      final_color: input.color,
      final_reason: input.reason,
    };
  }

  const final_flag: FinalFlag = input.flag === "GREEN" ? "YELLOW" : input.flag === "YELLOW" ? "RED" : "RED";
  const final_color: FinalColor = input.color === "green" ? "yellow" : input.color === "yellow" ? "red" : "red";

  const final_reason =
    input.flag === "GREEN" ? "YELLOW: High soreness. Adjust load." : "RED: High soreness. Recovery/very light day.";

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

/** -----------------------------
 * Small UI components
 * ----------------------------- */
function CoachHubCards() {
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

  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [weekGrid, setWeekGrid] = useState<any[]>([]);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);

  const [coachName, setCoachName] = useState<string>("");
  const [coachDisplayName, setCoachDisplayName] = useState<string>("—");
  const [coachVerified, setCoachVerified] = useState(false);
  const [coachRole, setCoachRole] = useState<string>("coach");
  const [coachTeamId, setCoachTeamId] = useState<string | null>(null);

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

  // Z history
  const [zHistory, setZHistory] = useState<Record<string, number[]>>({});

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
    const t = todayISO();
    const row = (weekGrid ?? []).find((x: any) => String(x.day_date) === t) ?? null;
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
  function driverLabel(code: string): string {
    return String(code ?? "")
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
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

  async function loadWeekGrid(): Promise<any[]> {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return [];

      const { data: prof } = await supabase.from("profiles").select("team_id").eq("id", uid).maybeSingle();
      const teamId = (prof as any)?.team_id;
      if (!teamId) return [];

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
      return {};
    }

    const start = new Date(entryDate);
    start.setDate(start.getDate() - 7);
    const startISO = start.toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });

    try {
      const { data, error } = await supabase
        .from("readiness_entries")
        .select("player_id, entry_date, training_modifier")
        .in("player_id", playerIds)
        .gte("entry_date", startISO)
        .lte("entry_date", entryDate)
        .order("entry_date", { ascending: true });

      if (error) throw error;

      const map: Record<string, number[]> = {};
      for (const r of (data ?? []) as any[]) {
        const pid = String(r.player_id);
        const z = extractZ(r.training_modifier);
        if (z == null) continue;
        if (!map[pid]) map[pid] = [];
        map[pid].push(z);
      }

      setZHistory(map);
      return map;
    } catch (e) {
      console.warn("loadZHistoryForPlayers failed:", e);
      setZHistory({});
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
      const grid = await loadWeekGrid();

      // Auto-set OFF for yesterday (UI only)
      try {
        const y = new Date(entryDate);
        y.setDate(y.getDate() - 1);
        const yesterdayISO = y.toLocaleDateString("en-CA", { timeZone: "Atlantic/Reykjavik" });
        const yRow = (grid ?? []).find((x: any) => String(x.day_date) === String(yesterdayISO)) ?? null;
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
      const gridRowToday = (grid ?? []).find((x: any) => String(x.day_date) === String(entryDate)) ?? null;
      const teamMdDay =
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

        const plannedFocus = r.planned_focus ?? null;
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
          planned_day_type: r.planned_day_type ?? null,

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
        | { primaryFatigueType?: string; drivers?: string[]; reasonCodes?: string[] }
        | null
        | undefined;
      const fatigueType = String(fatigue?.primaryFatigueType ?? "").toUpperCase();
      const drivers = [...(fatigue?.drivers ?? []), ...(fatigue?.reasonCodes ?? [])].map((d) =>
        String(d).toUpperCase()
      );
      return fatigueType === "TISSUE" || drivers.includes("PAIN_FLAG");
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
            "rounded-full border px-3 py-1 text-xs font-semibold",
            disabled ? "opacity-50 cursor-not-allowed" : "",
            active ? "bg-black text-white border-black" : "bg-white text-gray-800 hover:bg-gray-50",
          ].join(" ")}
        >
          {label}
        </button>
      );
    };

    return (
      <div className="flex items-center gap-2">
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
    const stenText = typeof r._sten === "number" ? String(r._sten) : "—";

    const dzVal = typeof r._dz === "number" ? r._dz : null;
    const dzText = dzVal != null ? dzVal.toFixed(2) : "—";
    const dzColor =
      dzVal != null && dzVal <= -0.25 ? "text-red-600" : dzVal != null && dzVal >= 0.25 ? "text-green-600" : "text-gray-600";
    const dzIcon = dzVal != null && dzVal <= -0.25 ? "↓" : dzVal != null && dzVal >= 0.25 ? "↑" : "→";
    const dzAbsBig =
      "text-lg font-bold tracking-tight " +
      (dzColor?.includes("red") ? "text-red-700" : dzColor?.includes("amber") ? "text-amber-800" : "text-emerald-800");

    const mainReason = r.planned_focus || shortReason(r.final_reason) || "—";
    const fatigue = fatigueByPlayer.get(pid) ?? null;
    const fatigueType = String(fatigue?.primaryFatigueType ?? "NONE").toUpperCase();
    const fatigueSeverity = String(fatigue?.severity ?? "").toUpperCase();
    const fatigueDrivers = (fatigue?.drivers ?? fatigue?.reasonCodes ?? []) as string[];
    const adaptationSummary = r._adaptation_summary ?? formatAdaptationFallback(r._adaptation);
    const adaptationLines = adaptationDetailLines(r._adaptation);
    const neural = r._neural_load ?? null;
    const neuralBiasApplied = !!r._neural_bias_applied;
    const neuralBiasWhy = formatNeuralBiasReasons(r._neural_bias_reason_codes, 3);
    const selectedAction: TrainingAction =
      draftAction[pid] ?? (r.final_decision as TrainingAction | null) ?? flagToAction(r.final_flag);
    const callTone =
      selectedAction === "RECOVERY"
        ? "border-red-200 bg-red-50 text-red-800"
        : selectedAction === "REDUCED"
        ? "border-yellow-200 bg-yellow-50 text-yellow-800"
        : "border-green-200 bg-green-50 text-green-800";

    const whyParts: string[] = [];
    if (neural) whyParts.push(`Neural ${neural.neuralLoadState}`, neural.readinessTrajectory);
    if (fatigue && fatigueType !== "NONE") whyParts.push(`Fatigue ${fatigueType}`, fatigueSeverity || "");
    if (!whyParts.length) whyParts.push(mainReason);
    const whySummary = truncateLine(
      whyParts
        .filter((x) => String(x).trim().length > 0)
        .join(" · ")
        .replace(/\s·\s$/g, ""),
      82
    );

    const actionParts: string[] = [];
    const cleanedAdaptive = adaptationSummary ? String(adaptationSummary).replace(/^Adaptive:\s*/i, "") : "";
    if (cleanedAdaptive) actionParts.push(cleanedAdaptive);
    if (neuralBiasApplied) actionParts.push("Neural bias contributed");
    if (!actionParts.length) {
      actionParts.push(
        selectedAction === "RECOVERY"
          ? "Recovery-focused training"
          : selectedAction === "REDUCED"
          ? "Reduced load training"
          : "Standard training load"
      );
    }
    const actionSummary = truncateLine(actionParts.join(" · "), 82);

    return (
      <React.Fragment key={r.ui_key ?? r.readiness_entry_id ?? pid}>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md">
          {/* HEADER */}
          <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm md:text-base font-semibold max-w-[520px]">{r.full_name}</div>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${callTone}`}>
                  {selectedAction}
                </span>

                {r._needs_review ? (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">Needs review</span>
                ) : null}

                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${cm.pill}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${cm.dot}`} />
                  <span className="tabular-nums">{scoreText}</span>
                </span>

                <span className="inline-flex items-center rounded-full border bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-800">{mdText}</span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {r.is_locked ? (
                  <span className="inline-flex items-center rounded-full border bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                    Locked
                  </span>
                ) : null}

                {isOverride ? (
                  <span className="inline-flex items-center rounded-full border bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    Override
                  </span>
                ) : null}
                {neuralBiasApplied ? (
                  <span className="inline-flex items-center rounded-full border bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                    Neural bias
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 md:items-end">
              <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
                {renderActionPills(pid, r.is_locked)}
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
                <select
                  className="h-9 w-44 rounded-md border px-2 py-1 text-sm"
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
                  className="h-9 rounded-md border px-3 text-sm disabled:opacity-50"
                  title={lockedForCoach ? "Locked fyrir daginn" : "Save (editable)"}
                >
                  {lockedForCoach ? "Locked" : isSaving ? "Saving..." : saved[pid] ? "Saved" : "Save"}
                </button>

                {!r.is_locked ? (
                  <button
                    onClick={async () => lockForDay(r)}
                    disabled={isSaving}
                    className="h-9 rounded-md border px-3 text-sm disabled:opacity-50"
                    title="Lock (endanlegt fyrir daginn)"
                  >
                    Lock
                  </button>
                ) : isAdmin ? (
                  <button
                    onClick={async () => unlockForDay(r)}
                    disabled={isSaving}
                    className="h-9 rounded-md border px-3 text-sm disabled:opacity-50"
                    title="Admin: Unlock"
                  >
                    Unlock
                  </button>
                ) : null}

                <button
                  type="button"
                  className="h-9 w-9 rounded-md border text-gray-600 hover:bg-gray-50"
                  aria-label="Sýna nánar"
                  onClick={() => setExpandedPlayerId((prev) => (prev === pid ? null : pid))}
                >
                  {isOpen ? "▴" : "▾"}
                </button>
              </div>
            </div>
          </div>

          {/* SUMMARY: WHY + ACTION */}
          <div className="mt-2.5 grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border bg-gray-50/70 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Why</div>
              <div className="mt-0.5 truncate text-sm text-gray-800" title={whySummary}>
                {whySummary}
              </div>
            </div>

            <div className="rounded-lg border bg-gray-50/70 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Action</div>
              <div className="mt-0.5 truncate text-sm text-gray-800" title={actionSummary}>
                {actionSummary}
              </div>
            </div>
          </div>

          {/* METRICS: STEN + ΔZ + spark */}
          <div className="mt-2 flex flex-col gap-2.5">
            <div className="inline-flex w-fit items-center gap-4 rounded-md border bg-gray-50 px-3 py-2">
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-gray-500">STEN</div>
                <div className="text-sm font-semibold tabular-nums text-gray-900" title={`z=${zText}`}>
                  {stenText}
                </div>
              </div>

              <div className={`inline-flex items-center gap-2 ${dzColor}`} title={`Δz (today - yesterday). z=${zText}`}>
                <span className={dzAbsBig}>{dzIcon}</span>
                <span className={`${dzAbsBig} tabular-nums`}>{dzText}</span>
              </div>

              {r._spark ? (
                <div className="ml-2 font-mono text-xs text-gray-500" title="Last ~7 days Z">
                  {r._spark}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {isOpen && (
          <div className="mt-2 rounded-lg border bg-gray-50 px-3 py-3 text-sm text-gray-700 space-y-4">
            <div className="space-y-2 border-b border-gray-200 pb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Readiness</div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                ⚡ Fatigue/Energy: <span className="font-medium tabular-nums">{v(r.fatigue_energy)}</span>
              </div>
              <div>
                😴 Sleep quality: <span className="font-medium tabular-nums">{v(r.sleep_quality)}</span>
              </div>
              <div>
                ⏱ Sleep duration: <span className="font-medium tabular-nums">{v(r.sleep_duration)}</span>
              </div>
              <div>
                🧠 Stress/Mood: <span className="font-medium tabular-nums">{v(r.stress_mood)}</span>
              </div>
              <div>
                💪 Muscle soreness: <span className="font-medium tabular-nums">{v(r.muscle_soreness)}</span>
              </div>
              <div className="min-w-[220px]">
                📝 Notes: <span className="font-medium">{r.notes && r.notes.trim().length ? r.notes : "—"}</span>
              </div>
              <div>
                Skráð:{" "}
                <span className="font-medium">
                  {new Date(r.created_at).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div>
                Baseline n: <span className="font-mono">{r._baseline_n ?? "—"}</span>
              </div>
              <div>
                z: <span className="font-mono">{zText}</span>
              </div>
            </div>
            </div>

            <div className="space-y-2 border-b border-gray-200 pb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Coach message (Stage4)</div>
              <textarea
                className="w-full rounded-md border bg-white p-2 text-sm"
                rows={2}
                value={draftMessage[pid] ?? ""}
                onChange={(e) => setDraftMessage((p) => ({ ...p, [pid]: e.target.value }))}
                disabled={isSaving || (r.is_locked && !isAdmin)}
                placeholder="Skrifaðu coach skilaboð…"
              />
              <div className="text-xs text-gray-500">
                Save = confirmed (editable). Lock = endanlegt fyrir daginn. Auto-lock: {AUTO_LOCK_MINUTES_BEFORE} mín fyrir session start.
              </div>
            </div>

            <div className="text-xs text-gray-600 border-b border-gray-200 pb-3">
              <div>
                Auto reason: <span className="font-mono">{r.final_reason ?? "—"}</span>
              </div>
            </div>

            {fatigue ? (
              <div className="text-xs text-gray-600 space-y-1 border-b border-gray-200 pb-3">
                <div className="font-semibold uppercase tracking-wide text-gray-700">Fatigue</div>
                <div>
                  Type: <span className="font-mono">{fatigueType}</span>
                  {fatigueSeverity ? (
                    <>
                      {" "}
                      · Severity: <span className="font-mono">{fatigueSeverity}</span>
                    </>
                  ) : null}
                </div>
                {!!fatigueDrivers?.length ? (
                  <div>
                    Drivers: <span className="font-mono">{fatigueDrivers.slice(0, 6).map(driverLabel).join(", ")}</span>
                  </div>
                ) : null}
                {!!fatigue?.recommendedModifiers?.length ? (
                  <div>
                    Modifiers: <span className="font-mono">{fatigue.recommendedModifiers.join(", ")}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(r._adaptation_summary || adaptationLines.length > 0) && (
              <div className="text-xs text-gray-600 space-y-1 border-b border-gray-200 pb-3">
                <div className="font-semibold uppercase tracking-wide text-gray-700">Adaptation</div>
                {r._adaptation_summary ? (
                  <div>
                    Summary: <span className="font-mono">{r._adaptation_summary}</span>
                  </div>
                ) : null}
                {adaptationLines.map((line) => (
                  <div key={`${pid}-ad-${line}`}>{line}</div>
                ))}
              </div>
            )}

            {neural ? (
              <div className="text-xs text-gray-600 space-y-1 border-b border-gray-200 pb-3">
                <div className="font-semibold uppercase tracking-wide text-gray-700">Neural load</div>
                <div>
                  State: <span className="font-mono">{neural.neuralLoadState}</span> · Trajectory:{" "}
                  <span className="font-mono">{neural.readinessTrajectory}</span> · Next-day risk:{" "}
                  <span className="font-mono">{neural.nextDayRisk}</span> · Score: <span className="font-mono">{neural.neuralLoadScore}</span>
                </div>
                <div>Summary: <span className="font-mono">{neural.summary}</span></div>
                {!!neural.drivers?.length && (
                  <div>
                    Drivers:{" "}
                    <span className="font-mono">
                      {neural.drivers
                        .slice(0, 4)
                        .map((d) => `${d.label}(+${d.points})`)
                        .join(", ")}
                    </span>
                  </div>
                )}
              </div>
            ) : null}

            {neuralBiasApplied ? (
              <div className="text-xs text-gray-600 space-y-1 border-b border-gray-200 pb-3">
                <div className="font-semibold uppercase tracking-wide text-gray-700">Neural bias</div>
                <div>
                  Applied: <span className="font-mono">yes</span>
                </div>
                <div>
                  Why: <span className="font-mono">{neuralBiasWhy || "Neural risk signals crossed bias threshold."}</span>
                </div>
                {!!r._neural_bias_reason_codes?.length ? (
                  <div>
                    Codes: <span className="font-mono">{r._neural_bias_reason_codes.join(", ")}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="text-xs text-gray-600 space-y-1">
              <div className="font-semibold uppercase tracking-wide text-gray-700">Stage4 / debug</div>
              <div>
                Stage4: system=<span className="font-mono">{r.system_decision ?? "—"}</span> · coach=<span className="font-mono">{r.coach_decision ?? "—"}</span> ·
                final=<span className="font-mono">{r.final_decision ?? "—"}</span> · source=<span className="font-mono">{r.final_source ?? "—"}</span>
              </div>
              <div>
                Readiness id: <span className="font-mono">{r.readiness_entry_id ?? "—"}</span>
              </div>
              <div>
                Stage4 updated: <span className="font-mono">{r.stage4_updated_at ?? "—"}</span>
              </div>
              <div>
                Role: <span className="font-mono">{coachRole}</span>
              </div>
            </div>
          </div>
        )}
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

  return (
    <div className="space-y-6">
      <CoachHubCards />

      {/* Today Command Center */}
      <Card className="border border-slate-200 shadow-md">
        <CardHeader className="bg-gradient-to-r from-slate-100 via-white to-slate-50 pb-3">
          <CardTitle className={sectionTitleClass}>Today Command Center</CardTitle>
          <CardDescription className={sectionSubtitleClass}>Today&apos;s coaching decision summary</CardDescription>
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

            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${ui.pill}`}>{risk.label}</div>
                    <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${dayStateInfo.badge}`}>
                      Diagnostic: {dayStateInfo.label}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Coach: <span className="font-semibold">{coachDisplayName ?? "—"}</span> · MD {mdDayToday}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className={statLabelClass}>Risk level</div>
                    <div className="mt-1 text-xl font-semibold">{risk.label}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className={statLabelClass}>Team action</div>
                    <div className="mt-1 text-xl font-semibold">{leadingAction}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className={statLabelClass}>Needs review</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">{needsReviewCount}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className={statLabelClass}>Total players</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums">{totalPlayers}</div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-emerald-700">Full</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">{nFull}</div>
                  </div>
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-yellow-700">Reduced</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-yellow-700">{nReduced}</div>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-red-700">Recovery</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-red-700">{nRecovery}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className={statLabelClass}>Dominant fatigue</div>
                    <div className="mt-1 text-lg font-semibold">{fatigueDominant}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className={statLabelClass}>Neural load</div>
                    <div className="mt-1 text-lg font-semibold">{neuralState}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className={statLabelClass}>Next-day risk</div>
                    <div className="mt-1 text-lg font-semibold">{nextDayRisk}</div>
                  </div>
                </div>

                <div className={`rounded-xl border border-slate-200 bg-white p-3 text-sm ${ui.text}`}>
                  <div className={statLabelClass}>Coach recommendation</div>
                  <div className="mt-1 font-medium text-gray-800">{rec}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    Day state diagnostic: <span className="font-medium text-slate-700">{dayStateInfo.state}</span> · {dayStateInfo.reason}
                  </div>
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className={`flex items-end justify-between gap-3 px-3 py-2 ${softSurfaceClass}`}>
          <div>
            <div className={sectionTitleClass}>Supporting team intelligence</div>
            <div className={sectionSubtitleClass}>Performance context and team-level monitoring beneath the command summary.</div>
          </div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Level 2</div>
        </div>

        <div className="grid gap-3">
          <SessionRpeMonitoringCard teamId={coachTeamId} />
          <DailyInternalLoadCard teamId={coachTeamId} />
          <LoadMetricsCard teamId={coachTeamId} />
        </div>

        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-4">
            <Card className="h-full border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className={sectionTitleClass}>Check-in reminders</CardTitle>
                <CardDescription className={sectionSubtitleClass}>Status for today and manual reminder trigger for players missing check-in.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
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

          <div className="xl:col-span-8">
            {/* Performance Intelligence — Team */}
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
                      <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm lg:col-span-4">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Volatility (hero)</div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{teamIntel.volatility_pct ?? 0}%</div>
                        <div className="mt-1 text-xs text-slate-500">volatile players: {teamIntel.n_volatile ?? 0}</div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Readiness mix</div>
                        <div className="mt-1 text-base font-semibold text-slate-900 tabular-nums">
                          {teamIntel.pct_red ?? 0}% / {teamIntel.pct_yellow ?? 0}% / {(teamIntel.pct_green ?? 0) + (teamIntel.pct_green_plus ?? 0)}%
                        </div>
                        <div className="mt-1 text-xs text-slate-500">RED / YELLOW / GREEN(+)</div>
                        <div className="mt-1 text-xs text-slate-500 tabular-nums">
                          n: {teamIntel.n_red ?? 0} / {teamIntel.n_yellow ?? 0} / {(teamIntel.n_green ?? 0) + (teamIntel.n_green_plus ?? 0)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">Status snapshot</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{teamIntel.team_status ?? "—"}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          baseline: <span className="font-medium text-slate-700">{teamIntel.baseline_maturity ?? "—"}</span> · players:{" "}
                          <span className="font-medium text-slate-700">{teamIntel.n_players ?? "—"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 shadow-sm">
                        <div className="text-[10px] uppercase tracking-wide text-red-700">Red</div>
                        <div className="text-lg font-semibold tabular-nums text-red-800">{teamIntel.pct_red ?? 0}%</div>
                        <div className="text-xs text-red-700">n: {teamIntel.n_red ?? 0}</div>
                      </div>

                      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 shadow-sm">
                        <div className="text-[10px] uppercase tracking-wide text-yellow-700">Yellow</div>
                        <div className="text-lg font-semibold tabular-nums text-yellow-800">{teamIntel.pct_yellow ?? 0}%</div>
                        <div className="text-xs text-yellow-700">n: {teamIntel.n_yellow ?? 0}</div>
                      </div>

                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                        <div className="text-[10px] uppercase tracking-wide text-emerald-700">Green (+)</div>
                        <div className="text-lg font-semibold tabular-nums text-emerald-800">
                          {(teamIntel.pct_green ?? 0) + (teamIntel.pct_green_plus ?? 0)}%
                        </div>
                        <div className="text-xs text-emerald-700">
                          n: {(teamIntel.n_green ?? 0) + (teamIntel.n_green_plus ?? 0)}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <div className={statLabelClass}>Avg STEN</div>
                        <div className="text-lg font-semibold tabular-nums">{teamSten.avg == null ? "—" : teamSten.avg.toFixed(1)}</div>
                        <div className="text-xs text-gray-500">coverage: {teamSten.coverage}</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-300 bg-gradient-to-r from-slate-100 to-white p-3 shadow-sm">
                      <div className="text-[10px] uppercase tracking-wide text-slate-600">Team plan recommendation</div>
                      <div className="mt-1 space-y-1 text-sm font-medium text-slate-900">
                        {summaryLines(teamIntel.recommendation, 3).length ? (
                          summaryLines(teamIntel.recommendation, 3).map((line, idx) => <div key={`ti-rec-${idx}`}>{line}</div>)
                        ) : (
                          <div>—</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
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
                <div className="mt-3 rounded-xl border border-slate-200 bg-gray-50/40 p-3 md:p-4 space-y-4">{rowsWithAdaptive.map((r) => renderRow(r))}</div>
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
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-4 text-sm">
          <span className="font-semibold">Workflow:</span> Byrja á 🔴/🟡 → staðfesta með GPS/CMJ → velja minnsta virka skammt.
        </CardContent>
      </Card>
    </div>
  );
}
