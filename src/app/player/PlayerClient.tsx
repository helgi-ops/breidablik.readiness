"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { flagUi, normalizeFlag, type Flag } from "@/lib/flagUi";
import MissingCheckinBanner from "@/components/player/MissingCheckinBanner";
import EnableRemindersCard from "@/components/player/EnableRemindersCard";
import { formatLoadBandClass, formatSessionTypeLabel, getSessionLoadBand } from "@/lib/session-rpe/formatters";
import { SESSION_TYPES, type SessionType } from "@/lib/session-rpe/types";
import { buildPerformanceIntelligenceDecision } from "@/lib/micropulse/performanceIntelligence";
import { buildExplainableReadinessDecision } from "@/lib/micropulse/readiness";
import { buildPlayerRiskTrend, type PlayerRiskTrend } from "@/lib/micropulse/performanceIntelligence/riskTrend";
import {
  buildNeuralVolatilityIntelligenceDecision,
  type NeuralVolatilityIntelligenceDecision,
} from "@/lib/micropulse/neuralVolatilityIntelligence";
import { buildPrescriptionDecision, type PrescriptionDecision } from "@/lib/micropulse/prescriptionEngine";
import { applyCoachRules, type FinalRecommendationDecision } from "@/lib/micropulse/rulesEngine";
import { buildSessionDraft, type SessionDraft } from "@/lib/micropulse/autoSessionBuilder";
import {
  buildPlayerPublishedSessionView,
  loadSessionDraftRecordByPlayerDate,
  type PlayerPublishedSessionView,
} from "@/lib/micropulse/sessionWorkflow";
import type { CatapultDailyLoadRow } from "@/lib/micropulse/externalLoad";
import { normalizeCatapultDailyLoadRow } from "@/lib/micropulse/externalLoad";
import {
  computeCatapultMetricAverage,
  computeCatapultWeeklyMetricSnapshot,
  getCatapultMetricDefinition,
  getCatapultMetricValue,
  getDefaultCatapultTodayVsTeamMetricKeys,
  getDefaultCatapultWeeklyLoadMetricKeys,
} from "@/lib/integrations/catapult/metricCatalog";
import {
  acknowledgeSession,
  buildPlayerAcknowledgedNotification,
  buildPlayerCompletedNotification,
  buildPlayerSessionStatusView,
  completeSession,
  loadAssignmentsForPlayer,
  markSessionSeen,
  saveNotificationEvent,
  type PlayerSessionStatusView,
  type SessionAssignmentRecord,
  updatePlayerSessionStatus,
} from "@/lib/micropulse/sessionDelivery";
import {
  buildRuntimeRulesFromAdminConfig,
  createDefaultAdminConfigSnapshot,
  getProtectedPlayerTags,
  isPlayerProtectedByAdminConfig,
  loadAdminConfigSnapshotFromStorage,
  type AdminConfigSnapshot,
} from "@/lib/micropulse/adminConfig";
import { buildAthleteDecision } from "@/lib/micropulse/domain/decision";
import { buildDailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot";
import SessionDraftCard from "@/components/sessionBuilder/SessionDraftCard";
import SessionDraftDetails from "@/components/sessionBuilder/SessionDraftDetails";
import PublishedSessionView from "@/components/sessionWorkflow/PublishedSessionView";
import PlayerSessionStatusCard from "@/components/sessionDelivery/PlayerSessionStatusCard";

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
  if (state === "GREEN") return "#16a34a";
  if (state === "YELLOW") return "#ca8a04";
  if (state === "RED") return "#dc2626";
  return "#64748b";
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

function CardShell({ children, className = "" }: { children: any; className?: string }) {
  return <div className={cx("rounded-2xl border bg-white shadow-sm", className)}>{children}</div>;
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

function MetricBox({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value ?? "—"}</div>
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

function safeStringList(x: any): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v));
  return [];
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

/** =========
 *  Block accents (NEUTRAL / GRÁTT fyrir player)
 *  ========= */
function blockAccent(titleRaw: string) {
  const t = (titleRaw ?? "").toLowerCase();

  let label = "Partur";

  if (t.includes("warm") || t.includes("upphit") || t.startsWith("0.")) label = "Upphitun";
  else if (t.includes("primer") || t.includes("ballistic") || t.includes("explosive") || t.startsWith("a.")) label = "Primer";
  else if (t.includes("contrast") || t.includes("strength") || t.startsWith("b.")) label = "Main";
  else if (t.includes("iso") || t.includes("isometric") || t.startsWith("c.")) label = "Accessory";

  return {
    wrap: "border-zinc-200 bg-zinc-50/60",
    badge: "bg-zinc-50 text-zinc-700 border-zinc-200",
    dot: "bg-zinc-400",
    label,
  };
}

function renderStructureBlocks(structure: any, opts?: { headerTitle?: string | null; headerDesc?: string | null; lockLabel?: string }) {
  const blocks = Array.isArray(structure) ? structure : [];
  if (!blocks.length) return null;

  const headerTitle = String(opts?.headerTitle ?? "").trim();
  const headerDesc = String(opts?.headerDesc ?? "").trim();
  const lockLabel = opts?.lockLabel ?? "";

  return (
    <div className="space-y-3">
      <CardShell>
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Æfing dagsins</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" />
                <div className="truncate text-base font-semibold text-zinc-900">{headerTitle || "Æfing dagsins"}</div>
              </div>
              {headerDesc ? <div className="mt-1 text-sm text-zinc-600">{headerDesc}</div> : null}
            </div>

            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Staða</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{lockLabel || "—"}</div>
            </div>
          </div>
        </div>
      </CardShell>

      <div className="space-y-3">
        {blocks.map((b: any, idx: number) => {
          const title = String(b?.block ?? `Block ${idx + 1}`);
          const items = safeStringList(b?.items);
          const accent = blockAccent(title);

          return (
            <div key={`${title}-${idx}`} className={cx("rounded-2xl border p-4", accent.wrap)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cx("h-2.5 w-2.5 rounded-full", accent.dot)} />
                    <div className="text-sm font-semibold text-zinc-900">{title}</div>
                  </div>
                </div>

                <span className={cx("shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold", accent.badge)}>
                  {accent.label}
                </span>
              </div>

              {items.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-800">
                  {items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 text-sm text-zinc-600">Engin atriði í þessum hluta.</div>
              )}
            </div>
          );
        })}
      </div>
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
function postTrainingAccent(_templateId: string, _tags: string[]) {
  return {
    wrap: "border-zinc-200 bg-zinc-50/60",
    chip: "bg-zinc-50 text-zinc-700 border-zinc-200",
  };
}

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

function renderPostTraining(templates: PostTrainingTemplateRow[]) {
  function isTendonTemplate(t: PostTrainingTemplateRow) {
    const id = (t?.id ?? "").toLowerCase();
    const tags = (t?.tags ?? []).map((x) => String(x).toLowerCase());
    return id.includes("tendon") || tags.includes("tendon_health") || tags.includes("achilles") || tags.includes("patellar");
  }

  function isMdRotationTemplate(t: PostTrainingTemplateRow) {
    const id = (t?.id ?? "").toLowerCase();
    return (
      id.startsWith("md1_") ||
      id.startsWith("md2_") ||
      id.startsWith("md3_") ||
      id.startsWith("md4_") ||
      id.startsWith("md_") ||
      id.startsWith("mdplus_") ||
      id.startsWith("md_plus")
    );
  }

  function isDailyNeuralReset(t: PostTrainingTemplateRow) {
    return (t?.id ?? "").toLowerCase() === "daily_neural_reset";
  }

  const filtered = templates.filter((t) => !isDailyNeuralReset(t) && (isTendonTemplate(t) || isMdRotationTemplate(t)));
  const orderedTemplates = [...filtered].sort((a, b) => {
    const rank = (t: PostTrainingTemplateRow) => (isTendonTemplate(t) ? 0 : 1);
    return rank(a) - rank(b);
  });

  const count = orderedTemplates.length;
  const cleanTitle = (t?: string | null) => String(t ?? "").replace(/^\s*\d+[\)\.\-]\s*/g, "").trim();

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          kicker="Eftir æfingu"
          title="Mælt með"
          sub="5–10 mínútur til að styðja sinar og taugakerfi eftir æfingu."
        />
        <div className="text-xs font-semibold text-zinc-500">{count ? `${count} rútín${count === 1 ? "a" : "ur"}` : ""}</div>
      </div>

      {!orderedTemplates.length ? (
        <CardShell>
          <div className="p-4 sm:p-5 text-sm text-zinc-600">Engar tillögur í dag.</div>
        </CardShell>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {orderedTemplates.map((t) => {
            const accent = postTrainingAccent(t.id, t.tags ?? []);
            const sections = extractPostTrainingSections(t?.structure);
            const isTendon = isTendonTemplate(t);

            return (
              <div key={t.id} className={cx("rounded-2xl border", accent.wrap)}>
                {/* ✅ Default closed */}
                <details className="group">
                  <summary className="cursor-pointer select-none p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-zinc-900">{t.title}</div>
                        <div className="mt-1 text-xs text-zinc-500">{t.duration_min ? `${t.duration_min} mín` : ""}</div>
                      </div>

                      {/* ✅ Mobile: hide tags (keeps cards compact). Desktop: show tags */}
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden sm:flex flex-wrap justify-end gap-2">
                          {(t.tags ?? []).slice(0, 5).map((tag) => (
                            <span key={tag} className={cx("rounded-full border px-2 py-1 text-[11px] font-semibold", accent.chip)}>
                              {tag}
                            </span>
                          ))}
                        </div>

                        <span className="text-xs font-semibold text-zinc-500 group-open:hidden">Opna</span>
                        <span className="hidden text-xs font-semibold text-zinc-500 group-open:block">Loka</span>
                      </div>
                    </div>
                  </summary>

                  <div className="border-t border-zinc-200/70" />

                  <div className="p-4 sm:p-5">
                    {!sections.length ? (
                      <div className="text-sm text-zinc-600">Engin skref í template.</div>
                    ) : (
                      <div className="space-y-3">
                        {sections.map((sec, si) => (
                          <div key={si} className="rounded-xl border border-zinc-200 bg-white p-4">
                            {!isTendon && sec.title ? (
                              <div className="text-sm font-semibold text-zinc-900">{cleanTitle(sec.title)}</div>
                            ) : null}
                            {sec.note ? <div className="mt-1 text-sm text-zinc-600">{sec.note}</div> : null}

                            <div className="mt-3 space-y-3">
                              {sec.exercises.map((ex, i) => {
                                const header = cleanTitle(ex.name);
                                const meta = ex.meta ?? {};
                                const items = (ex.instructions ?? []).filter(Boolean);

                                return (
                                  <div key={i} className="rounded-xl border border-zinc-200 bg-white p-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold text-zinc-900">{header}</div>
                                        {meta.notes ? <div className="mt-1 text-sm text-zinc-600">{meta.notes}</div> : null}
                                      </div>

                                      <div className="flex flex-wrap justify-end gap-2">
                                        {meta.sets ? (
                                          <span className="rounded-full border bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                            Sets {meta.sets}
                                          </span>
                                        ) : null}
                                        {meta.holdSec != null ? (
                                          <span className="rounded-full border bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                            Hold {meta.holdSec}s
                                          </span>
                                        ) : null}
                                        {meta.restSec != null ? (
                                          <span className="rounded-full border bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                            Rest {meta.restSec}s
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>

                                    {!!items.length ? (
                                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                                        {items.map((line, li) => (
                                          <li key={li}>{line}</li>
                                        ))}
                                      </ul>
                                    ) : null}

                                    {meta.alternative ? (
                                      <div className="mt-3 text-sm text-zinc-600">
                                        <span className="font-semibold text-zinc-700">Alternative:</span> {meta.alternative}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PlayerClient() {
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  const [playerMeta, setPlayerMeta] = useState<PlayerRow | null>(null);

  const [plan, setPlan] = useState<Stage4PlanRow>(null);
  const [planTemplateOverride, setPlanTemplateOverride] = useState<PlanTemplateOverrideRow>(null);
  const [planIsFallback, setPlanIsFallback] = useState(false);

  const [stage4Final, setStage4Final] = useState<Stage4DecisionFinalRow>(null);
  const [coachFinalFlag, setCoachFinalFlag] = useState<CoachFinalFlagRow>(null);

  const [metrics, setMetrics] = useState<MetricsRow>(null);
  const [catapultToday, setCatapultToday] = useState<CatapultDailyLoadRow | null>(null);
  const [catapultTeamToday, setCatapultTeamToday] = useState<CatapultDailyLoadRow[]>([]);
  const [catapultHistory, setCatapultHistory] = useState<CatapultDailyLoadRow[]>([]);
  const [tplToday, setTplToday] = useState<PlayerTemplateToday | null>(null);

  const [decision, setDecision] = useState<DecisionRow>(null);
  const [session, setSession] = useState<PlayerSessionTodayRow>(null);

  const [genericMsg, setGenericMsg] = useState<GenericMsg>(null);

  const [postTraining, setPostTraining] = useState<PostTrainingTemplateRow[]>([]);
  const [postTrainingErr, setPostTrainingErr] = useState<string>("");

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
  const [sessionRpeHistory, setSessionRpeHistory] = useState<SessionRpeHistoryEntry[]>([]);
  const [sessionRpeHistoryLoading, setSessionRpeHistoryLoading] = useState(false);
  const [sessionRpeHistoryError, setSessionRpeHistoryError] = useState("");
  const [sessionRpeStatus, setSessionRpeStatus] = useState<SessionRpeStatus | null>(null);
  const [sessionRpeStatusLoading, setSessionRpeStatusLoading] = useState(false);
  const [sessionRpeStatusError, setSessionRpeStatusError] = useState("");
  const [playerRiskTrend, setPlayerRiskTrend] = useState<PlayerRiskTrend>({ dates: [], riskScores: [], readinessStates: [] });
  const [neuralVolatilityDecision, setNeuralVolatilityDecision] = useState<NeuralVolatilityIntelligenceDecision | null>(null);
  const [prescriptionDecision, setPrescriptionDecision] = useState<PrescriptionDecision | null>(null);
  const [finalRecommendationDecision, setFinalRecommendationDecision] = useState<FinalRecommendationDecision | null>(null);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(null);
  const [publishedSessionView, setPublishedSessionView] = useState<PlayerPublishedSessionView | null>(null);
  const [assignmentRecord, setAssignmentRecord] = useState<SessionAssignmentRecord | null>(null);
  const [playerSessionStatusView, setPlayerSessionStatusView] = useState<PlayerSessionStatusView | null>(null);
  const [adminConfigSnapshot, setAdminConfigSnapshot] = useState<AdminConfigSnapshot>(createDefaultAdminConfigSnapshot());

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
    return getDefaultCatapultWeeklyLoadMetricKeys().map((key) => {
      const definition = getCatapultMetricDefinition(key);
      return {
        key,
        label: definition.label,
        digits: definition.digits ?? 0,
        acwrSupported: !!definition.acwrSupported,
        weekly: computeCatapultWeeklyMetricSnapshot({
          rows: catapultHistory as unknown as Array<Record<string, unknown>>,
          key,
        }),
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
  }, [profile?.player_id, selectedPlayerId, supabase, day]);

  useEffect(() => {
    const safeDay = sanitizeDay(day);
    setSessionRpeForm((prev) => ({ ...prev, session_date: safeDay }));
  }, [day]);

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

  async function loadGenericMessage(teamId: string | null, flag: Flag) {
    if (teamId) {
      const { data: teamRows, error: teamErr } = await supabase
        .from("player_flag_messages")
        .select("title, message, why")
        .eq("team_id", teamId)
        .eq("flag", flag)
        .eq("lang", "is")
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
      .eq("lang", "is")
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

  async function fetchStage4Plan(playerId: string, dayInput: string) {
    const safeDay = sanitizeDay(dayInput);

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

    if (resolved) {
      setPlanIsFallback(false);

      const merged: any = {
        decision_id: (resolved as any).decision_id ?? null,
        team_id: (resolved as any).team_id ?? null,
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
        title: (resolved as any).plan_title ?? null,
        description: (resolved as any).plan_description ?? null,
        structure: (resolved as any).plan_structure ?? null,
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
    if (!drow?.id) {
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
        return {
          decision_id: null,
          team_id: (sessionRow as any).team_id ?? null,
          player_id: playerId,
          entry_date: safeDay,
          md_day: (sessionRow as any).md_day_resolved ?? null,
          readiness_level: (sessionRow as any).readiness_flag ?? null,
          chosen_variant_id: null,
          locked: false,
          source: "SESSION_CONTEXT_FALLBACK",
          confidence: null,
          why: "Fallback plan from session context.",
          inputs: null,
          training_system: null,
          variant: null,
          title: (sessionRow as any).planned_focus ?? "Training Session",
          description: (sessionRow as any).session_type ? `Session type: ${(sessionRow as any).session_type}` : null,
          structure: [],
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
        .from("microdose_templates")
        .select("id, title, description, structure")
        .eq("team_id", teamId)
        .eq("md_day", mdDay)
        .eq("readiness_level", lvl)
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
      structure: templateRow?.structure ?? null,
    };

    return merged as Stage4PlanRow;
  }

  async function loadPostTrainingRecommendations(ctx: PostTrainingContext) {
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

      const { data: tmpls, error: tErr } = await supabase
        .from("post_training_templates")
        .select("id, title, duration_min, tags, structure, is_active")
        .in("id", ids)
        .eq("is_active", true);

      if (tErr) throw new Error(tErr.message);

      const list = ((tmpls as any) ?? []) as PostTrainingTemplateRow[];
      const map = new Map(list.map((t) => [t.id, t]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as PostTrainingTemplateRow[];

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

      setSessionRpeHistory((json.entries ?? []).slice(0, 5));
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

        if (!prof?.player_id) {
          const { data: list, error: lErr } = await supabase
            .from("players")
            .select("id, full_name, position, team")
            .order("full_name", { ascending: true });
          if (lErr) throw new Error(lErr.message);
          setPlayers((list as PlayerRow[]) ?? []);
          return;
        }

        const safeDay = sanitizeDay(day);

        await ensureStage4Decision(prof.player_id, safeDay);

        const { data: pm, error: pmErr } = await supabase.from("players").select("id, full_name, position, team").eq("id", prof.player_id).maybeSingle();
        if (pmErr) console.error("players meta error:", pmErr.message);
        setPlayerMeta((pm as any) ?? null);

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

        const p = await fetchStage4Plan(prof.player_id, safeDay);
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
            created_at
          `
          )
          .eq("player_id", prof.player_id)
          .eq("entry_date", safeDay)
          .maybeSingle();
        if (mErr) console.error("readiness_entries metrics error:", mErr.message);
        setMetrics((mrow as any) ?? null);
        const catapultHistoryStart = new Date(`${safeDay}T00:00:00.000Z`);
        catapultHistoryStart.setUTCDate(catapultHistoryStart.getUTCDate() - 27);
        const catapultStartDate = catapultHistoryStart.toISOString().slice(0, 10);

        const [{ data: catapultTodayRows, error: catapultTodayErr }, { data: catapultHistoryRows, error: catapultHistoryErr }] = await Promise.all([
          supabase
            .from("player_external_load_daily")
            .select("*")
            .eq("source", "catapult")
            .eq("player_id", prof.player_id)
            .eq("date", safeDay),
          supabase
            .from("player_external_load_daily")
            .select("*")
            .eq("source", "catapult")
            .eq("player_id", prof.player_id)
            .gte("date", catapultStartDate)
            .lte("date", safeDay)
            .order("date", { ascending: true }),
        ]);
        if (catapultTodayErr) console.error("player catapult today error:", catapultTodayErr.message);
        if (catapultHistoryErr) console.error("player catapult history error:", catapultHistoryErr.message);

        const normalizedPlayerToday = ((catapultTodayRows ?? []) as Record<string, unknown>[])
          .map(normalizeCatapultDailyLoadRow)
          .filter((row): row is CatapultDailyLoadRow => row != null)
          .sort((a, b) => a.date.localeCompare(b.date))
          .at(-1) ?? null;
        const normalizedPlayerHistory = ((catapultHistoryRows ?? []) as Record<string, unknown>[])
          .map(normalizeCatapultDailyLoadRow)
          .filter((row): row is CatapultDailyLoadRow => row != null)
          .sort((a, b) => a.date.localeCompare(b.date));
        setCatapultToday(normalizedPlayerToday);
        setCatapultHistory(normalizedPlayerHistory);

        if (prof.team_id) {
          const { data: catapultTeamRows, error: catapultTeamErr } = await supabase
            .from("player_external_load_daily")
            .select("*")
            .eq("source", "catapult")
            .eq("team_id", prof.team_id)
            .eq("date", safeDay);
          if (catapultTeamErr) {
            console.error("player catapult team error:", catapultTeamErr.message);
            setCatapultTeamToday([]);
          } else {
            setCatapultTeamToday(
              ((catapultTeamRows ?? []) as Record<string, unknown>[])
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

          const playerIdForWorkflow = profile?.player_id ?? null;
          if (playerIdForWorkflow) {
            const workflowRecord = loadSessionDraftRecordByPlayerDate(playerIdForWorkflow, safeDay);
            const publishedView = workflowRecord ? buildPlayerPublishedSessionView(workflowRecord) : null;
            setPublishedSessionView(publishedView);

            const playerAssignments = loadAssignmentsForPlayer(playerIdForWorkflow)
              .filter((a) => a.sessionDate === safeDay)
              .sort((a, b) => b.version - a.version);
            const activeAssignment = playerAssignments[0] ?? null;

            if (activeAssignment && publishedView) {
              const seenAssignment = activeAssignment.seenAt ? activeAssignment : markSessionSeen(activeAssignment);
              if (!activeAssignment.seenAt) {
                updatePlayerSessionStatus(seenAssignment);
              }
              setAssignmentRecord(seenAssignment);
              setPlayerSessionStatusView(buildPlayerSessionStatusView(seenAssignment));
            } else {
              setAssignmentRecord(null);
              setPlayerSessionStatusView(null);
            }
          } else {
            setPublishedSessionView(null);
            setAssignmentRecord(null);
            setPlayerSessionStatusView(null);
          }
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
  }, [supabase, day, adminConfigSnapshot]);

  function handleAcknowledgePublishedSession() {
    if (!assignmentRecord) return;
    const next = acknowledgeSession(assignmentRecord);
    updatePlayerSessionStatus(next);
    saveNotificationEvent(buildPlayerAcknowledgedNotification(next, "IN_APP"));
    setAssignmentRecord(next);
    setPlayerSessionStatusView(buildPlayerSessionStatusView(next));
  }

  function handleCompletePublishedSession() {
    if (!assignmentRecord) return;
    const next = completeSession(assignmentRecord);
    updatePlayerSessionStatus(next);
    saveNotificationEvent(buildPlayerCompletedNotification(next, "IN_APP"));
    setAssignmentRecord(next);
    setPlayerSessionStatusView(buildPlayerSessionStatusView(next));
  }

  const flag: Flag = useMemo(() => {
    const fromCoachView = parseFinalFlag(coachFinalFlag?.final_flag ?? null);
    if (fromCoachView) return fromCoachView;

    const fromSystemDecision = decisionToFlag(stage4Final?.system_decision ?? null);
    if (fromSystemDecision) return fromSystemDecision;
    return readinessToFlag(plan?.readiness_level);
  }, [coachFinalFlag?.final_flag, plan?.readiness_level, stage4Final?.system_decision]);
  const ui = useMemo(() => flagUi(normalizeFlag(flag)), [flag]);

  useEffect(() => {
    const run = async () => {
      if (!profile) return;
      const teamId = (profile as any)?.team_id ?? null;
      const msg = await loadGenericMessage(teamId, flag);
      setGenericMsg(msg);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, flag]);

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

      await loadPostTrainingRecommendations(ctx);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.md_day, session?.session_type, session?.md_day_resolved]);

  useEffect(() => {
    const run = async () => {
      if (!plan) {
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

      const { data, error } = await supabase
        .from("microdose_templates")
        .select("title, description, structure, readiness_level, md_day, variant")
        .eq("readiness_level", desiredReadiness)
        .eq("md_day", mdDay)
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
        readiness_level: string | null;
        md_day?: string | null;
        variant?: string | null;
      }>;

      // Fallback: if no exact md_day row was found for desired readiness, pick the first available
      // row for this team+readiness so player view still follows the effective readiness flag.
      if (!rows.length) {
        const { data: fallbackRows, error: fallbackErr } = await supabase
          .from("microdose_templates")
          .select("title, description, structure, readiness_level, md_day, variant")
          .eq("readiness_level", desiredReadiness)
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
          readiness_level: string | null;
          md_day?: string | null;
          variant?: string | null;
        }>;
      }

      const chosen = selectTemplateOverrideCandidate(rows, plan?.variant ?? null, mdDay);
      setPlanTemplateOverride((chosen as PlanTemplateOverrideRow) ?? null);
    };

    run();
  }, [supabase, plan?.md_day, plan?.variant, plan?.readiness_level, session?.md_day_resolved, flag]);

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

  if (!plan) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <CardShell>
            <div className="p-6">
              <div className="text-base font-semibold">Engin Stage-4 microdose ákvörðun fannst</div>
              <div className="mt-2 text-sm text-zinc-600">
                Þetta gerist ef Stage-4 decision-engine hefur ekki verið keyrð í dag og engin “resolved/final” view skilar gögnum. Farðu í{" "}
                <b>/player/checkin</b> og vertu viss um að Stage-4 keyrsla hafi verið framkvæmd.
              </div>
              <div className="mt-4 text-xs text-zinc-500">date={sanitizeDay(day)}</div>
            </div>
          </CardShell>
        </div>
      </div>
    );
  }

  const today = sanitizeDay(day);

  const name = playerMeta?.full_name ?? "Leikmaður";
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
  const lockLabel = lockedBool ? "Læst" : "Ólæst";

  const trainingSystemLabel = plan.training_system ? String(plan.training_system) : "—";
  const planStructureForRender = planTemplateOverride?.structure ?? plan.structure;
  const sessionHeaderTitle = normalizeSessionHeaderTitleByFlag(planTemplateOverride?.title ?? plan.title, flag);
  const sessionHeaderDesc = planTemplateOverride?.description ?? plan.description;

  const coachMsg = (stage4Final?.coach_note ?? "").trim();
  const baseMsg = genericMsg?.message || (ui as any).playerMessage;
  const message = coachMsg ? coachMsg : baseMsg;

  const whyText = plan?.why || genericMsg?.why || (ui as any).why;

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

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {/* ✅ Mobile-optimized sticky header */}
        <div className="sticky top-2 z-20 mb-5">
          <div className={cx("rounded-2xl border bg-white/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70", (ui as any).panel)}>
            <div className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-500">Player · {today}</div>
                  <div className="mt-1 truncate text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">{name}</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {team ? `${team}` : "—"} {position ? `· ${position}` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/player/settings/integrations"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    Integrations
                  </Link>
                  <Chip>{lockLabel}</Chip>
                  <Chip className="border-zinc-200">{decisionType}</Chip>
                  <Chip>{mdLabel}</Chip>
                  <Chip>{trainingSystemLabel}</Chip>

                  {String(stage4Final?.final_source ?? "").toUpperCase() === "COACH" ? (
                    <Chip className="border-amber-200 bg-amber-50 text-amber-800">Override</Chip>
                  ) : null}

                  <Chip className={(ui as any).pill}>
                    <MiniDot className={(ui as any).dot} />
                    {flag}
                  </Chip>
                </div>
              </div>
            </div>
          </div>
        </div>

        {today === todayISO() && !metrics?.created_at ? (
          <div className="mb-5">
            <MissingCheckinBanner />
          </div>
        ) : null}

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Decision hero */}
            <div className={cx("rounded-2xl border p-4 sm:p-5 shadow-sm", decisionTone)}>
              <SectionTitle kicker="Í dag" title={`Ákvörðun: ${decisionType}`} />

              {coachMsg ? (
                <div className="mt-3 inline-flex items-center rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
                  Skilaboð frá þjálfara
                </div>
              ) : null}

              <div className="mt-3 text-sm leading-relaxed text-zinc-800">{message}</div>

              {whyText ? (
                <div className="mt-3 rounded-xl border bg-white p-3 text-sm text-zinc-700">
                  <span className="font-semibold text-zinc-900">Af hverju:</span> {whyText}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Ákvörðun" value={decisionType} />
                <Stat label="MD context" value={mdLabel} />
                <Stat label="Kerfi" value={trainingSystemLabel} />
                <Stat label="Plan date" value={plan.entry_date ?? "—"} />
              </div>
            </div>

            {/* Metrics */}
            <CardShell>
              <details className="group" open>
                <summary className="cursor-pointer select-none p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <SectionTitle kicker="Readiness" title="Mælingar dagsins" sub="Aðeins til upplýsingar — notað fyrir ákvörðunarlógík." />
                    <div className="text-xs font-semibold text-zinc-500 group-open:hidden">Opna</div>
                    <div className="hidden text-xs font-semibold text-zinc-500 group-open:block">Loka</div>
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
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Catapult</div>
                    {catapultToday || catapultHistory.length ? (
                      <div className="mt-3 space-y-4">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Today vs Team</div>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {todayVsTeamMetrics.map((item) => {
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

                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Weekly Load</div>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {weeklyLoadMetrics.map((item) => {
                              const tone = externalLoadTone(item.weekly.acute7Avg, item.weekly.chronic28Avg);
                              return (
                                <div key={`player-catapult-weekly-${item.key}`} className={cx("rounded-xl border px-3 py-3", tone.tone)}>
                                  <div className="text-[11px] font-semibold uppercase tracking-wide">{item.label}</div>
                                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                                    <div>
                                      <div className="uppercase tracking-wide opacity-70">7d</div>
                                      <div className="mt-1 text-sm font-semibold tabular-nums">
                                        {metricFmt(item.weekly.acute7Avg, item.digits)}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="uppercase tracking-wide opacity-70">28d</div>
                                      <div className="mt-1 text-sm font-semibold tabular-nums">
                                        {metricFmt(item.weekly.chronic28Avg, item.digits)}
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
                      <div className="mt-3 rounded-xl border bg-zinc-50 p-3 text-sm text-zinc-600">
                        No Catapult external-load data available for this day yet.
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </CardShell>

            <CardShell>
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
                        <line x1="0" y1="79.5" x2="320" y2="79.5" stroke="#e5e7eb" strokeWidth="1" />
                        <line x1="0" y1="40" x2="320" y2="40" stroke="#f3f4f6" strokeWidth="1" />
                        <polyline
                          fill="none"
                          stroke="#334155"
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
                              <text x={x} y={Math.max(8, y - 4)} textAnchor="middle" fontSize="7" fill="#334155">
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
                      {publishedSessionView ? (
                        <div className="mt-2">
                          <PublishedSessionView view={publishedSessionView} title="Today’s published session" />
                          <div className="mt-2">
                            <PlayerSessionStatusCard
                              statusView={playerSessionStatusView}
                              onAcknowledge={handleAcknowledgePublishedSession}
                              onComplete={handleCompletePublishedSession}
                            />
                          </div>
                        </div>
                      ) : null}
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

            <CardShell>
              <div className="p-4 sm:p-5">
                <EnableRemindersCard />
              </div>
            </CardShell>

            {/* Post-session RPE */}
            <CardShell>
              <div className="p-4 sm:p-5">
                <SectionTitle kicker="Eftir æfingu" title="Post-Session RPE" sub="Rate how hard the full session felt overall." />

                <div className="mt-3 rounded-xl border bg-zinc-50 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-zinc-900">RPE compliance today</div>
                    {sessionRpeStatus ? (
                      <span
                        className={cx(
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          sessionRpeStatus.state === "SUBMITTED_TODAY"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : sessionRpeStatus.state === "NOT_EXPECTED_TODAY"
                            ? "border-slate-200 bg-slate-100 text-slate-700"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        )}
                      >
                        {sessionRpeStatus.state === "SUBMITTED_TODAY"
                          ? "Submitted today"
                          : sessionRpeStatus.state === "NOT_EXPECTED_TODAY"
                          ? "No submission expected"
                          : "Not yet submitted"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1 text-zinc-600">
                    {sessionRpeStatus?.state === "SUBMITTED_TODAY"
                      ? "You have already submitted post-session RPE for today."
                      : sessionRpeStatus?.state === "NOT_EXPECTED_TODAY"
                      ? "No RPE submission is expected today."
                      : "Please submit your post-session RPE after training."}
                  </div>

                  {sessionRpeStatus?.latestSubmissionAt ? (
                    <div className="mt-1 text-zinc-500">
                      Latest submission:{" "}
                      {new Date(sessionRpeStatus.latestSubmissionAt).toLocaleTimeString("is-IS", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {sessionRpeStatus.todayEntriesCount > 1 ? ` · ${sessionRpeStatus.todayEntriesCount} sessions today` : ""}
                    </div>
                  ) : null}

                  {sessionRpeStatusLoading ? <div className="mt-1 text-zinc-500">Loading status...</div> : null}
                  {sessionRpeStatusError ? <div className="mt-1 text-rose-700">{sessionRpeStatusError}</div> : null}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Date</label>
                    <input
                      type="date"
                      value={sessionRpeForm.session_date}
                      onChange={(e) => setSessionRpeForm((prev) => ({ ...prev, session_date: e.target.value }))}
                      className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Session type</label>
                    <select
                      value={sessionRpeForm.session_type}
                      onChange={(e) => setSessionRpeForm((prev) => ({ ...prev, session_type: e.target.value as SessionType }))}
                      className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
                    >
                      {SESSION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {formatSessionTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Session name (optional)</label>
                    <input
                      type="text"
                      value={sessionRpeForm.session_name}
                      onChange={(e) => setSessionRpeForm((prev) => ({ ...prev, session_name: e.target.value }))}
                      placeholder="e.g. Team tactical + small sided games"
                      className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Duration (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={sessionRpeForm.duration_minutes}
                      onChange={(e) => setSessionRpeForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                      className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">RPE (0–10)</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={sessionRpeForm.rpe}
                      onChange={(e) => setSessionRpeForm((prev) => ({ ...prev, rpe: e.target.value }))}
                      className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Notes (optional)</label>
                    <textarea
                      rows={2}
                      value={sessionRpeForm.notes}
                      onChange={(e) => setSessionRpeForm((prev) => ({ ...prev, notes: e.target.value }))}
                      className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      placeholder="Optional context (travel, individual work, etc.)"
                    />
                  </div>
                </div>

                <div className="mt-3 rounded-xl border bg-zinc-50 p-3 text-xs text-zinc-700">
                  <div className="font-semibold text-zinc-900">RPE guide</div>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2">
                    <div>0–2 = very easy</div>
                    <div>3–4 = easy</div>
                    <div>5–6 = moderate</div>
                    <div>7–8 = hard</div>
                    <div>9 = very hard</div>
                    <div>10 = maximal</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
                    Session load preview:{" "}
                    <span className="tabular-nums text-zinc-900">{sessionLoadPreview == null ? "—" : sessionLoadPreview}</span>
                  </div>
                  {sessionLoadPreview != null ? (
                    <div
                      className={cx(
                        "rounded-full border px-3 py-1 text-xs font-semibold",
                        formatLoadBandClass(getSessionLoadBand(sessionLoadPreview))
                      )}
                    >
                      {getSessionLoadBand(sessionLoadPreview)}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={!sessionRpeValid || sessionRpeSubmitting}
                    onClick={() => submitSessionRpe()}
                    className="rounded-lg border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sessionRpeSubmitting ? "Submitting..." : "Submit Session RPE"}
                  </button>
                  {!sessionRpeValid ? <div className="text-xs text-zinc-500">Enter valid duration (1–300) and RPE (0–10).</div> : null}
                </div>

                {sessionRpeSuccess ? <div className="mt-2 text-xs text-emerald-700">{sessionRpeSuccess}</div> : null}
                {sessionRpeError ? <div className="mt-2 text-xs text-rose-700">{sessionRpeError}</div> : null}

                <div className="mt-4 rounded-xl border bg-white p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recent submissions</div>
                  {sessionRpeHistoryLoading ? (
                    <div className="mt-2 text-xs text-zinc-500">Loading...</div>
                  ) : sessionRpeHistoryError ? (
                    <div className="mt-2 text-xs text-rose-700">{sessionRpeHistoryError}</div>
                  ) : sessionRpeHistory.length === 0 ? (
                    <div className="mt-2 text-xs text-zinc-500">No Session RPE entries yet.</div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {sessionRpeHistory.map((entry) => (
                        <div key={entry.id} className="rounded-lg border bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-900">{entry.session_date}</span>
                            <span>{formatSessionTypeLabel(entry.session_type)}</span>
                            <span>{entry.duration_minutes} min</span>
                            <span>RPE {entry.rpe}</span>
                            <span className="font-semibold">Load {entry.session_load}</span>
                          </div>
                          {entry.session_name ? <div className="mt-1 text-zinc-600">{entry.session_name}</div> : null}
                        </div>
                      ))}
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
            {tplToday?.template?.structure ? (
              <div className="mb-2 rounded-xl border bg-white p-4">
                <div className="text-sm font-semibold">Ráðlagðar æfingar</div>

                <div className="mt-1 flex flex-col gap-1">
                  <div className="text-lg font-bold">
                    {tplToday.template.title ?? tplToday.template.code ?? "Template"}
                  </div>

                  {tplToday.template.description ? (
                    <div className="text-sm opacity-80">{tplToday.template.description}</div>
                  ) : null}

                  {tplToday.note ? (
                    <div className="text-sm mt-1">
                      <span className="font-semibold">Coach note:</span> {tplToday.note}
                    </div>
                  ) : null}
                </div>

                {Array.isArray((tplToday.template as any)?.structure?.blocks) ? (
                  <div className="mt-3 space-y-3">
                    {(tplToday.template as any).structure.blocks.map((b: any, idx: number) => (
                      <div key={idx} className="rounded-lg bg-muted/40 p-2">
                        <div className="text-sm font-semibold">{b.title ?? b.type ?? `Block ${idx + 1}`}</div>

                        {b.protocol ? (
                          <div className="text-sm mt-1">
                            {b.protocol.exercise} — {b.protocol.sets}×{b.protocol.hold_seconds}s, hvíld {b.protocol.rest_seconds}s
                          </div>
                        ) : null}

                        {Array.isArray(b.exercises) ? (
                          <ul className="mt-1 text-sm list-disc pl-5">
                            {b.exercises.map((ex: any, i: number) => (
                              <li key={i}>
                                {ex.name}
                                {ex.sets ? ` — ${ex.sets}x${ex.reps ?? ""}` : ""}
                                {typeof ex.velocity_target === "number" ? ` @ ${ex.velocity_target} m/s` : ""}
                                {typeof ex.vl_threshold === "number" ? ` (VL ≤ ${Math.round(ex.vl_threshold * 100)}%)` : ""}
                                {ex.tempo ? ` (tempo ${ex.tempo})` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {renderStructureBlocks(planStructureForRender, {
              headerTitle: sessionHeaderTitle,
              headerDesc: sessionHeaderDesc,
              lockLabel,
            })}

            {renderPostTraining(postTraining)}

            {staffMode ? (
              <CardShell>
                <details className="group">
                  <summary className="cursor-pointer select-none p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <SectionTitle kicker="Staff" title="Tæknilegar upplýsingar" sub="Debug view (staff only)" />
                      <div className="text-xs font-semibold text-zinc-500 group-open:hidden">Opna</div>
                      <div className="hidden text-xs font-semibold text-zinc-500 group-open:block">Loka</div>
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
