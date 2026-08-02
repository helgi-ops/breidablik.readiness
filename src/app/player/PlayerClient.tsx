"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { PLAYER_COPY } from "./playerCopy";
import { lookupExercise } from "./exerciseDatabase";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { flagUi, normalizeFlag, type Flag } from "@/lib/flagUi";
import MissingCheckinBanner from "@/components/player/MissingCheckinBanner";
import PlayerRecoveryAssignmentsCard from "@/components/recovery/PlayerRecoveryAssignmentsCard";
import { usePushAutoResubscribe } from "@/lib/push/usePushAutoResubscribe";
import EnableRemindersCard from "@/components/player/EnableRemindersCard";
import { formatLoadBandClass, formatSessionTypeLabel, getSessionLoadBand } from "@/lib/session-rpe/formatters";
import { SESSION_TYPES, type SessionType } from "@/lib/session-rpe/types";
import { buildPerformanceIntelligenceDecision } from "@/lib/micropulse/performanceIntelligence";
import { structureHowTo, structureLabel } from "@/lib/micropulse/structureHowTo";
import { oneRowPerDate, oneRowPerPlayerDate } from "@/lib/micropulse/load/oneRowPerDate";
import { buildExplainableReadinessDecision } from "@/lib/micropulse/readiness";
import { buildPlayerRiskTrend, type PlayerRiskTrend } from "@/lib/micropulse/performanceIntelligence/riskTrend";
import {
  buildNeuralVolatilityIntelligenceDecision,
  type NeuralVolatilityIntelligenceDecision,
} from "@/lib/micropulse/neuralVolatilityIntelligence";
import { buildPrescriptionDecision, type PrescriptionDecision } from "@/lib/micropulse/prescriptionEngine";
import { applyCoachRules, type FinalRecommendationDecision } from "@/lib/micropulse/rulesEngine";
import { buildSessionDraft, type SessionDraft } from "@/lib/micropulse/autoSessionBuilder";
// Session workflow removed (localStorage-only prototype, not in use)
import PlayerMovementCard from "@/components/player/PlayerMovementCard";
import PlayerHrZoneCard from "@/components/player/PlayerHrZoneCard";
import PlayerDrillLoadCard from "@/components/player/PlayerDrillLoadCard";
import ClientErrorBoundary from "@/components/util/ClientErrorBoundary";
import PlayerRobustnessCard from "@/components/player/PlayerRobustnessCard";
import type { CatapultDailyLoadRow } from "@/lib/micropulse/externalLoad";
import { normalizeCatapultDailyLoadRow } from "@/lib/micropulse/externalLoad";
import {
  CatapultMetricKey,
  computeCatapultMetricAverage,
  computeCatapultWeeklyMetricSnapshot,
  getCatapultMetricDefinition,
  getCatapultMetricValue,
  getDefaultCatapultTodayVsTeamMetricKeys,
  getDefaultCatapultWeeklyLoadMetricKeys,
} from "@/lib/integrations/catapult/metricCatalog";
// Session delivery removed (localStorage-only prototype, not in use)
import {
  buildRuntimeRulesFromAdminConfig,
  createDefaultAdminConfigSnapshot,
  getProtectedPlayerTags,
  isPlayerProtectedByAdminConfig,
  loadAdminConfigSnapshotFromStorage,
  type AdminConfigSnapshot,
} from "@/lib/micropulse/adminConfig";
import { buildAthleteDecision } from "@/lib/micropulse/domain/decision";
import { buildPlayerExplanation, type ExplanationLine } from "@/lib/micropulse/decision/playerExplanation";
import { buildDailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot";
import SessionDraftCard from "@/components/sessionBuilder/SessionDraftCard";
import SessionDraftDetails from "@/components/sessionBuilder/SessionDraftDetails";
// PublishedSessionView + PlayerSessionStatusCard removed (session workflow feature removed)
import ValdStatusCard from "@/components/player/ValdStatusCard";
import { getExerciseRecommendation } from "@/lib/exercise-recommendations/recommend";
import { hasFeature } from "@/lib/micropulse/product";
import {
  getRecommendationGroupForExercise,
  getSupportedExerciseLabel,
  normalizeExerciseNameToId,
} from "@/lib/exercise-recommendations/normalize";
import { getExerciseRecommendationUiInfo } from "@/lib/exercise-recommendations/ui";
import { GROUP_OPTIONS } from "@/lib/exercise-recommendations/constants";
import { coachTemplateToBlocks } from "@/lib/micropulse/strengthProgramming/parseCoachWorkoutText";
import PullToRefresh from "@/components/player/PullToRefresh";
import type { ExerciseRecommendationInput, SupportedExerciseId } from "@/lib/exercise-recommendations/types";
import { buildEnforcedSessionPlan } from "@/lib/micropulse/lightAte/enforcement";

type ProfileRow = {
  id: string;
  display_name: string | null;
  player_id: string | null;
  role: string | null;
  team_id?: string | null;
};

type PlayerRow = {
  id: string;
  full_name: string | null;
  position: string | null;
  team: string | null;
};

type MetricsRow =
  | {
      fatigue_energy: number | null;
      sleep_quality: number | null;
      sleep_duration: number | null;
      stress_mood: number | null;
      muscle_soreness: number | null;

      total_score: number | null;
      created_at: string | null;
    }
  | null;

type GenericMsg =
  | {
      title?: string | null;
      message: string;
      why?: string | null;
    }
  | null;

// ✅ Stage-4 decision row (normalized for UI)
type Stage4PlanRow =
  | {
      decision_id: string | null;
      team_id: string | null;
      player_id: string;
      entry_date: string; // date
      md_day: string | null;
      readiness_level: string | null; // GREEN / GREEN_PLUS / YELLOW / RED
      chosen_variant_id: string | null;
      locked: boolean | null;
      source: string | null; // SYSTEM / COACH_OVERRIDE / RESOLVED_VIEW
      confidence: number | null;
      why: string | null;
      inputs: any; // jsonb

      // ✅ NEW: training system label from resolved view
      training_system: string | null;

      // plan + optional variant meta (variant should not be shown to players)
      variant: string | null; // A/B/C (staff/debug only)
      title: string | null;
      description: string | null;
      structure: any; // jsonb array
    }
  | null;

type DecisionRow =
  | {
      planned_focus: string | null;
      final_planned_day_type: string | null;
      recommended_day_type: string | null;
      readiness_flag: string | null;
    }
  | null;

type PlayerSessionTodayRow =
  | {
      player_id: string;
      team_id: string | null;
      day_date: string; // date
      planned_focus: string | null;
      readiness_flag: string | null;
      session_type: string | null;
      md_day_resolved: string | null;
    }
  | null;

type PlayerTemplateToday = {
  entry_date: string;
  note: string | null;
  locked: boolean | null;
  template:
    | {
        id: string;
        code: string | null;
        title: string | null;
        description: string | null;
        structure: any;
      }
    | null;
};

// ============================
// ✅ Post-training types (DB)
// ============================
type PostTrainingRuleRow = {
  id: string;
  priority: number;
  is_active: boolean;
  when_clause: any; // jsonb
  then_clause: any; // jsonb
};

type PostTrainingTemplateRow = {
  id: string;
  title: string;
  duration_min: number;
  tags: string[];
  structure: any; // jsonb
  is_active: boolean;
  lang?: string;
};

function riskTrendLinePoints(values: number[], width = 320, height = 80, padding = 8): string {
  if (!values.length) return "";
  if (values.length === 1) {
    const y = height / 2;
    return `${padding},${y} ${width - padding},${y}`;
  }
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  const stepX = innerW / (values.length - 1);

  return values
    .map((raw, idx) => {
      const x = padding + idx * stepX;
      const v = Math.max(0, Math.min(100, raw));
      const y = padding + (1 - v / 100) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function readinessMarkerTone(state: "GREEN" | "YELLOW" | "RED" | "GRAY"): string {
  if (state === "GREEN") return "#1c7a4a";
  if (state === "YELLOW") return "#b0700f";
  if (state === "RED") return "#a83e28";
  return "#8b8676";
}

// ============================
// ✅ Fix modules (from check-in notes)
// ============================
type FixModule = {
  tag: string;
  title: string;
  structure: any; // jsonb
};

type FixRow = {
  player_id: string;
  checkin_id: string;
  created_at: string;
  fix_modules: FixModule[];
};

// ============================
// ✅ Stage-4 audit: overrides
// ============================
type MicrodoseOverrideRow = {
  id: string;
  decision_id: string;
  coach_profile_id: string | null;
  overrode_to_readiness_level: string | null;
  override_to_variant_id: string | null;
  reason_code: string | null;
  reason_test: string | null;
  risk_level: string | null;
  created_at: string;
};

type VariantOption = { id: string; variant: string; title: string | null; description: string | null };

// ✅ NEW: Stage4 final truth (what player uses for FULL/REDUCED/RECOVERY + coach note)
type DecisionType = "FULL" | "REDUCED" | "RECOVERY";

type Stage4DecisionFinalRow =
  | {
      id: string;
      player_id: string;
      team_id: string | null;
      entry_date: string;

      system_decision: DecisionType | null;
      coach_decision: DecisionType | null;
      coach_note: string | null;
      coach_user_id: string | null;

      locked: boolean | null;

      final_decision: DecisionType;
      final_source: string | null; // SYSTEM | COACH
      updated_at: string | null;
    }
  | null;

type CoachFinalFlagRow =
  | {
      final_flag: string | null;
      final_color?: string | null;
    }
  | null;

type PlanTemplateOverrideRow = {
  title: string | null;
  description: string | null;
  structure: any;
  readiness_level: string | null;
  md_day?: string | null;
  variant?: string | null;
} | null;

type SessionRpeHistoryEntry = {
  id: string;
  player_id: string;
  team_id: string | null;
  session_date: string;
  session_type: SessionType;
  session_name: string | null;
  duration_minutes: number;
  rpe: number;
  session_load: number;
  source: string;
  notes: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

type SessionRpeFormState = {
  session_date: string;
  session_type: SessionType;
  session_name: string;
  duration_minutes: string;
  rpe: string;
  notes: string;
};

type SessionRpeStatus = {
  dateKey: string;
  expectedToday: boolean;
  submittedToday: boolean;
  todayEntriesCount: number;
  latestSubmissionAt: string | null;
  state: "SUBMITTED_TODAY" | "REMINDER_DUE_TODAY" | "NOT_YET_SUBMITTED" | "NOT_EXPECTED_TODAY";
};

/* -------------------------
   Small UI primitives
------------------------- */

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function SectionTitle({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <div>
      {kicker ? <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{kicker}</div> : null}
      <div className="mt-1 text-base font-semibold text-zinc-900">{title}</div>
      {sub ? <div className="mt-1 text-sm text-zinc-600">{sub}</div> : null}
    </div>
  );
}

function CardShell({
  children,
  className = "",
  ...props
}: { children: any; className?: string } & ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cx("rounded-2xl border bg-white shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

function Chip({ children, className = "" }: { children: any; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-800",
        className
      )}
    >
      {children}
    </span>
  );
}

function MiniDot({ className = "" }: { className?: string }) {
  return <span className={cx("h-2 w-2 rounded-full", className)} />;
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function metricTone(value: number | null | undefined): "green" | "amber" | "red" | "neutral" {
  if (value == null) return "neutral";
  if (value >= 4) return "green";
  if (value >= 3) return "amber";
  return "red";
}

function MetricBox({ label, value }: { label: string; value: number | null | undefined }) {
  const tone = metricTone(value);
  const fillPct = value != null ? Math.min(100, (value / 5) * 100) : 0;

  const bgClass =
    tone === "green" ? "bg-emerald-50 border-emerald-200" :
    tone === "amber" ? "bg-amber-50 border-amber-200" :
    tone === "red"   ? "bg-red-50 border-red-200" :
    "bg-white border-zinc-200";

  const barColor =
    tone === "green" ? "bg-emerald-500" :
    tone === "amber" ? "bg-amber-400" :
    tone === "red"   ? "bg-red-500" :
    "bg-zinc-200";

  const labelColor =
    tone === "green" ? "text-emerald-700" :
    tone === "amber" ? "text-amber-700" :
    tone === "red"   ? "text-red-700" :
    "text-zinc-500";

  const contextLabel =
    tone === "green" ? "Good" :
    tone === "amber" ? "Monitor" :
    tone === "red"   ? "Low" :
    null;

  return (
    <div className={`rounded-xl border p-3 ${bgClass}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${labelColor}`}>{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value ?? "—"}</div>
      {value != null && (
        <>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/10">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${fillPct}%` }} />
          </div>
          {contextLabel && (
            <div className={`mt-1 text-[10px] font-medium ${labelColor}`}>{contextLabel}</div>
          )}
        </>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-px w-full bg-zinc-100" />;
}

function metricFmt(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function acwrFmt(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function acwrZone(value: number | null | undefined): {
  text: string; bg: string; label: string;
} {
  if (value == null || !Number.isFinite(value)) {
    return { text: "text-zinc-400", bg: "bg-zinc-50 border-zinc-200", label: "—" };
  }
  if (value < 0.8)  return { text: "text-blue-700",  bg: "bg-blue-50 border-blue-200",   label: "Low" };
  if (value <= 1.3) return { text: "text-green-700", bg: "bg-green-50 border-green-200", label: "Optimal" };
  if (value <= 1.5) return { text: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "Elevated" };
  return              { text: "text-red-700",   bg: "bg-red-50 border-red-200",     label: "High" };
}

function gpsDateMinusDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function computeGpsSnapshot(
  rows: Array<Record<string, unknown>>,
  key: CatapultMetricKey,
  refDate: string
): { acute7Avg: number | null; chronic28Avg: number | null; acwr: number | null } {
  const acuteStart   = gpsDateMinusDays(refDate, 6);
  const chronicStart = gpsDateMinusDays(refDate, 27);
  const def = getCatapultMetricDefinition(key);

  const acute   = rows.filter(r => typeof r.date === "string" && r.date >= acuteStart   && r.date <= refDate);
  const chronic = rows.filter(r => typeof r.date === "string" && r.date >= chronicStart && r.date <= refDate);

  const acute7Avg   = computeCatapultMetricAverage(acute,   key);
  const chronic28Avg = computeCatapultMetricAverage(chronic, key);
  const acwr =
    def.acwrSupported && typeof acute7Avg === "number" && typeof chronic28Avg === "number" && chronic28Avg > 0
      ? acute7Avg / chronic28Avg
      : null;

  return { acute7Avg, chronic28Avg, acwr };
}

function externalLoadTone(playerValue: number | null | undefined, referenceValue: number | null | undefined) {
  if (playerValue == null || referenceValue == null || referenceValue <= 0) {
    return {
      tone: "border-zinc-200 bg-zinc-50 text-zinc-700",
      label: "No baseline",
    };
  }

  const ratio = playerValue / referenceValue;
  if (ratio >= 1.2) {
    return {
      tone: "border-rose-200 bg-rose-50 text-rose-800",
      label: "High",
    };
  }
  if (ratio >= 1.05) {
    return {
      tone: "border-amber-200 bg-amber-50 text-amber-800",
      label: "Elevated",
    };
  }
  return {
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    label: "Normal",
  };
}

/* -------------------------
   Helpers (unchanged logic)
------------------------- */

// ✅ Dedupe helper
function dedupeFixModulesByTag(input: FixModule[] | null | undefined): FixModule[] {
  const list = Array.isArray(input) ? input : [];
  const map = new Map<string, FixModule>();
  for (const m of list) {
    const tag = (m?.tag ?? "").trim();
    if (!tag) continue;
    if (!map.has(tag)) map.set(tag, m);
  }
  return Array.from(map.values());
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ✅ Always produce YYYY-MM-DD (UTC) so Postgres DATE will accept it
function todayIsoDateUTC(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * ✅ IMPORTANT: never allow "" / "\"\"" / junk to reach Postgres date columns
 */
function sanitizeDay(input: string | null | undefined) {
  const raw0 = String(input ?? "").trim();
  const noSlashes = raw0.replace(/\\/g, "");
  const noQuotes = noSlashes.replace(/"/g, "");
  const cleaned = noQuotes.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  return todayISO();
}

function isoDateUTCFromTimestamp(ts: string | null | undefined) {
  if (!ts) return "";
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function norm(x: string | null | undefined) {
  return (x ?? "").trim().toUpperCase();
}

function isStaffRole(role: string | null | undefined) {
  const r = norm(role);
  return r === "COACH" || r === "ADMIN" || r === "STAFF";
}

function readinessToFlag(level: string | null | undefined): Flag {
  const l = norm(level);
  if (l === "RED") return "RED";
  if (l === "YELLOW") return "YELLOW";
  return "GREEN";
}

function decisionToFlag(decision: DecisionType | null | undefined): Flag | null {
  const d = norm(decision ?? null);
  if (d === "RECOVERY") return "RED";
  if (d === "REDUCED") return "YELLOW";
  if (d === "FULL") return "GREEN";
  return null;
}

function flagToDecision(flag: Flag): DecisionType {
  if (flag === "RED") return "RECOVERY";
  if (flag === "YELLOW") return "REDUCED";
  return "FULL";
}

function flagToReadinessLevel(flag: Flag): "GREEN" | "YELLOW" | "RED" {
  if (flag === "RED") return "RED";
  if (flag === "YELLOW") return "YELLOW";
  return "GREEN";
}

function parseFinalFlag(flag: string | null | undefined): Flag | null {
  const f = norm(flag);
  if (f === "RED") return "RED";
  if (f === "YELLOW") return "YELLOW";
  if (f === "GREEN") return "GREEN";
  return null;
}

function titleColorForFlag(flag: Flag): "Green" | "Yellow" | "Red" {
  if (flag === "RED") return "Red";
  if (flag === "YELLOW") return "Yellow";
  return "Green";
}

function normalizeSessionHeaderTitleByFlag(title: string | null | undefined, flag: Flag): string | null {
  const raw = (title ?? "").trim();
  if (!raw) return title ?? null;
  const normalizedColor = titleColorForFlag(flag);
  let next = raw.replace(/\bMD\s*\((Green|Yellow|Red)\)/gi, `MD (${normalizedColor})`);
  next = next.replace(/\((Green|Yellow|Red)\)/gi, `(${normalizedColor})`);
  next = next.replace(/\bMD\s+(Green|Yellow|Red)\b/gi, `MD (${normalizedColor})`);
  return next;
}

function mdContextLabel(mdDay: string | null | undefined) {
  const md = norm(mdDay);
  return md ? md : "—";
}

type SessionLoad = "LOW" | "MODERATE" | "HIGH" | null;

type PostTrainingContext = {
  mdDay: string | null;
  sessionLoad: SessionLoad;
  sprintExposure: boolean;
  matchLike: boolean;
};

function matchesWhenClause(ctx: PostTrainingContext, whenClause: any): boolean {
  if (!whenClause || typeof whenClause !== "object") return false;

  if (Array.isArray(whenClause.md_day_in)) {
    if (!ctx.mdDay) return false;
    return whenClause.md_day_in.includes(ctx.mdDay);
  }

  if (Array.isArray(whenClause.or)) {
    return whenClause.or.some((cond: any) => matchesWhenClause(ctx, cond));
  }

  if (typeof whenClause.session_load === "string") return ctx.sessionLoad === whenClause.session_load;
  if (typeof whenClause.sprint_exposure === "boolean") return ctx.sprintExposure === whenClause.sprint_exposure;
  if (typeof whenClause.match_like === "boolean") return ctx.matchLike === whenClause.match_like;

  return false;
}

// ✅ Rotation pool (endur-notar MD templates) — EKKI tendon
const DAILY_ROTATION_POOL = ["md1_priming", "md2_maintenance", "md3_speed_reset", "md4_neural_reset"] as const;

function pickDailyFromMdDay(mdDay: string | null): string {
  const md = String(mdDay ?? "").toUpperCase();

  if (md === "MD-1") return "md1_priming";
  if (md === "MD-2") return "md2_maintenance";
  if (md === "MD-3") return "md3_speed_reset";
  if (md === "MD-4") return "md4_neural_reset";

  // POST / MD+1 / MD+2 mapping
  if (md === "POST") return "md4_neural_reset";
  if (md === "MD+1") return "md2_maintenance";
  if (md === "MD+2") return "md3_speed_reset";

  return DAILY_ROTATION_POOL[0];
}

function evaluatePostTrainingTemplateIds(ctx: PostTrainingContext, rules: PostTrainingRuleRow[], alwaysInclude: string[] = []) {
  const out: string[] = [];

  // ✅ Daily rotation
  out.push(pickDailyFromMdDay(ctx.mdDay));

  // ✅ Always include
  for (const id of alwaysInclude) if (!out.includes(id)) out.push(id);

  const sorted = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const r of sorted) {
    if (!r?.is_active) continue;
    if (!matchesWhenClause(ctx, r.when_clause)) continue;

    const append: string[] = Array.isArray(r?.then_clause?.append) ? r.then_clause.append : [];
    for (const id of append) if (!out.includes(id)) out.push(id);
  }

  return out;
}

function inferMatchLike(sessionTypeRaw: string | null | undefined) {
  const s = norm(sessionTypeRaw);
  return s.includes("MATCH") || s.includes("LEIKUR") || s.includes("GAME");
}

function inferSprintExposure(sessionTypeRaw: string | null | undefined) {
  const s = norm(sessionTypeRaw);
  return s.includes("SPRINT") || s.includes("SPEED") || s.includes("HSS");
}

function blockItemToRawString(item: any): string | null {
  if (typeof item === "string") {
    const trimmed = item.trim();
    return trimmed || null;
  }

  if (!item || typeof item !== "object") return null;

  const name = String(item?.name ?? item?.title ?? item?.exercise ?? item?.label ?? "").trim();
  if (!name) return null;

  const directDose = String(
    item?.dose ??
      item?.sets_reps ??
      item?.setsReps ??
      item?.prescription ??
      item?.volume ??
      ""
  ).trim();

  const sets = item?.sets != null ? String(item.sets).trim() : "";
  const reps = item?.reps != null ? String(item.reps).trim() : "";
  const hold = item?.hold != null ? String(item.hold).trim() : "";
  const duration = item?.duration != null ? String(item.duration).trim() : "";
  const time = item?.time != null ? String(item.time).trim() : "";
  const rest = item?.rest != null ? String(item.rest).trim() : "";
  const note = String(item?.note ?? item?.notes ?? "").trim();
  const method = String(item?.method ?? "").trim();

  const fallbackDoseParts = [
    sets && reps ? `${sets}×${reps}` : "",
    hold,
    duration,
    time,
    rest,
  ].filter(Boolean);
  const dose = directDose || fallbackDoseParts.join(" ");

  const bits = [name, dose, method].filter(Boolean).join(" ");
  if (!bits) return null;
  return note ? `${bits} (${note})` : bits;
}

function safeStringList(x: any): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((v) => blockItemToRawString(v))
    .filter((v): v is string => !!v);
}

function selectTemplateOverrideCandidate(
  rows: Array<{
    title: string | null;
    description: string | null;
    structure: any;
    readiness_level: string | null;
    md_day?: string | null;
    variant?: string | null;
  }>,
  preferredVariant: string | null | undefined,
  mdDay: string | null | undefined
) {
  if (!rows.length) return null;
  const preferred = norm(preferredVariant);
  const md = norm(mdDay);

  const byMd = md ? rows.filter((r) => norm(r.md_day ?? null) === md) : rows;
  const byMdOrAll = byMd.length ? byMd : rows;

  if (preferred) {
    const exactVariant = byMdOrAll.find((r) => norm(r.variant ?? null) === preferred);
    if (exactVariant) return exactVariant;
  }

  return byMdOrAll[0] ?? rows[0] ?? null;
}

/**
 * Returns a canonical sort priority for a training block based on its title.
 * Lower number = shown earlier in the session.
 *   0 – warm-up (upphitun)
 *   1 – primer / ballistic / explosive  ← must come before contrast
 *   2 – contrast / strength (main block)
 *   3 – iso / isometric / accessory
 *   9 – everything else
 *
 * This ensures "Ballistic Readiness Check" (priority 1) always renders before
 * "Contrast" / "French Contrast" (priority 2) even when the template data
 * stores them in a different order.
 */
function blockSortPriority(titleRaw: string): number {
  // Reuse the shared classifier so content keywords beat the A/B/C letter prefix
  // (an "A. Contrast" block is Main/priority 2, not primer/1) — otherwise the
  // Today card featured the primer (ISO) instead of the main strength lifts.
  switch (classifyBlockLabel((titleRaw ?? "").toLowerCase())) {
    case "Upphitun": return 0;
    case "Primer": return 1;
    case "Main": return 2;
    case "Accessory": return 3;
    default: return 9;
  }
}

/** Converts a 6-digit hex colour (e.g. "#005a2b") to { r, g, b }. Returns null if invalid. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex ?? "").trim());
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

type BlockAccentResult = {
  wrap: string;
  wrapStyle?: CSSProperties;
  badge: string;
  badgeStyle?: CSSProperties;
  dot: string;
  dotStyle?: CSSProperties;
  bar: string;
  barStyle?: CSSProperties;
  itemBorder: string;
  itemBorderStyle?: CSSProperties;
  itemBg: string;
  methodBadge: string;
  methodBadgeStyle?: CSSProperties;
  choiceHeader: string;
  choiceHeaderStyle?: CSSProperties;
  label: string;
  /** Original block title — used to detect method variants like Potentiation Cluster */
  rawTitle: string;
};

/** =========
 *  Block accents — uses team brand colour when available, falls back to default palette
 *  ========= */
// Classify a block by its title into a canonical type. Content keywords take
// priority over the A/B/C letter prefix, because a plan can label its main
// contrast lift "A." — the letter is just sequence, not block type. Contrast/
// strength is checked before explosive so "A. Contrast: … explosive …" resolves
// to Main (not Primer), which drives the correct goal text + accent colour.
function classifyBlockLabel(titleLower: string): "Upphitun" | "Primer" | "Main" | "Accessory" | "Partur" {
  const t = titleLower;
  if (t.includes("warm") || t.includes("upphit")) return "Upphitun";
  if (t.includes("contrast") || t.includes("strength")) return "Main";
  if (t.includes("iso") || t.includes("isometric")) return "Accessory";
  if (t.includes("primer") || t.includes("ballistic") || t.includes("explosive")) return "Primer";
  if (t.startsWith("0.")) return "Upphitun";
  if (t.startsWith("a.")) return "Primer";
  if (t.startsWith("b.")) return "Main";
  if (t.startsWith("c.")) return "Accessory";
  return "Partur";
}

function blockAccent(titleRaw: string, themeColor?: string | null): BlockAccentResult {
  const t = (titleRaw ?? "").toLowerCase();

  // When a team brand colour is set, use it for all block accents
  if (themeColor) {
    const rgb = hexToRgb(themeColor);
    if (rgb) {
      const { r, g, b } = rgb;
      const a = (alpha: number) => `rgba(${r},${g},${b},${alpha})`;
      // Darker shade for text — readable on the very light tinted backgrounds
      const dr = Math.round(r * 0.45);
      const dg = Math.round(g * 0.45);
      const db = Math.round(b * 0.45);
      const darkText = `rgb(${dr},${dg},${db})`;

      return {
        wrap: "",
        wrapStyle: { borderColor: a(0.22), backgroundColor: a(0.06) },
        badge: "",
        badgeStyle: { backgroundColor: a(0.12), color: darkText, borderColor: a(0.28) },
        dot: "",
        dotStyle: { backgroundColor: a(0.70) },
        bar: "",
        barStyle: { backgroundColor: a(0.55) },
        itemBorder: "",
        itemBorderStyle: { borderColor: a(0.14) },
        itemBg: "bg-white",
        methodBadge: "",
        methodBadgeStyle: { backgroundColor: a(0.10), color: darkText, borderColor: a(0.22) },
        choiceHeader: "",
        choiceHeaderStyle: { backgroundColor: a(0.08), borderColor: a(0.18), color: darkText },
        label: classifyBlockLabel(t),
        rawTitle: titleRaw,
      };
    }
  }

  // Same classification as the themed branch, so block type (and thus goal
  // text) is consistent regardless of whether a club colour is set.
  const label = classifyBlockLabel(t);
  if (label === "Upphitun") {
    return {
      wrap: "border-amber-200 bg-amber-50/70",
      badge: "bg-amber-100 text-amber-800 border-amber-200",
      dot: "bg-amber-400",
      bar: "bg-amber-400",
      itemBorder: "border-amber-100",
      itemBg: "bg-white",
      methodBadge: "bg-amber-100 text-amber-700 border-amber-200",
      choiceHeader: "bg-amber-100/80 border-amber-200 text-amber-900",
      label: "Upphitun",
      rawTitle: titleRaw,
    };
  }
  if (label === "Primer") {
    return {
      wrap: "border-violet-200 bg-violet-50/70",
      badge: "bg-violet-100 text-violet-800 border-violet-200",
      dot: "bg-violet-500",
      bar: "bg-violet-400",
      itemBorder: "border-violet-100",
      itemBg: "bg-white",
      methodBadge: "bg-violet-100 text-violet-700 border-violet-200",
      choiceHeader: "bg-violet-100/80 border-violet-200 text-violet-900",
      label: "Primer",
      rawTitle: titleRaw,
    };
  }
  if (label === "Main") {
    return {
      wrap: "border-blue-200 bg-blue-50/70",
      badge: "bg-blue-100 text-blue-800 border-blue-200",
      dot: "bg-blue-500",
      bar: "bg-blue-400",
      itemBorder: "border-blue-100",
      itemBg: "bg-white",
      methodBadge: "bg-blue-100 text-blue-700 border-blue-200",
      choiceHeader: "bg-blue-100/80 border-blue-200 text-blue-900",
      label: "Main",
      rawTitle: titleRaw,
    };
  }
  if (label === "Accessory") {
    return {
      wrap: "border-emerald-200 bg-emerald-50/70",
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
      dot: "bg-emerald-500",
      bar: "bg-emerald-400",
      itemBorder: "border-emerald-100",
      itemBg: "bg-white",
      methodBadge: "bg-emerald-100 text-emerald-700 border-emerald-200",
      choiceHeader: "bg-emerald-100/80 border-emerald-200 text-emerald-900",
      label: "Accessory",
      rawTitle: titleRaw,
    };
  }
  return {
    wrap: "border-zinc-200 bg-zinc-50/60",
    badge: "bg-zinc-50 text-zinc-700 border-zinc-200",
    dot: "bg-zinc-400",
    bar: "bg-zinc-300",
    itemBorder: "border-zinc-100",
    itemBg: "bg-white",
    methodBadge: "bg-zinc-100 text-zinc-600 border-zinc-200",
    choiceHeader: "bg-zinc-100 border-zinc-200 text-zinc-700",
    label: "Partur",
    rawTitle: titleRaw,
  };
}

type ParsedExercise = {
  isHeader: boolean;
  name: string;
  method: string | null;
  setsReps: string | null;
  note: string | null;
  /** Contrast/complex category ("heavy" | "explosive" | "strength" | "plyo")
   *  captured from a "B1. Heavy: <exercise>" line — drives the swap options. */
  category?: string | null;
};

type ExerciseRecommendationContext = Omit<ExerciseRecommendationInput, "originalExerciseName">;

function parseExerciseItem(raw: string): ParsedExercise {
  const s = (raw ?? "").trim();

  // Remove leading index like "1) " or "1. " and bullet characters
  let working = s.replace(/^\d+[\)\.\-]\s*/, "").replace(/^[•\-\*]\s*/, "");

  // Extract method badge (potentiation must come BEFORE generic cluster)
  let method: string | null = null;
  if (/\bPOTENTIATION\s*CLUSTER\b/i.test(working)) method = "POTENTIATION_CLUSTER";
  else if (/\bCLUSTER\b/i.test(working)) method = "CLUSTER";
  else if (/\bMET\b/.test(working)) method = "MET";
  else if (/\bISO\b/i.test(working)) method = "ISO";
  else if (/\bEMOM\b/i.test(working)) method = "EMOM";
  else if (/\bAMRAP\b/i.test(working)) method = "AMRAP";

  // Extract trailing note in parentheses
  const noteMatch = working.match(/\(([^)]+)\)\s*$/);
  const note = noteMatch ? noteMatch[1] : null;
  if (noteMatch) working = working.slice(0, noteMatch.index).trim();

  // Extract common training variable patterns.
  // Supports:
  // - "2×3"
  // - "2 reps/arm × 3–5 sett"
  // - "1 sek × 10 reps"
  // - "2–4 reps / hlið"
  // - "3 × 3 @ 0.7 - 0.75 m/s"
  const setsRepsPatterns = [
    /\d+(?:\s+(?:reps?(?:\/\w+)?|sek|min))?(?:\s+each\s+\w+)?\s*[×xX]\s*\d+(?:[–-]\d+)?(?:\s*\/\s*\w+)?(?:\s+(?:sett|sets?|reps?|sek|min))?(?:\s*@\s*[^()]+)?/i,
    /\d+(?:[–-]\d+)?\s*reps?(?:\s*\/\s*\w+)?/i,
    /\d+(?:[–-]\d+)?\s*sek(?:\s*\/\s*\w+)?/i,
  ];
  const setsRepsMatch = setsRepsPatterns
    .map((pattern) => working.match(pattern))
    .find((match): match is RegExpMatchArray => !!match);
  const rawSetsReps = setsRepsMatch ? setsRepsMatch[0].trim() : null;
  // Add a unit if missing — an ISO exercise's second number is a HOLD in
  // seconds ("sek"), everything else is reps. "2 reps × 3 sett" etc. already
  // carry a unit and are preserved as-is.
  let setsReps = rawSetsReps;
  if (rawSetsReps && !/sett|sets|reps?|sek|sec|mín|min/i.test(rawSetsReps)) {
    const unit = method === "ISO" ? "sek" : "reps";
    setsReps = rawSetsReps.replace(/(\d+\s*[×xX]\s*\d+(?:[–-]\d+)?)/, `$1 ${unit}`);
  }

  // Extract name: everything before "—", ":", or the sets info
  let name = working;
  let exerciseCategory: string | null = null;
  if (name.includes("—")) {
    name = name.split("—")[0].trim();
  } else if (name.includes(":")) {
    const colonIdx = name.indexOf(":");
    const before = name.slice(0, colonIdx).trim();
    const after = name.slice(colonIdx + 1).trim();
    const category = before.replace(/^[A-Ca-c]\d?\s*[.):]\s*/i, "").trim();
    // Contrast/complex items are "<label>. <category>: <real exercise>", so the
    // REAL exercise is AFTER the colon (e.g. "B1. Heavy: Trap-bar deadlift" →
    // "B1. Trap-bar deadlift"). Keep the letter label so complex grouping still
    // detects the pair, and keep the category so the exercise can be swapped for
    // another in the same category. Any other "Name: notes" keeps the part
    // before the colon.
    if (after && /^(heavy|explosive|strength|plyo|ballistic|þung|sprengi)/i.test(category)) {
      const labelPrefix = before.match(/^[A-Ca-c]\d?\s*[.):]/i)?.[0] ?? "";
      let real = after;
      if (setsReps) {
        const si = real.indexOf(setsReps);
        if (si > 0) real = real.slice(0, si);
      }
      real = real.replace(/[×xX*\s—:,\-]+$/, "").trim();
      name = `${labelPrefix} ${real}`.replace(/\s+/g, " ").trim();
      exerciseCategory = category.toLowerCase().split(/\s+/)[0];
    } else {
      name = before;
    }
  } else if (setsReps) {
    const idx = name.indexOf(setsReps);
    if (idx > 0) name = name.slice(0, idx).trim().replace(/[-—:,]+$/, "").trim();
  }
  // Remove any leftover leading index
  name = name.replace(/^\d+[\)\.\-]\s*/, "").trim();

  // Header / choice lines that can still carry shared variables for the following options.
  const isChoiceHeader =
    s.endsWith(":") ||
    /^(veldu|choose|complete|nota|hér|þetta)/i.test(s) ||
    /\bveldu\b/i.test(s) ||
    /^(strength|plyo)\b/i.test(name);

  return { isHeader: isChoiceHeader, name, method, setsReps, note, category: exerciseCategory };
}

function stripVelocityQualifier(value: string | null) {
  if (!value) return null;
  return value.replace(/\s*@\s*.+$/i, "").trim();
}

/* ---- Exercise info content (method guides + block goals) ---- */
const METHOD_GUIDE: Record<string, { IS: string; EN: string }> = {
  POTENTIATION_CLUSTER: {
    IS: "Potentiation Cluster parar saman þunga styrktaræfingu og sprengikraftsæfingu í sömu blokk til að nýta PAP (Post-Activation Potentiation) áhrif.\n\nUppsetning:\n1. Þung lyft (1–3 endurt. @ 85–95% 1RM) → 10–20 sek hvíld\n2. Sprengikraftsæfing (3–5 endurt. eða stökk/kast) → 2–3 mín hvíld\n\nEndurtaktu 3–5 sett.\n\nÞunga lyftan virkjar taugakerfið (PAP) sem eykur kraftframleiðslu í sprengikraftsæfingunni á eftir. Þetta er EKKI superset — þú nýtir stuttu hvíldina á milli til að fá PAP áhrifin.",
    EN: "Potentiation Cluster pairs a heavy strength exercise with an explosive exercise in the same block to exploit PAP (Post-Activation Potentiation).\n\nSetup:\n1. Heavy lift (1–3 reps @ 85–95% 1RM) → 10–20 sec rest\n2. Explosive exercise (3–5 reps or jumps/throws) → 2–3 min rest\n\nRepeat for 3–5 sets.\n\nThe heavy lift activates the nervous system (PAP) which increases force production in the following explosive exercise. This is NOT a superset — the short intra-pair rest is intentional to capture the PAP window.",
  },
  CLUSTER: {
    IS: "Cluster uppsetning þýðir að þú framkvæmir allar endurtekningarnar saman í hvert skipti og hvílir síðan á milli setta.\n\nDæmi — 2 reps × 3 sett (20 sek hvíld):\n2 reps → hvíl 20 sek → 2 reps → hvíl 20 sek → 2 reps = lokið.\n\nÞetta gerir þér kleift að nota meiri þyngd og halda betri tækni í gegnum öll settin.",
    EN: "Cluster setup means you perform all reps together each time, then rest between sets.\n\nExample — 2 reps × 3 sets (20 sec rest):\n2 reps → rest 20 sec → 2 reps → rest 20 sec → 2 reps = complete.\n\nThis allows you to use heavier loads and maintain better technique across all sets.",
  },
  MET: {
    IS: "MET (Muscle Energy Technique) — samvinnuaðferð þar sem þú virkjar vöðvann gegn léttri mótstöðu frá þjálfara, sleppir og leyfir vöðvanum að ná nýjum lengd.\n\n1. Þjálfari færir líkamshluta að feather-edge (fyrsta mótstaða)\n2. INNÖNDUN: Þú þrýstir létt gegn þjálfara (~20% kraftur) í 5 sek\n3. ÚTÖNDUN: Þú slakar algjörlega á — þjálfari færir í nýja lengd (10 sek)\n\nEndurtaktu 2–3 sinnum á hvora hlið. Þetta er EKKI teygja — þú notar eigin kraft til að endurforrita taugakerfið.",
    EN: "MET (Muscle Energy Technique) — a collaborative method where you contract the muscle against light resistance from the coach, then release and allow the muscle to reach a new length.\n\n1. Coach positions the limb to the feather-edge (first resistance)\n2. INHALE: Push lightly against the coach (~20% force) for 5 seconds\n3. EXHALE: Fully relax — coach moves to a new length (10 sec)\n\nRepeat 2–3 times per side. This is NOT stretching — you use your own force to reprogram the nervous system.",
  },
  ISO: {
    IS: "Isometric æfing — haltu stöðunni í tilgreindan tíma. Einbeittu þér að að spenna vöðvana að fullu og halda jafnri líkamsstöðu í gegnum allt tímabilið.\n\nÞetta þróar styrk á ákveðnum punkti á hreyfisviðinu og örvar taugavöðvasamband.",
    EN: "Isometric exercise — hold the position for the specified time. Focus on fully contracting the muscles and maintaining a steady position throughout.\n\nThis develops strength at a specific point in the range of motion and enhances neuromuscular control.",
  },
  EMOM: {
    IS: "EMOM (Every Minute On the Minute) — framkvæmdu tilgreindar endurtekningar í upphafi hvers mínútu. Restartaðu á næstu mínútu. Hvíldin er það sem eftir er af hverri mínútu.",
    EN: "EMOM (Every Minute On the Minute) — complete the specified reps at the start of each minute. Rest for whatever time remains before the next minute begins.",
  },
  AMRAP: {
    IS: "AMRAP (As Many Reps/Rounds As Possible) — framkvæmdu eins margar endurtekningar eða hringi og mögulegt er á tilgreindum tíma. Haltu gæðum hreyfinganna.",
    EN: "AMRAP (As Many Reps/Rounds As Possible) — complete as many reps or rounds as possible in the allotted time. Maintain movement quality throughout.",
  },
};

const BLOCK_GOAL: Record<string, { IS: string; EN: string }> = {
  "MET": {
    IS: "Losa um stutta og ofvirka vöðva með vöðvaorkutækni. MET notar taugakerfið til að endursetja vöðvaspennu og auka hreyfisvið — samdráttur á innöndun, slökun á útöndun. Þetta opnar hreyfigetu sem ISO og Core styrkja síðan í næstu blokkum.",
    EN: "Release shortened and overactive muscles with Muscle Energy Technique. MET uses the nervous system to reset muscle tone and increase range of motion — contraction on inhale, release on exhale. This opens mobility that ISO and Core then strengthen in the following blocks.",
  },
  "MET — Muscle Energy Technique": {
    IS: "Losa um stutta og ofvirka vöðva með vöðvaorkutækni. MET notar taugakerfið til að endursetja vöðvaspennu og auka hreyfisvið — samdráttur á innöndun, slökun á útöndun. Þetta opnar hreyfigetu sem ISO og Core styrkja síðan í næstu blokkum.",
    EN: "Release shortened and overactive muscles with Muscle Energy Technique. MET uses the nervous system to reset muscle tone and increase range of motion — contraction on inhale, release on exhale. This opens mobility that ISO and Core then strengthen in the following blocks.",
  },
  Upphitun: {
    IS: "Hækka líkamshita, auka blóðflæði og virkja vöðva og taugakerfi fyrir eftirfarandi æfingar. Taktu þér tíma og einbeittu þér að gæðum hreyfinganna.",
    EN: "Raise body temperature, increase blood flow and activate muscles and the nervous system for the exercises ahead. Take your time and focus on movement quality.",
  },
  "Warm-up": {
    IS: "Hækka líkamshita, auka blóðflæði og virkja vöðva og taugakerfi fyrir eftirfarandi æfingar.",
    EN: "Raise body temperature, increase blood flow and activate muscles and the nervous system for the exercises ahead.",
  },
  Primer: {
    IS: "Virkja taugarnar og undirbúa líkamann sérstaklega fyrir kraftæfingar. Primer æfingar þjálfa explosive power og samhæfingu — þær undirbúa þig til að framkvæma aðalæfingarnar með meiri krafti og betri tækni.",
    EN: "Activate the nervous system and specifically prepare the body for strength work. Primer exercises train explosive power and coordination — priming you to perform the main exercises with more force and better technique.",
  },
  Main: {
    IS: "Þróa force production og styrk í neðri líkama með því að para saman þungar styrktaræfingar og sprengikraftsæfingar (contrast). Þetta eykur neural drive, power output og flutning yfir í hlaup og stökk.",
    EN: "Develop force production and lower body strength by pairing heavy strength exercises with explosive plyometrics (contrast). This increases neural drive, power output and transfer to running and jumping.",
  },
  Accessory: {
    IS: "Bæta stöðugleika í liðum, sinastyrk og neural control. Isometric æfingar hjálpa sérstaklega við meiðslavarnir (ACL, groin) og auka kraftflutning í hreyfingum. Low fatigue — high neural output.",
    EN: "Improve joint stability, tendon strength and neural control. Isometric exercises are especially effective for injury prevention (ACL, groin) and enhancing force transfer in movement. Low fatigue — high neural output.",
  },
};

/* ---- ExerciseInfoModal ---- */
function ExerciseInfoModal({
  ex,
  blockLabel,
  blockRawTitle,
  onClose,
}: {
  ex: ParsedExercise;
  blockLabel: string;
  /** Original block title e.g. "A. Potentiation Cluster — Acceleration" */
  blockRawTitle?: string;
  onClose: () => void;
}) {
  const [lang] = useLang();
  const isIS = lang === "IS";

  // If block raw title mentions "Potentiation" and method is CLUSTER, upgrade to POTENTIATION_CLUSTER
  const titleToCheck = blockRawTitle || blockLabel;
  const effectiveMethod = ex.method === "CLUSTER" && /potentiation/i.test(titleToCheck)
    ? "POTENTIATION_CLUSTER"
    : ex.method;
  const methodGuide = effectiveMethod ? METHOD_GUIDE[effectiveMethod] : null;
  const blockGoal = BLOCK_GOAL[blockLabel];
  const exInfo = lookupExercise(ex.name);
  const desc = exInfo ? (isIS ? exInfo.IS : exInfo.EN) : null;

  const hasContent = !!(ex.note || desc || methodGuide || blockGoal);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      {/* Sheet */}
      <div
        className="relative rounded-t-2xl bg-white shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-zinc-200" />
        </div>

        <div className="px-5 pb-8 pt-2 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-zinc-900 leading-snug">
                {effectiveMethod === "POTENTIATION_CLUSTER"
                  ? (isIS ? "Potentiation Cluster uppsetning" : "Potentiation Cluster format")
                  : ex.name}
              </div>
              {ex.setsReps ? (
                <div className="mt-1 text-sm font-semibold text-zinc-500">{ex.setsReps}</div>
              ) : null}
            </div>
            <button
              onClick={onClose}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Note */}
          {ex.note ? (
            <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 mb-1">
                {isIS ? "Athugasemd" : "Note"}
              </div>
              <div className="text-sm text-zinc-700 leading-relaxed">{ex.note}</div>
            </div>
          ) : null}

          {/* Exercise-specific: Execution steps */}
          {desc ? (
            <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-2">
                📋 {isIS ? "Framkvæmd" : "Execution"}
              </div>
              <ol className="space-y-1.5">
                {desc.execution.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-zinc-700 leading-snug">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {/* Video link */}
          {exInfo?.videoUrl ? (
            <a
              href={exInfo.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3.5 transition-colors active:bg-indigo-100"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                <span className="text-lg">▶</span>
              </span>
              <div>
                <div className="text-sm font-semibold text-indigo-900">
                  {isIS ? "Horfa á myndband" : "Watch video"}
                </div>
                <div className="text-[11px] text-indigo-500">
                  {isIS ? "Sjá hvernig æfingin er framkvæmd" : "See how to perform the exercise"}
                </div>
              </div>
            </a>
          ) : null}

          {/* Exercise-specific: Focus points */}
          {desc?.focus?.length ? (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-amber-600 mb-2">
                🎯 {isIS ? "Fókuspunktar" : "Focus points"}
              </div>
              <ul className="space-y-1">
                {desc.focus.map((pt, i) => (
                  <li key={i} className="flex gap-2 text-sm text-amber-900 leading-snug">
                    <span className="mt-0.5 text-amber-400 shrink-0">▸</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Exercise-specific: Goal */}
          {desc?.goal ? (
            <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-green-600 mb-1">
                ✅ {isIS ? "Markmið æfingar" : "Exercise goal"}
              </div>
              <div className="text-sm text-green-900 leading-relaxed">{desc.goal}</div>
            </div>
          ) : null}

          {/* Method guide */}
          {methodGuide ? (
            <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-violet-500 mb-2">
                ⚙ {effectiveMethod === "POTENTIATION_CLUSTER" ? "POTENTIATION CLUSTER" : ex.method} — {isIS ? "Hvernig á að framkvæma" : "How to perform"}
              </div>
              {(isIS ? methodGuide.IS : methodGuide.EN).split("\n").map((line, i) =>
                line.trim() === "" ? (
                  <div key={i} className="h-2" />
                ) : (
                  <div key={i} className="text-sm text-violet-900 leading-relaxed">{line}</div>
                )
              )}
            </div>
          ) : null}

          {/* Block goal */}
          {blockGoal ? (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-blue-500 mb-2">
                🏋 {isIS ? `Markmið hlutans — ${blockLabel}` : `Block goal — ${blockLabel}`}
              </div>
              <div className="text-sm text-blue-900 leading-relaxed">
                {isIS ? blockGoal.IS : blockGoal.EN}
              </div>
            </div>
          ) : null}

          {/* Fallback if no extra info */}
          {!hasContent ? (
            <div className="text-sm text-zinc-400 text-center py-4">
              {isIS ? "Engar frekari upplýsingar tiltækar." : "No additional information available."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Render a coach-authored free-text workout (workout_templates.description) with
 * the structure the coach actually typed. Coaches write these with real line
 * breaks — a title, blank lines, "Block N (…)" headers, "1a) Exercise — reps"
 * lines, and "- detail" bullets — but a plain <div> collapses every newline into
 * a space, turning it into an unreadable wall of text. This keeps the lines and
 * lightly styles the three shapes it recognises; anything unrecognised falls
 * through as a plain line, so no coach formatting is ever lost.
 */
function CoachWorkoutText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return (
    <div className="mt-1 text-sm leading-relaxed">
      {lines.map((raw, i) => {
        const line = raw.trim();
        if (!line) return <div key={i} className="h-2" aria-hidden />;
        // "1a) Bench press — 5 reps" / "2a." → an exercise line
        if (/^\d+[a-z]?[).]/i.test(line)) {
          return <div key={i} className="mt-1.5 font-medium text-zinc-700">{line}</div>;
        }
        // "- Velocity target: 0.75 m/s" / "• …" / "* …" → a detail bullet
        if (/^[-•*]\s+/.test(line)) {
          return <div key={i} className="pl-4 text-[13px] text-zinc-500">{line.replace(/^[-•*]\s+/, "· ")}</div>;
        }
        // Anything else standing on its own line is a section label — "Block 1
        // (Contrast / complex)", "Core circuit", the title — so give them all the
        // same header weight (first line flush; the rest get breathing room).
        return <div key={i} className={cx("font-semibold text-zinc-800", i > 0 && "mt-2.5")}>{line}</div>;
      })}
    </div>
  );
}

function recommendationBadgeToneClass(tone: "neutral" | "warning" | "success"): string {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function recommendationPanelClass(accent: BlockAccentResult): { cls: string; style?: CSSProperties } {
  return {
    cls: cx("rounded-xl border px-3 py-2.5", accent.itemBorder, accent.itemBg),
    style: accent.itemBorderStyle,
  };
}

function exerciseMethodForId(id: SupportedExerciseId | null, fallbackMethod: string | null): string | null {
  if (id === "ISO_MID_THIGH_PULL" || id === "ISOMETRIC_SPLIT_SQUAT_HOLD") return "ISO";
  // A supported exercise that ISN'T isometric must NOT inherit the plan line's
  // method — e.g. an ISO plan swapped for DB Snatch is explosive, not ISO.
  if (id) return null;
  return fallbackMethod;
}

function applySupportedExerciseDisplayOverride(
  exercise: ParsedExercise,
  id: SupportedExerciseId | null
): ParsedExercise {
  if (!id) return exercise;

  if (id === "ISO_MID_THIGH_PULL") {
    return {
      ...exercise,
      name: "ISO Mid-Thigh Pull",
      method: "ISO",
      setsReps: "1 sek all out effort x 8-10 reps",
      note: null,
    };
  }

  if (id === "ISOMETRIC_SPLIT_SQUAT_HOLD") {
    return {
      ...exercise,
      name: "Isometric Split Squat Hold",
      method: "ISO",
      setsReps: "3-5 sec x 3 reps each leg",
      note: null,
    };
  }

  // Explosive-accessory alternatives are rep-based (not ISO holds), so give them
  // their own reps unit instead of inheriting an ISO plan line's "sek".
  if (id === "DB_SNATCH") {
    return { ...exercise, name: "DB Snatch", method: null, setsReps: "3-5 reps", note: null };
  }
  if (id === "JUMP_SHRUGS") {
    return { ...exercise, name: "Jump Shrugs", method: null, setsReps: "3-5 reps", note: null };
  }
  if (id === "MID_THIGH_PULL") {
    return { ...exercise, name: "Mid-Thigh Pull", method: null, setsReps: "3-5 reps", note: null };
  }

  return exercise;
}

function scoreParsedExerciseForSupportedId(exercise: ParsedExercise, id: SupportedExerciseId): number {
  const normalizedId = normalizeExerciseNameToId(exercise.name);
  if (normalizedId !== id) return -1;

  let score = 1;
  const method = (exercise.method ?? "").toUpperCase();
  const setsReps = (exercise.setsReps ?? "").toLowerCase();
  const name = exercise.name.toLowerCase();

  if (id === "ISO_MID_THIGH_PULL") {
    if (method === "ISO") score += 5;
    if (setsReps.includes("sek") || setsReps.includes("sec")) score += 3;
    if (setsReps.includes("rep")) score += 1;
    if (name.includes("iso")) score += 2;
  }

  if (id === "ISOMETRIC_SPLIT_SQUAT_HOLD") {
    if (method === "ISO") score += 5;
    if (setsReps.includes("sek") || setsReps.includes("sec")) score += 3;
    if (setsReps.includes("hlid") || setsReps.includes("hlið") || setsReps.includes("each leg")) score += 2;
    if (name.includes("isometric") || name.includes("split squat iso") || name.includes("iso split squat")) score += 2;
  }

  if (id === "JUMP_SHRUGS" || id === "DB_SNATCH" || id === "MID_THIGH_PULL" || id === "SPLIT_STANCE_TRAP_BAR_DEADLIFT" || id === "RFESS") {
    if (method !== "ISO") score += 2;
  }

  return score;
}

function findParsedExerciseIndexForSupportedId(
  exercises: ParsedExercise[] | null | undefined,
  id: SupportedExerciseId | null
): number {
  if (!id || !Array.isArray(exercises)) return -1;

  let bestIdx = -1;
  let bestScore = -1;

  exercises.forEach((exercise, idx) => {
    if (!exercise || exercise.isHeader) return;
    const score = scoreParsedExerciseForSupportedId(exercise, id);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });

  return bestIdx;
}

function findParsedExerciseForSupportedId(
  exercises: ParsedExercise[] | null | undefined,
  id: SupportedExerciseId | null
): ParsedExercise | null {
  const idx = findParsedExerciseIndexForSupportedId(exercises, id);
  return idx >= 0 && exercises ? exercises[idx] ?? null : null;
}

/* ---- ExerciseCard ---- */
function ExerciseCard({
  ex,
  accent,
  blockLabel,
  dimmed,
  recommendationContext,
  availableExercises,
  onSelectRecommendedExerciseId,
  disableInternalExerciseSwap,
  planExerciseName,
  hideRecommendationUi,
  forcedExerciseId,
}: {
  ex: ParsedExercise;
  accent: ReturnType<typeof blockAccent>;
  blockLabel?: string;
  dimmed?: boolean;
  recommendationContext?: ExerciseRecommendationContext | null;
  availableExercises?: ParsedExercise[] | null;
  onSelectRecommendedExerciseId?: ((id: SupportedExerciseId | null) => void) | null;
  disableInternalExerciseSwap?: boolean;
  /** The name of the exercise as originally written in the training plan (for the "Upprunalegt plan:" label) */
  planExerciseName?: string;
  hideRecommendationUi?: boolean;
  forcedExerciseId?: SupportedExerciseId | null;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [lang] = useLang();
  const tCard = PLAYER_COPY[lang];
  const hasRecommendationContext = !!recommendationContext;
  const recommendation = useMemo(
    () =>
      hasRecommendationContext
        ? getExerciseRecommendation({
            ...(recommendationContext ?? {}),
            originalExerciseName: ex.name,
            lang,
          })
        : null,
    [ex.name, hasRecommendationContext, recommendationContext, lang]
  );
  const uiInfo = useMemo(
    () => (recommendation ? getExerciseRecommendationUiInfo(recommendation, lang) : { badgeLabel: null, badgeTone: "neutral" as const, shortReason: null, playerReason: null }),
    [recommendation, lang]
  );
  const [overrideExerciseId, setOverrideExerciseId] = useState<SupportedExerciseId | null>(null);

  const selectedExerciseId =
    forcedExerciseId ??
    overrideExerciseId ??
    // Default to the PLAN exercise; the engine's pick is offered as an option,
    // so the focus screen matches the Today card and the swap is opt-in.
    recommendation?.originalExerciseId ??
    recommendation?.recommendedExerciseId ??
    null;
  const selectedExerciseLabel = getSupportedExerciseLabel(selectedExerciseId) ?? ex.name;
  const matchedExercise = findParsedExerciseForSupportedId(availableExercises, selectedExerciseId);
  const internallySwappedExerciseBase: ParsedExercise = matchedExercise
    ? matchedExercise
    : selectedExerciseId && selectedExerciseLabel !== ex.name
      ? { ...ex, name: selectedExerciseLabel, method: exerciseMethodForId(selectedExerciseId, ex.method) }
      : ex;
  const internallySwappedExercise = applySupportedExerciseDisplayOverride(
    internallySwappedExerciseBase,
    selectedExerciseId
  );
  const effectiveExercise: ParsedExercise = applySupportedExerciseDisplayOverride(
    disableInternalExerciseSwap ? ex : internallySwappedExercise,
    selectedExerciseId
  );

  const allowedAlternativeIds = (recommendation?.allowedExerciseIds ?? []).filter((id) => id !== selectedExerciseId);
  const restrictedLabels = recommendation?.restrictedExerciseIds
    ? recommendation.restrictedExerciseIds
        .map((id) => getSupportedExerciseLabel(id))
        .filter((label): label is string => !!label)
    : [];

  return (
    <>
      <div className={cx("rounded-xl border px-3 py-2", accent.itemBorder, accent.itemBg)} style={accent.itemBorderStyle}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">
            <span className="text-sm font-semibold text-zinc-900 leading-snug">{effectiveExercise.name}</span>
            {effectiveExercise.setsReps ? (
              <span className="text-xs font-semibold text-zinc-500 whitespace-nowrap">{effectiveExercise.setsReps}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {effectiveExercise.method ? (
              <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-bold", accent.methodBadge)} style={accent.methodBadgeStyle}>
                {effectiveExercise.method}
              </span>
            ) : null}
            {/* Info button — only on non-dimmed cards */}
            {!dimmed ? (
              <button
                onClick={(e) => { e.stopPropagation(); setInfoOpen(true); }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 text-xs hover:border-zinc-300 hover:text-zinc-600 transition-colors"
                aria-label="Info"
              >
                ⓘ
              </button>
            ) : null}
          </div>
        </div>
        {effectiveExercise.note ? <div className="mt-0.5 text-xs text-zinc-500">{effectiveExercise.note}</div> : null}

        {!dimmed && !hideRecommendationUi && recommendation?.shouldRenderRecommendation && uiInfo.badgeLabel ? (
          <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", recommendationBadgeToneClass(uiInfo.badgeTone))}>
                {uiInfo.badgeLabel}
              </span>
              {uiInfo.shortReason ? (
                <span className="text-[11px] font-medium text-zinc-600">{uiInfo.shortReason}</span>
              ) : null}
            </div>
            {uiInfo.playerReason ? <div className="mt-1 text-xs text-zinc-600">{uiInfo.playerReason}</div> : null}
            {selectedExerciseLabel !== ex.name ? (
              <div className="mt-1 text-[11px] text-zinc-500">{tCard.training.origPlan} {planExerciseName ?? ex.name}</div>
            ) : null}
            {allowedAlternativeIds.length ? (
              <div className="mt-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{tCard.training.otherOptions}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {allowedAlternativeIds.map((id) => {
                    const label = getSupportedExerciseLabel(id);
                    if (!label) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setOverrideExerciseId(id);
                          onSelectRecommendedExerciseId?.(id);
                        }}
                        className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                      >
                        {label}
                      </button>
                    );
                  })}
                  {overrideExerciseId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOverrideExerciseId(null);
                        onSelectRecommendedExerciseId?.(recommendation?.recommendedExerciseId ?? recommendation?.originalExerciseId ?? null);
                      }}
                      className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200"
                    >
                      {tCard.training.useRecommended}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {restrictedLabels.length ? (
              <div className="mt-2 text-[11px] text-zinc-500">{tCard.training.notRecommended} {restrictedLabels.join(", ")}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      {infoOpen && blockLabel ? (
        <ExerciseInfoModal ex={effectiveExercise} blockLabel={blockLabel} blockRawTitle={accent.rawTitle} onClose={() => setInfoOpen(false)} />
      ) : null}
    </>
  );
}

/* ---- ChoiceGroup: header + multiple exercise options with dropdown ---- */
function ChoiceGroup({ header, options, accent, blockLabel, recommendationContext }: {
  header: string;
  options: ParsedExercise[];
  accent: ReturnType<typeof blockAccent>;
  blockLabel?: string;
  recommendationContext?: ExerciseRecommendationContext | null;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [hasManualSelection, setHasManualSelection] = useState(false);
  const [lang] = useLang();
  const tCG = PLAYER_COPY[lang];
  const hasRecommendationContext = !!recommendationContext;
  const selected = options[selectedIdx];
  const original = options[0];
  const recommendationSeedExercise = useMemo(
    () => options.find((option) => !!normalizeExerciseNameToId(option?.name ?? "")) ?? null,
    [options]
  );
  const defaultRecommendedExerciseId = useMemo(() => {
    if (!hasRecommendationContext || !recommendationSeedExercise) return null;
    return getExerciseRecommendation({
      ...(recommendationContext ?? {}),
      originalExerciseName: recommendationSeedExercise.name,
      lang,
    }).recommendedExerciseId;
  }, [hasRecommendationContext, recommendationContext, recommendationSeedExercise, lang]);
  const groupRecommendation = useMemo(() => {
    if (!hasRecommendationContext || !recommendationSeedExercise) return null;
    return getExerciseRecommendation({
      ...(recommendationContext ?? {}),
      originalExerciseName: recommendationSeedExercise.name,
      lang,
    });
  }, [hasRecommendationContext, recommendationContext, recommendationSeedExercise, lang]);
  const groupRecommendationUi = useMemo(
    () => (groupRecommendation ? getExerciseRecommendationUiInfo(groupRecommendation, lang) : null),
    [groupRecommendation, lang]
  );
  const selectedExerciseId = useMemo(
    () => normalizeExerciseNameToId(selected?.name ?? ""),
    [selected]
  );
  const allowedAlternativeIds =
    groupRecommendation?.allowedExerciseIds.filter((id) => id !== selectedExerciseId) ?? [];
  const restrictedLabels =
    groupRecommendation?.restrictedExerciseIds
      .map((id) => getSupportedExerciseLabel(id))
      .filter((label): label is string => !!label) ?? [];
  const genericAlternativeOptions = useMemo(
    () => options.filter((_, idx) => idx !== selectedIdx),
    [options, selectedIdx]
  );

  useEffect(() => {
    if (hasManualSelection || !defaultRecommendedExerciseId) return;
    const nextIdx = findParsedExerciseIndexForSupportedId(options, defaultRecommendedExerciseId);
    if (nextIdx >= 0 && nextIdx !== selectedIdx) {
      setSelectedIdx(nextIdx);
    }
  }, [defaultRecommendedExerciseId, hasManualSelection, options, selectedIdx]);

  const selectExerciseId = (id: SupportedExerciseId | null, manual: boolean) => {
    if (!id) return;
    const nextIdx = findParsedExerciseIndexForSupportedId(options, id);
    if (nextIdx >= 0) {
      setHasManualSelection(manual);
      setSelectedIdx(nextIdx);
    }
  };
  const handleRecommendedExerciseSelect = (id: SupportedExerciseId | null) => {
    selectExerciseId(id, true);
  };
  return (
    <div>
      {/* Choice header */}
      <div className={cx("mt-1 rounded-lg border px-3 py-2 flex items-center gap-2", accent.choiceHeader)} style={accent.choiceHeaderStyle}>
        <span className="text-[13px] font-bold leading-snug">
          ▸ {lang === "EN"
            ? header.replace(/:$/, "").replace(/veldu\s+(\d+)\s+leið\w*/i, "Choose $1").replace(/veldu/i, "Choose")
            : header.replace(/:$/, "")}
        </span>
      </div>
      {/* Selected exercise */}
      {selected ? (
        <div className="mt-1.5">
          <ExerciseCard
            ex={selected}
            accent={accent}
            blockLabel={blockLabel}
            recommendationContext={recommendationContext}
            availableExercises={options}
            onSelectRecommendedExerciseId={handleRecommendedExerciseSelect}
            disableInternalExerciseSwap
            planExerciseName={recommendationSeedExercise?.name ?? options[0]?.name}
            hideRecommendationUi
          />
        </div>
      ) : null}
      {groupRecommendation &&
      groupRecommendationUi?.badgeLabel &&
      groupRecommendation.shouldRenderRecommendation &&
      selected ? (
        <div className={cx("mt-1.5", recommendationPanelClass(accent).cls)} style={recommendationPanelClass(accent).style}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", recommendationBadgeToneClass(groupRecommendationUi.badgeTone))}>
              {groupRecommendationUi.badgeLabel}
            </span>
            {groupRecommendationUi.shortReason ? (
              <span className="text-[11px] font-medium text-zinc-600">{groupRecommendationUi.shortReason}</span>
            ) : null}
          </div>
          {groupRecommendationUi.playerReason ? (
            <div className="mt-1 text-xs text-zinc-600">{groupRecommendationUi.playerReason}</div>
          ) : null}
          {recommendationSeedExercise && selected.name !== recommendationSeedExercise.name ? (
            <div className="mt-1 text-[11px] text-zinc-500">{tCG.training.origPlan} {recommendationSeedExercise.name}</div>
          ) : null}
          {allowedAlternativeIds.length ? (
            <div className="mt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{tCG.training.otherOptions}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {allowedAlternativeIds.map((id) => {
                  const label = getSupportedExerciseLabel(id);
                  if (!label) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleRecommendedExerciseSelect(id)}
                      className="rounded-full border border-zinc-200 bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-white"
                    >
                      {label}
                    </button>
                  );
                })}
                {hasManualSelection ? (
                  <button
                    type="button"
                    onClick={() => {
                      selectExerciseId(
                        groupRecommendation.recommendedExerciseId ?? groupRecommendation.originalExerciseId,
                        false
                      );
                    }}
                    className="rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-white"
                  >
                    {tCG.training.useRecommended}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {restrictedLabels.length ? (
            <div className="mt-2 text-[11px] text-zinc-500">{tCG.training.notRecommended} {restrictedLabels.join(", ")}</div>
          ) : null}
        </div>
      ) : selected && genericAlternativeOptions.length ? (
        <div className={cx("mt-1.5", recommendationPanelClass(accent).cls)} style={recommendationPanelClass(accent).style}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{tCG.training.otherOptions}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {genericAlternativeOptions.map((option, idx) => (
              <button
                key={`${option.name}-${idx}`}
                type="button"
                onClick={() => {
                  setHasManualSelection(true);
                  const nextIdx = options.findIndex((candidate) => candidate === option);
                  if (nextIdx >= 0) setSelectedIdx(nextIdx);
                }}
                className="rounded-full border border-zinc-200 bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-white"
              >
                {option.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecommendedExerciseBlockCard({
  ex,
  accent,
  blockLabel,
  recommendationContext,
}: {
  ex: ParsedExercise;
  accent: ReturnType<typeof blockAccent>;
  blockLabel?: string;
  recommendationContext?: ExerciseRecommendationContext | null;
}) {
  const [lang] = useLang();
  const tREC = PLAYER_COPY[lang];
  const recommendation = useMemo(
    () =>
      recommendationContext
        ? getExerciseRecommendation({
            ...(recommendationContext ?? {}),
            originalExerciseName: ex.name,
            lang,
          })
        : null,
    [ex.name, recommendationContext, lang]
  );
  const uiInfo = useMemo(
    () => (recommendation ? getExerciseRecommendationUiInfo(recommendation, lang) : { badgeLabel: null, badgeTone: "neutral" as const, shortReason: null, playerReason: null }),
    [recommendation, lang]
  );
  const [overrideExerciseId, setOverrideExerciseId] = useState<SupportedExerciseId | null>(null);
  const selectedExerciseId =
    overrideExerciseId ??
    // Default to the PLAN exercise; the engine's pick is offered as an option.
    recommendation?.originalExerciseId ??
    recommendation?.recommendedExerciseId ??
    null;
  const selectedExerciseLabel = getSupportedExerciseLabel(selectedExerciseId) ?? ex.name;
  const allowedAlternativeIds = (recommendation?.allowedExerciseIds ?? []).filter((id) => id !== selectedExerciseId);
  const restrictedLabels = recommendation?.restrictedExerciseIds
    ? recommendation.restrictedExerciseIds
        .map((id) => getSupportedExerciseLabel(id))
        .filter((label): label is string => !!label)
    : [];

  if (!recommendationContext || !recommendation?.shouldRenderRecommendation || !uiInfo.badgeLabel) {
    return <ExerciseCard ex={ex} accent={accent} blockLabel={blockLabel} recommendationContext={recommendationContext} />;
  }

  return (
    <div className="space-y-1.5">
      <ExerciseCard
        ex={ex}
        accent={accent}
        blockLabel={blockLabel}
        recommendationContext={recommendationContext}
        hideRecommendationUi
        forcedExerciseId={selectedExerciseId}
        planExerciseName={ex.name}
      />

      <div className={recommendationPanelClass(accent).cls} style={recommendationPanelClass(accent).style ?? undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", recommendationBadgeToneClass(uiInfo.badgeTone))}>
            {uiInfo.badgeLabel}
          </span>
          {uiInfo.shortReason ? (
            <span className="text-[11px] font-medium text-zinc-600">{uiInfo.shortReason}</span>
          ) : null}
        </div>
        {uiInfo.playerReason ? <div className="mt-1 text-xs text-zinc-600">{uiInfo.playerReason}</div> : null}
        {selectedExerciseLabel !== ex.name ? (
          <div className="mt-1 text-[11px] text-zinc-500">{tREC.training.origPlan} {ex.name}</div>
        ) : null}
        {allowedAlternativeIds.length ? (
          <div className="mt-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{tREC.training.otherOptions}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {allowedAlternativeIds.map((id) => {
                const label = getSupportedExerciseLabel(id);
                if (!label) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOverrideExerciseId(id)}
                    className="rounded-full border border-zinc-200 bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-white"
                  >
                    {label}
                  </button>
                );
              })}
              {overrideExerciseId ? (
                <button
                  type="button"
                  onClick={() => setOverrideExerciseId(null)}
                  className="rounded-full border border-zinc-200 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-white"
                >
                  {tREC.training.useRecommended}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {restrictedLabels.length ? (
          <div className="mt-2 text-[11px] text-zinc-500">{tREC.training.notRecommended} {restrictedLabels.join(", ")}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---- Segment helpers for grouping parsed items ---- */
type ExSegment =
  | { kind: "exercise"; ex: ParsedExercise }
  | { kind: "choice"; header: string; options: ParsedExercise[]; shared?: Pick<ParsedExercise, "setsReps" | "method" | "note"> };

function groupIntoSegments(parsed: ParsedExercise[]): ExSegment[] {
  const segments: ExSegment[] = [];
  let previousChoiceShared: Pick<ParsedExercise, "setsReps" | "method" | "note"> | null = null;
  for (const item of parsed) {
    if (item.isHeader) {
      const isPlyoHeader = /^plyo$/i.test(item.name) || /^plyo\b/i.test(item.name);
      const shared: Pick<ParsedExercise, "setsReps" | "method" | "note"> = {
        setsReps:
          item.setsReps ??
          (isPlyoHeader
            ? stripVelocityQualifier(previousChoiceShared?.setsReps ?? null)
            : null),
        method: item.method ?? null,
        note:
          item.note ??
          (isPlyoHeader
            ? previousChoiceShared?.note ?? null
            : null),
      };
      segments.push({ kind: "choice", header: item.name, options: [], shared });
      previousChoiceShared = shared;
    } else {
      const last = segments[segments.length - 1];
      if (last && last.kind === "choice") {
        last.options.push({
          ...item,
          setsReps: item.setsReps ?? last.shared?.setsReps ?? null,
          method: item.method ?? last.shared?.method ?? null,
          note: item.note ?? last.shared?.note ?? null,
        });
      } else {
        segments.push({ kind: "exercise", ex: item });
      }
    }
  }
  return segments;
}

function isRulesBlockTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return normalized === "rules" || normalized === "reglur" || normalized === "partur";
}

function splitMigratableRuleItems(items: string[]): {
  retainedItems: string[];
  migratedItems: string[];
} {
  const retainedItems: string[] = [];
  const migratedItems: string[] = [];

  for (const rawItem of items) {
    const parsed = parseExerciseItem(rawItem);
    const supportedId = !parsed.isHeader ? normalizeExerciseNameToId(parsed.name) : null;
    const group = supportedId ? getRecommendationGroupForExercise(supportedId) : null;
    if (group === "EXPLOSIVE_ACCESSORY") {
      migratedItems.push(rawItem);
    } else {
      retainedItems.push(rawItem);
    }
  }

  return { retainedItems, migratedItems };
}

function findPreferredTargetBlockIndex(
  blocks: Array<{ block?: string; items?: string[] }>,
  fromIdx: number,
  migratedItems: string[]
): number {
  const migratedIds = migratedItems
    .map((rawItem) => {
      const parsed = parseExerciseItem(rawItem);
      return parsed.isHeader ? null : normalizeExerciseNameToId(parsed.name);
    })
    .filter((id): id is SupportedExerciseId => !!id);

  const groups = new Set(migratedIds.map((id) => getRecommendationGroupForExercise(id)).filter(Boolean));

  for (let targetIdx = fromIdx - 1; targetIdx >= 0; targetIdx -= 1) {
    const prevTitle = String(blocks[targetIdx]?.block ?? "").trim();
    if (isRulesBlockTitle(prevTitle)) continue;

    const priority = blockSortPriority(prevTitle);
    if (
      groups.has("EXPLOSIVE_ACCESSORY") &&
      priority === 1
    ) {
      return targetIdx;
    }
    if (
      groups.has("UNILATERAL_STRENGTH_ACCESSORY") &&
      priority === 2
    ) {
      return targetIdx;
    }
  }

  const hasSupportedGroups =
    groups.has("EXPLOSIVE_ACCESSORY") || groups.has("UNILATERAL_STRENGTH_ACCESSORY");

  if (hasSupportedGroups) {
    return -1;
  }

  for (let targetIdx = fromIdx - 1; targetIdx >= 0; targetIdx -= 1) {
    const prevTitle = String(blocks[targetIdx]?.block ?? "").trim();
    if (!isRulesBlockTitle(prevTitle)) return targetIdx;
  }

  return -1;
}

function rebalanceRulesBlocks(rawBlocks: any[]): any[] {
  const blocks = rawBlocks.map((block) => ({
    ...block,
    items: safeStringList(block?.items),
  }));

  for (let i = 0; i < blocks.length; i += 1) {
    const title = String(blocks[i]?.block ?? "").trim();
    if (!isRulesBlockTitle(title)) continue;

    const { retainedItems, migratedItems } = splitMigratableRuleItems(blocks[i]?.items ?? []);
    if (!migratedItems.length) continue;

    const targetIdx = findPreferredTargetBlockIndex(blocks, i, migratedItems);
    if (targetIdx < 0) continue;

    blocks[targetIdx] = {
      ...blocks[targetIdx],
      items: [...safeStringList(blocks[targetIdx]?.items), ...migratedItems],
    };
    blocks[i] = {
      ...blocks[i],
      items: retainedItems,
    };
  }

  return blocks.filter((block) => {
    const title = String(block?.block ?? "").trim();
    const items = safeStringList(block?.items);
    if (!isRulesBlockTitle(title)) return true;
    return items.length > 0;
  });
}

function rebalanceSupportedExerciseBlocks(rawBlocks: any[]): any[] {
  const blocks = rawBlocks.map((block) => ({
    ...block,
    items: safeStringList(block?.items),
  }));

  for (let i = 0; i < blocks.length; i += 1) {
    const currentTitle = String(blocks[i]?.block ?? "").trim();
    const currentPriority = blockSortPriority(currentTitle);
    if (currentPriority === 1 || currentPriority === 2) continue;

    const retainedItems: string[] = [];
    const explosiveItemsToMove: string[] = [];

    for (const rawItem of blocks[i]?.items ?? []) {
      const parsed = parseExerciseItem(rawItem);
      const supportedId = !parsed.isHeader ? normalizeExerciseNameToId(parsed.name) : null;
      const group = supportedId ? getRecommendationGroupForExercise(supportedId) : null;

      if (group === "EXPLOSIVE_ACCESSORY") {
        explosiveItemsToMove.push(rawItem);
      } else {
        retainedItems.push(rawItem);
      }
    }

    let nextItems = retainedItems;

    if (explosiveItemsToMove.length) {
      const targetIdx = findPreferredTargetBlockIndex(blocks, i, explosiveItemsToMove);
      if (targetIdx >= 0 && targetIdx !== i) {
        blocks[targetIdx] = {
          ...blocks[targetIdx],
          items: [...safeStringList(blocks[targetIdx]?.items), ...explosiveItemsToMove],
        };
      } else {
        nextItems = [...nextItems, ...explosiveItemsToMove];
      }
    }

    blocks[i] = {
      ...blocks[i],
      items: nextItems,
    };
  }

  return blocks.filter((block) => safeStringList(block?.items).length > 0);
}

// Readiness-adjusted "Æfing dagsins": derive the session adjustment from the
// plan's own readiness_level (native — the old DOM-scraping path in
// PlayerTabbedClient no longer matches this markup, so nothing was being
// adjusted). Reuses the canonical buildEnforcedSessionPlan enforcement so the
// numbers match the rest of the system: GREEN → full, YELLOW → one set off each
// lift, RED → recovery (hardest blocks dropped).
type TodayAdjust = { state: "GREEN" | "YELLOW" | "RED" | "GRAY"; setReduction: number; hideHighOutput: boolean };
const HIGH_OUTPUT_BLOCK = /(primer|ballistic|plyo|explosive|contrast|main force)/i;

function reduceSetsInLine(line: string, by: number): string {
  if (by <= 0) return line;
  const fromPair = line.replace(/(\d+)\s*[x×]\s*(\d+)/i, (_, sets, reps) => `${Math.max(1, Number(sets) - by)}×${reps}`);
  return fromPair.replace(/(\d+)\s*sets?/i, (_, sets) => `${Math.max(1, Number(sets) - by)} set`);
}

function computeTodayAdjust(readinessLevel: string | null): TodayAdjust {
  const l = String(readinessLevel ?? "").toUpperCase();
  const ateState = l === "GREEN_PLUS" ? "GREEN_PLUS" : l === "GREEN" ? "GREEN" : l === "YELLOW" ? "YELLOW" : l === "RED" ? "RED" : null;
  const enforced = buildEnforcedSessionPlan({
    ateState,
    modifiers: ateState === "YELLOW" ? { reduceSetsBy: 1 } : null,
    fallbackSessionMode: "full",
    hasCheckIn: ateState != null,
  });
  const adj = enforced.adjustments;
  const state = enforced.state === "GREEN" ? "GREEN" : enforced.state === "YELLOW" ? "YELLOW" : enforced.state === "RED" ? "RED" : "GRAY";
  return {
    state,
    setReduction: Math.min(1, Math.max(0, adj.setReduction ?? 0)),
    hideHighOutput: enforced.sessionMode === "recovery" || !!adj.disablePlyo || !!adj.disableBallistic,
  };
}

// One prepared block for rendering — the SINGLE source both the Today card and
// the "Byrja æfingu" focus screen consume, so what the card shows and what the
// focus flow walks through can never drift (same sort, same high-output filter,
// same readiness set-reduction).
type SessionBlock = {
  title: string;
  accent: BlockAccentResult;
  priority: number;
  segments: ExSegment[];
  /** Structure-library method this block was built from, if any. */
  howTo?: string[];
  methodLabel?: string | null;
};

function buildSessionBlocks(
  structure: unknown,
  adjust: TodayAdjust | null,
  themeColor: string | null,
  // Coach-authored programmes carry an explicit Block 1→2→3 order the coach
  // chose; preserve it instead of re-sorting by "money block" priority (which is
  // right for the auto team session but scrambles a coach's numbered template).
  preserveOrder = false
): { blocks: SessionBlock[]; hiddenCount: number; totalBlocks: number } {
  const rawBlocks = Array.isArray(structure) ? structure : [];
  if (!rawBlocks.length) return { blocks: [], hiddenCount: 0, totalBlocks: 0 };

  const normalizedBlocks = rebalanceRulesBlocks(rawBlocks);
  const sorted = preserveOrder
    ? normalizedBlocks
    : [...normalizedBlocks].sort(
        (a, b) => blockSortPriority(String(a?.block ?? "")) - blockSortPriority(String(b?.block ?? ""))
      );
  const kept = adjust?.hideHighOutput
    ? sorted.filter((b: Record<string, unknown>) => !HIGH_OUTPUT_BLOCK.test(String(b?.block ?? "")))
    : sorted;
  const hiddenCount = sorted.length - kept.length;

  const blocks: SessionBlock[] = kept.map((b: Record<string, unknown>, idx: number) => {
    const title = String(b?.block ?? `Block ${idx + 1}`);
    const items = safeStringList(b?.items);
    const accent = blockAccent(title, themeColor);
    const priority = blockSortPriority(title);
    // Keep ORIGINAL sets×reps here; the readiness reduction is applied at render
    // (card shows struck-original → adjusted; focus screen shows the adjusted
    // value) via reduceExercise() so the "was 4 → 3" can be surfaced.
    const parsed = items.map(parseExerciseItem);
    const segments = groupIntoSegments(parsed);
    // Carry the method's "how to perform" through to the player, keyed by the
    // structureId the coach's builder stamped on this block.
    const sid = typeof b?.structureId === "string" ? b.structureId : undefined;
    const howTo = structureHowTo(sid) ?? undefined;
    return { title, accent, priority, segments, howTo, methodLabel: structureLabel(sid) };
  });

  return { blocks, hiddenCount, totalBlocks: sorted.length };
}

/** Apply the readiness set-reduction to a single exercise's sets×reps. */
function reduceExercise(ex: ParsedExercise, adjust: TodayAdjust | null): ParsedExercise {
  if (!adjust || adjust.setReduction <= 0 || !ex.setsReps) return ex;
  return { ...ex, setsReps: reduceSetsInLine(ex.setsReps, adjust.setReduction) };
}

/** Split a leading block label ("A.", "B1.", "C)") off the exercise name. */
function splitExerciseLetter(name: string): { letter: string | null; rest: string } {
  const m = name.match(/^([A-Ca-c]\d?)[.):]\s*(.*)$/);
  if (m && m[2].trim()) return { letter: m[1].toUpperCase(), rest: m[2].trim() };
  return { letter: null, rest: name };
}

/** Plain one-line descriptor for an exercise = method · note. */
function exerciseDescriptor(ex: ParsedExercise): string | null {
  const parts = [ex.method, ex.note].filter((x): x is string => !!x && x.trim().length > 0);
  return parts.length ? parts.join(" · ") : null;
}

/** Rough per-session minute estimate from block count + exercise volume. */
function estimateSessionMinutes(blocks: SessionBlock[]): number {
  let total = 0;
  for (const b of blocks) {
    const exCount = b.segments.length;
    const perEx = b.priority === 0 ? 1.3 : b.priority === 1 ? 2.5 : b.priority === 2 ? 4 : 2;
    const base = b.priority === 2 ? 3 : 2;
    total += base + exCount * perEx;
  }
  return Math.max(5, Math.round(total / 5) * 5);
}

/** Pick the "money" block to feature on the card: main/contrast > primer > first. */
function pickPrimaryBlock(blocks: SessionBlock[]): SessionBlock | null {
  return (
    blocks.find((b) => b.priority === 2) ??
    blocks.find((b) => b.priority === 1) ??
    blocks.find((b) => b.priority !== 0) ??
    blocks[0] ??
    null
  );
}

/** Renders sets×reps with the original set-count struck when reduced. */
function SetsReps({ ex, adjust }: { ex: ParsedExercise; adjust: TodayAdjust | null }) {
  const original = ex.setsReps;
  if (!original) return null;
  const reduced = adjust && adjust.setReduction > 0 ? reduceSetsInLine(original, adjust.setReduction) : original;
  if (reduced === original) {
    return <span className="whitespace-nowrap text-sm font-semibold text-zinc-700">{original}</span>;
  }
  // Show the original leading set-count struck, then the adjusted string.
  const origLead = original.match(/^(\d+)/)?.[1] ?? null;
  return (
    <span className="whitespace-nowrap text-sm font-semibold text-zinc-800">
      {origLead ? <s className="mr-1 font-medium text-rose-400">{origLead}</s> : null}
      {reduced}
    </span>
  );
}

type TodaySessionOpts = {
  headerTitle?: string | null;
  headerDesc?: string | null;
  lockLabel?: string;
  t?: (typeof PLAYER_COPY)["IS"];
  recommendationContext?: ExerciseRecommendationContext | null;
  themeColor?: string | null;
  adjust?: TodayAdjust | null;
  /** True when this session was manually sent by the coach (overrides the
   *  default team session for today). Renders a labelled "sent by coach" banner
   *  and suppresses the readiness auto-adjust (already tuned when built). */
  sentByCoach?: boolean;
  /** Override the big card heading ("Today's session"). Used to distinguish a
   *  coach-sent template ("Recommended session") from the auto team session. */
  heading?: string | null;
  /** Override the "sent by coach" banner subtext (e.g. a coach note, or a
   *  supplement-appropriate line instead of the default "replaces …"). */
  coachSentSubtext?: string | null;
  /** Keep the coach's authored block order (don't re-sort by priority). */
  preserveOrder?: boolean;
};

/** Translate a raw DB block title for display (IS stored → EN when needed). */
function localizeBlockTitleText(title: string, isIS: boolean): string {
  // Strip a long descriptive tail after a colon so the heading stays short —
  // e.g. "A. Contrast: Do a heavy lift, rest shortly, …" → "A. Contrast".
  // The full method explanation lives in the goal box below the heading.
  let head = title;
  const colonIdx = head.indexOf(":");
  if (colonIdx > 0 && head.slice(colonIdx + 1).trim().split(/\s+/).length > 3) {
    head = head.slice(0, colonIdx).trim();
  }
  const lo = head.toLowerCase();
  if (isIS) return head;
  if (lo === "upphitun") return "Warm-up";
  if (lo === "reglur") return "Section";
  return head.replace(/\(veldu\s+(\d+)(?:\s+leið\w*)?\)/gi, "(choose $1)");
}

// Best-effort decomposition of a loosely-structured "sets×reps" string (+ note)
// into the stat blocks the focus screen shows (design 21b). Only fields that
// parse cleanly are returned; the caller falls back to the raw string otherwise.
function parseFocusStats(ex: ParsedExercise): { sets: number | null; reps: string | null; load: string | null; rest: string | null } {
  const sr = ex.setsReps ?? "";
  const hay = `${sr} ${ex.note ?? ""}`;
  let sets: number | null = null;
  const nx = sr.match(/(\d+)\s*[×xX]\s*\d+/);
  const nSett = sr.match(/(\d+)\s*(?:sett|sets?)\b/i);
  if (nx) sets = parseInt(nx[1], 10);
  else if (nSett) sets = parseInt(nSett[1], 10);
  let reps: string | null = null;
  const repsX = sr.match(/[×xX]\s*(\d+(?:[–-]\d+)?)/);
  const repsW = sr.match(/(\d+(?:[–-]\d+)?)\s*reps?\b/i);
  if (repsX) reps = repsX[1];
  else if (repsW) reps = repsW[1];
  let load: string | null = null;
  const pct = hay.match(/(\d+(?:[–-]\d+)?)\s*%/);
  const ms = hay.match(/([\d.]+(?:\s*[–-]\s*[\d.]+)?)\s*m\/s/i);
  if (pct) load = `${pct[1]}%`;
  else if (ms) load = `${ms[1].replace(/\s+/g, "")} m/s`;
  let rest: string | null = null;
  const restM = hay.match(/(\d+(?:[–-]\d+)?)\s*(sek|sec|mín|min)\b/i);
  if (restM) rest = `${restM[1]}${/m/i.test(restM[2]) ? "m" : "s"}`;
  return { sets, reps, load, rest };
}

// Strip a leading "A. " / "B1. " plan label and a trailing "(...)" note so the
// exercise name reads cleanly as a focus-screen heading.
function focusExName(raw: string): string {
  return (raw ?? "")
    .replace(/^\s*[A-Za-z]?\d*\s*[\.\)]\s*/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim() || raw;
}

// A focus-screen step is one of: a single exercise, a choice group, or a
// COMPLEX (contrast / French contrast) — a set of exercises done together in
// sequence within each set (e.g. B1 heavy → B2 explosive). Contrast pairs must
// share ONE screen and ONE set counter, not be split across screens.
type FocusStep =
  | { kind: "single"; block: SessionBlock; ex: ParsedExercise }
  | { kind: "choice"; block: SessionBlock; header: string; options: ParsedExercise[] }
  | { kind: "complex"; block: SessionBlock; members: ParsedExercise[]; restNote: string | null }
  | { kind: "list"; block: SessionBlock; items: ParsedExercise[] };

// A loose "rest / N sets between pairs" instruction line, not a real exercise.
function isRestInstruction(ex: ParsedExercise): boolean {
  const raw = ex.name ?? "";
  if (/^[a-c]\d?\s*[.):]/i.test(raw)) return false; // a labelled exercise (A., B1.)
  return /hv[íi]ld|\brest\b|milli para|between pairs|á milli para/i.test(raw);
}

// The number of times you cycle the complex = its set count. Prefer the explicit
// "N sett" on the rest line ("2–3 mín hvíld milli para · 4 sett"); else the first
// member's parsed set count.
function parseComplexSets(members: ParsedExercise[], restNote: string | null): number | null {
  const m = (restNote ?? "").match(/(\d+)\s*(?:sett|sets?)\b/i);
  if (m) return parseInt(m[1], 10);
  for (const ex of members) {
    const s = parseFocusStats(ex).sets;
    if (s) return s;
  }
  return null;
}

// Flatten blocks → ordered focus steps, grouping same-letter numbered exercises
// (B1/B2, A1–A4) into one complex step and absorbing the paired-rest line.
function buildFocusSteps(blocks: SessionBlock[]): FocusStep[] {
  const steps: FocusStep[] = [];
  for (const block of blocks) {
    // Warm-up is a quick sequential checklist — show every move on ONE page
    // instead of clicking through each one.
    if (block.accent.label === "Upphitun") {
      const items: ParsedExercise[] = [];
      for (const seg of block.segments) {
        if (seg.kind === "exercise") items.push(seg.ex);
        else items.push(...seg.options);
      }
      if (items.length) steps.push({ kind: "list", block, items });
      continue;
    }
    const segs = block.segments;
    let i = 0;
    while (i < segs.length) {
      const s = segs[i];
      if (s.kind === "choice") {
        steps.push({ kind: "choice", block, header: s.header, options: s.options });
        i++;
        continue;
      }
      const ex = s.ex;
      const { letter } = splitExerciseLetter(ex.name);
      const base = letter ? letter.charAt(0) : null;
      const hasDigit = letter ? /\d/.test(letter) : false;
      if (base && hasDigit) {
        // Gather same-base numbered members + any interleaved rest line.
        const members: ParsedExercise[] = [ex];
        let restNote: string | null = null;
        let j = i + 1;
        while (j < segs.length) {
          const sj = segs[j];
          if (sj.kind !== "exercise") break;
          const nl = splitExerciseLetter(sj.ex.name);
          if (nl.letter && nl.letter.charAt(0) === base && /\d/.test(nl.letter)) { members.push(sj.ex); j++; continue; }
          if (isRestInstruction(sj.ex)) { restNote = restNote ?? sj.ex.name; j++; continue; }
          break;
        }
        if (members.length > 1) {
          steps.push({ kind: "complex", block, members, restNote });
          i = j;
          continue;
        }
      }
      steps.push({ kind: "single", block, ex });
      i++;
    }
  }
  return steps;
}

// Curated swap options per contrast/complex category — lets a player pick a
// different lift within the same category (Heavy / Explosive). Session-local;
// no dependency on the narrow adaptive-engine exercise set.
const CONTRAST_SWAP_OPTIONS: Record<string, string[]> = {
  heavy: ["Trap-bar deadlift", "Back squat", "Front squat", "Romanian deadlift", "Hip thrust", "Split-stance trap bar deadlift"],
  strength: ["Trap-bar deadlift", "Back squat", "Front squat", "Romanian deadlift", "Hip thrust", "Split-stance trap bar deadlift"],
  explosive: ["Box jump", "Broad jump", "Trap-bar jump", "Jump squat", "Hurdle hops", "Depth jump"],
  plyo: ["Box jump", "Broad jump", "Trap-bar jump", "Jump squat", "Hurdle hops", "Depth jump"],
  ballistic: ["Box jump", "Broad jump", "Trap-bar jump", "Jump squat", "Hurdle hops", "Depth jump"],
};
function contrastSwapOptions(category: string | null | undefined, current: string): string[] {
  if (!category) return [];
  return (CONTRAST_SWAP_OPTIONS[category.toLowerCase()] ?? []).filter((o) => o.toLowerCase() !== current.toLowerCase());
}

// One member of a contrast/complex step: the full exercise card + a session-local
// "Swap exercise" picker sourced from the member's category.
function ContrastMember({
  index,
  ex,
  accent,
  blockLabel,
  recommendationContext,
  adjust,
  isIS,
}: {
  index: number;
  ex: ParsedExercise;
  accent: ReturnType<typeof blockAccent>;
  blockLabel?: string;
  recommendationContext?: ExerciseRecommendationContext | null;
  adjust?: TodayAdjust | null;
  isIS: boolean;
}) {
  const [swapName, setSwapName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { letter } = splitExerciseLetter(ex.name);
  const opts = contrastSwapOptions(ex.category, focusExName(ex.name));
  const shownEx: ParsedExercise = swapName ? { ...ex, name: `${letter ? `${letter}. ` : ""}${swapName}` } : ex;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef0ff] text-[11px] font-bold text-[#2740e6]">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <RecommendedExerciseBlockCard ex={reduceExercise(shownEx, adjust ?? null)} accent={accent} blockLabel={blockLabel} recommendationContext={recommendationContext} />
        {opts.length ? (
          <div className="mt-1.5">
            <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-semibold text-[#2740e6]">
              {swapName ? (isIS ? "Skipta aftur" : "Change") : isIS ? "Skipta um æfingu" : "Swap exercise"} {open ? "▲" : "▾"}
            </button>
            {open ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {swapName ? (
                  <button type="button" onClick={() => { setSwapName(null); setOpen(false); }} className="rounded-full border border-[#2740e6]/40 bg-[#eef0ff] px-2.5 py-1 text-[11px] font-medium text-[#2740e6]">
                    {isIS ? "Upprunaleg" : "Original"}
                  </button>
                ) : null}
                {opts.map((o) => (
                  <button key={o} type="button" onClick={() => { setSwapName(o); setOpen(false); }} className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50">
                    {o}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---- Focus screen: the full session, one exercise at a time (design 21b) ---- */
function SessionFocusScreen({
  blocks,
  t,
  recommendationContext,
  adjust,
  onClose,
}: {
  blocks: SessionBlock[];
  t: (typeof PLAYER_COPY)["IS"];
  recommendationContext?: ExerciseRecommendationContext | null;
  adjust?: TodayAdjust | null;
  onClose: () => void;
}) {
  const isIS = t === PLAYER_COPY.IS;

  // Design 21b — walk the session one EXERCISE at a time (not one block), with a
  // per-exercise set counter. Flatten every block's segments into an ordered
  // step list; each step is a single exercise (or a choice group).
  const steps = useMemo(() => buildFocusSteps(blocks), [blocks]);
  const total = steps.length;

  const [stepIdx, setStepIdx] = useState(0);
  const [doneSets, setDoneSets] = useState(0);
  const [finished, setFinished] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);

  const clampedIdx = Math.min(stepIdx, Math.max(0, total - 1));
  const cur = steps[clampedIdx] ?? null;
  const isLastStep = clampedIdx >= total - 1;
  const block = cur?.block ?? null;
  const recCtx = block && (block.priority === 1 || block.priority === 2) ? recommendationContext ?? null : null;

  // Single-exercise stat/set derivation (complex uses its shared set count).
  const baseEx = cur?.kind === "single" ? cur.ex : null;
  const reducedEx = baseEx ? reduceExercise(baseEx, adjust ?? null) : null;
  const stats = reducedEx ? parseFocusStats(reducedEx) : null;
  const complexSets = cur?.kind === "complex" ? parseComplexSets(cur.members, cur.restNote) : null;
  const setCount = cur?.kind === "complex" ? complexSets : stats?.sets ?? null;

  const primaryMethod = cur?.kind === "single" ? cur.ex.method : cur?.kind === "complex" ? (cur.members.find((m) => m.method)?.method ?? null) : null;
  const methodDisplay = primaryMethod
    ? (/^(ISO|EMOM|AMRAP|MET)$/.test(primaryMethod) ? primaryMethod : primaryMethod.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" "))
    : null;
  const guide = primaryMethod ? METHOD_GUIDE[primaryMethod] ?? null : null;

  const nextStep = steps[clampedIdx + 1] ?? null;
  const nextName = nextStep
    ? focusExName(
        nextStep.kind === "choice"
          ? nextStep.header
          : nextStep.kind === "complex"
            ? nextStep.members[0].name
            : nextStep.kind === "list"
              ? (localizeBlockTitleText(nextStep.block.title, isIS))
              : nextStep.ex.name
      )
    : null;
  const onLastSet = !setCount || setCount <= 1 || doneSets + 1 >= setCount;

  const advance = () => {
    setDoneSets(0);
    if (isLastStep) setFinished(true);
    else setStepIdx((i) => Math.min(total - 1, i + 1));
  };
  const primaryAction = () => {
    if (!onLastSet) setDoneSets((s) => s + 1);
    else advance();
  };
  const goBack = () => {
    setDoneSets(0);
    setStepIdx((i) => Math.max(0, i - 1));
  };

  const kicker = block ? `${localizeBlockTitleText(block.title, isIS)} · ${clampedIdx + 1} ${isIS ? "af" : "of"} ${total}` : "";
  const primaryLabel = onLastSet
    ? (isLastStep ? (isIS ? "Klára æfingu ✓" : "Finish session ✓") : (isIS ? "Lokið →" : "Done →"))
    : (isIS ? "Sett lokið ✓" : "Set complete ✓");

  // Shared set-counter chips (single exercise OR one round of a complex).
  const setCounter = setCount && setCount > 1 ? (
    <div className="grid grid-flow-col auto-cols-fr gap-2">
      {Array.from({ length: setCount }, (_, i) => {
        const done = i < doneSets;
        const now = i === doneSets;
        return (
          <div
            key={i}
            className={cx(
              "rounded-xl border py-2.5 text-center",
              done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : now ? "border-[#2740e6]/50 bg-[#eef0ff] text-[#2740e6]" : "border-zinc-200 text-zinc-400"
            )}
          >
            <div className="text-sm font-bold leading-none">{done ? "✓" : i + 1}</div>
            <div className="mt-1 text-[10px] font-medium">{now ? (isIS ? "Núna" : "Now") : isIS ? `Sett ${i + 1}` : `Set ${i + 1}`}</div>
          </div>
        );
      })}
    </div>
  ) : null;

  const overlay = (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header + segmented progress (one segment per exercise) */}
      <div className="shrink-0 border-b border-zinc-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-bold text-zinc-900">{isIS ? "Æfing dagsins" : "Today's session"}</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 active:bg-zinc-200"
            aria-label={isIS ? "Loka" : "Close"}
          >
            ✕
          </button>
        </div>
        <div className="mt-3 flex gap-1">
          {steps.map((_, i) => (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-[#2740e6]" style={{ width: finished || i <= clampedIdx ? "100%" : "0%" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {finished ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
            <div className="mt-4 text-xl font-bold text-zinc-900">{isIS ? "Æfingu lokið" : "Session complete"}</div>
            <div className="mt-1 max-w-xs text-sm text-zinc-500">
              {isIS ? "Vel gert. Mundu að skrá RPE eftir æfinguna." : "Nice work. Remember to log your RPE after the session."}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full bg-[#2740e6] px-6 py-2.5 text-sm font-bold text-white transition-opacity active:opacity-90"
            >
              {isIS ? "Loka" : "Close"}
            </button>
          </div>
        ) : cur ? (
          <div className="mx-auto max-w-lg space-y-4">
            {/* Block context line: e.g. "A. CONTRAST · 5 af 12" */}
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2740e6]">
              <span className={cx("h-2 w-2 rounded-full", block?.accent.dot)} style={block?.accent.dotStyle} />
              {kicker}
            </div>

            {/* How to perform — the method's execution guide for this block. */}
            {block?.howTo && block.howTo.length > 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50">
                <button
                  type="button"
                  onClick={() => setHowToOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#2740e6] text-[10px] font-bold text-white">i</span>
                  <span className="text-[12.5px] font-semibold text-zinc-700">
                    {isIS ? "Hvernig á að framkvæma" : "How to perform"}
                    {block.methodLabel ? ` — ${block.methodLabel}` : ""}
                  </span>
                  <span className={cx("ml-auto text-[10px] text-zinc-400 transition-transform", howToOpen && "rotate-180")}>▾</span>
                </button>
                {howToOpen ? (
                  <ol className="space-y-1.5 border-t border-zinc-200 px-3.5 py-2.5">
                    {block.howTo.map((step, i) => (
                      <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-zinc-600">
                        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-bold text-[#2740e6]">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : null}

            {cur.kind === "list" ? (
              <div className="space-y-2">
                {(() => {
                  const goal = block ? BLOCK_GOAL[block.accent.label] ?? null : null;
                  return goal ? (
                    <div className="mb-1 rounded-xl bg-zinc-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-600">
                      {isIS ? goal.IS : goal.EN}
                    </div>
                  ) : null;
                })()}
                {cur.items.map((m, k) => {
                  const rm = reduceExercise(m, adjust ?? null);
                  return (
                    <div key={k} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3.5 py-3">
                      <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">{focusExName(m.name)}</span>
                      {rm.setsReps ? <span className="shrink-0 text-sm font-medium text-zinc-500">{rm.setsReps}</span> : null}
                    </div>
                  );
                })}
              </div>
            ) : cur.kind === "choice" ? (
              <ChoiceGroup
                header={cur.header}
                options={cur.options.map((o) => reduceExercise(o, adjust ?? null))}
                accent={block!.accent}
                blockLabel={block!.accent.label}
                recommendationContext={recCtx}
              />
            ) : cur.kind === "complex" ? (
              <div className="space-y-4">
                {/* Complex header: N exercises done together as one round */}
                <div className="flex items-start justify-between gap-3">
                  <div className="text-2xl font-bold tracking-tight text-zinc-900">
                    {cur.members.length === 2
                      ? (isIS ? "Contrast — 2 saman" : "Contrast — 2 together")
                      : (isIS ? `Complex — ${cur.members.length} saman` : `Complex — ${cur.members.length} together`)}
                  </div>
                  {methodDisplay ? (
                    <span className="mt-1 shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                      {methodDisplay}
                    </span>
                  ) : null}
                </div>
                <div className="text-[13px] leading-relaxed text-zinc-500">
                  {isIS
                    ? "Gerðu æfingarnar í röð, hver umferð = eitt sett."
                    : "Do the exercises in order — one round through = one set."}
                </div>

                {/* Member list (in order) — each a full card + category swap */}
                <div className="space-y-2.5">
                  {cur.members.map((m, k) => (
                    <ContrastMember
                      key={k}
                      index={k}
                      ex={m}
                      accent={block!.accent}
                      blockLabel={block!.accent.label}
                      recommendationContext={recCtx}
                      adjust={adjust}
                      isIS={isIS}
                    />
                  ))}
                </div>
                {cur.restNote ? <div className="text-xs text-zinc-400">{cur.restNote}</div> : null}

                {/* Method explainer (reuses METHOD_GUIDE) */}
                {guide ? (
                  <div className="rounded-xl bg-[#f4f6ff] px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2740e6]">
                      {isIS ? `Hvað er ${methodDisplay}?` : `What is ${methodDisplay}?`}
                    </div>
                    <div className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-zinc-700">
                      {(isIS ? guide.IS : guide.EN).split("\n\n")[0]}
                    </div>
                  </div>
                ) : null}

                {setCounter}
              </div>
            ) : baseEx ? (
              <div className="space-y-4">
                {/* Full, swappable exercise card (recommendation + other options + ⓘ) */}
                <RecommendedExerciseBlockCard
                  ex={reduceExercise(baseEx, adjust ?? null)}
                  accent={block!.accent}
                  blockLabel={block!.accent.label}
                  recommendationContext={recCtx}
                />

                {/* Method explainer — only when this exercise is NOT
                    recommendation-swappable. The plan line's method (e.g. ISO)
                    doesn't apply once the engine swaps it (e.g. for DB Snatch),
                    and the card's ⓘ already explains the shown exercise. */}
                {guide && !recCtx ? (
                  <div className="rounded-xl bg-[#f4f6ff] px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2740e6]">
                      {isIS ? `Hvað er ${methodDisplay}?` : `What is ${methodDisplay}?`}
                    </div>
                    <div className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-zinc-700">
                      {(isIS ? guide.IS : guide.EN).split("\n\n")[0]}
                    </div>
                  </div>
                ) : !recCtx && baseEx.note ? (
                  <div className="rounded-xl bg-zinc-50 px-4 py-3 text-[13px] leading-relaxed text-zinc-600">{baseEx.note}</div>
                ) : null}

                {setCounter}
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">{t.training.noItems}</div>
            )}
          </div>
        ) : null}
      </div>

      {/* Footer nav */}
      {!finished ? (
        <div className="shrink-0 border-t border-zinc-100 px-4 py-3">
          <div className="mx-auto max-w-lg space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={clampedIdx === 0}
                onClick={goBack}
                className={cx(
                  "rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors",
                  clampedIdx === 0 ? "border-zinc-100 text-zinc-300" : "border-zinc-200 text-zinc-700 active:bg-zinc-100"
                )}
              >
                ← {isIS ? "Til baka" : "Back"}
              </button>
              <button
                type="button"
                onClick={primaryAction}
                className="flex-1 rounded-full bg-[#2740e6] px-4 py-2.5 text-sm font-bold text-white transition-opacity active:opacity-90"
              >
                {primaryLabel}
              </button>
            </div>
            {nextName && onLastSet && !isLastStep ? (
              <div className="text-center text-xs text-zinc-400">
                {isIS ? "Næst" : "Next"}: {nextName} →
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  // Portal to <body> so the fixed overlay always covers the viewport, even when
  // the launching card sits inside a transformed/backdrop-filtered ancestor.
  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

/** Adjustment banner copy for the Today session card, per readiness state. */
function bannerFor(state: "GREEN" | "YELLOW" | "RED", isIS: boolean) {
  if (state === "YELLOW") {
    return {
      bg: "#faf1de",
      fg: "#9a6410",
      icon: "↓",
      title: isIS ? "Aðlöguð — eitt sett tekið af hverri lyftu" : "Adjusted — one set off each lift",
      why: isIS
        ? "Reiðuskori er gult í dag, svo við lækkum rúmmálið en höldum gæðunum."
        : "Readiness is amber today, so we trim the volume but keep the quality.",
      more: isIS
        ? "Færri sett halda þér ferskum — full ákefð og góð tækni skila áfram styrk og krafti."
        : "Fewer sets keep you fresh — full intent and good technique still drive strength and power.",
    };
  }
  if (state === "RED") {
    return {
      bg: "#f8e9e3",
      fg: "#a83e28",
      icon: "↓",
      title: isIS ? "Létt/valfrjáls — hörðustu blokkir felldar niður" : "Light/optional — hardest blocks dropped",
      why: isIS
        ? "Reiðuskori er rautt í dag — við höldum álaginu lágu til að vernda þig."
        : "Readiness is red today — we keep the load low to protect you.",
      more: isIS
        ? "Hörðustu blokkirnar (sprengikraftur/þungt) eru teknar út; léttar hreyfingar viðhalda án álags."
        : "The hardest blocks (explosive/heavy) are removed; light movement maintains you without load.",
    };
  }
  return {
    bg: "#eef7f0",
    fg: "#146c40",
    icon: "✓",
    title: isIS ? "Full æfing — ekkert tekið af" : "Full session — nothing removed",
    why: isIS
      ? "Reiðuskori er grænt — kýldu á fulla æfingu með góðri tækni."
      : "Readiness is green — go full session with good technique.",
    more: null as string | null,
  };
}

/* ---- Today session card = key lifts + readiness banner + "Byrja æfingu" ---- */
function TodaySessionCard({ structure, opts }: { structure: unknown; opts: TodaySessionOpts }) {
  const [focusOpen, setFocusOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const t = opts.t ?? PLAYER_COPY.IS;
  const isIS = t === PLAYER_COPY.IS;
  const adjust = opts.adjust ?? null;
  const { blocks } = useMemo(
    () => buildSessionBlocks(structure, adjust, opts.themeColor ?? null, opts.preserveOrder ?? false),
    [structure, adjust, opts.themeColor, opts.preserveOrder]
  );
  const workBlocks = useMemo(() => blocks.filter((b) => b.segments.length > 0), [blocks]);
  if (!workBlocks.length) return null;

  const themeColor = opts.themeColor ?? null;
  const accentColor = themeColor || "#2740e6";
  // CTA colour follows readiness (design spec 21a/22a): green on a green day,
  // cobalt by default on yellow/red/unknown. Distinct from the structural
  // accent used for the block letters (which stays the club/cobalt accent).
  const ctaColor = adjust?.state === "GREEN" ? "#1c7a4a" : "#2740e6";
  const subtitle = String(opts.headerTitle ?? "").trim();

  // Show the day's strength work — EVERY non-warm-up block's exercises (primer,
  // contrast, accessory), rest lines filtered out. Warm-up stays a "+N blocks"
  // count in the footer.
  const strengthBlocks = workBlocks.filter((b) => b.priority !== 0);
  const keyExercises = strengthBlocks
    .flatMap((b) => b.segments)
    .map((seg) => (seg.kind === "choice" ? seg.options[0] ?? null : seg.ex))
    .filter((ex): ex is ParsedExercise => !!ex && !isRestInstruction(ex))
    .slice(0, 6);
  const extraBlocks = Math.max(0, workBlocks.length - strengthBlocks.length);
  const mins = estimateSessionMinutes(workBlocks);
  const banner = adjust && adjust.state !== "GRAY" ? bannerFor(adjust.state, isIS) : null;

  return (
    <div className="space-y-2.5">
      {/* Section header */}
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <div className="text-lg font-bold tracking-tight text-zinc-900">{opts.heading?.trim() || (isIS ? "Æfing dagsins" : "Today's session")}</div>
        {subtitle ? (
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{subtitle}</div>
        ) : null}
      </div>

      {/* Card */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {/* Coach-sent banner — labelled provenance (this replaces the default
            team session for today; already tuned to today's signals). */}
        {opts.sentByCoach ? (
          <div className="px-4 py-3" style={{ background: "#eef1fe" }}>
            <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "#2740e6" }}>
              <span aria-hidden>✓</span>
              {isIS ? "Sent af þjálfara" : "Sent by your coach"}
            </div>
            <div className="mt-1 text-[13px] leading-relaxed" style={{ color: "#2740e6", opacity: 0.9 }}>
              {opts.coachSentSubtext?.trim()
                ? opts.coachSentSubtext
                : isIS
                ? "Þessi æfing kemur í stað æfingar dagsins og er stillt að stöðunni þinni í dag."
                : "This replaces today's default session and is tuned to how you are today."}
            </div>
          </div>
        ) : null}
        {/* Adjustment banner */}
        {!opts.sentByCoach && banner ? (
          <div className="px-4 py-3" style={{ background: banner.bg }}>
            <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: banner.fg }}>
              <span aria-hidden>{banner.icon}</span>
              {banner.title}
            </div>
            <div className="mt-1 text-[13px] leading-relaxed" style={{ color: banner.fg }}>
              <span style={{ opacity: 0.9 }}>{banner.why}</span>{" "}
              {banner.more ? (
                <button
                  type="button"
                  onClick={() => setWhyOpen((v) => !v)}
                  className="font-semibold underline underline-offset-2"
                  style={{ color: banner.fg }}
                >
                  {isIS ? "Af hverju?" : "Why?"}
                </button>
              ) : null}
            </div>
            {whyOpen && banner.more ? (
              <div className="mt-1.5 text-[13px] leading-relaxed" style={{ color: banner.fg, opacity: 0.9 }}>
                {banner.more}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Key lifts */}
        <div className="divide-y divide-zinc-100">
          {keyExercises.map((ex, i) => {
            const { letter, rest } = splitExerciseLetter(ex.name);
            const desc = exerciseDescriptor(ex);
            return (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 w-6 shrink-0 text-sm font-bold" style={{ color: accentColor }}>
                  {letter ?? "•"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-snug text-zinc-900">{rest}</div>
                  {desc ? <div className="mt-0.5 text-xs text-zinc-500">{desc}</div> : null}
                </div>
                <SetsReps ex={ex} adjust={adjust} />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-xs font-medium text-zinc-500">
            {extraBlocks > 0 ? `+${extraBlocks} ${isIS ? "blokkir" : "blocks"} · ` : ""}~{mins} {isIS ? "mín" : "min"}
          </span>
          <button
            type="button"
            onClick={() => setFocusOpen(true)}
            className="rounded-full px-5 py-2.5 text-sm font-bold text-white transition-opacity active:opacity-90"
            style={{ background: ctaColor }}
          >
            {isIS ? "Byrja æfingu" : "Start session"} →
          </button>
        </div>
      </div>

      {focusOpen ? (
        <SessionFocusScreen
          blocks={workBlocks}
          t={t}
          recommendationContext={opts.recommendationContext ?? null}
          adjust={adjust}
          onClose={() => setFocusOpen(false)}
        />
      ) : null}
    </div>
  );
}

/* =========================
   ✅ FIX MODULES — PARSER
========================= */
function extractIssueModuleItems(structure: any): { title: string; cues: string[] }[] {
  if (!structure) return [];

  if (typeof structure === "object" && Array.isArray((structure as any).blocks)) {
    const out: { title: string; cues: string[] }[] = [];

    for (let i = 0; i < (structure as any).blocks.length; i++) {
      const b = (structure as any).blocks[i];
      const t = String(b?.name ?? b?.title ?? b?.block ?? `Hluti ${i + 1}`).trim();

      const rawItems = Array.isArray(b?.items) ? b.items : [];
      const cues = rawItems
        .map((x: any) => {
          if (typeof x === "string") return x.trim();
          const name = x?.name ?? x?.title ?? x?.exercise ?? "";
          const dose = x?.dose ?? x?.reps ?? x?.time ?? x?.duration ?? "";
          const s = [name, dose].filter(Boolean).join(" — ");
          return (s || JSON.stringify(x)).trim();
        })
        .filter(Boolean);

      if (cues.length) out.push({ title: t, cues });
    }

    return out;
  }

  if (Array.isArray(structure)) {
    return structure
      .map((s: any, idx: number) => {
        const title = String(s?.title ?? s?.type ?? `Skref ${idx + 1}`).trim();
        const cues = Array.isArray(s?.cues) ? s.cues.map((c: any) => String(c).trim()).filter(Boolean) : [];
        return { title, cues };
      })
      .filter((x) => x.title || x.cues.length);
  }

  return [];
}

function renderFixModules(mods: FixModule[]) {
  return (
    <div className="space-y-3">
      <SectionTitle kicker="Ráðlagt" title="Ráðlagðar æfingar" sub="Miðað við check-in og athugasemdir." />

      {!mods.length ? (
        <CardShell>
          <div className="p-4 sm:p-5 text-sm text-zinc-600">Engar ráðlagðar æfingar í dag.</div>
        </CardShell>
      ) : (
        <div className="space-y-3">
          {mods.map((m, idx) => {
            const steps = extractIssueModuleItems(m?.structure);

            return (
              <CardShell key={`${m.tag}-${idx}`}>
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold text-zinc-900">{m.title || m.tag}</div>
                      {!!m.tag && <div className="mt-1 text-xs font-medium text-zinc-500">{m.tag}</div>}
                    </div>
                  </div>

                  {!!steps.length ? (
                    <div className="mt-4 space-y-3">
                      {steps.map((s, i) => (
                        <div key={i} className="rounded-xl border bg-zinc-50 p-4">
                          <div className="text-sm font-semibold text-zinc-900">{s.title}</div>
                          {!!s.cues.length && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                              {s.cues.map((c, ci) => (
                                <li key={ci}>{c}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-zinc-600">Engin structure gögn.</div>
                  )}
                </div>
              </CardShell>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** =========
 *  ✅ Post-training accents (ALLT GRÁTT / NEUTRAL)
 *  ========= */
/** =========
 *  ✅ Post-training structure parser (unchanged)
 *  ========= */
type PTExercise = {
  name: string;
  instructions: string[];
  timeSec: number | null;
  meta?: {
    sets?: string;
    holdSec?: number;
    restSec?: number;
    alternative?: string;
    notes?: string;
  };
};

type PTSection = {
  title: string | null;
  exercises: PTExercise[];
  note?: string | null;
};

function toStringList(x: any): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v));
  if (typeof x === "string" && x.trim()) return [x.trim()];
  return [];
}

function normalizePTExerciseFromObject(s: any, fallbackIndex: number): PTExercise {
  const title = String(s?.title ?? s?.type ?? s?.name ?? `Skref ${fallbackIndex + 1}`).trim();

  const notes = s?.notes != null ? String(s.notes).trim() : "";
  const bullets = Array.isArray(s?.bullets) ? s.bullets.map((b: any) => String(b).trim()).filter(Boolean) : [];
  const cues = toStringList(s?.cues ?? s?.items ?? []);

  const alternative = s?.alternative != null ? String(s.alternative).trim() : "";
  const sets = s?.sets != null ? String(s.sets).trim() : "";
  const holdSec = s?.duration_sec != null && Number.isFinite(Number(s.duration_sec)) ? Number(s.duration_sec) : undefined;
  const restSec = s?.rest_sec != null && Number.isFinite(Number(s.rest_sec)) ? Number(s.rest_sec) : undefined;

  const instructions: string[] = [];
  for (const b of bullets) instructions.push(b);
  for (const c of cues) instructions.push(c);

  const timeSecRaw = s?.time_sec != null ? Number(s.time_sec) : null;

  return {
    name: title,
    instructions,
    timeSec: Number.isFinite(timeSecRaw as any) ? (timeSecRaw as number) : null,
    meta: {
      notes: notes || undefined,
      alternative: alternative || undefined,
      sets: sets || undefined,
      holdSec,
      restSec,
    },
  };
}

function isRuleLine(line: string) {
  const t = (line ?? "").trim().toLowerCase();
  return t.startsWith("rule:") || t.startsWith("regla:") || t.startsWith("ath:") || t.startsWith("note:");
}

function parseStringStepsToExercises(lines: string[]): { exercises: PTExercise[]; note: string | null } {
  const exercises: PTExercise[] = [];
  let note: string | null = null;

  let current: PTExercise | null = null;

  for (const raw of lines) {
    const line = String(raw ?? "").trim();
    if (!line) continue;

    if (isRuleLine(line)) {
      note = note ? `${note} ${line}` : line;
      continue;
    }

    const hasColon = line.includes(":");
    if (hasColon) {
      const [left0, ...rest] = line.split(":");
      const left = String(left0 ?? "").trim();
      const right = rest.join(":").trim();

      current = {
        name: left || `Æfing ${exercises.length + 1}`,
        instructions: [],
        timeSec: null,
      };

      if (right) current.instructions.push(right);

      exercises.push(current);
      continue;
    }

    if (!current) {
      current = { name: line, instructions: [], timeSec: null };
      exercises.push(current);
      continue;
    }

    current.instructions.push(line);
  }

  return { exercises, note };
}

function extractPostTrainingSections(structure: any): PTSection[] {
  if (!structure) return [];

  if (typeof structure === "object" && Array.isArray((structure as any).sections)) {
    const secs: PTSection[] = (structure as any).sections
      .map((sec: any, si: number) => {
        const secTitleRaw = sec?.title ?? sec?.name ?? sec?.block ?? null;
        const secTitle = secTitleRaw != null ? String(secTitleRaw) : null;

        const rawSteps = Array.isArray(sec?.steps) ? sec.steps : [];

        const allStrings = rawSteps.length > 0 && rawSteps.every((x: any) => typeof x === "string");
        if (allStrings) {
          const { exercises, note } = parseStringStepsToExercises(rawSteps.map((x: any) => String(x)));
          return {
            title: secTitle || ((structure as any).sections.length > 1 ? `Hluti ${si + 1}` : null),
            exercises,
            note,
          };
        }

        const exercises = rawSteps.map((x: any, i: number) => normalizePTExerciseFromObject(x, i));
        return {
          title: secTitle || ((structure as any).sections.length > 1 ? `Hluti ${si + 1}` : null),
          exercises,
          note: null,
        };
      })
      .filter((s: PTSection) => s.exercises.length);

    return secs;
  }

  if (typeof structure === "object" && Array.isArray((structure as any).blocks)) {
    const secs: PTSection[] = (structure as any).blocks
      .map((b: any, bi: number) => {
        const secTitleRaw = b?.name ?? b?.title ?? b?.block ?? null;
        const secTitle = secTitleRaw != null ? String(secTitleRaw) : null;

        const raw = Array.isArray(b?.steps) ? b.steps : Array.isArray(b?.items) ? b.items : [];

        const allStrings = raw.length > 0 && raw.every((x: any) => typeof x === "string");
        if (allStrings) {
          const { exercises, note } = parseStringStepsToExercises(raw.map((x: any) => String(x)));
          return {
            title: secTitle || ((structure as any).blocks.length > 1 ? `Hluti ${bi + 1}` : null),
            exercises,
            note,
          };
        }

        const exercises = raw.map((x: any, i: number) => normalizePTExerciseFromObject(x, i));
        return {
          title: secTitle || ((structure as any).blocks.length > 1 ? `Hluti ${bi + 1}` : null),
          exercises,
          note: null,
        };
      })
      .filter((s: PTSection) => s.exercises.length);

    return secs;
  }

  if (typeof structure === "object" && Array.isArray((structure as any).steps)) {
    const raw = (structure as any).steps;

    const allStrings = raw.length > 0 && raw.every((x: any) => typeof x === "string");
    if (allStrings) {
      const { exercises, note } = parseStringStepsToExercises(raw.map((x: any) => String(x)));
      return exercises.length ? [{ title: null, exercises, note }] : [];
    }

    const exercises = raw.map((x: any, i: number) => normalizePTExerciseFromObject(x, i));
    return exercises.length ? [{ title: null, exercises, note: null }] : [];
  }

  if (Array.isArray(structure)) {
    const allStrings = structure.length > 0 && structure.every((x: any) => typeof x === "string");
    if (allStrings) {
      const { exercises, note } = parseStringStepsToExercises(structure.map((x: any) => String(x)));
      return exercises.length ? [{ title: null, exercises, note }] : [];
    }

    const exercises = structure.map((x: any, i: number) => normalizePTExerciseFromObject(x, i));
    return exercises.length ? [{ title: null, exercises, note: null }] : [];
  }

  return [];
}

/** =========
 *  Post-training "Reload" — time-gated recovery hero + step-by-step focus flow.
 *  A tendon-load routine (held while still warm) chained into a neural reset,
 *  surfaced as ONE "Reload" after the session. The focus screen reads the SAME
 *  extractPostTrainingSections() output the card summarises, so they can't drift
 *  (the same one-source rule as buildSessionBlocks for the strength session).
 *  ========= */
const RELOAD_GREEN = "#1c7a4a"; // traffic-light green / ready (design token)
const RELOAD_PURPLE = "#7a5cc4"; // rtp purple — neural-reset steps

function isTendonReloadTemplate(t: PostTrainingTemplateRow) {
  const id = (t?.id ?? "").toLowerCase();
  const tags = (t?.tags ?? []).map((x) => String(x).toLowerCase());
  return id.includes("tendon") || tags.includes("tendon_health") || tags.includes("achilles") || tags.includes("patellar");
}

function isMdRotationReloadTemplate(t: PostTrainingTemplateRow) {
  const id = (t?.id ?? "").toLowerCase();
  return (
    id.startsWith("md1_") || id.startsWith("md2_") || id.startsWith("md3_") ||
    id.startsWith("md4_") || id.startsWith("md_") || id.startsWith("mdplus_") || id.startsWith("md_plus")
  );
}

function isDailyNeuralResetTemplate(t: PostTrainingTemplateRow) {
  return (t?.id ?? "").toLowerCase() === "daily_neural_reset";
}

/** Recommended reload routines, tendon first (held warm), neural reset after. */
function orderedReloadTemplates(templates: PostTrainingTemplateRow[]) {
  const filtered = templates.filter((t) => !isDailyNeuralResetTemplate(t) && (isTendonReloadTemplate(t) || isMdRotationReloadTemplate(t)));
  return [...filtered].sort((a, b) => (isTendonReloadTemplate(a) ? 0 : 1) - (isTendonReloadTemplate(b) ? 0 : 1));
}

const cleanReloadTitle = (t?: string | null) => String(t ?? "").replace(/^\s*\d+[)\.\-]\s*/g, "").trim();

type ReloadStep = {
  key: string;
  name: string;
  instructions: string[];
  meta: NonNullable<PTExercise["meta"]>;
  timeSec: number | null;
  kind: "tendon" | "neural";
};

/** Flatten every recommended routine's sections into one ordered step list. */
function buildReloadSteps(templates: PostTrainingTemplateRow[]): ReloadStep[] {
  const steps: ReloadStep[] = [];
  for (const t of templates) {
    const kind: ReloadStep["kind"] = isTendonReloadTemplate(t) ? "tendon" : "neural";
    for (const sec of extractPostTrainingSections(t?.structure)) {
      for (const ex of sec.exercises) {
        steps.push({
          key: `${t.id}-${steps.length}`,
          name: cleanReloadTitle(ex.name),
          instructions: (ex.instructions ?? []).filter(Boolean),
          meta: ex.meta ?? {},
          timeSec: ex.timeSec ?? null,
          kind,
        });
      }
    }
  }
  return steps;
}

/** Full-screen step-by-step Reload walkthrough (portal, same chrome as the
 *  strength session focus screen, in recovery green / neural purple). */
function PostTrainingReloadFocus({ steps, lang, onClose }: { steps: ReloadStep[]; lang: Lang; onClose: () => void }) {
  const pt = PLAYER_COPY[lang].postTraining;
  const total = steps.length;
  const [idx, setIdx] = useState(0);
  const [finished, setFinished] = useState(false);

  const clamped = Math.min(idx, Math.max(0, total - 1));
  const cur = steps[clamped] ?? null;
  const isLast = clamped >= total - 1;
  const nextStep = steps[clamped + 1] ?? null;
  const advance = () => { if (isLast) setFinished(true); else setIdx((i) => Math.min(total - 1, i + 1)); };
  const goBack = () => setIdx((i) => Math.max(0, i - 1));
  const accent = cur?.kind === "neural" ? RELOAD_PURPLE : RELOAD_GREEN;
  const meta = cur?.meta ?? {};

  const overlay = (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header + segmented progress (one segment per step) */}
      <div className="shrink-0 border-b border-zinc-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-bold text-zinc-900 font-display">{pt.focusTitle}</div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 active:bg-zinc-200"
            aria-label={pt.finishClose}
          >
            ✕
          </button>
        </div>
        <div className="mt-3 flex gap-1">
          {steps.map((_, i) => (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full" style={{ width: finished || i <= clamped ? "100%" : "0%", background: RELOAD_GREEN }} />
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {finished ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white" style={{ background: RELOAD_GREEN }}>✓</div>
            <div className="mt-4 text-xl font-bold text-zinc-900 font-display">{pt.finishTitle}</div>
            <div className="mt-1 max-w-xs text-sm text-zinc-500">{pt.finishBody}</div>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full px-6 py-2.5 text-sm font-bold text-white transition-opacity active:opacity-90"
              style={{ background: RELOAD_GREEN }}
            >
              {pt.finishClose}
            </button>
          </div>
        ) : cur ? (
          <div className="mx-auto max-w-lg space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: accent }}>
              <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
              {(cur.kind === "neural" ? pt.tagNeural : pt.tagTendon)} · {pt.stepOf(clamped + 1, total)}
            </div>

            <div className="text-2xl font-bold tracking-tight text-zinc-900 font-display">{cur.name}</div>

            {(meta.sets || meta.holdSec != null || meta.restSec != null || cur.timeSec != null) ? (
              <div className="flex flex-wrap gap-2">
                {meta.sets ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">{pt.setsLabel} {meta.sets}</span>
                ) : null}
                {meta.holdSec != null ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">{pt.holdLabel} {meta.holdSec}s</span>
                ) : cur.timeSec != null ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">{pt.holdLabel} {cur.timeSec}s</span>
                ) : null}
                {meta.restSec != null ? (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">{pt.restLabel} {meta.restSec}s</span>
                ) : null}
              </div>
            ) : null}

            {meta.notes ? <div className="rounded-xl bg-zinc-50 px-4 py-3 text-[13px] leading-relaxed text-zinc-600">{meta.notes}</div> : null}

            {cur.instructions.length ? (
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-700">
                {cur.instructions.map((line, li) => (
                  <li key={li}>{line}</li>
                ))}
              </ul>
            ) : null}

            {meta.alternative ? (
              <div className="text-sm text-zinc-600">
                <span className="font-semibold text-zinc-700">{pt.altLabel}:</span> {meta.alternative}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Footer nav */}
      {!finished ? (
        <div className="shrink-0 border-t border-zinc-100 px-4 py-3">
          <div className="mx-auto max-w-lg space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={clamped === 0}
                onClick={goBack}
                className={cx(
                  "rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors",
                  clamped === 0 ? "border-zinc-100 text-zinc-300" : "border-zinc-200 text-zinc-700 active:bg-zinc-100"
                )}
              >
                ← {pt.back}
              </button>
              <button
                type="button"
                onClick={advance}
                className="flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-white transition-opacity active:opacity-90"
                style={{ background: RELOAD_GREEN }}
              >
                {isLast ? pt.finishCta : pt.continueCta}
              </button>
            </div>
            {nextStep && !isLast ? (
              <div className="text-center text-xs text-zinc-400">{pt.next}: {nextStep.name} →</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

const RELOAD_WINDOW_MIN = 30; // minutes the Reload is "ready" after RPE is logged
const RELOAD_ZINC = "#71717a"; // muted accent once the best window has passed

/** The redesigned "after session" Reload hero: a single time-gated card whose
 *  CTA opens the step-by-step focus flow. `sessionDoneAt` (the player's real RPE
 *  submission time) opens a 30-min "ready" window; before it the card is a soft
 *  "after your session" prompt, after it a muted "window passed" state that is
 *  still openable. Renders nothing when no routine is recommended (so it is
 *  never a card sitting idle). */
function PostTrainingReload({ templates, lang, sessionDoneAt }: { templates: PostTrainingTemplateRow[]; lang: Lang; sessionDoneAt: string | null }) {
  const pt = PLAYER_COPY[lang].postTraining;
  const [focusOpen, setFocusOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const ordered = useMemo(() => orderedReloadTemplates(templates), [templates]);
  const steps = useMemo(() => buildReloadSteps(ordered), [ordered]);

  // Tick while a window is open so "ready" flips to "passed" live (no reload).
  useEffect(() => {
    if (!sessionDoneAt) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [sessionDoneAt]);

  if (!ordered.length || !steps.length) return null;

  const totalMin = ordered.reduce((s, t) => s + (Number(t.duration_min) || 0), 0);
  const hasTendon = ordered.some(isTendonReloadTemplate);
  const hasNeural = ordered.some((t) => !isTendonReloadTemplate(t));

  const doneMs = sessionDoneAt ? Date.parse(sessionDoneAt) : NaN;
  const hasWindow = Number.isFinite(doneMs);
  const elapsedMin = hasWindow ? (nowMs - doneMs) / 60_000 : Infinity;
  const state: "pending" | "ready" | "passed" = !hasWindow ? "pending" : elapsedMin <= RELOAD_WINDOW_MIN ? "ready" : "passed";
  const minsLeft = state === "ready" ? Math.max(1, Math.ceil(RELOAD_WINDOW_MIN - elapsedMin)) : null;

  const accentColor = state === "passed" ? RELOAD_ZINC : RELOAD_GREEN;
  const kickerSuffix = state === "ready" ? pt.statusReady : state === "passed" ? pt.statusPassed : null;
  const badgeLabel = state === "ready" ? pt.readyNow : state === "passed" ? pt.passedLabel : pt.pendingLabel;
  const whenLine = state === "ready" ? pt.whenReady : state === "passed" ? pt.whenPassed : pt.whenPending;

  return (
    <div className="space-y-2.5">
      {/* Kicker: "EFTIR ÆFINGU — TILBÚIÐ" / "— LIÐIÐ HJÁ" / (plain when pending) */}
      <div className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 font-mono">
        {pt.kicker}{kickerSuffix ? ` — ${kickerSuffix}` : ""}
      </div>

      <div className={cx("rounded-2xl border p-4 sm:p-5", state === "passed" ? "border-zinc-200 bg-zinc-50/60" : "border-[#1c7a4a]/25 bg-[#1c7a4a]/[0.04]")}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white" style={{ background: accentColor }} aria-hidden>
            ▶
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] font-mono" style={{ color: accentColor }}>{badgeLabel}</div>
            <div className="mt-0.5 text-lg font-bold tracking-tight text-zinc-900 font-display">
              {pt.reloadName}{totalMin > 0 ? ` · ${pt.durationMin(totalMin)}` : ""}
            </div>
          </div>
        </div>

        {(hasTendon || hasNeural) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {hasTendon ? (
              <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ color: RELOAD_GREEN, borderColor: `${RELOAD_GREEN}40`, background: `${RELOAD_GREEN}0f` }}>
                {pt.tagTendon}
              </span>
            ) : null}
            {hasNeural ? (
              <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ color: RELOAD_PURPLE, borderColor: `${RELOAD_PURPLE}40`, background: `${RELOAD_PURPLE}0f` }}>
                {pt.tagNeural}
              </span>
            ) : null}
          </div>
        ) : null}

        <p className="mt-3 text-sm leading-relaxed text-zinc-600">{pt.reloadDesc}</p>
        <p className="mt-1.5 text-[13px] font-medium leading-relaxed" style={{ color: state === "passed" ? "#a1a1aa" : RELOAD_GREEN }}>
          {whenLine}{minsLeft != null ? ` · ${pt.minsLeft(minsLeft)}` : ""}
        </p>

        <button
          type="button"
          onClick={() => setFocusOpen(true)}
          className="mt-4 w-full rounded-2xl px-5 py-3.5 text-base font-bold text-white transition-opacity active:opacity-90"
          style={{ background: RELOAD_GREEN }}
        >
          {pt.startCta}
        </button>
      </div>

      <p className="px-0.5 text-[12px] leading-relaxed text-zinc-400">{pt.footnote}</p>

      {focusOpen ? <PostTrainingReloadFocus steps={steps} lang={lang} onClose={() => setFocusOpen(false)} /> : null}
    </div>
  );
}

export default function PlayerClient() {
  const [lang, setLang] = useLang();
  const t = PLAYER_COPY[lang];

  // Silently re-register push subscription on every load.
  // Handles both missing subscriptions and VAPID key rotation.
  usePushAutoResubscribe();

  const supabase = useMemo(() => getSupabaseClient(), []);

  const searchParams = useSearchParams();

  const day = useMemo(() => {
    const raw = searchParams?.get("date");
    return sanitizeDay(raw || null);
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerStatus, setPlayerStatus] = useState<"PENDING" | "ACTIVE" | "REJECTED" | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  const [playerMeta, setPlayerMeta] = useState<PlayerRow | null>(null);

  type ActiveTeamPill = {
    id: string;
    name: string;
    short: string | null;
    color: string | null;
    role: string;
    type: string | null;
  };
  const [activeTeams, setActiveTeams] = useState<ActiveTeamPill[]>([]);

  const [plan, setPlan] = useState<Stage4PlanRow>(null);
  const [planTemplateOverride, setPlanTemplateOverride] = useState<PlanTemplateOverrideRow>(null);
  const [activeSeasonPhase, setActiveSeasonPhase] = useState<string>("inseason");
  const [templateTableName, setTemplateTableName] = useState<string>("microdose_templates");
  const [planIsFallback, setPlanIsFallback] = useState(false);

  const [stage4Final, setStage4Final] = useState<Stage4DecisionFinalRow>(null);
  const [coachFinalFlag, setCoachFinalFlag] = useState<CoachFinalFlagRow>(null);

  const [metrics, setMetrics] = useState<MetricsRow>(null);
  const [catapultToday, setCatapultToday] = useState<CatapultDailyLoadRow | null>(null);
  const [catapultTeamToday, setCatapultTeamToday] = useState<CatapultDailyLoadRow[]>([]);
  const [catapultHistory, setCatapultHistory] = useState<CatapultDailyLoadRow[]>([]);

  // GPS date navigation — allows browsing last 7 days independently of readiness date
  const [gpsDate, setGpsDate] = useState<string>(day);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [tplToday, setTplToday] = useState<PlayerTemplateToday | null>(null);
  // Bumped on foreground return to softly refetch the coach-sent template (the
  // data most likely to change while the app is open) WITHOUT the full-screen
  // reload the main plan effect would cause — so reopening the PWA quietly shows
  // a newly-sent workout. Wired into the tplToday effect's deps. A full refresh
  // of everything is the pull-to-refresh gesture (window.location.reload()).
  const [dataNonce, setDataNonce] = useState(0);
  const lastRefreshRef = useRef(0);
  const requestDataRefresh = useCallback((minGapMs = 0) => {
    const now = Date.now();
    if (now - lastRefreshRef.current < minGapMs) return;
    lastRefreshRef.current = now;
    setDataNonce((n) => n + 1);
  }, []);

  const [decision, setDecision] = useState<DecisionRow>(null);
  const [session, setSession] = useState<PlayerSessionTodayRow>(null);

  const [genericMsg, setGenericMsg] = useState<GenericMsg>(null);

  const [postTraining, setPostTraining] = useState<PostTrainingTemplateRow[]>([]);
  const [postTrainingErr, setPostTrainingErr] = useState<string>("");
  // Timestamp the player logged today's REAL session RPE — the "session done"
  // signal that opens the Reload 30-min window. null until RPE is submitted.
  const [rpeDoneAt, setRpeDoneAt] = useState<string | null>(null);

  const [fixRow, setFixRow] = useState<FixRow | null>(null);
  const [fixErr, setFixErr] = useState<string>("");

  const staffMode = useMemo(() => isStaffRole(profile?.role), [profile?.role]);

  const [overrideAudit, setOverrideAudit] = useState<MicrodoseOverrideRow[]>([]);
  const [overrideAuditErr, setOverrideAuditErr] = useState<string>("");

  const [sessionRpeForm, setSessionRpeForm] = useState<SessionRpeFormState>({
    session_date: todayISO(),
    session_type: "team_training",
    session_name: "",
    duration_minutes: "",
    rpe: "",
    notes: "",
  });
  const [sessionRpeSubmitting, setSessionRpeSubmitting] = useState(false);
  const [sessionRpeError, setSessionRpeError] = useState("");
  const [sessionRpeSuccess, setSessionRpeSuccess] = useState("");
  const [gpsDuration, setGpsDuration] = useState<number | null>(null);
  const [gpsDurationLoading, setGpsDurationLoading] = useState(false);
  const [sessionRpeHistory, setSessionRpeHistory] = useState<SessionRpeHistoryEntry[]>([]);
  const [sessionRpeHistoryLoading, setSessionRpeHistoryLoading] = useState(false);
  const [sessionRpeHistoryError, setSessionRpeHistoryError] = useState("");
  const [sessionRpeStatus, setSessionRpeStatus] = useState<SessionRpeStatus | null>(null);
  const [sessionRpeStatusLoading, setSessionRpeStatusLoading] = useState(false);
  const [sessionRpeStatusError, setSessionRpeStatusError] = useState("");
  const [playerRiskTrend, setPlayerRiskTrend] = useState<PlayerRiskTrend>({ dates: [], riskScores: [], readinessStates: [] });
  const [neuralVolatilityDecision, setNeuralVolatilityDecision] = useState<NeuralVolatilityIntelligenceDecision | null>(null);
  // Counterfactual "what-if" alternatives surfaced from buildAthleteDecision
  // for the player view. Empty for GREEN players (engine returns []) — the
  // self-service "what would help" panel only appears for YELLOW/RED days.
  // Sorted by impact desc by the engine; we show all (capped at 3 by
  // computeCounterfactuals so noise stays bounded).
  const [todayCounterfactuals, setTodayCounterfactuals] = useState<Array<{
    signal: string;
    currentValue: string;
    hypotheticalValue: string;
    hypotheticalState: "GREEN" | "YELLOW" | "RED" | "GRAY";
    impact: 1 | 2 | 3;
    descriptionEN: string;
    descriptionIS: string;
  }>>([]);
  const [prescriptionDecision, setPrescriptionDecision] = useState<PrescriptionDecision | null>(null);
  const [finalRecommendationDecision, setFinalRecommendationDecision] = useState<FinalRecommendationDecision | null>(null);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(null);
  // Session workflow state removed (feature removed)
  const [adminConfigSnapshot, setAdminConfigSnapshot] = useState<AdminConfigSnapshot>(createDefaultAdminConfigSnapshot());
  const [teamPlanTier, setTeamPlanTier] = useState<"FREE" | "PRO" | "ELITE">("FREE");
  const [clubThemeColor, setClubThemeColor] = useState<string | null>(null);

  const todayVsTeamMetrics = useMemo(() => {
    return getDefaultCatapultTodayVsTeamMetricKeys().map((key) => {
      const definition = getCatapultMetricDefinition(key);
      return {
        key,
        label: definition.label,
        digits: definition.digits ?? 0,
        value: getCatapultMetricValue(catapultToday as unknown as Record<string, unknown> | null, key),
        teamAverage: computeCatapultMetricAverage(
          catapultTeamToday as unknown as Array<Record<string, unknown>>,
          key,
        ),
      };
    });
  }, [catapultTeamToday, catapultToday]);

  const weeklyLoadMetrics = useMemo(() => {
    const refDate = sanitizeDay(null); // today
    return getDefaultCatapultWeeklyLoadMetricKeys().map((key) => {
      const definition = getCatapultMetricDefinition(key);
      const snapshot = computeGpsSnapshot(
        catapultHistory as unknown as Array<Record<string, unknown>>,
        key,
        refDate
      );
      return {
        key,
        label: definition.label,
        digits: definition.digits ?? 0,
        acwrSupported: !!definition.acwrSupported,
        weekly: {
          acute7Avg: snapshot.acute7Avg,
          chronic28Avg: snapshot.chronic28Avg,
          acwr: snapshot.acwr,
        },
      };
    });
  }, [catapultHistory]);

  useEffect(() => {
    const load = () => setAdminConfigSnapshot(loadAdminConfigSnapshotFromStorage());
    load();
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fixModules = useMemo(() => dedupeFixModulesByTag(fixRow?.fix_modules), [fixRow?.fix_modules]);

  const sessionDurationNum = Number(sessionRpeForm.duration_minutes);
  const sessionRpeNum = Number(sessionRpeForm.rpe);
  const sessionLoadPreview =
    Number.isFinite(sessionDurationNum) && Number.isFinite(sessionRpeNum) ? Math.round(sessionDurationNum * sessionRpeNum) : null;
  const sessionRpeValid =
    Number.isFinite(sessionDurationNum) &&
    sessionDurationNum >= 1 &&
    sessionDurationNum <= 300 &&
    Number.isFinite(sessionRpeNum) &&
    sessionRpeNum >= 0 &&
    sessionRpeNum <= 10;

  // Fetch assigned template for the selected day (page date)
  useEffect(() => {
    const playerId = profile?.player_id ?? selectedPlayerId;
    if (!playerId) return;

    (async () => {
      const entryDate = sanitizeDay(day);

      const { data, error } = await supabase
        .from("player_template_assignments")
        .select(
          `
        entry_date,
        note,
        locked,
        template:workout_templates (
          id, code, title, description, structure
        )
      `
        )
        .eq("player_id", playerId)
        .eq("entry_date", entryDate)
        .maybeSingle();

      if (error) {
        console.error("tplToday fetch error:", error);
        setTplToday(null);
        return;
      }

      setTplToday((data as any) ?? null);
    })();
  }, [profile?.player_id, selectedPlayerId, supabase, day, dataNonce]);

  useEffect(() => {
    const safeDay = sanitizeDay(day);
    setSessionRpeForm((prev) => ({ ...prev, session_date: safeDay }));
    setGpsDate(safeDay);
  }, [day]);

  // Self-heal the "missing check-in" banner after the app is restored from the
  // mobile back/forward cache (BFCache). Navigating back into the PWA (e.g. from
  // a settings sub-page) restores a FROZEN page without re-running the data
  // effects, so a check-in submitted earlier this session can still look missing
  // until a full reload — which is exactly the "asked to check in again" trap.
  // Re-read today's readiness row whenever the page becomes visible again:
  // pageshow fires on BFCache restore; visibilitychange/focus cover tab and
  // app-switch returns. We only PROMOTE a found row (never clobber loaded
  // metrics with a transient null), so this can only clear a false prompt.
  useEffect(() => {
    const refreshCheckin = async () => {
      const playerId = profile?.player_id ?? selectedPlayerId;
      if (!playerId) return;
      const safeDay = sanitizeDay(day);
      const { data: mrow } = await supabase
        .from("readiness_entries")
        .select(
          "fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness, total_score, created_at"
        )
        .eq("player_id", playerId)
        .eq("entry_date", safeDay)
        .maybeSingle();
      if (mrow) setMetrics(mrow as unknown as MetricsRow);
    };
    // Returning to the app also pulls fresh coach data (template, plan, GPS) —
    // this is what removes the "close and reopen to see new info" ritual. Guarded
    // to at most once per 4s so a quick app-switch doesn't refetch repeatedly.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) { void refreshCheckin(); requestDataRefresh(4000); }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") { void refreshCheckin(); requestDataRefresh(4000); }
    };
    const onFocus = () => { void refreshCheckin(); requestDataRefresh(4000); };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [profile?.player_id, selectedPlayerId, supabase, day, requestDataRefresh]);

  // Reload GPS data when gpsDate changes (arrow navigation)
  const reloadGpsForDate = useCallback(async (targetDate: string) => {
    const playerId = profile?.player_id ?? selectedPlayerId;
    if (!playerId || !profile?.team_id) return;
    setGpsLoading(true);
    try {
      const histStart = new Date(`${targetDate}T00:00:00.000Z`);
      histStart.setUTCDate(histStart.getUTCDate() - 34);
      const catapultStartDate = histStart.toISOString().slice(0, 10);

      const [{ data: todayRows }, { data: histRows }, { data: teamRows }] = await Promise.all([
        supabase
          .from("player_external_load_daily")
          .select("*")
          .in("source", ["catapult", "manual"])
          .eq("player_id", playerId)
          .eq("date", targetDate),
        supabase
          .from("player_external_load_daily")
          .select("*")
          .in("source", ["catapult", "manual"])
          .eq("player_id", playerId)
          .gte("date", catapultStartDate)
          .lte("date", targetDate)
          .order("date", { ascending: true }),
        supabase
          .from("player_external_load_daily")
          .select("*")
          .in("source", ["catapult", "manual"])
          .eq("team_id", profile.team_id)
          .eq("date", targetDate),
      ]);

      // One effective row per date/player-date first: a coach's MANUAL GPS entry
      // overrides the catapult reading for that day. Dedupe on the raw rows (they
      // carry `source`) before normalise, which drops the source column.
      const normToday = oneRowPerDate(
        (todayRows ?? []) as Array<Record<string, unknown> & { date: string; source?: string | null }>,
      )
        .map(normalizeCatapultDailyLoadRow)
        .filter((r): r is CatapultDailyLoadRow => r != null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1) ?? null;
      const normHistory = oneRowPerDate(
        (histRows ?? []) as Array<Record<string, unknown> & { date: string; source?: string | null }>,
      )
        .map(normalizeCatapultDailyLoadRow)
        .filter((r): r is CatapultDailyLoadRow => r != null)
        .sort((a, b) => a.date.localeCompare(b.date));
      const normTeam = oneRowPerPlayerDate(
        (teamRows ?? []) as Array<Record<string, unknown> & { player_id?: string | null; date: string; source?: string | null }>,
      )
        .map(normalizeCatapultDailyLoadRow)
        .filter((r): r is CatapultDailyLoadRow => r != null);

      setCatapultToday(normToday);
      setCatapultHistory(normHistory);
      setCatapultTeamToday(normTeam);
    } catch (err) {
      console.error("GPS date nav reload error:", err);
    } finally {
      setGpsLoading(false);
    }
  }, [profile?.player_id, profile?.team_id, selectedPlayerId, supabase]);

  const gpsDateBack = useCallback(() => {
    const d = new Date(`${gpsDate}T00:00:00.000Z`);
    const earliest = new Date(`${day}T00:00:00.000Z`);
    earliest.setUTCDate(earliest.getUTCDate() - 6);
    d.setUTCDate(d.getUTCDate() - 1);
    if (d < earliest) return;
    const next = d.toISOString().slice(0, 10);
    setGpsDate(next);
    void reloadGpsForDate(next);
  }, [gpsDate, day, reloadGpsForDate]);

  const gpsDateForward = useCallback(() => {
    const d = new Date(`${gpsDate}T00:00:00.000Z`);
    const today = new Date(`${day}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    if (d > today) return;
    const next = d.toISOString().slice(0, 10);
    setGpsDate(next);
    void reloadGpsForDate(next);
  }, [gpsDate, day, reloadGpsForDate]);

  // GPS duration auto-fill: query player_external_load_daily for the selected date
  useEffect(() => {
    const playerId = profile?.player_id ?? selectedPlayerId;
    const dateStr = sanitizeDay(day);
    if (!playerId || !dateStr) return;

    let cancelled = false;
    setGpsDurationLoading(true);

    (async () => {
      try {
        // First try session_duration_minutes directly
        const { data } = await supabase
          .from("player_external_load_daily")
          .select("session_duration_minutes, total_player_load, player_load_per_minute")
          .eq("player_id", playerId)
          .eq("date", dateStr)
          .order("total_player_load", { ascending: false, nullsFirst: false } as any)
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        const row = data as { session_duration_minutes: number | null; total_player_load: number | null; player_load_per_minute: number | null } | null;
        let mins: number | null = null;

        if (row?.session_duration_minutes != null && row.session_duration_minutes > 0) {
          mins = Math.round(row.session_duration_minutes);
        } else if (row?.total_player_load != null && row.total_player_load > 0 && row?.player_load_per_minute != null && row.player_load_per_minute > 0) {
          mins = Math.round(row.total_player_load / row.player_load_per_minute);
        }

        if (cancelled) return;
        setGpsDuration(mins);

        // Auto-fill only if the player hasn't manually typed a duration yet
        if (mins != null) {
          setSessionRpeForm((prev) => {
            if (prev.duration_minutes === "" || prev.duration_minutes === "0") {
              return { ...prev, duration_minutes: String(mins) };
            }
            return prev;
          });
        }
      } catch {
        if (!cancelled) setGpsDuration(null);
      } finally {
        if (!cancelled) setGpsDurationLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [profile?.player_id, selectedPlayerId, supabase, day]);

  async function ensureStage4Decision(playerId: string, dayInput: string) {
    const safeDay = sanitizeDay(dayInput);

    try {
      // Prefer legacy RPC path (most reliable for stage4 generation in dev/prod parity).
      const rpc = await supabase.rpc("stage4_ensure_decision", {
        p_player_id: playerId,
        p_entry_date: safeDay,
      });
      if (!rpc.error) return;

      const rpcCode = String((rpc.error as any)?.code ?? "");
      const rpcMsg = String((rpc.error as any)?.message ?? (rpc.error as any)?.details ?? (rpc.error as any)?.hint ?? "").trim();
      const rpcExpectedNoop = rpcCode === "PGRST116" || rpcMsg.toLowerCase().includes("no rows") || rpcMsg.toLowerCase().includes("no-op");
      if (rpcExpectedNoop) {
        console.log("stage4_ensure_decision (rpc): no-op / no decision yet for", safeDay);
        return;
      }

      console.warn("stage4_ensure_decision (rpc) failed, trying API fallback:", { code: rpcCode || null, msg: rpcMsg || null });

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session?.access_token) {
        console.error("stage4_ensure_decision fallback skipped: missing auth token");
        return;
      }

      const res = await fetch("/api/stage4/ensure-decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          player_id: playerId,
          entry_date: safeDay,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("stage4_ensure_decision fallback failed:", { status: res.status, body: body.slice(0, 200) });
      }
    } catch (e: any) {
      console.error("stage4_ensure_decision unexpected error:", e?.message ?? e);
    }
  }

  async function fetchStage4FinalDecision(playerId: string, dayInput: string) {
    const safeDay = sanitizeDay(dayInput);

    const { data, error } = await supabase
      .from("stage4_decisions_final")
      .select(
        [
          "id",
          "player_id",
          "team_id",
          "entry_date",
          "system_decision",
          "coach_decision",
          "coach_note",
          "coach_user_id",
          "locked",
          "final_decision",
          "final_source",
          "updated_at",
        ].join(",")
      )
      .eq("player_id", playerId)
      .eq("entry_date", safeDay)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as any) as Stage4DecisionFinalRow;
  }

  async function loadGenericMessage(teamId: string | null, flag: Flag, msgLang: Lang = "IS") {
    const dbLang = msgLang === "EN" ? "en" : "is";
    if (teamId) {
      const { data: teamRows, error: teamErr } = await supabase
        .from("player_flag_messages")
        .select("title, message, why")
        .eq("team_id", teamId)
        .eq("flag", flag)
        .eq("lang", dbLang)
        .eq("is_active", true)
        .order("id", { ascending: false })
        .limit(1);

      if (!teamErr) {
        const teamMsg = Array.isArray(teamRows) ? teamRows[0] : null;
        if (teamMsg?.message) return teamMsg as any;
      }
    }

    const { data: globalRows, error: globalErr } = await supabase
      .from("player_flag_messages")
      .select("title, message, why")
      .is("team_id", null)
      .eq("flag", flag)
      .eq("lang", dbLang)
      .eq("is_active", true)
      .order("id", { ascending: false })
      .limit(1);

    if (globalErr) return null;
    const globalMsg = Array.isArray(globalRows) ? globalRows[0] : null;
    return (globalMsg as any) ?? null;
  }

  async function loadOverrideAudit(decisionId: string) {
    try {
      setOverrideAuditErr("");

      const { data, error } = await supabase
        .from("microdose_overrides")
        .select(
          "id, decision_id, coach_profile_id, overrode_to_readiness_level, override_to_variant_id, reason_code, reason_test, risk_level, created_at"
        )
        .eq("decision_id", decisionId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw new Error(error.message);

      setOverrideAudit(((data as any) ?? []) as MicrodoseOverrideRow[]);
    } catch (e: any) {
      console.error("override audit load error:", e?.message ?? e);
      setOverrideAuditErr(e?.message ?? "Villa við að sækja override audit.");
      setOverrideAudit([]);
    }
  }

  async function fetchStage4Plan(
    playerId: string,
    dayInput: string,
    effectiveTableName?: string,
    effectiveSeasonPhase?: string,
    fallbackTeamId?: string,
  ) {
    const tblName = effectiveTableName ?? templateTableName;
    const sPhase = effectiveSeasonPhase ?? activeSeasonPhase;
    const safeDay = sanitizeDay(dayInput);

    // ── Coach-sent override wins ─────────────────────────────────────────────
    // If the coach sent a strength session from /coach/strength today, that IS
    // the player's Today card ("sent = seen"). It's already tuned to today's
    // signals inside buildStrengthSession, so we render it as-is (no further
    // readiness set-reduction — see the COACH_SENT check at the render site) and
    // label it as coach-sent. Absent → fall through to the default template chain.
    try {
      const { data: sentOverride } = await supabase
        .from("player_today_strength_override")
        .select("player_id, team_id, entry_date, md_context, title, description, structure, summary, source, created_at")
        .eq("player_id", playerId)
        .eq("entry_date", safeDay)
        .maybeSingle();
      const ov = (sentOverride ?? null) as {
        team_id?: string | null;
        md_context?: string | null;
        title?: string | null;
        description?: string | null;
        structure?: unknown;
        summary?: string | null;
      } | null;
      const ovStructure = ov?.structure;
      if (ov && Array.isArray(ovStructure) && ovStructure.length) {
        setPlanIsFallback(false);
        return {
          decision_id: null,
          team_id: ov.team_id ?? fallbackTeamId ?? null,
          player_id: playerId,
          entry_date: safeDay,
          md_day: ov.md_context ?? null,
          readiness_level: null, // suppress player-side re-adjustment
          chosen_variant_id: null,
          locked: true,
          source: "COACH_SENT",
          confidence: null,
          why: ov.summary ?? null,
          inputs: null,
          training_system: null,
          variant: null,
          title: ov.title ?? null,
          description: ov.description ?? null,
          structure: ovStructure,
        } as Stage4PlanRow;
      }
    } catch {
      // table missing / RLS / transient — fall through to the default chain
    }

    const { data: resolved, error: rErr } = await supabase
      .from("v_player_today_microdose_resolved")
      .select(
        [
          "player_id",
          "entry_date",
          "md_day_raw",
          "planned_focus",
          "final_planned_day_type",
          "readiness_flag",
          "md_day_resolved",
          "readiness_resolved",
          "training_system",

          "decision_id",
          "team_id",
          "chosen_variant_id",
          "locked",
          "source",
          "confidence",
          "why",
          "inputs",

          "variant_id",
          "variant",
          "plan_title",
          "plan_description",
          "plan_structure",

          "locked_at",
          "is_locked",
        ].join(",")
      )
      .eq("player_id", playerId)
      .eq("entry_date", safeDay)
      .maybeSingle();

    if (rErr) {
      console.error("v_player_today_microdose_resolved error:", rErr);
      throw new Error(rErr.message);
    }

    // The v_player_today_microdose_resolved view doesn't understand OFF days:
    // it maps planned_focus='ACTIVATION' to MD-1 even on OFF days, and joins the
    // default microdose_templates table (no custom table / no season_phase).
    // When the session context says it's an OFF day, skip the resolved view data
    // and fall through to the session-context fallback which handles OFF correctly.
    const sessionCheck = await supabase
      .from("v_player_session_today_v2")
      .select("md_day_resolved")
      .eq("player_id", playerId)
      .eq("day_date", safeDay)
      .maybeSingle();
    const sessionMdDay = (sessionCheck?.data as any)?.md_day_resolved ?? null;
    const isOffDay = sessionMdDay === "OFF";

    if (resolved && !isOffDay) {
      setPlanIsFallback(false);

      // team_id from the resolved view comes from microdose_decisions (LEFT JOIN).
      // When no decision exists for today, team_id is null — fall back to the
      // player's profile team so the custom template query still runs.
      const resolvedTeamId = (resolved as any).team_id ?? fallbackTeamId ?? null;
      const resolvedMdDay = (resolved as any).md_day_resolved ?? (resolved as any).md_day_raw ?? null;
      const resolvedReadiness =
        (resolved as any).readiness_resolved ?? (resolved as any).readiness_flag ?? null;
      const resolvedVariant = (resolved as any).variant ?? null;

      let templateRow: {
        title: string | null;
        description: string | null;
        structure: any;
        structure_en?: any;
        readiness_level: string | null;
        md_day?: string | null;
        variant?: string | null;
      } | null = null;

      // Whether THIS team authored its own custom programme table. If so we must
      // never fall back to the shared default microdose_templates (that table is
      // currently populated only with Breiðablik's rows) — a club that entered
      // its own strength programme must never receive another club's sessions.
      let teamHasCustomTable = tblName !== "microdose_templates";

      if (resolvedTeamId && resolvedMdDay && resolvedReadiness) {
        // ── Per-player override resolution ────────────────────────────────────
        // Check if the player has an active custom_template_sets override that:
        //   1. covers today's date (start_date ≤ entry_date ≤ end_date)
        //   2. defines a record for today's MD-day
        // If yes — read records from override.table_name instead of team table.
        // If no  — fall through to the team template (current behavior).
        let effectiveTblName = tblName;
        try {
          const { data: overrideRow } = await supabase
            .from("custom_template_sets")
            .select("table_name, md_days")
            .eq("player_id", playerId)
            .lte("start_date", safeDay)
            .gte("end_date", safeDay)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const overrideDays = Array.isArray((overrideRow as any)?.md_days)
            ? ((overrideRow as any).md_days as string[])
            : [];
          if ((overrideRow as any)?.table_name && overrideDays.includes(resolvedMdDay)) {
            effectiveTblName = (overrideRow as any).table_name;
          }
        } catch { /* fall back to team template silently */ }

        // A per-player override slug is still a custom (non-default) table.
        teamHasCustomTable = effectiveTblName !== "microdose_templates";

        const { data: templateRows, error: templateErr } = await supabase
          .from(effectiveTblName as any)
          .select("title, description, structure, structure_en, readiness_level, md_day, variant")
          .eq("team_id", resolvedTeamId)
          .eq("md_day", resolvedMdDay)
          .eq("readiness_level", resolvedReadiness)
          .eq("season_phase", sPhase)
          .order("variant", { ascending: true });

        if (templateErr) {
          console.error("microdose_templates resolved plan error:", templateErr.message);
        } else {
          templateRow = selectTemplateOverrideCandidate(
            (((templateRows as any[]) ?? []) as Array<{
              title: string | null;
              description: string | null;
              structure: any;
              structure_en?: any;
              readiness_level: string | null;
              md_day?: string | null;
              variant?: string | null;
            }>),
            resolvedVariant,
            resolvedMdDay
          );
        }

        // Team authored its own programme but not THIS md_day/readiness combo.
        // Fall back to the team's OWN GENERIC session rather than leaking another
        // club's default. A GREEN_PLUS day with no dedicated row uses GREEN.
        if (!templateRow && teamHasCustomTable) {
          const readinessTry =
            resolvedReadiness === "GREEN_PLUS" ? ["GREEN_PLUS", "GREEN"] : [resolvedReadiness];
          const { data: genRows } = await supabase
            .from(effectiveTblName as any)
            .select("title, description, structure, structure_en, readiness_level, md_day, variant")
            .eq("team_id", resolvedTeamId)
            .eq("md_day", "GENERIC")
            .in("readiness_level", readinessTry)
            .eq("season_phase", sPhase)
            .order("variant", { ascending: true });
          const rows = (((genRows as any[]) ?? []) as Array<{
            title: string | null;
            description: string | null;
            structure: any;
            structure_en?: any;
            readiness_level: string | null;
            md_day?: string | null;
            variant?: string | null;
          }>);
          for (const rl of readinessTry) {
            const subset = rows.filter((r) => r.readiness_level === rl);
            if (subset.length) {
              templateRow = selectTemplateOverrideCandidate(subset, resolvedVariant, "GENERIC");
              break;
            }
          }
        }
      }

      const merged: any = {
        decision_id: (resolved as any).decision_id ?? null,
        team_id: resolvedTeamId,
        player_id: (resolved as any).player_id,
        entry_date: (resolved as any).entry_date,
        md_day: (resolved as any).md_day_resolved ?? (resolved as any).md_day_raw ?? null,
        readiness_level: (resolved as any).readiness_resolved ?? (resolved as any).readiness_flag ?? null,

        chosen_variant_id: (resolved as any).chosen_variant_id ?? null,
        locked: (resolved as any).locked ?? (resolved as any).is_locked ?? null,
        source: (resolved as any).source ?? "RESOLVED_VIEW",
        confidence: (resolved as any).confidence ?? null,
        why: (resolved as any).why ?? null,
        inputs: (resolved as any).inputs ?? null,

        training_system: (resolved as any).training_system ?? null,

        variant: (resolved as any).variant ?? null,
        // Content comes ONLY from templateRow, which is always read
        // .eq("team_id", resolvedTeamId) from the team's own table (custom slug,
        // or team-scoped microdose_templates). We deliberately do NOT fall back
        // to the resolved view's plan_* fields: that view joins microdose_templates
        // team-blind, so its plan_* can be another club's programme (the shared
        // default table currently holds only Breiðablik's rows). A team that has
        // authored nothing for today therefore shows an empty card until its coach
        // builds the session — never another club's plan. This holds for every
        // team, including any newly-registered team that has no programme yet.
        title: templateRow?.title ?? null,
        description: templateRow?.description ?? null,
        structure: templateRow
          ? ((lang === "EN" && templateRow.structure_en) ? templateRow.structure_en : templateRow.structure)
          : null,
      };

      return merged as Stage4PlanRow;
    }

    const { data: drow, error: dErr } = await supabase
      .from("microdose_decisions")
      .select("id, team_id, player_id, entry_date, md_day, readiness_level, chosen_variant_id, locked, source, confidence, why, inputs")
      .eq("player_id", playerId)
      .lte("entry_date", safeDay)
      .order("entry_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dErr) throw new Error(dErr.message);

    // If the decision is from a different date (stale fallback), don't use it.
    // Instead, fall through to session context which knows the actual day type (OFF, etc.).
    const decisionIsStale = drow?.id && (drow as any).entry_date !== safeDay;

    if (!drow?.id || decisionIsStale) {
      // Fallback 1: use assigned workout template for the day if present.
      const { data: assignment } = await supabase
        .from("player_template_assignments")
        .select(
          `
          entry_date,
          template:workout_templates (
            id, title, description, structure
          )
        `
        )
        .eq("player_id", playerId)
        .eq("entry_date", safeDay)
        .maybeSingle();

      if (assignment?.template) {
        setPlanIsFallback(true);
        const tpl = assignment.template as any;
        return {
          decision_id: null,
          team_id: null,
          player_id: playerId,
          entry_date: safeDay,
          md_day: null,
          readiness_level: null,
          chosen_variant_id: null,
          locked: false,
          source: "TEMPLATE_ASSIGNMENT_FALLBACK",
          confidence: null,
          why: "Fallback plan from assigned daily template.",
          inputs: null,
          training_system: null,
          variant: null,
          title: tpl?.title ?? "Training Session",
          description: tpl?.description ?? null,
          structure: tpl?.structure ?? [],
        } as Stage4PlanRow;
      }

      // Fallback 2: use session context row so page can render (no hard-stop).
      const { data: sessionRow } = await supabase
        .from("v_player_session_today_v2")
        .select("team_id, md_day_resolved, readiness_flag, planned_focus, session_type")
        .eq("player_id", playerId)
        .eq("day_date", safeDay)
        .maybeSingle();

      if (sessionRow) {
        setPlanIsFallback(true);

        const sesTeamId = (sessionRow as any).team_id ?? null;
        const sesMdDay = (sessionRow as any).md_day_resolved ?? null;
        const sesReadiness = (sessionRow as any).readiness_flag ?? null;

        // Try to find a matching template for this session context (e.g. OFF day templates)
        let sesTemplateRow: { title?: string; description?: string; structure?: any; structure_en?: any } | null = null;
        if (sesTeamId && sesMdDay && sesReadiness) {
          const { data: sesTr } = await supabase
            .from(tblName as any)
            .select("title, description, structure, structure_en")
            .eq("team_id", sesTeamId)
            .eq("md_day", sesMdDay)
            .eq("readiness_level", sesReadiness)
            .eq("season_phase", sPhase)
            .maybeSingle();
          sesTemplateRow = (sesTr as any) ?? null;
        }
        // If readiness is UNKNOWN, try GREEN as fallback
        if (!sesTemplateRow && sesTeamId && sesMdDay && sesReadiness === "UNKNOWN") {
          const { data: sesTr } = await supabase
            .from(tblName as any)
            .select("title, description, structure, structure_en")
            .eq("team_id", sesTeamId)
            .eq("md_day", sesMdDay)
            .eq("readiness_level", "GREEN")
            .eq("season_phase", sPhase)
            .maybeSingle();
          sesTemplateRow = (sesTr as any) ?? null;
        }

        return {
          decision_id: null,
          team_id: sesTeamId,
          player_id: playerId,
          entry_date: safeDay,
          md_day: sesMdDay,
          readiness_level: sesTemplateRow ? (sesReadiness === "UNKNOWN" ? "GREEN" : sesReadiness) : sesReadiness,
          chosen_variant_id: null,
          locked: false,
          source: "SESSION_CONTEXT_FALLBACK",
          confidence: null,
          why: null,
          inputs: null,
          training_system: null,
          variant: null,
          title: sesTemplateRow?.title ?? (sessionRow as any).planned_focus ?? "Training Session",
          description: sesTemplateRow?.description ?? ((sessionRow as any).session_type ? `Session type: ${(sessionRow as any).session_type}` : null),
          structure: sesTemplateRow?.structure ?? [],
        } as Stage4PlanRow;
      }

      setPlanIsFallback(false);
      return null;
    }

    const teamId = (drow as any)?.team_id ?? null;
    const mdDay = (drow as any)?.md_day ?? null;
    const lvl = (drow as any)?.readiness_level ?? null;

    let templateRow: any = null;

    if (teamId && mdDay && lvl) {
      const { data: tr, error: trErr } = await supabase
        .from(tblName as any)
        .select("id, title, description, structure, structure_en")
        .eq("team_id", teamId)
        .eq("md_day", mdDay)
        .eq("readiness_level", lvl)
        .eq("season_phase", sPhase)
        .maybeSingle();

      if (trErr) throw new Error(trErr.message);
      templateRow = tr ?? null;
    }

    setPlanIsFallback((drow as any)?.entry_date !== safeDay);

    const merged: any = {
      decision_id: (drow as any).id ?? null,
      team_id: (drow as any).team_id ?? null,
      player_id: (drow as any).player_id,
      entry_date: (drow as any).entry_date,
      md_day: (drow as any).md_day ?? null,
      readiness_level: (drow as any).readiness_level ?? null,
      chosen_variant_id: (drow as any).chosen_variant_id ?? null,
      locked: (drow as any).locked ?? null,
      source: (drow as any).source ?? null,
      confidence: (drow as any).confidence ?? null,
      why: (drow as any).why ?? null,
      inputs: (drow as any).inputs ?? null,

      training_system: null,
      variant: null,

      title: templateRow?.title ?? null,
      description: templateRow?.description ?? null,
      structure: (lang === "EN" && templateRow?.structure_en) ? templateRow.structure_en : (templateRow?.structure ?? null),
    };

    return merged as Stage4PlanRow;
  }

  async function loadPostTrainingRecommendations(ctx: PostTrainingContext, tmplLang: Lang = "IS") {
    try {
      setPostTrainingErr("");

      const { data: rules, error: rErr } = await supabase
        .from("post_training_rules")
        .select("id, priority, is_active, when_clause, then_clause")
        .eq("is_active", true);

      if (rErr) throw new Error(rErr.message);

      const ruleRows = ((rules as any) ?? []) as PostTrainingRuleRow[];

      const ids = evaluatePostTrainingTemplateIds(ctx, ruleRows, ["tendon_reload_lower"]);

      if (!ids.length) {
        setPostTraining([]);
        return;
      }

      const dbLang = tmplLang === "EN" ? "en" : "is";

      // Fetch both IS and EN rows so we can prefer the user's language,
      // falling back to IS for templates that don't have an EN version yet.
      const { data: tmpls, error: tErr } = await supabase
        .from("post_training_templates")
        .select("id, title, duration_min, tags, structure, is_active, lang")
        .in("id", ids)
        .in("lang", dbLang === "en" ? ["en", "is"] : ["is"])
        .eq("is_active", true);

      if (tErr) throw new Error(tErr.message);

      const list = ((tmpls as any) ?? []) as PostTrainingTemplateRow[];

      // Build map preferring dbLang, falling back to 'is'
      const byId = new Map<string, PostTrainingTemplateRow>();
      for (const t of list) {
        const existing = byId.get(t.id);
        if (!existing || t.lang === dbLang) {
          byId.set(t.id, t);
        }
      }

      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as PostTrainingTemplateRow[];
      setPostTraining(ordered);
    } catch (e: any) {
      console.error("post-training load error:", e?.message ?? e);
      setPostTrainingErr(e?.message ?? "Villa við að sækja post-training tillögur.");
      setPostTraining([]);
    }
  }

  async function loadFixModulesForPlayer(playerId: string) {
    try {
      setFixErr("");

      const { data, error: fErr } = await supabase
        .from("v_player_fix_modules_latest")
        .select("player_id, checkin_id, created_at, fix_modules")
        .eq("player_id", playerId)
        .maybeSingle();

      if (fErr) throw new Error(fErr.message);

      setFixRow((data as any) ?? null);
    } catch (e: any) {
      console.error("fix modules load error:", e?.message ?? e);
      setFixErr(e?.message ?? "Villa við að sækja ráðlagðar æfingar.");
      setFixRow(null);
    }
  }

  async function loadSessionRpeHistory() {
    try {
      setSessionRpeHistoryLoading(true);
      setSessionRpeHistoryError("");

      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/player/session-rpe/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        entries?: SessionRpeHistoryEntry[];
      };

      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load session RPE history.");

      setSessionRpeHistory((json.entries ?? []).slice(0, 10));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load session RPE history.";
      setSessionRpeHistoryError(msg);
      setSessionRpeHistory([]);
    } finally {
      setSessionRpeHistoryLoading(false);
    }
  }

  async function loadSessionRpeStatus() {
    try {
      setSessionRpeStatusLoading(true);
      setSessionRpeStatusError("");

      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/player/session-rpe/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        status?: SessionRpeStatus;
      };
      if (!res.ok || !json?.ok || !json.status) {
        throw new Error(json?.error ?? "Failed to load Session RPE status.");
      }

      setSessionRpeStatus(json.status);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load Session RPE status.";
      setSessionRpeStatusError(msg);
      setSessionRpeStatus(null);
    } finally {
      setSessionRpeStatusLoading(false);
    }
  }

  async function submitSessionRpe() {
    if (!sessionRpeValid || sessionRpeSubmitting) return;

    try {
      setSessionRpeSubmitting(true);
      setSessionRpeError("");
      setSessionRpeSuccess("");

      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/player/session-rpe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_date: sessionRpeForm.session_date,
          session_type: sessionRpeForm.session_type,
          session_name: sessionRpeForm.session_name.trim() || null,
          duration_minutes: Number(sessionRpeForm.duration_minutes),
          rpe: Number(sessionRpeForm.rpe),
          notes: sessionRpeForm.notes.trim() || null,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Could not submit Session RPE.");
      }

      setSessionRpeSuccess("Session RPE submitted.");
      setSessionRpeForm((prev) => ({
        ...prev,
        session_name: "",
        duration_minutes: "",
        rpe: "",
        notes: "",
      }));
      await loadSessionRpeHistory();
      await loadSessionRpeStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not submit Session RPE.";
      setSessionRpeError(msg);
    } finally {
      setSessionRpeSubmitting(false);
    }
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");

      setPlan(null);
      setPlanTemplateOverride(null);
      setPlanIsFallback(false);
      setStage4Final(null);
      setCoachFinalFlag(null);
      setMetrics(null);
      setGenericMsg(null);
      setPlayerMeta(null);
      setDecision(null);
      setSession(null);
      setPostTraining([]);
      setPostTrainingErr("");
      setFixRow(null);
      setFixErr("");
      setOverrideAudit([]);
      setOverrideAuditErr("");

      try {
        const { data: auth, error: aErr } = await supabase.auth.getUser();
        if (aErr) throw new Error(aErr.message);

        const userId = auth?.user?.id;
        if (!userId) throw new Error("Ekki innskráður.");

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("id, display_name, player_id, role, team_id")
          .eq("id", userId)
          .maybeSingle();

        if (pErr) throw new Error(pErr.message);
        setProfile((prof as any) ?? null);

        // Local vars for season_phase and template table — used by fetchStage4Plan
        // in this same tick (React state won't be available until next render).
        let resolvedSeasonPhase = "inseason";
        let resolvedTableName = "microdose_templates";

        // Fetch plan_tier and club_theme_color from teams
        if (prof?.team_id) {
          const { data: teamRow } = await supabase
            .from("teams")
            .select("plan_tier, club_theme_color")
            .eq("id", prof.team_id)
            .maybeSingle();
          const tier = (teamRow as any)?.plan_tier;
          if (tier === "PRO" || tier === "ELITE") setTeamPlanTier(tier);
          else setTeamPlanTier("FREE");
          setClubThemeColor((teamRow as any)?.club_theme_color ?? null);

          // Fetch active season_phase from coach_week_setup for current week
          try {
            const now = new Date();
            const dayOfWeek = now.getDay();
            const mon = new Date(now);
            mon.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
            const weekStart = mon.toISOString().slice(0, 10);
            const { data: wsRow } = await supabase
              .from("coach_week_setup")
              .select("season_phase")
              .eq("team_id", prof.team_id)
              .eq("week_start_date", weekStart)
              .maybeSingle();
            const sp = (wsRow as any)?.season_phase;
            const validPhases = ["preseason", "inseason", "playoffs", "offseason"];
            if (validPhases.includes(sp)) {
              resolvedSeasonPhase = sp;
              setActiveSeasonPhase(sp);
            }
          } catch { /* keep default inseason */ }

          // Look up team's custom template table (if any) — exclude player overrides
          try {
            const { data: ctSet } = await supabase
              .from("custom_template_sets")
              .select("table_name")
              .eq("team_id", prof.team_id)
              .is("player_id", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (ctSet?.table_name) {
              resolvedTableName = ctSet.table_name;
              setTemplateTableName(ctSet.table_name);
            }
          } catch { /* keep default microdose_templates */ }
        }

        if (!prof?.player_id) {
          // Edge case: profile exists but player_id was never linked.
          // Try to auto-link via user_id on the players table (created by trigger).
          const { data: playerByUser } = await supabase
            .from("players")
            .select("id, full_name, position, team, status")
            .eq("user_id", userId)
            .maybeSingle();

          if (playerByUser?.id) {
            // Repair the link silently so future loads work automatically
            await supabase.from("profiles").update({ player_id: playerByUser.id }).eq("id", userId);
            setPlayerMeta(playerByUser as any);
            setPlayerStatus((playerByUser as any).status ?? "PENDING");
            return;
          }

          // No player row at all — load list so the coach can manually link
          const { data: list, error: lErr } = await supabase
            .from("players")
            .select("id, full_name, position, team")
            .order("full_name", { ascending: true });
          if (lErr) throw new Error(lErr.message);
          setPlayers((list as PlayerRow[]) ?? []);
          return;
        }

        const safeDay = sanitizeDay(day);

        const { data: pm, error: pmErr } = await supabase
          .from("players")
          .select("id, full_name, position, team, status")
          .eq("id", prof.player_id)
          .maybeSingle();
        if (pmErr) console.error("players meta error:", pmErr.message);
        setPlayerMeta((pm as any) ?? null);

        // If player is still pending approval, show waiting screen — skip heavy data load
        const status = (pm as any)?.status ?? "ACTIVE";
        setPlayerStatus(status as "PENDING" | "ACTIVE" | "REJECTED");
        if (status === "PENDING" || status === "REJECTED") return;

        await ensureStage4Decision(prof.player_id, safeDay);

        const { data: srow, error: sErr } = await supabase
          .from("v_player_session_today_v2")
          .select("player_id,team_id,day_date,planned_focus,readiness_flag,session_type,md_day_resolved")
          .eq("player_id", prof.player_id)
          .eq("day_date", safeDay)
          .maybeSingle();
        if (sErr) console.error("v_player_session_today_v2 error:", sErr.message);
        setSession((srow as any) ?? null);

        const s4 = await fetchStage4FinalDecision(prof.player_id, safeDay);
        setStage4Final((s4 as any) ?? null);

        const { data: coachFlagRow } = await supabase
          .from("v_coach_readiness_today_v8")
          .select("final_flag, final_color")
          .eq("player_id", prof.player_id)
          .eq("entry_date", safeDay)
          .maybeSingle();
        setCoachFinalFlag((coachFlagRow as any) ?? null);

        const p = await fetchStage4Plan(prof.player_id, safeDay, resolvedTableName, resolvedSeasonPhase, prof.team_id);
        if (p) {
          setPlan((p as any) ?? null);
        } else if (srow) {
          setPlanIsFallback(true);
          setPlan({
            decision_id: null,
            team_id: (srow as any).team_id ?? null,
            player_id: prof.player_id,
            entry_date: safeDay,
            md_day: (srow as any).md_day_resolved ?? null,
            readiness_level: (srow as any).readiness_flag ?? null,
            chosen_variant_id: null,
            locked: false,
            source: "RUN_SESSION_FALLBACK",
            confidence: null,
            why: "Fallback plan generated from today's session context.",
            inputs: null,
            training_system: null,
            variant: null,
            title: (srow as any).planned_focus ?? "Training Session",
            description: (srow as any).session_type ? `Session type: ${(srow as any).session_type}` : null,
            structure: [],
          } as Stage4PlanRow);
        } else {
          // Last-resort fallback to preserve the player dashboard layout in dev flow.
          setPlanIsFallback(true);
          setPlan({
            decision_id: null,
            team_id: null,
            player_id: prof.player_id,
            entry_date: safeDay,
            md_day: null,
            readiness_level: "GREEN",
            chosen_variant_id: null,
            locked: false,
            source: "EMPTY_PLAN_FALLBACK",
            confidence: null,
            why: "Fallback plan generated because Stage-4/session rows were unavailable.",
            inputs: null,
            training_system: null,
            variant: null,
            title: "Training Session",
            description: "Plan is being prepared. Follow coach guidance for today.",
            structure: [],
          } as Stage4PlanRow);
        }

        if (isStaffRole(prof?.role)) {
          const did = (p as any)?.decision_id ?? null;
          if (did) await loadOverrideAudit(String(did));
        }

        const { data: mrow, error: mErr } = await supabase
          .from("readiness_entries")
          .select(
            `
            fatigue_energy,
            sleep_quality,
            sleep_duration,
            stress_mood,
            muscle_soreness,
            total_score,
            created_at,
            training_modifier,
            computed_auto_flag
          `
          )
          .eq("player_id", prof.player_id)
          .eq("entry_date", safeDay)
          .maybeSingle();
        if (mErr) console.error("readiness_entries metrics error:", mErr.message);
        setMetrics((mrow as any) ?? null);
        const catapultHistoryStart = new Date(`${safeDay}T00:00:00.000Z`);
        catapultHistoryStart.setUTCDate(catapultHistoryStart.getUTCDate() - 34);
        const catapultStartDate = catapultHistoryStart.toISOString().slice(0, 10);

        const [{ data: catapultTodayRows, error: catapultTodayErr }, { data: catapultHistoryRows, error: catapultHistoryErr }] = await Promise.all([
          supabase
            .from("player_external_load_daily")
            .select("*")
            .in("source", ["catapult", "manual"])
            .eq("player_id", prof.player_id)
            .eq("date", safeDay),
          supabase
            .from("player_external_load_daily")
            .select("*")
            .in("source", ["catapult", "manual"])
            .eq("player_id", prof.player_id)
            .gte("date", catapultStartDate)
            .lte("date", safeDay)
            .order("date", { ascending: true }),
        ]);
        if (catapultTodayErr) console.error("player catapult today error:", catapultTodayErr.message);
        if (catapultHistoryErr) console.error("player catapult history error:", catapultHistoryErr.message);

        // One effective row per date/player-date: a manual coach entry overrides
        // the catapult reading for that day. Dedupe on raw rows (they carry
        // `source`) before normalise, which drops the source column.
        const normalizedPlayerToday = oneRowPerDate(
          (catapultTodayRows ?? []) as Array<Record<string, unknown> & { date: string; source?: string | null }>,
        )
          .map(normalizeCatapultDailyLoadRow)
          .filter((row): row is CatapultDailyLoadRow => row != null)
          .sort((a, b) => a.date.localeCompare(b.date))
          .at(-1) ?? null;
        const normalizedPlayerHistory = oneRowPerDate(
          (catapultHistoryRows ?? []) as Array<Record<string, unknown> & { date: string; source?: string | null }>,
        )
          .map(normalizeCatapultDailyLoadRow)
          .filter((row): row is CatapultDailyLoadRow => row != null)
          .sort((a, b) => a.date.localeCompare(b.date));
        setCatapultToday(normalizedPlayerToday);
        setCatapultHistory(normalizedPlayerHistory);

        if (prof.team_id) {
          const { data: catapultTeamRows, error: catapultTeamErr } = await supabase
            .from("player_external_load_daily")
            .select("*")
            .in("source", ["catapult", "manual"])
            .eq("team_id", prof.team_id)
            .eq("date", safeDay);
          if (catapultTeamErr) {
            console.error("player catapult team error:", catapultTeamErr.message);
            setCatapultTeamToday([]);
          } else {
            setCatapultTeamToday(
              oneRowPerPlayerDate(
                (catapultTeamRows ?? []) as Array<Record<string, unknown> & { player_id?: string | null; date: string; source?: string | null }>,
              )
                .map(normalizeCatapultDailyLoadRow)
                .filter((row): row is CatapultDailyLoadRow => row != null),
            );
          }
        } else {
          setCatapultTeamToday([]);
        }
        setNeuralVolatilityDecision(null);
        setPrescriptionDecision(null);
        setFinalRecommendationDecision(null);
        setTodayCounterfactuals([]);

        const { data: trendRows, error: trendErr } = await supabase
          .from("readiness_entries")
          .select("entry_date,total_score,sleep_quality,stress_mood,fatigue_energy,muscle_soreness")
          .eq("player_id", prof.player_id)
          .lte("entry_date", safeDay)
          .order("entry_date", { ascending: true })
          .limit(7);
        if (trendErr) {
          console.error("readiness trend error:", trendErr.message);
          setNeuralVolatilityDecision(null);
          setPrescriptionDecision(null);
          setFinalRecommendationDecision(null);
          setTodayCounterfactuals([]);
        } else {
          const cleanTrendRows = ((trendRows ?? []) as any[])
            .filter((row) => !!row)
            .sort((a, b) => String(a.entry_date ?? "").localeCompare(String(b.entry_date ?? "")));
          const trendInput =
            cleanTrendRows.map((row: any) => {
              const rawTotal = typeof row.total_score === "number" ? row.total_score : null;
              const normalizedReadiness =
                rawTotal == null ? null : Math.max(0, Math.min(100, ((rawTotal - 5) / 20) * 100));
              const state =
                normalizedReadiness == null
                  ? "GRAY"
                  : normalizedReadiness < 40
                    ? "RED"
                    : normalizedReadiness < 60
                      ? "YELLOW"
                      : "GREEN";
              const d = buildPerformanceIntelligenceDecision({
                date: String(row.entry_date ?? ""),
                readinessScore: normalizedReadiness,
                readinessState: state,
                athleteState: state,
                sessionMode: "pending",
                sleepScore: typeof row.sleep_quality === "number" ? row.sleep_quality : null,
                stressScore: typeof row.stress_mood === "number" ? row.stress_mood : null,
                energyScore: typeof row.fatigue_energy === "number" ? row.fatigue_energy : null,
                sorenessScore: typeof row.muscle_soreness === "number" ? row.muscle_soreness : null,
              });
              return {
                date: String(row.entry_date ?? ""),
                decision: d,
                readinessState: state as "GREEN" | "YELLOW" | "RED" | "GRAY",
              };
            }) ?? [];
          setPlayerRiskTrend(buildPlayerRiskTrend(trendInput));

          const todayRawTotal = typeof mrow?.total_score === "number" ? mrow.total_score : null;
          const todayReadinessScore =
            todayRawTotal == null ? null : Math.max(0, Math.min(100, ((todayRawTotal - 5) / 20) * 100));
          const todaySnapshot = buildDailyAthleteSnapshot({
            athleteId: prof.player_id,
            date: safeDay,
            manual: {
              totalScore: todayRawTotal,
              soreness: typeof mrow?.muscle_soreness === "number" ? mrow.muscle_soreness : null,
              stress: typeof mrow?.stress_mood === "number" ? mrow.stress_mood : null,
              mood: typeof mrow?.stress_mood === "number" ? mrow.stress_mood : null,
              sleepQuality: typeof mrow?.sleep_quality === "number" ? mrow.sleep_quality : null,
              motivation: typeof mrow?.fatigue_energy === "number" ? mrow.fatigue_energy : null,
              completed: todayRawTotal != null,
              sourceDate: safeDay,
            },
            context: {
              rehab: false,
              returnToPlay: false,
              sourceDate: safeDay,
            },
          });
          const readinessDecision = buildExplainableReadinessDecision({
            playerId: prof.player_id,
            playerName: playerMeta?.full_name ?? prof.player_id,
            date: safeDay,
            dailySnapshot: todaySnapshot,
            readinessScore: todayReadinessScore ?? undefined,
            checkinScore: todayRawTotal ?? undefined,
            sleepScore: typeof mrow?.sleep_quality === "number" ? mrow.sleep_quality : undefined,
            sorenessScore: typeof mrow?.muscle_soreness === "number" ? mrow.muscle_soreness : undefined,
          });
          const athleteDecision = buildAthleteDecision({
            snapshot: todaySnapshot,
            readinessDecision,
          });

          // Coach/player verdict alignment (added 2026-04-29).
          //
          // The local buildAthleteDecision call above only sees a sparse
          // subset of inputs (sleep_quality, muscle_soreness, total_score,
          // ydaySnapshot). The coach side runs the SAME engine but with
          // ~25 inputs (Catapult signals, VALD snapshots, baselines, decel
          // intelligence, etc.) — which means the same player on the same
          // day got contradictory verdicts on the two surfaces.
          //
          // We now call /api/player/decision (which shares the engine with
          // /api/team/decisions via the playerDecision lib) and OVERRIDE
          // the local verdict's user-facing fields with the API result.
          // Downstream cards (NVI, PI, prescription) keep using the
          // overridden values so the entire player UI converges to the
          // coach-side verdict.
          //
          // Failure mode: if the API call fails, we fall back to the
          // locally computed verdict — better something than a blank
          // screen. The fallback is the OLD behaviour (sparse inputs)
          // and may diverge from the coach side; that's acceptable for
          // the rare failure case.
          try {
            const apiRes = await supabase.auth.getSession();
            const apiToken = apiRes.data.session?.access_token;
            if (apiToken) {
              const res = await fetch(`/api/player/decision?date=${encodeURIComponent(safeDay)}`, {
                headers: { Authorization: `Bearer ${apiToken}` },
              });
              if (res.ok) {
                const apiJson = await res.json() as {
                  decision?: {
                    recommendation?: { state?: string; sessionMode?: string };
                    counterfactuals?: unknown[];
                    forecast?: unknown;
                  };
                };
                const apiRec = apiJson.decision?.recommendation;
                if (apiRec?.state) {
                  // Mutate in place — athleteDecision is a local variable
                  // (not React state); downstream consumers in this useEffect
                  // see the corrected verdict.
                  (athleteDecision as { athleteState: string }).athleteState = String(apiRec.state).toUpperCase();
                  if (apiRec.sessionMode) {
                    (athleteDecision as { sessionMode: string }).sessionMode = String(apiRec.sessionMode);
                  }
                }
                // Counterfactuals from the full pipeline are richer than
                // the local sparse-input ones — prefer them when present.
                if (Array.isArray(apiJson.decision?.counterfactuals)) {
                  (athleteDecision as { counterfactuals: unknown[] }).counterfactuals = apiJson.decision!.counterfactuals!;
                }
                if (apiJson.decision?.forecast) {
                  (athleteDecision as { forecast: unknown }).forecast = apiJson.decision.forecast;
                }
              } else {
                console.warn("[player/decision] non-OK response", res.status);
              }
            }
          } catch (e) {
            console.warn("[player/decision] coach-aligned verdict fetch failed; using local fallback", e);
          }

          // Persist counterfactuals to state so the "What would help"
          // panel can render them under the explanation card. Engine
          // returns empty for GREEN/GRAY days — panel hidden in that case.
          setTodayCounterfactuals(athleteDecision.counterfactuals ?? []);
          const riskHistory = trendInput.map((item) => item.decision.injuryRisk.score);

          const nviDecision = buildNeuralVolatilityIntelligenceDecision({
            date: safeDay,
            readinessScore: todayReadinessScore,
            readinessState: athleteDecision.athleteState,
            athleteState: athleteDecision.athleteState,
            sessionMode: athleteDecision.sessionMode,
            sorenessScore: typeof mrow?.muscle_soreness === "number" ? mrow.muscle_soreness : null,
            sleepScore: typeof mrow?.sleep_quality === "number" ? mrow.sleep_quality : null,
            stressScore: typeof mrow?.stress_mood === "number" ? mrow.stress_mood : null,
            energyScore: typeof mrow?.fatigue_energy === "number" ? mrow.fatigue_energy : null,
            moodScore: typeof mrow?.stress_mood === "number" ? mrow.stress_mood : null,
            readinessHistory: cleanTrendRows.map((row) =>
              typeof row.total_score === "number" ? Math.max(0, Math.min(100, ((row.total_score - 5) / 20) * 100)) : null,
            ),
            sorenessHistory: cleanTrendRows.map((row) => (typeof row.muscle_soreness === "number" ? row.muscle_soreness : null)),
            sleepHistory: cleanTrendRows.map((row) => (typeof row.sleep_quality === "number" ? row.sleep_quality : null)),
            stressHistory: cleanTrendRows.map((row) => (typeof row.stress_mood === "number" ? row.stress_mood : null)),
            neuralFatigueHistory: cleanTrendRows.map((row) => {
              if (typeof row.total_score === "number" && row.total_score <= 10) return 8;
              if (typeof row.total_score === "number" && row.total_score <= 14) return 6;
              return 4;
            }),
            riskHistory,
          });
          setNeuralVolatilityDecision(nviDecision);

          const piToday = buildPerformanceIntelligenceDecision({
            date: safeDay,
            readinessScore: todayReadinessScore,
            readinessState: athleteDecision.athleteState,
            athleteState: athleteDecision.athleteState,
            sessionMode: athleteDecision.sessionMode,
            sleepScore: typeof mrow?.sleep_quality === "number" ? mrow.sleep_quality : null,
            stressScore: typeof mrow?.stress_mood === "number" ? mrow.stress_mood : null,
            energyScore: typeof mrow?.fatigue_energy === "number" ? mrow.fatigue_energy : null,
            sorenessScore: typeof mrow?.muscle_soreness === "number" ? mrow.muscle_soreness : null,
            zScore: null,
            deltaZ: null,
            volatility5d: null,
            volatility7d: null,
          });

          const prescription = buildPrescriptionDecision({
              date: safeDay,
              readinessScore: todayReadinessScore,
              readinessState: athleteDecision.athleteState,
              athleteState: athleteDecision.athleteState,
              sessionMode: athleteDecision.sessionMode,
              injuryRiskScore: piToday.injuryRisk.score,
              injuryRiskBand: piToday.injuryRisk.band,
              performanceScore: piToday.performanceForecast.score,
              performanceBand: piToday.performanceForecast.band,
              loadToleranceScore: piToday.loadForecast.score,
              loadToleranceBand: piToday.loadForecast.band,
              fatigueAccumulationScore: nviDecision.fatigueAccumulation.score,
              fatigueAccumulationBand: nviDecision.fatigueAccumulation.band,
              instabilityWindowScore: nviDecision.instabilityWindow.score,
              instabilityWindowBand: nviDecision.instabilityWindow.band,
              collapseRiskScore: nviDecision.collapseRisk.score,
              collapseRiskBand: nviDecision.collapseRisk.band,
              peakWindowScore: nviDecision.peakWindow.score,
              peakWindowBand: nviDecision.peakWindow.band,
              trendDirection: nviDecision.trendState.direction,
              sleepScore: typeof mrow?.sleep_quality === "number" ? mrow.sleep_quality : null,
              stressScore: typeof mrow?.stress_mood === "number" ? mrow.stress_mood : null,
              energyScore: typeof mrow?.fatigue_energy === "number" ? mrow.fatigue_energy : null,
              sorenessScore: typeof mrow?.muscle_soreness === "number" ? mrow.muscle_soreness : null,
              plannedSessionType: "mixed",
              plannedSessionIntensity: "moderate",
              dayType: "training",
            });
          setPrescriptionDecision(prescription);

          const runtimeRules = buildRuntimeRulesFromAdminConfig(adminConfigSnapshot);
          const protectedPlayerId = profile?.player_id ?? undefined;
          const protectedTags = protectedPlayerId ? getProtectedPlayerTags(adminConfigSnapshot, protectedPlayerId) : [];
          const protectedByConfig = protectedPlayerId ? isPlayerProtectedByAdminConfig(adminConfigSnapshot, protectedPlayerId) : false;

          const finalDecision = applyCoachRules(
            {
              playerId: profile?.player_id ?? undefined,
              playerName: playerMeta?.full_name ?? undefined,
              teamId: (profile as any)?.team_id ?? undefined,
              dayType: "training",
              weekDensity: "normal",
              playerTags: protectedByConfig ? Array.from(new Set(["protected", ...protectedTags])) : protectedTags,
              isProtectedPlayer: protectedByConfig,
              readinessState: athleteDecision.athleteState,
              athleteState: athleteDecision.athleteState,
              injuryRiskBand: piToday.injuryRisk.band,
              injuryRiskScore: piToday.injuryRisk.score,
              performanceBand: piToday.performanceForecast.band,
              loadToleranceBand: piToday.loadForecast.band,
              fatigueAccumulationBand: nviDecision.fatigueAccumulation.band,
              instabilityWindowBand: nviDecision.instabilityWindow.band,
              collapseRiskBand: nviDecision.collapseRisk.band,
              peakWindowBand: nviDecision.peakWindow.band,
              trendDirection: nviDecision.trendState.direction,
              prescriptionDecision: prescription,
              dataConfidence: prescription.confidence,
            },
            runtimeRules,
            null,
          );
          setFinalRecommendationDecision(finalDecision);

          setSessionDraft(
            buildSessionDraft({
              playerId: profile?.player_id ?? undefined,
              playerName: playerMeta?.full_name ?? undefined,
              teamId: (profile as any)?.team_id ?? undefined,
              date: safeDay,
              dayType: "training",
              weekDensity: "normal",
              plannedSessionType: "mixed",
              plannedSessionIntensity: "moderate",
              prescriptionDecision: prescription,
              finalRecommendationDecision: finalDecision,
              dataConfidence: finalDecision.confidence,
              isProtectedPlayer: protectedByConfig,
            }),
          );

          // Session workflow loading removed (feature removed)
        }

        await loadFixModulesForPlayer(prof.player_id);
        await loadSessionRpeHistory();
        await loadSessionRpeStatus();
      } catch (e: any) {
        console.error("PlayerPage load error:", e);
        setError(e?.message ?? "Óþekkt villa.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [supabase, day, adminConfigSnapshot, lang]);

  // App icon badge: show a dot when today's check-in is missing, clear it once done.
  // Works on iOS 16.4+ PWA, Android Chrome, desktop Chromium.
  useEffect(() => {
    if (loading) return;
    const isToday = day === todayISO();
    const hasMissingCheckin = isToday && !metrics?.created_at;
    try {
      if (hasMissingCheckin) {
        navigator.setAppBadge?.(1);
      } else {
        navigator.clearAppBadge?.();
      }
    } catch {
      // Badge API not supported — silently ignore
    }
  }, [loading, day, metrics]);

  // Session workflow handlers removed (feature removed)

  const flag: Flag = useMemo(() => {
    // Canonical readiness colour ONLY: prefer final_flag, then final_color —
    // sibling columns on the same v_coach_readiness_today_v8 row.
    const fromCoachView =
      parseFinalFlag(coachFinalFlag?.final_flag ?? null) ??
      parseFinalFlag(coachFinalFlag?.final_color ?? null);
    if (fromCoachView) return fromCoachView;

    // No canonical colour → readiness level. NEVER fall back to the stage4
    // training action (system_decision): it's an action, not a verdict colour
    // (CLAUDE.md > "Canonical verdict source").
    return readinessToFlag(plan?.readiness_level);
  }, [coachFinalFlag?.final_flag, coachFinalFlag?.final_color, plan?.readiness_level]);
  const ui = useMemo(() => flagUi(normalizeFlag(flag), lang), [flag, lang]);

  // ── "Af hverju?" explanation lines ──────────────────────────────────
  const explanationLines: ExplanationLine[] = useMemo(() => {
    // Parse training_modifier safely
    const tmRaw = (metrics as any)?.training_modifier;
    const tm: Record<string, any> | null =
      tmRaw == null
        ? null
        : typeof tmRaw === "string"
        ? (() => { try { return JSON.parse(tmRaw); } catch { return null; } })()
        : typeof tmRaw === "object"
        ? tmRaw
        : null;
    const pi = tm?.pi ?? null;

    // Compute best available ACWR (use totalDistance if available)
    const acwrMetric = weeklyLoadMetrics.find((m) => m.key === "totalDistance" && m.acwrSupported);
    const bestAcwr = acwrMetric?.weekly.acwr ?? null;

    // Check for GPS spike: any metric > 1.5× team average
    const hasGpsSpike = todayVsTeamMetrics.some((m) => {
      if (m.value == null || m.teamAverage == null || m.teamAverage <= 0) return false;
      return m.value / m.teamAverage > 1.5;
    });

    // Map flag to the expected union
    const normFlag = flag === "GREEN" ? "GREEN" as const : flag === "YELLOW" ? "YELLOW" as const : flag === "RED" ? "RED" as const : null;

    return buildPlayerExplanation({
      lang,
      finalFlag: normFlag,
      pi: pi
        ? {
            abs: pi.abs ?? null,
            dev: pi.dev ?? null,
            final: pi.final ?? null,
            z: typeof pi.z === "number" ? pi.z : null,
            sten: typeof pi.sten === "number" ? pi.sten : null,
            n: typeof pi.n === "number" ? pi.n : typeof pi.baseline_n === "number" ? pi.baseline_n : null,
            delta_z: typeof pi.delta_z === "number" ? pi.delta_z : null,
            low_count: typeof pi.low_count === "number" ? pi.low_count : null,
            very_low_count: typeof pi.very_low_count === "number" ? pi.very_low_count : null,
            override_note: pi.override_note ?? null,
          }
        : null,
      // MLI and metabolic not computed client-side; leave null — they only fire for VERY_HIGH/EXTREME bands
      mli: null,
      metabolic: null,
      gpsSpike: hasGpsSpike || null,
      acwr: bestAcwr ?? undefined,
      valdAdjustment: null,
      rpeZScore: undefined,
    });
  }, [flag, lang, metrics, weeklyLoadMetrics, todayVsTeamMetrics]);

  useEffect(() => {
    const run = async () => {
      if (!profile) return;
      const teamId = (profile as any)?.team_id ?? null;
      const msg = await loadGenericMessage(teamId, flag, lang);
      setGenericMsg(msg);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, flag, lang]);

  // Load active team memberships for the current player (multi-team pills)
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const playerId = profile?.player_id ?? selectedPlayerId;
      if (!playerId) {
        setActiveTeams([]);
        return;
      }
      const todayStr = todayISO();
      const { data, error: mErr } = await supabase
        .from("player_team_memberships")
        .select("role, valid_from, valid_to, status, team_id, teams(id, name, club_short_name, club_theme_color, team_type)")
        .eq("player_id", playerId)
        .eq("status", "active");
      if (!alive) return;
      if (mErr || !data) {
        setActiveTeams([]);
        return;
      }
      type Row = {
        role: string;
        valid_from: string;
        valid_to: string | null;
        status: string;
        team_id: string;
        teams: { id: string; name: string; club_short_name: string | null; club_theme_color: string | null; team_type: string | null } | Array<{ id: string; name: string; club_short_name: string | null; club_theme_color: string | null; team_type: string | null }> | null;
      };
      const pills: ActiveTeamPill[] = [];
      for (const row of data as unknown as Row[]) {
        if (row.valid_from && row.valid_from > todayStr) continue;
        if (row.valid_to && row.valid_to < todayStr) continue;
        const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
        if (!team) continue;
        pills.push({
          id: team.id,
          name: team.name,
          short: team.club_short_name,
          color: team.club_theme_color,
          role: row.role,
          type: team.team_type,
        });
      }
      // Sort: primary_club first, then national, then others
      const order: Record<string, number> = { primary_club: 0, national_team: 1, loan: 2, guest: 3 };
      pills.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
      setActiveTeams(pills);
    };
    run();
    return () => { alive = false; };
  }, [profile?.player_id, selectedPlayerId, supabase]);

  useEffect(() => {
    const run = async () => {
      if (!plan) return;

      const mdDay = norm(plan.md_day || session?.md_day_resolved || null);
      const sprintExposure = inferSprintExposure(session?.session_type ?? null);
      const matchLike = inferMatchLike(session?.session_type ?? null);

      const ctx: PostTrainingContext = {
        mdDay: mdDay || null,
        sessionLoad: null,
        sprintExposure,
        matchLike,
      };

      await loadPostTrainingRecommendations(ctx, lang);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.md_day, session?.session_type, session?.md_day_resolved, lang]);

  // "Session done" signal for the Reload window: the latest REAL (non-imputed)
  // session-RPE submission for the viewed day. Only meaningful for today — on a
  // past day there is no live 30-min window, so leave it null.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const playerId = profile?.player_id ?? selectedPlayerId;
      if (!playerId || day !== todayISO()) { setRpeDoneAt(null); return; }
      const { data } = await supabase
        .from("session_rpe_entries")
        .select("submitted_at, created_at, is_imputed")
        .eq("player_id", playerId)
        .eq("session_date", day)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!alive) return;
      const real = ((data ?? []) as Array<{ submitted_at: string | null; created_at: string | null; is_imputed: boolean | null }>)
        .find((r) => !r.is_imputed);
      setRpeDoneAt(real ? (real.submitted_at ?? real.created_at ?? null) : null);
    };
    run();
    return () => { alive = false; };
  }, [profile?.player_id, selectedPlayerId, supabase, day]);

  useEffect(() => {
    const run = async () => {
      if (!plan) {
        setPlanTemplateOverride(null);
        return;
      }

      // A coach-sent session is authoritative and already tuned to today — do
      // NOT reconcile it against a microdose template for the live readiness
      // flag (that would shadow the sent structure at planStructureForRender).
      if (plan.source === "COACH_SENT") {
        setPlanTemplateOverride(null);
        return;
      }

      const mdDay = plan?.md_day ?? session?.md_day_resolved ?? null;

      if (!mdDay) {
        setPlanTemplateOverride(null);
        return;
      }

      const desiredReadiness = flagToReadinessLevel(flag);
      const currentReadiness = norm(plan.readiness_level);
      if (currentReadiness === desiredReadiness) {
        setPlanTemplateOverride(null);
        return;
      }

      const overrideTeamId = (profile as any)?.team_id ?? null;
      const playerIdForOverride = (profile as any)?.player_id ?? null;

      // Per-player override resolution (mirrors logic in fetchStage4Plan).
      // If an active player override exists for today and covers this MD-day, use its table.
      let effectiveOverrideTbl = templateTableName as string;
      if (playerIdForOverride && day) {
        try {
          const { data: overrideRow } = await supabase
            .from("custom_template_sets")
            .select("table_name, md_days")
            .eq("player_id", playerIdForOverride)
            .lte("start_date", day)
            .gte("end_date", day)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const overrideDays = Array.isArray((overrideRow as any)?.md_days)
            ? ((overrideRow as any).md_days as string[])
            : [];
          if ((overrideRow as any)?.table_name && overrideDays.includes(mdDay)) {
            effectiveOverrideTbl = (overrideRow as any).table_name;
          }
        } catch { /* fall back silently */ }
      }

      const { data, error } = await supabase
        .from(effectiveOverrideTbl as any)
        .select("title, description, structure, structure_en, readiness_level, md_day, variant")
        .eq("team_id", overrideTeamId)
        .eq("readiness_level", desiredReadiness)
        .eq("md_day", mdDay)
        .eq("season_phase", activeSeasonPhase)
        .order("variant", { ascending: true });

      if (error) {
        console.error("microdose_templates override error:", error.message);
        setPlanTemplateOverride(null);
        return;
      }

      let rows = ((data as any[]) ?? []) as Array<{
        title: string | null;
        description: string | null;
        structure: any;
        structure_en?: any;
        readiness_level: string | null;
        md_day?: string | null;
        variant?: string | null;
      }>;

      // Fallback: if no exact md_day row was found for desired readiness, pick the first available
      // row for this team+readiness so player view still follows the effective readiness flag.
      if (!rows.length) {
        const { data: fallbackRows, error: fallbackErr } = await supabase
          .from(templateTableName as any)
          .select("title, description, structure, structure_en, readiness_level, md_day, variant")
          .eq("team_id", overrideTeamId)
          .eq("readiness_level", desiredReadiness)
          .eq("season_phase", activeSeasonPhase)
          .order("md_day", { ascending: true })
          .order("variant", { ascending: true })
          .limit(20);

        if (fallbackErr) {
          console.error("microdose_templates override fallback error:", fallbackErr.message);
          setPlanTemplateOverride(null);
          return;
        }
        rows = ((fallbackRows as any[]) ?? []) as Array<{
          title: string | null;
          description: string | null;
          structure: any;
          structure_en?: any;
          readiness_level: string | null;
          md_day?: string | null;
          variant?: string | null;
        }>;
      }

      // Apply language preference: use structure_en when available in EN mode
      const localisedRows = rows.map((r) => ({
        ...r,
        structure: (lang === "EN" && r.structure_en) ? r.structure_en : r.structure,
      }));

      const chosen = selectTemplateOverrideCandidate(localisedRows, plan?.variant ?? null, mdDay);
      setPlanTemplateOverride((chosen as PlanTemplateOverrideRow) ?? null);
    };

    run();
  }, [supabase, plan?.md_day, plan?.variant, plan?.readiness_level, session?.md_day_resolved, flag, lang]);

  async function linkPlayer() {
    try {
      setError("");
      if (!profile?.id) return;
      if (!selectedPlayerId) return setError("Veldu leikmann fyrst.");

      const { error: uErr } = await supabase.from("profiles").update({ player_id: selectedPlayerId }).eq("id", profile.id);
      if (uErr) return setError(uErr.message);

      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? "Óþekkt villa.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-800" />
          <div className="text-sm text-zinc-400">{t.training.loading}</div>
        </div>
      </div>
    );
  }

  if (playerStatus === "PENDING") {
    const isPendingCopy = lang === "EN"
      ? {
          icon: "⏳",
          title: "Waiting for coach approval",
          body: "Your registration has been received. Your coach needs to approve your account before you can start checking in.",
          sub: "You will be notified once approved.",
          name: playerMeta?.full_name ?? "",
        }
      : {
          icon: "⏳",
          title: "Bíður samþykkis þjálfara",
          body: "Skráning þín er móttekin. Þjálfari þarf að samþykkja aðganginn þinn áður en þú getur byrjað að skrá þig inn.",
          sub: "Þú verður látinn/látin vita þegar þú ert samþykkt/ur.",
          name: playerMeta?.full_name ?? "",
        };
    return (
      <div className="min-h-screen bg-zinc-50 flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-3xl">
              {isPendingCopy.icon}
            </div>
            {isPendingCopy.name ? (
              <div className="text-sm font-medium text-zinc-500 mb-1">{isPendingCopy.name}</div>
            ) : null}
            <div className="text-base font-semibold text-zinc-900">{isPendingCopy.title}</div>
            <div className="mt-2 text-sm text-zinc-500 leading-relaxed">{isPendingCopy.body}</div>
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
              {isPendingCopy.sub}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              {lang === "EN" ? "Refresh" : "Uppfæra"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (playerStatus === "REJECTED") {
    const isRejectedCopy = lang === "EN"
      ? {
          title: "Registration not approved",
          body: "Your registration was not approved by the coach. Please contact your coach or team administrator.",
        }
      : {
          title: "Skráning hafnað",
          body: "Skráning þín var ekki samþykkt af þjálfara. Hafðu samband við þjálfara eða stjórnanda liðsins.",
        };
    return (
      <div className="min-h-screen bg-zinc-50 flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-red-200 bg-white shadow-sm p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-3xl">
              ✗
            </div>
            <div className="text-base font-semibold text-zinc-900">{isRejectedCopy.title}</div>
            <div className="mt-2 text-sm text-zinc-500 leading-relaxed">{isRejectedCopy.body}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
              <svg className="h-7 w-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
              </svg>
            </div>
            <div className="text-base font-semibold text-zinc-900">{t.misc.noDataTitle}</div>
            <div className="mt-2 text-sm text-zinc-500 leading-relaxed">
              {t.misc.noDataBody}
            </div>
            <a
              href="/player/checkin"
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
            >
              {t.misc.noDataBtn}
            </a>
            <div className="mt-3 text-xs text-zinc-400">{sanitizeDay(day)}</div>
          </div>
        </div>
      </div>
    );
  }

  const today = sanitizeDay(day);

  const name = playerMeta?.full_name ?? t.misc.playerFallback;
  const position = (playerMeta?.position ?? "").toUpperCase();
  const team = playerMeta?.team ?? "";

  const decisionType: DecisionType = (() => {
    const fromFlag = flagToDecision(flag);
    const fromFinal = (stage4Final?.final_decision ?? null) as DecisionType | null;
    if (!fromFinal) return fromFlag;

    const finalAsFlag = decisionToFlag(fromFinal);
    if (finalAsFlag && finalAsFlag === flag) return fromFinal;

    // Keep player-facing command aligned with effective final flag shown in UI.
    return fromFlag;
  })();

  const mdLabel = mdContextLabel(plan.md_day || session?.md_day_resolved || null);

  const lockedBool = !!(stage4Final?.locked ?? plan.locked);
  const lockLabel = lockedBool ? t.misc.locked : t.misc.unlocked;

  const trainingSystemLabel = plan.training_system ? String(plan.training_system) : "—";
  const planStructureForRender = planTemplateOverride?.structure ?? plan.structure;
  // A coach-sent template (player_template_assignments) becomes today's session
  // and REPLACES the auto team session — the coach's explicit choice for the day
  // wins, so the default "Æfing dagsins" card is suppressed whenever one exists.
  // Gate on the template's PRESENCE (not parse success) so the team session drops
  // even when the template only renders as read-only text. Plain calls (cheap),
  // not hooks — safe below the loading guards.
  const hasCoachSentTemplate = !!tplToday?.template;
  const coachTemplateBlocks = coachTemplateToBlocks(tplToday?.template ?? null);
  const sessionHeaderTitle = normalizeSessionHeaderTitleByFlag(planTemplateOverride?.title ?? plan.title, flag);
  const sessionHeaderDesc = planTemplateOverride?.description ?? plan.description;

  const coachMsg = (stage4Final?.coach_note ?? "").trim();
  const baseMsg = genericMsg?.message || (ui as any).playerMessage;
  const message = coachMsg ? coachMsg : baseMsg;

  const exerciseRecommendationContext: ExerciseRecommendationContext = {
    readinessState: flag === "GREEN" || flag === "YELLOW" || flag === "RED" ? flag : null,
    riskState:
      finalRecommendationDecision?.finalRecommendation.action === "RECOVERY" || finalRecommendationDecision?.finalRecommendation.action === "HOLD"
        ? "HIGH"
        : finalRecommendationDecision?.finalRecommendation.action === "MODIFIED"
          ? "MODERATE"
          : finalRecommendationDecision?.finalRecommendation.action === "FULL"
            ? "LOW"
            : null,
    trainingMode:
      finalRecommendationDecision?.finalRecommendation.action === "RECOVERY"
        ? "REGENERATE"
        : finalRecommendationDecision?.finalRecommendation.action === "HOLD"
          ? "PROTECT"
          : finalRecommendationDecision?.finalRecommendation.action === "MODIFIED"
            ? "MODIFY"
            : finalRecommendationDecision?.finalRecommendation.action === "FULL"
              ? "PUSH"
              : null,
    neuralSuppressionFlag:
      neuralVolatilityDecision?.collapseRisk.band === "HIGH" ||
      neuralVolatilityDecision?.collapseRisk.band === "CRITICAL" ||
      neuralVolatilityDecision?.fatigueAccumulation.band === "HEAVY",
    modifiedOnlyFlag: decisionType === "REDUCED" || finalRecommendationDecision?.finalRecommendation.action === "MODIFIED",
    kneeIrritationFlag: false,

    // ── Phase 3 flags ───────────────────────────────────────────────────────
    // Post-match residual: MD+1 and MD+2 are the acute recovery window where
    // explosive CNS stimulus should be down-regulated regardless of wellness score.
    postMatchResidualFlag: plan.md_day === "MD+1" || plan.md_day === "MD+2",

    // Lower body soreness: muscle_soreness is scored 1–5; ≤ 2 indicates high soreness.
    lowerBodySorenessFlag:
      typeof metrics?.muscle_soreness === "number" && metrics.muscle_soreness <= 2,

    // TODO: derive from fixture calendar density when schedule data is available
    scheduleCongestionFlag: false,

    // TODO: derive from granular muscle-group soreness data when available
    posteriorChainSorenessFlag: false,

    // TODO: derive from granular muscle-group soreness data when available
    quadDominantSorenessFlag: false,

    // TODO: derive from bilateral force-plate or performance testing data when available
    unilateralDeficitFlag: false,
  };

  const debugLine =
    `day=${today} | ` +
    `plan_entry_date=${plan.entry_date ?? "-"} | ` +
    `final_decision=${stage4Final?.final_decision ?? "-"} | ` +
    `final_source=${stage4Final?.final_source ?? "-"} | ` +
    `md_day=${plan.md_day ?? "-"} | ` +
    `session_md=${session?.md_day_resolved ?? "-"} | ` +
    `session_type=${session?.session_type ?? "-"}`;

  const decisionTone =
    decisionType === "FULL"
      ? "border-emerald-200 bg-emerald-50/50"
      : decisionType === "REDUCED"
      ? "border-amber-200 bg-amber-50/50"
      : "border-rose-200 bg-rose-50/50";

  // Readiness dot + MD chip + a nicely formatted date for the redesigned
  // "Today's decision" block and the cleaned header (mockup: header carries no
  // MD/verdict chips — they live in the decision block).
  const decisionDotClass = flag === "GREEN" ? "bg-emerald-500" : flag === "YELLOW" ? "bg-amber-500" : "bg-rose-500";
  const mdToMatch = mdLabel.match(/MD\s*-\s*(\d+)/i);
  const mdChipText = mdLabel && mdLabel !== "—"
    ? (mdToMatch ? `${mdLabel} · ${mdToMatch[1]} ${lang === "IS" ? "til leiks" : "to match"}` : mdLabel)
    : null;
  // Match day (MD, not MD-1/MD+1): the readiness "decision" hero ("Full session —
  // go at full intensity") is a TRAINING verdict that contradicts the day — it's
  // match day, there's no planned training. So we suppress the decision hero and
  // let the dedicated "Match day!" session card carry the message.
  const isMatchDay = ["MD", "GAME", "MATCH"].includes((mdLabel || "").trim().toUpperCase());
  const niceDate = (() => {
    try {
      return new Date(`${today}T00:00:00`).toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "long" });
    } catch {
      return today;
    }
  })();

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Pull down from the top to refetch — no need to close and reopen the app.
          A manual pull does a full reload (gets everything); returning to the app
          already soft-refreshes coach data via the visibility handler. */}
      <PullToRefresh onRefresh={() => window.location.reload()} lang={lang === "IS" ? "IS" : "EN"} />
      {/* Sticky header — outside padded container so it sticks flush to top-0 */}
      <div className="sticky top-0 z-20 bg-zinc-50/95 backdrop-blur-sm supports-[backdrop-filter]:bg-zinc-50/80">
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:pt-5 pb-2">
          <div data-player-card="header">
            <div className="px-1 py-1">
              <div className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-display text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900">{lang === "IS" ? "Halló" : "Hi"}, {(name || "").split(" ")[0] || name}</div>
                  <div className="mt-1 text-sm text-zinc-500">
                    {niceDate}{team ? ` · ${team}` : ""}{position ? ` · ${position}` : ""}
                  </div>
                  {/* Extra membership chips only when the player belongs to more
                      than one team (national team, loan, guest) — the single
                      club is already in the subtitle above. */}
                  {activeTeams.length > 1 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {activeTeams.map((tt) => {
                        const label = tt.short || tt.name;
                        const color = tt.color || "#8b8676";
                        const bg = `${color}1a`;
                        const roleLabel =
                          tt.role === "national_team"
                            ? (lang === "IS" ? "Landslið" : "National")
                            : tt.role === "loan"
                            ? (lang === "IS" ? "Lán" : "Loan")
                            : tt.role === "guest"
                            ? (lang === "IS" ? "Gestur" : "Guest")
                            : (lang === "IS" ? "Félag" : "Club");
                        return (
                          <span
                            key={tt.id}
                            title={`${tt.name} · ${roleLabel}`}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                            style={{ backgroundColor: bg, color }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                            {label}
                            <span className="opacity-70 font-semibold">· {roleLabel}</span>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Language toggle — the only verdict-neutral control kept on
                      the Today header. The MD + readiness chips now live in the
                      "Today's decision" block below (design mockup). */}
                  <div className="flex items-center rounded-full border border-zinc-200 bg-white p-0.5 text-xs font-semibold">
                    <button
                      onClick={() => setLang("IS")}
                      className={cx("rounded-full px-2.5 py-1 transition-colors", lang === "IS" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-700")}
                    >IS</button>
                    <button
                      onClick={() => setLang("EN")}
                      className={cx("rounded-full px-2.5 py-1 transition-colors", lang === "EN" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-700")}
                    >EN</button>
                  </div>

                  {String(stage4Final?.final_source ?? "").toUpperCase() === "COACH" ? (
                    <Chip className="border-amber-200 bg-amber-50 text-amber-800">Override</Chip>
                  ) : null}

                  {/* Dev / account chips — Integrations · lock state · decision
                      · Sign out. Hidden on the PWA Today (they move to the
                      bottom-nav "More" sheet, Lota E / E1) but kept on desktop,
                      which has no More sheet. The PlayerTabbedClient layout
                      effect toggles this wrapper by data-player-devchips. */}
                  <div data-player-devchips className="flex flex-wrap items-center gap-2">
                    <Link
                      href="/player/settings/integrations"
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                    >
                      Integrations
                    </Link>
                    <Chip>{lockLabel}</Chip>
                    <Chip className="border-zinc-200">{decisionType}</Chip>
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut();
                        window.location.href = "/login";
                      }}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                    >
                      {lang === "IS" ? "Útskrá" : "Sign out"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-1 pb-6 sm:pb-8">

        {today === todayISO() && !metrics?.created_at ? (
          <div className="mb-5">
            <MissingCheckinBanner lang={lang} />
          </div>
        ) : null}

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Decision hero — the readiness statement + optional coach note.
                (E2 tried to move this into the AteCommandCard portal, but that
                portal does not render on this deployment, which left an empty
                anchor + a visible gap — so the message stays here.) This div is
                also the layout anchor (data-player-card="decision"). */}
            {/* On match day the training verdict is suppressed (see isMatchDay).
                The anchor node stays so DOM-injected cards that position relative
                to "decision" keep their place. */}
            {isMatchDay ? (
              <div data-player-card="decision" className="hidden" />
            ) : (
            <div data-player-card="decision" className={cx("rounded-2xl border p-4 sm:p-5 shadow-sm", decisionTone)}>
              {/* Kicker row: readiness dot + label + MD chip (design mockup) */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", decisionDotClass)} />
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    {lang === "IS" ? "Ákvörðun dagsins" : "Today's decision"}
                  </span>
                </div>
                {mdChipText ? (
                  <span className="shrink-0 rounded-full border border-zinc-200 bg-white/70 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide text-zinc-600">
                    {mdChipText}
                  </span>
                ) : null}
              </div>

              {/* Verdict headline (Archivo display font) */}
              {(ui as any).title ? (
                <div className="mt-3 font-display text-3xl sm:text-4xl font-bold leading-[1.05] tracking-tight text-zinc-900">
                  {(ui as any).title}
                </div>
              ) : null}

              {coachMsg ? (
                <div className="mt-2 inline-flex items-center rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
                  {t.decision.coachMsg}
                </div>
              ) : null}

              {/* Supporting "why" line */}
              <div className="mt-2 text-sm leading-relaxed text-zinc-700">{message}</div>
            </div>
            )}

            {/* Explanation card — shows on ALL colours now. GREEN gets a
                reassuring "here's why you're cleared" line; YELLOW/RED get
                the driver breakdown + counterfactual. The card title and
                footer adapt to the colour. Player-side explainability
                mirrors the coach Daily Briefing (manifesto principle #2). */}
            {explanationLines.length > 0 && (() => {
              const isGreenExplain = flag === "GREEN" || explanationLines.every((l) => l.severity === "positive");
              return (
              <div data-player-card="explanation" className={`rounded-2xl border p-4 sm:p-5 shadow-sm ${isGreenExplain ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{isGreenExplain ? "✅" : "💡"}</span>
                  <span className={`text-sm font-bold ${isGreenExplain ? "text-emerald-900" : "text-amber-900"}`}>
                    {isGreenExplain
                      ? (lang === "IS" ? "Af hverju er ég grænn?" : "Why am I green?")
                      : (lang === "IS" ? "Af hverju er ég ekki græn/n?" : "Why am I not green?")}
                  </span>
                </div>
                <div className="space-y-2">
                  {explanationLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border px-3 py-2.5 text-sm ${
                        line.severity === "high"
                          ? "border-red-200 bg-red-50 text-red-900"
                          : line.severity === "moderate"
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : line.severity === "positive"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-zinc-200 bg-zinc-50 text-zinc-800"
                      }`}
                    >
                      <span className="font-semibold">{line.category}</span>
                      <span className="mx-1.5 text-zinc-400">·</span>
                      <span>{line.text}</span>
                    </div>
                  ))}
                </div>
                <div className={`mt-3 text-xs ${isGreenExplain ? "text-emerald-700/80" : "text-amber-700/80"}`}>
                  {isGreenExplain
                    ? (lang === "IS"
                        ? "Byggt á öllum gögnunum þínum — wellness, æfingaálag og leikminni."
                        : "Based on all your data — wellness, training load and match minutes.")
                    : (lang === "IS"
                        ? "Þessir þættir drógu niður heildarmat þitt í dag."
                        : "These factors pulled your overall assessment down today.")}
                </div>
                {/* "What would help" panel — counterfactual lever the
                    player could focus on. Shown only when the engine
                    found at least one single-flip that would improve
                    today's verdict. Empty for multi-concern days where
                    no single thing would help — which is honest. */}
                {todayCounterfactuals.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">🎯</span>
                      <span className="text-sm font-bold text-sky-900">
                        {lang === "IS" ? "Hvað myndi hjálpa" : "What would help"}
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-sm leading-6 text-sky-900">
                      {todayCounterfactuals.map((cf, idx) => (
                        <li key={`cf-${idx}`} className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                              cf.hypotheticalState === "GREEN"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : cf.hypotheticalState === "YELLOW"
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-slate-300 bg-white text-slate-700"
                            }`}
                          >
                            →{cf.hypotheticalState}
                          </span>
                          <span>{lang === "IS" ? cf.descriptionIS : cf.descriptionEN}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Layer 2 (manifesto layered-read): "Behind the numbers" —
                    how the verdict is computed, the signals used, confidence
                    and caveats, kept behind a toggle so the plain "why" above
                    is never buried under the raw method. */}
                {(() => {
                  const b = t.decision.behind;
                  const signalCats = Array.from(new Set(explanationLines.map((l) => l.category)));
                  const hasBaseline = metrics?.total_score != null;
                  return (
                    <details className="mt-3 group/behind">
                      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700">
                        <span className="transition group-open/behind:rotate-90">▸</span>
                        {b.toggle}
                      </summary>
                      <div className="mt-2 space-y-2.5 rounded-xl border border-zinc-200 bg-white/70 p-3 text-xs leading-relaxed text-zinc-700">
                        <div>
                          <div className="font-semibold text-zinc-800">{b.measuresLabel}</div>
                          <div>{b.measures}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-800">{b.howLabel}</div>
                          <div>{b.how}</div>
                        </div>
                        {signalCats.length > 0 ? (
                          <div>
                            <div className="font-semibold text-zinc-800">{b.signalsLabel}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {signalCats.map((cat) => (
                                <span key={cat} className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600">{cat}</span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <div className="font-semibold text-zinc-800">{b.confidenceLabel}</div>
                          <div>{hasBaseline ? b.confidenceHasBaseline : b.confidenceNoBaseline}</div>
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-800">{b.caveatLabel}</div>
                          <div>{b.caveat}</div>
                          <div className="mt-1 text-[11px] text-zinc-400">{b.cite}</div>
                        </div>
                      </div>
                    </details>
                  );
                })()}
              </div>
              );
            })()}

            {/* NOTE: the Explainable Signal Pack renders on Today via PlayerSignalPackPortal
                in PlayerTabbedClient — the visible Today is portal-composed, so inline JSX
                here lands in the hidden source layer and never appears. */}

            {/* Metrics */}
            <CardShell data-player-card="metrics">
              <details className="group" open>
                <summary className="cursor-pointer select-none p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <SectionTitle kicker="Readiness" title={t.readiness.title} sub={t.readiness.sub} />
                    <div className="text-xs font-semibold text-zinc-500 group-open:hidden">{t.misc.open}</div>
                    <div className="hidden text-xs font-semibold text-zinc-500 group-open:block">{t.misc.close}</div>
                  </div>

                  {/* ✅ Mobile: 2 cols, Desktop: 3 cols */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="rounded-xl border bg-white px-3 py-2 text-xs text-zinc-700">
                      <span className="font-semibold">Energy</span>: {metrics?.fatigue_energy ?? "—"}
                    </div>
                    <div className="rounded-xl border bg-white px-3 py-2 text-xs text-zinc-700">
                      <span className="font-semibold">Sleep</span>: {metrics?.sleep_quality ?? "—"}
                    </div>
                    <div className="rounded-xl border bg-white px-3 py-2 text-xs text-zinc-700">
                      <span className="font-semibold">Total</span>: {metrics?.total_score ?? "—"}
                    </div>
                  </div>

                  {catapultToday || catapultHistory.length ? (
                    <div className="mt-3 rounded-xl border bg-white px-3 py-2 text-xs text-zinc-700">
                      <span className="font-semibold">Catapult</span>: Required external-load metrics available below.
                    </div>
                  ) : null}
                </summary>

                <Divider />

                <div className="p-4 sm:p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <MetricBox label="Fatigue / Energy" value={metrics?.fatigue_energy} />
                    <MetricBox label="Sleep Quality" value={metrics?.sleep_quality} />
                    <MetricBox label="Sleep Duration" value={metrics?.sleep_duration} />
                    <MetricBox label="Stress / Mood" value={metrics?.stress_mood} />
                    <MetricBox label="Muscle Soreness" value={metrics?.muscle_soreness} />
                    <MetricBox label="Total" value={metrics?.total_score} />
                  </div>

                  <div className="mt-5">
                    <div className={`rounded-xl border px-4 py-3 ${gpsDate === day ? "border-zinc-200 bg-zinc-50" : "border-blue-200 bg-blue-50"}`}>
                      <div className="flex items-center justify-between">
                        <button
                          onClick={gpsDateBack}
                          disabled={gpsLoading || (() => { const d = new Date(`${gpsDate}T00:00:00.000Z`); const e = new Date(`${day}T00:00:00.000Z`); e.setUTCDate(e.getUTCDate() - 6); return d <= e; })()}
                          className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition shadow-sm active:scale-95"
                          aria-label="Previous day"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        </button>
                        <div className="flex flex-col items-center">
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">GPS</div>
                          <div className={`text-base font-bold tabular-nums ${gpsDate === day ? "text-zinc-700" : "text-blue-700"}`}>
                            {(() => {
                              if (gpsDate === day) return lang === "IS" ? "Í dag" : "Today";
                              const yesterday = new Date(`${day}T12:00:00.000Z`);
                              yesterday.setUTCDate(yesterday.getUTCDate() - 1);
                              if (gpsDate === yesterday.toISOString().slice(0, 10)) return lang === "IS" ? "Í gær" : "Yesterday";
                              const d = new Date(`${gpsDate}T12:00:00.000Z`);
                              return d.toLocaleDateString(lang === "IS" ? "is-IS" : "en-US", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
                            })()}
                          </div>
                          {gpsDate !== day && (
                            <button
                              onClick={() => { setGpsDate(day); void reloadGpsForDate(day); }}
                              className="mt-1 text-[10px] font-medium text-blue-500 hover:text-blue-700 transition"
                            >
                              {lang === "IS" ? "Fara á í dag" : "Back to today"}
                            </button>
                          )}
                        </div>
                        <button
                          onClick={gpsDateForward}
                          disabled={gpsLoading || gpsDate >= day}
                          className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition shadow-sm active:scale-95"
                          aria-label="Next day"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                      </div>
                    </div>
                    {gpsLoading ? (
                      <div className="mt-3 rounded-xl border bg-zinc-50 p-4 text-center text-sm text-zinc-400">
                        {lang === "IS" ? "Sæki gögn..." : "Loading..."}
                      </div>
                    ) : catapultToday || catapultHistory.length ? (
                      <div className="mt-3 space-y-4">
                        {(() => {
                          // Require a positive value (his or the team's): IMA-only
                          // metrics (accel/decel B2-3) are present-but-0 on GPS-only
                          // (Lite) data, so `!= null` would render spurious "0" tiles.
                          const todayTiles = todayVsTeamMetrics.filter(
                            (item) => (item.value != null && item.value > 0) || (item.teamAverage != null && item.teamAverage > 0)
                          );
                          return todayTiles.length > 0 ? (
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{gpsDate === day ? (lang === "IS" ? "Í dag vs lið" : "Today vs Team") : (lang === "IS" ? "Dagur vs lið" : "Day vs Team")}</div>
                              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {todayTiles.map((item) => {
                                  const tone = externalLoadTone(item.value, item.teamAverage);
                                  return (
                                    <div key={`player-catapult-team-${item.key}`} className={cx("rounded-xl border px-3 py-3", tone.tone)}>
                                      <div className="text-[11px] font-semibold uppercase tracking-wide">{item.label}</div>
                                      <div className="mt-2 text-lg font-semibold tabular-nums">{metricFmt(item.value, item.digits)}</div>
                                      <div className="mt-1 text-[11px]">
                                        Team {metricFmt(item.teamAverage, item.digits)} · {tone.label}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null;
                        })()}

                        {(() => {
                          const loadTiles = weeklyLoadMetrics.filter(
                            (item) => (item.weekly.acute7Avg ?? 0) > 0 || (item.weekly.chronic28Avg ?? 0) > 0
                          );
                          return loadTiles.length > 0 ? (
                            <div>
                              <div className="flex items-center justify-between">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">GPS Load Monitoring</div>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> &lt;0.8</span>
                                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> 0.8–1.3</span>
                                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> 1.3–1.5</span>
                                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> &gt;1.5</span>
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {loadTiles.map((item) => {
                                  const zone = item.acwrSupported ? acwrZone(item.weekly.acwr) : acwrZone(null);
                                  return (
                                    <div key={`player-catapult-weekly-${item.key}`} className={cx("rounded-xl border px-3 py-3", zone.bg)}>
                                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{item.label}</div>
                                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                                        <div>
                                          <div className="uppercase tracking-wide text-zinc-400">7D</div>
                                          <div className="mt-1 text-sm font-semibold tabular-nums text-zinc-800">
                                            {metricFmt(item.weekly.acute7Avg, item.digits)}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="uppercase tracking-wide text-zinc-400">28D</div>
                                          <div className="mt-1 text-sm font-semibold tabular-nums text-zinc-800">
                                            {metricFmt(item.weekly.chronic28Avg, item.digits)}
                                          </div>
                                        </div>
                                        <div>
                                          <div className="uppercase tracking-wide text-zinc-400">ACWR</div>
                                          <div className={cx("mt-1 text-sm font-semibold tabular-nums", item.acwrSupported ? zone.text : "text-zinc-400")}>
                                            {item.acwrSupported ? acwrFmt(item.weekly.acwr) : "—"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null;
                        })()}

                        {/* Player-facing IMA movement (jumps, high-intensity
                            actions, direction changes, high-speed running) vs
                            the player's own normal — motivating, not a risk
                            score. */}
                        <PlayerMovementCard date={gpsDate} lang={lang === "IS" ? "IS" : "EN"} />

                        {/* The player's own HR-belt session intensity across the 8
                            HR bands — self-hides when they didn't wear a belt.
                            Boundary'd so it can never blank the dashboard. */}
                        <ClientErrorBoundary>
                          <PlayerHrZoneCard date={gpsDate} lang={lang === "IS" ? "IS" : "EN"} />
                        </ClientErrorBoundary>

                        {/* The player's own load broken down by drill for the
                            selected pager date — follows gpsDate, self-hides when
                            the day has no per-drill data. Boundary'd so it can
                            never blank the dashboard. */}
                        <ClientErrorBoundary>
                          <PlayerDrillLoadCard date={gpsDate} lang={lang === "IS" ? "IS" : "EN"} />
                        </ClientErrorBoundary>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border bg-zinc-50 p-3 text-sm text-zinc-600">
                        {lang === "IS" ? "Engin GPS gögn fyrir þennan dag." : "No Catapult external-load data available for this day."}
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </CardShell>

            <PlayerRobustnessCard lang={lang === "IS" ? "IS" : "EN"} />

            {profile?.player_id ? <ValdStatusCard playerId={profile.player_id} date={today} /> : null}

            <CardShell data-player-card="risk">
              <details className="group">
                <summary className="cursor-pointer select-none p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <SectionTitle kicker="Performance Intelligence" title="Player Risk Trend" sub="Last 7 days risk trend." />
                    <div className="text-xs font-semibold text-zinc-500 group-open:hidden">Open</div>
                    <div className="hidden text-xs font-semibold text-zinc-500 group-open:block">Close</div>
                  </div>
                </summary>
                <Divider />
                <div className="p-4 sm:p-5">
                  {playerRiskTrend.riskScores.length >= 2 ? (
                    <div className="rounded-xl border bg-white p-3">
                      <svg viewBox="0 0 320 80" className="h-20 w-full" role="img" aria-label="Player risk trend">
                        <line x1="0" y1="79.5" x2="320" y2="79.5" stroke="#e6e1d4" strokeWidth="1" />
                        <line x1="0" y1="40" x2="320" y2="40" stroke="#efece2" strokeWidth="1" />
                        <polyline
                          fill="none"
                          stroke="#565044"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={riskTrendLinePoints(playerRiskTrend.riskScores)}
                        />
                        {playerRiskTrend.riskScores.map((score, idx) => {
                          const x = 8 + (idx * (320 - 16)) / Math.max(1, playerRiskTrend.riskScores.length - 1);
                          const y = 8 + (1 - Math.max(0, Math.min(100, score)) / 100) * (80 - 16);
                          return (
                            <g key={`risk-point-${idx}`}>
                              <circle
                                cx={x}
                                cy={y}
                                r="2.4"
                                fill={readinessMarkerTone(playerRiskTrend.readinessStates[idx] ?? "GRAY")}
                              />
                              <text x={x} y={Math.max(8, y - 4)} textAnchor="middle" fontSize="7" fill="#565044">
                                {score.toFixed(1)}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-zinc-600">
                        {playerRiskTrend.dates.map((d, idx) => (
                          <span key={`risk-day-${d}-${idx}`} className="rounded border bg-zinc-50 px-1.5 py-0.5 tabular-nums">
                            {d}: {playerRiskTrend.riskScores[idx]?.toFixed(1) ?? "—"} ({playerRiskTrend.readinessStates[idx] ?? "GRAY"})
                          </span>
                        ))}
                      </div>
                      {neuralVolatilityDecision ? (
                        <div className="mt-2 rounded-lg border bg-zinc-50 p-2 text-[11px] text-zinc-700">
                          Fatigue build: <span className="font-semibold">{neuralVolatilityDecision.fatigueAccumulation.band}</span> · Stability:{" "}
                          <span className="font-semibold">{neuralVolatilityDecision.instabilityWindow.band}</span> · Collapse risk:{" "}
                          <span className="font-semibold">{neuralVolatilityDecision.collapseRisk.band}</span> · Peak window:{" "}
                          <span className="font-semibold">{neuralVolatilityDecision.peakWindow.band}</span>
                        </div>
                      ) : null}
                      {prescriptionDecision ? (
                        <div className="mt-2 rounded-lg border bg-zinc-50 p-2 text-[11px] text-zinc-700">
                          <div>
                            Action: <span className="font-semibold">{prescriptionDecision.action}</span> · Intensity cap:{" "}
                            <span className="font-semibold">{prescriptionDecision.intensityCap}</span> · Volume:{" "}
                            <span className="font-semibold">{prescriptionDecision.volumeAdjustment}</span>
                          </div>
                          <div className="mt-1">{prescriptionDecision.coachInstruction}</div>
                        </div>
                      ) : null}
                      {/* Published session view removed (session workflow feature removed) */}
                      {sessionDraft ? (
                        <div className="mt-2 space-y-2">
                          <SessionDraftCard draft={sessionDraft} />
                          <SessionDraftDetails draft={sessionDraft} />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-zinc-50 p-3 text-xs text-zinc-600">Insufficient risk trend data for the last 7 days.</div>
                  )}
                </div>
              </details>
            </CardShell>

            <CardShell data-player-card="reminders">
              <div className="p-4 sm:p-5">
                <EnableRemindersCard />
              </div>
            </CardShell>

            {/* PlayerAccessPanel moved to dedicated Friðhelgi tab in PlayerTabbedClient */}

            {/* Post-session RPE */}
            <CardShell data-player-card="rpe">
              <div className="p-4 sm:p-5">
                <SectionTitle kicker={t.rpe.kicker} title={t.rpe.title} sub={t.rpe.sub} />

                {/* Status pill */}
                {sessionRpeStatus && (
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={cx(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        sessionRpeStatus.state === "SUBMITTED_TODAY"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : sessionRpeStatus.state === "NOT_EXPECTED_TODAY"
                          ? "border-slate-200 bg-slate-100 text-slate-700"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      )}
                    >
                      {sessionRpeStatus.state === "SUBMITTED_TODAY"
                        ? lang === "IS" ? "Skráð í dag" : "Submitted today"
                        : sessionRpeStatus.state === "NOT_EXPECTED_TODAY"
                        ? lang === "IS" ? "Ekki vænt í dag" : "Not expected today"
                        : lang === "IS" ? "Vantar skráningu" : "Not yet submitted"}
                    </span>
                    {sessionRpeStatus.latestSubmissionAt && (
                      <span className="text-[11px] text-zinc-400">
                        {new Date(sessionRpeStatus.latestSubmissionAt).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                )}

                {/* ── RPE tap grid ─────────────────────────────── */}
                <div className="mt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                    {lang === "IS" ? "Hversu erfið var æfingin?" : "How hard was the session?"}
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {([1,2,3,4,5,6,7,8,9,10] as const).map((val) => {
                      const selected = sessionRpeForm.rpe === String(val);
                      const color =
                        val <= 2 ? "emerald" :
                        val <= 4 ? "green" :
                        val <= 6 ? "amber" :
                        val <= 8 ? "orange" :
                        "red";
                      const colorClasses = selected
                        ? color === "emerald" ? "bg-emerald-500 border-emerald-600 text-white shadow-md"
                        : color === "green" ? "bg-green-500 border-green-600 text-white shadow-md"
                        : color === "amber" ? "bg-amber-500 border-amber-600 text-white shadow-md"
                        : color === "orange" ? "bg-orange-500 border-orange-600 text-white shadow-md"
                        : "bg-red-500 border-red-600 text-white shadow-md"
                        : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50";
                      const label =
                        val <= 2 ? (lang === "IS" ? "Mjög létt" : "Very easy") :
                        val <= 4 ? (lang === "IS" ? "Létt" : "Easy") :
                        val <= 6 ? (lang === "IS" ? "Miðlungs" : "Moderate") :
                        val <= 8 ? (lang === "IS" ? "Erfitt" : "Hard") :
                        val === 9 ? (lang === "IS" ? "Mjög erfitt" : "Very hard") :
                        (lang === "IS" ? "Hámark" : "Maximal");
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSessionRpeForm((prev) => ({ ...prev, rpe: String(val) }))}
                          className={cx(
                            "relative flex flex-col items-center justify-center rounded-xl border-2 py-3 transition-all",
                            colorClasses
                          )}
                        >
                          <span className="text-lg font-bold tabular-nums leading-none">{val}</span>
                          <span className={cx("mt-0.5 text-[9px] font-medium leading-tight", selected ? "text-white/80" : "text-zinc-400")}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Duration + Load preview ─────────────────── */}
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {/* Duration display / input */}
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      {lang === "IS" ? "Lengd" : "Duration"}
                      {gpsDurationLoading && <span className="ml-1 text-zinc-400 normal-case font-normal">…</span>}
                      {!gpsDurationLoading && gpsDuration != null && (
                        <span className="ml-1 text-emerald-600 normal-case font-normal">GPS</span>
                      )}
                    </label>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={sessionRpeForm.duration_minutes}
                        onChange={(e) => setSessionRpeForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                        placeholder={gpsDuration != null ? String(gpsDuration) : "mín"}
                        className={cx(
                          "h-10 w-full rounded-lg border px-3 text-sm tabular-nums",
                          gpsDuration != null && sessionRpeForm.duration_minutes === String(gpsDuration)
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-white border-zinc-200"
                        )}
                      />
                      <span className="text-xs text-zinc-400 whitespace-nowrap">mín</span>
                    </div>
                  </div>

                  {/* Session load preview */}
                  {sessionRpeForm.rpe && sessionRpeForm.duration_minutes && (
                    <div className="pb-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                        {lang === "IS" ? "Álag" : "Load"}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold tabular-nums text-zinc-900">
                          {sessionLoadPreview ?? "—"}
                        </span>
                        {sessionLoadPreview != null && (
                          <span
                            className={cx(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              formatLoadBandClass(getSessionLoadBand(sessionLoadPreview))
                            )}
                          >
                            {getSessionLoadBand(sessionLoadPreview)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Submit ──────────────────────────────────── */}
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={!sessionRpeValid || sessionRpeSubmitting}
                    onClick={() => submitSessionRpe()}
                    className={cx(
                      "w-full rounded-xl py-3 text-sm font-bold transition-all",
                      sessionRpeValid
                        ? "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]"
                        : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                    )}
                  >
                    {sessionRpeSubmitting
                      ? (lang === "IS" ? "Sendir…" : "Submitting…")
                      : (lang === "IS" ? "Skrá RPE" : "Submit RPE")}
                  </button>
                  {!sessionRpeValid && sessionRpeForm.rpe === "" && (
                    <div className="mt-1.5 text-center text-[11px] text-zinc-400">
                      {lang === "IS" ? "Veldu tölu hér að ofan" : "Tap a number above"}
                    </div>
                  )}
                </div>

                {sessionRpeSuccess ? <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 text-center">{sessionRpeSuccess}</div> : null}
                {sessionRpeError ? <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 text-center">{sessionRpeError}</div> : null}

                {/* ── Recent history (last 10) ────────────────── */}
                <div className="mt-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                    {lang === "IS" ? "Síðustu skráningar" : "Recent submissions"}
                  </div>
                  {sessionRpeHistoryLoading ? (
                    <div className="text-xs text-zinc-400">Loading...</div>
                  ) : sessionRpeHistoryError ? (
                    <div className="text-xs text-rose-700">{sessionRpeHistoryError}</div>
                  ) : sessionRpeHistory.length === 0 ? (
                    <div className="text-xs text-zinc-400">{lang === "IS" ? "Engin RPE skráning ennþá." : "No RPE entries yet."}</div>
                  ) : (
                    <div className="space-y-1.5">
                      {sessionRpeHistory.map((entry) => {
                        const load = entry.session_load ?? 0;
                        const rpeVal = Number(entry.rpe) || 0;
                        const rpeColor =
                          rpeVal <= 3 ? "bg-emerald-500" :
                          rpeVal <= 5 ? "bg-amber-400" :
                          rpeVal <= 7 ? "bg-orange-500" :
                          "bg-red-500";
                        return (
                          <div key={entry.id} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                            {/* RPE color dot */}
                            <div className={cx("h-7 w-7 flex-shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold text-white", rpeColor)}>
                              {entry.rpe}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="font-semibold text-zinc-700 tabular-nums">{entry.session_date.slice(5)}</span>
                                <span className="text-zinc-400">·</span>
                                <span className="text-zinc-500">{entry.duration_minutes} mín</span>
                                <span className="text-zinc-400">·</span>
                                <span className="font-semibold text-zinc-700 tabular-nums">{load} AU</span>
                              </div>
                            </div>
                            {/* Load band */}
                            <span
                              className={cx(
                                "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold flex-shrink-0",
                                formatLoadBandClass(getSessionLoadBand(load))
                              )}
                            >
                              {getSessionLoadBand(load)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardShell>

            {/* Fix modules (only if same day as page) */}
            {isoDateUTCFromTimestamp(fixRow?.created_at) === sanitizeDay(day)
              ? renderFixModules(dedupeFixModulesByTag(fixRow?.fix_modules))
              : null}
          </div>

          {/* RIGHT */}
          <div className="space-y-6">
            {tplToday?.template ? (() => {
              const tpl = tplToday.template;
              const isIS = lang === "IS";
              // Turn the coach-sent template into the SAME interactive session the
              // team session uses (block grouping, sets×reps, "start session"
              // focus flow) — prefer its structured blocks, else parse the
              // free-text description. Empty ⇒ nothing structured, plain render.
              const coachBlocks = coachTemplateBlocks;
              if (coachBlocks.length > 0) {
                return (
                  <TodaySessionCard
                    structure={coachBlocks}
                    opts={{
                      // No heading override: this coach session REPLACES the team
                      // session, so it reads as "Æfing dagsins" (the day's session).
                      // The template title rides as the subtitle; the banner carries
                      // the "sent by coach" provenance.
                      headerTitle: tpl.title ?? tpl.code ?? null,
                      t,
                      themeColor: clubThemeColor,
                      adjust: null,        // coach-authored dose — don't re-apply the readiness reduction
                      sentByCoach: true,
                      preserveOrder: true, // keep the coach's Block 1→2→3 order
                      coachSentSubtext: tplToday.note
                        ? tplToday.note
                        : isIS
                        ? "Þjálfarinn þinn sendi þér þessa æfingu og hún kemur í stað æfingar dagsins."
                        : "Your coach sent you this session — it replaces today's default.",
                    }}
                  />
                );
              }
              // Fallback: nothing parseable → keep the plain, formatted read-only card.
              return (
                <div className="mb-2 rounded-xl border bg-white p-4">
                  <div className="text-sm font-semibold">{isIS ? "Ráðlagðar æfingar" : "Recommended session"}</div>
                  <div className="mt-1 flex flex-col gap-1">
                    <div className="text-lg font-bold">{tpl.title ?? tpl.code ?? "Template"}</div>
                    {tpl.description ? <CoachWorkoutText text={tpl.description} /> : null}
                    {tplToday.note ? (
                      <div className="text-sm mt-1">
                        <span className="font-semibold">{isIS ? "Skilaboð frá þjálfara:" : "Coach note:"}</span> {tplToday.note}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })() : null}

            {/* The default team session is suppressed when the coach has sent a
                template for today — that coach session (rendered above) replaces
                it, so the player sees ONE session, not two. Gated on presence, so
                it drops even if the template only renders as read-only text. */}
            {hasCoachSentTemplate ? null : (
              <TodaySessionCard
                structure={planStructureForRender}
                opts={{
                  headerTitle: sessionHeaderTitle,
                  headerDesc: sessionHeaderDesc,
                  lockLabel,
                  t,
                  recommendationContext: hasFeature(teamPlanTier, "ADAPTIVE_TRAINING_ENGINE")
                    ? exerciseRecommendationContext
                    : null,
                  themeColor: clubThemeColor,
                  // Coach-sent sessions are already tuned to today inside
                  // buildStrengthSession — don't re-apply the readiness reduction.
                  adjust: plan?.source === "COACH_SENT" ? null : computeTodayAdjust(plan?.readiness_level ?? null),
                  sentByCoach: plan?.source === "COACH_SENT",
                }}
              />
            )}

            <PostTrainingReload templates={postTraining} lang={lang} sessionDoneAt={rpeDoneAt} />

            {/* Recovery routines (post-match VST Reset, MD+1 morning bundle,
                coach-assigned protocols) — a post-/next-session recovery block,
                so it sits with the session in the right column, BELOW the
                decision (was rendering above the whole grid, pushing the
                verdict down). empty:hidden collapses it when nothing is
                assigned. */}
            <div className="empty:hidden">
              <PlayerRecoveryAssignmentsCard />
            </div>

            {staffMode ? (
              <CardShell>
                <details className="group">
                  <summary className="cursor-pointer select-none p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <SectionTitle kicker="Staff" title="Tæknilegar upplýsingar" sub="Debug view (staff only)" />
                      <div className="text-xs font-semibold text-zinc-500 group-open:hidden">{t.misc.open}</div>
                      <div className="hidden text-xs font-semibold text-zinc-500 group-open:block">{t.misc.close}</div>
                    </div>
                  </summary>
                  <Divider />
                  <div className="p-4 sm:p-5">
                    <div className="rounded-xl border bg-zinc-50 p-3 text-xs text-zinc-700">{debugLine}</div>
                  </div>
                </details>
              </CardShell>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
